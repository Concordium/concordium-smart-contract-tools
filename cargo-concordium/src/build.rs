use crate::{
    reproducible_builds::{build_in_container, ContainerBuildOutput, PackageData},
    utils::{check_wasm_target, get_crate_metadata, to_snake_case, CargoBuildParameters},
    BuildOptions,
};
use anyhow::Context;
use cargo_metadata::{Metadata, Package};
use concordium_base::{
    contracts_common::{
        self,
        schema::{self},
        OwnedEntrypointName,
    },
    smart_contracts::{ContractName, ReceiveName},
};
use concordium_smart_contract_engine::{
    utils::{
        generate_contract_schema_v0, generate_contract_schema_v3, VersionedBuildInfo, WasmVersion,
        BUILD_INFO_SECTION_NAME,
    },
    v0,
    v1::{self},
    ExecResult,
};
use concordium_wasm::{
    output::{write_custom_section, Output},
    parse::parse_skeleton,
    types::{CustomSection, ExportDescription, Module},
    utils::strip,
    validate::{validate_module, ValidationConfig},
};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, BTreeSet},
    env, fs,
    path::PathBuf,
    process::{Command, Stdio},
    str,
};

// -------------------- Structs -------------------- //

#[derive(Debug, Clone, Copy)]
pub enum SchemaBuildOptions {
    DoNotBuild,
    JustBuild,
    BuildAndEmbed,
}

impl SchemaBuildOptions {
    /// Return whether the schema should be built.
    pub fn build(self) -> bool {
        matches!(
            self,
            SchemaBuildOptions::JustBuild | SchemaBuildOptions::BuildAndEmbed
        )
    }

    /// Return whether the schema should be embedded.
    pub fn embed(self) -> bool {
        matches!(self, SchemaBuildOptions::BuildAndEmbed)
    }
}

/// Build information returned by the [`build_contract`] function.
pub struct BuildInfo {
    /// Size of the module that was built, including custom section.
    pub total_module_len: usize,
    /// The schema, if any was built.
    pub schema: Option<schema::VersionedModuleSchema>,
    /// The metadata used for building the contract (the actual code, not the
    /// schema).
    pub metadata: cargo_metadata::Metadata,
    /// If a reproducible/verifiable build is requested, this contains the build
    /// information that should be embedded in the module, together with a
    /// list of file paths that were used to build the artifact. The file
    /// paths are relative to the package root.
    pub stored_build_info: Option<(VersionedBuildInfo, Vec<PathBuf>)>,
    /// The path to the file of the built module.
    pub out_filename: PathBuf,
}

// -------------------- Helper Functions -------------------- //

/// Check that exports of module conform to the specification so that they will
/// be accepted by the chain.
fn check_exports(module: &Module, version: WasmVersion) -> anyhow::Result<()> {
    // collect contracts in the module.
    let mut contracts = BTreeSet::new();
    let mut methods = BTreeMap::<_, BTreeSet<OwnedEntrypointName>>::new();
    for export in &module.export.exports {
        if let ExportDescription::Func { .. } = export.description {
            if let Ok(cn) = ContractName::new(export.name.as_ref()) {
                contracts.insert(cn.contract_name());
            } else if let Ok(rn) = ReceiveName::new(export.name.as_ref()) {
                methods
                    .entry(rn.contract_name())
                    .or_insert_with(BTreeSet::new)
                    .insert(rn.entrypoint_name().into());
            } else {
                // for V0 contracts we do not allow any other functions.
                match version {
                    WasmVersion::V0 => anyhow::bail!(
                        "The module has '{}' as an exposed function, which is neither a valid \
                         init or receive method.\nV0 contracts do not allow any exported \
                         functions that are neither init or receive methods.\n",
                        export.name.as_ref()
                    ),
                    WasmVersion::V1 => (),
                }
            }
        }
    }
    for (cn, _ens) in methods {
        if let Some(closest) = find_closest(contracts.iter().copied(), cn) {
            if closest.is_empty() {
                anyhow::bail!(
                    "An entrypoint is declared for a contract '{}', but no contracts exist in the \
                     module.",
                    cn
                );
            } else if closest.len() == 1 {
                anyhow::bail!(
                    "An entrypoint is declared for a contract '{}', but such a contract does not \
                     exist in the module.\nPerhaps you meant '{}'?",
                    cn,
                    closest[0]
                );
            } else {
                let list = closest
                    .into_iter()
                    .map(|x| format!("'{}'", x))
                    .collect::<Vec<_>>()
                    .join(", ");
                anyhow::bail!(
                    "An entrypoint is declared for a contract '{}', but such a contract does not \
                     exist in the module.\nPerhaps you meant one of [{}].",
                    cn,
                    list
                );
            }
        }
    }
    Ok(())
}

