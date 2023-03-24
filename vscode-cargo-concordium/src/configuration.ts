/**
 * This module a type inferface for the configuration of the user.
 */
import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";

export class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/** Validate the provided path is a file and executable, otherwise a ConfigError is thrown */
async function validateExecutable(path: string) {
  const exists = await fs.access(path, constants.F_OK).then(
    () => true,
    () => false
  );
  if (!exists) {
    throw new ConfigError(
      `Custom cargo-concordium executable does not exist. ${path}`
    );
  }

  const isExecutable = await fs.access(path, constants.X_OK).then(
    () => true,
    () => false
  );
  if (!isExecutable) {
    throw new ConfigError(
      `Custom cargo-concordium executable is not executable. ${path}`
    );
  }
}

/** Get the custom executable path set by the user */
export async function getCustomExecutablePath(): Promise<string | null> {
  const customPath = vscode.workspace
    .getConfiguration("cargo-concordium")
    .get<string | null>("custom-executable");
  if (customPath === undefined || customPath === null) {
    return null;
  }
  await validateExecutable(customPath);
  // Also consider adding an event listener on config changes to do validation.
  return customPath;
}
