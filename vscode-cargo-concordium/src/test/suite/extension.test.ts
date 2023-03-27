import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import * as Path from "node:path";
import * as os from "node:os";
import * as cargoConcordium from "../../cargo-concordium";
import * as config from "../../configuration";

// Test for the cargo-concordium module
describe("cargo-concordium module", () => {
  before(async () => {
    await vscode.extensions
      .getExtension("concordium.cargo-concordium")
      ?.activate();
  });

  // Before each test: reset the settings.
  beforeEach(async () => {
    await vscode.workspace
      .getConfiguration(config.SECTION)
      .update(config.CUSTOM_EXECUTABLE, undefined, true);
  });

  it("should print the version of cargo-concordium", async () => {
    const output = await cargoConcordium.version();
    assert.match(output, /cargo-concordium \d+\.\d+\.\d+/);
  });
});

describe("custom-executable setting", () => {
  // Activate the extension
  before(async () => {
    await vscode.extensions
      .getExtension("concordium.cargo-concordium")
      ?.activate();
  });
  // Before each test: reset the settings.
  beforeEach(async () => {
    await vscode.workspace
      .getConfiguration(config.SECTION)
      .update(config.CUSTOM_EXECUTABLE, undefined, true);
  });

  it("should use the bundled cargo-concordium when not provided", async () => {
    const path = await cargoConcordium.getResolvedExecutablePath();
    const expectedSubString = Path.join("executables", "cargo-concordium");
    assert(
      path.includes(expectedSubString),
      "Unexpected path used for executable " + path
    );
  });

  it("should fail when providing non-existing file", async () => {
    // Set a custom executable
    await vscode.workspace
      .getConfiguration(config.SECTION)
      .update(config.CUSTOM_EXECUTABLE, "my-non-existing-executable", true);

    await assert.rejects(
      () => cargoConcordium.getResolvedExecutablePath(),
      (err) => {
        assert(err instanceof config.ConfigError, "Unexpected error type");
        assert(
          err.message.includes("not exist"),
          "Error message did not mention 'not exist'"
        );
        return true;
      },
      "Custom executable is expected to fail because of not existing"
    );
  });

  // This test is skipped on windows, since the check of being executable will always return true.
  if (os.platform() !== "win32") {
    it("should fail when providing non-executable file", async () => {
      // Set a custom executable
      await vscode.workspace
        .getConfiguration(config.SECTION)
        .update(config.CUSTOM_EXECUTABLE, __filename, true);

      await assert.rejects(
        () => cargoConcordium.getResolvedExecutablePath(),
        (err) => {
          assert(err instanceof config.ConfigError, "Unexpected error type");
          assert(
            err.message.includes("not executable"),
            "Error message did not mention 'not executable'"
          );
          return true;
        },
        "Custom executable is expected to fail because of not being executable"
      );
    });
  }
});
