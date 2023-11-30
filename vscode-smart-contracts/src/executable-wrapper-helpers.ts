/*
 * This module provides helpers for making well-typed wrappers around an executable.
 */
import * as util from "node:util";
import * as childProcess from "node:child_process";
import * as config from "./configuration";
import * as vscode from "vscode";

/** Get the path to the executable shipped with the extension. */
export function getBundledExecutablePath(
  executableName: config.ExecutableName
): string {
  const context = vscode.extensions.getExtension(
    "concordium.concordium-smart-contracts"
  );

  if (context === undefined) {
    throw new Error(
      "No context found for 'concordium.concordium-smart-contracts' extension"
    );
  }

  let pathSegments;
  switch (executableName) {
    case "cargo-concordium": {
      pathSegments = ["executables", `${executableName}${process.platform === "win32" ? ".exe" : ""}`];
      break;
    }
    case "ccd-js-gen": {
      pathSegments = ["node_modules", ".bin", `${executableName}${process.platform === "win32" ? ".ps1" : ""}`];
      break;
    }
  }
  return vscode.Uri.joinPath(context.extensionUri, ...pathSegments).fsPath;
}

/**
 * Get the path to the named executable.
 *
 * Uses the appropriate custom executable from settings, otherwise fallbacks to the executables included in the extension.
 */
export async function getResolvedExecutablePath(
  executableName: config.ExecutableName
): Promise<string> {
  const customExecutable = await config.getCustomExecutablePath(executableName);
  if (customExecutable !== null) {
    return customExecutable;
  }
  return getBundledExecutablePath(executableName);
}

// Create a version of `exec`, which uses promises instead of callbacks.
const exec = util.promisify(childProcess.exec);
// Create a version of `execFile`, which uses promises instead of callbacks.
const execFile = util.promisify(childProcess.execFile);

/** Execute a command with the given executable and arguments. */
export async function execute(
  executableName: config.ExecutableName,
  ...args: string[]
) {
  const executable = await getResolvedExecutablePath(executableName);
  if (executableName === "ccd-js-gen" && process.platform === "win32") {
    const cmd = [executable, ...args].join(" ");
    // Use `exec` on Windows to run the `ccd-js-gen.ps1` file in PowerShell.
    return exec(cmd, {'shell': 'powershell.exe'});
  }
  return execFile(executable, args);
}
