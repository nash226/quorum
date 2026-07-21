import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputPath = join(tmpdir(), `quorum-smoke-${process.pid}.json`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${signal ?? code}`));
      }
    });
  });
}

try {
  await run(process.execPath, [
    "dist/src/cli.js",
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source-dir",
    "examples/sources",
    "--out",
    outputPath,
  ]);

  const report = JSON.parse(await readFile(outputPath, "utf8"));
  if (report.summary?.contradicted !== 1 || report.summary?.verified !== 1) {
    throw new Error("packaged CLI smoke report did not match the HR example summary");
  }
  console.log("Packaged CLI smoke check passed.");
} finally {
  await rm(outputPath, { force: true });
}
