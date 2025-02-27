# Changelog

## 4.2.0

- Updated concordium-base dependency

## 4.1.0

- Add support for `--skip-wasm-opt` flag opting out of the `wasm-opt` step.
- Optimize build artifacts using `wasm-opt` optimizing for size. Besides optimizations this also acts as a workaround for the `Unexpected byte 0x80. Expected 0x00` error produced when building smart contracts using a rust compiler `1.82` or newer.

## 4.0.0

- Use smart contract v1 cost configuration when simulating locally (the reduce execution cost introduced as part of Concordium Protocol Version 7)
- Added a `--tag <RELEASE-TAG>` option to `cargo concordium init` to allow specifying the release tag of the templates.
  Defaults to `releases/templates/latest`.
- When running integration tests the module output path is now exposed to the
  tests via the `CARGO_CONCORDIUM_TEST_MODULE_OUTPUT_PATH` environment variable.
- Add the default build output (`--out <PATH>`) path `concordium-out/module.wasm.v1`.
- Change `--out` flag being optional when using the `--verifiable` flag.
- Change `--verifiable` flag to use the default output path if the `--out` flag is not set.
- Embed the schema in the Wasm module by default and can be disabled using the `--no-schema-embed` flag. 
  The `--schema-embed` flag (short `-e`) is now deprecated.
- Fixed long error message when the `wasm32-unknown-unknown` target is not installed.

## 3.3.0

- Bump minimum Rust version to 1.73.
- Support state-related host functions when running _unit-tests_ with `cargo concordium test`. Each test-case is provided with an empty temporary key-value store.
- Support interrupt events to be introduced in protocol version 7.

## 3.2.0

- Fix a bug so that a non-zero status code is now returned by `cargo concordium test` if tests fail.
- Add support for running contracts while collecting debug output. Contracts can
  be built with debugging support enabled by using the `--allow-debug` flag that
  is supported both by `cargo concordium build` and `cargo concordium test`.

  When this flag is enabled in tests debug output is emitted at the end of the
  test. Additionally, when running tests `cargo-concordium` will set
  `CARGO_CONCORDIUM_TEST_ALLOW_DEBUG` environment variable for all the tests.

## 3.1.4

- Support crate names with uppercase letters.
- Warn about non-verifiable builds.

## 3.1.3

- Fix a bug where a missing target directory would fail if a reproducible build
  was requested without a schema.

## 3.1.2

- Make sure to ignore the target directory also on Windows.

## 3.1.1

- Do not include file modification times in the tar archive produced as part of
  a verifiable build.

## 3.1.0

- Support verifiable/reproducible builds.

## 3.0.0

- Add support for `--manifest-path` flag.
- Add `schema-template` command to print the template of a given schema to a file or the console.
- Add `--schema-template-out` option to `cargo concordium build` to optionally output the schema template to a file or the console.
- Make `cargo-concordium` compatible with protocol 6 semantics on the chain.
  In particular cargo-concordium now does validation according to protocol 6 rules, allowing sign extension instructions, disallowing globals in initializers of data and element segments, and allows host functions for checking account signatures, and retrieving account keys.

## 2.9.0

- Make `cargo concordium test` compile your smart contract module and run integration on it, if available.
  - This makes it easier to use the `concordium-smart-contract-testing` library for integration tests, without the risk of running the tests against a stale Wasm module.
  - The `test` command is now essentially the same as `cargo concordium build` followed by the previous `cargo concordium test` and `cargo test --test '*'`.
    This behaviour ensures that unit tests run in Wasm and the integration tests run with the native target, but using the compiled Wasm module.
  - All the build options from `cargo concordium build` now also exist for `cargo concordium test`.
    - This allows you to run tests against the exact module you will also deploy on the chain.
- When JSON parameters included in `cargo concordium run` cannot be serialized, the error returned now includes trace information, which makes it easier to identify the cause of the error.

## 2.8.1

- Add padding to base64 output to work around parsers that require it.

## 2.8.0

- Non-existing directories in paths provided to the following arguments for when running `cargo concordium build` will now be created instead of causing an error: `--out`, `--schema-out`, `--schema-json-out`, `--schema-base64-out`.
  Likewise for the `--out-bin` and `--out-json` arguments provided to `cargo concordium run init` and `cargo concordium run update`.
- Fix a bug where `cargo concordium` was unable to determine the smart contract package if the package was part of a Cargo workspace.

## 2.7.1

- Support calling `cargo concordium build` and `cargo concordium test` from a project subdirectory.
- Fix a bug in schema parsing in `cargo concordium run` commands. Schemas with
  negative integers did not allow for supplying negative integers.

## 2.7.0

- Add `schema-base64` command to convert a given schema to base64 format.
- Add `--schema-base64-out` option to `cargo concordium build` to optionally
  output the schema in base64 format.

## 2.6.0

- Add `schema-json` command to get schemas for individual entrypoints from the
  binary schema file.
- Add `--schema-json-out` option to `cargo concordium build` to optionally
  output the schema in JSON format.

## 2.5.0

- Add support for sampling random numbers for randomized testing with `cargo concordium test`.
- Add support for providing a seed to initialize a random generator to
  `cargo-concordium`. The generator can be used for randomized testing.
  Command format: `cargo concordium test --seed 1234567890`. The provided seed value
  is a `u64` number. If the seed is not provided, a random one will be sampled.

## 2.4.0

- `cargo-concordium` now checks that the user input from the output flags consists of a path and a file name.
- Add support for V3 schemas that include support for event schemas. This enables
  `cargo-concordium` to build and interact with smart contracts using
  `concordium-std` version 4.1. `Cargo-concordium` now always generates V3 schemas.

## 2.3.0

- Support building and testing contracts using new protocol 5 features;
  upgradability and chain queries.
- Support for relaxed smart contract resource restrictions in `cargo concordium run`.
- `cargo concordium build` now checks contracts with respect to protocol version
  5 semantics.

## 2.2.0

- Introduce the `init` subcommand that can initialize a new project and
  use contract templates to set up an initial project.

## 2.1.0

- Add support for V2 schemas that include support for error values. This enables
  `cargo-concordium` to build and interact with smart contracts using
  `concordium-std` version 4.

## 2.0.2

- Support schema types for LEB128 and byte arrays.
- Support schema modules which includes version information.
- Add support for v2 schemas.
  - Use v2 schemas when building v1 contracts.

## 2.0.0

- Add support for V1 contract builds, testing, and execution.
- The output of `cargo concordium build` is now versioned.
- Support contracts written with Rust edition 2021.

## 1.1.1

- Clarify that energy units used by `cargo-concordium` are "interpreter energy"
  and not the same as NRG.
- Allow the user to only specify the necessary fields in the JSON context files
  - Also allow the `--context` parameter to be omitted, for when no context is needed
- Correct and improve error message for incorrect array length during contract
  simulation:
  show expected and actual length rather than mislabelled actual length.
