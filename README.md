
# Concordium Smart Contract Tools

This repository contains tools to support smart contracts on and off-chain.

- [cargo-concordium](./cargo-concordium) which is a small tool for developing smart contracts. It uses the API exposed in `wasm-chain-integration` to execute smart contracts directly and can initialize and update smart contracts, in a desired state. See the `--help` option of the tool for details on how to invoke it.
   It can also be used to build contracts embedded with schemas (see section about [contract schemas](#contract-schema)).


# Contributing

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.0-4baaaa.svg)](https://github.com/Concordium/.github/blob/main/.github/CODE_OF_CONDUCT.md)

This repository's CI automatically checks formatting and common problems in rust.
Changes to any of the packages must be such that
- ```cargo clippy --all``` produces no warnings
- ```rust fmt``` makes no changes.

Everything in this repository should build with stable rust at the moment (at least version 1.44 and up), however the fmt tool must be from a nightly release since some of the configuration options are not stable. One way to run the `fmt` tool is
```
 cargo +nightly-2022-06-09 fmt
```
(the exact version used by the CI can be found in [.github/workflows/ci.yaml](.github/workflows/ci.yaml) file).
You will need to have a recent enough nightly version installed, which can be done via
```
rustup toolchain install nightly-2022-06-09
```
or similar, using the [rustup](https://rustup.rs/) tool. See the documentation of the tool for more details.

In order to contribute you should make a merge request and not push directly to master.

