import * as path from "path";
import * as Mocha from "mocha";
import * as glob from "glob";

const testsRoot = path.resolve(__dirname, "..");

/**
 * Test runner entry function. This is a special function called by the test-instance of VS Code.
 * It assumes that test suites have the `test.ts` file extension (`test.js` when compiled).
 */
export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    color: true,
  });

  return new Promise((resolve, reject) => {
    glob("**/**.test.js", { cwd: testsRoot }, (err, files) => {
      if (err) {
        return reject(err);
      }

      // Add files to the test suite
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run((failures) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  });
}
