#!/usr/bin/env bash

# Script used to test the verifiable build, including the builder image.

set -e

BASE_IMAGE="$1"
if [ -z "$BASE_IMAGE" ]; then
    echo "Error: expected the verifiable build base image as first argument" >&2
    exit 1
fi

cd "$(dirname "${BASH_SOURCE[0]}")"

docker build -f build.Dockerfile --build-arg source_image="$BASE_IMAGE" -t "concordium/verifiable-sc-wasm32v1-test" .

cd example-contract

cargo run --manifest-path ../../cargo-concordium/Cargo.toml -- concordium build --verifiable --verifiable-image "concordium/verifiable-sc-wasm32v1-test"
cargo run --manifest-path ../../cargo-concordium/Cargo.toml -- concordium verify-build --module ./concordium-out/module.wasm.v1 --source ./concordium-out/module.wasm.v1.tar
