/*
 * This module is the entrypoint of the extension.
 * The exported functions have special meaning and are called by VS Code.
 *
 */

import * as vscode from "vscode";
import * as Commands from "./commands";

// This method is called when the extension is activated
// An extension is activated the very first time a command is executed.
export function activate(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "concordium-smart-contracts.version",
    Commands.version
  );
  context.subscriptions.push(disposable);
}
