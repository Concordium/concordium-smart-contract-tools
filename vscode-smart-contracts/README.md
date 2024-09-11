# Concordium Smart Contract extension for VS Code

This extension provides the functionality needed for developing [smart contracts](https://developer.concordium.software/en/mainnet/smart-contracts/general/introduction.html) and dApps for the [Concordium Blockchain](https://concordium.com/).

Features provided by [`cargo-concordium`](https://github.com/Concordium/concordium-smart-contract-tools/tree/main/cargo-concordium) and [`ccd-js-gen`](https://www.npmjs.com/package/@concordium/ccd-js-gen) integrated into VS Code.

## Features

### Command for initializing a smart contract project

Initialize a smart contract project from a template.

![](https://github.com/Concordium/concordium-smart-contract-tools/raw/main/vscode-smart-contracts/assets/init-contract.gif)

### Command for building a smart contract

Running the smart contract build command.

![](https://github.com/Concordium/concordium-smart-contract-tools/raw/main/vscode-smart-contracts/assets/build-contract.gif)

### Command for testing smart contract

Running the smart contract tests command.

![](https://github.com/Concordium/concordium-smart-contract-tools/raw/main/vscode-smart-contracts/assets/test-contract.gif)

### Command for generating TypeScript/JavaScript clients

Running the generate TypeScript/JavaScript clients command.

![](https://github.com/Concordium/concordium-smart-contract-tools/raw/main/vscode-smart-contracts/assets/generate-js-clients.gif)

### Provide tasks for smart contract projects

Searches the workspace for common smart contract tasks.

![](https://github.com/Concordium/concordium-smart-contract-tools/raw/main/vscode-smart-contracts/assets/run-task-build.gif)

### Provide snippets for smart contract development

A number of snippets are provided, all prefixed with `ccd` (for Concordium).
Just type `ccd` in your smart contract source file and let IntelliSense show you the list of snippets.

## Requirements

The extension relies on the following tools, which must be installed and available on PATH.
- [`rustup`](https://rustup.rs/) 
- [`cargo`](https://doc.rust-lang.org/cargo/)
- [`Node.js`](https://nodejs.org/en/)

## Extension Settings

This extension contributes the following settings:

* `concordium-smart-contracts.custom-executable`: `string | null` (default `null`) <br>
  Provide a custom path to the `cargo-concordium` executable to use instead of the bundled one. Ex. `~/.cargo/bin/cargo-concordium`
* `concordium-smart-contracts.additional-build-args`: `string[]` (default `[]`) <br>
  Provide additional arguments for `cargo-concordium` when running the build smart contract command.
* `concordium-smart-contracts.additional-test-args`: `string[]` (default `[]`) <br>
  Provide additional arguments for `cargo-concordium` when running the test smart contract command.
* `concordium-smart-contracts.custom-ccd-js-gen-executable`: `string | null` (default `null`) <br>
  Provide a custom path to the `ccd-js-gen` executable to use instead of the bundled one. Ex. `/usr/local/lib/node_modules/.bin/ccd-js-gen`.
* `concordium-smart-contracts.additional-gen-js-args`: `string[]` (default `[]`) <br>
  Provide additional arguments for `ccd-js-gen` when running.

## Release Notes

## 3.0.0

- Contains `cargo-concordium` version 4.0.0
- Contains `@concordium/ccd-js-gen` version 1.2.1

## 2.2.0

- Contains `cargo-concordium` version 3.2.0
- Contains `@concordium/ccd-js-gen` version 1.2.0

- Add support for generating TypeScript/JavaScript clients for smart contract modules via the [`ccd-js-gen`](https://www.npmjs.com/package/@concordium/ccd-js-gen) tool.
  - Adds two commands: one for generating ts/js clients, and one for getting the version of the `ccd-js-gen` executable.
  - Adds settings for using a custom `ccd-js-gen` executable and to provide additional arguments when running it.
  - Adds a task for running the `ccd-js-gen` tool.

## 2.1.0

- Contains `cargo-concordium` version 3.1.4

### 2.0.0

- Contains `cargo-concordium` version 3.0.0.

### 1.1.0

- Contains `cargo-concordium` version 2.9.0.

### 1.0.3

- Add `--locked` argument when installing `cargo-generate` for the user.

### 1.0.2

- Update icon of the extension to better support dark themes.
- Show an error when unable to determine the project, when running build and test commands.
- Contains `cargo-concordium` version 2.8.1

### 1.0.1

Initial release of the extension with `cargo-concordium` version 2.8.0.


## Contributing

Ensure to read through the extensions guidelines and follow the best practices for creating an extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### Development

- Ensure to have a recent version of VS Code installed (See package.json for minimal version).
- Make sure to have [NodeJS](https://nodejs.org/en) installed (See package.json for minimal version).
- Run `npm install` in the extension project directory.
- Build or download `cargo-concordium` and move the resulting executable to `vscode-smart-contracts/executables/` (making the directory).

  On MacOS and Linux this can be done with the following commands (from the `vscode-smart-contracts` directory):

  ```
  mkdir executables
  cargo build --manifest-path ../cargo-concordium/Cargo.toml
  cp ../cargo-concordium/target/debug/cargo-concordium ./executables
  ```

To compile the typescript run:
```
npm run compile
```

To launch an instance of vscode only with the extension installed run:
```
code --extensionDevelopmentPath=/absolute/path/to/vscode-smart-contracts --disable-extensions
```

### Tests

Tests live in `src/test/suite` where the test-runner (`src/test/runTest.ts`) consider files with extension `.test.ts` a test suite.

To run the tests use:
```
npm test
```

### Publishing

A guide for publishing can be found here (Skipping the section about creating a publisher):
https://code.visualstudio.com/api/working-with-extensions/publishing-extension

To be able to actually publish the extension, your Azure DevOps user ID must be added as a member of the Concordium Publisher.

