use crate::{
    build::*,
    context::{InitContextOpt, ReceiveContextOpt, ReceiveContextV1Opt},
};
use ansi_term::Color;
use anyhow::{bail, ensure, Context};
use clap::AppSettings;
use concordium_base::{
    contracts_common::{
        self, from_bytes,
        schema::{Type, VersionedModuleSchema},
        to_bytes, Amount, OwnedParameter, OwnedReceiveName, ReceiveName,
    },
    hashes,
    smart_contracts::{self, WasmModule},
};
use concordium_smart_contract_engine::{
    utils::{self, WasmVersion},
    v0,
    v1::{self, ReturnValue},
    InterpreterEnergy,
};
use concordium_wasm::{
    output::{write_custom_section, Output},
    parse::parse_skeleton,
    validate::ValidationConfig,
};
use ptree::{print_tree_with, PrintConfig, TreeBuilder};
use sha2::Digest;
use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};
use structopt::StructOpt;
mod build;
mod context;

/// Versioned schemas always start with two fully set bytes.
/// This is used to determine whether we are looking at a versioned or
/// unversioned (old) schemas.
const VERSIONED_SCHEMA_MAGIC_HASH: &[u8] = &[0xff, 0xff];

#[derive(Debug, StructOpt)]
#[structopt(bin_name = "cargo")]
enum CargoCommand {
    #[structopt(name = "concordium")]
    Concordium(Command),
}

#[derive(Debug, StructOpt)]
#[structopt(about = "Smart contract development tool for building, testing and deploying.")]
enum Command {
    #[structopt(
        name = "run",
        about = "Locally simulate invocation method of a smart contract and inspect the state."
    )]
    Run(Box<RunCommand>),
    #[structopt(
        name = "display-state",
        about = "Display the contract state as a tree."
    )]
    DisplayState {
        #[structopt(
            name = "state-bin",
            long = "state-bin",
            help = "Path to the file with state that is to be displayed. The state must be for a \
                    V1 contract."
        )]
        state_bin_path: PathBuf,
    },
    #[structopt(
        name = "test",
        about = "Build and run tests using a Wasm interpreter.
This command also builds a deployable Wasm module for integration testing, and it therefore also \
                 has arguments for building. By default, all integration test targets are tested. \
                 To limit the targets tested, use `--test` one or more times."
    )]
    Test {
        #[structopt(name = "seed", long = "seed", help = "Seed for randomized testing")]
        seed:            Option<u64>,
        #[structopt(flatten)]
        build_options:   BuildOptions,
        #[structopt(
            name = "only-unit-tests",
            long = "only-unit-tests",
            help = "Whether only the unit tests should be run."
        )]
        only_unit_tests: bool,
        #[structopt(
            name = "test",
            long = "test",
            short = "t",
            help = "Test only the specified test target (can be provided multiple times)"
        )]
        test_targets:    Vec<String>,
    },
    #[structopt(
        name = "init",
        about = "Create a new Concordium smart contract project. This command requires \
                 `cargo-generate` which can be installed by running `cargo install --locked \
                 cargo-generate`."
    )]
    Init {
        #[structopt(
            name = "path",
            long = "path",
            short = "p",
            default_value = ".",
            help = "The path where the project should be created."
        )]
        path: PathBuf,
    },
    #[structopt(
        name = "schema-json",
        about = "Convert a schema into its JSON representation and output it to a file.
A schema has to be provided either as part of a smart contract module or with the schema flag. You \
                 need to use exactly one of the two flags(`--schema` or `--module`) with this \
                 command."
    )]
    SchemaJSON {
        #[structopt(
            name = "out",
            long = "out",
            short = "o",
            default_value = ".",
            help = "Writes the converted JSON representation of the schema to files named after \
                    the smart contract names at the specified location (expected input: \
                    `./my/path/`)."
        )]
        out:          PathBuf,
        #[structopt(
            name = "schema",
            long = "schema",
            short = "s",
            conflicts_with = "module",
            required_unless = "module",
            help = "Path and filename to a file with a schema (expected input: \
                    `./my/path/schema.bin`)."
        )]
        schema_path:  Option<PathBuf>,
        #[structopt(
            name = "wasm-version",
            long = "wasm-version",
            short = "v",
            help = "If the supplied schema or module is the unversioned one this flag should be \
                    used to supply the version explicitly. Unversioned schemas and modules were \
                    produced by older versions of `concordium-std` and `cargo-concordium`."
        )]
        wasm_version: Option<WasmVersion>,
        #[structopt(
            name = "module",
            long = "module",
            short = "m",
            conflicts_with = "schema",
            required_unless = "schema",
            help = "Path and filename to a file with a smart contract module (expected input: \
                    `./my/path/module.wasm.v1`)."
        )]
        module_path:  Option<PathBuf>,
    },
    #[structopt(
        name = "schema-base64",
        about = "Convert a schema into its base64 representation and output it to a file or print \
                 it to the console. A schema has to be provided either as part of a smart \
                 contract module or with the schema flag. You need to use exactly one of the two \
                 flags(`--schema` or `--module`) with this command."
    )]
    SchemaBase64 {
        #[structopt(
            name = "out",
            long = "out",
            short = "o",
            default_value = "-",
            help = "Path and filename to write the converted base64 representation to or use the \
                    default value `-` to print the base64 schema to the console (expected input: \
                    `./my/path/base64_schema.b64` or `-`)."
        )]
        out:          PathBuf,
        #[structopt(
            name = "schema",
            long = "schema",
            short = "s",
            conflicts_with = "module",
            required_unless = "module",
            help = "Path and filename to a file with a schema (expected input: \
                    `./my/path/schema.bin`)."
        )]
        schema_path:  Option<PathBuf>,
        #[structopt(
            name = "wasm-version",
            long = "wasm-version",
            short = "v",
            help = "If the supplied schema or module is the unversioned one this flag should be \
                    used to supply the version explicitly. Unversioned schemas and modules were \
                    produced by older versions of `concordium-std` and `cargo-concordium`."
        )]
        wasm_version: Option<WasmVersion>,
        #[structopt(
            name = "module",
            long = "module",
            short = "m",
            conflicts_with = "schema",
            required_unless = "schema",
            help = "Path and filename to a file with a smart contract module (expected input: \
                    `./my/path/module.wasm.v1`)."
        )]
        module_path:  Option<PathBuf>,
    },
    #[structopt(
        name = "schema-template",
        about = "Convert a schema into its template representation and output it to a file or \
                 print it to the console. A schema has to be provided either as part of a smart \
                 contract module or with the schema flag. You need to use exactly one of the two \
                 flags(`--schema` or `--module`) with this command."
    )]
    SchemaTemplate {
        #[structopt(
            name = "out",
            long = "out",
            short = "o",
            default_value = "-",
            help = "Path and filename to write the converted template representation to or use \
                    the default value `-` to print the template schema to the console (expected \
                    input: `./my/path/template_schema.txt` or `-`)."
        )]
        out:          PathBuf,
        #[structopt(
            name = "schema",
            long = "schema",
            short = "s",
            conflicts_with = "module",
            required_unless = "module",
            help = "Path and filename to a file with a schema (expected input: \
                    `./my/path/schema.bin`)."
        )]
        schema_path:  Option<PathBuf>,
        #[structopt(
            name = "wasm-version",
            long = "wasm-version",
            short = "v",
            help = "If the supplied schema or module is the unversioned one this flag should be \
                    used to supply the version explicitly. Unversioned schemas and modules were \
                    produced by older versions of `concordium-std` and `cargo-concordium`."
        )]
        wasm_version: Option<WasmVersion>,
        #[structopt(
            name = "module",
            long = "module",
            short = "m",
            conflicts_with = "schema",
            required_unless = "schema",
            help = "Path and filename to a file with a smart contract module (expected input: \
                    `./my/path/module.wasm.v1`)."
        )]
        module_path:  Option<PathBuf>,
    },
    #[structopt(
        name = "build",
        about = "Build a deployment ready smart-contract module."
    )]
    Build {
        #[structopt(flatten)]
        build_options: BuildOptions,
    },
    #[structopt(
        name = "print-build-info",
        about = "Print any embedded build information in a module."
    )]
    PrintBuildInfo {
        #[structopt(name = "module", long = "module", help = "Path to the source module.")]
        source: PathBuf,
    },
    #[structopt(
        name = "edit-build-info",
        about = "Edit build information in a module."
    )]
    EditBuildInfo {
        #[structopt(flatten)]
        edit_options: EditOptions,
    },
    #[structopt(name = "verify-build", about = "Verify a build.")]
    Verify {
        #[structopt(flatten)]
        verify_options: VerifyOptions,
    },
}

