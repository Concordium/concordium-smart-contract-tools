# Cargo Concordium

`cargo-concordium` is a tool for building and testing smart contracts on the Concordium blockchain.

See [developer documentation](https://developer.concordium.software/en/mainnet/smart-contracts/guides/contract-dev-guides.html)
for guides on how to use the tool in detail.

This crate is a binary, and its versioning applies to the command-line API.
There are no guarantees about internal crate API.

## Creating a new Concordium smart contract project

To start a new Concordium smart contract project, run the command:

```
cargo concordium init
```

This command will generate a new project from the templates in the [template folder](https://github.com/Concordium/concordium-rust-smart-contracts).

## Compiling smart contracts

```
cargo concordium build --out contract.wasm.v1
```
will build a contract, embed the schema, and output the artifact to
`contract.wasm.v1`. This can be deployed to the chain or tested locally.

### Compilation options

An option that might be useful to minimize code size at the cost of
some performance in some cases is
```
[profile.release]
# Tell `rustc` to optimize for small code size.
opt-level = "s"
```
or even `opt-level = "z"`.

In some cases using `opt-level=3` actually leads to smaller code sizes, presumably due to more inlining and dead code removal as a result.

## Reproducible and verifiable builds.

A normal build with `cargo concordium build` is generally not reproducible since
some host information is embedded into the resulting binary. For this reason
`cargo concordium` supports so-called verifiable or reproducible builds that
always build the contract in a fixed environment in form of a Docker image
(defaults to `concordium/verifiable-sc-wasm32v1`).

Both `cargo concordium build` and `cargo concordium test` support verifiable
builds, which can be requested by adding the option `--verifiable` to the build
command. The value of this option should be a docker image listed above. For example

```
cargo concordium build --verifiable -o contract.wasm.v1 
```
This will build the smart contract and output it to a
`contract.wasm.v1` file. In addition to this `cargo concordium` will also
produce a file `contract.wasm.v1.tar` that contains the exact sources that were
used to build the contract.

When constructing the `tar` archive `cargo concordium` will include the contents
of the package root subject to the following
- files listed in `.gitignore` are ignored (both `.gitignore` in the package
  directory and parent directories)
- the package build directory (typically `target`) will be ignored
- additional files listed in any `.ignore` files will be ignored. The format
  of this file should be the same as a `.gitignore` file.
- hidden files are ignored.

Information about the sources and the build will be embedded into
`contract.wasm.v1` file. This information includes

- SHA2-256 hash of the `tar` file
- the docker image used in the build
- the exact build command executed inside the image, which includes the Rust toolchain version used for the build
- optionally the link to the sources if the `--source` flag is provided. If this
  is not provided the link can be embedded later. The source link should point
  either to the `tar` file directly, or to a `gzip`ped version of the file.

### Publishing the sources

The `tar` archive is meant to be published and its link embedded in the source
that is put to the chain. Before registering the module on the chain the `tar`
file should be uploaded somewhere that is accessible via http `GET` request.
Then the link should be embedded into the `wasm.v1` file using the
`edit-build-info` command.

```
cargo concordium edit-build-info --module contract.wasm.v1 --source-link https://domain.com/contract.wasm.v1.tar --verify
```

The `--verify` flag is optional, and if it is set `cargo concordium` will
download the contents at the supplied link and verify that it matches the build
metadata that is already embedded in the module. If it does, the link is added
to the metadata.

### Verifying a build

To verify that a deployed module was built from given sources there is a `cargo
concordium verify-build` command. This takes a path to the module and optionally
a path to the source `tar` archive. If the `tar` archive is not provided then it
will be downloaded from a link embedded in the module, if available. The source
link may also point to a gzipped `tar` archive.

For example
```
cargo concordium verify-build --module contract.wasm.v1
```

### Printing build information

```
cargo concordium print-build-info --module contract.wasm.v1
```

Will print any embedded build information.

### Limitations

- The `Cargo.lock` file must be up to date for reproducible builds.
- The contract sources must be either available remotely on a package
  repository such as [crates.io](https://crates.io) or entirely under the
  package root directory.

## Locally executing contracts

The following are some example invocations of the `cargo concordium` binary's subcommand `run`.

```shell
cargo concordium run init --context init-context.json --parameter parameter.bin --source ./simple_game.wasm --out state.bin --amount 123
```

with input files

```json
{
    "metadata": {
        "slotNumber": 1,
        "blockHeight": 1,
        "finalizedHeight": 1,
        "slotTime": "2021-01-01T00:00:01Z"
    },
    "initOrigin": "3uxeCZwa3SxbksPWHwXWxCsaPucZdzNaXsRbkztqUUYRo1MnvF"
}
```

and `parameter.bin` as

```
00001111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

(as a text file without a newline).

```shell
cargo concordium run receive --context receive-context.json --parameter parameter-receive.bin --source ./simple_game.wasm --state state-in.bin --amount 0 --name "receive_help_yourself" --balance 13 --out state-out.bin
```

where an example receive context is

```json
{
    "metadata": {
        "slotNumber": 1,
        "blockHeight": 1,
        "finalizedHeight": 1,
        "slotTime": "2021-01-01T00:00:01Z"
    },
    "invoker": "3uxeCZwa3SxbksPWHwXWxCsaPucZdzNaXsRbkztqUUYRo1MnvF",
    "selfAddress": {"index": 0, "subindex": 0},
    "selfBalance": 0,
    "sender": {
        "type": "Account",
        "address": "3uxeCZwa3SxbksPWHwXWxCsaPucZdzNaXsRbkztqUUYRo1MnvF"
    },
    "owner": "3uxeCZwa3SxbksPWHwXWxCsaPucZdzNaXsRbkztqUUYRo1MnvF"
}
```

See `--help` or `help` option to `cargo concordium run` for an explanation of the options.

