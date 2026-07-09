import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
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
  assert.equal(readJson(batchReportPath).answerCount, 4);
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
  assert.equal(readJson(importReportPath).answerGroups.length, 4);
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

  const server = await startCliServer(["--port", "0"]);

  try {
    const indexResponse = await fetch(server.url);
    assert.equal(indexResponse.status, 200);
    assert.equal(indexResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(indexResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(indexResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    const indexPayload = await indexResponse.json();
    assert.equal(indexPayload.service, "quorum");
    assert.equal(indexPayload.version, "0.1.0");
    assert.equal(indexPayload.openapiPath, "/openapi.json");
    assert.deepEqual(indexPayload.capabilities.sourceExtensions, [...api.SOURCE_EXTENSIONS]);
    assert.deepEqual(indexPayload.capabilities.answerExtensions, [...api.ANSWER_EXTENSIONS]);
    assert.deepEqual(indexPayload.capabilities.verdicts, api.CLAIM_VERDICTS);
    assert.deepEqual(indexPayload.capabilities.trustLevels, ["low", "medium", "high"]);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/health"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/healthz"), true);
    assert.equal(indexPayload.endpoints.some((endpoint) => endpoint.method === "HEAD" && endpoint.path === "/openapi.json"), true);

    const capabilitiesResponse = await fetch(`${server.url}/capabilities`);
    assert.equal(capabilitiesResponse.status, 200);
    assert.equal(capabilitiesResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    const capabilitiesPayload = await capabilitiesResponse.json();
    assert.equal(capabilitiesPayload.service, "quorum");
    assert.equal(capabilitiesPayload.version, "0.1.0");
    assert.equal(capabilitiesPayload.openapiPath, "/openapi.json");
    assert.deepEqual(capabilitiesPayload.capabilities.sourceExtensions, [...api.SOURCE_EXTENSIONS]);
    assert.deepEqual(capabilitiesPayload.capabilities.answerExtensions, [...api.ANSWER_EXTENSIONS]);
    assert.deepEqual(capabilitiesPayload.capabilities.verdicts, api.CLAIM_VERDICTS);
    assert.deepEqual(capabilitiesPayload.capabilities.trustLevels, ["low", "medium", "high"]);
    assert.equal("endpoints" in capabilitiesPayload, false);

    const headCapabilitiesResponse = await fetch(`${server.url}/capabilities`, { method: "HEAD" });
    assert.equal(headCapabilitiesResponse.status, 200);
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(await headCapabilitiesResponse.text(), "");

    const headHealthResponse = await fetch(`${server.url}/health`, { method: "HEAD" });
    assert.equal(headHealthResponse.status, 200);
    assert.equal(headHealthResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headHealthResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headHealthResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(await headHealthResponse.text(), "");

    const headHealthzResponse = await fetch(`${server.url}/healthz`, { method: "HEAD" });
    assert.equal(headHealthzResponse.status, 200);
    assert.equal(headHealthzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headHealthzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headHealthzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(await headHealthzResponse.text(), "");

    const openApiResponse = await fetch(`${server.url}/openapi.json`);
    assert.equal(openApiResponse.status, 200);
    assert.equal(openApiResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(openApiResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(openApiResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    const openApiPayload = await openApiResponse.json();
    assert.equal(openApiPayload.openapi, "3.1.0");
    assert.equal(openApiPayload.info.title, "Quorum Local API");
    assert.equal(openApiPayload.paths["/verify"].post.summary, "Verify one answer");

    const healthResponse = await fetch(`${server.url}/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(healthResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(healthResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.deepEqual(await healthResponse.json(), {
      ok: true,
      service: "quorum",
      version: "0.1.0",
    });

    const healthzResponse = await fetch(`${server.url}/healthz`);
    assert.equal(healthzResponse.status, 200);
    assert.equal(healthzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(healthzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(healthzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.deepEqual(await healthzResponse.json(), {
      ok: true,
      service: "quorum",
      version: "0.1.0",
    });

    const preflightResponse = await fetch(`${server.url}/verify`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:4173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.equal(preflightResponse.status, 204);
    assert.equal(preflightResponse.headers.get("access-control-allow-origin"), "*");
    assert.equal(preflightResponse.headers.get("access-control-allow-methods"), "GET, HEAD, POST, OPTIONS");
    assert.equal(preflightResponse.headers.get("access-control-allow-headers"), "Content-Type");

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
    assert.deepEqual(await invalidContentTypeResponse.json(), {
      error: "Content-Type must be application/json.",
    });

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
    assert.equal(batchVerifyResult.report.summary.needs_review, 1);

    const importReviewResponse = await fetch(`${server.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation
`,
        failOn: ["needs_review"],
      }),
    });
    assert.equal(importReviewResponse.status, 200);
    const importReviewResult = await importReviewResponse.json();
    assert.equal(importReviewResult.shouldFail, true);
    assert.deepEqual(importReviewResult.failVerdicts, ["needs_review"]);
    assert.equal(importReviewResult.report.summary.needs_review, 1);
    assert.equal(importReviewResult.report.answerGroups[0]?.label, "HR reviewer packet");

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
      }),
    });
    assert.equal(evaluateResponse.status, 200);
    const evaluateResult = await evaluateResponse.json();
    assert.equal(evaluateResult.shouldFail, false);
    assert.equal(evaluateResult.mismatchCount, 0);
    assert.equal(evaluateResult.scorecards[0]?.fixtureName, "HR policy example");
    assert.equal(evaluateResult.scorecards[0]?.summaryMatches, true);

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
        includeArtifacts: ["text", "summary_csv"],
        failOnStatus: true,
      }),
    });
    assert.equal(verifyConflictResponse.status, 409);
    const verifyConflictResult = await verifyConflictResponse.json();
    assert.equal(verifyConflictResult.shouldFail, true);
    assert.deepEqual(verifyConflictResult.failVerdicts, ["contradicted"]);
    assert.match(verifyConflictResult.artifacts.text, /Quorum Verification Report/);
    assert.match(verifyConflictResult.artifacts.summary_csv, /^answer_label,answer_path,/);

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
        includeArtifacts: ["html"],
        failOnStatus: true,
      }),
    });
    assert.equal(batchConflictResponse.status, 409);
    const batchConflictResult = await batchConflictResponse.json();
    assert.equal(batchConflictResult.shouldFail, true);
    assert.deepEqual(batchConflictResult.failVerdicts, ["unsupported"]);
    assert.match(batchConflictResult.artifacts.html, /Quorum Batch Verification Report/);

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
        includeArtifacts: ["markdown"],
        failOnStatus: true,
      }),
    });
    assert.equal(importConflictResponse.status, 409);
    const importConflictResult = await importConflictResponse.json();
    assert.equal(importConflictResult.shouldFail, true);
    assert.deepEqual(importConflictResult.failVerdicts, ["needs_review"]);
    assert.match(importConflictResult.artifacts.markdown, /^# Quorum Reviewer Decision Import/);

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
      /^fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,source_dirs,source_paths,summary_match,/,
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
  runCommand("npm", ["install", "--save-dev", "@types/node"], {
    cwd: consumerDir,
    stdio: "pipe",
  });
  const consumerImportPath = join(consumerDir, "consumer-import.mjs");
  writeFileSync(
    consumerImportPath,
    `import {
  API_SERVICE_NAME,
  OPENAPI_PATH,
  startApiServer,
  verifyAnswerResult,
} from "quorum";

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

  const response = await fetch(\`\${api.url}/health\`);

  if (response.status !== 200) {
    throw new Error("Expected packed quorum root export to serve a health response.");
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