// Verify a build.
//
// This is *not* a doc comment on purpose, as that has the effect of overriding
// the `about` message in the help menu for the command.
// The issue is known (https://github.com/TeXitoi/structopt/issues/391) but won't
// be fixed in `structopt` as it is in maintenance mode and is now integrated
// in `clap` v3+. Once we migrate to `clap` v3+, this can become a doc comment.
#[derive(Debug, StructOpt)]
struct VerifyOptions {
    #[structopt(
        name = "source",
        long = "source",
        help = "Path to the sources. If not present then the sources will be downloaded from an \
                embedded link in the build info."
    )]
    source_path:       Option<PathBuf>,
    #[structopt(name = "module", long = "module", help = "Module to verify.")]
    source:            PathBuf,
    #[structopt(
        name = "crt",
        long = "container-runtime",
        help = "The container runtime (either binary name or path) used to run the image to \
                verify the build.",
        default_value = "docker",
        env = "CARGO_CONCORDIUM_CONTAINER_RUNTIME"
    )]
    container_runtime: String,
}

// Edit a build section by adding a source link.
//
// This is *not* a doc comment on purpose, as that has the effect of overriding
// the `about` message in the help menu for the command.
// The issue is known (https://github.com/TeXitoi/structopt/issues/391) but won't
// be fixed in `structopt` as it is in maintenance mode and is now integrated
// in `clap` v3+. Once we migrate to `clap` v3+, this can become a doc comment.
#[derive(Debug, StructOpt)]
struct EditOptions {
    #[structopt(
        name = "source-link",
        long = "source-link",
        help = "URL pointing to the sources. If not set the link is removed."
    )]
    source_link: Option<String>,
    #[structopt(
        name = "module",
        long = "module",
        help = "Module to add the URL to. This will be overwritten."
    )]
    source:      PathBuf,
    #[structopt(
        name = "verify",
        long = "verify",
        help = "If a source link is supplied, verify that the data at the URL matches the \
                embedded archive hash."
    )]
    verify:      bool,
}

// The build options used in the build and test command.
//
// This is *not* a doc comment on purpose, as that has the effect of overriding
// the `about` message in the help menu for the command.
// The issue is known (https://github.com/TeXitoi/structopt/issues/391) but won't
// be fixed in `structopt` as it is in maintenance mode and is now integrated
// in `clap` v3+. Once we migrate to `clap` v3+, this can become a doc comment.
#[derive(Debug, StructOpt)]
struct BuildOptions {
    #[structopt(
        name = "schema-embed",
        long = "schema-embed",
        short = "e",
        help = "Builds the contract schema and embeds it into the wasm module."
    )]
    schema_embed:        bool,
    #[structopt(
        name = "schema-out",
        long = "schema-out",
        short = "s",
        help = "Builds the contract schema and writes it to file at specified location."
    )]
    schema_out:          Option<PathBuf>,
    #[structopt(
        name = "schema-json-out",
        long = "schema-json-out",
        short = "j",
        help = "Builds the contract schema and writes it in JSON format to the specified \
                directory."
    )]
    schema_json_out:     Option<PathBuf>,
    #[structopt(
        name = "schema-template-out",
        long = "schema-template-out",
        short = "p",
        help = "Writes the template of the schema to file at specified location or prints the \
                template of the schema to the console if the value `-` is used (expected input: \
                `./my/path/schema_template.txt` or `-`)."
    )]
    schema_template_out: Option<PathBuf>,
    #[structopt(
        name = "schema-base64-out",
        long = "schema-base64-out",
        short = "b",
        help = "Builds the contract schema and writes it in base64 format to file at specified \
                location or prints the base64 schema to the console if the value `-` is used \
                (expected input: `./my/path/base64_schema.b64` or `-`)."
    )]
    schema_base64_out:   Option<PathBuf>,
    #[structopt(
        name = "out",
        long = "out",
        short = "o",
        help = "Write the resulting smart contract module to the specified file."
    )]
    out:                 Option<PathBuf>,
    #[structopt(
        name = "contract-version",
        long = "contract-version",
        short = "v",
        help = "Build a module of the given version.",
        default_value = "V1"
    )]
    version:             utils::WasmVersion,
    #[structopt(
        name = "verifiable",
        long = "verifiable",
        requires = "out",
        short = "r",
        help = "The image to use for a build of a contract that can be verified. If this is not \
                supplied then the contract will be built in the context of the host, which is \
                usually not verifiable."
    )]
    image:               Option<String>,
    #[structopt(
        name = "crt",
        long = "container-runtime",
        help = "The container runtime (either binary name or path) used to run the image when a \
                verifiable build is requested.",
        default_value = "docker",
        env = "CARGO_CONCORDIUM_CONTAINER_RUNTIME"
    )]
    container_runtime:   String,
    #[structopt(
        name = "source-link",
        long = "source-link",
        help = "If a verifiable build is requested, a source link can be embedded in the module."
    )]
    source_link:         Option<String>,
    #[structopt(
        raw = true,
        help = "Extra arguments passed to `cargo build` when building Wasm module."
    )]
    cargo_args:          Vec<String>,
}

impl BuildOptions {
    /// Determine the [`SchemaBuildOptions`] based on the input from the user.
    fn schema_build_options(&self) -> SchemaBuildOptions {
        if self.schema_embed {
            SchemaBuildOptions::BuildAndEmbed
        } else if self.schema_out.is_some()
            || self.schema_json_out.is_some()
            || self.schema_base64_out.is_some()
            || self.schema_template_out.is_some()
        {
            SchemaBuildOptions::JustBuild
        } else {
            SchemaBuildOptions::DoNotBuild
        }
    }
}

#[derive(Debug, StructOpt)]
#[structopt(name = "runner")]
struct Runner {
    #[structopt(name = "module", long = "module", help = "Binary module source.")]
    module:              PathBuf,
    #[structopt(
        name = "out-bin",
        long = "out-bin",
        help = "Where to write the new contract state to in binary format."
    )]
    out_bin:             Option<PathBuf>,
    #[structopt(
        name = "out-json",
        long = "out-json",
        help = "Where to write the new contract state to in JSON format, requiring the module to \
                have an appropriate schema embedded or otherwise provided by --schema. This only \
                applies to V0 contracts."
    )]
    out_json:            Option<PathBuf>,
    #[structopt(
        name = "ignore-state-schema",
        long = "ignore-state-schema",
        help = "Disable displaying the state as JSON when a schema for the state is present. This \
                only applies to V0 contracts."
    )]
    ignore_state_schema: bool,
    #[structopt(
        name = "amount",
        long = "amount",
        help = "The amount of CCD to invoke the method with.",
        default_value = "0"
    )]
    amount:              Amount,
    #[structopt(
        name = "schema",
        long = "schema",
        help = "Path to a file with a schema for parsing parameter (or state only for V0 \
                contracts) in JSON."
    )]
    schema_path:         Option<PathBuf>,
    #[structopt(
        name = "parameter-bin",
        long = "parameter-bin",
        conflicts_with = "parameter-json",
        help = "Path to a binary file with a parameter to invoke the method with. Parameter \
                defaults to an empty array if this is not given."
    )]
    parameter_bin_path:  Option<PathBuf>,
    #[structopt(
        name = "parameter-json",
        long = "parameter-json",
        conflicts_with = "parameter-bin",
        help = "Path to a JSON file with a parameter to invoke the method with. The JSON is \
                parsed using a schema, requiring the module to have an appropriate schema \
                embedded or otherwise provided by --schema."
    )]
    parameter_json_path: Option<PathBuf>,
    #[structopt(
        name = "energy",
        long = "energy",
        help = "Initial amount of interpreter energy to invoke the contract call with. Note that \
                interpreter energy is not the same as NRG, there is a conversion factor between \
                them.",
        default_value = "1000000"
    )]
    energy:              InterpreterEnergy,
}

