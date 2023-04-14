/*
 * This module contains all of the commands exposed by the extension.
 */

import * as vscode from "vscode";
import * as util from "node:util";
import * as cargoConcordium from "./cargo-concordium";
import { ConfigError } from "./configuration";
import * as path from "node:path";
import * as childProcess from "node:child_process";

const exec = util.promisify(childProcess.exec);

/**
 * Display the version of the cargo-concordium executable.
 */
export async function version() {
  try {
    const version = await cargoConcordium.version();
    vscode.window.showInformationMessage(version);
  } catch (error) {
    if (error instanceof ConfigError) {
      vscode.window.showErrorMessage(error.message);
    } else {
      vscode.window.showErrorMessage("Unexpected error: " + error);
    }
  }
}

/**
 * Run 'cargo-concordium build' using the directory of the currently focused editor.
 */
export async function build(editor: vscode.TextEditor) {
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
  return vscode.tasks.executeTask(await cargoConcordium.build(cwd));
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
 * The returned promise resolves when the install task have ended.
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
 * @returns Promise which resolves when the task have ended.
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
