import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [packageResult] = JSON.parse(output);
const files = new Set(packageResult?.files?.map(({ path }) => path) ?? []);
const binFiles = typeof packageJson.bin === "string" ? [packageJson.bin] : Object.values(packageJson.bin ?? {});
const declaredFiles = [packageJson.main, packageJson.types, ...Object.values(packageJson.exports ?? {}).flatMap((entry) =>
  typeof entry === "string" ? [entry] : Object.values(entry),
), ...binFiles];
const requiredFiles = ["README.md", ...declaredFiles.map((file) => file.replace(/^\.\//, ""))];
const missingFiles = requiredFiles.filter((file) => !files.has(file));

if (missingFiles.length > 0) {
  throw new Error(`Package artifact is missing declared files: ${missingFiles.join(", ")}`);
}

const packageRoot = new URL("../", import.meta.url);
const libraryEntry = await import(new URL("dist/src/index.js", packageRoot));
const serverEntry = await import(new URL("dist/src/api-server.js", packageRoot));
const cliPath = new URL("dist/src/cli.js", packageRoot);

if (
  typeof libraryEntry.verifyAnswer !== "function" ||
  typeof libraryEntry.createApiServer !== "function" ||
  libraryEntry.API_VERSION !== packageJson.version
) {
  throw new Error("Package artifact root entry point is missing required library exports or version contract.");
}

if (typeof serverEntry.createApiServer !== "function" || typeof serverEntry.startApiServer !== "function") {
  throw new Error("Package artifact server entry point is missing required server exports.");
}

const packagedServer = await serverEntry.startApiServer({ port: 0 });
try {
  const discoveryResponse = await fetch(packagedServer.url, {
    headers: { "X-Quorum-Request-Id": "packaged-discovery" },
  });
  const discoveryPayload = await discoveryResponse.json();
  if (
    discoveryResponse.status !== 200 ||
    discoveryPayload.requestId !== "packaged-discovery" ||
    discoveryResponse.headers.get("x-quorum-request-id") !== "packaged-discovery" ||
    discoveryPayload.service !== "quorum" ||
    discoveryPayload.openapiPath !== "/openapi.json" ||
    !Array.isArray(discoveryPayload.endpoints) ||
    !discoveryPayload.endpoints.some(({ method, path }) => method === "POST" && path === "/verify")
  ) {
    throw new Error("Package artifact server did not serve the expected discovery contract.");
  }

  const discoveryHeadResponse = await fetch(packagedServer.url, { method: "HEAD" });
  if (discoveryHeadResponse.status !== 200 || (await discoveryHeadResponse.text()) !== "") {
    throw new Error("Package artifact server did not preserve the bodyless discovery HEAD contract.");
  }

  const versionResponse = await fetch(`${packagedServer.url}/version`);
  if (versionResponse.status !== 200 || (await versionResponse.json()).service !== "quorum") {
    throw new Error("Package artifact server did not serve the expected version contract.");
  }

  const openApiResponse = await fetch(`${packagedServer.url}/openapi.json`);
  const openApiDocument = await openApiResponse.json();
  if (openApiResponse.status !== 200 || openApiDocument.openapi !== "3.1.0" || !openApiDocument.paths?.["/verify"]) {
    throw new Error("Package artifact server did not serve the expected OpenAPI contract.");
  }

  const capabilitiesResponse = await fetch(`${packagedServer.url}/capabilities`);
  const capabilitiesPayload = await capabilitiesResponse.json();
  if (
    capabilitiesResponse.status !== 200 ||
    capabilitiesPayload.service !== "quorum" ||
    capabilitiesPayload.capabilities?.maxRequestBytes !== 1_048_576 ||
    capabilitiesPayload.capabilities?.requestTimeoutMs !== 30_000 ||
    JSON.stringify(capabilitiesPayload.capabilities?.sourceExtensions) !==
      JSON.stringify([".md", ".markdown", ".txt", ".html", ".htm", ".pdf", ".docx"]) ||
    JSON.stringify(capabilitiesPayload.capabilities?.answerExtensions) !==
      JSON.stringify([".md", ".markdown", ".txt", ".html", ".htm", ".pdf", ".docx"]) ||
    JSON.stringify(capabilitiesPayload.capabilities?.trustLevels) !== JSON.stringify(["low", "medium", "high"]) ||
    !Array.isArray(capabilitiesPayload.capabilities?.reviewQueueStatuses) ||
    !capabilitiesPayload.capabilities.reviewQueueStatuses.includes("no_claims")
  ) {
    throw new Error("Package artifact server did not serve the expected capabilities contract.");
  }

  for (const path of ["/", "/capabilities", "/health", "/readyz", "/livez", "/version", "/openapi.json"]) {
    const preflightResponse = await fetch(`${packagedServer.url}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://browser.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-quorum-request-id, if-none-match",
      },
    });
    if (
      preflightResponse.status !== 204 ||
      preflightResponse.headers.get("access-control-allow-origin") !== "*" ||
      preflightResponse.headers.get("access-control-allow-methods") !== "GET, HEAD, OPTIONS" ||
      preflightResponse.headers.get("access-control-allow-headers") !== "Content-Type, X-Quorum-Request-Id, If-None-Match" ||
      preflightResponse.headers.get("access-control-expose-headers")?.includes("X-Quorum-Request-Id") !== true ||
      preflightResponse.headers.get("access-control-max-age") !== "600" ||
      (await preflightResponse.text()) !== ""
    ) {
      throw new Error(`Package artifact server did not preserve the ${path} discovery CORS preflight contract.`);
    }
  }

  const postPaths = ["/extract-claims", "/verify", "/verify-batch", "/import-review", "/review-queue", "/evaluate"];
  for (const path of postPaths) {
    const preflightResponse = await fetch(`${packagedServer.url}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://browser.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });
    if (
      preflightResponse.status !== 204 ||
      preflightResponse.headers.get("access-control-allow-origin") !== "*" ||
      preflightResponse.headers.get("access-control-allow-methods") !== "POST, OPTIONS" ||
      preflightResponse.headers.get("access-control-allow-headers") !== "Content-Type, X-Quorum-Request-Id, If-None-Match" ||
      preflightResponse.headers.get("access-control-expose-headers")?.includes("X-Quorum-Request-Id") !== true ||
      preflightResponse.headers.get("access-control-max-age") !== "600" ||
      (await preflightResponse.text()) !== ""
    ) {
      throw new Error(`Package artifact server did not preserve the ${path} CORS preflight contract.`);
    }
  }

  for (const path of ["/health", "/readyz", "/livez"]) {
    const probeResponse = await fetch(`${packagedServer.url}${path}`);
    const probePayload = await probeResponse.json();
    if (probeResponse.status !== 200 || probePayload.service !== "quorum" || probePayload.ok !== true) {
      throw new Error(`Package artifact server did not serve the expected ${path} probe contract.`);
    }

    const headProbeResponse = await fetch(`${packagedServer.url}${path}`, { method: "HEAD" });
    if (headProbeResponse.status !== 200 || (await headProbeResponse.text()) !== "") {
      throw new Error(`Package artifact server did not preserve the bodyless ${path} HEAD contract.`);
    }
  }

  for (const [path, query] of [["/healthz", "probe=readiness"], ["/readyz", "probe=kubernetes"]]) {
    const aliasResponse = await fetch(`${packagedServer.url}${path}?${query}`);
    const aliasPayload = await aliasResponse.json();
    if (aliasResponse.status !== 200 || aliasPayload.service !== "quorum" || aliasPayload.ok !== true) {
      throw new Error(`Package artifact server did not preserve the ${path} query probe contract.`);
    }
  }

  const verifyResponse = await fetch(`${packagedServer.url}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerLabel: "Packaged verification packet",
      sources: [{
        id: "hr-policy@2026-07-15",
        sourcePath: "policies/hr-policy.md",
        updatedAt: "2026-07-15",
        title: "HR Policy",
        trustLevel: "high",
        content: "---\ntitle: HR Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
      }],
    }),
  });
  const verifyPayload = await verifyResponse.json();
  const packagedSource = verifyPayload.report?.sources?.[0];
  if (
    verifyResponse.status !== 200 ||
    verifyPayload.shouldFail !== false ||
    verifyPayload.report?.summary?.verified !== 1 ||
    packagedSource?.id !== "hr-policy@2026-07-15" ||
    packagedSource?.sourcePath !== "policies/hr-policy.md" ||
    packagedSource?.title !== "HR Policy" ||
    packagedSource?.updatedAt !== "2026-07-15" ||
    packagedSource?.trustLevel !== "high"
  ) {
    throw new Error("Package artifact server did not verify the expected answer contract.");
  }

  const verifyBatchResponse = await fetch(`${packagedServer.url}/verify-batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: [
        { answer: "Employees receive 12 weeks of paid parental leave.", answerLabel: "Batch answer" },
        { answer: "   ", answerLabel: "Empty draft" },
      ],
      sources: [{
        sourcePath: "policies/hr-policy.md",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      }],
    }),
  });
  const verifyBatchPayload = await verifyBatchResponse.json();
  if (
    verifyBatchResponse.status !== 200 ||
    verifyBatchPayload.shouldFail !== false ||
    verifyBatchPayload.report?.summary?.answersWithClaims !== 1 ||
    verifyBatchPayload.report?.summary?.answersWithoutClaims !== 1
  ) {
    throw new Error("Package artifact server did not serve the expected batch verification contract.");
  }

  const failPolicyResponse = await fetch(`${packagedServer.url}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "Employees receive 18 weeks of paid parental leave.",
      sources: [{
        sourcePath: "policies/hr-policy.md",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      }],
      failOn: ["contradicted"],
      failOnStatus: true,
    }),
  });
  const failPolicyPayload = await failPolicyResponse.json();
  if (
    failPolicyResponse.status !== 409 ||
    failPolicyPayload.shouldFail !== true ||
    failPolicyPayload.failVerdicts?.join(",") !== "contradicted"
  ) {
    throw new Error("Package artifact server did not preserve the fail-policy conflict contract.");
  }

  const extractClaimsResponse = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answer: "1. Employees receive 12 weeks of paid parental leave." }),
  });
  const extractClaimsPayload = await extractClaimsResponse.json();
  if (
    extractClaimsResponse.status !== 200 ||
    extractClaimsPayload.claims?.length !== 1 ||
    extractClaimsPayload.claims[0]?.id !== "claim_1" ||
    extractClaimsPayload.claims[0]?.text !== "Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact server did not serve the expected claim preview contract.");
  }

  const extractClaimsBase64Response = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answerBase64: Buffer.from("Employees receive 12 weeks of paid parental leave.").toString("base64"),
      answerPath: "answers/hr-answer.txt",
    }),
  });
  const extractClaimsBase64Payload = await extractClaimsBase64Response.json();
  if (
    extractClaimsBase64Response.status !== 200 ||
    extractClaimsBase64Payload.claims?.length !== 1 ||
    extractClaimsBase64Payload.claims[0]?.id !== "claim_1" ||
    extractClaimsBase64Payload.claims[0]?.text !== "Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact server did not preserve base64 claim preview input.");
  }

  const emptyExtractClaimsResponse = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Quorum-Request-Id": "packaged-empty-claim-preview-contract",
    },
    body: JSON.stringify({ answer: "Thanks!" }),
  });
  const emptyExtractClaimsPayload = await emptyExtractClaimsResponse.json();
  if (
    emptyExtractClaimsResponse.status !== 200 ||
    emptyExtractClaimsPayload.requestId !== "packaged-empty-claim-preview-contract" ||
    emptyExtractClaimsPayload.answerHasClaims !== false ||
    emptyExtractClaimsPayload.claims?.length !== 0
  ) {
    throw new Error("Package artifact server did not preserve claim-less preview routing.");
  }

  const importReviewResponse = await fetch(`${packagedServer.url}/import-review`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Quorum-Request-Id": "packaged-review-import",
    },
    body: JSON.stringify({
      reviewCsvContent: [
        "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
        "Packaged reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation",
        "",
      ].join("\n"),
      failOn: ["needs_review"],
      includeArtifacts: ["summary_csv"],
    }),
  });
  const importReviewPayload = await importReviewResponse.json();
  if (
    importReviewResponse.status !== 200 ||
    importReviewPayload.requestId !== "packaged-review-import" ||
    importReviewResponse.headers.get("x-quorum-request-id") !== "packaged-review-import" ||
    importReviewPayload.shouldFail !== true ||
    importReviewPayload.report?.queueSummary?.reviewedAnswers !== 1 ||
    importReviewPayload.report?.summary?.needs_review !== 1 ||
    importReviewPayload.artifacts?.summary_csv?.includes("Packaged reviewer packet") !== true
  ) {
    throw new Error("Package artifact server did not serve the expected reviewer import contract.");
  }

  const reviewQueueResponse = await fetch(`${packagedServer.url}/review-queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reviewCsvContent: [
        "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
        "Packaged queue packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Approved by HR",
        "",
      ].join("\n"),
      queueStatus: "reviewed",
    }),
  });
  const reviewQueuePayload = await reviewQueueResponse.json();
  if (
    reviewQueueResponse.status !== 200 ||
    reviewQueuePayload.review?.totalAnswers !== 1 ||
    reviewQueuePayload.review?.reviewedAnswers !== 1 ||
    reviewQueuePayload.review?.verdicts?.verified !== 1 ||
    reviewQueuePayload.queueStatus !== "reviewed"
  ) {
    throw new Error("Package artifact server did not serve the expected reviewer queue contract.");
  }

  const noClaimsQueueResponse = await fetch(`${packagedServer.url}/review-queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reviewCsvContent: [
        "answer_label,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
        "Packaged empty draft,false,,,,,,,,",
        "",
      ].join("\n"),
      queueStatus: "no_claims",
    }),
  });
  const noClaimsQueuePayload = await noClaimsQueueResponse.json();
  if (
    noClaimsQueueResponse.status !== 200 ||
    noClaimsQueuePayload.review?.totalAnswers !== 1 ||
    noClaimsQueuePayload.review?.noClaimsAnswers !== 1 ||
    noClaimsQueuePayload.review?.totalClaims !== 0 ||
    noClaimsQueuePayload.queueStatus !== "no_claims"
  ) {
    throw new Error("Package artifact server did not preserve no-claims reviewer queue routing.");
  }
} finally {
  await packagedServer.close();
}

const cliVersion = JSON.parse(execFileSync(process.execPath, [fileURLToPath(cliPath), "version", "--json"], { encoding: "utf8" }));
if (cliVersion.service !== "quorum" || cliVersion.version !== packageJson.version) {
  throw new Error("Package artifact CLI did not return the expected version contract.");
}

for (const versionFlag of ["--version", "-v"]) {
  const versionOutput = execFileSync(process.execPath, [fileURLToPath(cliPath), versionFlag], { encoding: "utf8" });
  if (versionOutput !== `quorum ${packageJson.version}\n`) {
    throw new Error(`Package artifact CLI did not preserve the ${versionFlag} version alias.`);
  }
}

const cliHelp = execFileSync(process.execPath, [fileURLToPath(cliPath), "--help"], { encoding: "utf8" });
if (!cliHelp.startsWith("Quorum\n\nUsage:") || !cliHelp.includes("quorum verify") || !cliHelp.includes("quorum serve")) {
  throw new Error("Package artifact CLI did not return the expected help contract.");
}

for (const command of [
  "verify",
  "verify-batch",
  "extract-claims",
  "import-review",
  "review-queue",
  "evaluate",
  "serve",
  "openapi",
]) {
  for (const helpFlag of ["--help", "-h"]) {
    const commandHelp = execFileSync(process.execPath, [fileURLToPath(cliPath), command, helpFlag], { encoding: "utf8" });
    if (!commandHelp.startsWith(`Quorum ${command}\n\nUsage:`) || !commandHelp.includes(`quorum ${command}`)) {
      throw new Error(`Package artifact CLI did not preserve the ${command} ${helpFlag} contract.`);
    }
  }
}

for (const command of [
  "verify",
  "verify-batch",
  "extract-claims",
  "import-review",
  "review-queue",
  "evaluate",
  "serve",
  "openapi",
  "version",
]) {
  const topicHelp = execFileSync(process.execPath, [fileURLToPath(cliPath), "help", command], { encoding: "utf8" });
  if (!topicHelp.startsWith(`Quorum ${command}\n\nUsage:`) || !topicHelp.includes(`quorum ${command}`)) {
    throw new Error(`Package artifact CLI did not preserve the help ${command} topic contract.`);
  }
}

const extractClaimsTempDir = mkdtempSync(join(tmpdir(), "quorum-package-extract-claims-"));
try {
  const extractClaimsAnswerPath = join(extractClaimsTempDir, "answer.md");
  writeFileSync(extractClaimsAnswerPath, "1. Employees receive 12 weeks of paid parental leave.\n");
  const extractClaimsResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "extract-claims",
    "--answer",
    extractClaimsAnswerPath,
    "--result-json",
  ], { encoding: "utf8" }));
  if (
    extractClaimsResult.answerHasClaims !== true ||
    extractClaimsResult.claims?.length !== 1 ||
    extractClaimsResult.claims[0]?.id !== "claim_1" ||
    extractClaimsResult.claims[0]?.text !== "Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact CLI did not preserve the expected claim extraction contract.");
  }
} finally {
  rmSync(extractClaimsTempDir, { recursive: true, force: true });
}

const batchTempDir = mkdtempSync(join(tmpdir(), "quorum-package-batch-"));
try {
  const answerDir = join(batchTempDir, "answers");
  const aggregateSummaryCsvPath = join(batchTempDir, "batch-aggregate-summary.csv");
  mkdirSync(answerDir);
  writeFileSync(join(answerDir, "verified.md"), "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(join(answerDir, "empty.md"), "Thanks!\n");
  const batchResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify-batch",
    "--answer-dir",
    answerDir,
    "--source",
    fileURLToPath(new URL("examples/sources/hr-policy.md", packageRoot)),
    "--aggregate-summary-csv-out",
    aggregateSummaryCsvPath,
    "--result-json",
  ], { encoding: "utf8" }));
  if (
    batchResult.shouldFail !== false ||
    batchResult.report?.summary?.answersWithClaims !== 1 ||
    batchResult.report?.summary?.answersWithoutClaims !== 1 ||
    batchResult.report?.summary?.verified !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve the expected batch verification contract.");
  }
  const aggregateSummaryCsv = readFileSync(aggregateSummaryCsvPath, "utf8");
  if (!/^generated_at,answer_count,answers_with_claims,answers_without_claims,answers_with_failures,total_claims,verified,contradicted,unsupported,needs_review,source_count,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids\n[^\n]+,2,1,1,0,1,1,0,0,0,1,/.test(aggregateSummaryCsv)) {
    throw new Error("Package artifact CLI did not preserve the batch aggregate summary CSV contract.");
  }
} finally {
  rmSync(batchTempDir, { recursive: true, force: true });
}

const openApiTempDir = mkdtempSync(join(tmpdir(), "quorum-package-openapi-"));
try {
  const openApiPath = join(openApiTempDir, "openapi.json");
  execFileSync(process.execPath, [fileURLToPath(cliPath), "openapi", "--out", openApiPath], { encoding: "utf8" });
  const openApiDocument = JSON.parse(readFileSync(openApiPath, "utf8"));
  if (openApiDocument.openapi !== "3.1.0" || openApiDocument.info?.title !== "Quorum Local API" || !openApiDocument.paths?.["/verify"]) {
    throw new Error("Package artifact CLI did not write the expected OpenAPI contract.");
  }
} finally {
  rmSync(openApiTempDir, { recursive: true, force: true });
}

const reviewerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-review-"));
try {
  const reviewCsvPath = join(reviewerTempDir, "review.csv");
  writeFileSync(reviewCsvPath, [
    "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
    "Packaged CLI packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation",
    "",
  ].join("\n"));
  let importReviewOutput;
  try {
    execFileSync(process.execPath, [
      fileURLToPath(cliPath),
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--result-json",
      "--fail-on",
      "needs_review",
    ], { encoding: "utf8" });
  } catch (error) {
    if (error.status !== 2) {
      throw error;
    }
    importReviewOutput = error.stdout;
  }
  const importReviewResult = JSON.parse(importReviewOutput ?? "null");
  if (
    importReviewResult.shouldFail !== true ||
    importReviewResult.report?.queueSummary?.reviewedAnswers !== 1 ||
    importReviewResult.report?.summary?.needs_review !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve the expected reviewer import contract.");
  }
  const reviewQueueOutput = execFileSync(process.execPath, [
    fileURLToPath(cliPath), "review-queue", "--review-csv", "-", "--json",
  ], { encoding: "utf8", input: readFileSync(reviewCsvPath) });
  const reviewQueueResult = JSON.parse(reviewQueueOutput);
  if (
    reviewQueueResult.review?.totalAnswers !== 1 ||
    reviewQueueResult.review?.reviewedAnswers !== 1 ||
    reviewQueueResult.review?.verdicts?.needs_review !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve reviewer queue stdin routing.");
  }

  const queueSummaryCsvPath = join(reviewerTempDir, "queue-summary.csv");
  let queueSummaryOutput;
  try {
    execFileSync(process.execPath, [
      fileURLToPath(cliPath),
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--queue-summary-csv-out",
      queueSummaryCsvPath,
      "--fail-on",
      "needs_review",
    ], { encoding: "utf8" });
  } catch (error) {
    if (error.status !== 2) {
      throw error;
    }
    queueSummaryOutput = error.stdout;
  }
  if (!queueSummaryOutput?.includes(`Reviewer queue summary CSV written to ${queueSummaryCsvPath}`)) {
    throw new Error("Package artifact CLI did not report the reviewer queue summary CSV output.");
  }
  const queueSummaryCsv = readFileSync(queueSummaryCsvPath, "utf8");
  if (
    !queueSummaryCsv.startsWith("generated_at,total_answers,pending_answers,reviewed_answers") ||
    !queueSummaryCsv.includes(",1,0,1,0,1,1,0,1,0,0,0,1,matched,needs_review")
  ) {
    throw new Error("Package artifact CLI did not preserve the reviewer queue summary CSV contract.");
  }

  let importReviewStdinOutput;
  try {
    execFileSync(process.execPath, [
      fileURLToPath(cliPath), "import-review", "--review-csv", "-", "--result-json", "--fail-on", "needs_review",
    ], { encoding: "utf8", input: readFileSync(reviewCsvPath) });
  } catch (error) {
    if (error.status !== 2) {
      throw error;
    }
    importReviewStdinOutput = error.stdout;
  }
  const importReviewStdinResult = JSON.parse(importReviewStdinOutput ?? "null");
  if (
    importReviewStdinResult.shouldFail !== true ||
    importReviewStdinResult.failVerdicts?.join(",") !== "needs_review" ||
    importReviewStdinResult.report?.queueSummary?.reviewedAnswers !== 1 ||
    importReviewStdinResult.report?.summary?.needs_review !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve reviewer import stdin routing.");
  }
} finally {
  rmSync(reviewerTempDir, { recursive: true, force: true });
}

const evaluationResult = JSON.parse(execFileSync(process.execPath, [
  fileURLToPath(cliPath),
  "evaluate",
  "--fixture",
  fileURLToPath(new URL("examples/evaluations/hr-policy.json", packageRoot)),
  "--json",
  "--fail-on-mismatch",
], { encoding: "utf8" }));
if (evaluationResult.fixtureName !== "HR policy example" || evaluationResult.summaryMatches !== true || evaluationResult.score !== 1) {
  throw new Error("Package artifact CLI did not evaluate the expected fixture contract.");
}

const evaluationGateResult = JSON.parse(execFileSync(process.execPath, [
  fileURLToPath(cliPath),
  "evaluate",
  "--fixture",
  fileURLToPath(new URL("examples/evaluations/hr-policy.json", packageRoot)),
  "--result-json",
  "--fail-on-mismatch",
], { encoding: "utf8" }));
if (
  evaluationGateResult.shouldFail !== false ||
  evaluationGateResult.mismatchCount !== 0 ||
  evaluationGateResult.summary?.score !== 1 ||
  evaluationGateResult.summary?.scoreLabel !== "100%"
) {
  throw new Error("Package artifact CLI did not preserve the evaluation result-json gate contract.");
}

const pdfTempDir = mkdtempSync(join(tmpdir(), "quorum-package-pdf-"));
try {
  const pdfAnswerPath = join(pdfTempDir, "answer.md");
  const pdfReportPath = join(pdfTempDir, "report.json");
  writeFileSync(pdfAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify",
    "--answer",
    pdfAnswerPath,
    "--source",
    fileURLToPath(new URL("examples/sources/hr-policy.pdf", packageRoot)),
    "--out",
    pdfReportPath,
  ], { encoding: "utf8" });
  const pdfReport = JSON.parse(readFileSync(pdfReportPath, "utf8"));
  if (pdfReport.summary?.verified !== 1 || pdfReport.sources?.[0]?.title !== "HR Benefits Policy PDF") {
    throw new Error("Package artifact CLI did not verify the expected PDF source contract.");
  }
} finally {
  rmSync(pdfTempDir, { recursive: true, force: true });
}

const docxTempDir = mkdtempSync(join(tmpdir(), "quorum-package-docx-"));
try {
  const docxAnswerPath = join(docxTempDir, "answer.docx");
  const docxReportPath = join(docxTempDir, "report.json");
  const docxFixture = readFileSync(new URL("../node_modules/mammoth/test/test-data/single-paragraph.docx", import.meta.url));
  writeFileSync(docxAnswerPath, docxFixture);
  execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify",
    "--answer",
    docxAnswerPath,
    "--source",
    docxAnswerPath,
    "--out",
    docxReportPath,
  ], { encoding: "utf8" });
  const docxReport = JSON.parse(readFileSync(docxReportPath, "utf8"));
  if (docxReport.summary?.verified !== 1 || docxReport.sources?.[0]?.sourcePath !== docxAnswerPath) {
    throw new Error("Package artifact CLI did not verify the expected DOCX source contract.");
  }
} finally {
  rmSync(docxTempDir, { recursive: true, force: true });
}

const stdinSourceTempDir = mkdtempSync(join(tmpdir(), "quorum-package-stdin-source-"));
try {
  const stdinAnswerPath = join(stdinSourceTempDir, "answer.md");
  writeFileSync(stdinAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  const stdinSourceResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", stdinAnswerPath, "--source", "-", "--json",
  ], {
    encoding: "utf8",
    input: "---\ntitle: Streamed HR Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
  }));
  if (stdinSourceResult.summary?.verified !== 1 || stdinSourceResult.sources?.[0]?.title !== "Streamed HR Policy") {
    throw new Error("Package artifact CLI did not verify the expected streamed source contract.");
  }
} finally {
  rmSync(stdinSourceTempDir, { recursive: true, force: true });
}

const stdinAnswerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-stdin-answer-"));
try {
  const stdinAnswerSourceDir = join(stdinAnswerTempDir, "sources");
  mkdirSync(stdinAnswerSourceDir);
  writeFileSync(
    join(stdinAnswerSourceDir, "policy.md"),
    "---\ntitle: Streamed Answer Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
  );
  const stdinAnswerResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source-dir", stdinAnswerSourceDir, "--json",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  }));
  if (stdinAnswerResult.summary?.verified !== 1 || stdinAnswerResult.answerPath !== "<stdin>") {
    throw new Error("Package artifact CLI did not preserve the expected streamed answer contract.");
  }
} finally {
  rmSync(stdinAnswerTempDir, { recursive: true, force: true });
}

const generatedAtTempDir = mkdtempSync(join(tmpdir(), "quorum-package-generated-at-"));
try {
  const generatedAtSourceDir = join(generatedAtTempDir, "sources");
  mkdirSync(generatedAtSourceDir);
  writeFileSync(join(generatedAtSourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n");
  const generatedAtResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source-dir", generatedAtSourceDir,
    "--generated-at", "2026-07-24T00:00:00.000Z", "--json",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  }));
  if (
    generatedAtResult.summary?.verified !== 1 ||
    generatedAtResult.generatedAt !== "2026-07-24T00:00:00.000Z"
  ) {
    throw new Error("Package artifact CLI did not preserve the single-answer generated-at contract.");
  }
} finally {
  rmSync(generatedAtTempDir, { recursive: true, force: true });
}

const singleSummaryTempDir = mkdtempSync(join(tmpdir(), "quorum-package-single-summary-"));
try {
  const singleSummarySourceDir = join(singleSummaryTempDir, "sources");
  const singleSummaryPath = join(singleSummaryTempDir, "summary.csv");
  mkdirSync(singleSummarySourceDir);
  writeFileSync(join(singleSummarySourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source-dir", singleSummarySourceDir,
    "--summary-csv-out", singleSummaryPath, "--fail-on", "contradicted",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  });
  const singleSummary = readFileSync(singleSummaryPath, "utf8");
  if (!singleSummary.includes("answer_path") || !singleSummary.includes("<stdin>") || !singleSummary.includes(",verified,")) {
    throw new Error("Package artifact CLI did not preserve the single-answer summary CSV contract.");
  }
} finally {
  rmSync(singleSummaryTempDir, { recursive: true, force: true });
}

const batchStdinTempDir = mkdtempSync(join(tmpdir(), "quorum-package-batch-stdin-answer-"));
try {
  const batchSourceDir = join(batchStdinTempDir, "sources");
  const batchFileAnswerPath = join(batchStdinTempDir, "support-answer.md");
  mkdirSync(batchSourceDir);
  writeFileSync(batchFileAnswerPath, "Refunds are available within 30 days of purchase.\n");
  writeFileSync(join(batchSourceDir, "hr-policy.md"), "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(join(batchSourceDir, "support-playbook.md"), "Refunds are available within 30 days of purchase.\n");

  const batchStdinResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify-batch", "--answer", "-", "--answer", batchFileAnswerPath,
    "--source-dir", batchSourceDir, "--generated-at", "2026-07-22T00:00:00.000Z", "--json",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  }));
  if (
    batchStdinResult.answerCount !== 2 ||
    batchStdinResult.answers?.[0]?.answerPath !== "<stdin>" ||
    batchStdinResult.answers?.[1]?.answerPath !== batchFileAnswerPath ||
    batchStdinResult.summary?.verified !== 2 ||
    batchStdinResult.generatedAt !== "2026-07-22T00:00:00.000Z" ||
    batchStdinResult.answers?.some(({ report }) => report?.generatedAt !== "2026-07-22T00:00:00.000Z")
  ) {
    throw new Error("Package artifact CLI did not preserve the batch stdin or generated-at contract.");
  }
} finally {
  rmSync(batchStdinTempDir, { recursive: true, force: true });
}

const reviewQueueTempDir = mkdtempSync(join(tmpdir(), "quorum-package-review-queue-"));
try {
  const reviewCsvPath = join(reviewQueueTempDir, "review.csv");
  const queueJsonPath = join(reviewQueueTempDir, "queue.json");
  const queueCsvPath = join(reviewQueueTempDir, "queue.csv");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source",
    fileURLToPath(new URL("examples/sources/hr-policy.md", packageRoot)),
    "--review-csv-out", reviewCsvPath,
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  });
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "review-queue", "--review-csv", reviewCsvPath,
    "--generated-at", "2026-07-24T00:00:00.000Z", "--json", "--out", queueJsonPath,
    "--csv-out", queueCsvPath,
  ], { encoding: "utf8" });
  const queueJson = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  const queueCsv = readFileSync(queueCsvPath, "utf8");
  if (
    queueJson.generatedAt !== "2026-07-24T00:00:00.000Z" ||
    queueJson.review?.totalAnswers !== 1 ||
    queueJson.review?.pendingAnswers !== 1 ||
    queueJson.review?.totalClaims !== 1 ||
    !queueCsv.startsWith('"generated_at","queue_status","domains","total_answers",') ||
    !queueCsv.includes('"1","1","0","0","1","1","0","1","0","0","0"')
  ) {
    throw new Error("Package artifact CLI did not preserve the reviewer queue overview contract.");
  }
} finally {
  rmSync(reviewQueueTempDir, { recursive: true, force: true });
}

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
