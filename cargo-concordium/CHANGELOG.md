# Changelog

## Unreleased

- Non-existing directories in paths provided to the following arguments for when running `cargo concordium build` will now be created instead of causing an error: --out`, `--schema-out`, `--schema-json-out`, `--schema-base64-out`.

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
