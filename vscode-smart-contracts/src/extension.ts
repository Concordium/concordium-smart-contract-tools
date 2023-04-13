/*
 * This module is the entrypoint of the extension.
 * The exported functions have special meaning and are called by VS Code.
 *
 */

import * as vscode from "vscode";
import * as Commands from "./commands";
import * as util from "node:util";
import * as globCallback from "glob";
import * as cargoConcordium from "./cargo-concordium";
import * as path from "node:path";
import { ConcordiumTaskDefinition } from "./cargo-concordium";

const glob = util.promisify(globCallback);

// This method is called when the extension is activated
// An extension is activated the very first time a command is executed.
export function activate(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "concordium-smart-contracts.version",
      Commands.version
    ),
    vscode.commands.registerCommand(
      "concordium-smart-contracts.build",
      Commands.build
    ),
    vscode.tasks.registerTaskProvider("Concordium", taskProvider)
  );
}

const taskProvider: vscode.TaskProvider = {
  async provideTasks() {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const tasks = await Promise.all(
      workspaceFolders.map(async (workspaceFolder) => {
        const workspaceRoot = workspaceFolder.uri.fsPath;
        const cargoFiles = await glob("**/Cargo.toml", {
          cwd: workspaceRoot,
        });
        return Promise.all(
          cargoFiles
            .map(path.dirname)
            .map((cwd) => cargoConcordium.build(cwd, workspaceFolder))
        );
      })
    );
    return tasks.flat();
  },
  async resolveTask(task) {
    if (task.definition.command === "build") {
      const definition = <ConcordiumTaskDefinition>task.definition;
      const resolvedTask = await cargoConcordium.build(definition.cwd);
      // resolveTask requires that the same definition object be used.
      resolvedTask.definition = task.definition;
      return resolvedTask;
    }
    return undefined;
  },
};
