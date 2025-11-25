use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use anyhow::Context;
use concordium_base::smart_contracts::WasmModule;
use concordium_smart_contract_engine::utils::{
    get_build_info_from_skeleton, BuildInfo, VersionedBuildInfo,
};
use concordium_wasm::{output::Output, parse::parse_skeleton, utils::strip};
use sha2::Digest;

use crate::utils::CargoBuildParameters;

// -------------------- Structs -------------------- //

/// Result of [`create_archive`]. It contains the actual archive with a
/// list of files that were included.
pub(crate) struct TarArchiveData {
    /// The archive itself.
    pub(crate) tar_archive: Vec<u8>,
    /// The list of files in the archive, the paths are relative to the root of
    /// the archive.
    pub(crate) archived_files: Vec<PathBuf>,
}

pub(crate) struct ContainerBuildOutput {
    /// The output Wasm file containing the unprocessed contract module.
    pub(crate) output_wasm: Vec<u8>,
    /// Information about the build so that it can be reproduced.
    pub(crate) build_info: concordium_smart_contract_engine::utils::VersionedBuildInfo,
    /// The sources that were built, archived as a tar file.
    pub(crate) tar_archive: TarArchiveData,
}

/// Package data for building inside a container.
pub(crate) struct PackageData<'a> {
    /// The target directory of the package that is being
    /// built. This is used to exclude it from bundling.
    pub(crate) package_target_dir: &'a Path,
    /// The root of the package to build.
    pub(crate) package_root_path: &'a Path,
    /// The package-name-version pair to mimics the behaviour or cargo package.
    /// The paths in the tar archive are
    pub(crate) package_version_string: &'a str,
}

// -------------------- Helper Functions -------------------- //

/// Make a tarball of the package at the `package_root_path` location.
/// This takes an additional `omit_files` list that is the list of files that
/// will not be included in the archive.
/// All those paths are expected to be relative to the same root as the
/// `package_root_path`.
fn create_archive(
    package_root_path: &Path,
    package_version_string: &str,
    omit_files: &[&Path],
) -> anyhow::Result<TarArchiveData> {
    let in_package_root_dir = std::path::Path::new(package_version_string);
    let mut tar = tar::Builder::new(Vec::new());
    tar.mode(tar::HeaderMode::Deterministic);
    // Ignore files that are ignored by Git.
    let files = ignore::WalkBuilder::new(package_root_path)
        .git_global(true)
        .git_ignore(true)
        .parents(true)
        .hidden(true)
        .sort_by_file_path(std::cmp::Ord::cmp)
        .build();
    let mut lock_file_found = false;
    let mut archived_files = Vec::new();
    for file in files {
        let file = file?;
        let file_path = file.path();
        if file_path == package_root_path || omit_files.iter().any(|f| file_path.starts_with(f)) {
            // We don't want to add the root path since we are adding all
            // relative paths under it.
            continue;
        }
        let relative_path = file.path().strip_prefix(package_root_path)?;
        if relative_path == std::path::Path::new("Cargo.lock") {
            lock_file_found = true;
        }
        archived_files.push(relative_path.to_path_buf());
        // We put the files in the tar archive under the `in_package_root_dir`
        // directory. This then matches the behaviour of cargo package.
        tar.append_path_with_name(file.path(), in_package_root_dir.join(relative_path))?;
    }
    let cargo_lock_exists = package_root_path.join("Cargo.lock").is_file();
    if !lock_file_found && cargo_lock_exists {
        anyhow::bail!(
            "Unable to proceed with a verifiable build. Cargo.lock seem to be included in \
             .gitignore."
        );
    }
    anyhow::ensure!(
        lock_file_found,
        "Unable to proceed with a verifiable build. A Cargo.lock file must be available and up to \
         date. Run `cargo check` to generate it."
    );
    Ok(TarArchiveData {
        tar_archive: tar.into_inner()?,
        archived_files,
    })
}

// -------------------- Export Functions -------------------- //

