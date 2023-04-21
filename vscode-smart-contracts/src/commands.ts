/*
 * This module contains all of the commands exposed by the extension.
 */

import * as vscode from "vscode";
import * as util from "node:util";
import * as cargoConcordium from "./cargo-concordium";
import * as config from "./configuration";
import * as path from "node:path";
import * as childProcess from "node:child_process";

const exec = util.promisify(childProcess.exec);

/** The default name used for the output directory using the build command. */
export const DEFAULT_OUT_DIR_NAME = "concordium-out";

/**
 * Display the version of the cargo-concordium executable.
 */
export async function version() {
  try {
    const version = await cargoConcordium.version();
    vscode.window.showInformationMessage(version);
  } catch (error) {
    if (error instanceof config.ConfigError) {
      vscode.window.showErrorMessage(error.message);
    } else {
      vscode.window.showErrorMessage("Unexpected error: " + error);
    }
  }
}

/**
 * Run 'cargo-concordium build' using the directory of the currently focused editor.
 * Printing the schema in base64 as part of stdout.
 */
export function build(editor: vscode.TextEditor) {
  return buildWorker(editor, "outDir");
}

/**
 * Run 'cargo-concordium build' using the directory of the currently focused editor.
 * With no schema generation.
 */
export function buildSkipSchema(editor: vscode.TextEditor) {
  return buildWorker(editor, "skip");
}

/**
 * Run 'cargo-concordium build' using the directory of the currently focused editor.
 * Embedding the schema into the resulting smart contract module.
 */
export function buildEmbedSchema(editor: vscode.TextEditor) {
  return buildWorker(editor, "embed-and-outDir");
}

/**
 * Type representing the different settings for schema generation during cargo-concordium build.
 */
type SchemaSettings = "skip" | "embed-and-outDir" | "outDir";

/**
 * Internal worker for running 'cargo-concordium build' using the directory of the currently focused editor.
 * Takes the schema setting as an argument.
 */
async function buildWorker(
  editor: vscode.TextEditor,
  schemaSettings: SchemaSettings
) {
  if (!(await haveWasmTargetInstalled())) {
    const response = await vscode.window.showInformationMessage(
      "The needed wasm32-unknown-unknown rust target seems to be missing. Should it be installed?",
      "Install",
      "Abort"
    );
    if (response === "Abort") {
      vscode.window.showErrorMessage(
        "Unable to build because of missing wasm32-unknown-unknown target."
      );
      return;
    }
    await installWasmTarget();
  }
  const cwd = path.dirname(editor.document.uri.fsPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    editor.document.uri
  );

  const projectDir = await locateCargoProjectDir(cwd);
  const outDir = path.join(projectDir, DEFAULT_OUT_DIR_NAME);

  const schemaArgs =
    schemaSettings === "skip"
      ? []
      : schemaSettings === "embed-and-outDir"
      ? [
          "--schema-embed",
          "--schema-json-out",
          outDir,
          "--schema-base64-out",
          path.join(outDir, "module-schema.bs64"),
        ]
      : ["--schema-json-out", outDir];
  const additionalArgs = config.getAdditionalBuildArgs();
  const moduleOut = path.join(outDir, "module.wasm.v1");
  const args = ["--out", moduleOut].concat(schemaArgs, additionalArgs);
  return vscode.tasks.executeTask(
    await cargoConcordium.build(cwd, workspaceFolder, args)
  );
}

/**
 * Get the location of the current Cargo project.
 * @param cwd Current location in a project.
 */
async function locateCargoProjectDir(cwd: string) {
  const { stdout } = await exec("cargo locate-project", { cwd });
  const out = JSON.parse(stdout);
  if (!("root" in out)) {
    throw new Error("Failed to find project root: Invalid format");
  }
  return path.dirname(out.root);
}

/**
 * Check the rustup list of installed targets for wasm32-unknown-unknown.
 */
async function haveWasmTargetInstalled() {
  const out = await exec("rustup target list --installed");
  return out.stdout.includes("wasm32-unknown-unknown");
}

/**
 * Install the wasm32-unknown-unknown target using rustup.
 * The returned promise resolves when the install task has ended.
 */
function installWasmTarget() {
  const execution = new vscode.ProcessExecution("rustup", [
    "target",
    "install",
    "wasm32-unknown-unknown",
  ]);
  const task = new vscode.Task(
    { type: cargoConcordium.CONCORDIUM_TASK_TYPE, command: "install wasm" },
    vscode.TaskScope.Workspace,
    `Install WASM target`,
    "Build smart contract",
    execution
  );
  return executeAndAwaitTask(task);
}

/**
 * Execute and await a task to end.
 * @param task The task to execute.
 * @returns Promise which resolves when the task has ended.
 */
function executeAndAwaitTask(task: vscode.Task) {
  return new Promise<void>((resolve, reject) => {
    vscode.tasks.onDidEndTask((event) => {
      if (event.execution.task === task) {
        resolve();
      }
    });
    try {
      vscode.tasks.executeTask(task);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Run 'cargo-concordium test' using the directory of the currently focused editor.
 */
export async function test(editor: vscode.TextEditor) {
  if (!(await haveWasmTargetInstalled())) {
    const response = await vscode.window.showInformationMessage(
      "The needed wasm32-unknown-unknown rust target seems to be missing. Should it be installed?",
      "Install",
      "Abort"
    );
    if (response === "Abort") {
      vscode.window.showErrorMessage(
        "Unable to run tests because of missing wasm32-unknown-unknown target."
      );
      return;
    }
    await installWasmTarget();
  }
  const cwd = path.dirname(editor.document.uri.fsPath);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(
    editor.document.uri
  );

  const args = config.getAdditionalTestArgs();
  return vscode.tasks.executeTask(
    await cargoConcordium.test(cwd, workspaceFolder, args)
  );
}

/** Run 'cargo-concordium init' in a directory selected by the user */
export async function setupProject() {
  const defaultCwd = vscode.workspace.workspaceFolders?.[0].uri;
  const directories = await vscode.window.showOpenDialog({
    title: "Select directory to add the smart contract project directory",
    openLabel: "Select",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: defaultCwd,
  });
  if (directories === undefined) {
    return;
  }
  const [cwd] = directories;
  const executable = await cargoConcordium.getResolvedExecutablePath();
  const terminal = vscode.window.createTerminal({
    name: "Setup smart contract project",
    cwd,
  });
  terminal.show();
  terminal.sendText(executable + " concordium init");
}
