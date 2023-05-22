//! The Cargo Concordium Library.
//!
//! Provides methods for compiling smart contracts to deployable Wasm modules.
//! The library primarily exists to allow the [Concordium Smart Contract Testing](https://crates.io/crates/concordium-smart-contract-testing)
//! library to automatically (re)build smart contract modules while testing.
pub mod build;
