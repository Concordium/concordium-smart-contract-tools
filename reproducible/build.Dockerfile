# A builder for images for verifiable/reproducible builds.
# The `source_image` is meant to be a published Rust image, such as rust:1.70.
#
# This image only adds a script `run-copy.sh` that is used by cargo-concordium
# to copy data in and out of the container. The image also adds
# wasm32-unknown-unknown target.

FROM rust:1.85 AS build

RUN rustup target add wasm32-unknown-unknown

RUN mkdir /b

RUN cargo install wasm-opt --locked --version 0.116.1

COPY run-copy.sh /run-copy.sh
