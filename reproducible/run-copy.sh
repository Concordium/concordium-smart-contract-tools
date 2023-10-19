#!/usr/bin/env bash

set -e

export BUILD_DIR=$2
export ARCHIVE=$1

mkdir -p /b
cd /b
tar xf $ARCHIVE
shift 2
$@
mv $BUILD_DIR/*.wasm /artifacts/out.wasm
