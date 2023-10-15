ARG build_image
FROM ${build_image} AS build

RUN rustup target add wasm32-unknown-unknown

RUN mkdir /build

COPY run-copy.sh /run-copy.sh
