/**
 * This module provide wrappers for cargo-concordium providing a well-typed interface to the executable.
 */
import * as util from "node:util";
import * as childProcess from "node:child_process";
import * as config from "./configuration";
import * as vscode from "vscode";

// Create a version of execFile, which uses promises instead of callbacks.
const execFile = util.promisify(childProcess.execFile);

/** Get the path to the executable shipped with the extension */
function getBundledExecutablePath(): string {
  const context = vscode.extensions.getExtension(
    "concordium.cargo-concordium"
  )!;

  return vscode.Uri.joinPath(
    context.extensionUri,
    "executables",
    `cargo-concordium${process.platform === "win32" ? ".exe" : ""}`
  ).fsPath;
}

/**
 * Get the cargo-concordium executable.
 *
 * Uses the custom-executable from settings otherwise fallbacks to the executables included in the extension */
export async function getResolvedExecutablePath(): Promise<string> {
  const customExecutable = await config.getCustomExecutablePath();
  if (customExecutable !== null) {
    return customExecutable;
  }
  return getBundledExecutablePath();
}

/** Execute a command using cargo-concordium with the provided arguments */
async function execute(...args: string[]) {
  const executable = await getResolvedExecutablePath();
  return execFile(executable, args);
}

/** Get the version of the executable */
export async function version(): Promise<string> {
  const { stdout } = await execute("--version");
  return stdout;
}