#[derive(Debug, StructOpt)]
enum RunCommand {
    #[structopt(name = "init", about = "Initialize a module.")]
    Init {
        #[structopt(
            name = "contract",
            long = "contract",
            short = "c",
            help = "Name of the contract to instantiate."
        )]
        contract_name:        String,
        #[structopt(
            name = "context",
            long = "context",
            short = "t",
            help = "Path to the init context file."
        )]
        context:              Option<PathBuf>,
        #[structopt(
            name = "display-state",
            long = "display-state",
            help = "Pretty print the contract state at the end of execution."
        )]
        should_display_state: bool,
        #[structopt(flatten)]
        runner:               Runner,
    },
    #[structopt(name = "update", about = "Invoke a receive method of a module.")]
    Receive {
        #[structopt(
            name = "contract",
            long = "contract",
            short = "c",
            help = "Name of the contract to receive message."
        )]
        contract_name: String,
        #[structopt(
            name = "entrypoint",
            long = "entrypoint",
            short = "f",
            help = "Name of the entrypoint to invoke."
        )]
        entrypoint:    String,

        #[structopt(
            name = "state-json",
            long = "state-json",
            help = "File with existing state of the contract in JSON, requires a schema is \
                    present either embedded or using --schema."
        )]
        state_json_path:      Option<PathBuf>,
        #[structopt(
            name = "state-bin",
            long = "state-bin",
            help = "File with existing state of the contract in binary."
        )]
        state_bin_path:       Option<PathBuf>,
        #[structopt(
            name = "balance",
            long = "balance",
            help = "Balance on the contract at the time it is invoked. Overrides the balance in \
                    the receive context."
        )]
        balance:              Option<u64>,
        #[structopt(
            name = "context",
            long = "context",
            short = "t",
            help = "Path to the receive context file."
        )]
        context:              Option<PathBuf>,
        #[structopt(
            name = "display-state",
            long = "display-state",
            help = "Pretty print the contract state at the end of execution."
        )]
        should_display_state: bool,
        #[structopt(flatten)]
        runner:               Runner,
    },
}

const WARNING_STYLE: ansi_term::Color = ansi_term::Color::Yellow;

pub fn main() -> anyhow::Result<()> {
    #[cfg(target_os = "windows")]
    {
        ansi_term::enable_ansi_support();
    }
    let cmd = {
        let app = CargoCommand::clap()
            .setting(AppSettings::ArgRequiredElseHelp)
            .global_setting(AppSettings::TrailingVarArg)
            .global_setting(AppSettings::ColoredHelp);
        let matches = app.get_matches();
        let CargoCommand::Concordium(cmd) = CargoCommand::from_clap(&matches);
        cmd
    };
    match cmd {
        Command::Run(run_cmd) => {
            let runner = match *run_cmd {
                RunCommand::Init { ref runner, .. } => runner,
                RunCommand::Receive { ref runner, .. } => runner,
            };
            let versioned_module = WasmModule::from_file(&runner.module).with_context(|| {
                format!("Could not read module file {}", runner.module.display())
            })?;
            let module = versioned_module.source.as_ref();
            match versioned_module.version {
                smart_contracts::WasmVersion::V0 => handle_run_v0(*run_cmd, module)?,
                smart_contracts::WasmVersion::V1 => handle_run_v1(*run_cmd, module)?,
            }
        }
        Command::Test {
            seed,
            build_options,
            only_unit_tests,
            test_targets,
        } => {
            let success_unit = build_and_run_wasm_test(&build_options.cargo_args, seed)
                .context("Could not build and run tests.")?;
            let success_integration = if only_unit_tests {
                true
            } else {
                build_and_run_integration_tests(build_options, test_targets).is_ok()
            };

            if success_unit && success_integration {
                eprintln!("{}", Color::Green.bold().paint("All tests passed"));
            } else {
                eprintln!("\n{}", Color::Red.bold().paint("One or more tests failed"));
            };
        }
        Command::Init { path } => {
            init_concordium_project(path)
                .context("Could not create a new Concordium smart contract project.")?;
        }
        Command::SchemaJSON {
            out,
            module_path,
            schema_path,
            wasm_version,
        } => {
            let schema = get_schema(module_path, schema_path, wasm_version)
                .context("Could not get schema.")?;

            write_json_schema(&out, &schema).context("Could not write JSON schema files.")?
        }
        Command::SchemaBase64 {
            out,
            module_path,
            schema_path,
            wasm_version,
        } => {
            let schema = get_schema(module_path, schema_path, wasm_version)
                .context("Could not get schema.")?;

            if out.as_path() == Path::new("-") {
                write_schema_base64(None, &schema).context("Could not print base64 schema.")?;
            } else {
                // A valid path needs to be provided when using the `--out` flag.
                if out.file_name().is_none() || out.is_dir() {
                    anyhow::bail!(
                        "The `--out` flag should point to a directory + filename (expected input: \
                         `./my/path/base64_schema.b64`) or be `-`."
                    );
                }

                write_schema_base64(Some(out), &schema)
                    .context("Could not write base64 schema file.")?;
            }
        }
        Command::SchemaTemplate {
            out,
            module_path,
            schema_path,
            wasm_version,
        } => {
            let schema = get_schema(module_path, schema_path, wasm_version)
                .context("Could not get schema.")?;

            if out.as_path() == Path::new("-") {
                write_schema_template(None, &schema)
                    .context("Could not print the template of the schema.")?;
            } else {
                // A valid path needs to be provided when using the `--out` flag.
                if out.file_name().is_none() || out.is_dir() {
                    anyhow::bail!(
                        "The `--out` flag should point to a directory + filename (expected input: \
                         `./my/path/template_schema.txt`) or be `-`."
                    );
                }

                write_schema_template(Some(out), &schema)
                    .context("Could not write template schema files.")?;
            }
        }
        Command::Build { build_options } => {
            handle_build(build_options, true)?;
        }
        Command::EditBuildInfo { edit_options } => {
            handle_edit(edit_options)?;
        }
        Command::PrintBuildInfo { source } => {
            handle_print_build_info(source)?;
        }
        Command::Verify { verify_options } => {
            handle_verify(verify_options)?;
        }
        Command::DisplayState { state_bin_path } => display_state_from_file(state_bin_path)?,
    };
    Ok(())
}

/// Download the file into the provided writer and return the amount of data
/// that was downloaded.
fn download_file_into(url: &str, out: &mut impl std::io::Write) -> anyhow::Result<usize> {
    let mut response = reqwest::blocking::get(url)
        .with_context(|| format!("Unable to retrieve source from {}.", url))?;
    ensure!(
        response.status().is_success(),
        "Unable to retrieve source. Received {} status code response.",
        response.status()
    );
    // Download at most 11MB of data.
    let max_data_size = 10 * 1024 * 1024;
    let mut pos: usize = 0;
    // Read in terms of 1MB chunks.
    let mut buf = [0u8; 1024];
    while pos < max_data_size {
        let bytes_read = response.read(&mut buf)?;
        if bytes_read == 0 {
            break;
        }
        out.write_all(&buf[0..bytes_read])?;
        pos += bytes_read;
    }
    anyhow::ensure!(pos < max_data_size, "The source archive is too large.");
    Ok(pos)
}

/// Handler for the command to verify a build.
fn handle_verify(options: VerifyOptions) -> anyhow::Result<()> {
    let module = WasmModule::from_file(&options.source)?;
    let mut skeleton = parse_skeleton(module.source.as_ref())
        .context("The supplied module is not a valid Wasm module")?;

    let utils::VersionedBuildInfo::V0(build_info) =
        utils::get_build_info_from_skeleton(&skeleton).context("Unable to extract build info.")?;

    let tar_file_contents = if let Some(path) = options.source_path {
        std::fs::read(path).context("Unable to read the supplied source path.")?
    } else if let Some(url) = build_info.source_link {
        eprintln!("Downloading source from {url}");
        let mut out = Vec::new();
        download_file_into(&url, &mut out)?;
        out
    } else {
        anyhow::bail!("No source provided, and no source link embedded.");
    };

    eprintln!("Building source and checking ...");
    let rebuilt_source = build::build_archive(
        &build_info.image,
        &tar_file_contents,
        &options.container_runtime,
        &build_info.build_command,
    )
    .context("Unable to build sources.")?;

    concordium_wasm::utils::strip(&mut skeleton);
    let mut rebuilt_skeleton =
        parse_skeleton(&rebuilt_source).context("Unable to parse rebuilt module.")?;
    concordium_wasm::utils::strip(&mut rebuilt_skeleton);

    let mut sha_origin = sha2::Sha256::new();
    let mut sha_new = sha2::Sha256::new();
    skeleton.output(&mut sha_origin)?;
    rebuilt_skeleton.output(&mut sha_new)?;
    let error_style = ansi_term::Color::Red.bold();
    if sha_origin.finalize() != sha_new.finalize() {
        anyhow::bail!(
            "\n{}",
            error_style.paint("The source does not correspond to the module.")
        );
    } else {
        let success_style = ansi_term::Color::Green.bold();
        eprintln!("\n{}", success_style.paint("Source and module match."));
        Ok(())
    }
}

