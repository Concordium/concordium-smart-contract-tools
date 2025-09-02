# Concordium Smart Contract Tools

This repository contains tools to support smart contracts on and off-chain.

[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.0-4baaaa.svg)](https://github.com/Concordium/.github/blob/main/.github/CODE_OF_CONDUCT.md)

- [cargo-concordium](./cargo-concordium) which is a small tool for developing smart contracts. It uses the API exposed in `wasm-chain-integration` to execute smart contracts directly and can initialize and update smart contracts, in a desired state. See the `--help` option of the tool for details on how to invoke it.
   It can also be used to build contracts embedded with schemas (see section about [contract schemas](#contract-schema)).
- [vscode-smart-contracts](./vscode-smart-contracts/) A [VS Code](https://code.visualstudio.com/) extension providing snippets and the functionality of `cargo-concordium` as commands inside the editor.

# Contributing

This repository's CI automatically checks formatting and common problems in rust.
Changes to any of the packages must be such that
- ```cargo clippy --all``` produces no warnings
- ```cargo fmt``` makes no changes.

Everything in this repository should build with stable rust at the moment (at least version 1.44 and up).

In order to contribute you should make a merge request and not push directly to master.

