/*
 * This module provide wrappers for cargo-concordium providing a well-typed interface to the executable.
 */
import * as vscode from "vscode";
import * as wrapperHelpers from "./executable-wrapper-helpers";
import * as tasks from "./tasks";

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

/** Construct a task for running cargo-concordium build in a given directory. */
export async function build(
  cwd: string,
  scope: vscode.TaskScope | vscode.WorkspaceFolder = vscode.TaskScope.Workspace,
  args: string[] = []
) {
  const executable = await wrapperHelpers.getResolvedExecutablePath("cargo-concordium");
  const taskDefinition: tasks.ConcordiumTaskDefinition = {
    type: tasks.CONCORDIUM_TASK_TYPE,
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
  const taskDefinition: tasks.ConcordiumTaskDefinition = {
    type: tasks.CONCORDIUM_TASK_TYPE,
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
