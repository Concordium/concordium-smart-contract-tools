#!/usr/bin/env bash

# This script is used as an entrypoint by cargo-concordium and the corresponding
# docker image.
# The script takes two arguments for itself `archive` and `build_dir` and
# a command to execute. It then
#
# - copies the tar archive into the running container
# - executes the supplied command
# - moves a `wasm` file from `build_dir` into /artifacts/out.wasm

set -e

export BUILD_DIR=$2
export ARCHIVE=$1

mkdir -p /b
cd /b
tar xf $ARCHIVE
shift 2
# execute the supplied command which consists of everything apart from the first
# 2 arguments to the `run-copy` script.
$@
mv $BUILD_DIR/*.wasm /artifacts/out.wasm
