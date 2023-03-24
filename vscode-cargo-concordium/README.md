# `cargo-concordium` VS Code extension

This extension provides the functionality of [`cargo-concordium`](https://github.com/Concordium/concordium-smart-contract-tools/tree/main/cargo-concordium) inside [VS Code](https://code.visualstudio.com/). 
Providing tools for [developing rust smart contracts](https://developer.concordium.software/en/mainnet/smart-contracts/general/introduction.html) for the [Concordium Blockchain](https://concordium.com/).

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

* `cargo-concordium.custom-executable`: `string | null` (default `null`) <br>
  Provide a custom path to the cargo-concordium executable to use instead of the bundled one.

<!-- 
## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.
-->

## Release Notes

### 1.0.0

Initial release of this extension


## Contributing

Ensure to read through the extensions guidelines and follow the best practices for creating an extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)


### Publishing

A guide for publishing can be found here (Skipping the section about creating a publisher): 
https://code.visualstudio.com/api/working-with-extensions/publishing-extension

To be able to actually publish the extension, your Azure DevOps user ID must be added as a member of the Concordium Publisher.

