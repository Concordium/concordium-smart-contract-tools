use std::process::{Command, Stdio};

use ansi_term::{Color, Style};
use anyhow::Context;
use concordium_smart_contract_engine::{
    utils::{NoDuplicateImport, ReportError, TestHost},
    v1::{trie, InstanceState},
};
use concordium_wasm::{
    artifact::{Artifact, ArtifactNamedImport, CompiledFunction},
    types::Name,
    validate::ValidationConfig,
};
use rand::{rngs::SmallRng, thread_rng, Rng, SeedableRng};
use rayon::prelude::*;

use crate::{
    handle_build,
    utils::{check_wasm_target, get_crate_metadata, to_snake_case, CargoBuildParameters},
    BuildOptions,
};

// -------------------- Helper Functions -------------------- //

/// Runs a single unit test and prints out the result, returns an option so that
/// succesful cases can be filtered
fn get_test_result(
    name: &Name,
    seed: u64,
    artifact: &Artifact<ArtifactNamedImport, CompiledFunction>,
    enable_debug: bool,
) -> Option<()> {
    let test_name = name.as_ref().strip_prefix("concordium_test ")?;

    // create a `TestHost` instance for each test with the usage flag set to `false`
    let mut initial_state = trie::MutableState::initial_state();
    let mut loader = trie::Loader::new(Vec::new());
    let mut test_host = {
        let inner = initial_state.get_inner(&mut loader);
        let state = InstanceState::new(loader, inner);
        TestHost::new(SmallRng::seed_from_u64(seed), state)
    };

    let test_result = artifact.run(&mut test_host, name, &[]).err().map(|msg| {
        msg.downcast_ref::<ReportError>()
            .cloned()
            .unwrap_or_else(|| ReportError::Other {
                msg: msg.to_string(),
            })
    });

    let mut print_vec = Vec::new();
    match test_result {
        Some(ref err) => {
            print_vec.push(format!(
                "  - {} ... {}",
                test_name,
                Color::Red.bold().paint("FAILED")
            ));
            print_vec.push(format!(
                "    {} ... {}",
                Color::Red.bold().paint("Error"),
                Style::new().italic().paint(err.to_string())
            ));
            if test_host.rng_used {
                print_vec.push(format!(
                    "    {}: {}",
                    Style::new().bold().paint("Seed"),
                    Style::new().bold().paint(seed.to_string())
                ));
            };
        }
        None => {
            print_vec.push(format!(
                "  - {} ... {}",
                test_name,
                Color::Green.bold().paint("ok")
            ));
        }
    }
    if enable_debug && !test_host.debug_events.is_empty() {
        print_vec.push("    Emitted debug events.".to_string());
        for event in test_host.debug_events {
            print_vec.push(format!("    {event}"));
        }
    }
    eprintln!("{}", print_vec.join("\n"));

    test_result.map(|_| ())
}

// -------------------- Export Functions -------------------- //

/// Build the smart contract module and run integration tests.
///
/// All test targets are tested if `test_targets` is empty.
/// Otherwise, it is only the listed targets that are tested.
pub(crate) fn build_and_run_integration_tests(
    build_options: BuildOptions,
    test_targets: Vec<String>,
) -> anyhow::Result<()> {
    let cargo_args = build_options.cargo_args.clone();
    let allow_debug = build_options.allow_debug;

    // Build the module in the same way as `cargo concordium build`, except that
    // schema information shouldn't be printed.
    let build_info = handle_build(build_options, false)?;

    let mut cargo_test_args = vec!["test"];

    let test_targets: Vec<String> = if test_targets.is_empty() {
        // Find all the integration test targets and include them in the test.
        build_info
            .metadata
            .root_package()
            .context("Could not determine package.")?
            .targets
            .iter()
            .filter_map(|t| {
                if t.kind == ["test"] {
                    Some(t.name.clone())
                } else {
                    None
                }
            })
            .collect()
    } else {
        // Use only the specified test targets.
        test_targets
    };

    // Add the test targets explicitly.
    // This is done to avoid running the unit tests again, which `cargo test` does
    // by default. The unit tests are run in wasm explicitly by another
    // function.
    let test_targets_with_flags = test_targets.iter().flat_map(|target| ["--test", target]);
    cargo_test_args.extend(test_targets_with_flags);

    eprintln!(
        "\n{}",
        Color::Green.bold().paint("Running integration tests ...")
    );

    let mut command = Command::new("cargo");
    command.args(cargo_test_args);
    if allow_debug {
        command.args(["--features", "concordium-std/debug"]);
    }
    command.args(&cargo_args);
    // when allowing debug output, we make sure that test output is not captured.
    if allow_debug {
        // check if the user has already supplied extra test flags
        let (test_args, show_output) = cargo_args.iter().fold((false, false), |(ta, so), arg| {
            if arg == "--" {
                (true, so)
            } else if arg == "--show-output" || arg == "--nocapture" {
                (ta, true)
            } else {
                (ta, so)
            }
        });
        // if the extra test args separator is added we should not add it again.
        if !test_args {
            command.arg("--");
        }
        // if the user has already supplied either the --nocapture or --show-output
        // flags we do nothing, since output will be displayed. Otherwise we
        // tell the test harness to show output.
        if !show_output {
            command.arg("--show-output");
        }

        command.env("CARGO_CONCORDIUM_TEST_ALLOW_DEBUG", "1");
    }
    // This enviroment variable needs to match the
    // `CONTRACT_MODULE_OUTPUT_PATH_ENV_VAR` constant in the `contract-testing`
    // crate.
    command.env(
        "CARGO_CONCORDIUM_TEST_MODULE_OUTPUT_PATH",
        build_info.out_filename,
    );
    // Output what we are doing so that it is easier to debug if the user
    // has their own features or options.
    eprint!("{} cargo", Color::Green.bold().paint("Running"),);
    for arg in command.get_args() {
        eprint!(" {}", arg.to_string_lossy());
    }
    eprintln!();

    let result = command
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .output()
        .context("Failed running integration tests.")?;

    anyhow::ensure!(
        result.status.success(),
        Color::Red
            .bold()
            .paint("One or more integration tests failed.")
    );
    Ok(())
}

