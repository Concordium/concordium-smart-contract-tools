/*
 * This module contains all of the commands exposed by the extension.
 *
 */

import * as vscode from "vscode";
import * as cargoConcordium from "./cargo-concordium";
import { ConfigError } from "./configuration";

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
      throw error;
    }
  }
}
