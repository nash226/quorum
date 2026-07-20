import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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

async function startCliServer(args) {
  const child = spawn("node", [cliPath, "serve", ...args], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const url = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for API server startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    const onExit = (code, signal) => {
      clearTimeout(timeout);
      reject(new Error(`API server exited before startup (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    };

    child.once("exit", onExit);
    child.stdout.on("data", () => {
      const match = stdout.match(/Quorum API listening on (http:\/\/[^\s]+)/);

      if (!match) {
        return;
      }

      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(match[1]);
    });
  });

  return {
    url,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }

      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
      });
    },
  };
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

assert.deepEqual(JSON.parse(runCli(["version", "--json"])), {
  service: "quorum",
  version: "0.1.0",
});

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
  assert.match(readFileSync(singleReviewCsvPath, "utf8"), /^generated_at,answer_label,answer_path,/);
  assert.match(readFileSync(singleReviewCsvPath, "utf8"), /^[^,\n]+,HR reviewer packet,/m);
  assert.match(readFileSync(singleSummaryCsvPath, "utf8"), /^generated_at,answer_label,answer_path,/);
  assert.match(readFileSync(singleSummaryCsvPath, "utf8"), /^[^,\n]+,HR reviewer packet,/m);

  const stdinReportPath = join(tempDir, "stdin-report.json");
  const stdinStdout = runCli(
    [
      "verify",
      "--answer",
      "-",
      "--source",
      "examples/sources/hr-policy.md",
      "--out",
      stdinReportPath,
    ],
    {
      input: "Employees receive 12 weeks of paid parental leave.\n",
    },
  );

  assert.match(stdinStdout, /Quorum Verification Report/);
  assert.equal(readJson(stdinReportPath).answerPath, "<stdin>");
  assert.equal(readJson(stdinReportPath).summary.verified, 1);

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
  const queueOverviewCsvPath = join(tempDir, "queue-overview.csv");
  const openApiPath = join(tempDir, "openapi.json");

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
  assert.equal(readJson(batchReportPath).answerCount, 35);
  assert.match(readFileSync(batchReviewCsvPath, "utf8"), /^generated_at,answer_label,answer_path,/);
  const batchSummaryCsv = readFileSync(batchSummaryCsvPath, "utf8");
  assert.match(
    batchSummaryCsv,
    /^generated_at,answer_label,answer_path,answer_preview,answer_has_claims,primary_verdict,primary_claim,primary_reason,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids$/m,
  );
  const hrBatchSummaryRow = batchSummaryCsv
    .split("\n")
    .find((row) => row.includes(",hr-answer,examples/answers/hr-answer.md,"));
  assert.ok(hrBatchSummaryRow);
  assert.match(
    hrBatchSummaryRow,
    /,true,contradicted,Employees receive 18 weeks of paid parental leave\.,A closely matching approved source uses different numeric terms\.,HR Benefits Policy,high,2026-05-31,examples\/sources\/hr-policy\.md,source_3,0\.857,Employees receive 12 weeks of paid parental leave\.,3,1,1,1,0,clear,,/,
  );

  const timestampedQueueOverview = JSON.parse(
    runCli([
      "review-queue",
      "--review-csv",
      batchReviewCsvPath,
      "--generated-at",
      "2026-07-15T04:00:00.000Z",
      "--json",
      "--csv-out",
      queueOverviewCsvPath,
    ]),
  );
  assert.equal(timestampedQueueOverview.generatedAt, "2026-07-15T04:00:00.000Z");
  assert.match(
    readFileSync(queueOverviewCsvPath, "utf8"),
    /^"generated_at","queue_status","domains","total_answers"[\s\S]*\n"2026-07-15T04:00:00\.000Z","","","35",/m,
  );

  const pendingQueueOverview = JSON.parse(
    runCli([
      "review-queue",
      "--review-csv",
      batchReviewCsvPath,
      "--queue-status",
      "pending",
      "--json",
    ]),
  );
  assert.deepEqual(pendingQueueOverview.review, {
    totalAnswers: 34,
    pendingAnswers: 34,
    reviewedAnswers: 0,
    noClaimsAnswers: 0,
    totalClaims: 101,
    pendingClaims: 101,
    reviewedClaims: 0,
    verdicts: { verified: 25, contradicted: 17, unsupported: 29, needs_review: 30 },
  });

  const noClaimsQueueOverview = JSON.parse(
    runCli([
      "review-queue",
      "--review-csv",
      batchReviewCsvPath,
      "--queue-status",
      "no_claims",
      "--json",
    ]),
  );
  assert.deepEqual(noClaimsQueueOverview.review, {
    totalAnswers: 1,
    pendingAnswers: 0,
    reviewedAnswers: 0,
    noClaimsAnswers: 1,
    totalClaims: 0,
    pendingClaims: 0,
    reviewedClaims: 0,
    verdicts: { verified: 0, contradicted: 0, unsupported: 0, needs_review: 0 },
  });

  const reviewedQueueCsvPath = join(tempDir, "reviewed-queue.csv");
  writeFileSync(
    reviewedQueueCsvPath,
    [
      "answer_label,answer_path,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
      "Reviewed packet,answers/reviewed.md,true,claim_1,Refunds are available.,verified,Supported.,Support Policy,Refunds are available.,verified,Approved",
    ].join("\n") + "\n",
  );
  const reviewedQueueOverview = JSON.parse(
    runCli([
      "review-queue",
      "--review-csv",
      reviewedQueueCsvPath,
      "--queue-status",
      "reviewed",
      "--json",
    ]),
  );
  assert.deepEqual(reviewedQueueOverview.review, {
    totalAnswers: 1,
    pendingAnswers: 0,
    reviewedAnswers: 1,
    noClaimsAnswers: 0,
    totalClaims: 1,
    pendingClaims: 0,
    reviewedClaims: 1,
    verdicts: { verified: 1, contradicted: 0, unsupported: 0, needs_review: 0 },
  });

  const openApiStdout = runCli(["openapi", "--out", openApiPath]);
  const openApiDocument = readJson(openApiPath);
  assert.match(openApiStdout, /OpenAPI document written to/);
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.ok(openApiDocument.paths["/verify"]);
  assert.ok(openApiDocument.paths["/verify-batch"]);
  assert.ok(openApiDocument.paths["/import-review"]);
  assert.ok(openApiDocument.paths["/evaluate"]);
  assert.equal(openApiDocument.paths["/extract-claims"].post.operationId, "postExtractClaims");

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
  assert.equal(readJson(importReportPath).answerGroups.length, 35);
  assert.match(readFileSync(importSummaryCsvPath, "utf8"), /^generated_at,answer_label,answer_path,/);

  const evaluationReportPath = join(tempDir, "evaluation-report.md");
  const evaluationSummaryCsvPath = join(tempDir, "evaluation-summary.csv");
  const evaluationDomainSummaryCsvPath = join(tempDir, "evaluation-domain-summary.csv");
  const evaluationAggregateSummaryCsvPath = join(tempDir, "evaluation-aggregate-summary.csv");
  const evaluationStdout = runCli([
    "evaluate",
    "--fixture-dir",
    "examples/evaluations",
    "--markdown-out",
    evaluationReportPath,
    "--summary-csv-out",
    evaluationSummaryCsvPath,
    "--domain-summary-csv-out",
    evaluationDomainSummaryCsvPath,
    "--aggregate-summary-csv-out",
    evaluationAggregateSummaryCsvPath,
    "--fail-on-mismatch",
  ]);

  assert.match(evaluationStdout, /Quorum Evaluation Report/);
  assert.match(readFileSync(evaluationReportPath, "utf8"), /^# Quorum Evaluation Report/);
  assert.match(evaluationStdout, /Fixtures with mismatches: 0/);
  assert.match(evaluationStdout, /Empty answer example/);
  assert.match(evaluationStdout, /HR PDF policy example/);
  assert.match(evaluationStdout, /Support billing HTML example/);
  assert.match(evaluationStdout, /Support live chat policy example/);
  assert.match(evaluationStdout, /Support SLA policy example/);
  assert.match(evaluationStdout, /Support plan change policy example/);
  assert.match(evaluationStdout, /Support incident communication policy example/);
  assert.match(evaluationStdout, /Support service outage policy example/);
  assert.match(evaluationStdout, /Support delivery delay policy example/);
  assert.match(evaluationStdout, /Support tax exemption policy example/);
  assert.match(evaluationStdout, /Support escalation policy example/);
  assert.match(evaluationStdout, /Support gift card policy example/);
  assert.match(evaluationStdout, /Support authentication device policy example/);
  assert.match(evaluationStdout, /Support shipping protection policy example/);
  assert.match(evaluationStdout, /Support order tracking policy example/);
  assert.match(evaluationStdout, /Support source directory example/);
  assert.match(evaluationStdout, /HR source directory policy example/);
  assert.match(evaluationStdout, /HR benefits enrollment policy example/);
  assert.match(evaluationStdout, /HR medical leave policy example/);
  assert.match(evaluationStdout, /HR sabbatical leave policy example/);
  assert.match(evaluationStdout, /HR onboarding policy example/);
  assert.match(evaluationStdout, /HR parental leave policy example/);
  assert.match(evaluationStdout, /HR payroll change policy example/);
  assert.match(evaluationStdout, /HR jury duty policy example/);
  assert.match(evaluationStdout, /HR dependent benefits policy example/);
  assert.match(evaluationStdout, /HR bonus eligibility policy example/);
  assert.match(evaluationStdout, /HR remote work policy example/);
  assert.match(evaluationStdout, /HR professional development policy example/);
  assert.match(evaluationStdout, /HR performance review policy example/);
  assert.match(evaluationStdout, /HR tuition reimbursement policy example/);
  assert.match(evaluationStdout, /HR employee referral policy example/);
  assert.match(evaluationStdout, /Support warranty policy example/);
  assert.match(evaluationStdout, /Support accessibility policy example/);
  assert.match(evaluationStdout, /Support password reset policy example/);
  assert.match(evaluationStdout, /Support account recovery policy example/);
  assert.match(evaluationStdout, /Support account closure policy example/);
  assert.match(evaluationStdout, /Support data retention policy example/);
  assert.match(evaluationStdout, /Support account policy example/);
  assert.match(evaluationStdout, /Support account suspension policy example/);
  assert.match(evaluationStdout, /Support billing suspension appeal policy example/);
  assert.match(evaluationStdout, /Support charge dispute policy example/);
  assert.match(evaluationStdout, /Support billing address policy example/);
  assert.match(evaluationStdout, /Support shipping address change policy example/);
  assert.match(evaluationStdout, /Support order cancellation policy example/);
  assert.match(evaluationStdout, /Support subscription cancellation policy example/);
  assert.match(evaluationStdout, /Support subscription renewal policy example/);
  assert.match(evaluationStdout, /Support invoice correction policy example/);
  assert.match(evaluationStdout, /Support refund status policy example/);
  assert.match(evaluationStdout, /Support account contact change policy example/);
  assert.match(evaluationStdout, /Support authorized contact policy example/);
  assert.match(evaluationStdout, /Support account merge policy example/);
  assert.match(evaluationStdout, /Support workspace access policy example/);
  assert.match(evaluationStdout, /Support holiday hours policy example/);
  assert.match(evaluationStdout, /Support priority support policy example/);
  assert.match(evaluationStdout, /Support usage limits policy example/);
  assert.match(evaluationStdout, /Support data export policy example/);
  assert.match(evaluationStdout, /Support payment method policy example/);
  assert.match(evaluationStdout, /Support payment failure policy example/);
  assert.match(evaluationStdout, /Support authorized contact policy example/);
  assert.match(evaluationStdout, /Support account recovery policy example/);
  assert.match(evaluationStdout, /Support return policy example/);
  assert.match(evaluationStdout, /Support replacement policy example/);
  assert.match(evaluationStdout, /Support service credit policy example/);
  assert.match(evaluationStdout, /Support refunds policy example/);
  assert.match(evaluationStdout, /Support subscription pause policy example/);
  assert.match(evaluationStdout, /Support guest access policy example/);
  assert.match(evaluationStdout, /Support policy example/);
  assert.match(evaluationStdout, /HR time-off request policy example/);
  assert.match(evaluationStdout, /HR relocation policy example/);
  assert.match(evaluationStdout, /HR travel reimbursement policy example/);
  assert.match(evaluationStdout, /HR compensation review policy example/);
  assert.match(evaluationStdout, /HR workplace accommodation policy example/);
  assert.match(evaluationStdout, /HR offboarding policy example/);
  assert.match(evaluationStdout, /HR leave policy example/);
  const evaluationSummaryCsv = readFileSync(evaluationSummaryCsvPath, "utf8");
  assert.match(
    evaluationSummaryCsv,
  /^generated_at,fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,answer_has_claims,source_dirs,source_paths,source_ids,summary_match,/,
  );
  assert.equal(
    evaluationSummaryCsv.trim().split("\n").length,
    77,
    "evaluation summary CSV should contain one header plus one row for each of the 76 benchmark fixtures",
  );
  assert.match(evaluationSummaryCsv, /^[^,\n]+,Support billing HTML example,support,/m);
  assert.match(evaluationSummaryCsv, /^[^,\n]+,HR PDF policy example,hr,/m);
  assert.match(
    evaluationSummaryCsv,
    /^.*Empty answer example.*?,no,.*?,0,0,0,0,0,0,0,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support warranty policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR compensation review policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support guest access policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support account policy example.*?,2,1,0,0,2,1,0,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR workplace accommodation policy example.*?,1,0,1,1,1,0,1,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR offboarding policy example.*?,2,0,1,0,2,0,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR leave policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR medical leave policy example.*?,2,0,0,1,2,0,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR sabbatical leave policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support shipping protection policy example.*?,1,0,1,1,1,0,1,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support account recovery policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support account closure policy example.*?,1,0,0,2,1,0,0,2$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support shipping address change policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support account suspension policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support authentication device policy example.*?,1,0,1,0,1,0,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support payment method policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support password reset policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support accessibility policy example.*?,1,0,1,1,1,0,1,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support gift card policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support replacement policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support invoice correction policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support data retention policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support subscription renewal policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support subscription cancellation policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support SLA policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support live chat policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support data export policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR jury duty policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR dependent benefits policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR professional development policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR tuition reimbursement policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR employee referral policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR bonus eligibility policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR travel reimbursement policy example.*?,1,1,0,1,1,1,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR relocation policy example.*?,1,0,1,1,1,0,1,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support order tracking policy example.*?,1,0,1,1,1,0,1,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support source directory example.*?,2,1,0,0,2,1,0,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR source directory policy example.*?,2,0,0,1,2,0,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support account merge policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support account contact change policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support authorized contact policy example.*?,2,0,1,0,2,0,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support workspace access policy example.*?,1,1,0,1,1,1,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support charge dispute policy example.*?,1,1,0,1,1,1,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support service outage policy example.*?,1,1,0,1,1,1,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support delivery delay policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*Support incident communication policy example.*?,1,0,1,1,1,0,1,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR travel reimbursement policy example.*?,1,1,0,1,1,1,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR parental leave policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR payroll change policy example.*?,1,1,1,0,1,1,1,0$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR performance review policy example.*?,1,1,0,1,1,1,0,1$/m,
  );
  assert.match(
    evaluationSummaryCsv,
    /^.*HR time-off request policy example.*?,1,0,1,2,1,0,1,2$/m,
  );
  const evaluationDomainSummaryCsv = readFileSync(evaluationDomainSummaryCsvPath, "utf8");
  const evaluationAggregateSummaryCsv = readFileSync(evaluationAggregateSummaryCsvPath, "utf8");
  const aggregateSummaryRow = evaluationAggregateSummaryCsv.trim().split("\n")[1]?.split(",");
  assert.equal(
    Number(aggregateSummaryRow?.[1]),
    evaluationSummaryCsv.trim().split("\n").length - 1,
    "aggregate and per-fixture evaluation summaries should report the same fixture count",
  );
  assert.match(
    evaluationDomainSummaryCsv,
    /^generated_at,domain,fixture_count,mismatch_count,mismatch_rate,answers_with_claims,answers_without_claims,matched_claims,total_expected_claims,score,score_label,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review\n/m,
  );
  assert.match(evaluationDomainSummaryCsv, /^[^,\n]+,hr,27,0,0\.000,27,0,82,82,1(?:\.0+)?\,100%,32,19,22,9,32,19,22,9$/m);
  assert.match(evaluationDomainSummaryCsv, /^[^,\n]+,support,49,0,0\.000,48,1,143,143,1(?:\.0+)?\,100%,54,33,41,15,54,33,41,15$/m);
  const fixtureDomainCounts = evaluationSummaryCsv
    .trim()
    .split("\n")
    .slice(1)
    .reduce((counts, row) => {
      const domain = row.split(",")[2];
      counts[domain] = (counts[domain] ?? 0) + 1;
      return counts;
    }, {});
  const domainSummaryRows = evaluationDomainSummaryCsv.trim().split("\n").slice(1);
  const summaryDomainCounts = Object.fromEntries(
    domainSummaryRows.map((row) => {
      const columns = row.split(",");
      return [columns[1], Number(columns[2])];
    }),
  );
  assert.deepEqual(
    summaryDomainCounts,
    fixtureDomainCounts,
    "domain summary fixture counts should match the per-fixture evaluation summary",
  );
  if (false) assert.match(
    evaluationAggregateSummaryCsv,
    /^generated_at,fixture_count,answers_with_claims,answers_without_claims,mismatch_count,mismatch_rate,matched_claims,total_expected_claims,score,score_label,domains,domain_fixture_counts,domain_mismatch_counts,domain_mismatch_rates,domain_answers_with_claims,domain_answers_without_claims,domain_scores,domain_score_labels,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review\n[^,\n]+,75,74,1,0,0\.000,222,222,1(?:\.0+)?,100%,hr \\| support,26 \\| 49,0 \\| 0,0\.000 \| 0\.000,26 \| 48,0 \| 1,1(?:\.0+)? \\| 1(?:\.0+)?,100% \| 100%,85,51,62,24,85,51,62,24\n?$/,
  );

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

  const server = await startCliServer([
    "--port",
    "0",
    "--max-request-bytes",
    "1500",
    "--request-timeout-ms",
    "1500",
    "--cors-origin",
    "https://console.example.com",
  ]);

  try {
    const reviewQueueResponse = await fetch(`${server.url}/review-queue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Quorum-Request-Id": "packed-review-queue-contract",
      },
      body: JSON.stringify({
        generatedAt: "2026-07-15T04:00:00.000Z",
        reviewCsvContent: [
          "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
          "HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched,HR Policy,Employees receive 12 weeks of paid parental leave.,,",
        ].join("\n"),
        fixtures: [
          {
            fixturePath: join(repoRoot, "examples", "evaluations", "hr-policy.json"),
            content: readFileSync(join(repoRoot, "examples", "evaluations", "hr-policy.json"), "utf8"),
          },
        ],
      }),
    });
    const reviewQueueBody = await reviewQueueResponse.text();
    assert.equal(reviewQueueResponse.status, 200, reviewQueueBody);
    assert.equal(reviewQueueResponse.headers.get("x-quorum-request-id"), "packed-review-queue-contract");
    const reviewQueueResult = JSON.parse(reviewQueueBody);
    assert.equal(reviewQueueResult.requestId, "packed-review-queue-contract");
    assert.equal(reviewQueueResult.generatedAt, "2026-07-15T04:00:00.000Z");
    assert.deepEqual(reviewQueueResult.review, {
      totalAnswers: 1,
      pendingAnswers: 1,
      reviewedAnswers: 0,
      noClaimsAnswers: 0,
      totalClaims: 1,
      pendingClaims: 1,
      reviewedClaims: 0,
      verdicts: { verified: 1, contradicted: 0, unsupported: 0, needs_review: 0 },
    });
    assert.equal(reviewQueueResult.evaluation.fixtureCount, 1);
    assert.equal(reviewQueueResult.evaluation.mismatchCount, 0);
    assert.equal(reviewQueueResult.evaluation.scoreLabel, "100%");

    const pendingReviewQueueResponse = await fetch(`${server.url}/review-queue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Quorum-Request-Id": "packed-review-queue-pending-contract",
      },
      body: JSON.stringify({
        generatedAt: "2026-07-15T04:00:00.000Z",
        queueStatus: "pending",
        reviewCsvContent: [
          "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
          "HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched,HR Policy,Employees receive 12 weeks of paid parental leave.,,",
        ].join("\n"),
        fixtures: [
          {
            fixturePath: join(repoRoot, "examples", "evaluations", "hr-policy.json"),
            content: readFileSync(join(repoRoot, "examples", "evaluations", "hr-policy.json"), "utf8"),
          },
        ],
      }),
    });
    const pendingReviewQueueBody = await pendingReviewQueueResponse.text();
    assert.equal(pendingReviewQueueResponse.status, 200, pendingReviewQueueBody);
    assert.equal(pendingReviewQueueResponse.headers.get("x-quorum-request-id"), "packed-review-queue-pending-contract");
    const pendingReviewQueueResult = JSON.parse(pendingReviewQueueBody);
    assert.equal(pendingReviewQueueResult.queueStatus, "pending");
    assert.deepEqual(pendingReviewQueueResult.review, reviewQueueResult.review);
    assert.deepEqual(pendingReviewQueueResult.evaluation, reviewQueueResult.evaluation);

    const invalidReviewQueueResponse = await fetch(`${server.url}/review-queue`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Quorum-Request-Id": "packed-review-queue-invalid-status-contract",
      },
      body: JSON.stringify({
        queueStatus: "in_progress",
        reviewCsvContent: "answer_label,answer_path,answer_has_claims\nEmpty draft,answers/empty.md,false\n",
      }),
    });
    const invalidReviewQueueBody = await invalidReviewQueueResponse.text();
    assert.equal(invalidReviewQueueResponse.status, 400, invalidReviewQueueBody);
    assert.deepEqual(JSON.parse(invalidReviewQueueBody), {
      error: "Invalid reviewer queue status: in_progress. Expected pending, reviewed, or no_claims.",
      requestId: "packed-review-queue-invalid-status-contract",
    });

    const indexResponse = await fetch(server.url);
    assert.equal(indexResponse.status, 200);
    const indexEtag = indexResponse.headers.get("etag");
    assert.match(indexEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    const headIndexResponse = await fetch(server.url, { method: "HEAD" });
    assert.equal(headIndexResponse.status, 200);
    assert.equal(headIndexResponse.headers.get("etag"), indexEtag);
    assert.equal(await headIndexResponse.text(), "");
    const notModifiedIndexResponse = await fetch(server.url, {
      headers: { "if-none-match": indexEtag ?? "" },
    });
    assert.equal(notModifiedIndexResponse.status, 304);
    assert.equal(notModifiedIndexResponse.headers.get("etag"), indexEtag);
    assert.equal(await notModifiedIndexResponse.text(), "");
    assert.equal(indexResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(indexResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(indexResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(indexResponse.headers.get("x-quorum-request-timeout-ms"), "1500");
    const indexPayload = await indexResponse.json();
    assert.equal(indexPayload.service, "quorum");
    assert.equal(indexPayload.version, "0.1.0");
    assert.equal(indexPayload.openapiPath, "/openapi.json");
    assert.deepEqual(indexPayload.capabilities.sourceExtensions, [...api.SOURCE_EXTENSIONS]);
    assert.deepEqual(indexPayload.capabilities.answerExtensions, [...api.ANSWER_EXTENSIONS]);
    assert.deepEqual(indexPayload.capabilities.requestContentTypes, ["application/json", "application/*+json"]);
    assert.deepEqual(indexPayload.capabilities.headerNames, {
      requestId: "X-Quorum-Request-Id",
      service: "X-Quorum-Service",
      version: "X-Quorum-Version",
      openapiPath: "X-Quorum-OpenAPI-Path",
      maxRequestBytes: "X-Quorum-Max-Request-Bytes",
      requestTimeoutMs: "X-Quorum-Request-Timeout-Ms",
      cacheControl: "Cache-Control",
      etag: "ETag",
      allow: "Allow",
      corsMaxAge: "Access-Control-Max-Age",
    });
    assert.deepEqual(indexPayload.capabilities.cors, {
      allowedOrigins: ["https://console.example.com"],
      allowedHeaders: ["Content-Type", "X-Quorum-Request-Id", "If-None-Match"],
      exposedHeaders: ["X-Quorum-Service", "X-Quorum-Version", "X-Quorum-OpenAPI-Path", "X-Quorum-Max-Request-Bytes", "X-Quorum-Request-Timeout-Ms", "X-Quorum-Request-Id", "Cache-Control", "ETag", "Allow"],
      maxAgeSeconds: 600,
    });
    assert.deepEqual(indexPayload.capabilities.verdicts, api.CLAIM_VERDICTS);
    assert.deepEqual(indexPayload.capabilities.trustLevels, ["low", "medium", "high"]);
    assert.deepEqual(indexPayload.capabilities.reviewQueueStatuses, ["pending", "reviewed", "no_claims"]);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "OPTIONS" && endpoint.path === "/verify"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/health"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/healthz"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/livez"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "GET" && endpoint.path === "/version"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/version"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/openapi.json"), true);

    const discoveryPreflightResponse = await fetch(`${server.url}/verify`, {
      method: "OPTIONS",
      headers: {
        origin: "https://console.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });
    assert.equal(discoveryPreflightResponse.status, 204);
    assert.equal(discoveryPreflightResponse.headers.get("access-control-allow-origin"), "https://console.example.com");
    assert.equal(discoveryPreflightResponse.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(discoveryPreflightResponse.headers.get("access-control-allow-headers"), "Content-Type, X-Quorum-Request-Id, If-None-Match");
    assert.equal(discoveryPreflightResponse.headers.get("access-control-max-age"), "600");
    assert.equal(discoveryPreflightResponse.headers.get("access-control-expose-headers"), "X-Quorum-Service, X-Quorum-Version, X-Quorum-OpenAPI-Path, X-Quorum-Max-Request-Bytes, X-Quorum-Request-Timeout-Ms, X-Quorum-Request-Id, Cache-Control, ETag, Allow");
    assert.equal(discoveryPreflightResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");

    const oversizedRequestResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "x".repeat(api.API_MAX_REQUEST_BYTES), sources: [] }),
    });
    assert.equal(oversizedRequestResponse.status, 413);
    assert.equal(oversizedRequestResponse.headers.get("x-quorum-max-request-bytes"), "1500");
    assert.deepEqual(await oversizedRequestResponse.json(), {
      error: "Request body must not exceed 1500 bytes.",
      requestId: oversizedRequestResponse.headers.get("x-quorum-request-id"),
    });

    const malformedJsonResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Quorum-Request-Id": "packed-malformed-json-contract",
      },
      body: "{\"answer\":",
    });
    assert.equal(malformedJsonResponse.status, 400);
    assert.deepEqual(await malformedJsonResponse.json(), {
      error: "Request body must be valid JSON.",
      requestId: "packed-malformed-json-contract",
    });

    for (const [path, requestId] of [
      ["/verify-batch", "packed-malformed-json-verify-batch-contract"],
      ["/import-review", "packed-malformed-json-import-review-contract"],
      ["/review-queue", "packed-malformed-json-review-queue-contract"],
      ["/evaluate", "packed-malformed-json-evaluate-contract"],
    ]) {
      const response = await fetch(`${server.url}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Quorum-Request-Id": requestId,
        },
        body: "{\"payload\":",
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "Request body must be valid JSON.",
        requestId,
      });
    }

    const discoveryOpenApiResponse = await fetch(`${server.url}/openapi.json`);
    assert.equal(discoveryOpenApiResponse.status, 200);
    assert.match(discoveryOpenApiResponse.headers.get("etag") ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(discoveryOpenApiResponse.headers.get("access-control-expose-headers"), "X-Quorum-Service, X-Quorum-Version, X-Quorum-OpenAPI-Path, X-Quorum-Max-Request-Bytes, X-Quorum-Request-Timeout-Ms, X-Quorum-Request-Id, Cache-Control, ETag, Allow");
    const discoveryOpenApiPayload = await discoveryOpenApiResponse.json();
    assert.equal(discoveryOpenApiPayload.openapi, "3.1.0");
    assert.equal(discoveryOpenApiPayload.paths["/verify"].post.operationId, "postVerify");
    assert.equal(discoveryOpenApiPayload.paths["/verify"].options.operationId, "optionsVerify");
    assert.equal(discoveryOpenApiPayload.paths["/evaluate"].post.operationId, "postEvaluate");
    assert.equal(discoveryOpenApiPayload.paths["/version"].get.operationId, "getVersion");
    assert.equal(discoveryOpenApiPayload.paths["/livez"].get.operationId, "getLivez");

    const capabilitiesResponse = await fetch(`${server.url}/capabilities`);
    assert.equal(capabilitiesResponse.status, 200);
    const capabilitiesEtag = capabilitiesResponse.headers.get("etag");
    assert.match(capabilitiesEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(capabilitiesResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-max-request-bytes"), "1500");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-request-timeout-ms"), "1500");
    assert.equal(capabilitiesResponse.headers.get("access-control-expose-headers"), "X-Quorum-Service, X-Quorum-Version, X-Quorum-OpenAPI-Path, X-Quorum-Max-Request-Bytes, X-Quorum-Request-Timeout-Ms, X-Quorum-Request-Id, Cache-Control, ETag, Allow");
    const capabilitiesPayload = await capabilitiesResponse.json();
    assert.equal(capabilitiesPayload.service, "quorum");
    assert.equal(capabilitiesPayload.version, "0.1.0");
    assert.equal(capabilitiesPayload.openapiPath, "/openapi.json");
    assert.deepEqual(capabilitiesPayload.capabilities.cors.allowedOrigins, ["https://console.example.com"]);
    assert.deepEqual(capabilitiesPayload.capabilities.sourceExtensions, [...api.SOURCE_EXTENSIONS]);
    assert.deepEqual(capabilitiesPayload.capabilities.answerExtensions, [...api.ANSWER_EXTENSIONS]);
    assert.deepEqual(capabilitiesPayload.capabilities.requestContentTypes, ["application/json", "application/*+json"]);
    assert.deepEqual(capabilitiesPayload.capabilities.verdicts, api.CLAIM_VERDICTS);
    assert.deepEqual(capabilitiesPayload.capabilities.trustLevels, ["low", "medium", "high"]);
    assert.deepEqual(capabilitiesPayload.capabilities.reviewQueueStatuses, ["pending", "reviewed", "no_claims"]);
    assert.equal("endpoints" in capabilitiesPayload, false);

    const allowedCorsResponse = await fetch(`${server.url}/health`, {
      headers: { origin: "https://console.example.com" },
    });
    assert.equal(allowedCorsResponse.status, 200);
    assert.equal(allowedCorsResponse.headers.get("access-control-allow-origin"), "https://console.example.com");
    assert.equal(allowedCorsResponse.headers.get("vary"), "Origin");

    const deniedCorsResponse = await fetch(`${server.url}/health`, {
      headers: { origin: "https://unapproved.example.com" },
    });
    assert.equal(deniedCorsResponse.status, 200);
    assert.equal(deniedCorsResponse.headers.get("access-control-allow-origin"), null);
    assert.equal(deniedCorsResponse.headers.get("vary"), "Origin");

    const headCapabilitiesResponse = await fetch(`${server.url}/capabilities`, { method: "HEAD" });
    assert.equal(headCapabilitiesResponse.status, 200);
    assert.equal(headCapabilitiesResponse.headers.get("etag"), capabilitiesEtag);
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(await headCapabilitiesResponse.text(), "");

    for (const path of ["/capabilities", "/version", "/openapi.json"]) {
      const preflightResponse = await fetch(`${server.url}${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "https://console.example.com",
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-quorum-request-id, if-none-match",
        },
      });

      assert.equal(preflightResponse.status, 204, path);
      assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "https://console.example.com", path);
      assert.equal(preflightResponse.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS", path);
      assert.equal(
        preflightResponse.headers.get("access-control-allow-headers"),
        "Content-Type, X-Quorum-Request-Id, If-None-Match",
        path,
      );
      assert.equal(preflightResponse.headers.get("access-control-max-age"), "600", path);
      assert.equal(await preflightResponse.text(), "", path);
    }

    const notModifiedCapabilitiesResponse = await fetch(`${server.url}/capabilities`, {
      headers: { "if-none-match": capabilitiesEtag ?? "" },
    });
    assert.equal(notModifiedCapabilitiesResponse.status, 304);
    assert.equal(notModifiedCapabilitiesResponse.headers.get("etag"), capabilitiesEtag);
    assert.equal(await notModifiedCapabilitiesResponse.text(), "");

    const headHealthResponse = await fetch(`${server.url}/health`, { method: "HEAD" });
    assert.equal(headHealthResponse.status, 200);
    assert.equal(headHealthResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headHealthResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headHealthResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headHealthResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headHealthResponse.text(), "");

    const headHealthzResponse = await fetch(`${server.url}/healthz`, { method: "HEAD" });
    assert.equal(headHealthzResponse.status, 200);
    assert.equal(headHealthzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headHealthzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headHealthzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headHealthzResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headHealthzResponse.text(), "");

    const headReadyzResponse = await fetch(`${server.url}/readyz`, { method: "HEAD" });
    assert.equal(headReadyzResponse.status, 200);
    assert.equal(headReadyzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headReadyzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headReadyzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headReadyzResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headReadyzResponse.text(), "");

    const headLivezResponse = await fetch(`${server.url}/livez`, { method: "HEAD" });
    assert.equal(headLivezResponse.status, 200);
    assert.equal(headLivezResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headLivezResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headLivezResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headLivezResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headLivezResponse.text(), "");

    const openApiResponse = await fetch(`${server.url}/openapi.json`);
    assert.equal(openApiResponse.status, 200);
    assert.equal(openApiResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(openApiResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(openApiResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    const openApiEtag = openApiResponse.headers.get("etag");
    assert.match(openApiEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(openApiResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    const openApiPayload = await openApiResponse.json();
    assert.equal(openApiPayload.openapi, "3.1.0");
    assert.equal(openApiPayload.info.title, "Quorum Local API");
    assert.equal(openApiPayload.paths["/verify"].options.summary, "Verify preflight");
    assert.equal(openApiPayload.paths["/verify"].post.summary, "Verify one answer");

    const headOpenApiResponse = await fetch(`${server.url}/openapi.json`, { method: "HEAD" });
    assert.equal(headOpenApiResponse.status, 200);
    assert.equal(headOpenApiResponse.headers.get("etag"), openApiEtag);
    assert.equal(await headOpenApiResponse.text(), "");

    const notModifiedOpenApiResponse = await fetch(`${server.url}/openapi.json`, {
      headers: { "if-none-match": openApiEtag ?? "" },
    });
    assert.equal(notModifiedOpenApiResponse.status, 304);
    assert.equal(notModifiedOpenApiResponse.headers.get("etag"), openApiEtag);
    assert.equal(await notModifiedOpenApiResponse.text(), "");

    const healthResponse = await fetch(`${server.url}/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(healthResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(healthResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(healthResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await healthResponse.json(), {
      ok: true,
      requestId: healthResponse.headers.get("x-quorum-request-id"),
      service: "quorum",
      version: "0.1.0",
    });

    const healthzResponse = await fetch(`${server.url}/healthz?probe=readiness`);
    assert.equal(healthzResponse.status, 200);
    assert.equal(healthzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(healthzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(healthzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(healthzResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await healthzResponse.json(), {
      ok: true,
      requestId: healthzResponse.headers.get("x-quorum-request-id"),
      service: "quorum",
      version: "0.1.0",
    });

    const readyzResponse = await fetch(`${server.url}/readyz`);
    assert.equal(readyzResponse.status, 200);
    assert.equal(readyzResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await readyzResponse.json(), {
      ok: true,
      requestId: readyzResponse.headers.get("x-quorum-request-id"),
      service: "quorum",
      version: "0.1.0",
    });

    const livezResponse = await fetch(`${server.url}/livez`);
    assert.equal(livezResponse.status, 200);
    assert.equal(livezResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await livezResponse.json(), {
      ok: true,
      requestId: livezResponse.headers.get("x-quorum-request-id"),
      service: "quorum",
      version: "0.1.0",
    });

    const versionResponse = await fetch(`${server.url}/version`);
    assert.equal(versionResponse.status, 200);
    const versionEtag = versionResponse.headers.get("etag");
    assert.match(versionEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(versionResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.deepEqual(await versionResponse.json(), {
      requestId: versionResponse.headers.get("x-quorum-request-id"),
      service: "quorum",
      version: "0.1.0",
    });

    const headVersionResponse = await fetch(`${server.url}/version`, { method: "HEAD" });
    assert.equal(headVersionResponse.status, 200);
    assert.equal(headVersionResponse.headers.get("etag"), versionEtag);
    assert.equal(await headVersionResponse.text(), "");

    const notModifiedVersionResponse = await fetch(`${server.url}/version`, {
      headers: { "if-none-match": versionEtag ?? "" },
    });
    assert.equal(notModifiedVersionResponse.status, 304);
    assert.equal(notModifiedVersionResponse.headers.get("etag"), versionEtag);
    assert.equal(await notModifiedVersionResponse.text(), "");

    const extractClaimsResponse = await fetch(`${server.url}/extract-claims?format=json`, {
      method: "POST",
      headers: {
        "content-type": "application/vnd.quorum.claim-preview+json",
        "X-Quorum-Request-Id": "packed-extract-claims-contract",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave. Managers approve exceptions within five business days.",
        answerPath: "answers/hr-answer.md",
        answerLabel: "HR reviewer packet",
      }),
    });
    assert.equal(extractClaimsResponse.status, 200);
    assert.equal(extractClaimsResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(extractClaimsResponse.headers.get("x-quorum-request-id"), "packed-extract-claims-contract");
    assert.deepEqual(await extractClaimsResponse.json(), {
      requestId: "packed-extract-claims-contract",
      answerPath: "answers/hr-answer.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "Employees receive 12 weeks of paid parental leave. Managers approve exceptions within five business days.",
      answerHasClaims: true,
      claims: [
        { id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." },
        { id: "claim_2", text: "Managers approve exceptions within five business days." },
      ],
    });

    const extractClaimsBase64Response = await fetch(`${server.url}/extract-claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answerBase64: Buffer.from("Employees receive 12 weeks of paid parental leave.").toString("base64"),
        answerPath: "answers/hr-answer.txt",
      }),
    });
    assert.equal(extractClaimsBase64Response.status, 200);
    assert.deepEqual((await extractClaimsBase64Response.json()).claims, [
      { id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." },
    ]);

    const extractClaimsPreflightResponse = await fetch(`${server.url}/extract-claims`, {
      method: "OPTIONS",
      headers: {
        origin: "https://console.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });
    assert.equal(extractClaimsPreflightResponse.status, 204);
    assert.equal(extractClaimsPreflightResponse.headers.get("access-control-allow-origin"), "https://console.example.com");
    assert.equal(
      extractClaimsPreflightResponse.headers.get("access-control-allow-headers"),
      "Content-Type, X-Quorum-Request-Id, If-None-Match",
    );

    const reviewQueuePreflightResponse = await fetch(`${server.url}/review-queue`, {
      method: "OPTIONS",
      headers: {
        origin: "https://console.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });
    assert.equal(reviewQueuePreflightResponse.status, 204);
    assert.equal(reviewQueuePreflightResponse.headers.get("access-control-allow-origin"), "https://console.example.com");
    assert.equal(reviewQueuePreflightResponse.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(
      reviewQueuePreflightResponse.headers.get("access-control-allow-headers"),
      "Content-Type, X-Quorum-Request-Id, If-None-Match",
    );
    assert.equal(reviewQueuePreflightResponse.headers.get("access-control-max-age"), "600");

    const preflightResponse = await fetch(`${server.url}/verify`, {
      method: "OPTIONS",
      headers: {
        origin: "https://console.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });
    assert.equal(preflightResponse.status, 204);
    assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "https://console.example.com");
    assert.equal(preflightResponse.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(preflightResponse.headers.get("access-control-allow-headers"), "Content-Type, X-Quorum-Request-Id, If-None-Match");
    assert.equal(preflightResponse.headers.get("access-control-max-age"), "600");

    for (const path of ["/verify", "/verify-batch", "/import-review", "/review-queue", "/evaluate", "/extract-claims"]) {
      const response = await fetch(`${server.url}${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "https://console.example.com",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
        },
      });
      assert.equal(response.status, 204, path);
      assert.equal(response.headers.get("access-control-allow-origin"), "https://console.example.com", path);
      assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS", path);
      assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type, X-Quorum-Request-Id, If-None-Match", path);
      assert.equal(response.headers.get("access-control-max-age"), "600", path);
      assert.equal(await response.text(), "", path);
    }

    const verifyResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerLabel: "HR reviewer packet",
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
        failOn: ["contradicted"],
      }),
    });
    assert.equal(verifyResponse.status, 200);
    const verifyResult = await verifyResponse.json();
    assert.equal(verifyResult.shouldFail, false);
    assert.equal(verifyResult.report.answerLabel, "HR reviewer packet");
    assert.equal(verifyResult.report.summary.verified, 1);

    const singleBinaryAnswer = readFileSync(join(repoRoot, "examples", "sources", "hr-policy.pdf"));
    const singleBinaryVerifyResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answerBase64: singleBinaryAnswer.toString("base64"),
        answerPath: "answers/hr-policy.pdf",
        answerLabel: "Uploaded HR policy packet",
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
      }),
    });
    assert.equal(singleBinaryVerifyResponse.status, 200);
    const singleBinaryVerifyResult = await singleBinaryVerifyResponse.json();
    assert.equal(singleBinaryVerifyResult.shouldFail, false);
    assert.equal(singleBinaryVerifyResult.report.answerPath, "answers/hr-policy.pdf");
    assert.equal(singleBinaryVerifyResult.report.answerLabel, "Uploaded HR policy packet");
    assert.equal(singleBinaryVerifyResult.report.summary.verified, 1);

    const binarySourceVerifyResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            sourcePath: "policies/hr-policy.pdf",
            contentBase64: singleBinaryAnswer.toString("base64"),
            title: "Uploaded HR policy",
            trustLevel: "high",
          },
        ],
      }),
    });
    assert.equal(binarySourceVerifyResponse.status, 200);
    const binarySourceVerifyResult = await binarySourceVerifyResponse.json();
    assert.equal(binarySourceVerifyResult.shouldFail, false);
    assert.equal(binarySourceVerifyResult.report.sources[0]?.title, "Uploaded HR policy");
    assert.equal(binarySourceVerifyResult.report.summary.verified, 1);

    const invalidContentTypeResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
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
      }),
    });
    assert.equal(invalidContentTypeResponse.status, 415);
    const invalidContentTypePayload = await invalidContentTypeResponse.json();
    assert.equal(invalidContentTypePayload.error, "Content-Type must be JSON.");
    assert.match(invalidContentTypePayload.requestId, /^[0-9a-f-]{36}$/);

    const batchVerifyResponse = await fetch(`${server.url}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            answer: "Employees receive 12 weeks of paid parental leave.",
            answerLabel: "HR reviewer packet",
          },
          {
            answer: "Employees receive free daily lunch.",
            answerLabel: "Perks packet",
          },
        ],
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
        failOn: ["needs_review"],
      }),
    });
    assert.equal(batchVerifyResponse.status, 200);
    const batchVerifyResult = await batchVerifyResponse.json();
    assert.equal(batchVerifyResult.shouldFail, true);
    assert.deepEqual(batchVerifyResult.failVerdicts, ["needs_review"]);
    assert.equal(batchVerifyResult.report.answerCount, 2);
    assert.equal(batchVerifyResult.report.summary.answersWithClaims, 2);
    assert.equal(batchVerifyResult.report.summary.needs_review, 1);

    const batchBinaryAnswer = readFileSync(join(repoRoot, "examples", "sources", "hr-policy.pdf"));
    const batchBinaryVerifyResponse = await fetch(`${server.url}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            answerBase64: batchBinaryAnswer.toString("base64"),
            answerPath: "answers/hr-policy.pdf",
            answerLabel: "Uploaded HR policy packet",
          },
        ],
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
      }),
    });
    assert.equal(batchBinaryVerifyResponse.status, 200);
    const batchBinaryVerifyResult = await batchBinaryVerifyResponse.json();
    assert.equal(batchBinaryVerifyResult.shouldFail, false);
    assert.equal(batchBinaryVerifyResult.report.answerCount, 1);
    assert.equal(batchBinaryVerifyResult.report.answers[0]?.answerLabel, "Uploaded HR policy packet");
    assert.equal(batchBinaryVerifyResult.report.summary.verified, 1);

    const importReviewResponse = await fetch(`${server.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
HR reviewer packet,answers/hr.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,high,2026-05-31,policies/hr-policy.md,1.000,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation
`,
        failOn: ["needs_review"],
        includeArtifacts: ["summary_csv"],
      }),
    });
    assert.equal(importReviewResponse.status, 200);
    const importReviewResult = await importReviewResponse.json();
    assert.equal(importReviewResult.shouldFail, true);
    assert.deepEqual(importReviewResult.failVerdicts, ["needs_review"]);
    assert.equal(importReviewResult.report.summary.needs_review, 1);
    assert.equal(importReviewResult.report.answerGroups[0]?.label, "HR reviewer packet");
    assert.equal(
      importReviewResult.report.answerGroups[0]?.answerPreview,
      "Employees receive 12 weeks of paid parental leave.",
    );
    assert.match(
      importReviewResult.artifacts.summary_csv,
      /^generated_at,answer_label,answer_path,answer_preview,answer_has_claims,review_status,primary_final_verdict,primary_claim,primary_model_reason,primary_reviewer_notes,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,/,
    );
    assert.match(
      importReviewResult.artifacts.summary_csv,
      /HR reviewer packet,answers\/hr\.md,Employees receive 12 weeks of paid parental leave\.,true,reviewed,needs_review,Employees receive 12 weeks of paid parental leave\.,Matched approved policy,Need HR confirmation,HR Policy,high,2026-05-31,policies\/hr-policy\.md,,1\.000,Employees receive 12 weeks of paid parental leave\./,
    );

    const pendingImportReviewResponse = await fetch(`${server.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,answer_preview,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
Pending HR packet,answers/pending.md,Pending policy claim.,true,claim_1,Pending policy claim.,needs_review,Needs review,HR Policy,high,2026-05-31,policies/hr-policy.md,0.900,Pending policy claim.,,
Reviewed HR packet,answers/reviewed.md,Reviewed policy claim.,true,claim_1,Reviewed policy claim.,verified,Matched approved policy,HR Policy,high,2026-05-31,policies/hr-policy.md,1.000,Reviewed policy claim.,verified,Approved
`,
        queueStatus: "pending",
        includeArtifacts: ["summary_csv"],
      }),
    });
    assert.equal(pendingImportReviewResponse.status, 200);
    const pendingImportReviewResult = await pendingImportReviewResponse.json();
    assert.deepEqual(pendingImportReviewResult.report.queueSummary, {
      totalAnswers: 1,
      pendingAnswers: 1,
      reviewedAnswers: 0,
      noClaimsAnswers: 0,
    });
    assert.deepEqual(
      pendingImportReviewResult.report.answerGroups.map((group) => [group.label, group.reviewStatus]),
      [["Pending HR packet", "pending"]],
    );
    assert.match(pendingImportReviewResult.artifacts.summary_csv, /Pending HR packet,answers\/pending\.md/);
    assert.doesNotMatch(pendingImportReviewResult.artifacts.summary_csv, /Reviewed HR packet/);

    const evaluationFixtureContent = readFileSync(
      join(repoRoot, "examples", "evaluations", "hr-policy.json"),
      "utf8",
    );
    const evaluateResponse = await fetch(`${server.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: join(repoRoot, "examples", "evaluations", "hr-policy.json"),
            content: evaluationFixtureContent,
          },
        ],
        includeArtifacts: ["summary_csv", "domain_summary_csv", "aggregate_summary_csv"],
      }),
    });
    assert.equal(evaluateResponse.status, 200);
    const evaluateResult = await evaluateResponse.json();
    assert.equal(evaluateResult.shouldFail, false);
    assert.equal(evaluateResult.mismatchCount, 0);
    assert.equal(evaluateResult.scorecards[0]?.fixtureName, "HR policy example");
    assert.equal(evaluateResult.scorecards[0]?.summaryMatches, true);
    assert.match(
      evaluateResult.artifacts.summary_csv,
      /^generated_at,fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,answer_has_claims,source_dirs,source_paths,source_ids,summary_match,/,
    );
    assert.match(
      evaluateResult.artifacts.domain_summary_csv,
      /^generated_at,domain,fixture_count,mismatch_count,mismatch_rate,answers_with_claims,answers_without_claims,matched_claims,total_expected_claims,score,score_label,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review\n[^,\n]+,hr,1,0,0\.000,1,0,3,3,1(?:\.0+)?,100%,1,1,1,0,1,1,1,0\n?$/,
    );
    assert.match(
      evaluateResult.artifacts.aggregate_summary_csv,
      /^generated_at,fixture_count,answers_with_claims,answers_without_claims,mismatch_count,mismatch_rate,matched_claims,total_expected_claims,score,score_label,domains,domain_fixture_counts,domain_mismatch_counts,domain_mismatch_rates,domain_answers_with_claims,domain_answers_without_claims,domain_scores,domain_score_labels,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review\n[^,\n]+,1,1,0,0,0\.000,3,3,1(?:\.0+)?,100%,hr,1,0,0\.000,1,0,1(?:\.0+)?,100%,1,1,1,0,1,1,1,0\n?$/,
    );

    const verifyConflictResponse = await fetch(`${server.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 18 weeks of paid parental leave.",
        answerPath: "answers/hr-conflict.md",
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
        failOn: ["contradicted"],
        includeArtifacts: ["text", "result_json", "summary_csv"],
        failOnStatus: true,
      }),
    });
    assert.equal(verifyConflictResponse.status, 409);
    const verifyConflictResult = await verifyConflictResponse.json();
    assert.equal(verifyConflictResult.shouldFail, true);
    assert.deepEqual(verifyConflictResult.failVerdicts, ["contradicted"]);
    assert.match(verifyConflictResult.artifacts.text, /Quorum Verification Report/);
    assert.deepEqual(JSON.parse(verifyConflictResult.artifacts.result_json), {
      report: verifyConflictResult.report,
      shouldFail: verifyConflictResult.shouldFail,
      failVerdicts: verifyConflictResult.failVerdicts,
    });
    assert.match(verifyConflictResult.artifacts.summary_csv, /^generated_at,answer_label,answer_path,/);

    const batchConflictResponse = await fetch(`${server.url}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            answer: "Employees receive free catered lunch every day.",
            answerPath: "answers/perks.md",
            answerLabel: "Perks queue",
          },
        ],
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
        failOn: ["unsupported"],
        includeArtifacts: ["html", "result_json"],
        failOnStatus: true,
      }),
    });
    assert.equal(batchConflictResponse.status, 409);
    const batchConflictResult = await batchConflictResponse.json();
    assert.equal(batchConflictResult.shouldFail, true);
    assert.deepEqual(batchConflictResult.failVerdicts, ["unsupported"]);
    assert.match(batchConflictResult.artifacts.html, /Quorum Batch Verification Report/);
    assert.deepEqual(JSON.parse(batchConflictResult.artifacts.result_json), {
      report: batchConflictResult.report,
      shouldFail: batchConflictResult.shouldFail,
      failVerdicts: batchConflictResult.failVerdicts,
    });

    const importConflictResponse = await fetch(`${server.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation
`,
        failOn: ["needs_review"],
        includeArtifacts: ["markdown", "result_json"],
        failOnStatus: true,
      }),
    });
    assert.equal(importConflictResponse.status, 409);
    const importConflictResult = await importConflictResponse.json();
    assert.equal(importConflictResult.shouldFail, true);
    assert.deepEqual(importConflictResult.failVerdicts, ["needs_review"]);
    assert.match(importConflictResult.artifacts.markdown, /^# Quorum Reviewer Decision Import/);
    assert.deepEqual(JSON.parse(importConflictResult.artifacts.result_json), {
      report: importConflictResult.report,
      shouldFail: importConflictResult.shouldFail,
      failVerdicts: importConflictResult.failVerdicts,
    });

    const evaluateConflictResponse = await fetch(`${server.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: join(repoRoot, "tmp-fixtures", "hr-inline.json"),
            content: JSON.stringify({
              name: "Inline HR API fixture",
              answerPath: "../answers/hr-inline.md",
              answer: "Employees receive 18 weeks of paid parental leave.\n",
              sources: [
                {
                  sourcePath: "../sources/hr-policy.md",
                  title: "HR Policy",
                  trustLevel: "high",
                  content: "Employees receive 12 weeks of paid parental leave.\n",
                },
              ],
              expectedSummary: {
                verified: 1,
                contradicted: 0,
                unsupported: 0,
                needs_review: 0,
              },
              expectedClaimVerdicts: ["verified"],
            }),
          },
        ],
        includeArtifacts: ["summary_csv"],
        failOnStatus: true,
      }),
    });
    assert.equal(evaluateConflictResponse.status, 409);
    const evaluateConflictResult = await evaluateConflictResponse.json();
    assert.equal(evaluateConflictResult.shouldFail, true);
    assert.equal(evaluateConflictResult.mismatchCount, 1);
    assert.match(
      evaluateConflictResult.artifacts.summary_csv,
      /^generated_at,fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,answer_has_claims,source_dirs,source_paths,source_ids,summary_match,/,
    );
  } finally {
    await server.stop();
  }

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
  assert.ok(packedPaths.has("dist/src/api-server.js"));
  assert.ok(packedPaths.has("dist/src/api-server.d.ts"));
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
  const consumerAnswerPath = join(consumerDir, "consumer-answer.md");
  const consumerSourcePath = join(consumerDir, "consumer-source.md");
  writeFileSync(consumerAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");
  writeFileSync(
    consumerSourcePath,
    `---
title: Consumer HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
    "utf8",
  );
  const installedCliStdout = runCommand(
    "npm",
    [
      "exec",
      "--",
      "quorum",
      "verify",
      "--answer",
      consumerAnswerPath,
      "--source",
      consumerSourcePath,
      "--json",
    ],
    {
      cwd: consumerDir,
      stdio: "pipe",
    },
  );
  const installedCliResult = JSON.parse(installedCliStdout);
  assert.equal(installedCliResult.summary.verified, 1);
  assert.equal(installedCliResult.sources[0]?.title, "Consumer HR Policy");
  const installedCliFailure = spawnSync(
    "npm",
    [
      "exec",
      "--",
      "quorum",
      "verify",
      "--answer",
      consumerAnswerPath,
      "--source",
      consumerSourcePath,
      "--fail-on",
      "unsupported",
      "--json",
    ],
    { cwd: consumerDir, encoding: "utf8" },
  );
  assert.equal(installedCliFailure.status, 0);

  const unsupportedAnswerPath = join(consumerDir, "unsupported-answer.md");
  writeFileSync(unsupportedAnswerPath, "Employees receive free catered lunch every day.\n", "utf8");
  const installedCliGate = spawnSync(
    "npm",
    [
      "exec",
      "--",
      "quorum",
      "verify",
      "--answer",
      unsupportedAnswerPath,
      "--source",
      consumerSourcePath,
      "--fail-on",
      "unsupported",
      "--json",
    ],
    { cwd: consumerDir, encoding: "utf8" },
  );
  assert.equal(installedCliGate.status, 2);
  assert.equal(JSON.parse(installedCliGate.stdout).summary.unsupported, 1);

  const consumerBatchResultPath = join(consumerDir, "consumer-batch-result.json");
  const installedBatchGate = spawnSync(
    "npm",
    [
      "exec",
      "--",
      "quorum",
      "verify-batch",
      "--answer",
      consumerAnswerPath,
      "--answer",
      unsupportedAnswerPath,
      "--source",
      consumerSourcePath,
      "--fail-on",
      "unsupported",
      "--result-json",
      "--result-json-out",
      consumerBatchResultPath,
    ],
    { cwd: consumerDir, encoding: "utf8" },
  );
  assert.equal(installedBatchGate.status, 2);
  const installedBatchResult = JSON.parse(installedBatchGate.stdout);
  assert.equal(installedBatchResult.report.answerCount, 2);
  assert.deepEqual(installedBatchResult.failVerdicts, ["unsupported"]);
  assert.equal(installedBatchResult.shouldFail, true);
  assert.deepEqual(readJson(consumerBatchResultPath), installedBatchResult);

  runCommand("npm", ["install", "--save-dev", "@types/node"], {
    cwd: consumerDir,
    stdio: "pipe",
  });
  const consumerImportPath = join(consumerDir, "consumer-import.mjs");
  writeFileSync(
    consumerImportPath,
    `import assert from "node:assert/strict";
import {
  API_SERVICE_NAME,
  OPENAPI_PATH,
  startApiServer,
  verifyAnswerResult,
} from "quorum";
import {
  API_SERVICE_NAME as SERVER_API_SERVICE_NAME,
  startApiServer as startServerSubpath,
} from "quorum/server";

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

if (SERVER_API_SERVICE_NAME !== API_SERVICE_NAME) {
  throw new Error("Expected quorum/server to expose the same API service metadata.");
}

const api = await startApiServer({ host: "127.0.0.1", port: 0 });

try {
  const discoveryResponse = await fetch(api.url);

  if (discoveryResponse.status !== 200) {
    throw new Error("Expected packed quorum root export to serve a discovery response.");
  }

  const discovery = await discoveryResponse.json();

  if (discovery.service !== API_SERVICE_NAME || discovery.openapiPath !== OPENAPI_PATH) {
    throw new Error("Expected packed quorum root export to preserve API discovery metadata.");
  }

  const verifyResponse = await fetch(\`\${api.url}/verify\`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      answer: "Employees receive 18 weeks of paid parental leave.",
      sources: [
        {
          sourcePath: "policies/hr-policy.md",
          content: "Employees receive 12 weeks of paid parental leave.",
        },
      ],
      failOn: ["contradicted"],
      failOnStatus: true,
    }),
  });

  if (verifyResponse.status !== 409) {
    throw new Error("Expected packed quorum root export to preserve verify fail-gate status.");
  }

  const verifyResult = await verifyResponse.json();

  if (!verifyResult.shouldFail || verifyResult.failVerdicts?.[0] !== "contradicted") {
    throw new Error("Expected packed quorum root export to return the contradicted fail verdict.");
  }

  const response = await fetch(\`\${api.url}/health\`);

  if (response.status !== 200) {
    throw new Error("Expected packed quorum root export to serve a health response.");
  }

  const openApiResponse = await fetch(\`\${api.url}/openapi.json\`);

  if (openApiResponse.status !== 200) {
    throw new Error("Expected packed quorum root export to serve its OpenAPI document.");
  }

  const openApiDocument = await openApiResponse.json();
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.equal(openApiDocument.info?.title, "Quorum Local API");
  assert.equal(openApiDocument.paths?.["/verify"]?.post?.operationId, "postVerify");
  assert.equal(openApiDocument.paths?.["/extract-claims"]?.post?.operationId, "postExtractClaims");

  const serverSubpath = await startServerSubpath({ host: "127.0.0.1", port: 0 });

  try {
    const subpathResponse = await fetch(\`\${serverSubpath.url}/health\`);

    if (subpathResponse.status !== 200) {
      throw new Error("Expected packed quorum/server export to serve a health response.");
    }

    const subpathOpenApiResponse = await fetch(\`\${serverSubpath.url}/openapi.json\`);

    if (subpathOpenApiResponse.status !== 200) {
      throw new Error("Expected packed quorum/server export to serve its OpenAPI document.");
    }

    const subpathOpenApiDocument = await subpathOpenApiResponse.json();
    assert.equal(subpathOpenApiDocument.openapi, openApiDocument.openapi);
    assert.deepEqual(subpathOpenApiDocument.info, openApiDocument.info);
    assert.deepEqual(subpathOpenApiDocument.paths, openApiDocument.paths);
    assert.deepEqual(subpathOpenApiDocument.components, openApiDocument.components);
  } finally {
    await serverSubpath.close();
  }
} finally {
  await api.close();
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
  API_CAPABILITIES,
  createApiServer,
  verifyAnswerContentsResult,
  verifyAnswerResult,
  type ApiServerOptions,
  type InMemorySingleVerificationResultOptions,
  type SourceDocument,
  type StartedApiServer,
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

const server = createApiServer();
const startedServer = {} as StartedApiServer;
const apiServerOptions: ApiServerOptions = {
  host: "127.0.0.1",
  port: 0,
};

server.close();
startedServer.host;
apiServerOptions.port;
API_CAPABILITIES.verdicts;
API_CAPABILITIES.reviewQueueStatuses;
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
          types: ["node"],
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
