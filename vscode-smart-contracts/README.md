# Concordium Smart Contract extension for VS Code

This extension provides the functionality needed for [developing smart contracts](https://developer.concordium.software/en/mainnet/smart-contracts/general/introduction.html) for the [Concordium Blockchain](https://concordium.com/).

<!--
## Features

 Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.
-->

## Requirements

The extension relies on [`rustup`](https://rustup.rs/) and `cargo` being installed and available in PATH.

## Extension Settings

This extension contributes the following settings:

* `concordium-smart-contracts.custom-executable`: `string | null` (default `null`) <br>
  Provide a custom path to the cargo-concordium executable to use instead of the bundled one. Ex. `~/.cargo/bin/cargo-concordium`

<!--
## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.
-->

## Release Notes

### 1.0.0 (unreleased)

Initial release of this extension


## Contributing

Ensure to read through the extensions guidelines and follow the best practices for creating an extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### Development

- Ensure to have a recent version of VS Code installed.
- Make sure to have [NodeJS](https://nodejs.org/en) installed.
- Run `npm install` in the extension project directory.
- Build `cargo-concordium` and move the resulting executable to `vscode-smart-contracts/executable/` (making the directory).

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

