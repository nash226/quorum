import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDir = await mkdtemp(join(root, ".demo-check-"));

function runDemo() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "verify", "--answer", "examples/answers/hr-answer.md", "--source-dir", "examples/sources", "--out", join(outputDir, "report.json")],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

try {
  const result = await runDemo();
  if (result.code !== 0) {
    throw new Error(`demo verification exited with ${result.code}: ${result.stderr.trim()}`);
  }
  const report = JSON.parse(await readFile(join(outputDir, "report.json"), "utf8"));
  const claimCount = Object.values(report.summary ?? {}).reduce(
    (total, count) => total + (typeof count === "number" ? count : 0),
    0,
  );
  if (claimCount < 1 || !Array.isArray(report.sources) || report.sources.length < 1) {
    throw new Error("demo verification produced no claim summary");
  }
  console.log(`Demo check passed: ${claimCount} claim(s) classified against ${report.sources.length} source(s).`);
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