/// Find the string closest to the list of strings. If an exact match is found
/// return `None`, otherwise return `Some` with a list of strings that are
/// closest according to the [optimal string alignment metric](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance distance).
fn find_closest<'a>(
    list: impl IntoIterator<Item = &'a str>,
    goal: &'a str,
) -> Option<Vec<&'a str>> {
    let mut out = Vec::new();
    let mut least = usize::MAX;
    for cn in list.into_iter() {
        let dist = strsim::osa_distance(cn, goal);
        if dist == 0 {
            return None;
        }
        match dist.cmp(&least) {
            Ordering::Less => {
                out.clear();
                out.push(cn);
                least = dist;
            }
            Ordering::Equal => {
                out.push(cn);
            }
            Ordering::Greater => {
                // do nothing since this candidate is not useful
            }
        }
    }
    Some(out)
}

// -------------------- Export Functions -------------------- //

/// Build a contract and its schema.
/// If build_schema is set then the return value will contain the schema of the
/// version specified.
///
/// If a verifiable build is requested then the result will contain the build
/// information that should be embedded in the resulting `wasm.v1` file.
///
/// Note that even if a verifiable build is requested the schemas are built on
/// the host machine.
#[allow(clippy::too_many_arguments)]
pub(crate) fn build_contract(
    options: BuildOptions,
    cargo_args: &[String],
    package: &Package,
    metadata: &Metadata,
) -> anyhow::Result<BuildInfo> {
    // Check that the wasm target is installed
    check_wasm_target()?;

    let build_schema = options.schema_build_options();
    let container_runtime = options.container_runtime;
    let args_without_manifest: Vec<String> = cargo_args
        .iter()
        .take_while(|val| !val.starts_with("--manifest-path"))
        .cloned()
        .collect();

    // Check immediately if reproducible build is requested that we can execute the
    // container runtime.
    if let Some(image) = &options.image {
        if let Err(which::Error::CannotFindBinaryPath) = which::which(&container_runtime) {
            anyhow::bail!(
                "cargo concordium build --verifiable {image}` requires `{container_runtime}` \
                 which does not appear to be installed. Either install `{container_runtime}` or \
                 choose another container runtime by setting `CARGO_CONCORDIUM_CONTAINER_RUNTIME`."
            );
        }
    }

    let package_root_path = package
        .manifest_path
        .parent()
        .context("Unable to get package root path.")?
        .canonicalize()?;

    let wasm_file_name = format!("{}.wasm", to_snake_case(package.name.as_str()));

    let package_version_string = format!("{}-{}", package.name, package.version);

    // Make sure up-front before building anything that the output path points to a
    // sensible location
    let mut out_filename = match options.out {
        Some(out) => {
            // A path and a filename need to be provided when using the `--out` flag.
            if out.file_name().is_none() || out.is_dir() {
                anyhow::bail!(
                    "The `--out` flag requires a path and a filename (expected input: \
                     `./my/path/my_smart_contract.wasm.v1`)"
                );
            }
            out
        }
        None => {
            let extension = match options.version {
                WasmVersion::V0 => "v0",
                WasmVersion::V1 => "v1",
            };
            let relative_path = format!("concordium-out/module.wasm.{}", extension);
            package_root_path.join(relative_path)
        }
    };

    if let Some(out_dir) = out_filename.parent() {
        fs::create_dir_all(out_dir)
            .context("Unable to create directory for the resulting smart contract module.")?;
    }

    #[allow(unused_assignments)]
    // This assignment is not actually unused. It is used via the custom_section which retains a
    // reference to this vector, which is why it has to be here. This is a bit ugly, but not as
    // ugly as alternatives.
    let mut schema_bytes = Vec::new();
    // if none do not build. If Some(true) then embed, otherwise
    // just build and return
    let schema = match options.version {
        WasmVersion::V0 => {
            if build_schema.build() {
                let schema = build_contract_schema(
                    cargo_args,
                    options.skip_wasm_opt,
                    generate_contract_schema_v0,
                )
                .context("Could not build module schema.")?;
                if build_schema.embed() {
                    schema_bytes = contracts_common::to_bytes(&schema);
                    let custom_section = CustomSection {
                        name: "concordium-schema".into(),
                        contents: &schema_bytes,
                    };
                    Some((Some(custom_section), schema))
                } else {
                    Some((None, schema))
                }
            } else {
                None
            }
        }
        WasmVersion::V1 => {
            if build_schema.build() {
                let schema = build_contract_schema(
                    cargo_args,
                    options.skip_wasm_opt,
                    generate_contract_schema_v3,
                )
                .context("Could not build module schema.")?;
                if build_schema.embed() {
                    schema_bytes = contracts_common::to_bytes(&schema);
                    let custom_section = CustomSection {
                        name: "concordium-schema".into(),
                        contents: &schema_bytes,
                    };
                    Some((Some(custom_section), schema))
                } else {
                    Some((None, schema))
                }
            } else {
                None
            }
        }
    };

    let (out_filename, wasm, stored_build_info) = if let Some(image) = options.image {
        let cwd = env::current_dir()
            .context("Unable to get working directory. Does it exist?")?
            .canonicalize()?;
        out_filename = cwd.join(out_filename);
        // The archive will be named after the module output path, by appending `.tar`
        // to it.
        let tar_filename: PathBuf = {
            // Rust 1.70 has as_mut_os_string, but to support older versions we don't use it
            // here for now, and instead convert from and to OsString to append an
            // extension.
            let mut tar_filename = out_filename.clone().into_os_string();
            tar_filename.push(".tar");
            tar_filename.into()
        };
        let mut package_target_dir = metadata.target_directory.as_std_path().to_path_buf();
        if package_target_dir
            .try_exists()
            .context("Unable to check if target directory exists.")?
        {
            package_target_dir = package_target_dir.canonicalize()?;
        };
        let ContainerBuildOutput {
            output_wasm,
            build_info,
            tar_archive,
        } = build_in_container(
            image,
            PackageData {
                package_target_dir: package_target_dir.as_path(),
                package_root_path: package_root_path.as_path(),
                package_version_string: &package_version_string,
            },
            &args_without_manifest,
            &container_runtime,
            &out_filename,
            &tar_filename,
            options.source_link,
        )?;
        std::fs::write(tar_filename.as_path(), &tar_archive.tar_archive).with_context(|| {
            format!(
                "Unable to write source archive to {}.",
                tar_filename.display()
            )
        })?;
        (out_filename, output_wasm, Some((build_info, tar_archive)))
    } else {
        let target_dir = metadata.target_directory.as_std_path().join("concordium");
        let output_wasm_file = target_dir
            .join("wasm32-unknown-unknown/release")
            .join(wasm_file_name);

        let result = CargoBuildParameters {
            target_dir: &target_dir,
            profile: &options.profile,
            locked: false,
            features: &[],
            package: Some(&package.name),
            extra_args: &[],
        }
        .run_cargo_cmd()
        .context("Could not use cargo build.")?;

        if !result.status.success() {
            anyhow::bail!("Compilation failed.")
        }

        if !options.skip_wasm_opt {
            wasm_opt::OptimizationOptions::new_opt_level_0()
                .run(&output_wasm_file, &output_wasm_file)
                .context("Failed running wasm_opt")?;
        }

        let wasm = fs::read(&output_wasm_file).with_context(|| {
            format!(
                "Could not read cargo build Wasm output from {}.",
                output_wasm_file.display()
            )
        })?;

        (out_filename, wasm, None)
    };

    let mut skeleton =
        parse_skeleton(&wasm).context("Could not parse the skeleton of the module.")?;

    // Remove all custom sections to reduce the size of the module
    strip(&mut skeleton);
    match options.version {
        WasmVersion::V0 => {
            let module = validate_module(
                ValidationConfig::V0,
                &v0::ConcordiumAllowedImports,
                &skeleton,
            )
            .context("Could not validate resulting smart contract module as a V0 contract.")?;
            check_exports(&module, WasmVersion::V0)
                .context("Contract and entrypoint validation failed for a V0 contract.")?;
            module
        }
        WasmVersion::V1 => {
            let module = validate_module(
                ValidationConfig::V1,
                &v1::ConcordiumAllowedImports {
                    support_upgrade: true,
                    enable_debug: options.allow_debug,
                },
                &skeleton,
            )
            .context("Could not validate resulting smart contract module as a V1 contract.")?;
            check_exports(&module, WasmVersion::V1)
                .context("Contract and entrypoint validation failed for a V1 contract.")?;
            module
        }
    };

    // We output a versioned module that can be directly deployed to the chain,
    // i.e., the exact data that needs to go into the transaction. This starts with
    // the version number in big endian. The remaining 4 bytes are a placeholder for
    // length.
    let mut output_bytes = match options.version {
        WasmVersion::V0 => vec![0, 0, 0, 0, 0, 0, 0, 0],
        WasmVersion::V1 => vec![0, 0, 0, 1, 0, 0, 0, 0],
    };
    // Embed schema custom section
    skeleton.output(&mut output_bytes)?;
    let return_schema = if let Some((custom_section, schema)) = schema {
        if let Some(custom_section) = custom_section {
            write_custom_section(&mut output_bytes, &custom_section)?;
        }
        Some(schema)
    } else {
        None
    };
    // Embed build info section if present.
    if let Some((build_info, _)) = &stored_build_info {
        let cs = CustomSection {
            name: BUILD_INFO_SECTION_NAME.into(),
            contents: &contracts_common::to_bytes(&build_info),
        };
        write_custom_section(&mut output_bytes, &cs)?;
    };

    // write the size of the actual module to conform to serialization expected on
    // the chain
    let data_size = (output_bytes.len() - 8) as u32;
    (output_bytes[4..8]).copy_from_slice(&data_size.to_be_bytes());

    let total_module_len = output_bytes.len();
    fs::write(&out_filename, output_bytes).context("Unable to write final module.")?;

    // File name cannot be canonicalized before the file exists, so we do it here.
    let out_filename = out_filename.canonicalize()?;
    Ok(BuildInfo {
        total_module_len,
        schema: return_schema,
        stored_build_info: stored_build_info.map(|(bi, a)| (bi, a.archived_files)),
        metadata: metadata.clone(),
        out_filename,
    })
}

