
# Cargo Concordium


## Compiling smart contracts to Wasm

The process for compiling smart contracts to Wasm is always the same, and we
illustrate it here on the [counter](./rust-contracts/example-contracts/counter)
contract. To compile Rust to Wasm you need to

- install the rust wasm toolchain, for example by using
```
rustup target add wasm32-unknown-unknown
```
- run `cargo build` as
```
cargo build --target wasm32-unknown-unknown [--release]
```
(the `release` flag) is optional, by default it will build in debug builds,
which are slower and bigger.

Running `cargo build` will produce a single `.wasm` module in
`target/wasm32-unknown-unknown/release/counter.wasm` or
`target/wasm32-unknown-unknown/debug/counter.wasm`, depending on whether the
`--release` option was used or not.

By default the module will be quite big in size, depending on the options used
(e.g., whether it is compiled with `std` or not, it can be from 600+kB to more
than a MB). However most of that is debug information in custom sections and can be stripped away.
There are various tools and libraries for this. One such suite of tools is [Web
assembly binary toolkit (wabt)](https://github.com/WebAssembly/wabt) and its
tool `wasm-strip`.

Using `wasm-strip` on the produced module produces a module of size 11-13kB ,
depending on whether the `no_std` option was selected or not.

### Default toolchain

The default toolchain can be specified in the `.cargo/config` files inside the
project, as exemplified in the
[counter/.cargo/config](./rust-contracts/example-contracts/counter/.cargo/config)
file.

### Compilation options

Since a contract running on the chain will typically not be able to recover from
panics, and error traces are not reported, it is useful not to bloat code size
with them. Setting `panic=abort` will make it so that the compiler will generate
simple `Wasm` traps on any panic that occurs. This option can be specified
either in `.cargo/config` as exemplified in
[counter/.cargo/config](./rust-contracts/example-contracts/counter/.cargo/config),
or in the `Cargo.toml` file as

```
[profile.release]
# Don't unwind on panics, just trap.
panic = "abort"
```

The latter will only set this option in `release` builds, for debug builds use

```
[profile.dev]
# Don't unwind on panics, just trap.
panic = "abort"
```
instead.

An additional option that might be useful to minimize code size at the cost of
some performance in some cases is
```
[profile.release]
# Tell `rustc` to optimize for small code size.
opt-level = "s"
```
or even `opt-level = "z"`.

In some cases using `opt-level=3` actually leads to smaller code sizes, presumably due to more inlining and dead code removal as a result.

# Example inputs to the `cargo concordium run`

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

# Contract schema
The state of a contract is a bunch of bytes and how to interpret these bytes into representations such as structs and enums is hidden away into the contract functions after compilation.
For the execution of the contract, this is exactly as intended, but reading and writing bytes directly is error prone and impractical for a user. To solve this we can embed a contract schema into the contract module.

A contract schema is a description of how to interpret these bytes, that optionally can be embedded into the smart contract on-chain, such that external tools can use this information to display and interact with the smart contract in some format other than just raw bytes.

Tool like `cargo concordium run init` can then check for an embedded schema and use this to parse the bytes of the state, or have the user supply parameters in a more readable format than bytes.

More technically the contract schema is serialized and embedded into the wasm module by setting a [custom section](https://webassembly.github.io/spec/core/appendix/custom.html) named `"contract-schema"`.


## Generating the schema in rust
The schema itself is embedded as bytes, and to automate this process the user can annotate the contract state and which parameters to include in the schema using `#[contract_state(contract = "my-contract")]` and including an `parameter` attribute in the `#[init(...)]` and `#[receive(...)]` proc-macros.

```rust
#[contract_state(contract = "my-contract")]
#[derive(SchemaType)]
struct MyState {
    ...
}
```
```rust
#[derive(SchemaType)]
enum MyParameter {
    ...
}

#[init(contract = "my-contract", parameter = "MyParameter")]
fn contract_init<...> (...){
    ...
}
```
For a type to be part of the schema it must implement the `SchemaType` trait, which is just a getter for the schema of the type, and for most cases of structs and enums this can be automatically derived using `#[derive(SchemaType)]` as seen above.
```rust
trait SchemaType {
    fn get_type() -> crate::schema::Type;
}
```

To build the schema, the `Cargo.toml` must include the `build-schema` feature, which is used by the contract building tool.
```toml
...
[features]
build-schema = []
...
```
Running `cargo concordium build` with either `--schema-embed` or `--schema-output=<file>` will then first compile the contract with the `build-schema` feature enabled, generate the schema from the contract module and then compile the contract again without the code for generating the schema, and either embed the schema as bytes into this or output the bytes into a file (or both).

The reason for compiling the contract again is to avoid including dependencies from the schema generation into the final contract, resulting in smaller modules.


# Removing Host Information from Binary
By default the compiled binary from a rust crate contains some information from the host machine, namely rust-related paths such as the path to `.cargo`. This can be seen by inspecting the produced binary:

Lets assume your username is `tom` and you have a smart contract `foo` located in your home folder, which you compiled in release-mode to WASM32.
By running the following command inside the `foo` folder, you will be able to see the paths included in the binary: `strings target/wasm32-unknown-unknown/release/foo.wasm | grep tom`

To remove the host information, the path prefixes can be remapped using a flag given to the compiler.
`RUSTFLAGS=--remap-path-prefix=/home/tom=secret cargo build --release --target wasm32-unknown-unknown`, where `/home/tom` is the prefix you want to change into `secret`.
The flag can be specified multiple times to remap multiple prefixes.

The flags can also be set permanently in the `.cargo/config` file in your crate, under the `build` section:

``` toml
[build]
rustflags = ["--remap-path-prefix=/home/tom=secret"]
```

**Important:**
[--remap-path-prefix does currently not work correctly if the `rust-src` component is present.](https://github.com/rust-lang/rust/issues/73167)
