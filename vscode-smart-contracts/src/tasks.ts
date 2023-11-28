/*
 * This module contains types relevant for creating VS Code tasks.
 */
import * as vscode from "vscode";

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
  command: "build" | "test" | "generate-js-clients";
  cwd?: string;
  args?: string[];
}