/// Handler for the command to edit build information in a module.
fn handle_edit(options: EditOptions) -> anyhow::Result<()> {
    let module = WasmModule::from_file(&options.source)?;
    let mut skeleton = parse_skeleton(module.source.as_ref())
        .context("The supplied module is not a valid Wasm module")?;

    let mut build_context_section = None;
    for (i, ucs) in skeleton.custom.iter_mut().enumerate() {
        let cs = concordium_wasm::parse::parse_custom(ucs)?;
        if cs.name.as_ref() == utils::BUILD_INFO_SECTION_NAME
            && build_context_section.replace((i, cs)).is_some()
        {
            anyhow::bail!(
                "Multiple sections {}. The module is malformed.",
                utils::BUILD_INFO_SECTION_NAME
            );
        }
    }
    let Some((i, mut cs)) = build_context_section else {
        anyhow::bail!("No embedded build information found.");
    };
    skeleton.custom.remove(i);
    let mut info: utils::VersionedBuildInfo =
        from_bytes(cs.contents).context("Failed parsing build info")?;
    let utils::VersionedBuildInfo::V0(ref mut inner) = info;
    if let Some(ref link) = options.source_link {
        if options.verify {
            eprintln!("Verifying data consistency.");
            let mut hasher = sha2::Sha256::new();
            download_file_into(link, &mut hasher)?;
            anyhow::ensure!(
                hashes::Hash::from(<[u8; 32]>::from(hasher.finalize())) == inner.archive_hash,
                "The embedded archive hash does not match the file at the supplied URL."
            );
            eprintln!("The archive at the supplied URL matches the stored archive checksum.");
        }
        eprintln!("Setting source link to {link}.");
    } else {
        eprintln!("Unsetting source link.")
    }
    inner.source_link = options.source_link;
    let mut out_buf = Vec::new();
    skeleton
        .output(&mut out_buf)
        .context("Failed to write output module.")?;

    let new_section_content = to_bytes(&info);
    cs.contents = &new_section_content;
    write_custom_section(&mut out_buf, &cs)?;

    let out_module = WasmModule {
        version: module.version,
        source:  out_buf.into(),
    };
    std::fs::write(
        options.source,
        concordium_base::common::to_bytes(&out_module),
    )
    .context("Unable to replace module source.")?;

    let success_style = ansi_term::Color::Green.bold();
    eprintln!("{}", success_style.paint("Finished."));
    eprintln!("\nNew build information embedded in the module.");
    print_build_info(&info);

    Ok(())
}

fn handle_print_build_info(source: PathBuf) -> anyhow::Result<()> {
    let module = WasmModule::from_file(&source)?;
    let mut skeleton = parse_skeleton(module.source.as_ref())
        .context("The supplied module is not a valid Wasm module")?;

    let mut build_context_section = None;
    for ucs in skeleton.custom.iter_mut() {
        let cs = concordium_wasm::parse::parse_custom(ucs)?;
        if cs.name.as_ref() == utils::BUILD_INFO_SECTION_NAME
            && build_context_section.replace(cs).is_some()
        {
            anyhow::bail!(
                "Multiple sections {}. The module is malformed.",
                utils::BUILD_INFO_SECTION_NAME
            );
        }
    }
    let Some(cs) = build_context_section else {
        anyhow::bail!("No embedded build information found.");
    };

    let info: utils::VersionedBuildInfo =
        from_bytes(cs.contents).context("Failed parsing build info")?;
    print_build_info(&info);

    Ok(())
}

/// Build the smart contract module using the provided options.
///
/// This method is used by both the build and test command.
/// When building, i.e. when running `cargo concordium build`, the schema
/// information is outputted, but that is not the case when testing.
/// This behaviour is configurable via the parameter `print_schema_info`.
fn handle_build(
    options: BuildOptions,
    print_extra_info: bool,
) -> anyhow::Result<cargo_metadata::Metadata> {
    let success_style = ansi_term::Color::Green.bold();
    let bold_style = ansi_term::Style::new().bold();
    let build_schema = options.schema_build_options();
    let BuildInfo {
        total_module_len,
        schema,
        metadata,
        stored_build_info,
    } = build_contract(
        options.version,
        build_schema,
        options.image,
        options.source_link,
        options.container_runtime,
        options.out,
        &options.cargo_args,
    )
    .context("Could not build smart contract.")?;
    if let Some(module_schema) = &schema {
        let module_schema_bytes = to_bytes(module_schema);
        if print_extra_info {
            match module_schema {
                VersionedModuleSchema::V0(module_schema) => {
                    eprintln!("\n   Module schema includes:");
                    for (contract_name, contract_schema) in module_schema.contracts.iter() {
                        print_contract_schema_v0(contract_name, contract_schema);
                    }
                }
                VersionedModuleSchema::V1(module_schema) => {
                    eprintln!("\n   Module schema includes:");
                    for (contract_name, contract_schema) in module_schema.contracts.iter() {
                        print_contract_schema_v1(contract_name, contract_schema);
                    }
                }
                VersionedModuleSchema::V2(module_schema) => {
                    eprintln!("\n   Module schema includes:");
                    for (contract_name, contract_schema) in module_schema.contracts.iter() {
                        print_contract_schema_v2(contract_name, contract_schema);
                    }
                }
                VersionedModuleSchema::V3(module_schema) => {
                    eprintln!("\n   Module schema includes:");
                    for (contract_name, contract_schema) in module_schema.contracts.iter() {
                        print_contract_schema_v3(contract_name, contract_schema);
                    }
                }
            };
            eprintln!(
                "\n   Total size of the module schema is {} {}",
                bold_style.paint(module_schema_bytes.len().to_string()),
                bold_style.paint("B")
            );
        }

        if let Some(schema_out) = options.schema_out {
            // A path and a filename need to be provided when using the `--schema-out`
            // flag.
            if schema_out.file_name().is_none() || schema_out.is_dir() {
                anyhow::bail!(
                    "The `--schema-out` flag requires a path and a filename (expected input: \
                     `./my/path/schema.bin`)"
                );
            }

            if let Some(out_dir) = schema_out.parent() {
                fs::create_dir_all(out_dir)
                    .context("Unable to create directory for the resulting schema.")?;
            }
            fs::write(schema_out, &module_schema_bytes).context("Could not write schema file.")?;
        }
        if let Some(schema_json_out) = options.schema_json_out {
            write_json_schema(&schema_json_out, module_schema)
                .context("Could not write JSON schema files.")?;
        }
        if let Some(schema_template_out) = options.schema_template_out {
            if schema_template_out.as_path() == Path::new("-") {
                write_schema_template(None, module_schema)
                    .context("Could not print the template of the schema.")?;
            } else {
                if schema_template_out.file_name().is_none() || schema_template_out.is_dir() {
                    anyhow::bail!(
                        "The `--schema-template-out` flag should point to a directory + filename \
                         (expected input: `./my/path/template_schema.txt`) or be `-`."
                    );
                }

                write_schema_template(Some(schema_template_out), module_schema)
                    .context("Could not write template schema files.")?;
            }
        }
        if let Some(schema_base64_out) = options.schema_base64_out {
            if schema_base64_out.as_path() == Path::new("-") {
                write_schema_base64(None, module_schema)
                    .context("Could not print base64 schema.")?;
            } else {
                if schema_base64_out.file_name().is_none() || schema_base64_out.is_dir() {
                    anyhow::bail!(
                        "The `--schema-base64-out` flag should point to a directory + filename \
                         (expected input: `./my/path/base64_schema.b64`) or be `-`."
                    );
                }

                write_schema_base64(Some(schema_base64_out), module_schema)
                    .context("Could not write base64 schema file.")?;
            }
        }
        if options.schema_embed && print_extra_info {
            eprintln!("   Embedding schema into module.\n");
        }
    }
    if print_extra_info {
        if let Some((bi, archived_files)) = stored_build_info {
            eprintln!("  Embedded build information information:\n",);
            print_build_info(&bi);
            eprintln!();
            eprintln!("    - Archived source files:");
            for file in archived_files {
                eprintln!("        - {}", file.display());
            }
        }

        let size = format!(
            "{}.{:03} kB",
            total_module_len / 1000,
            total_module_len % 1000
        );
        eprintln!(
            "    {} smart contract module {}",
            success_style.paint("Finished"),
            bold_style.paint(size)
        );
    }
    Ok(metadata)
}

