/*
 * This module provide wrappers for ccd-js-gen providing a well-typed interface to the executable.
 */
import * as wrapperHelpers from "./executable-wrapper-helpers";

/** Get the version of the executable. Printed as `ccd-js-gen x.y.z`. */
export async function version(): Promise<string> {
  const { stdout } = await wrapperHelpers.execute("ccd-js-gen", "--version");
  return `ccd-js-gen ${stdout}`;
}

/** Generate Javascript/Typescript clients from the provided Wasm module and place them in the provided output folder. */
export async function generateContractClientsFromFile(moduleFilePath: string, outDirPath: string) {
  await wrapperHelpers.execute("ccd-js-gen", "--module", moduleFilePath, "--out-dir", outDirPath);
}

/**
 * Get the ccd-js-gen executable.
 *
 * Uses the custom ccd-js-gen executable from settings otherwise fallbacks to the executables included in the extension.
 */
export async function getResolvedExecutablePath(): Promise<string> {
  return wrapperHelpers.getResolvedExecutablePath("ccd-js-gen");
}
