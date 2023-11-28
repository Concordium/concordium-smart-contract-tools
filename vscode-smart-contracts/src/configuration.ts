/*
 * This module provides a typed interface the current configurations.
 */
import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as os from "node:os";

/** Error type representing a user configuration error.
 * Introduced to allow for differentiate how to display the errors. */
export class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
  }
}

/** Name for the section in the settings. */
export const SECTION = "concordium-smart-contracts";
/** Name for the setting to provide a path to a custom cargo-concordium executable. */
export const CUSTOM_CARGO_CONCORDIUM_EXECUTABLE = "custom-executable";
/** Name for the setting to provide a path to a custom ccd-js-gen executable. */
export const CUSTOM_CCD_JS_GEN_EXECUTABLE = "custom-ccd-js-gen-executable";
/** Name for the setting to provide additional arguments for when running cargo-concordium build. */
export const ADDITIONAL_BUILD_ARGUMENTS = "additional-build-args";
/** Name for the setting to provide additional arguments for when running cargo-concordium test. */
export const ADDITIONAL_TEST_ARGUMENTS = "additional-test-args";
/** Name for the setting to provide additional arguments for when running ccd-js-gen. */
export const ADDITIONAL_GEN_JS_ARGUMENTS = "additional-gen-js-args";

/** Type for the custom executable setting, must match the corresponding type schema in package.json */
type CustomExecutableConfig = string | null;

/** Type for the additional build/test args setting, must match the corresponding type schema in package.json */
type AdditionalArgsConfig = string[];

/** Type for diffenrentiating between the different executables. */
export type ExecutableName = "cargo-concordium" | "ccd-js-gen";

/** Get and validate the custom executable path for `cargo-concordium` or `ccd-js-gen` set by the user.
 * Return null if not set by the user.
 * Throws a `ConfigError` if invalid.
 */
export async function getCustomExecutablePath(executableName: ExecutableName): Promise<string | null> {
  let settingName;
  switch(executableName) {
      case "cargo-concordium": {
        settingName = CUSTOM_CARGO_CONCORDIUM_EXECUTABLE;
        break;
      }
      case "ccd-js-gen": {
        settingName = CUSTOM_CCD_JS_GEN_EXECUTABLE;
        break;
      }
  }

  const customPath = vscode.workspace
    .getConfiguration(SECTION)
    .get<CustomExecutableConfig>(settingName);
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
          `Custom ${executableName} executable path does not exist. ${customPath}`
        );
      }

      throw error;
    });

  if (!stats.isFile()) {
    throw new ConfigError(
      `Custom ${executableName} executable path is not a file. ${customPath}`
    );
  }

  // Ensure permission to execute.
  // Skipping the check on Windows, since there is no easy way of ensuring this.
  if (
    os.platform() !== "win32" &&
    (stats.mode &
      (constants.S_IXUSR | constants.S_IXGRP | constants.S_IXOTH)) ===
      0
  ) {
    throw new ConfigError(
      `Custom ${executableName} executable path is not executable. ${customPath}`
    );
  }

  return resolvedPath;
}

/** Get additional build arguments from configurations */
export function getAdditionalBuildArgs(): string[] {
  const argsOption = vscode.workspace
    .getConfiguration(SECTION)
    .get<AdditionalArgsConfig>(ADDITIONAL_BUILD_ARGUMENTS);
  return argsOption ?? [];
}

/** Get additional test arguments from configurations */
export function getAdditionalTestArgs(): string[] {
  const argsOption = vscode.workspace
    .getConfiguration(SECTION)
    .get<AdditionalArgsConfig>(ADDITIONAL_TEST_ARGUMENTS);
  return argsOption ?? [];
}

/** Get additional generate TS/JS clients arguments from configurations. */
export function getAdditionalJsGenArgs(): string[] {
  const argsOption = vscode.workspace
    .getConfiguration(SECTION)
    .get<AdditionalArgsConfig>(ADDITIONAL_GEN_JS_ARGUMENTS);
  return argsOption ?? [];
}