/// Loads the contract state from file and displays it as a tree by printing to
/// stdout.
fn display_state_from_file(file_path: PathBuf) -> anyhow::Result<()> {
    let file = File::open(&file_path)
        .with_context(|| format!("Could not read state file {}.", file_path.display()))?;
    let mut reader = std::io::BufReader::new(file);
    let state = v1::trie::PersistentState::deserialize(&mut reader)
        .context("Could not deserialize the provided state.")?;

    display_state(&state)
}

/// Displays the contract state as a tree by printing to stdout.
fn display_state(state: &v1::trie::PersistentState) -> Result<(), anyhow::Error> {
    let mut loader = v1::trie::Loader::new([]);

    let mut tree_builder = TreeBuilder::new("StateRoot".into());
    state.display_tree(&mut tree_builder, &mut loader);
    let tree = tree_builder.build();
    // We don't want to depend on some global config as it opens up for all sorts of
    // corner-case bugs since we are not in control and thus inconsistent user
    // experience.
    let config = PrintConfig::default();
    print_tree_with(&tree, &config).context("Could not print the state as a tree.")
}

/// Print the summary of the contract schema.
fn print_schema_info(contract_name: &str, len: usize) {
    eprintln!(
        "\n     Contract schema: '{}' in total {} B.",
        contract_name, len,
    );
}

/// Based on the list of receive names compute the colon position for aligning
/// prints.
fn get_colon_position<'a>(iter: impl Iterator<Item = &'a str>) -> usize {
    let max_length_receive_opt = iter.map(|n| n.chars().count()).max();
    max_length_receive_opt.map_or(5, |m| m.max(5))
}

/// Print the contract name and its entrypoints
fn print_contract_schema_v0(
    contract_name: &str,
    contract_schema: &contracts_common::schema::ContractV0,
) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(state_schema) = &contract_schema.state {
        eprintln!("       state   : {} B", to_bytes(state_schema).len());
    }
    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

/// Print the contract name and its entrypoints.
fn print_contract_schema_v1(
    contract_name: &str,
    contract_schema: &contracts_common::schema::ContractV1,
) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

/// Print the contract name and its entrypoints.
fn print_contract_schema_v2(
    contract_name: &str,
    contract_schema: &contracts_common::schema::ContractV2,
) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

/// Print the contract name and its entrypoints.
fn print_contract_schema_v3(
    contract_name: &str,
    contract_schema: &contracts_common::schema::ContractV3,
) {
    let receive_iter = contract_schema.receive.keys().map(|n| n.as_str());
    let colon_position = get_colon_position(receive_iter);

    print_schema_info(contract_name, to_bytes(contract_schema).len());

    if let Some(init_schema) = &contract_schema.init {
        eprintln!("       init    : {} B", to_bytes(init_schema).len())
    }

    if let Some(event_schema) = &contract_schema.event {
        eprintln!("       event   : {} B", to_bytes(event_schema).len())
    }

    if !contract_schema.receive.is_empty() {
        eprintln!("       receive");
        for (method_name, param_type) in contract_schema.receive.iter() {
            eprintln!(
                "        - {:width$} : {} B",
                format!("'{}'", method_name),
                to_bytes(param_type).len(),
                width = colon_position + 2
            );
        }
    }
}

fn handle_run_v0(run_cmd: RunCommand, module: &[u8]) -> anyhow::Result<()> {
    let (contract_name, runner, is_receive) = match run_cmd {
        RunCommand::Init {
            ref runner,
            ref contract_name,
            ..
        } => (contract_name, runner, None),
        RunCommand::Receive {
            ref runner,
            ref contract_name,
            ref entrypoint,
            ..
        } => (contract_name, runner, Some(entrypoint)),
    };

    // get the module schema if available.
    let module_schema_opt = if let Some(schema_path) = &runner.schema_path {
        let bytes = fs::read(schema_path).context("Could not read schema file.")?;
        let schema = if bytes.starts_with(VERSIONED_SCHEMA_MAGIC_HASH) {
            from_bytes::<VersionedModuleSchema>(&bytes)
        } else {
            from_bytes(&bytes).map(VersionedModuleSchema::V0)
        };
        Some(schema.map_err(|_| anyhow::anyhow!("Could not deserialize schema file."))?)
    } else {
        let res = utils::get_embedded_schema_v0(module);
        if let Err(err) = &res {
            eprintln!(
                "{}",
                WARNING_STYLE.paint(format!(
                    "Could not use embedded schema: {}.\nPlease provide a path to a valid schema.",
                    err
                ))
            );
        }
        res.ok()
    };

    let contract_schema_opt = match module_schema_opt.as_ref() {
        Some(VersionedModuleSchema::V0(module_schema)) => {
            module_schema.contracts.get(contract_name)
        }
        Some(_) => bail!("Schema version mismatches the smart contract version"),
        None => None,
    };
    let contract_schema_state_opt =
        contract_schema_opt.and_then(|contract_schema| contract_schema.state.clone());
    let contract_schema_func_opt = contract_schema_opt.and_then(|contract_schema| {
        if let Some(entrypoint) = is_receive {
            contract_schema.receive.get(entrypoint)
        } else {
            contract_schema.init.as_ref()
        }
    });

    let print_result = |state: v0::State, logs: v0::Logs| -> anyhow::Result<()> {
        for (i, item) in logs.iterate().enumerate() {
            eprintln!("{}: {:?}", i, item)
        }
        let state = &state.state;
        match (runner.ignore_state_schema, &contract_schema_state_opt) {
            (false, Some(state_schema)) => {
                let s = state_schema
                    .to_json_string_pretty(state)
                    .map_err(|_| anyhow::anyhow!("Could not encode state to JSON."))?;
                if runner.schema_path.is_some() {
                    eprintln!("The new state is: (Using provided schema)\n{}", s)
                } else {
                    eprintln!("The new state is: (Using embedded schema)\n{}", s)
                }
            }
            _ => eprintln!(
                "The new state is: (No schema found for contract state) {:?}\n",
                state
            ),
        };

        if let Some(file_path) = &runner.out_bin {
            if let Some(out_dir) = file_path.parent() {
                fs::create_dir_all(out_dir)
                    .context("Unable to create directory for the binary state output.")?;
            }

            fs::write(file_path, state).context("Could not write state to file.")?;
        }
        if let Some(file_path) = &runner.out_json {
            contract_schema_opt.context(
                "Schema is required for outputting state in JSON. No schema found for this \
                 contract.",
            )?;
            let schema_state = contract_schema_state_opt.as_ref().context(
                "Schema is required for outputting state in JSON. No schema found the state in \
                 this contract.",
            )?;
            let json_string = schema_state
                .to_json_string_pretty(state)
                .map_err(|_| anyhow::anyhow!("Could not output contract state in JSON."))?;
            if let Some(out_dir) = file_path.parent() {
                fs::create_dir_all(out_dir)
                    .context("Unable to create directory for the JSON state output.")?;
            }
            fs::write(file_path, json_string).context("Could not write out the state.")?;
        }
        Ok(())
    };

    let parameter = get_parameter(
        runner.parameter_bin_path.as_deref(),
        runner.parameter_json_path.as_deref(),
        contract_schema_opt.is_some(),
        contract_schema_func_opt,
    )
    .context("Could not get parameter.")?;

    match run_cmd {
        RunCommand::Init { ref context, .. } => {
            let init_ctx: InitContextOpt = match context {
                Some(context_file) => {
                    let ctx_content =
                        fs::read(context_file).context("Could not read init context file.")?;
                    serde_json::from_slice(&ctx_content).context("Could not parse init context.")?
                }
                None => InitContextOpt::default(),
            };
            let name = format!("init_{}", contract_name);
            let res = v0::invoke_init_with_metering_from_source(
                module,
                runner.amount.micro_ccd,
                init_ctx,
                &name,
                parameter.as_parameter(),
                false, // Whether number of logs should be limited. Limit removed in PV5.
                runner.energy,
            )
            .context("Initialization failed due to a runtime error.")?;
            match res {
                v0::InitResult::Success {
                    logs,
                    state,
                    remaining_energy,
                } => {
                    eprintln!("Init call succeeded. The following logs were produced:");
                    print_result(state, logs)?;
                    eprintln!(
                        "Interpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy.energy)
                    )
                }
                v0::InitResult::Reject {
                    remaining_energy,
                    reason,
                } => {
                    eprintln!("Init call rejected with reason {}.", reason);
                    eprintln!(
                        "Interpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy.energy)
                    )
                }
                v0::InitResult::OutOfEnergy => {
                    eprintln!("Init call terminated with out of energy.")
                }
            }
        }
        RunCommand::Receive {
            ref entrypoint,
            ref state_bin_path,
            ref state_json_path,
            balance,
            ref context,
            ..
        } => {
            let mut receive_ctx: ReceiveContextOpt = match context {
                Some(context_file) => {
                    let ctx_content =
                        fs::read(context_file).context("Could not read receive context file.")?;
                    serde_json::from_slice(&ctx_content)
                        .context("Could not parse receive context.")?
                }
                None => ReceiveContextOpt::default(),
            };
            // if the balance is set in the flag it overrides any balance that is set in the
            // context.
            if let Some(balance) = balance {
                receive_ctx.self_balance = Some(contracts_common::Amount::from_micro_ccd(balance));
            }

            // initial state of the smart contract, read from either a binary or json file.
            let init_state = match (state_bin_path, state_json_path) {
                (None, None) => bail!(
                    "The current state is required for simulating an update to a contract \
                     instance. Use either --state-bin or --state-json."
                ),
                (Some(_), Some(_)) => {
                    bail!("Only one state is allowed, choose either --state-bin or --state-json.")
                }
                (Some(file_path), None) => {
                    let mut file = File::open(file_path).context("Could not read state file.")?;
                    let metadata = file.metadata().context("Could not read file metadata.")?;
                    let mut init_state = Vec::with_capacity(metadata.len() as usize);
                    file.read_to_end(&mut init_state)
                        .context("Reading the state file failed.")?;
                    init_state
                }
                (None, Some(file_path)) => {
                    let schema_state = contract_schema_state_opt
                        .as_ref()
                        .context("A schema for the state must be present to use JSON.")?;
                    let file = fs::read(file_path).context("Could not read state file.")?;
                    let state_json: serde_json::Value =
                        serde_json::from_slice(&file).context("Could not parse state JSON.")?;
                    let mut state_bytes = Vec::new();
                    schema_state
                        .serial_value_into(&state_json, &mut state_bytes)
                        .context("Could not generate state bytes using schema and JSON.")?;
                    state_bytes
                }
            };

            let name = format!("{}.{}", contract_name, entrypoint);
            let res = v0::invoke_receive_with_metering_from_source(
                module,
                receive_ctx,
                v0::ReceiveInvocation {
                    amount:       runner.amount.micro_ccd,
                    receive_name: &name,
                    parameter:    parameter.as_parameter(),
                    energy:       runner.energy,
                },
                &init_state,
                u16::MAX as usize, // Max parameter size in PV5.
                false,             // Whether to limit number of logs. Limit removed in PV5.
            )
            .context("Calling receive failed.")?;
            match res {
                v0::ReceiveResult::Success {
                    logs,
                    state,
                    actions,
                    remaining_energy,
                } => {
                    eprintln!("Receive method succeeded. The following logs were produced.");
                    print_result(state, logs)?;
                    eprintln!("The following actions were produced.");
                    for (i, action) in actions.iter().enumerate() {
                        match action {
                            v0::Action::Send { data } => {
                                eprintln!(
                                    "{}: send a message to contract at ({}, {}), calling method \
                                     {} with amount {} and parameter {:?}",
                                    i,
                                    data.to_addr.index,
                                    data.to_addr.subindex,
                                    data.name.as_receive_name().entrypoint_name(),
                                    data.amount,
                                    data.parameter
                                )
                            }
                            v0::Action::SimpleTransfer { data } => {
                                eprintln!(
                                    "{}: simple transfer to account {} of amount {}",
                                    i,
                                    serde_json::to_string(&data.to_addr)
                                        .context("Address not valid JSON, should not happen.")?,
                                    data.amount
                                );
                            }
                            v0::Action::And { l, r } => {
                                eprintln!("{}: AND composition of {} and {}", i, l, r)
                            }
                            v0::Action::Or { l, r } => {
                                eprintln!("{}: OR composition of {} and {}", i, l, r)
                            }
                            v0::Action::Accept => eprintln!("{}: ACCEPT", i),
                        }
                    }

                    eprintln!(
                        "Interpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy.energy)
                    )
                }
                v0::ReceiveResult::Reject {
                    remaining_energy,
                    reason,
                } => {
                    eprintln!("Receive call rejected with reason {}", reason);
                    eprintln!(
                        "Interpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy.energy)
                    )
                }
                v0::ReceiveResult::OutOfEnergy => {
                    eprintln!("Receive call terminated with: out of energy.")
                }
            }
        }
    }
    Ok(())
}

