/*
 * This module contains all of the commands exposed by the extension.
 */

import * as vscode from "vscode";
import * as cargoConcordium from "./cargo-concordium";
import { ConfigError } from "./configuration";
import * as path from "node:path";

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

/** Run 'cargo-concordium build' using the directory of the currently focused editor.
 * Rejects if no editor is focused.
 */
export async function build() {
  const cwd = getActiveEditorDirectory();
  if (cwd === undefined) {
    // The command will only show up in the UI when focusing some editor,
    // So this case can only happen when controlling the extension programmably.
    vscode.window.showErrorMessage(
      "Unexpected error: Unable to determine the current working directory for the build command"
    );
    return;
  }
  return vscode.tasks.executeTask(await cargoConcordium.build(cwd));
}

/** Get the path for the currently active editor.
 * Returns undefined if no editor is active. */
function getActiveEditorDirectory() {
  const editor = vscode.window.activeTextEditor;
  if (editor !== undefined) {
    return path.dirname(editor.document.uri.fsPath);
  }
}
