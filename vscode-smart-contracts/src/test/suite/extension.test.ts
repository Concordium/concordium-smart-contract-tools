import * as assert from "assert";

// You can import and use all APIs from the 'vscode' module
// as well as import your extension to test it.
import * as vscode from "vscode";
import * as Path from "node:path";
import * as os from "node:os";
import * as cargoConcordium from "../../cargo-concordium";
import * as config from "../../configuration";
import * as ccdJsGen from "../../ccd-js-gen";

// Test for the cargo-concordium module
describe("cargo-concordium module", () => {
  prepareTest();

  it("should print the version of cargo-concordium", async () => {
    const output = await cargoConcordium.version();
    assert.match(output, /cargo-concordium \d+\.\d+\.\d+/);
  });
});

describe("custom-executable setting for cargo-concordium", () => {
  prepareTest();

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
      .update(
        config.CUSTOM_CARGO_CONCORDIUM_EXECUTABLE,
        "my-non-existing-executable",
        true
      );

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
        .update(config.CUSTOM_CARGO_CONCORDIUM_EXECUTABLE, __filename, true);

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

// Test for the ccd-js-gen module.
describe("ccd-js-gen module", () => {
  prepareTest();

  it("should print the version of ccd-js-gen", async function () {
    // Use `function` syntax instead of arrow (=>) to get access to `this`.
    // Then increase the timeout to 3000ms for this test, as loading ccdJsGen is quite slow sometimes.
    // Especially in the CI where it frequently exceeds the default timeout limit of 2000ms.
    this.timeout(3000);
    const output = await ccdJsGen.version();
    assert.match(output, /ccd-js-gen \d+\.\d+\.\d+/);
  });
});

describe("custom-executable setting for ccd-js-gen", () => {
  prepareTest();

  it("should use the bundled ccd-js-gen when not provided", async () => {
    const path = await ccdJsGen.getResolvedExecutablePath();
    const expectedSubString = Path.join("node_modules", ".bin", "ccd-js-gen");
    assert(
      path.includes(expectedSubString),
      "Unexpected path used for ccd-js-gen executable " + path
    );
  });

  it("should fail when providing non-existing file", async () => {
    // Set a custom executable
    await vscode.workspace
      .getConfiguration(config.SECTION)
      .update(
        config.CUSTOM_CCD_JS_GEN_EXECUTABLE,
        "my-non-existing-executable",
        true
      );

    await assert.rejects(
      () => ccdJsGen.getResolvedExecutablePath(),
      (err) => {
        assert(err instanceof config.ConfigError, "Unexpected error type");
        assert(
          err.message.includes("not exist"),
          "Error message did not mention 'not exist'"
        );
        return true;
      },
      "Custom ccd-js-gen executable is expected to fail because of not existing"
    );
  });

  // This test is skipped on windows, since the check of being executable will always return true.
  if (os.platform() !== "win32") {
    it("should fail when providing non-executable file", async () => {
      // Set a custom executable
      await vscode.workspace
        .getConfiguration(config.SECTION)
        .update(config.CUSTOM_CCD_JS_GEN_EXECUTABLE, __filename, true);

      await assert.rejects(
        () => ccdJsGen.getResolvedExecutablePath(),
        (err) => {
          assert(err instanceof config.ConfigError, "Unexpected error type");
          assert(
            err.message.includes("not executable"),
            "Error message did not mention 'not executable'"
          );
          return true;
        },
        "Custom ccd-js-gen executable is expected to fail because of not being executable"
      );
    });
  }
});

/** Prepare the test case by:
 *
 * - Activating the extension with a `before` hook.
 * - Resetting the custom executable settings for cargo-concordium and ccd-js-gen with a `beforeEach` hook.
 *
 * Activate the extension with the `before` hook. */
function prepareTest() {
  // Activate the extension
  before(async () => {
    await vscode.extensions
      .getExtension("concordium.concordium-smart-contracts")
      ?.activate();
  });
  beforeEach(async () => {
    await vscode.workspace
      .getConfiguration(config.SECTION)
      .update(config.CUSTOM_CARGO_CONCORDIUM_EXECUTABLE, undefined, true);
    await vscode.workspace
      .getConfiguration(config.SECTION)
      .update(config.CUSTOM_CCD_JS_GEN_EXECUTABLE, undefined, true);
  });
}
