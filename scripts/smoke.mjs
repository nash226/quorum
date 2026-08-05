import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cliPath = resolve(root, "dist/src/cli.js");
const answerPath = resolve(root, "examples/answers/hr-answer.md");
const sourcePath = resolve(root, "examples/sources/hr-policy.md");

const result = await new Promise((resolvePromise, reject) => {
  const child = spawn(process.execPath, [cliPath, "verify", "--answer", answerPath, "--source", sourcePath, "--json"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
});

if (result.code !== 0) {
  throw new Error(`Packaged CLI exited with ${result.code}: ${result.stderr || result.stdout}`);
}

const report = JSON.parse(result.stdout);
if (report.summary?.verified !== 1) {
  throw new Error(`Expected one verified claim, received: ${JSON.stringify(report.summary)}`);
}

console.log("Smoke check passed: packaged CLI verified the HR example.");
