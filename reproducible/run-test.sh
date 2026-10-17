#!/usr/bin/env bash

# Script used to test the verifiable build image. The script builds and verifies the example smart contract
# using a verifiable build image. It takes the verifiable build image as its single argument.

set -e

IMAGE="$1"
if [ -z "$IMAGE" ]; then
    echo "Error: expected the verifiable build image as first argument" >&2
    exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")"

cd example-contract

cargo run --manifest-path ../../cargo-concordium/Cargo.toml -- concordium build --verifiable --verifiable-image "$IMAGE"
cargo run --manifest-path ../../cargo-concordium/Cargo.toml -- concordium verify-build --module ./concordium-out/module.wasm.v1 --source ./concordium-out/module.wasm.v1.tar
