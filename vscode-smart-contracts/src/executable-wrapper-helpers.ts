/*
 * This module provides helpers for making well-typed wrappers around an executable.
 */
import * as util from "node:util";
import * as childProcess from "node:child_process";
import * as config from "./configuration";
import * as vscode from "vscode";

// Create a version of exec, which uses promises instead of callbacks.
// We use `exec` instead of the slightly faster `execFile` because `exec`
// runs the command in a terminal, which is necessary for it to run
// the `ccd-js-gen.ps1` on Windows.
const exec = util.promisify(childProcess.exec);

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

/** Execute a command with the given executable and arguments. */
export async function execute(
  executableName: config.ExecutableName,
  ...args: string[]
) {
  const executable = await getResolvedExecutablePath(executableName);
  const cmd = [executable, ...args].join(" ");
  // Use powershell instead of CommandPrompt on Windows, as that is also the default for VS Code's `ProcessExecution`.
  if (process.platform === "win32") {
    return exec(cmd, {'shell': 'powershell.exe'});
  }
  return exec(cmd);
}
