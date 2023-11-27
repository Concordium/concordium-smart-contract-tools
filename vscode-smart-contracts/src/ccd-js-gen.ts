/*
 * This module provide wrappers for ccd-js-gen providing a well-typed interface to the executable.
 */
import * as util from "node:util";
import * as childProcess from "node:child_process";
import * as vscode from "vscode";

// Create a version of execFile, which uses promises instead of callbacks.
const execFile = util.promisify(childProcess.execFile);

/** Get the path to the executable shipped with the extension. */
function getBundledExecutablePath(): string {
  const context = vscode.extensions.getExtension(
    "concordium.concordium-smart-contracts"
  );

  if (context === undefined) {
    throw new Error(
      "No context found for 'concordium.concordium-smart-contracts' extension"
    );
  }

  return vscode.Uri.joinPath(
    context.extensionUri,
    "node_modules",
    ".bin",
    `ccd-js-gen${process.platform === "win32" ? ".exe" : ""}`
  ).fsPath;
}

/**
 * Get the ccd-js-gen executable.
 */
export async function getResolvedExecutablePath(): Promise<string> {
  return getBundledExecutablePath();
}

/** Execute a command using cargo-concordium with the provided arguments */
async function execute(...args: string[]) {
  // const executable = "./node-modules/.bin/ccd-js-gen";
  const executable = await getResolvedExecutablePath();
  return execFile(executable, args);
}

/** Get the version of the executable. Printed as `ccd-js-gen x.y.z`. */
export async function version(): Promise<string> {
  const { stdout } = await execute("--version");
  return `ccd-js-gen ${stdout}`;
}

export async function generateContractClientsFromFile(moduleFilePath: string, outDirPath: string) {
  await execute("--module", moduleFilePath, "--out-dir", outDirPath);
}
