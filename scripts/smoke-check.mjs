import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
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

const api = await import(pathToFileURL(join(repoRoot, "dist", "src", "index.js")).href);

const tempDir = mkdtempSync(join(tmpdir(), "quorum-smoke-"));
let packedPackageFilename;

try {
  const singleReportPath = join(tempDir, "hr-report.json");
  const singleHtmlPath = join(tempDir, "hr-report.html");
  const singleReviewCsvPath = join(tempDir, "hr-review.csv");
  const singleSummaryCsvPath = join(tempDir, "hr-summary.csv");

  const singleStdout = runCli([
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--answer-label",
    "HR reviewer packet",
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
  assert.equal(readJson(singleReportPath).answerLabel, "HR reviewer packet");
  assert.match(readFileSync(singleHtmlPath, "utf8"), /Quorum Review Console/);
  assert.match(readFileSync(singleReviewCsvPath, "utf8"), /^answer_label,answer_path,/);
  assert.match(readFileSync(singleReviewCsvPath, "utf8"), /^HR reviewer packet,/m);
  assert.match(readFileSync(singleSummaryCsvPath, "utf8"), /^answer_label,answer_path,/);
  assert.match(readFileSync(singleSummaryCsvPath, "utf8"), /^HR reviewer packet,/m);

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
    "--markdown-out",
    join(tempDir, "evaluation-report.md"),
    "--fail-on-mismatch",
  ]);

  assert.match(evaluationStdout, /Quorum Evaluation Report/);
  assert.match(readFileSync(join(tempDir, "evaluation-report.md"), "utf8"), /^# Quorum Evaluation Report/);
  assert.match(evaluationStdout, /Fixtures with mismatches: 0/);

  const apiSources = await api.loadSourcesFromContent({
    sources: [
      {
        sourcePath: "policies/hr-policy.md",
        content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
      },
    ],
  });
  const apiVerificationResult = api.verifyAnswerResult({
    answer: "Employees receive 12 weeks of paid parental leave.",
    answerPath: "answers/hr.md",
    sources: apiSources,
    failOn: ["contradicted"],
    generatedAt: "2026-07-06T00:00:00.000Z",
  });
  assert.equal(apiVerificationResult.shouldFail, false);
  assert.equal(apiVerificationResult.report.summary.verified, 1);
  assert.equal(apiVerificationResult.report.answerPath, "answers/hr.md");

  const apiFileInputResult = await api.verifyAnswerFileInputsResult({
    answerPath: join(repoRoot, "examples", "answers", "support-answer.md"),
    sourcePaths: [],
    sourceDirs: [join(repoRoot, "examples", "sources")],
    failOn: ["contradicted"],
    generatedAt: "2026-07-06T00:05:00.000Z",
  });
  assert.equal(apiFileInputResult.shouldFail, true);
  assert.deepEqual(apiFileInputResult.failVerdicts, ["contradicted"]);
  assert.equal(apiFileInputResult.report.summary.verified, 1);
  assert.equal(apiFileInputResult.report.summary.contradicted, 1);
  assert.equal(apiFileInputResult.report.answerPath, join(repoRoot, "examples", "answers", "support-answer.md"));

  const apiReviewImportResult = api.importReviewerDecisionContentsResult(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
`,
    ["unsupported"],
  );
  assert.equal(apiReviewImportResult.shouldFail, false);
  assert.equal(apiReviewImportResult.report.answerGroups[0]?.label, "HR answer");
  assert.equal(apiReviewImportResult.report.answerGroups[0]?.summary.verified, 1);

  const apiEvaluationFixtureResult = await api.evaluateFixtureContentResult({
    fixturePath: join(repoRoot, "examples", "evaluations", "hr-policy.json"),
    content: readFileSync(join(repoRoot, "examples", "evaluations", "hr-policy.json")),
    generatedAt: "2026-07-06T00:00:00.000Z",
  });
  assert.equal(apiEvaluationFixtureResult.hasMismatch, false);
  assert.equal(apiEvaluationFixtureResult.scorecard.summaryMatches, true);

  const resolverDir = join(tempDir, "resolver-fixtures");
  const resolverAnswerDir = join(resolverDir, "answers");
  const resolverNestedAnswerDir = join(resolverAnswerDir, "nested");
  const resolverSourceDir = join(resolverDir, "sources");
  const resolverNestedSourceDir = join(resolverSourceDir, "nested");
  const explicitAnswerPath = join(resolverDir, "explicit-answer.md");
  const explicitSourcePath = join(resolverDir, "explicit-source.md");
  const directoryAnswerPath = join(resolverAnswerDir, "a-answer.md");
  const nestedAnswerPath = join(resolverNestedAnswerDir, "b-answer.txt");
  const directorySourcePath = join(resolverSourceDir, "a-source.md");
  const nestedSourcePath = join(resolverNestedSourceDir, "b-source.html");

  mkdirSync(resolverNestedAnswerDir, { recursive: true });
  mkdirSync(resolverNestedSourceDir, { recursive: true });
  writeFileSync(explicitAnswerPath, "Explicit answer.\n", "utf8");
  writeFileSync(directoryAnswerPath, "Directory answer.\n", "utf8");
  writeFileSync(nestedAnswerPath, "Nested answer.\n", "utf8");
  writeFileSync(explicitSourcePath, "Explicit source.\n", "utf8");
  writeFileSync(directorySourcePath, "Directory source.\n", "utf8");
  writeFileSync(
    nestedSourcePath,
    "<html><body><main><p>Nested source.</p></main></body></html>",
    "utf8",
  );

  assert.deepEqual(await api.resolveAnswerPaths([explicitAnswerPath], [resolverAnswerDir]), [
    explicitAnswerPath,
    directoryAnswerPath,
    nestedAnswerPath,
  ]);
  assert.deepEqual(await api.resolveSourcePaths([explicitSourcePath], [resolverSourceDir]), [
    explicitSourcePath,
    directorySourcePath,
    nestedSourcePath,
  ]);

  const packedPackage = JSON.parse(runCommand("npm", ["pack", "--json"]))[0];
  assert.ok(packedPackage);
  packedPackageFilename = packedPackage.filename;
  const packedPaths = new Set(packedPackage.files.map((file) => file.path));
  assert.ok(packedPaths.has("dist/src/index.js"));
  assert.ok(packedPaths.has("dist/src/index.d.ts"));
  assert.ok(packedPaths.has("dist/src/cli.js"));
  assert.ok(packedPaths.has("README.md"));
  assert.ok(!packedPaths.has("src/index.ts"));
  assert.ok(!packedPaths.has("tests/api.test.ts"));

  const consumerDir = mkdtempSync(join(tempDir, "consumer-"));
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "quorum-smoke-consumer",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
  runCommand("npm", ["install", join(repoRoot, packedPackage.filename)], {
    cwd: consumerDir,
    stdio: "pipe",
  });
  const consumerImportPath = join(consumerDir, "consumer-import.mjs");
  writeFileSync(
    consumerImportPath,
    `import { verifyAnswerResult } from "quorum";

const report = verifyAnswerResult({
  answer: "Employees receive 12 weeks of paid parental leave.",
  sources: [
    {
      id: "source_1",
      title: "HR Policy",
      trustLevel: "high",
      content: "Employees receive 12 weeks of paid parental leave.",
    },
  ],
  generatedAt: "2026-07-06T00:00:00.000Z",
});

if (report.report.summary.verified !== 1) {
  throw new Error("Expected packed quorum import to verify one claim.");
}
`,
    "utf8",
  );
  runCommand("node", [consumerImportPath], { cwd: consumerDir });

  const consumerTypecheckPath = join(consumerDir, "consumer-import.ts");
  const consumerTsconfigPath = join(consumerDir, "tsconfig.json");
  writeFileSync(
    consumerTypecheckPath,
    `import {
  verifyAnswerContentsResult,
  verifyAnswerResult,
  type InMemorySingleVerificationResultOptions,
  type SourceDocument,
} from "quorum";

const sources: SourceDocument[] = [
  {
    id: "source_1",
    title: "HR Policy",
    trustLevel: "high",
    content: "Employees receive 12 weeks of paid parental leave.",
  },
];

const report = verifyAnswerResult({
  answer: "Employees receive 12 weeks of paid parental leave.",
  sources,
  generatedAt: "2026-07-06T00:00:00.000Z",
});

if (report.report.summary.verified !== 1) {
  throw new Error("Expected packed quorum types to resolve through the package entrypoint.");
}

const rawOptions: InMemorySingleVerificationResultOptions = {
  answer: "Employees receive 12 weeks of paid parental leave.",
  sources: [
    {
      sourcePath: "policies/hr-policy.md",
      content: "Employees receive 12 weeks of paid parental leave.",
    },
  ],
  failOn: ["contradicted"],
  generatedAt: "2026-07-06T00:10:00.000Z",
};

await verifyAnswerContentsResult(rawOptions);
`,
    "utf8",
  );
  writeFileSync(
    consumerTsconfigPath,
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          noEmit: true,
        },
        include: ["consumer-import.ts"],
      },
      null,
      2,
    ),
  );
  runCommand(
    "node",
    [join(repoRoot, "node_modules", "typescript", "bin", "tsc"), "-p", consumerTsconfigPath],
    { cwd: consumerDir },
  );

  console.log(
    "Smoke check passed: CLI flows, built package helpers, and packed npm entrypoints succeeded.",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
  if (packedPackageFilename) {
    rmSync(join(repoRoot, packedPackageFilename), { force: true });
  }
}
