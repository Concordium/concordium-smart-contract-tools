# A builder for images for verifiable/reproducible builds.
# The `source_image` is meant to be a published Rust image, such as rust:1.90.
#
# This image adds a script `run-copy.sh` that is used by cargo-concordium
# to copy data in and out of the container. And the wasm-opt tool.

ARG source_image
FROM ${source_image} AS build

RUN mkdir /b

RUN cargo install wasm-opt --locked --version 0.116.1

COPY run-copy.sh /run-copy.sh
