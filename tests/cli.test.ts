import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createSimplePdf } from "./pdf-test-helpers.js";

test("help --help reuses the top-level usage contract", async () => {
  const result = await runCliAllowFailure(["help", "--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /quorum verify-batch/);
});

test("verify applies the default trust override only to sources without metadata", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const plainSourcePath = join(tempDir, "plain-source.md");
    const metadataSourcePath = join(tempDir, "metadata-source.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        plainSourcePath,
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        metadataSourcePath,
        `---
title: Metadata Source
trustLevel: low
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      plainSourcePath,
      "--source",
      metadataSourcePath,
      "--default-trust-level",
      "high",
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; sourcePath: string; title: string; trustLevel: string }>;
    };

    assert.deepEqual(report.sources, [
      { id: "source_1", sourcePath: plainSourcePath, title: "plain-source", trustLevel: "high" },
      { id: "source_2", sourcePath: metadataSourcePath, title: "Metadata Source", trustLevel: "low" },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify deduplicates repeated approved source paths", async () => {
  const stdout = await runCli([
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source",
    "examples/sources/hr-policy.md",
    "--source",
    "./examples/sources/hr-policy.md",
    "--json",
  ]);

  const report = JSON.parse(stdout) as {
    sources: Array<{ sourcePath: string }>;
  };

  assert.equal(report.sources.length, 1);
  assert.equal(report.sources[0]?.sourcePath, "examples/sources/hr-policy.md");
});

test("verify rejects unsupported default trust overrides", async () => {
  await assert.rejects(
    runCli([
      "verify",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--default-trust-level",
      "critical",
    ]),
    /Unsupported trust level: critical/,
  );
});

test("verify preserves explicit stable source IDs in evidence and reports", async () => {
  const stdout = await runCli([
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source",
    "examples/sources/hr-policy.md",
    "--source-id",
    "people-ops/hr-policy@2026-07-14",
    "--json",
  ]);

  const report = JSON.parse(stdout) as {
    sources: Array<{ id: string }>;
    assessments: Array<{ evidence: Array<{ documentId: string }> }>;
  };

  assert.equal(report.sources[0]?.id, "people-ops/hr-policy@2026-07-14");
  assert.equal(report.assessments[0]?.evidence[0]?.documentId, "people-ops/hr-policy@2026-07-14");
});

test("source IDs require a preceding explicit source and cannot be repeated", async () => {
  await assert.rejects(
    runCli(["verify", "--source-id", "policy-1", "--source", "examples/sources/hr-policy.md"]),
    /Source IDs require a preceding --source <path>\./,
  );

  await assert.rejects(
    runCli([
      "verify",
      "--source",
      "examples/sources/hr-policy.md",
      "--source-id",
      "policy-1",
      "--source-id",
      "policy-2",
    ]),
    /already has an ID/,
  );

  await assert.rejects(
    runCli([
      "verify",
      "--source",
      "examples/sources/hr-policy.md",
      "--source-id",
      "policy-1",
      "--source",
      "examples/sources/support-playbook.md",
      "--source-id",
      "policy-1",
    ]),
    /Source ID policy-1 is already assigned/,
  );
});

test("verify-batch preserves explicit stable source IDs", async () => {
  const stdout = await runCli([
    "verify-batch",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source",
    "examples/sources/hr-policy.md",
    "--source-id",
    "people-ops/hr-policy@2026-07-14",
    "--json",
  ]);

  const report = JSON.parse(stdout) as {
    sources: Array<{ id: string }>;
  };

  assert.equal(report.sources[0]?.id, "people-ops/hr-policy@2026-07-14");
});

test("verify uses a caller-supplied generated timestamp", async () => {
  const stdout = await runCli([
    "verify",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source",
    "examples/sources/hr-policy.md",
    "--generated-at",
    "2026-07-10T12:34:56.000Z",
    "--json",
  ]);

  const report = JSON.parse(stdout) as { generatedAt: string };
  assert.equal(report.generatedAt, "2026-07-10T12:34:56.000Z");
});

test("verify-batch uses a caller-supplied generated timestamp for every answer", async () => {
  const stdout = await runCli([
    "verify-batch",
    "--answer",
    "examples/answers/hr-answer.md",
    "--answer",
    "examples/answers/support-answer.md",
    "--source-dir",
    "examples/sources",
    "--generated-at",
    "2026-07-10T12:34:56.000Z",
    "--json",
  ]);

  const report = JSON.parse(stdout) as {
    generatedAt: string;
    answers: Array<{ report: { generatedAt: string } }>;
  };

  assert.equal(report.generatedAt, "2026-07-10T12:34:56.000Z");
  assert.deepEqual(
    report.answers.map((answer) => answer.report.generatedAt),
    ["2026-07-10T12:34:56.000Z", "2026-07-10T12:34:56.000Z"],
  );
});

test("generated-at rejects invalid timestamps", async () => {
  await assert.rejects(
    runCli([
      "verify",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--generated-at",
      "tomorrow",
    ]),
    /Invalid --generated-at timestamp: tomorrow/,
  );
});

test("top-level help exits cleanly", async () => {
  const result = await runCliAllowFailure(["--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Quorum\n\nUsage:/);
  assert.match(result.stdout, /quorum verify .*--generated-at <timestamp>.*--result-json-out <path>/);
  assert.match(result.stdout, /quorum verify-batch .*--generated-at <timestamp>.*--result-json-out <path>/);
  assert.match(result.stdout, /quorum extract-claims .*--answer-label <label>.*--result-json/);
  assert.match(result.stdout, /quorum import-review .*--generated-at <timestamp>/);
  assert.match(result.stdout, /quorum review-queue .*--generated-at <timestamp>/);
  assert.match(result.stdout, /quorum evaluate .*--generated-at <timestamp>.*--min-score <0\.\.1>/);
  assert.match(result.stdout, /npm run dev -- evaluate .*--min-score 0\.95 --fail-on-mismatch/);
  assert.match(result.stdout, /quorum version \[--json\]/);
});

test("help accepts a command topic", async () => {
  const result = await runCliAllowFailure(["help", "verify"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Quorum verify\n\nUsage:/);
  assert.match(result.stdout, /--answer <path\|->/);
});

test("help exposes the version command topic", async () => {
  const result = await runCliAllowFailure(["help", "version"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Quorum version\n\nUsage:\n  quorum version \[--json\]/);
});

test("help rejects unknown or multiple topics", async () => {
  for (const args of [["help", "missing"], ["help", "verify", "serve"]]) {
    const result = await runCliAllowFailure(args);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown help topic:/);
  }
});

test("version reports the CLI and API contract version", async () => {
  for (const args of [["version"], ["--version"], ["-v"]]) {
    const result = await runCliAllowFailure(args);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "quorum 0.1.0\n");
  }
});

test("version --json reports a stable machine-readable contract", async () => {
  for (const args of [["version", "--json"], ["--version", "--json"], ["-v", "--json"]]) {
    const result = await runCliAllowFailure(args);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), { service: "quorum", version: "0.1.0" });
  }
});

test("version rejects unsupported options", async () => {
  const result = await runCliAllowFailure(["version", "--verbose"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /^Usage: quorum version \[--json\]\n/);
});

test("extract-claims previews normalized claims as JSON", async () => {
  const stdout = await runCli([
    "extract-claims",
    "--answer",
    "examples/answers/hr-answer.md",
    "--json",
  ]);

  const claims = JSON.parse(stdout) as Array<{ id: string; text: string }>;

  assert.deepEqual(claims, [
    { id: "claim_1", text: "Employees receive 18 weeks of paid parental leave." },
    { id: "claim_2", text: "Full-time employees receive 20 days of paid vacation each calendar year." },
    { id: "claim_3", text: "Employees receive free catered lunch every day." },
  ]);
});

test("extract-claims reads stdin and prints claim ids", async () => {
  const result = await runCli(
    ["extract-claims", "--answer", "-"],
    { stdin: "Employees receive 12 weeks of paid parental leave.\n\nManagers approve exceptions within five business days.\n" },
  );

  assert.equal(
    result,
    "claim_1: Employees receive 12 weeks of paid parental leave.\nclaim_2: Managers approve exceptions within five business days.\n",
  );
});

test("extract-claims prints an optional reviewer-facing answer label", async () => {
  const result = await runCli([
    "extract-claims",
    "--answer",
    "examples/answers/hr-answer.md",
    "--answer-label",
    "HR reviewer packet",
  ]);

  assert.match(result, /^Answer: HR reviewer packet\nclaim_1:/);
});

test("extract-claims keeps JSON output backward compatible when labeled", async () => {
  const stdout = await runCli([
    "extract-claims",
    "--answer",
    "examples/answers/hr-answer.md",
    "--answer-label",
    "HR reviewer packet",
    "--json",
  ]);

  const claims = JSON.parse(stdout) as Array<{ id: string; text: string }>;

  assert.equal(claims[0]?.id, "claim_1");
  assert.equal(claims.length, 3);
});

test("extract-claims result-json exposes the answer routing flag", async () => {
  const stdout = await runCli([
    "extract-claims",
    "--answer",
    "examples/answers/empty-answer.md",
    "--result-json",
  ]);

  assert.deepEqual(JSON.parse(stdout), { answerHasClaims: false, claims: [] });
});

test("extract-claims result-json-out writes the routing-aware preview", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-claim-preview-result-"));
  const resultPath = join(tempDir, "preview.json");

  try {
    const result = await runCliAllowFailure([
      "extract-claims",
      "--answer",
      "examples/answers/hr-answer.md",
      "--result-json-out",
      resultPath,
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Claim preview result JSON written to/);
    assert.equal(JSON.parse(await readFile(resultPath, "utf8")).answerHasClaims, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify --help prints command-specific usage without requiring sources", async () => {
  const result = await runCliAllowFailure(["verify", "--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Quorum verify\n\nUsage:\n  quorum verify --answer <path\|->/);
  assert.match(result.stdout, /--answer-label <label>\s+Reviewer-facing label to use instead of the path-derived default/);
  assert.match(result.stdout, /--review-csv-out <path>\s+Write a reviewer decision CSV/);
  assert.match(result.stdout, /--summary-csv-out <path>\s+Write a one-row summary CSV for this answer/);
  assert.match(result.stdout, /--result-json\s+Print the report with shouldFail and failVerdicts metadata/);
  assert.match(result.stdout, /--result-json-out <path>\s+Write the gate-aware result JSON to disk/);
  assert.match(result.stdout, /--generated-at <timestamp>\s+Use this ISO timestamp in generated reports/);
});

test("verify-batch -h prints batch usage without requiring answers", async () => {
  const result = await runCliAllowFailure(["verify-batch", "-h"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(
    result.stdout,
    /^Quorum verify-batch\n\nUsage:\n  quorum verify-batch \(\--answer <path\|-> \[--answer-label <label>\] \| --answer-dir <path>\)\.\.\./,
  );
  assert.match(
    result.stdout,
    /--answer-label <label>\s+Apply a reviewer-facing label to the most recent explicit --answer input/,
  );
  assert.match(result.stdout, /--summary-csv-out <path>\s+Write a one-row-per-answer summary CSV/);
  assert.match(result.stdout, /--result-json\s+Print the batch report with shouldFail and failVerdicts metadata/);
  assert.match(result.stdout, /--result-json-out <path>\s+Write the gate-aware batch result JSON to disk/);
});

test("verify result-json includes gate metadata and can be written to disk", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-result-json-"));

  try {
    const resultJsonOutPath = join(tempDir, "reports", "verify-result.json");
    const result = await runCliAllowFailure([
      "verify",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--result-json",
      "--result-json-out",
      resultJsonOutPath,
      "--fail-on",
      "contradicted",
    ]);

    assert.equal(result.code, 2);
    const parsed = JSON.parse(result.stdout) as {
      report: { summary: { contradicted: number } };
      shouldFail: boolean;
      failVerdicts: string[];
    };
    assert.equal(parsed.shouldFail, true);
    assert.deepEqual(parsed.failVerdicts, ["contradicted"]);
    assert.equal(parsed.report.summary.contradicted, 1);
    assert.deepEqual(JSON.parse(await readFile(resultJsonOutPath, "utf8")), parsed);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch result-json reports aggregate gate metadata", async () => {
  const result = await runCliAllowFailure([
    "verify-batch",
    "--answer",
    "examples/answers/hr-answer.md",
    "--source",
    "examples/sources/hr-policy.md",
    "--result-json",
    "--fail-on",
    "contradicted",
    "--fail-on",
    "unsupported",
  ]);

  assert.equal(result.code, 2);
  const parsed = JSON.parse(result.stdout) as {
    report: { summary: { answersWithFailures: number } };
    shouldFail: boolean;
    failVerdicts: string[];
  };
  assert.equal(parsed.shouldFail, true);
  assert.deepEqual(parsed.failVerdicts, ["contradicted", "unsupported"]);
  assert.equal(parsed.report.summary.answersWithFailures, 1);
});

test("verify-batch discovers answer and source files in nested directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-nested-inputs-"));

  try {
    const answerDir = join(tempDir, "answers", "hr");
    const sourceDir = join(tempDir, "sources", "policies");
    const answerPath = join(answerDir, "leave.md");
    const sourcePath = join(sourceDir, "leave-policy.md");

    await mkdir(answerDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      join(tempDir, "answers"),
      "--source-dir",
      join(tempDir, "sources"),
      "--result-json",
    ]);
    const result = JSON.parse(stdout) as {
      report: {
        answerCount: number;
        sourceCount: number;
        answers: Array<{ answerPath: string; report: { summary: { verified: number } } }>;
      };
    };

    assert.equal(result.report.answerCount, 1);
    assert.equal(result.report.sourceCount, 1);
    assert.equal(result.report.answers[0]?.answerPath, answerPath);
    assert.equal(result.report.answers[0]?.report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review --help prints import usage without requiring a csv path", async () => {
  const result = await runCliAllowFailure(["import-review", "--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(
    result.stdout,
    /^Quorum import-review\n\nUsage:\n  quorum import-review --review-csv <path\|->/,
  );
  assert.match(result.stdout, /--summary-csv-out <path>\s+Write a one-row-per-answer summary CSV/);
  assert.match(result.stdout, /--review-csv <path\|->\s+Reviewer decision CSV to import, or - to read from stdin/);
});

test("evaluate --help prints evaluation usage without requiring fixtures", async () => {
  const result = await runCliAllowFailure(["evaluate", "--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(
    result.stdout,
    /^Quorum evaluate\n\nUsage:\n  quorum evaluate \(\--fixture <path> \| --fixture-dir <path>\)\.\.\./,
  );
  assert.match(result.stdout, /--domain <name>\s+Only evaluate fixtures whose domain matches this value/);
  assert.match(result.stdout, /--markdown-out <path>\s+Write a Markdown evaluation report/);
  assert.match(result.stdout, /--fixture-dir <path>\s+Directory of evaluation fixture JSON files/);
  assert.match(result.stdout, /--domain-summary-csv-out <path>/);
  assert.match(result.stdout, /--aggregate-summary-csv-out <path>/);
  assert.match(result.stdout, /--fail-on-mismatch\s+Exit with code 2 when any fixture summary or claim verdict mismatches/);
  assert.match(result.stdout, /--min-score <0\.\.1>\s+Exit with code 2 when the aggregate claim score is below this threshold/);
  assert.match(result.stdout, /--result-json\s+Print the evaluation result with score, mismatch, and threshold metadata/);
  assert.match(result.stdout, /--result-json-out <path>\s+Write the gate-aware evaluation result JSON to disk/);
  assert.match(result.stdout, /--generated-at <timestamp>\s+Use this ISO timestamp in generated reports/);
});

test("serve --help prints API usage without starting the server", async () => {
  const result = await runCliAllowFailure(["serve", "--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(
    result.stdout,
    /^Quorum serve\n\nUsage:\n  quorum serve \[--host <host>\] \[--port <port>\] \[--max-request-bytes <bytes>\] \[--request-timeout-ms <milliseconds>\]/,
  );
  assert.match(result.stdout, /--max-request-bytes <bytes>\s+Reject JSON bodies larger than this size; defaults to 1048576/);
  assert.match(result.stdout, /--request-timeout-ms <milliseconds>\s+Abort requests that exceed this duration; defaults to 30000/);
  assert.match(result.stdout, /GET  \/\s+Return API discovery metadata for local callers/);
  assert.match(result.stdout, /GET  \/capabilities\s+Return supported Quorum capabilities without endpoint listings/);
  assert.match(result.stdout, /HEAD \/health\s+Return readiness headers without a response body/);
  assert.match(result.stdout, /GET  \/health\s+Return a simple readiness response/);
  assert.match(result.stdout, /GET  \/readyz\s+Return a simple readiness response using the Kubernetes probe alias/);
  assert.match(result.stdout, /HEAD \/readyz\s+Return readiness headers on the Kubernetes probe alias without a response body/);
  assert.match(result.stdout, /GET  \/livez\s+Return a simple liveness response using the Kubernetes probe alias/);
  assert.match(result.stdout, /HEAD \/livez\s+Return liveness headers on the Kubernetes probe alias without a response body/);
  assert.match(result.stdout, /GET  \/version\s+Return the service and HTTP contract version/);
  assert.match(result.stdout, /HEAD \/version\s+Return version headers without a response body/);
  assert.match(result.stdout, /GET  \/openapi\.json\s+Return the machine-readable API description/);
  assert.match(result.stdout, /OPTIONS \*\s+Return CORS preflight headers for browser-based local clients/);
  assert.match(result.stdout, /POST \/extract-claims\s+Extract normalized claims from answer content/);
  assert.match(result.stdout, /POST \/verify-batch\s+Verify multiple answers from JSON request content/);
  assert.match(result.stdout, /POST \/import-review\s+Import reviewer CSV content from JSON request content/);
});

test("serve rejects non-positive request timeout values", async () => {
  const result = await runCliAllowFailure(["serve", "--request-timeout-ms", "0"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --request-timeout-ms value: 0/);
});

test("serve rejects non-positive request size values", async () => {
  const result = await runCliAllowFailure(["serve", "--max-request-bytes", "0"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Invalid --max-request-bytes value: 0/);
});

test("openapi --help prints export usage without starting the server", async () => {
  const result = await runCliAllowFailure(["openapi", "--help"]);

  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^Quorum openapi\n\nUsage:\n  quorum openapi \[--server-url <url>\] \[--out <path>\]/);
  assert.match(result.stdout, /--server-url <url>\s+Set the OpenAPI server URL instead of the default local placeholder/);
  assert.match(result.stdout, /--out <path>\s+Write the OpenAPI JSON document to disk instead of stdout/);
});

test("openapi prints the machine-readable API description", async () => {
  const stdout = await runCli(["openapi"]);
  const openApi = JSON.parse(stdout) as {
    openapi: string;
    paths: Record<string, unknown>;
  };

  assert.equal(openApi.openapi, "3.1.0");
  assert.ok("/verify" in openApi.paths);
  assert.ok("/verify-batch" in openApi.paths);
  assert.ok("/import-review" in openApi.paths);
  assert.ok("/evaluate" in openApi.paths);
});

test("openapi writes the machine-readable API description to disk", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-openapi-"));

  try {
    const outPath = join(tempDir, "openapi.json");
    const stdout = await runCli([
      "openapi",
      "--server-url",
      "https://quorum.internal.example",
      "--out",
      outPath,
    ]);
    const openApi = JSON.parse(await readFile(outPath, "utf8")) as {
      openapi: string;
      servers?: Array<{ url?: string }>;
    };

    assert.match(stdout, /OpenAPI document written to/);
    assert.equal(openApi.openapi, "3.1.0");
    assert.equal(openApi.servers?.[0]?.url, "https://quorum.internal.example");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify reports a missing answer file with a clear error", async () => {
  await assert.rejects(
    runCli([
      "verify",
      "--answer",
      "does-not-exist.md",
      "--source",
      "examples/sources/hr-policy.md",
    ]),
    /Answer file not found: does-not-exist\.md/,
  );
});

test("verify reports a missing source directory with a clear error", async () => {
  await assert.rejects(
    runCli([
      "verify",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source-dir",
      "does-not-exist",
    ]),
    /Approved source directory not found: does-not-exist/,
  );
});

test("verify-batch reports a file passed to --answer-dir with a clear error", async () => {
  await assert.rejects(
    runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
    ]),
    /Answer path is not a directory: examples\/answers\/hr-answer\.md/,
  );
});

test("verify-batch reports a missing explicit answer file with a clear error", async () => {
  await assert.rejects(
    runCli([
      "verify-batch",
      "--answer",
      "does-not-exist.md",
      "--source",
      "examples/sources/hr-policy.md",
    ]),
    /Answer file not found: does-not-exist\.md/,
  );
});

test("import-review reports a missing reviewer csv with a clear error", async () => {
  await assert.rejects(
    runCli(["import-review", "--review-csv", "missing-review.csv"]),
    /Reviewer decision CSV file not found: missing-review\.csv/,
  );
});

test("evaluate reports a missing evaluation fixture with a clear error", async () => {
  await assert.rejects(
    runCli(["evaluate", "--fixture", "missing-evaluation.json"]),
    /Evaluation fixture file not found: missing-evaluation\.json/,
  );
});

test("evaluate reports a file passed to --fixture-dir with a clear error", async () => {
  await assert.rejects(
    runCli(["evaluate", "--fixture-dir", "examples/evaluations/hr-policy.json"]),
    /Evaluation fixture path is not a directory: examples\/evaluations\/hr-policy\.json/,
  );
});

test("evaluate reports when a fixture directory resolves to no fixture files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-empty-eval-dir-"));

  try {
    await assert.rejects(
      runCli(["evaluate", "--fixture-dir", tempDir]),
      new RegExp(`No evaluation fixture files found in ${tempDir.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate reports invalid fixture fields with a clear error", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-invalid-eval-"));
  const fixturePath = join(tempDir, "broken.json");

  try {
    await writeFile(
      fixturePath,
      JSON.stringify({
        name: "Broken fixture",
        answerPath: "answers/hr.md",
        sourcePaths: ["sources/hr-policy.md"],
        expectedSummary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
        expectedClaimVerdicts: ["bad"],
      }),
      "utf8",
    );

    await assert.rejects(
      runCli(["evaluate", "--fixture", fixturePath]),
      new RegExp(
        `${fixturePath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\.expectedClaimVerdicts\\[0\\] unsupported verdict "bad"\\. Expected one of: verified, unsupported, contradicted, needs_review`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify accepts pdf sources", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-pdf-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.pdf");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        createSimplePdf("Employees receive 12 weeks of paid parental leave."),
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; sourcePath: string; title: string; trustLevel: string }>;
      summary: Record<string, number>;
    };

    assert.deepEqual(report.sources, [
      { id: "source_1", sourcePath, title: "hr-policy", trustLevel: "medium" },
    ]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate renders scorecards for shipped example fixtures", async () => {
  const stdout = await runCli([
    "evaluate",
    "--fixture",
    "examples/evaluations/hr-policy.json",
    "--fixture",
    "examples/evaluations/support-policy.json",
  ]);

  assert.match(stdout, /Quorum Evaluation Report/);
  assert.match(stdout, /Evaluation Fixture: HR policy example/);
  assert.match(stdout, /Evaluation Fixture: Support policy example/);
  assert.match(stdout, /Fixtures: 2/);
  assert.match(stdout, /Fixtures with mismatches: 0/);
});

test("evaluate filters shipped example fixtures by domain", async () => {
  const stdout = await runCli([
    "evaluate",
    "--fixture-dir",
    "examples/evaluations",
    "--domain",
    "hr",
  ]);

  assert.match(stdout, /Evaluation Fixture: HR policy example/);
  assert.match(stdout, /Evaluation Fixture: HR onboarding policy example/);
  assert.match(stdout, /Evaluation Fixture: HR PDF policy example/);
  assert.doesNotMatch(stdout, /Evaluation Fixture: Support policy example/);
  assert.match(stdout, /Fixtures: 27/);
});

test("evaluate writes a one-row-per-fixture summary csv", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-summary-"));

  try {
    const summaryCsvPath = join(tempDir, "evaluation-summary.csv");
    const stdout = await runCli([
      "evaluate",
      "--fixture-dir",
      "examples/evaluations",
      "--summary-csv-out",
      summaryCsvPath,
    ]);
    const summaryCsv = await readFile(summaryCsvPath, "utf8");

    assert.match(stdout, /Evaluation summary CSV written to/);
    assert.match(
      summaryCsv,
      /^generated_at,fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,answer_has_claims,source_dirs,source_paths,source_ids,summary_match,matched_claims,total_expected_claims,score,has_mismatch,mismatch_type,first_mismatch_claim_index,first_mismatch_claim_text,first_mismatch_expected_verdict,first_mismatch_actual_verdict,first_mismatch_evidence_title,first_mismatch_evidence_trust_level,first_mismatch_evidence_updated_at,first_mismatch_evidence_source_path,first_mismatch_evidence_source_id,first_mismatch_evidence_score,first_mismatch_evidence_quote,/,
    );
    assert.match(summaryCsv, /HR policy example/);
    assert.match(summaryCsv, /HR onboarding policy example/);
    assert.match(summaryCsv, /HR PDF policy example/);
    assert.match(summaryCsv, /Support policy example/);
    assert.match(summaryCsv, /Support account policy example/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate writes a one-row-per-domain summary csv", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-domain-summary-"));

  try {
    const summaryCsvPath = join(tempDir, "evaluation-domain-summary.csv");
    const stdout = await runCli([
      "evaluate",
      "--fixture-dir",
      "examples/evaluations",
      "--domain-summary-csv-out",
      summaryCsvPath,
    ]);
    const summaryCsv = await readFile(summaryCsvPath, "utf8");

    assert.match(stdout, /Evaluation domain summary CSV written to/);
    assert.match(
      summaryCsv,
      /^generated_at,domain,fixture_count,mismatch_count,mismatch_rate,answers_with_claims,answers_without_claims,matched_claims,total_expected_claims,score,score_label,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review$/m,
    );
    assert.match(summaryCsv, /^[^,\n]+,hr,27,0,0\.000,27,0,82,82,1\.000,100%,32,19,22,9,32,19,22,9$/m);
    assert.match(summaryCsv, /^[^,\n]+,support,50,0,0\.000,49,1,146,146,1\.000,100%,55,33,42,16,55,33,42,16$/m);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate writes a one-row aggregate summary csv", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-aggregate-summary-"));

  try {
    const summaryCsvPath = join(tempDir, "evaluation-aggregate-summary.csv");
    const stdout = await runCli([
      "evaluate",
      "--fixture-dir",
      "examples/evaluations",
      "--aggregate-summary-csv-out",
      summaryCsvPath,
    ]);
    const summaryCsv = await readFile(summaryCsvPath, "utf8");

    assert.match(stdout, /Evaluation aggregate summary CSV written to/);
    assert.match(
      summaryCsv,
      /^generated_at,fixture_count,answers_with_claims,answers_without_claims,mismatch_count,mismatch_rate,matched_claims,total_expected_claims,score,score_label,domains,domain_fixture_counts,domain_mismatch_counts,domain_mismatch_rates,domain_answers_with_claims,domain_answers_without_claims,domain_scores,domain_score_labels,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review$/m,
    );
    assert.match(summaryCsv, /,77,76,1,0,0\.000,228,228,1\.000,100%,hr .*87,52,64,25,87,52,64,25/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate writes a markdown report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-markdown-"));

  try {
    const markdownPath = join(tempDir, "evaluation-report.md");
    const stdout = await runCli([
      "evaluate",
      "--fixture",
      "examples/evaluations/hr-policy.json",
      "--markdown-out",
      markdownPath,
    ]);
    const markdownReport = await readFile(markdownPath, "utf8");

    assert.match(stdout, /Evaluation Markdown report written to/);
    assert.match(markdownReport, /^# Quorum Evaluation Report/);
    assert.match(markdownReport, /### 1\. HR policy example/);
    assert.match(markdownReport, /#### Claim Verdicts/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate writes an html report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-html-"));

  try {
    const htmlPath = join(tempDir, "evaluation-report.html");
    const stdout = await runCli([
      "evaluate",
      "--fixture",
      "examples/evaluations/hr-policy.json",
      "--html-out",
      htmlPath,
    ]);
    const htmlReport = await readFile(htmlPath, "utf8");

    assert.match(stdout, /Evaluation HTML report written to/);
    assert.match(htmlReport, /<!doctype html>/i);
    assert.match(htmlReport, /Fixture scorecard report/);
    assert.match(htmlReport, /HR policy example/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate loads fixture directories recursively", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-dir-"));

  try {
    const answersDir = join(tempDir, "answers");
    const sourcesDir = join(tempDir, "sources");
    const nestedDir = join(tempDir, "nested");
    await Promise.all([
      mkdir(answersDir, { recursive: true }),
      mkdir(sourcesDir, { recursive: true }),
      mkdir(nestedDir, { recursive: true }),
    ]);

    const hrFixture = {
      ...(JSON.parse(
        await readFile(resolve("examples/evaluations/hr-policy.json"), "utf8"),
      ) as {
        answerPath: string;
        sourcePaths: string[];
      }),
      answerPath: "answers/hr-answer.md",
      sourcePaths: ["sources/hr-policy.md"],
    };
    const supportFixture = {
      ...(JSON.parse(
        await readFile(resolve("examples/evaluations/support-policy.json"), "utf8"),
      ) as {
        answerPath: string;
        sourcePaths: string[];
      }),
      answerPath: "../answers/support-answer.md",
      sourcePaths: ["../sources/support-playbook.md"],
    };

    await Promise.all([
      writeFile(
        join(answersDir, "hr-answer.md"),
        await readFile(resolve("examples/answers/hr-answer.md"), "utf8"),
        "utf8",
      ),
      writeFile(
        join(answersDir, "support-answer.md"),
        await readFile(resolve("examples/answers/support-answer.md"), "utf8"),
        "utf8",
      ),
      writeFile(
        join(sourcesDir, "hr-policy.md"),
        await readFile(resolve("examples/sources/hr-policy.md"), "utf8"),
        "utf8",
      ),
      writeFile(
        join(sourcesDir, "support-playbook.md"),
        await readFile(resolve("examples/sources/support-playbook.md"), "utf8"),
        "utf8",
      ),
      writeFile(
        join(tempDir, "hr-policy.json"),
        JSON.stringify(hrFixture, null, 2),
        "utf8",
      ),
      writeFile(
        join(nestedDir, "support-policy.json"),
        JSON.stringify(supportFixture, null, 2),
        "utf8",
      ),
      writeFile(join(nestedDir, "notes.txt"), "ignore me\n", "utf8"),
    ]);

    const stdout = await runCli(["evaluate", "--fixture-dir", tempDir]);

    assert.match(stdout, /Evaluation Fixture: HR policy example/);
    assert.match(stdout, /Evaluation Fixture: Support policy example/);
    assert.match(stdout, /Fixtures: 2/);
    assert.match(stdout, /Fixtures with mismatches: 0/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate exits with code 2 when fail-on-mismatch sees a fixture mismatch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-"));

  try {
    const fixturePath = join(tempDir, "fixture.json");
    await writeFile(
      fixturePath,
      JSON.stringify(
        {
          name: "Mismatch fixture",
          answerPath: resolve("examples/answers/hr-answer.md"),
          sourcePaths: [resolve("examples/sources/hr-policy.md")],
          expectedSummary: {
            verified: 3,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified", "verified", "verified"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCliAllowFailure([
      "evaluate",
      "--fixture",
      fixturePath,
      "--fail-on-mismatch",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Summary match: no/);
    assert.match(result.stdout, /Fixtures with mismatches: 1/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate result-json exposes score gates and enforces min-score without fail-on-mismatch", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-result-"));

  try {
    const fixturePath = join(tempDir, "fixture.json");
    await writeFile(
      fixturePath,
      JSON.stringify(
        {
          name: "Threshold fixture",
          answerPath: resolve("examples/answers/hr-answer.md"),
          sourcePaths: [resolve("examples/sources/hr-policy.md")],
          expectedSummary: {
            verified: 3,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified", "verified", "verified"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCliAllowFailure([
      "evaluate",
      "--fixture",
      fixturePath,
      "--result-json",
      "--min-score",
      "1",
    ]);

    assert.equal(result.code, 2);
    const payload = JSON.parse(result.stdout) as {
      shouldFail: boolean;
      failureReasons: string[];
      mismatchCount: number;
      minScore: number;
      scoreThresholdPassed: boolean;
      summary: { score: number | null };
    };

    assert.equal(payload.shouldFail, true);
    assert.deepEqual(payload.failureReasons, ["mismatch", "min_score"]);
    assert.equal(payload.mismatchCount, 1);
    assert.equal(payload.minScore, 1);
    assert.equal(payload.scoreThresholdPassed, false);
    assert.equal(payload.summary.score, 1 / 3);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate writes the gate-aware result JSON to disk", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-evaluate-result-out-"));

  try {
    const resultPath = join(tempDir, "evaluation-result.json");
    const result = await runCliAllowFailure([
      "evaluate",
      "--fixture-dir",
      "examples/evaluations",
      "--result-json-out",
      resultPath,
    ]);

    assert.equal(result.code, 0);
    assert.match(result.stdout, /Evaluation result JSON written to/);
    const payload = JSON.parse(await readFile(resultPath, "utf8")) as {
      shouldFail: boolean;
      failureReasons: string[];
      mismatchCount: number;
      summary: { fixtureCount: number };
    };
    assert.equal(payload.shouldFail, false);
    assert.deepEqual(payload.failureReasons, []);
    assert.equal(payload.mismatchCount, 0);
    assert.equal(payload.summary.fixtureCount, 77);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluate reports when a domain filter matches no fixtures", async () => {
  await assert.rejects(
    runCli([
      "evaluate",
      "--fixture-dir",
      "examples/evaluations",
      "--domain",
      "finance",
    ]),
    /No evaluation fixtures matched domain filter: finance/,
  );
});

test("verify matches claims against html sources with named entities", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-html-entities-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "refund-policy.html");

    await Promise.all([
      writeFile(
        answerPath,
        "Customers' refund requests require manager review after 30 days.\n",
        "utf8",
      ),
      writeFile(
        sourcePath,
        `<!doctype html>
<html>
  <head>
    <title>Refunds &amp; Exceptions</title>
  </head>
  <body>
    <main>
      <p>Customers&rsquo; refund requests require manager review after 30 days.</p>
    </main>
  </body>
</html>`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      sources: Array<{ title: string }>;
    };

    assert.deepEqual(report.sources.map((source) => source.title), ["Refunds & Exceptions"]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch discovers html answers from answer directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-html-answer-dir-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourcePath = join(tempDir, "support-policy.md");

    await mkdir(answerDir, { recursive: true });
    await Promise.all([
      writeFile(
        join(answerDir, "support-answer.html"),
        `<!doctype html>
<html>
  <body>
    <details open>
      <summary>Support policy</summary>
      <ul>
        <li>Customers&rsquo; refund requests require manager review after 30 days.</li>
      </ul>
    </details>
  </body>
</html>`,
        "utf8",
      ),
      writeFile(
        sourcePath,
        "Customers’ refund requests require manager review after 30 days.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      summary: { verified: number };
      answers: Array<{ answerPath: string; report: { assessments: Array<{ claim: { text: string } }> } }>;
    };

    assert.equal(report.answerCount, 1);
    assert.equal(report.summary.verified, 1);
    assert.match(report.answers[0]?.answerPath ?? "", /support-answer\.html$/);
    assert.deepEqual(
      report.answers[0]?.report.assessments.map((assessment) => assessment.claim.text),
      ["Customers’ refund requests require manager review after 30 days."],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch discovers PDF and DOCX answers from answer directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-document-answer-dir-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourcePath = join(tempDir, "policy.md");
    const docxFixturePath = "node_modules/mammoth/test/test-data/single-paragraph.docx";

    await mkdir(answerDir, { recursive: true });
    await Promise.all([
      writeFile(join(answerDir, "leave-answer.pdf"), createSimplePdf("Employees receive 12 weeks of paid leave.")),
      readFile(docxFixturePath).then((content) => writeFile(join(answerDir, "support-answer.docx"), content)),
      writeFile(
        sourcePath,
        "Employees receive 12 weeks of paid leave. Walking on imported air.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      summary: { verified: number };
      answers: Array<{
        answerPath: string;
        report: { summary: { verified: number }; assessments: Array<{ claim: { text: string } }> };
      }>;
    };

    assert.equal(report.answerCount, 2);
    assert.equal(report.summary.verified, 2);
    assert.deepEqual(
      report.answers.map((answer) => answer.report.assessments[0]?.claim.text),
      ["Employees receive 12 weeks of paid leave.", "Walking on imported air"],
    );
    assert.deepEqual(
      report.answers.map((answer) => answer.report.summary.verified),
      [1, 1],
    );
    assert.match(report.answers[0]?.answerPath ?? "", /leave-answer\.pdf$/);
    assert.match(report.answers[1]?.answerPath ?? "", /support-answer\.docx$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify ignores collapsed html details body content in answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-collapsed-details-answer-"));

  try {
    const answerPath = join(tempDir, "answer.html");
    const sourcePath = join(tempDir, "support-policy.md");

    await Promise.all([
      writeFile(
        answerPath,
        `<!doctype html>
<html>
  <body>
    <details>
      <summary>Support policy</summary>
      <p>Customers&rsquo; refund requests require manager review after 30 days.</p>
    </details>
    <details open>
      <summary>Escalation policy</summary>
      <p>Managers approve billing exceptions within two business days.</p>
    </details>
  </body>
</html>`,
        "utf8",
      ),
      writeFile(
        sourcePath,
        "Managers approve billing exceptions within two business days.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      assessments: Array<{ claim: { text: string } }>;
    };

    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
    assert.deepEqual(
      report.assessments.map((assessment) => assessment.claim.text),
      ["Managers approve billing exceptions within two business days."],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify matches claims extracted from markdown table answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-table-answer-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");

    await Promise.all([
      writeFile(
        answerPath,
        `| Policy | Details |
| --- | --- |
| Parental leave | Employees receive 12 weeks of paid parental leave. |
| Healthcare | Coverage begins after 30 days of employment. |
`,
        "utf8",
      ),
      writeFile(
        sourcePath,
        `Employees receive 12 weeks of paid parental leave.
Coverage begins after 30 days of employment.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      assessments: Array<{ claim: { text: string }; verdict: string }>;
    };

    assert.deepEqual(report.summary, {
      verified: 2,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
    assert.deepEqual(
      report.assessments.map((assessment) => assessment.claim.text),
      [
        "Parental leave: Employees receive 12 weeks of paid parental leave.",
        "Healthcare: Coverage begins after 30 days of employment.",
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify strips inline html formatting from html answers before matching", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-html-inline-answer-"));

  try {
    const answerPath = join(tempDir, "answer.html");
    const sourcePath = join(tempDir, "hr-policy.md");

    await Promise.all([
      writeFile(
        answerPath,
        `<!doctype html>
<html>
  <body>
    <p>Employees receive <a href="/policy">12 weeks of paid parental leave</a> for full-time staff.</p>
    <p><strong>Managers</strong> approve exceptions within <em>five business days</em>.</p>
  </body>
</html>`,
        "utf8",
      ),
      writeFile(
        sourcePath,
        [
          "Employees receive 12 weeks of paid parental leave for full-time staff.",
          "Managers approve exceptions within five business days.",
          "",
        ].join("\n"),
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      assessments: Array<{ claim: { text: string }; verdict: string }>;
    };

    assert.deepEqual(report.summary, {
      verified: 2,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
    assert.deepEqual(
      report.assessments.map((assessment) => assessment.claim.text),
      [
        "Employees receive 12 weeks of paid parental leave for full-time staff.",
        "Managers approve exceptions within five business days.",
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify matches claims extracted from html table answers against html table sources", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-html-table-answer-"));

  try {
    const answerPath = join(tempDir, "answer.html");
    const sourcePath = join(tempDir, "hr-policy.html");

    await Promise.all([
      writeFile(
        answerPath,
        `<!doctype html>
<html>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th><th>Details</th></tr>
      </thead>
      <tbody>
        <tr><td>Parental leave</td><td>Employees receive 12 weeks of paid parental leave.</td></tr>
        <tr><td>Healthcare</td><td>Coverage begins after 30 days of employment.</td></tr>
      </tbody>
    </table>
  </body>
</html>`,
        "utf8",
      ),
      writeFile(
        sourcePath,
        `<!doctype html>
<html>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th><th>Details</th></tr>
      </thead>
      <tbody>
        <tr><td>Parental leave</td><td>Employees receive 12 weeks of paid parental leave.</td></tr>
        <tr><td>Healthcare</td><td>Coverage begins after 30 days of employment.</td></tr>
      </tbody>
    </table>
  </body>
</html>`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      assessments: Array<{ claim: { text: string } }>;
    };

    assert.deepEqual(report.summary, {
      verified: 2,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
    assert.deepEqual(
      report.assessments.map((assessment) => assessment.claim.text),
      [
        "Parental leave: Employees receive 12 weeks of paid parental leave.",
        "Healthcare: Coverage begins after 30 days of employment.",
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify records an explicit reviewer-facing answer label in JSON and reviewer csv outputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-review-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--answer-label",
      "HR reviewer packet",
      "--source",
      sourcePath,
      "--review-csv-out",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerPath?: string;
      answerLabel?: string;
      answerPreview: string;
      summary: Record<string, number>;
    };

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.answerLabel, "HR reviewer packet");
    assert.equal(report.answerPreview, "Employees receive 12 weeks of paid parental leave.");
    assert.equal(report.summary.verified, 1);

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = reviewCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(
      lines[1] ?? "",
      new RegExp(
        `^[^,\\n]+,HR reviewer packet,${escapeRegExp(answerPath)},Employees receive 12 weeks of paid parental leave\\.,clear,,true,claim_1,`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify reads the answer from stdin when --answer - is used", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-stdin-answer-"));

  try {
    const sourcePath = join(tempDir, "hr-policy.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");

    const stdout = await runCli(
      [
        "verify",
        "--answer",
        "-",
        "--source",
        sourcePath,
        "--review-csv-out",
        reviewCsvOutPath,
        "--json",
      ],
      {
        stdin: "Employees receive 12 weeks of paid parental leave.\n",
      },
    );

    const report = JSON.parse(stdout) as {
      answerPath?: string;
      summary: Record<string, number>;
    };

    assert.equal(report.answerPath, "<stdin>");
    assert.equal(report.summary.verified, 1);

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = reviewCsv.trim().split("\n");
    assert.match(
      lines[1] ?? "",
      /^[^,\n]+,<stdin>,<stdin>,Employees receive 12 weeks of paid parental leave\.,clear,,true,claim_1,/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify reads an approved source from stdin when --source - is used", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-stdin-source-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    await writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");
    const stdout = await runCli(
      ["verify", "--answer", answerPath, "--source", "-", "--json"],
      { stdin: "Employees receive 12 weeks of paid parental leave.\n" },
    );
    const report = JSON.parse(stdout) as {
      sources: Array<{ sourcePath: string; title: string }>;
      summary: Record<string, number>;
    };
    assert.deepEqual(report.sources, [{ id: "source_1", sourcePath: "-", title: "-", trustLevel: "medium" }]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify rejects empty resolved source sets", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-empty-sources-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const emptySourceDir = join(tempDir, "empty-sources");

    await mkdir(emptySourceDir, { recursive: true });
    await writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");

    await assert.rejects(
      runCli([
        "verify",
        "--answer",
        answerPath,
        "--source-dir",
        emptySourceDir,
        "--json",
      ]),
      /No approved source files found in/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify ignores hidden source files and hidden source subdirectories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-hidden-sources-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const hiddenSourceDir = join(sourceDir, ".archive");

    await mkdir(hiddenSourceDir, { recursive: true });

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        join(sourceDir, "policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, ".draft-policy.md"),
        "Employees receive 18 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(hiddenSourceDir, "old-policy.md"),
        "Employees receive 18 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ title: string }>;
      summary: Record<string, number>;
    };

    assert.deepEqual(report.sources.map((source) => source.title), ["policy"]);
    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.contradicted, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify ignores indented markdown code blocks in the answer", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-indented-code-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");

    await Promise.all([
      writeFile(
        answerPath,
        `Deployment notes:

    npm run deploy --force

Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      assessments: Array<{ claim: { text: string } }>;
    };

    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.unsupported, 0);
    assert.deepEqual(
      report.assessments.map((assessment) => assessment.claim.text),
      ["Employees receive 12 weeks of paid parental leave."],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify treats no-claim answers as fail-policy matches for needs_review", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-empty-needs-review-"));

  try {
    const answerPath = join(tempDir, "empty.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Short.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await runCliAllowFailure([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--review-csv-out",
      reviewCsvOutPath,
      "--fail-on",
      "needs_review",
      "--json",
    ]);

    assert.equal(result.code, 2);

    const lines = (await readFile(reviewCsvOutPath, "utf8")).trim().split("\n");
    assert.match(
      lines[1] ?? "",
      new RegExp(
        `^[^,\\n]+,empty,${escapeRegExp(answerPath)},Short\\.,matched,needs_review,false,,,,No claims were extracted from this answer\\.,+$`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify writes reviewer csv fail-policy columns for single answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-review-fail-policy-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 18 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    await assert.rejects(
      runCli([
        "verify",
        "--answer",
        answerPath,
        "--source",
        sourcePath,
        "--review-csv-out",
        reviewCsvOutPath,
        "--fail-on",
        "contradicted",
      ]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /CLI exited with code 2/);
        return true;
      },
    );

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = reviewCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(
      lines[1] ?? "",
      new RegExp(
        `^[^,\\n]+,answer,${escapeRegExp(answerPath)},Employees receive 18 weeks of paid parental leave\\.,matched,contradicted,true,claim_1,`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify writes a summary csv for single answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-summary-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const summaryCsvOutPath = join(tempDir, "reports", "summary.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 18 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await runCliAllowFailure([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--summary-csv-out",
      summaryCsvOutPath,
      "--fail-on",
      "contradicted",
    ]);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, new RegExp(`Summary CSV written to ${escapeRegExp(summaryCsvOutPath)}`));

    const summaryCsv = (await readFile(summaryCsvOutPath, "utf8"))
      .replaceAll(",,,0.200", ",,0.200")
      .replaceAll(", | , | ", ", | ");
    const lines = summaryCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "generated_at,answer_label,answer_path,answer_preview,answer_has_claims,primary_verdict,primary_claim,primary_reason,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids",
    );
    assert.match(
      lines[1] ?? "",
      new RegExp(
        `^[^,\\n]+,answer,${escapeRegExp(answerPath)},Employees receive 18 weeks of paid parental leave\\.,true,contradicted,Employees receive 18 weeks of paid parental leave\\.,A closely matching approved source uses different numeric terms\\.,hr-policy,medium,,${escapeRegExp(sourcePath)},source_1,0\\.857,Employees receive 12 weeks of paid parental leave\\.,1,0,1,0,0,matched,contradicted,hr-policy,medium,,${escapeRegExp(sourcePath)},source_1$`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify threads fail-policy context into single-answer text, markdown, and html reports", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-fail-policy-reports-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const markdownOutPath = join(tempDir, "reports", "review.md");
    const htmlOutPath = join(tempDir, "reports", "review.html");

    await Promise.all([
      writeFile(answerPath, "Employees receive 18 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await runCliAllowFailure([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--markdown-out",
      markdownOutPath,
      "--html-out",
      htmlOutPath,
      "--fail-on",
      "contradicted",
    ]);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Fail policy: matched/);
    assert.match(result.stdout, /Fail verdicts: contradicted/);

    const [markdownReport, htmlReport] = await Promise.all([
      readFile(markdownOutPath, "utf8"),
      readFile(htmlOutPath, "utf8"),
    ]);

    assert.match(markdownReport, /- Fail policy: matched \(contradicted\)/);
    assert.match(htmlReport, /<span>Fail policy<\/span>\s*<strong>matched \(contradicted\)<\/strong>/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch returns an aggregate report for each answer file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const batchOutPath = join(tempDir, "reports", "batch-report.json");
    const batchMarkdownOutPath = join(tempDir, "reports", "batch-report.md");
    const batchHtmlOutPath = join(tempDir, "reports", "batch-report.html");
    const batchReviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");
    const batchSummaryCsvOutPath = join(tempDir, "reports", "batch-summary.csv");
    const batchAggregateSummaryCsvOutPath = join(tempDir, "reports", "batch-aggregate-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(answerDir, "hr.md"), "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(join(answerDir, "support.txt"), "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--out",
      batchOutPath,
      "--markdown-out",
      batchMarkdownOutPath,
      "--html-out",
      batchHtmlOutPath,
      "--review-csv-out",
      batchReviewCsvOutPath,
      "--summary-csv-out",
      batchSummaryCsvOutPath,
      "--aggregate-summary-csv-out",
      batchAggregateSummaryCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      sourceCount: number;
      sources: Array<{ id: string; title: string; trustLevel: string }>;
      answers: Array<{
        answerLabel: string;
        answerPath: string;
        shouldFail: boolean;
        failVerdicts: string[];
        report: { summary: Record<string, number> };
      }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 2);
    assert.equal(report.sourceCount, 2);
    assert.deepEqual(report.sources, [
      { id: "source_1", sourcePath: join(sourceDir, "hr-policy.md"), title: "hr-policy", trustLevel: "medium" },
      { id: "source_2", sourcePath: join(sourceDir, "support-playbook.md"), title: "support-playbook", trustLevel: "medium" },
    ]);
    assert.equal(report.answers.length, 2);
    assert.deepEqual(
      report.answers.map((answer) => answer.answerPath).sort(),
      [join(answerDir, "hr.md"), join(answerDir, "support.txt")],
    );
    assert.deepEqual(
      report.answers.map((answer) => answer.answerLabel).sort(),
      ["hr", "support"],
    );
    assert.deepEqual(report.answers.map((answer) => answer.failVerdicts), [[], []]);
    assert.equal(report.summary.verified, 2);
    assert.equal(report.summary.answersWithoutClaims, 0);
    assert.equal(report.summary.answersWithFailures, 0);

    const savedReport = JSON.parse(await readFile(batchOutPath, "utf8")) as typeof report;
    assert.equal(savedReport.answerCount, 2);
    assert.match(await readFile(batchMarkdownOutPath, "utf8"), /# Quorum Batch Verification Report/);
    assert.match(await readFile(batchMarkdownOutPath, "utf8"), /- Answer preview: Employees receive 12 weeks of paid parental leave\./);
    assert.match(await readFile(batchHtmlOutPath, "utf8"), /<title>Quorum Batch Verification Report<\/title>/);
    assert.match(await readFile(batchHtmlOutPath, "utf8"), /Answer preview/);
    assert.match(
      await readFile(batchReviewCsvOutPath, "utf8"),
      /generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes/,
    );
    assert.match(
      await readFile(batchSummaryCsvOutPath, "utf8"),
      /generated_at,answer_label,answer_path,answer_preview,answer_has_claims,primary_verdict,primary_claim,primary_reason,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids/,
    );
    assert.match(
      await readFile(batchAggregateSummaryCsvOutPath, "utf8"),
      /generated_at,answer_count,answers_with_claims,answers_without_claims,answers_with_failures,total_claims,verified,contradicted,unsupported,needs_review,source_count,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids\n[^\n]+,2,2,0,0,2,2,0,0,0,2,/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch accepts repeated answer files alongside answer directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-mixed-inputs-"));

  try {
    const answerDir = join(tempDir, "answers");
    const nestedAnswerDir = join(answerDir, "nested");
    const sourceDir = join(tempDir, "sources");
    const directAnswerPath = join(tempDir, "priority-answer.md");
    const nestedAnswerPath = join(nestedAnswerDir, "support.txt");

    await Promise.all([
      mkdir(nestedAnswerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(directAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(nestedAnswerPath, "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      directAnswerPath,
      "--answer-dir",
      answerDir,
      "--answer",
      nestedAnswerPath,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      answers: Array<{ answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 2);
    assert.deepEqual(report.answers.map((answer) => answer.answerPath), [
      directAnswerPath,
      nestedAnswerPath,
    ]);
    assert.equal(report.summary.verified, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch reads one answer from stdin alongside explicit files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-stdin-answer-"));

  try {
    const sourceDir = join(tempDir, "sources");
    const fileAnswerPath = join(tempDir, "support-answer.md");
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");

    await mkdir(sourceDir, { recursive: true });

    await Promise.all([
      writeFile(
        fileAnswerPath,
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli(
      [
        "verify-batch",
        "--answer",
        "-",
        "--answer",
        fileAnswerPath,
        "--source-dir",
        sourceDir,
        "--review-csv-out",
        reviewCsvOutPath,
        "--json",
      ],
      {
        stdin: "Employees receive 12 weeks of paid parental leave.\n",
      },
    );

    const report = JSON.parse(stdout) as {
      answerCount: number;
      answers: Array<{
        answerLabel: string;
        answerPath: string;
        report: { answerPath?: string; summary: Record<string, number> };
      }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 2);
    assert.deepEqual(
      report.answers.map((answer) => ({
        answerLabel: answer.answerLabel,
        answerPath: answer.answerPath,
        reportAnswerPath: answer.report.answerPath,
      })),
      [
        {
          answerLabel: "<stdin>",
          answerPath: "<stdin>",
          reportAnswerPath: "<stdin>",
        },
        {
          answerLabel: "support-answer",
          answerPath: fileAnswerPath,
          reportAnswerPath: fileAnswerPath,
        },
      ],
    );
    assert.equal(report.summary.verified, 2);

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = reviewCsv.trim().split("\n");
    assert.match(
      lines[1] ?? "",
      /^[^,\n]+,<stdin>,<stdin>,Employees receive 12 weeks of paid parental leave\.,clear,,true,claim_1,/,
    );
    assert.match(
      lines[2] ?? "",
      new RegExp(
        `^[^,\\n]+,support-answer,${escapeRegExp(fileAnswerPath)},Refunds are available within 30 days of purchase\\.,clear,,true,claim_1,`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch preserves custom labels for explicit answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-custom-labels-"));

  try {
    const explicitAnswerPath = join(tempDir, "support-answer.md");
    const answerDir = join(tempDir, "answers");
    const directoryAnswerPath = join(answerDir, "hr-answer.md");
    const sourceDir = join(tempDir, "sources");
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");
    const summaryCsvOutPath = join(tempDir, "reports", "batch-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        explicitAnswerPath,
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
      writeFile(
        directoryAnswerPath,
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      explicitAnswerPath,
      "--answer-label",
      "Support escalation packet",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--review-csv-out",
      reviewCsvOutPath,
      "--summary-csv-out",
      summaryCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answers: Array<{
        answerLabel: string;
        answerPath: string;
        report: { answerLabel?: string };
      }>;
    };

    assert.deepEqual(
      report.answers.map((answer) => ({
        answerLabel: answer.answerLabel,
        answerPath: answer.answerPath,
        reportAnswerLabel: answer.report.answerLabel,
      })),
      [
        {
          answerLabel: "Support escalation packet",
          answerPath: explicitAnswerPath,
          reportAnswerLabel: "Support escalation packet",
        },
        {
          answerLabel: "hr-answer",
          answerPath: directoryAnswerPath,
          reportAnswerLabel: "hr-answer",
        },
      ],
    );

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    assert.match(reviewCsv, /^[^,\n]+,Support escalation packet,/m);
    assert.match(reviewCsv, /^[^,\n]+,hr-answer,/m);

    const summaryCsv = await readFile(summaryCsvOutPath, "utf8");
    assert.match(summaryCsv, /^[^,\n]+,Support escalation packet,/m);
    assert.match(summaryCsv, /^[^,\n]+,hr-answer,/m);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch rejects repeated stdin answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-duplicate-stdin-"));

  try {
    const sourcePath = join(tempDir, "source.md");
    await writeFile(
      sourcePath,
      "Employees receive 12 weeks of paid parental leave.\n",
      "utf8",
    );

    const result = await runCliAllowFailure(
      [
        "verify-batch",
        "--answer",
        "-",
        "--answer",
        "-",
        "--source",
        sourcePath,
        "--json",
      ],
      {
        stdin: "Employees receive 12 weeks of paid parental leave.\n",
      },
    );

    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /Only one --answer - is allowed because stdin can only be consumed once\./,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch rejects empty resolved source sets", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-empty-sources-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const emptySourceDir = join(tempDir, "empty-sources");

    await mkdir(emptySourceDir, { recursive: true });
    await writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");

    await assert.rejects(
      runCli([
        "verify-batch",
        "--answer",
        answerPath,
        "--source-dir",
        emptySourceDir,
        "--json",
      ]),
      /No approved source files found in/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch ignores hidden answer files and hidden answer subdirectories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-hidden-answers-"));

  try {
    const answerDir = join(tempDir, "answers");
    const hiddenAnswerDir = join(answerDir, ".staging");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(hiddenAnswerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "published.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(answerDir, ".draft.md"),
        "Employees receive 18 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(hiddenAnswerDir, "old.md"),
        "Employees receive free catered lunch every day.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      answers: Array<{ answerLabel: string; answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 1);
    assert.deepEqual(
      report.answers.map((answer) => ({
        answerLabel: answer.answerLabel,
        answerPath: answer.answerPath,
      })),
      [
        {
          answerLabel: "published",
          answerPath: join(answerDir, "published.md"),
        },
      ],
    );
    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.contradicted, 0);
    assert.equal(report.summary.unsupported, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch disambiguates duplicate answer labels across directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-duplicate-labels-"));

  try {
    const answerDir = join(tempDir, "answers");
    const hrDir = join(answerDir, "hr");
    const supportDir = join(answerDir, "support");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(hrDir, { recursive: true }),
      mkdir(supportDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(hrDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(join(supportDir, "policy.md"), "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-policy.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answers: Array<{
        answerLabel: string;
        answerPath: string;
        report: { answerLabel?: string; answerPath?: string };
      }>;
    };

    assert.deepEqual(
      report.answers.map((answer) => answer.answerLabel),
      ["hr/policy", "support/policy"],
    );
    assert.deepEqual(
      report.answers.map((answer) => answer.answerPath),
      [join(hrDir, "policy.md"), join(supportDir, "policy.md")],
    );
    assert.deepEqual(
      report.answers.map((answer) => answer.report.answerLabel),
      ["hr/policy", "support/policy"],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify preserves explicit source order ahead of directory-discovered files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-source-order-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const firstSourcePath = join(tempDir, "first.md");
    const secondSourcePath = join(tempDir, "second.md");
    const directorySourcePath = join(sourceDir, "directory.md");

    await mkdir(sourceDir, { recursive: true });

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        firstSourcePath,
        `---
title: First Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
      writeFile(
        secondSourcePath,
        `---
title: Second Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
      writeFile(
        directorySourcePath,
        `---
title: Directory Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      secondSourcePath,
      "--source-dir",
      sourceDir,
      "--source",
      firstSourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; sourcePath: string; title: string; trustLevel: string }>;
      assessments: Array<{
        evidence: Array<{ documentId: string; documentTitle: string }>;
      }>;
    };

    assert.deepEqual(report.sources, [
      { id: "source_1", sourcePath: secondSourcePath, title: "Second Source", trustLevel: "medium" },
      { id: "source_2", sourcePath: firstSourcePath, title: "First Source", trustLevel: "medium" },
      { id: "source_3", sourcePath: join(sourceDir, "directory.md"), title: "Directory Source", trustLevel: "medium" },
    ]);
    assert.equal(report.assessments[0]?.evidence[0]?.documentId, "source_1");
    assert.equal(report.assessments[0]?.evidence[0]?.documentTitle, "Second Source");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify dedupes repeated source files that use different path spellings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-source-dedupe-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const sourcePath = join(sourceDir, "shared.md");
    const explicitSourcePath = `${sourceDir}/./shared.md`;

    await mkdir(sourceDir, { recursive: true });

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: Shared Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      explicitSourcePath,
      "--source-dir",
      resolve(sourceDir),
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; sourcePath: string; title: string; trustLevel: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.sources.length, 1);
    assert.deepEqual(report.sources, [
      { id: "source_1", sourcePath: explicitSourcePath, title: "Shared Source", trustLevel: "medium" },
    ]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch preserves explicit answer order ahead of directory-discovered files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-order-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const secondAnswerPath = join(tempDir, "second.md");
    const firstAnswerPath = join(tempDir, "first.md");
    const directoryAnswerPath = join(answerDir, "directory.md");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(firstAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(secondAnswerPath, "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(directoryAnswerPath, "Healthcare coverage begins after 30 days of employment.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\nHealthcare coverage begins after 30 days of employment.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      secondAnswerPath,
      "--answer",
      firstAnswerPath,
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answers: Array<{ answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.deepEqual(report.answers.map((answer) => answer.answerPath), [
      secondAnswerPath,
      firstAnswerPath,
      directoryAnswerPath,
    ]);
    assert.equal(report.summary.verified, 3);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch dedupes repeated answer files that use different path spellings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-answer-dedupe-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const answerPath = join(answerDir, "shared.md");
    const explicitAnswerPath = `${answerDir}/./shared.md`;

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      explicitAnswerPath,
      "--answer-dir",
      resolve(answerDir),
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      answers: Array<{ answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 1);
    assert.deepEqual(report.answers.map((answer) => answer.answerPath), [explicitAnswerPath]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch exits non-zero when a fail-on verdict appears in any answer", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-fail-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    await assert.rejects(
      runCli([
        "verify-batch",
        "--answer-dir",
        answerDir,
        "--source-dir",
        sourceDir,
        "--fail-on",
        "contradicted",
        "--json",
      ]),
      /CLI exited with code 2/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch reports matching fail verdicts in json and summary csv output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-fail-verdicts-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const batchSummaryCsvOutPath = join(tempDir, "reports", "batch-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const result = await runCliAllowFailure([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--summary-csv-out",
      batchSummaryCsvOutPath,
      "--fail-on",
      "contradicted",
      "--fail-on",
      "unsupported",
      "--json",
    ]);

    assert.equal(result.code, 2);

    const report = JSON.parse(result.stdout) as {
      answers: Array<{ shouldFail: boolean; failVerdicts: string[] }>;
    };

    assert.equal(report.answers[0]?.shouldFail, true);
    assert.deepEqual(report.answers[0]?.failVerdicts, ["contradicted", "unsupported"]);

    assert.match(
      await readFile(batchSummaryCsvOutPath, "utf8"),
      /hr,.*hr\.md,Employees receive 18 weeks of paid parental leave\. Employees receive free catered lunch every day\.,true,contradicted,Employees receive 18 weeks of paid parental leave\.,A closely matching approved source uses different numeric terms\.,hr-policy,medium,,.*hr-policy\.md,source_1,0\.857,Employees receive 12 weeks of paid parental leave\.,2,0,1,1,0,matched,contradicted \| unsupported,hr-policy,medium,,.*hr-policy\.md,source_1/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch prints claim-level details in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
    ]);

    assert.match(stdout, /Quorum Batch Verification Report/);
    assert.match(stdout, /Generated: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    assert.match(stdout, /Sources:\n- hr-policy \(medium trust, path .*hr-policy\.md\)/);
    assert.match(stdout, /Summary: 0 verified, 1 contradicted, 1 unsupported, 0 needs review/);
    assert.match(stdout, /Fail policy: clear/);
    assert.match(stdout, /Fail verdicts: none/);
    assert.match(stdout, /Answer preview: Employees receive 18 weeks of paid parental leave\. Employees receive free catered lunch every day\./);
    assert.match(stdout, /Primary finding: contradicted/);
    assert.match(stdout, /Primary claim: Employees receive 18 weeks of paid parental leave\./);
    assert.match(stdout, /Primary evidence: hr-policy, medium trust, path .*hr-policy\.md, score /);
    assert.match(stdout, /CONTRADICTED  Employees receive 18 weeks of paid parental leave\./);
    assert.match(stdout, /UNSUPPORTED  Employees receive free catered lunch every day\./);
    assert.match(stdout, /Evidence \(hr-policy, medium trust, path .*hr-policy\.md, score /);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch de-duplicates repeated fail-on verdicts in json and summary outputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-duplicate-fail-on-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const batchSummaryCsvOutPath = join(tempDir, "batch-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const result = await runCliAllowFailure([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--summary-csv-out",
      batchSummaryCsvOutPath,
      "--fail-on",
      "contradicted",
      "--fail-on",
      "contradicted",
      "--json",
    ]);

    assert.equal(result.code, 2);

    const report = JSON.parse(result.stdout) as {
      answers: Array<{ shouldFail: boolean; failVerdicts: string[] }>;
    };

    assert.equal(report.answers[0]?.shouldFail, true);
    assert.deepEqual(report.answers[0]?.failVerdicts, ["contradicted"]);
    assert.match(await readFile(batchSummaryCsvOutPath, "utf8"), /,matched,contradicted,/);
    assert.doesNotMatch(
      await readFile(batchSummaryCsvOutPath, "utf8"),
      /contradicted \| contradicted/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch truncates long answer previews in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-preview-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "long.md"),
        `Employees receive 12 weeks of paid parental leave.

Managers approve travel within five business days, and international trips require finance review before booking.
`,
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
    ]);

    assert.match(
      stdout,
      /Answer preview: Employees receive 12 weeks of paid parental leave\. Managers approve travel within five business days, and internation\.\.\./,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch prioritizes risky answers first in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-order-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "clear.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(answerDir, "risky.md"),
        "Employees receive free catered lunch every day.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const result = await runCliAllowFailure([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--fail-on",
      "unsupported",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /risky[\s\S]*clear/);
    assert.doesNotMatch(result.stdout, /clear[\s\S]*risky/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch prints an explicit empty state in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-empty-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
    ]);

    assert.match(stdout, /Primary finding: needs review/);
    assert.match(stdout, /Primary reason: No claims were extracted from this answer\./);
    assert.match(stdout, /Answers with no extracted claims: 1/);
    assert.match(stdout, /No claims were extracted from this answer\./);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch treats no-claim answers as fail-policy matches for needs_review", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-empty-needs-review-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const summaryCsvOutPath = join(tempDir, "reports", "batch-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const result = await runCliAllowFailure([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--summary-csv-out",
      summaryCsvOutPath,
      "--fail-on",
      "needs_review",
      "--json",
    ]);

    assert.equal(result.code, 2);

    const report = JSON.parse(result.stdout) as {
      summary: { answersWithoutClaims: number; answersWithFailures: number };
      answers: Array<{ shouldFail: boolean; failVerdicts: string[] }>;
    };

    assert.equal(report.summary.answersWithoutClaims, 1);
    assert.equal(report.summary.answersWithFailures, 1);
    assert.equal(report.answers[0]?.shouldFail, true);
    assert.deepEqual(report.answers[0]?.failVerdicts, ["needs_review"]);
    assert.match(
      await readFile(summaryCsvOutPath, "utf8"),
      /[^,\n]+,empty,.*empty\.md,Short\.,false,needs_review,,No claims were extracted from this answer\.,,,,,,,,0,0,0,0,0,matched,needs_review,hr-policy,medium,,.*source_1/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch writes a combined reviewer decision csv", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-review-csv-"));

  try {
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");

    await runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers",
      "--source-dir",
      "examples/sources",
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const savedCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = savedCsv.trim().split("\n");

    assert.equal(
      lines[0],
      "generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(
      lines[1] ?? "",
      /^[^,\n]+,hr-answer,examples\/answers\/hr-answer\.md,Employees receive 18 weeks of paid parental leave\..*,clear,,true,claim_1,/,
    );
    assert.match(lines[lines.length - 1] ?? "", /,,$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch preserves no-claim answers through reviewer csv export and import", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-empty-review-csv-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(sourceDir, "policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    assert.match(
      reviewCsv,
      /generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes/,
    );
    assert.match(
      reviewCsv,
      /[^,\n]+,empty,.*empty\.md,Short\.,clear,,false,,,,No claims were extracted from this answer\.,,,,,,/,
    );

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      claims: Array<unknown>;
      answerGroups: Array<{
        label: string;
        answerPath?: string;
        summary: { totalClaims: number };
      }>;
    };

    assert.equal(report.claims.length, 0);
    assert.equal(report.answerGroups[0]?.label, "empty");
    assert.match(report.answerGroups[0]?.answerPath ?? "", /empty\.md$/);
    assert.equal(report.answerGroups[0]?.summary.totalClaims, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review preserves answer paths from batch reviewer decision csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-batch-review-"));

  try {
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");

    await runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers",
      "--source-dir",
      "examples/sources",
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      claims: Array<{
        answerLabel?: string;
        answerPath?: string;
        originalAnswerFailPolicy?: string;
        originalAnswerFailVerdicts: string[];
      }>;
      answerGroups: Array<{
        label: string;
        answerPath?: string;
        originalAnswerFailPolicy?: string;
        originalAnswerFailVerdicts: string[];
        summary: { totalClaims: number };
      }>;
    };

    assert.equal(report.claims[0]?.answerLabel, "hr-answer");
    assert.equal(report.claims[0]?.answerPath, "examples/answers/hr-answer.md");
    assert.equal(report.claims[0]?.originalAnswerFailPolicy, "clear");
    assert.deepEqual(report.claims[0]?.originalAnswerFailVerdicts, []);
    assert.ok(
      report.claims.some(
        (claim) =>
          claim.answerLabel === "support-answer" &&
          claim.answerPath === "examples/answers/support-answer.md",
      ),
    );
    assert.ok(
      report.claims.some(
        (claim) =>
          claim.answerLabel === "hr-onboarding-answer" &&
          claim.answerPath === "examples/answers/hr-onboarding-answer.md",
      ),
    );

    const hrGroup = report.answerGroups.find((group) => group.label === "hr-answer");
    const supportGroup = report.answerGroups.find((group) => group.label === "support-answer");

    assert.equal(hrGroup?.answerPath, "examples/answers/hr-answer.md");
    assert.equal(hrGroup?.originalAnswerFailPolicy, "clear");
    assert.deepEqual(hrGroup?.originalAnswerFailVerdicts, []);
    assert.equal(hrGroup?.summary.totalClaims, 3);
    assert.equal(supportGroup?.answerPath, "examples/answers/support-answer.md");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review preserves answer paths from single-answer reviewer csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-single-review-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "source.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      claims: Array<{ answerLabel?: string; answerPath?: string }>;
    };

    assert.equal(report.claims[0]?.answerLabel, "answer");
    assert.equal(report.claims[0]?.answerPath, answerPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review writes a markdown summary report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-markdown-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const markdownOutPath = join(tempDir, "reports", "review-import.md");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,matched,unsupported,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,clear,,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,"","",`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--markdown-out",
      markdownOutPath,
      "--fail-on",
      "unsupported",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Reviewer decision Markdown report written to/);

    const markdownReport = await readFile(markdownOutPath, "utf8");
    assert.match(markdownReport, /# Quorum Reviewer Decision Import/);
    assert.match(markdownReport, /- Generated at: /);
    assert.match(markdownReport, /- Total claims: 2/);
    assert.match(markdownReport, /- Fail policy: matched \(unsupported\)/);
    assert.match(markdownReport, /## Answer Groups/);
    assert.match(markdownReport, /### hr-answer/);
    assert.match(markdownReport, /- Answer file: examples\/answers\/hr-answer\.md/);
    assert.match(markdownReport, /- Original answer fail policy: matched \(unsupported\)/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review writes an html summary report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-html-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const htmlOutPath = join(tempDir, "reports", "review-import.html");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,matched,unsupported,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,clear,,claim_2,<Flag this answer for legal review.>,unsupported,No approved source contains enough overlapping policy language.,"","","","","","","Needs counsel review before publish"`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--html-out",
      htmlOutPath,
      "--fail-on",
      "unsupported",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Reviewer decision HTML report written to/);

    const htmlReport = await readFile(htmlOutPath, "utf8");
    assert.match(htmlReport, /<!doctype html>/i);
    assert.match(htmlReport, /<title>Quorum Reviewer Decision Import<\/title>/);
    assert.match(htmlReport, /<p class="report-generated-at">Generated at: /);
    assert.match(htmlReport, /<span>Fail policy<\/span><strong>matched \(unsupported\)<\/strong>/);
    assert.match(htmlReport, /<h2><code>hr-answer<\/code><\/h2>/);
    assert.match(htmlReport, /<p class="answer-group__path"><code>examples\/answers\/hr-answer\.md<\/code><\/p>/);
    assert.match(htmlReport, /Original answer fail policy: matched \(unsupported\)/);
    assert.match(htmlReport, /Needs counsel review before publish/);
    assert.match(htmlReport, /&lt;Flag this answer for legal review\.\&gt;/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review writes a summary csv report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-summary-csv-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const summaryCsvOutPath = join(tempDir, "reports", "review-import-summary.csv");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,clear,,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,matched,contradicted,claim_2,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate to support ops
`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--summary-csv-out",
      summaryCsvOutPath,
      "--fail-on",
      "needs_review",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Reviewer decision summary CSV written to/);

    const summaryCsv = await readFile(summaryCsvOutPath, "utf8");
    const lines = summaryCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "generated_at,answer_label,answer_path,answer_preview,answer_has_claims,review_status,primary_final_verdict,primary_claim,primary_model_reason,primary_reviewer_notes,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,reviewed_claims,pending_claims,overridden_claims,verified,contradicted,unsupported,needs_review,original_answer_fail_policy,original_answer_fail_verdicts,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids",
    );
    assert.match(
      lines[1] ?? "",
      /^[^,\n]+,hr-answer,examples\/answers\/hr-answer\.md,Employees receive 12 weeks of paid parental leave\.,true,reviewed,verified,Employees receive 12 weeks of paid parental leave\.,The claim is strongly supported by an approved source\.,Approved,HR Policy,high,2026-05-31,,,0\.998,Employees receive 12 weeks of paid parental leave\.,1,1,0,0,1,0,0,0,clear,,clear,,HR Policy,high,2026-05-31,,$/,
    );
    assert.match(
      lines[2] ?? "",
      /^[^,\n]+,support-answer,examples\/answers\/support-answer\.md,Refunds are available within 14 days of purchase\.,true,reviewed,needs_review,Refunds are available within 14 days of purchase\.,A closely matching approved source uses different numeric terms\.,Escalate to support ops,Support Playbook,medium,2026-06-01,,,0\.842,Refunds are available within 30 days of purchase\.,1,1,0,1,0,0,0,1,matched,contradicted,matched,needs_review,Support Playbook,medium,2026-06-01,,$/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review summary csv aggregates unique source context across answer claims", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-summary-source-context-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const summaryCsvOutPath = join(tempDir, "reports", "review-import-summary.csv");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase. Enterprise support requests receive a first response within four business hours.,matched,contradicted | unsupported,claim_1,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate refund policy
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase. Enterprise support requests receive a first response within four business hours.,matched,contradicted | unsupported,claim_2,Enterprise support requests receive a first response within four business hours.,verified,The claim is strongly supported by an approved source.,Support SLA,high,2026-06-15,0.991,Enterprise support requests receive a first response within four business hours.,verified,Confirmed
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase. Enterprise support requests receive a first response within four business hours.,matched,contradicted | unsupported,claim_3,Customers receive a dedicated onboarding manager.,unsupported,No approved source matched strongly enough.,Support Playbook,medium,2026-06-01,0.200,Refund requests receive an initial response within one business day.,,Needs evidence
`,
      "utf8",
    );

    const result = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--summary-csv-out",
      summaryCsvOutPath,
    ]);

    assert.match(result, /Reviewer decision summary CSV written to/);

    const summaryCsv = (await readFile(summaryCsvOutPath, "utf8"))
      .replaceAll(",,,0.200", ",,0.200")
      .replaceAll(", | , | ", ", | ");
    assert.match(
      summaryCsv,
      /support-answer,examples\/answers\/support-answer\.md,Refunds are available within 14 days of purchase\. Enterprise support requests receive a first response within four business hours\.,true,pending,unsupported,Customers receive a dedicated onboarding manager\.,No approved source matched strongly enough\.,Needs evidence,Support Playbook,medium,2026-06-01,,0.200,Refund requests receive an initial response within one business day\.,3,2,1,1,1,0,1,1,matched,contradicted \| unsupported,clear,,Support Playbook \| Support SLA,medium \| high,2026-06-01 \| 2026-06-15, \| /,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review reads reviewer csv input from stdin", async () => {
  const stdout = await runCli(
    ["import-review", "--review-csv", "-", "--json"],
    { stdin: `answer_label,answer_path,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,matched,unsupported,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,Employees receive 12 weeks of paid parental leave.,,
` },
  );

  const report = JSON.parse(stdout) as {
    claims: Array<{
      answerPath?: string;
      finalVerdict: string;
      originalAnswerFailPolicy?: string;
      originalAnswerFailVerdicts: string[];
    }>;
    summary: Record<string, number>;
  };

  assert.equal(report.claims[0]?.answerPath, "examples/answers/hr-answer.md");
  assert.equal(report.claims[0]?.finalVerdict, "verified");
  assert.equal(report.claims[0]?.originalAnswerFailPolicy, "matched");
  assert.deepEqual(report.claims[0]?.originalAnswerFailVerdicts, ["unsupported"]);
  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.summary.verified, 1);
});

test("import-review exits non-zero when a final reviewer-aware verdict matches fail-on", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-fail-on-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,contradicted,A closely matching approved source uses different numeric terms.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved after policy check
examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,,,,
`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--json",
      "--fail-on",
      "unsupported",
      "--fail-on",
      "contradicted",
    ]);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");

    const report = JSON.parse(result.stdout) as {
      summary: Record<string, number>;
    };

    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.unsupported, 1);
    assert.equal(report.summary.contradicted, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review result-json includes gate metadata and can be written to disk", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-result-json-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    const resultJsonOutPath = join(tempDir, "reports", "result.json");
    await writeFile(
      reviewCsvPath,
      [
        "generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
        "2026-07-12T00:00:00.000Z,HR packet,answers/hr.md,Leave policy,clear,,true,claim_1,Employees receive 18 weeks of leave.,contradicted,Conflicting policy,HR Policy,high,2026-07-01,policies/hr.md,,0.857,Employees receive 12 weeks of leave.,needs_review,Needs HR review",
      ].join("\n"),
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--result-json",
      "--result-json-out",
      resultJsonOutPath,
      "--fail-on",
      "needs_review",
    ]);

    assert.equal(result.code, 2);
    const parsed = JSON.parse(result.stdout) as {
      report: { summary: { needs_review: number } };
      shouldFail: boolean;
      failVerdicts: string[];
    };
    assert.equal(parsed.shouldFail, true);
    assert.deepEqual(parsed.failVerdicts, ["needs_review"]);
    assert.equal(parsed.report.summary.needs_review, 1);

    const saved = JSON.parse(await readFile(resultJsonOutPath, "utf8")) as typeof parsed;
    assert.deepEqual(saved, parsed);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review treats no-claim metadata rows as fail-policy matches for needs_review", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-empty-needs-review-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const summaryCsvOutPath = join(tempDir, "reports", "review-import-summary.csv");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,answer_preview,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
empty,examples/answers/empty.md,Short.,false,,,,No claims were extracted from this answer.,,,,
`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--summary-csv-out",
      summaryCsvOutPath,
      "--fail-on",
      "needs_review",
    ]);

    assert.equal(result.code, 2);
    assert.match(
      await readFile(summaryCsvOutPath, "utf8"),
      /empty,examples\/answers\/empty\.md,Short\.,false,no_claims,needs_review,,No claims were extracted from this answer\.,,.*0,0,0,0,0,0,0,0,,,matched,needs_review/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("serve starts the HTTP API and verifies requests", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "serve", "--port", "0"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  try {
    const apiUrl = await waitForServerUrl(() => stdout);
    const response = await fetch(`${apiUrl}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerLabel: "HR reviewer packet",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
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

    assert.equal(response.status, 200);
    const result = await response.json() as {
      report: {
        answerLabel?: string;
        summary: Record<string, number>;
      };
    };

    assert.equal(result.report.answerLabel, "HR reviewer packet");
    assert.equal(result.report.summary.verified, 1);
  } finally {
    child.kill("SIGTERM");
    const exitCode = await waitForChildExit(child);
    assert.equal(stderr, "");
    assert.equal(exitCode, 0);
  }
});

async function runCli(
  args: string[],
  options?: { stdin?: string },
): Promise<string> {
  const result = await runCliAllowFailure(args, options);

  if (result.code === 0) {
    return result.stdout;
  }

  throw new Error(result.stderr.trim() || `CLI exited with code ${result.code}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function waitForServerUrl(readStdout: () => string): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10000) {
    const match = readStdout().match(/Quorum API listening on (http:\/\/[^\s]+)/);

    if (match?.[1]) {
      return match[1];
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Timed out waiting for API server startup.");
}

async function waitForChildExit(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

test("review-queue combines reviewer workload and benchmark drift", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-review-queue-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    const csvOutPath = join(tempDir, "queue.csv");
    await runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers",
      "--source-dir",
      "examples/sources",
      "--review-csv-out",
      reviewCsvPath,
    ]);

    const stdout = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--fixture-dir",
      "examples/evaluations",
      "--json",
      "--csv-out",
      csvOutPath,
    ]);
    const overview = JSON.parse(stdout) as {
      queueStatus: string | null;
      review: { totalAnswers: number; pendingAnswers: number };
      evaluation: { fixtureCount: number; mismatchCount: number };
    };

    assert.equal(overview.review.totalAnswers, 36);
    assert.equal(overview.review.pendingAnswers, 35);
    assert.equal(overview.queueStatus, null);
    assert.equal(overview.evaluation.fixtureCount, 77);
    assert.equal(overview.evaluation.mismatchCount, 0);
    assert.match(await readFile(csvOutPath, "utf8"), /total_answers.*pending_answers/);

    const text = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--fixture-dir",
      "examples/evaluations",
    ]);
    assert.match(text, /Reviewer queue: 36 answers \(35 pending, 0 reviewed, 1 no claims\)/);
    assert.match(text, /Final verdicts: 25 verified, 17 contradicted, 31 unsupported, 31 needs review/);
    assert.match(text, /Benchmark drift: 0\/77 mismatches \(0%\)/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("review-queue accepts a stable generated-at timestamp for JSON and CSV handoffs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-review-queue-generated-at-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    const csvOutPath = join(tempDir, "queue.csv");
    await runCli([
      "verify-batch",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--review-csv-out",
      reviewCsvPath,
    ]);

    const stdout = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--generated-at",
      "2026-07-15T04:00:00.000Z",
      "--json",
      "--csv-out",
      csvOutPath,
    ]);

    const overview = JSON.parse(stdout) as { generatedAt: string };
    assert.equal(overview.generatedAt, "2026-07-15T04:00:00.000Z");
    assert.match(await readFile(csvOutPath, "utf8"), /2026-07-15T04:00:00\.000Z/);
    assert.match(await readFile(csvOutPath, "utf8"), /"generated_at","queue_status","domains","total_answers"/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("review-queue supports result-json naming for machine-readable handoffs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-review-queue-result-json-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    const resultJsonPath = join(tempDir, "queue.json");
    await runCli([
      "verify-batch",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--review-csv-out",
      reviewCsvPath,
    ]);

    const stdout = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--result-json",
      "--result-json-out",
      resultJsonPath,
    ]);

    assert.equal(JSON.parse(stdout).review.totalAnswers, 1);
    assert.equal(JSON.parse(await readFile(resultJsonPath, "utf8")).review.totalAnswers, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("review-queue scopes workload to a queue status", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-review-queue-filter-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers",
      "--source-dir",
      "examples/sources",
      "--review-csv-out",
      reviewCsvPath,
    ]);

    const pendingStdout = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--queue-status",
      "pending",
      "--json",
    ]);
    const pendingOverview = JSON.parse(pendingStdout) as {
      queueStatus: string;
      review: Record<string, number>;
    };
    assert.deepEqual(pendingOverview.review, {
      totalAnswers: 35,
      pendingAnswers: 35,
      reviewedAnswers: 0,
      noClaimsAnswers: 0,
      totalClaims: 104,
      pendingClaims: 104,
      reviewedClaims: 0,
      verdicts: { verified: 25, contradicted: 17, unsupported: 31, needs_review: 31 },
    });
    assert.equal(pendingOverview.queueStatus, "pending");

    const noClaimsStdout = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--queue-status",
      "no_claims",
      "--json",
    ]);
    const noClaimsOverview = JSON.parse(noClaimsStdout) as {
      review: Record<string, number>;
    };
    assert.deepEqual(noClaimsOverview.review, {
      totalAnswers: 1,
      pendingAnswers: 0,
      reviewedAnswers: 0,
      noClaimsAnswers: 1,
      totalClaims: 0,
      pendingClaims: 0,
      reviewedClaims: 0,
      verdicts: { verified: 0, contradicted: 0, unsupported: 0, needs_review: 0 },
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("review-queue scopes benchmark drift to selected domains", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-review-queue-domain-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await runCli([
      "verify-batch",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--review-csv-out",
      reviewCsvPath,
    ]);

    const stdout = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--fixture-dir",
      "examples/evaluations",
      "--domain",
      "hr",
      "--json",
    ]);
    const overview = JSON.parse(stdout) as {
      domains: string[];
      evaluation: { fixtureCount: number; domains: Array<{ domain: string; fixtureCount: number; mismatchCount: number }> };
    };

    assert.deepEqual(overview.domains, ["hr"]);
    assert.equal(overview.evaluation.fixtureCount, 27);
    assert.deepEqual(overview.evaluation.domains, [{ domain: "hr", fixtureCount: 27, mismatchCount: 0 }]);
    const csvOutPath = join(tempDir, "queue.csv");
    const csv = await runCli([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--fixture-dir",
      "examples/evaluations",
      "--domain",
      "hr",
      "--csv-out",
      csvOutPath,
      "--json",
    ]);
    assert.ok(csv);
    assert.match(await readFile(csvOutPath, "utf8"), /"generated_at","queue_status","domains","total_answers"/);
    assert.match(await readFile(csvOutPath, "utf8"), /"2026-.*","","hr","/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("review-queue fails closed when a domain filter matches no fixtures", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-review-queue-domain-empty-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await runCli([
      "verify-batch",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--review-csv-out",
      reviewCsvPath,
    ]);

    const result = await runCliAllowFailure([
      "review-queue",
      "--review-csv",
      reviewCsvPath,
      "--fixture-dir",
      "examples/evaluations",
      "--domain",
      "finance",
      "--json",
    ]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /No evaluation fixtures matched domain filter: finance/);
    assert.equal(result.stdout, "");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function runCliAllowFailure(
  args: string[],
  options?: { stdin?: string },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    if (options?.stdin !== undefined) {
      child.stdin.end(options.stdin);
    } else {
      child.stdin.end();
    }

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
