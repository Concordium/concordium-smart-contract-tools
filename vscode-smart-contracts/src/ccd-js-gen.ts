/*
 * This module provide wrappers for ccd-js-gen providing a well-typed interface to the executable.
 */
import * as wrapperHelpers from "./executable-wrapper-helpers";
import * as vscode from "vscode";
import * as tasks from "./tasks";

/** Get the version of the executable. Printed as `ccd-js-gen x.y.z`. */
export async function version(): Promise<string> {
  const { stdout } = await wrapperHelpers.execute("ccd-js-gen", "--version");
  return `ccd-js-gen ${stdout}`;
}

/** Construct a task for running ccd-js-gen in a given directory. */
export async function generateTsJsClients(
  cwd: string,
  scope: vscode.TaskScope | vscode.WorkspaceFolder = vscode.TaskScope.Workspace,
  args: string[] = []
) {
  const executable = await wrapperHelpers.getResolvedExecutablePath(
    "ccd-js-gen"
  );
  const taskDefinition: tasks.ConcordiumTaskDefinition = {
    type: tasks.CONCORDIUM_TASK_TYPE,
    command: "generate-js-clients",
    cwd,
    args,
  };

  return new vscode.Task(
    taskDefinition,
    scope,
    "Generate TypeScript/JavaScript clients",
    cwd === "." ? "concordium" : cwd,
    new vscode.ProcessExecution(executable, args, {
      cwd,
    })
  );
}

/**
 * Get the ccd-js-gen executable.
 *
 * Uses the custom ccd-js-gen executable from settings otherwise fallbacks to the executables included in the extension.
 */
export function getResolvedExecutablePath(): Promise<string> {
  return wrapperHelpers.getResolvedExecutablePath("ccd-js-gen");
}
