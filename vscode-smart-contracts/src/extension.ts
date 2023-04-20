/*
 * This module is the entrypoint of the extension.
 * The exported functions have special meaning and are called by VS Code.
 */

import * as vscode from "vscode";
import * as Commands from "./commands";
import * as util from "node:util";
import * as globCallback from "glob";
import * as cargoConcordium from "./cargo-concordium";
import * as path from "node:path";
import {
  CONCORDIUM_TASK_TYPE,
  ConcordiumTaskDefinition,
} from "./cargo-concordium";

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
    vscode.commands.registerTextEditorCommand(
      "concordium-smart-contracts.build",
      Commands.build
    ),
    vscode.commands.registerTextEditorCommand(
      "concordium-smart-contracts.build-skip-schema",
      Commands.buildSkipSchema
    ),
    vscode.commands.registerTextEditorCommand(
      "concordium-smart-contracts.build-embed-schema",
      Commands.buildEmbedSchema
    ),
    vscode.commands.registerTextEditorCommand(
      "concordium-smart-contracts.test",
      Commands.test
    ),
    vscode.tasks.registerTaskProvider(CONCORDIUM_TASK_TYPE, taskProvider)
  );
}

/**
 * Task provider for Concordium tasks.
 */
const taskProvider: vscode.TaskProvider = {
  /** Search the current workspace for possible tasks */
  async provideTasks() {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    const tasks = await Promise.all(
      workspaceFolders.map(async (workspaceFolder) => {
        const workspaceRoot = workspaceFolder.uri.fsPath;
        const cargoProjectDirs = await getCargoProjectDirs(workspaceRoot);
        return Promise.all(
          cargoProjectDirs.flatMap((cwd) => {
            const defaultOutDir = path.join(cwd, "out");
            const defaultArgs = [
              "--out",
              path.join(defaultOutDir, "module.wasm.v1"),
              "--schema-json-out",
              defaultOutDir,
            ];
            return [
              cargoConcordium.build(cwd, workspaceFolder, defaultArgs),
              cargoConcordium.test(cwd, workspaceFolder),
            ];
          })
        );
      })
    );
    return tasks.flat();
  },
  /**
   * Resolve a user provided task definition.
   * Returning undefined fallback to search the output of `provideTasks`
   * for a matching task, which is slow.
   */
  async resolveTask(task) {
    if (task.definition.command === "build") {
      const definition = <ConcordiumTaskDefinition>task.definition;
      // Fallback to the first workspace folder.
      const fallbackWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const fallbackCwd = fallbackWorkspaceFolder?.uri.fsPath;
      const cwd = definition.cwd ?? fallbackCwd;
      if (cwd === undefined) {
        return undefined;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(cwd)
      );
      const resolvedTask = await cargoConcordium.build(
        cwd,
        workspaceFolder,
        definition.args
      );
      // resolveTask requires that the same task definition object (that is the
      // "definition" property on the task being resolved) should be used.
      resolvedTask.definition = task.definition;
      return resolvedTask;
    } else if (task.definition.command === "test") {
      const definition = <ConcordiumTaskDefinition>task.definition;
      // Fallback to the first workspace folder.
      const fallbackWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const fallbackCwd = fallbackWorkspaceFolder?.uri.fsPath;
      const cwd = definition.cwd ?? fallbackCwd;
      if (cwd === undefined) {
        return undefined;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(cwd)
      );
      const resolvedTask = await cargoConcordium.build(
        cwd,
        workspaceFolder,
        definition.args ?? []
      );
      // resolveTask requires that the same task definition object (that is the
      // "definition" property on the task being resolved) should be used.
      resolvedTask.definition = task.definition;
      return resolvedTask;
    }
    return undefined;
  },
};

/** Find directories containing a Cargo.toml file in a given directory */
async function getCargoProjectDirs(rootDir: string) {
  const cargoFiles = await glob("**/Cargo.toml", {
    cwd: rootDir,
  });
  return cargoFiles.map(path.dirname);
}
