import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync(
  process.execPath,
  [
    "dist/src/cli.js",
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source-dir",
    "examples/sources",
    "--json",
  ],
  { maxBuffer: 1024 * 1024 },
);

const report = JSON.parse(stdout);
if (report.summary?.verified !== 1 || report.summary?.contradicted !== 1) {
  throw new Error("CLI smoke check produced unexpected HR fixture verdicts");
}

console.log("CLI smoke check passed: HR fixture produced expected verdicts");
