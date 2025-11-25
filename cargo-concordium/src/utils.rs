use std::{
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use anyhow::Context;
use base64::engine::general_purpose;
use cargo_metadata::{Metadata, MetadataCommand};

// -------------------- Constants -------------------- //

/// Encode all base64 strings using the standard alphabet and padding.
pub(crate) const ENCODER: base64::engine::GeneralPurpose = general_purpose::STANDARD;

// -------------------- Structs -------------------- //

/// The parameters to pass to CargoBuildParameters
pub(crate) struct CargoBuildParameters<'a> {
    pub(crate) target_dir: &'a Path,
    pub(crate) profile: &'a str,
    pub(crate) locked: bool,
    pub(crate) features: &'a [&'a str],
    pub(crate) package: Option<&'a str>,
    pub(crate) extra_args: &'a [String],
}

impl CargoBuildParameters<'_> {
    /// Get the cargo arguments as a list of strings, i.e. `Vec!["cargo", "build", ...]`.
    pub(crate) fn get_cargo_cmd_as_strings(&self) -> anyhow::Result<Vec<String>> {
        let mut args = vec![
            "cargo",
            "build",
            "--target",
            "wasm32-unknown-unknown",
            "--profile",
            self.profile,
            "--target-dir",
            self.target_dir
                .to_str()
                .context("target_dir is not valid UTF-8")?,
        ];
        if let Some(pkg) = self.package {
            args.push("--package");
            args.push(pkg);
        }
        if self.locked {
            args.push("--locked");
        }
        args.extend(self.extra_args.iter().map(|x| x.as_str()));

        let mut args: Vec<_> = args.into_iter().map(|x| x.to_string()).collect();
        if !self.features.is_empty() {
            args.push("--features".to_string());
            args.push(self.features.join(","));
        }

        Ok(args)
    }

    /// Run the `cargo build` command with the specified parameters.
    pub(crate) fn run_cargo_cmd(&self) -> anyhow::Result<std::process::Output> {
        let mut args = self.get_cargo_cmd_as_strings()?;
        let executable = args.remove(0); // "cargo"
        let mut cmd = Command::new(&executable);
        cmd.args(&args);

        let output = cmd
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .output()?;

        Ok(output)
    }
}

// -------------------- Export Functions -------------------- //

/// Convert a string to snake case by replacing `-` with `_`.
///
/// Used for converting crate names, which often contain `-`, to module names,
/// which cannot have `-`.
pub(crate) fn to_snake_case(string: &str) -> String {
    string.replace('-', "_")
}

/// Get the crate's metadata either by looking for the `Cargo.toml` file at the
/// `--manifest-path` or at the ancestors of the current directory.
pub(crate) fn get_crate_metadata(cargo_args: &[String]) -> anyhow::Result<Metadata> {
    let mut cmd = MetadataCommand::new();
    let mut args = cargo_args
        .iter()
        .skip_while(|val| !val.starts_with("--manifest-path"));

    match args.next() {
        Some(p) if *p == "--manifest-path" => {
            // If a `--manifest-path` is provided, look for the `Cargo.toml` file there.
            cmd.manifest_path(args.next().context(
                "The argument '--manifest-path <manifest-path>' requires a value but none was \
                 supplied.",
            )?);
        }
        Some(p) => {
            // If a `--manifest-path` is provided, look for the `Cargo.toml` file there.
            cmd.manifest_path(
                p.strip_prefix("--manifest-path=")
                    .context("Incorrect `--manifest-path` flag.")?,
            );
        }
        None => {
            // If NO `--manifest-path` is provided, look for the `Cargo.toml`
            // file at the ancestors of the current directory (default
            // behavior).
        }
    };

    let metadata = cmd.exec().context("Could not access cargo metadata.")?;
    Ok(metadata)
}

/// Checks if the `wasm32-unknown-unknown` target is installed, and returns an
/// error if not.
pub(crate) fn check_wasm_target() -> anyhow::Result<()> {
    // Try to check with rustup, which should be reliable, but it may not be
    // installed. If not, check for a folder named
    // `$sysroot/lib/rustlib/wasm32-unknown-unknown`.
    let target_installed = if let Ok(rustup_output) = Command::new("rustup")
        .args(["target", "list", "--installed"])
        .output()
    {
        str::from_utf8(&rustup_output.stdout)?
            .lines()
            .any(|l| l == "wasm32-unknown-unknown")
    } else {
        let rustc_output = Command::new("rustc")
            .args(["--print", "sysroot"])
            .output()
            .context("Unable to run `rustc`")?;
        let mut target_path = PathBuf::from(str::from_utf8(&rustc_output.stdout)?.trim_end());
        target_path.push("lib/rustlib/wasm32-unknown-unknown");
        fs::metadata(target_path).is_ok_and(|m| m.is_dir())
    };

    anyhow::ensure!(
        target_installed,
        "Cannot find the `wasm32-unknown-unknown` target. Try installing it by running `rustup \
         target add wasm32-unknown-unknown`."
    );
    Ok(())
}
