import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

if (typeof libraryEntry.verifyAnswer !== "function" || typeof libraryEntry.createApiServer !== "function") {
  throw new Error("Package artifact root entry point is missing required library exports.");
}

if (typeof serverEntry.createApiServer !== "function" || typeof serverEntry.startApiServer !== "function") {
  throw new Error("Package artifact server entry point is missing required server exports.");
}

const packagedServer = await serverEntry.startApiServer({ port: 0 });
try {
  const versionResponse = await fetch(`${packagedServer.url}/version`);
  if (versionResponse.status !== 200 || (await versionResponse.json()).service !== "quorum") {
    throw new Error("Package artifact server did not serve the expected version contract.");
  }

  const openApiResponse = await fetch(`${packagedServer.url}/openapi.json`);
  const openApiDocument = await openApiResponse.json();
  if (openApiResponse.status !== 200 || openApiDocument.openapi !== "3.1.0" || !openApiDocument.paths?.["/verify"]) {
    throw new Error("Package artifact server did not serve the expected OpenAPI contract.");
  }

  for (const path of ["/health", "/readyz", "/livez"]) {
    const probeResponse = await fetch(`${packagedServer.url}${path}`);
    const probePayload = await probeResponse.json();
    if (probeResponse.status !== 200 || probePayload.service !== "quorum" || probePayload.ok !== true) {
      throw new Error(`Package artifact server did not serve the expected ${path} probe contract.`);
    }
  }

  const verifyResponse = await fetch(`${packagedServer.url}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerLabel: "Packaged verification packet",
      sources: [{
        sourcePath: "policies/hr-policy.md",
        content: "---\ntitle: HR Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
      }],
    }),
  });
  const verifyPayload = await verifyResponse.json();
  if (verifyResponse.status !== 200 || verifyPayload.shouldFail !== false || verifyPayload.report?.summary?.verified !== 1) {
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
        "Packaged queue packet,answers/queue.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,",
        "",
      ].join("\n"),
      queueStatus: "pending",
    }),
  });
  const reviewQueuePayload = await reviewQueueResponse.json();
  if (
    reviewQueueResponse.status !== 200 ||
    reviewQueuePayload.queueStatus !== "pending" ||
    reviewQueuePayload.review?.totalAnswers !== 1 ||
    reviewQueuePayload.review?.pendingAnswers !== 1 ||
    reviewQueuePayload.review?.reviewedAnswers !== 0 ||
    reviewQueuePayload.review?.verdicts?.verified !== 1
  ) {
    throw new Error("Package artifact server did not serve the expected reviewer queue contract.");
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

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
