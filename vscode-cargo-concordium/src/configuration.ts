/*
 * This module a type inferface for the configuration of the user.
 */
import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as os from "node:os";

/** Error type representing a user configuration error.
 * Introduced to allow for differantiate how to display the errors. */
export class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/** Name for the section in the settings. */
export const SECTION = "cargo-concordium";
/** Name for the setting to provide a path to a custom cargo-concordium executable. */
export const CUSTOM_EXECUTABLE = "custom-executable";

/** Get and validate the custom executable path set by the user.
 * Return null if not set by the user.
 * Throws a `ConfigError` if invalid.
 */
export async function getCustomExecutablePath(): Promise<string | null> {
  const customPath = vscode.workspace
    .getConfiguration(SECTION)
    .get<string | null>(CUSTOM_EXECUTABLE);
  if (customPath === undefined || customPath === null) {
    return null;
  }

  const resolvedPath = customPath.replace("~", os.homedir());

  // Ask the filesystem for information on the provided path.
  const stats = await fs
    .stat(resolvedPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        throw new ConfigError(
          `Custom cargo-concordium executable path does not exist. ${customPath}`
        );
      }

      throw error;
    });

  if (!stats.isFile()) {
    throw new ConfigError(
      `Custom cargo-concordium executable path is not a file. ${customPath}`
    );
  }

  // Ensure it is executable
  if (
    (stats.mode &
      (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH)) ===
    0
  ) {
    throw new ConfigError(
      `Custom cargo-concordium executable path is not executable. ${customPath}`
    );
  }

  return resolvedPath;
}
