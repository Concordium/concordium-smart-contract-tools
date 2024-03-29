# A builder for images for verifiable/reproducible builds.
# The `source_image` is meant to be a published Rust image, such as rust:1.70.
#
# This image only adds a script `run-copy.sh` that is used by cargo-concordium
# to copy data in and out of the container. The image also adds
# wasm32-unknown-unknown target.

ARG source_image
FROM ${source_image} AS build

RUN rustup target add wasm32-unknown-unknown

RUN mkdir /b

COPY run-copy.sh /run-copy.sh
