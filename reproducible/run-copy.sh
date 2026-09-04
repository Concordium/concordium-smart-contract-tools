#!/usr/bin/env bash

# This script is used as an entrypoint by cargo-concordium and the corresponding
# docker image.
# The script takes two arguments for itself `archive` and `build_dir` and
# a command to execute. It then
#
# - installs requested Rust toolchain (decided via cargo +1.xx.x)
# - copies the tar archive into the running container
# - executes the supplied command
# - moves a `wasm` file from `build_dir` into /artifacts/out.wasm

set -e

export BUILD_DIR=$2
export ARCHIVE=$1

# The third argument must be the literal `cargo` and the fourth argument is
# expected to be the toolchain specifier in the form `+1.xx.x`.
if [ "$3" != "cargo" ]; then
    echo "Error: expected third argument to be 'cargo', got '$3'" >&2
    exit 1
fi
TOOLCHAIN="${4#+}"
if [ "$TOOLCHAIN" = "$4" ]; then
    echo "Error: expected fourth argument to be a toolchain specifier of the form '+1.xx.x', got '$4'" >&2
    exit 1
fi

# Install required Rust toolchain
rustup toolchain install --target wasm32v1-none "$TOOLCHAIN"

# Make build directory and unpack source archive
TMP=$(mktemp -d)
mkdir -p /b
cd /b
tar --strip-components=1 -xf "$ARCHIVE"

# Execute the supplied command which consists of everything apart from the first
# 2 arguments to the `run-copy` script.
shift 2
"$@"

# Run wasm-opt and copy the wasm file to /artifacts/out.wasm
mv "$BUILD_DIR"/*.wasm "$TMP"/out.wasm
wasm-opt -O0 -o /artifacts/out.wasm "$TMP"/out.wasm
