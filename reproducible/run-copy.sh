#!/usr/bin/env bash

set -e

export FILE=$2
export ARCHIVE=$1

mkdir -p /b
cd /b
tar xf $ARCHIVE
shift 2
$@
mv $FILE /artifacts/
