import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = mkdtempSync(join(tmpdir(), "quorum-smoke-"));

try {
  const result = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [
      "run",
      "dev",
      "--",
      "verify",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source-dir",
      "examples/sources",
      "--out",
      join(outputDir, "report.json"),
      "--markdown-out",
      join(outputDir, "report.md"),
      "--html-out",
      join(outputDir, "report.html"),
      "--review-csv-out",
      join(outputDir, "review.csv"),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  const report = JSON.parse(readFileSync(join(outputDir, "report.json"), "utf8"));
  const claimCount = Object.values(report.summary ?? {}).reduce(
    (total, count) => total + (typeof count === "number" ? count : 0),
    0,
  );
  if (claimCount !== 3) {
    throw new Error("Smoke verification did not produce the expected three-claim report");
  }

  for (const filename of ["report.md", "report.html", "review.csv"]) {
    readFileSync(join(outputDir, filename));
  }

  console.log("Smoke check passed: verify generated JSON, Markdown, HTML, and reviewer CSV outputs.");
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}