fn handle_run_v1(run_cmd: RunCommand, module: &[u8]) -> anyhow::Result<()> {
    let (contract_name, runner, is_receive) = match run_cmd {
        RunCommand::Init {
            ref runner,
            ref contract_name,
            ..
        } => (contract_name, runner, None),
        RunCommand::Receive {
            ref runner,
            ref contract_name,
            ref entrypoint,
            ..
        } => (contract_name, runner, Some(entrypoint)),
    };

    // get the module schema if available.
    let module_schema_opt = if let Some(schema_path) = &runner.schema_path {
        let bytes = fs::read(schema_path).context("Could not read schema file.")?;
        let schema = if bytes.starts_with(VERSIONED_SCHEMA_MAGIC_HASH) {
            from_bytes::<VersionedModuleSchema>(&bytes)
        } else {
            from_bytes(&bytes).map(VersionedModuleSchema::V1)
        };
        Some(schema.map_err(|_| anyhow::anyhow!("Could not deserialize schema file."))?)
    } else {
        let res = utils::get_embedded_schema_v1(module);
        if let Err(err) = &res {
            eprintln!(
                "{}",
                WARNING_STYLE.paint(format!(
                    "Could not use embedded schema: {}.\nPlease provide a path to
    a valid schema.",
                    err
                ))
            );
        }
        res.ok()
    };

    let (contract_has_schema, schema_parameter, schema_return_value, schema_error, schema_event) =
        match module_schema_opt.as_ref() {
            Some(VersionedModuleSchema::V1(module_schema)) => {
                match module_schema.contracts.get(contract_name) {
                    Some(contract_schema) => {
                        let func_schema_opt = if let Some(func_name) = is_receive {
                            contract_schema.receive.get(func_name)
                        } else {
                            contract_schema.init.as_ref()
                        };

                        match func_schema_opt {
                            Some(func_schema) => {
                                // V1 schemas don't have schemas for errors or events.
                                (
                                    true,
                                    func_schema.parameter(),
                                    func_schema.return_value(),
                                    None,
                                    None,
                                )
                            }
                            None => (true, None, None, None, None),
                        }
                    }
                    None => (false, None, None, None, None),
                }
            }
            Some(VersionedModuleSchema::V2(module_schema)) => {
                match module_schema.contracts.get(contract_name) {
                    Some(contract_schema) => {
                        let func_schema_opt = if let Some(func_name) = is_receive {
                            contract_schema.receive.get(func_name)
                        } else {
                            contract_schema.init.as_ref()
                        };

                        match func_schema_opt {
                            // V2 schemas don't have schemas for events.
                            Some(func_schema) => (
                                true,
                                func_schema.parameter(),
                                func_schema.return_value(),
                                func_schema.error(),
                                None,
                            ),
                            None => (true, None, None, None, None),
                        }
                    }
                    None => (true, None, None, None, None),
                }
            }
            Some(VersionedModuleSchema::V3(module_schema)) => {
                match module_schema.contracts.get(contract_name) {
                    Some(contract_schema) => {
                        // Getting event schema.
                        let schema_event = contract_schema.event();

                        // Getting function schema.
                        let func_schema_opt = if let Some(func_name) = is_receive {
                            contract_schema.receive.get(func_name)
                        } else {
                            contract_schema.init.as_ref()
                        };

                        match func_schema_opt {
                            Some(func_schema) => (
                                true,
                                func_schema.parameter(),
                                func_schema.return_value(),
                                func_schema.error(),
                                schema_event,
                            ),
                            None => (true, None, None, None, schema_event),
                        }
                    }
                    None => (true, None, None, None, None),
                }
            }
            Some(_) => bail!("Schema version mismatches the smart contract version"),
            None => (false, None, None, None, None),
        };

    let print_logs = |logs: v0::Logs| {
        for (i, item) in logs.iterate().enumerate() {
            match schema_event {
                Some(schema) => {
                    let out = schema
                        .to_json_string_pretty(item)
                        .map_err(|_| anyhow::anyhow!("Could not output event value in JSON"));
                    match out {
                        Ok(event_json) => {
                            // Print JSON representation of the event value if the event schema is
                            // available.
                            eprintln!("The JSON representation of event {} is:\n{}", i, event_json);
                        }
                        Err(error) => {
                            // Print the raw event value if there is an error in the event schema.
                            eprintln!(
                                "Event schema had an error. {:?}. The raw value of event {} \
                                 is:\n{:?}",
                                error, i, item
                            );
                        }
                    }
                }
                None => {
                    eprintln!("The raw value of event {} is:\n{:?}", i, item);
                }
            }
        }
    };

    let print_state = |mut state: v1::trie::MutableState,
                       loader: &mut v1::trie::Loader<&[u8]>,
                       should_display_state: bool|
     -> anyhow::Result<()> {
        let mut collector = v1::trie::SizeCollector::default();
        let frozen = state.freeze(loader, &mut collector);
        println!(
            "\nThe contract will produce {}B of additional state that will be charged for.",
            collector.collect()
        );
        if let Some(file_path) = &runner.out_bin {
            let mut out_file = std::fs::File::create(file_path)
                .context("Could not create file to write state into.")?;
            frozen
                .serialize(loader, &mut out_file)
                .context("Could not write the state.")?;
            eprintln!("Resulting state written to {}.", file_path.display());
        }
        if should_display_state {
            display_state(&frozen)?;
        }
        Ok(())
    };

    let print_return_value = |rv: ReturnValue| {
        if let Some(schema) = schema_return_value {
            let out = schema
                .to_json_string_pretty(&rv)
                .map_err(|_| anyhow::anyhow!("Could not output return value in JSON"))?;
            eprintln!("Return value: {}", out);
            Ok::<_, anyhow::Error>(())
        } else {
            eprintln!(
                "No schema for the return value. The raw return value is {:?}.",
                rv
            );
            Ok(())
        }
    };

    let print_error = |rv: ReturnValue| {
        if let Some(schema) = schema_error {
            let out = schema
                .to_json_string_pretty(&rv)
                .map_err(|_| anyhow::anyhow!("Could not output error value in JSON"))?;
            eprintln!("Error: {}", out);
            Ok::<_, anyhow::Error>(())
        } else {
            eprintln!(
                "No schema for the error value. The raw error value is {:?}.",
                rv
            );
            Ok(())
        }
    };

    let parameter = get_parameter(
        runner.parameter_bin_path.as_deref(),
        runner.parameter_json_path.as_deref(),
        contract_has_schema,
        schema_parameter,
    )
    .context("Could not get parameter.")?;

    match run_cmd {
        RunCommand::Init {
            ref context,
            should_display_state,
            ..
        } => {
            let init_ctx: InitContextOpt = match context {
                Some(context_file) => {
                    let ctx_content =
                        fs::read(context_file).context("Could not read init context file.")?;
                    serde_json::from_slice(&ctx_content).context("Could not parse init context.")?
                }
                None => InitContextOpt::default(),
            };
            let name = format!("init_{}", contract_name);
            // empty initial backing store.
            let mut loader = v1::trie::Loader::new(&[][..]);
            let res = v1::invoke_init_with_metering_from_source(
                v1::InvokeFromSourceCtx {
                    source:          module,
                    amount:          runner.amount,
                    parameter:       parameter.as_ref(),
                    energy:          runner.energy,
                    support_upgrade: true, // Upgrades are supported in PV5 and onward.
                },
                init_ctx,
                &name,
                loader,
                ValidationConfig::V1,
                false, /* Whether number of logs and size of return values should be limited.
                        * Limits removed in PV5. */
            )
            .context("Initialization failed due to a runtime error.")?;
            match res {
                v1::InitResult::Success {
                    logs,
                    state,
                    remaining_energy,
                    return_value,
                } => {
                    eprintln!("\nInit call succeeded. The following logs were produced:");
                    print_logs(logs);
                    print_state(state, &mut loader, should_display_state)?;
                    eprintln!("\nThe following return value was returned:");
                    print_return_value(return_value)?;
                    eprintln!(
                        "\nInterpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy.energy)
                    )
                }
                v1::InitResult::Reject {
                    remaining_energy,
                    reason,
                    return_value,
                } => {
                    eprintln!("Init call rejected with reason {}.", reason);
                    eprintln!("\nThe following error value was returned:");
                    print_error(return_value)?;
                    eprintln!(
                        "\nInterpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy.energy)
                    )
                }
                v1::InitResult::Trap {
                    remaining_energy,
                    error,
                } => {
                    return Err(error.context(format!(
                        "Execution triggered a runtime error after spending {} interpreter energy.",
                        runner.energy.subtract(remaining_energy.energy)
                    )));
                }
                v1::InitResult::OutOfEnergy => {
                    eprintln!("Init call terminated with out of energy.")
                }
            }
        }
        RunCommand::Receive {
            ref entrypoint,
            ref state_bin_path,
            balance,
            ref context,
            should_display_state,
            ..
        } => {
            let mut receive_ctx: ReceiveContextV1Opt = match context {
                Some(context_file) => {
                    let ctx_content =
                        fs::read(context_file).context("Could not read receive context file.")?;
                    serde_json::from_slice(&ctx_content)
                        .context("Could not parse receive context.")?
                }
                None => ReceiveContextV1Opt::default(),
            };
            // if the balance is set in the flag it overrides any balance that is set in the
            // context.
            if let Some(balance) = balance {
                receive_ctx.common.self_balance =
                    Some(contracts_common::Amount::from_micro_ccd(balance));
            }

            // initial state of the smart contract, read from either a binary or json file.
            let (init_state, mut loader) = match state_bin_path {
                None => bail!(
                    "The current state is required for simulating an update to a contract \
                     instance. Use --state-bin."
                ),
                Some(file_path) => {
                    let file = File::open(file_path).context("Could not read state file.")?;
                    let mut reader = std::io::BufReader::new(file);
                    let init_state = v1::trie::PersistentState::deserialize(&mut reader)
                        .context("Could not deserialize the provided state.")?;
                    // Since we deserialized the entire state we do not need a loader.
                    // Once this is changed to load data lazily from a file, the loader will be
                    // needed.
                    let loader = v1::trie::Loader::new(&[][..]);
                    (init_state, loader)
                }
            };

            let artifact = concordium_wasm::utils::instantiate_with_metering(
                ValidationConfig::V1,
                &v1::ConcordiumAllowedImports {
                    support_upgrade: true,
                },
                module,
            )?
            .artifact;
            let name = {
                let chosen_name = format!("{}.{}", contract_name, entrypoint);
                if let Err(e) = ReceiveName::is_valid_receive_name(&chosen_name) {
                    anyhow::bail!("Invalid contract or receive function name: {}", e)
                }
                if artifact.has_entrypoint(chosen_name.as_str()) {
                    OwnedReceiveName::new_unchecked(chosen_name)
                } else {
                    let fallback_name = format!("{}.", contract_name);
                    if artifact.has_entrypoint(fallback_name.as_str()) {
                        eprintln!(
                            "The contract '{}' does not have the entrypoint '{}'. Using the \
                             fallback entrypoint instead.",
                            contract_name, entrypoint
                        );
                        OwnedReceiveName::new_unchecked(fallback_name)
                    } else {
                        anyhow::bail!(
                            "The contract '{}' has neither the requested entrypoint '{}', nor a \
                             fallback entrypoint.",
                            contract_name,
                            entrypoint
                        );
                    }
                }
            };

            let mut mutable_state = init_state.thaw();
            let inner = mutable_state.get_inner(&mut loader);
            let instance_state = v1::InstanceState::new(loader, inner);
            let res = v1::invoke_receive::<_, _, _, _, ReceiveContextV1Opt, ReceiveContextV1Opt>(
                std::sync::Arc::new(artifact),
                receive_ctx,
                v1::ReceiveInvocation {
                    amount:       runner.amount,
                    receive_name: name.as_receive_name(),
                    parameter:    parameter.as_ref(),
                    energy:       runner.energy,
                },
                instance_state,
                v1::ReceiveParams::new_p6(),
            )
            .context("Calling receive failed.")?;
            match res {
                v1::ReceiveResult::Success {
                    logs,
                    state_changed,
                    remaining_energy,
                    return_value,
                } => {
                    eprintln!("\nReceive method succeeded. The following logs were produced.");
                    print_logs(logs);
                    if state_changed {
                        print_state(mutable_state, &mut loader, should_display_state)?;
                    } else {
                        eprintln!("The state of the contract did not change.");
                    }
                    eprintln!("\nThe following return value was returned:");
                    print_return_value(return_value)?;
                    eprintln!(
                        "\nInterpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy)
                    )
                }
                v1::ReceiveResult::Reject {
                    remaining_energy,
                    reason,
                    return_value,
                } => {
                    eprintln!("Receive call rejected with reason {}", reason);
                    eprintln!("\nThe following error value was returned:");
                    print_error(return_value)?;
                    eprintln!(
                        "\nInterpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy)
                    )
                }
                v1::ReceiveResult::OutOfEnergy => {
                    eprintln!("Receive call terminated with: out of energy.")
                }
                v1::ReceiveResult::Interrupt {
                    remaining_energy,
                    state_changed,
                    logs,
                    config: _,
                    interrupt,
                } => {
                    eprintln!(
                        "Receive method was interrupted. The following logs were produced by the \
                         time of the interrupt."
                    );
                    print_logs(logs);
                    if state_changed {
                        print_state(mutable_state, &mut loader, should_display_state)?;
                    } else {
                        eprintln!("The state of the contract did not change.");
                    }
                    match interrupt {
                        v1::Interrupt::Transfer { to, amount } => eprintln!(
                            "Receive call invoked a transfer of {} CCD to {}.",
                            amount, to
                        ),
                        v1::Interrupt::Call {
                            address,
                            parameter,
                            name,
                            amount,
                        } => eprintln!(
                            "Receive call invoked contract at ({}, {}), calling method {} with \
                             amount {} and parameter {:?}.",
                            address.index, address.subindex, name, amount, parameter
                        ),
                        v1::Interrupt::Upgrade { module_ref } => eprintln!(
                            "Receive call requested to upgrade the contract to module reference \
                             {module_ref}.",
                        ),

                        v1::Interrupt::QueryAccountBalance { address } => {
                            eprintln!("Receive call requested balance of the account {}.", address)
                        }

                        v1::Interrupt::QueryContractBalance { address } => eprintln!(
                            "Receive call requested balance of the contract {}.",
                            address
                        ),
                        v1::Interrupt::QueryExchangeRates => {
                            eprintln!("Receive call requested exchange rates.")
                        }
                        v1::Interrupt::CheckAccountSignature { address, payload } => {
                            eprintln!(
                                "Receive call requested account signature check for address \
                                 {address}. The payload is {}.",
                                hex::encode(payload)
                            );
                        }
                        v1::Interrupt::QueryAccountKeys { address } => {
                            eprintln!("Receive call requested public keys of account {address}.");
                        }
                    }
                    eprintln!(
                        "Interpreter energy spent is {}",
                        runner.energy.subtract(remaining_energy)
                    )
                }
                v1::ReceiveResult::Trap {
                    remaining_energy,
                    error,
                } => {
                    return Err(error.context(format!(
                        "Execution triggered a runtime error after spending {} interpreter energy.",
                        runner.energy.subtract(remaining_energy)
                    )));
                }
            }
        }
    }
    Ok(())
}

