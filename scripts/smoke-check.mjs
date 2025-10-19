import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const cliPath = join(repoRoot, "dist", "src", "cli.js");

function requireBuiltCli() {
  try {
    statSync(cliPath);
  } catch {
    throw new Error("Missing dist/src/cli.js. Run `npm run build` before `npm run smoke`.");
  }
}

function runCli(args, options = {}) {
  return execFileSync("node", [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

requireBuiltCli();

const tempDir = mkdtempSync(join(tmpdir(), "quorum-smoke-"));

try {
  const singleReportPath = join(tempDir, "hr-report.json");
  const singleHtmlPath = join(tempDir, "hr-report.html");
  const singleReviewCsvPath = join(tempDir, "hr-review.csv");
  const singleSummaryCsvPath = join(tempDir, "hr-summary.csv");

  const singleStdout = runCli([
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source-dir",
    "examples/sources",
    "--out",
    singleReportPath,
    "--html-out",
    singleHtmlPath,
    "--review-csv-out",
    singleReviewCsvPath,
    "--summary-csv-out",
    singleSummaryCsvPath,
  ]);

  assert.match(singleStdout, /Quorum Verification Report/);
  assert.equal(readJson(singleReportPath).summary.contradicted, 1);
  assert.match(readFileSync(singleHtmlPath, "utf8"), /Quorum Review Console/);
  assert.match(readFileSync(singleReviewCsvPath, "utf8"), /^answer_label,answer_path,/);
  assert.match(readFileSync(singleSummaryCsvPath, "utf8"), /^answer_label,answer_path,/);

  const batchReportPath = join(tempDir, "batch-report.json");
  const batchReviewCsvPath = join(tempDir, "batch-review.csv");
  const batchSummaryCsvPath = join(tempDir, "batch-summary.csv");

  const batchStdout = runCli([
    "verify-batch",
    "--answer-dir",
    "examples/answers",
    "--source-dir",
    "examples/sources",
    "--out",
    batchReportPath,
    "--review-csv-out",
    batchReviewCsvPath,
    "--summary-csv-out",
    batchSummaryCsvPath,
  ]);

  assert.match(batchStdout, /Quorum Batch Verification Report/);
  assert.equal(readJson(batchReportPath).answerCount, 2);
  assert.match(readFileSync(batchReviewCsvPath, "utf8"), /^answer_label,answer_path,/);
  assert.match(readFileSync(batchSummaryCsvPath, "utf8"), /^answer_label,answer_path,/);

  const importReportPath = join(tempDir, "review-import.json");
  const importSummaryCsvPath = join(tempDir, "review-import-summary.csv");
  const importStdout = runCli(
    [
      "import-review",
      "--review-csv",
      "-",
      "--out",
      importReportPath,
      "--summary-csv-out",
      importSummaryCsvPath,
    ],
    {
      input: readFileSync(batchReviewCsvPath, "utf8"),
    },
  );

  assert.match(importStdout, /Quorum Reviewer Decision Import/);
  assert.equal(readJson(importReportPath).answerGroups.length, 2);
  assert.match(readFileSync(importSummaryCsvPath, "utf8"), /^answer_label,answer_path,/);

  console.log("Smoke check passed: verify, verify-batch, and import-review example flows succeeded.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