/// Generates the contract schema by compiling with the 'build-schema' feature
/// Then extracts the schema from the schema build
pub(crate) fn build_contract_schema<A>(
    cargo_args: &[String],
    skip_wasm_opt: bool,
    generate_schema: impl FnOnce(&[u8]) -> ExecResult<A>,
) -> anyhow::Result<A> {
    let metadata = get_crate_metadata(cargo_args)?;

    let target_dir = format!("{}/concordium", metadata.target_directory);

    let package = metadata
        .root_package()
        .context("Unable to determine package.")?;

    let result = Command::new("cargo")
        .arg("build")
        .args(["--target", "wasm32-unknown-unknown"])
        .arg("--release")
        .args(["--features", "concordium-std/build-schema"])
        .args(["--target-dir", target_dir.as_str()])
        .args(cargo_args)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .output()
        .context("Could not run cargo build.")?;

    if !result.status.success() {
        anyhow::bail!("Compilation failed.");
    }

    let filename = format!(
        "{}/wasm32-unknown-unknown/release/{}.wasm",
        target_dir,
        to_snake_case(package.name.as_str())
    );

    if !skip_wasm_opt {
        wasm_opt::OptimizationOptions::new_opt_level_0()
            .run(&filename, &filename)
            .context("Failed running wasm_opt")?;
    }

    let wasm =
        std::fs::read(filename).context("Could not read cargo build contract schema output.")?;
    let schema =
        generate_schema(&wasm).context("Could not generate module schema from Wasm module.")?;
    Ok(schema)
}
