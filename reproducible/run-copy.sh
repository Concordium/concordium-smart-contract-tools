#!/usr/bin/env bash

set -e

export FILE=$2
export ARCHIVE=$1

mkdir /build
cd /build
tar xf $ARCHIVE
shift 2
$@
mv $FILE /artifacts/
