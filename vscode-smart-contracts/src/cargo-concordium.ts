/*
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
    "concordium.concordium-smart-contracts"
  );

  if (context === undefined) {
    throw new Error(
      "No context found for 'concordium.concordium-smart-contracts' extension"
    );
  }

  return vscode.Uri.joinPath(
    context.extensionUri,
    "executables",
    `cargo-concordium${process.platform === "win32" ? ".exe" : ""}`
  ).fsPath;
}

/**
 * Get the cargo-concordium executable.
 *
 * Uses the custom-executable from settings otherwise fallbacks to the executables included in the extension
 */
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

/**
 * Task type. Used by VS Code to match a task provider with a task provided by the user.
 * Should match the schema specified in the package.json (contributes.taskDefinitions)
 */
export const CONCORDIUM_TASK_TYPE = "Concordium";

/**
 * Task definition for tasks provided by this extension.
 * Captures the information to construct a task and should match the schema
 * specified in the package.json (contributes.taskDefinitions).
 */
export interface ConcordiumTaskDefinition extends vscode.TaskDefinition {
  type: typeof CONCORDIUM_TASK_TYPE;
  command: "build";
  cwd?: string;
}

/** Construct a task for running cargo-concordium build in a given directory */
export async function build(
  cwd: string,
  scope: vscode.TaskScope | vscode.WorkspaceFolder = vscode.TaskScope.Workspace
) {
  const executable = await getResolvedExecutablePath();
  const taskDefinition: ConcordiumTaskDefinition = {
    type: CONCORDIUM_TASK_TYPE,
    command: "build",
    cwd,
  };
  return new vscode.Task(
    taskDefinition,
    scope,
    "Build smart contract",
    cwd,
    new vscode.ProcessExecution(executable, ["concordium", "build"], {
      cwd,
    })
  );
}
