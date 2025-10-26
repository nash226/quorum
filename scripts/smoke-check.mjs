import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function createSimplePdf(text, options = {}) {
  const stream = `BT
/F1 12 Tf
72 100 Td
(${escapePdfText(text)}) Tj
ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let infoObjectNumber;

  if (options.title || options.modDate) {
    infoObjectNumber = objects.length + 1;
    const infoEntries = [
      options.title ? `/Title (${escapePdfText(options.title)})` : "",
      options.modDate ? `/ModDate (${escapePdfText(options.modDate)})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    objects.push(`<< ${infoEntries} >>`);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
`;

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n 
`;
  }

  pdf += `trailer
<< /Size ${objects.length + 1} /Root 1 0 R${infoObjectNumber ? ` /Info ${infoObjectNumber} 0 R` : ""} >>
startxref
${xrefOffset}
%%EOF
`;

  return Buffer.from(pdf, "utf8");
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

  const pdfAnswerPath = join(tempDir, "pdf-answer.md");
  const pdfSourcePath = join(tempDir, "hr-policy.pdf");
  const pdfReportPath = join(tempDir, "pdf-report.json");

  writeFileSync(pdfAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");
  writeFileSync(
    pdfSourcePath,
    createSimplePdf("Employees receive 12 weeks of paid parental leave.", {
      title: "PDF HR Policy",
      modDate: "D:20260704090000Z",
    }),
  );

  const pdfStdout = runCli([
    "verify",
    "--answer",
    pdfAnswerPath,
    "--source",
    pdfSourcePath,
    "--out",
    pdfReportPath,
  ]);

  const pdfReport = readJson(pdfReportPath);
  assert.match(pdfStdout, /Quorum Verification Report/);
  assert.equal(pdfReport.summary.verified, 1);
  assert.equal(pdfReport.sources[0].title, "PDF HR Policy");

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

  const evaluationStdout = runCli([
    "evaluate",
    "--fixture",
    "examples/evaluations/hr-policy.json",
    "--fixture",
    "examples/evaluations/support-policy.json",
    "--fail-on-mismatch",
  ]);

  assert.match(evaluationStdout, /Quorum Evaluation Report/);
  assert.match(evaluationStdout, /Fixtures with mismatches: 0/);

  console.log(
    "Smoke check passed: verify, PDF verify, verify-batch, import-review, and evaluate example flows succeeded.",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