/// Build tests and run them. If errors occur in building the tests, or there
/// are runtime exceptions that are not expected then this function returns
/// Err(...).
///
/// Otherwise a boolean is returned, signifying whether the tests succeeded or
/// failed.
///
/// The `seed` argument allows for providing the seed to instantiate a random
/// number generator. If `None` is given, a random seed will be sampled.
pub(crate) fn build_and_run_wasm_test(
    enable_debug: bool,
    profile: &str,
    extra_args: &[String],
    seed: Option<u64>,
    skip_wasm_opt: bool,
) -> anyhow::Result<bool> {
    // Check that the wasm target is installed
    check_wasm_target()?;

    let metadata = get_crate_metadata(extra_args)?;

    let package = metadata
        .root_package()
        .context("Unable to determine package.")?;

    let target_dir = metadata
        .target_directory
        .clone()
        .into_std_path_buf()
        .join("concordium");

    let cargo_cmd = CargoBuildParameters {
        target_dir: &target_dir,
        profile,
        locked: false,
        package: None,
        features: if enable_debug {
            &["concordium-std/wasm-test", "concordium-std/debug"]
        } else {
            &["concordium-std/wasm-test"]
        },
        extra_args,
    };

    // Output what we are doing so that it is easier to debug if the user
    // has their own features or options.
    eprint!(
        "{} cargo {}",
        Color::Green.bold().paint("Running"),
        cargo_cmd.get_cargo_cmd_as_strings()?.join(" ")
    );
    if extra_args.is_empty() {
        // This branch is just to avoid the extra trailing space in the case when
        // there are no extra arguments.
        eprintln!()
    } else {
        eprintln!(" {}", extra_args.join(" "));
    }
    let result = cargo_cmd
        .run_cargo_cmd()
        .context("Failed building contract tests.")?;
    // Make sure that compilation succeeded before proceeding.
    anyhow::ensure!(
        result.status.success(),
        Color::Red.bold().paint("Could not build contract tests.")
    );

    // If we compiled successfully the artifact is in the place listed below.
    // So we load it, and try to run it.s
    let file_path = target_dir
        .join("wasm32-unknown-unknown")
        .join("release")
        .join(format!("{}.wasm", to_snake_case(package.name.as_str())));
    if !skip_wasm_opt {
        wasm_opt::OptimizationOptions::new_opt_level_0()
            .run(&file_path, &file_path)
            .context("Failed running wasm_opt")?;
    }

    let wasm = std::fs::read(file_path).context("Failed reading contract test output artifact.")?;

    eprintln!("\n{}", Color::Green.bold().paint("Running unit tests ..."));

    let seed_u64 = match seed {
        Some(s) => s,
        None => {
            // Since the seed was not provided, we use system randomness to sample a random
            // one and use is to seed a deterministic RNG. We store the seed so
            // we may report it to the user in case of test failure.
            thread_rng().gen()
        }
    };

    let artifact = concordium_wasm::utils::instantiate::<ArtifactNamedImport, _>(
        ValidationConfig::V1,
        &NoDuplicateImport,
        &wasm,
    )?
    .artifact;
    let artifact_keys: Vec<_> = artifact.export.keys().collect();

    let num_failed = artifact_keys
        .into_par_iter()
        .filter_map(|name| get_test_result(name, seed_u64, &artifact, enable_debug))
        .count();

    if num_failed == 0 {
        eprintln!("Unit test result: {}", Color::Green.bold().paint("ok"));
        Ok(true)
    } else {
        eprintln!("Unit test result: {}", Color::Red.bold().paint("FAILED"));
        Ok(false)
    }
}