/// Attempt to get a parameter (for either init or receive function) from the
/// supplied paths, signalling failure if this is not possible.
fn get_parameter(
    bin_path: Option<&Path>,
    json_path: Option<&Path>,
    has_contract_schema: bool,
    parameter_schema: Option<&Type>,
) -> anyhow::Result<OwnedParameter> {
    if let Some(param_file) = bin_path {
        Ok(OwnedParameter::new_unchecked(
            fs::read(param_file).context("Could not read parameter-bin file.")?,
        ))
    } else if let Some(param_file) = json_path {
        if !has_contract_schema {
            bail!(
                "No schema found for contract, a schema is required for using --parameter-json. \
                 Either embed the schema in the module or provide it using the `--schema` option."
            )
        } else {
            let parameter_schema = parameter_schema
                .context("Contract schema did not contain a schema for this parameter.")?;

            let file = fs::read(param_file).context("Could not read parameter file.")?;
            let parameter_json: serde_json::Value = serde_json::from_slice(&file)
                .context("Could not parse the JSON in parameter-json file.")?;
            let mut parameter_bytes = Vec::new();
            parameter_schema
                .serial_value_into(&parameter_json, &mut parameter_bytes)
                .context("Could not generate parameter bytes using schema and JSON.")?;
            Ok(OwnedParameter::new_unchecked(parameter_bytes))
        }
    } else {
        Ok(OwnedParameter::empty())
    }
}

