/*
 * This module provide wrappers for cargo-concordium providing a well-typed interface to the executable.
 */
import * as vscode from "vscode";
import * as wrapperHelpers from "./executable-wrapper-helpers";

/** Get the version of the executable */
export async function version(): Promise<string> {
  const { stdout } = await wrapperHelpers.execute("cargo-concordium", "--version");
  return stdout;
}

/**
 * Get the cargo-concordium executable.
 *
 * Uses the custom cargo-concordium executable from settings otherwise fallbacks to the executables included in the extension.
 */
export async function getResolvedExecutablePath(): Promise<string> {
  return wrapperHelpers.getResolvedExecutablePath("cargo-concordium");
}

/**
 * Task type. Used by VS Code to match a task provider with a task provided by the user.
 * Should match the schema specified in the package.json (contributes.taskDefinitions)
 */
export const CONCORDIUM_TASK_TYPE = "concordium";

/**
 * Task definition for tasks provided by this extension.
 * Captures the information to construct a task and should match the schema
 * specified in the package.json (contributes.taskDefinitions).
 */
export interface ConcordiumTaskDefinition extends vscode.TaskDefinition {
  type: typeof CONCORDIUM_TASK_TYPE;
  command: "build" | "test";
  cwd?: string;
  args?: string[];
}

/** Construct a task for running cargo-concordium build in a given directory. */
export async function build(
  cwd: string,
  scope: vscode.TaskScope | vscode.WorkspaceFolder = vscode.TaskScope.Workspace,
  args: string[] = []
) {
  const executable = await wrapperHelpers.getResolvedExecutablePath("cargo-concordium");
  const taskDefinition: ConcordiumTaskDefinition = {
    type: CONCORDIUM_TASK_TYPE,
    command: "build",
    cwd,
    args,
  };

  return new vscode.Task(
    taskDefinition,
    scope,
    "Build smart contract",
    cwd === "." ? "concordium" : cwd,
    new vscode.ProcessExecution(executable, ["concordium", "build", ...args], {
      cwd,
    })
  );
}

/** Construct a task for running cargo-concordium test in a given directory. */
export async function test(
  cwd: string,
  scope: vscode.TaskScope | vscode.WorkspaceFolder = vscode.TaskScope.Workspace,
  args: string[] = []
) {
  const executable = await wrapperHelpers.getResolvedExecutablePath("cargo-concordium");
  const taskDefinition: ConcordiumTaskDefinition = {
    type: CONCORDIUM_TASK_TYPE,
    command: "test",
    cwd,
    args,
  };
  return new vscode.Task(
    taskDefinition,
    scope,
    "Test smart contract",
    cwd === "." ? "concordium" : cwd,
    new vscode.ProcessExecution(executable, ["concordium", "test", ...args], {
      cwd,
    })
  );
}