/// Build an archive and return the Wasm source that was built.
pub(crate) fn build_archive(
    image: &str,
    tar_contents: &[u8],
    container_runtime: &str,
    build_command: &[String],
) -> anyhow::Result<Vec<u8>> {
    let artifact_dir =
        tempfile::tempdir().context("Unable to create temporary build directory.")?;
    // Construct the mapping of the host's build directory
    // into the container's artifacts directory. That is where the
    // wasm module will be published.
    let mapping = {
        let mut mapping = artifact_dir.path().as_os_str().to_os_string();
        mapping.push(":/artifacts:Z");
        mapping
    };

    let tar_file_name = "archive.tar";

    std::fs::write(artifact_dir.path().join(tar_file_name), tar_contents)
        .context("Unable to write archive.")?;

    let container_output_dir = "/b/t/wasm32-unknown-unknown/release";
    let mut cmd = Command::new(container_runtime);

    cmd.arg("run")
        .arg("-v")
        .arg(mapping.as_os_str())
        .arg("--rm")
        .args(["--workdir", "/b"])
        .arg(image)
        .arg("/run-copy.sh")
        .arg(format!("/artifacts/{tar_file_name}"))
        .arg(container_output_dir)
        .args(build_command);

    let result = cmd
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .output()
        .context("Could not use cargo build.")?;

    if !result.status.success() {
        anyhow::bail!("Compilation failed.")
    }

    let filename = artifact_dir.path().join("out.wasm");
    let wasm = std::fs::read(filename).context("Unable to read generated Wasm artifact.")?;
    Ok(wasm)
}

/// Build the provided directory in the container. Return the built module and
/// tar archive. The arguments are
///
/// - `image`, the docker image that will be used to build.
/// - `package_target_dir`,
/// - `package_root_path`,
/// - `extra_args`, the extra arguments to pass to the cargo build command.
/// - `container_runtime`, the container runtime to use, e.g. `docker` or
///   `podman`
/// - `out_path`, - the path to the out file for the wasm artifact. This should
///   be a fully expanded, canonical path.
/// - `tar_path`, - the path to the tar archive. This should be a fully
///   expanded, canonical path.
pub(crate) fn build_in_container(
    image: String,
    PackageData {
        package_target_dir,
        package_root_path,
        package_version_string,
    }: PackageData,
    extra_args: &[String],
    container_runtime: &str,
    out_path: &Path,
    tar_path: &Path,
    source_link: Option<String>,
) -> anyhow::Result<ContainerBuildOutput> {
    let tar_archive = create_archive(
        package_root_path,
        package_version_string,
        &[out_path, tar_path, package_target_dir],
    )?;

    let archive_hash = sha2::Sha256::digest(&tar_archive.tar_archive);

    let build_command = CargoBuildParameters {
        target_dir: Path::new("/b/t"),
        profile: "release",
        locked: true,
        features: &[],
        package: None,
        extra_args,
    }
    .get_cargo_cmd_as_strings()?;

    // If both the potential output files exist check if there is no point
    // rebuilding.
    let mut output_wasm = Vec::new();
    let mut built_already = false;

    // Check if we have to rebuild.
    'skip: {
        if out_path.try_exists()? && tar_path.try_exists()? {
            let stored_tar_archive = std::fs::read(tar_path).context("Unable to read archive")?;
            if tar_archive.tar_archive != stored_tar_archive {
                break 'skip;
            }
            let stored_source =
                WasmModule::from_file(out_path).context("Unable to read output file.")?;
            let mut skeleton = parse_skeleton(stored_source.source.as_ref())
                .context("Unable to parse stored output file.")?;
            let Ok(build_info) = get_build_info_from_skeleton(&skeleton) else {
                break 'skip;
            };
            let VersionedBuildInfo::V0(build_info) = build_info;
            // If the sources are the same, and those sources were built with the same
            // command in the same image then we don't need to rebuild.
            if build_info.archive_hash.as_ref() == &archive_hash[..]
                && build_info.build_command == build_command
                && build_info.image == image
            {
                strip(&mut skeleton);
                skeleton.output(&mut output_wasm)?;
                built_already = true;
            }
        }
    }

    if !built_already {
        output_wasm = build_archive(
            &image,
            &tar_archive.tar_archive,
            container_runtime,
            &build_command,
        )
        .context("Unable to build.")?;
    }

    let build_info = VersionedBuildInfo::V0(BuildInfo {
        archive_hash: <[u8; 32]>::from(archive_hash).into(),
        source_link,
        image,
        build_command,
    });
    Ok(ContainerBuildOutput {
        output_wasm,
        build_info,
        tar_archive,
    })
}