/// Attempt to get a schema (either from a smart contract module file or a
/// schema file) from the supplied paths, signalling failure if this is not
/// possible.
fn get_schema(
    module_path: Option<PathBuf>,
    schema_path: Option<PathBuf>,
    wasm_version: Option<WasmVersion>,
) -> anyhow::Result<VersionedModuleSchema> {
    let schema = if let Some(module_path) = module_path {
        let bytes = fs::read(module_path).context("Could not read module file.")?;

        let mut cursor = std::io::Cursor::new(&bytes[..]);
        let (wasm_version, module) = match wasm_version {
            Some(v) => (v, &bytes[..]),
            None => {
                let wasm_version = utils::WasmVersion::read(&mut cursor).context(
                    "Could not read module version from the supplied module file. Supply the \
                     version using `--wasm-version`.",
                )?;
                (wasm_version, &cursor.into_inner()[8..])
            }
        };

        match wasm_version {
            utils::WasmVersion::V0 => utils::get_embedded_schema_v0(module).context(
                "Failed to get schema embedded in the module.\nPlease provide a smart contract \
                 module with an embedded schema.",
            )?,
            utils::WasmVersion::V1 => utils::get_embedded_schema_v1(module).context(
                "Failed to get schema embedded in the module.\nPlease provide a smart contract \
                 module with an embedded schema.",
            )?,
        }
    } else if let Some(schema_path) = schema_path {
        let bytes = fs::read(schema_path).context("Could not read schema file.")?;

        if bytes.starts_with(VERSIONED_SCHEMA_MAGIC_HASH) {
            from_bytes::<VersionedModuleSchema>(&bytes)?
        } else if let Some(wv) = wasm_version {
            match wv {
                WasmVersion::V0 => from_bytes(&bytes).map(VersionedModuleSchema::V0)?,
                WasmVersion::V1 => from_bytes(&bytes).map(VersionedModuleSchema::V1)?,
            }
        } else {
            bail!(
                "Legacy unversioned schema was supplied, but no version was provided. Use \
                 `--wasm-version` to specify the version."
            );
        }
    } else {
        bail!("Exactly one of `--schema` or `--module` must be provided.");
    };
    Ok(schema)
}

/// Write the JSON representation of the schema into files in the `out`
/// directory. The files are named after contract_names, except if a
/// contract_name contains unsuitable characters. Then the counter is used to
/// name the file.
fn write_json_schema(out: &Path, schema: &VersionedModuleSchema) -> anyhow::Result<()> {
    match schema {
        VersionedModuleSchema::V0(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v0(out, contract_name, contract_counter, contract_schema)?
            }
        }
        VersionedModuleSchema::V1(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v1(out, contract_name, contract_counter, contract_schema)?
            }
        }
        VersionedModuleSchema::V2(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v2(out, contract_name, contract_counter, contract_schema)?
            }
        }
        VersionedModuleSchema::V3(module_schema) => {
            for (contract_counter, (contract_name, contract_schema)) in
                module_schema.contracts.iter().enumerate()
            {
                write_json_schema_to_file_v3(out, contract_name, contract_counter, contract_schema)?
            }
        }
    }
    Ok(())
}

fn print_build_info(utils::VersionedBuildInfo::V0(bi): &utils::VersionedBuildInfo) {
    let bold_style = ansi_term::Style::new().bold();
    eprintln!("    - Build image used: {}", bold_style.paint(&bi.image));
    eprintln!(
        "    - Build command used: {}",
        bold_style.paint(bi.build_command.join(" "))
    );
    eprintln!(
        "    - Hash of the archive: {}",
        bold_style.paint(bi.archive_hash.to_string())
    );
    if let Some(link) = &bi.source_link {
        eprintln!("    - Link to source code: {}", bold_style.paint(link));
    } else {
        eprintln!(
            "{}",
            WARNING_STYLE.paint("    - No link to source code embedded.")
        );
    }
}
