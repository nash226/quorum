import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApiServer, startApiServer } from "../src/api-server.js";
import {
  ANSWER_EXTENSIONS,
  CLAIM_VERDICTS,
  importReviewerDecisionContents,
  importReviewerDecisionContentsResult,
  evaluateFixtureContent,
  evaluateFixtureContentResult,
  evaluateFixtureContents,
  evaluateFixtureContentsResult,
  evaluateFixtureFile,
  evaluateFixtureFileResult,
  evaluateFixtureFiles,
  evaluateFixtureFilesResult,
  evaluateFixtures,
  evaluateFixturesResult,
  hasEvaluationMismatch,
  importReviewerDecisionFile,
  importReviewerDecisionFileResult,
  importReviewerDecisions,
  importReviewerDecisionsResult,
  type InMemorySingleVerificationResultOptions,
  loadEvaluationFixtureFromContent,
  loadSources,
  loadSourcesFromContent,
  matchingFailVerdicts,
  parseClaimVerdict,
  renderAnswerLabel,
  renderAnswerLabels,
  renderAnswerPreview,
  renderBatchHtmlReport,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderEvaluationHtmlReport,
  renderEvaluationSummaryCsv,
  renderEvaluationTextReport,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
  resolveAnswerPaths,
  resolveSourcePaths,
  SOURCE_EXTENSIONS,
  shouldFailReport,
  verifyAnswers,
  verifyAnswersResult,
  verifyAnswerBatchContents,
  verifyAnswerBatchContentsResult,
  verifyAnswerBatchFileInputs,
  verifyAnswerBatchFileInputsResult,
  verifyAnswerContents,
  verifyAnswerContentsResult,
  verifyAnswer,
  verifyAnswerBatch,
  verifyAnswerBatchResult,
  verifyAnswerFile,
  verifyAnswerFileInputs,
  verifyAnswerFileInputsResult,
  verifyAnswerFileResult,
  verifyAnswerResult,
} from "../src/index.js";

test("programmatic API exposes supported source and answer extensions", () => {
  assert.deepEqual([...SOURCE_EXTENSIONS], [".md", ".markdown", ".txt", ".html", ".htm", ".pdf"]);
  assert.deepEqual([...ANSWER_EXTENSIONS], [".md", ".markdown", ".txt", ".html", ".htm"]);
});

test("programmatic API verifies an answer file against loaded sources", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });
    const report = await verifyAnswerFile(answerPath, sources, "2026-07-05T00:00:00.000Z");

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.generatedAt, "2026-07-05T00:00:00.000Z");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API verifies an answer file through an options object", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-file-options-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });
    const report = await verifyAnswerFile({
      answerPath,
      answerLabel: "HR reviewer packet",
      sources,
      generatedAt: "2026-07-06T19:00:00.000Z",
    });

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.answerLabel, "HR reviewer packet");
    assert.equal(report.generatedAt, "2026-07-06T19:00:00.000Z");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API verifies file inputs without a separate source-loading step", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-file-inputs-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const sourcePath = join(sourceDir, "policy.md");

    await mkdir(sourceDir, { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const report = await verifyAnswerFileInputs({
      answerPath,
      sourcePaths: [],
      sourceDirs: [sourceDir],
      generatedAt: "2026-07-06T10:00:00.000Z",
    });

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.generatedAt, "2026-07-06T10:00:00.000Z");
    assert.equal(report.sources[0]?.title, "HR Policy");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API applies an explicit answer label to file verification helpers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-file-label-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });

    const report = await verifyAnswerFile(
      answerPath,
      sources,
      "2026-07-06T12:00:00.000Z",
      "HR reviewer packet",
    );
    const result = await verifyAnswerFileResult({
      answerPath,
      answerLabel: "HR reviewer packet",
      sources,
      failOn: ["contradicted"],
      generatedAt: "2026-07-06T12:00:00.000Z",
    });
    const directFileReport = await verifyAnswerFileInputs({
      answerPath,
      answerLabel: "HR reviewer packet",
      sourcePaths: [sourcePath],
      sourceDirs: [],
      generatedAt: "2026-07-06T12:00:00.000Z",
    });
    const directFileResult = await verifyAnswerFileInputsResult({
      answerPath,
      answerLabel: "HR reviewer packet",
      sourcePaths: [sourcePath],
      sourceDirs: [],
      failOn: ["contradicted"],
      generatedAt: "2026-07-06T12:00:00.000Z",
    });

    assert.equal(report.answerLabel, "HR reviewer packet");
    assert.equal(result.report.answerLabel, "HR reviewer packet");
    assert.equal(directFileReport.answerLabel, "HR reviewer packet");
    assert.equal(directFileResult.report.answerLabel, "HR reviewer packet");
    assert.equal(result.shouldFail, false);
    assert.equal(directFileResult.shouldFail, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API resolves source and answer paths in CLI order", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-paths-"));

  try {
    const answerDir = join(tempDir, "answers");
    const nestedAnswerDir = join(answerDir, "nested");
    const sourceDir = join(tempDir, "sources");
    const nestedSourceDir = join(sourceDir, "nested");
    const explicitAnswerPath = join(tempDir, "explicit-answer.md");
    const explicitSourcePath = join(tempDir, "explicit-source.md");
    const directoryAnswerPath = join(answerDir, "a-answer.md");
    const nestedAnswerPath = join(nestedAnswerDir, "b-answer.txt");
    const directorySourcePath = join(sourceDir, "a-source.md");
    const nestedSourcePath = join(nestedSourceDir, "b-source.html");

    await Promise.all([
      mkdir(nestedAnswerDir, { recursive: true }),
      mkdir(nestedSourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(explicitAnswerPath, "Explicit answer.\n", "utf8"),
      writeFile(directoryAnswerPath, "Directory answer.\n", "utf8"),
      writeFile(nestedAnswerPath, "Nested answer.\n", "utf8"),
      writeFile(explicitSourcePath, "Explicit source.\n", "utf8"),
      writeFile(directorySourcePath, "Directory source.\n", "utf8"),
      writeFile(
        nestedSourcePath,
        "<html><body><main><p>Nested source.</p></main></body></html>",
        "utf8",
      ),
    ]);

    assert.deepEqual(
      await resolveAnswerPaths([explicitAnswerPath], [answerDir]),
      [explicitAnswerPath, directoryAnswerPath, nestedAnswerPath],
    );
    assert.deepEqual(
      await resolveSourcePaths([explicitSourcePath], [sourceDir]),
      [explicitSourcePath, directorySourcePath, nestedSourcePath],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API reports missing explicit batch answer paths during resolution", async () => {
  await assert.rejects(
    resolveAnswerPaths(["missing-answer.md"], []),
    /Answer file not found: missing-answer\.md/,
  );
});

test("programmatic API batches file and directory answers with fail verdicts", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const explicitAnswerPath = join(tempDir, "support-answer.md");
    const directoryAnswerPath = join(answerDir, "hr-answer.md");
    const hrSourcePath = join(sourceDir, "hr-policy.md");
    const supportSourcePath = join(sourceDir, "support-policy.md");

    await mkdir(answerDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await Promise.all([
      writeFile(
        explicitAnswerPath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        directoryAnswerPath,
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        hrSourcePath,
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        supportSourcePath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
    });
    const report = await verifyAnswerBatch({
      answerPaths: [explicitAnswerPath],
      answerDirPaths: [answerDir],
      sources,
      failOn: ["contradicted"],
      generatedAt: "2026-07-05T01:00:00.000Z",
    });

    assert.equal(report.generatedAt, "2026-07-05T01:00:00.000Z");
    assert.equal(report.answerCount, 2);
    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.contradicted, 1);
    assert.equal(report.summary.answersWithFailures, 1);
    assert.deepEqual(
      report.answers.map((answer) => ({
        label: answer.answerLabel,
        shouldFail: answer.shouldFail,
      })),
      [
        { label: "support-answer", shouldFail: false },
        { label: "hr-answer", shouldFail: true },
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API batches file inputs without a separate source-loading step", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-file-inputs-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const answerPath = join(answerDir, "hr.md");
    const sourcePath = join(sourceDir, "policy.md");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const report = await verifyAnswerBatchFileInputs({
      answerPaths: [],
      answerDirPaths: [answerDir],
      sourcePaths: [],
      sourceDirs: [sourceDir],
      generatedAt: "2026-07-06T13:00:00.000Z",
    });

    assert.equal(report.generatedAt, "2026-07-06T13:00:00.000Z");
    assert.equal(report.answerCount, 1);
    assert.equal(report.sources[0]?.title, "HR Policy");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API preserves explicit batch answer labels", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-labels-"));

  try {
    const answerDir = join(tempDir, "answers");
    const explicitAnswerPath = join(tempDir, "support.md");
    const directoryAnswerPath = join(answerDir, "hr.md");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(explicitAnswerPath, "Refunds are available for 30 days from the purchase date.\n", "utf8"),
      writeFile(directoryAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        join(sourceDir, "refunds.md"),
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "benefits.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
    });
    const report = await verifyAnswerBatch({
      answerPaths: [explicitAnswerPath],
      answerDirPaths: [answerDir],
      answerLabelsByPath: {
        [explicitAnswerPath]: "Support escalation packet",
      },
      sources,
      generatedAt: "2026-07-06T15:00:00.000Z",
    });

    assert.deepEqual(
      report.answers.map((answer) => ({
        label: answer.answerLabel,
        path: answer.answerPath,
        reportLabel: answer.report.answerLabel,
      })),
      [
        {
          label: "Support escalation packet",
          path: explicitAnswerPath,
          reportLabel: "Support escalation packet",
        },
        {
          label: "hr",
          path: directoryAnswerPath,
          reportLabel: "hr",
        },
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API still supports direct in-memory verification", () => {
  const report = verifyAnswer(
    "Benefits begin on day one of employment.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Benefits begin on day one of employment.",
      },
    ],
    "2026-07-05T02:00:00.000Z",
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(report.generatedAt, "2026-07-05T02:00:00.000Z");
});

test("programmatic API batches in-memory answers for workflow callers", () => {
  const sources = [
    {
      id: "source_1",
      title: "Benefits policy",
      trustLevel: "high" as const,
      content: "Employees receive 12 weeks of paid parental leave.",
    },
    {
      id: "source_2",
      title: "Refund policy",
      trustLevel: "high" as const,
      content: "Refunds are available for 30 days from the purchase date.",
    },
  ];

  const report = verifyAnswers({
    answers: [
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Employees receive 16 weeks of paid parental leave.",
        answerLabel: "HR escalation draft",
      },
      {
        answer: "Refunds are available for 30 days from the purchase date.",
        answerPath: "answers/support.md",
      },
    ],
    sources,
    failOn: ["contradicted"],
    generatedAt: "2026-07-05T02:15:00.000Z",
  });

  assert.equal(report.generatedAt, "2026-07-05T02:15:00.000Z");
  assert.equal(report.answerCount, 3);
  assert.equal(report.summary.verified, 2);
  assert.equal(report.summary.contradicted, 1);
  assert.equal(report.summary.answersWithFailures, 1);
  assert.deepEqual(
    report.answers.map((answer) => ({
      label: answer.answerLabel,
      path: answer.answerPath,
      shouldFail: answer.shouldFail,
    })),
    [
      {
        label: "hr",
        path: "answers/hr.md",
        shouldFail: false,
      },
      {
        label: "HR escalation draft",
        path: "<memory:2>",
        shouldFail: true,
      },
      {
        label: "support",
        path: "answers/support.md",
        shouldFail: false,
      },
    ],
  );
});

test("programmatic API loads in-memory source content for embedded workflows", async () => {
  const sources = await loadSourcesFromContent({
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
      {
        sourcePath: "help/refunds.html",
        content: `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "low",
  });

  assert.deepEqual(
    sources.map((source) => ({
      title: source.title,
      trustLevel: source.trustLevel,
      content: source.content,
    })),
    [
      {
        title: "HR Policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      },
      {
        title: "Refund Policy",
        trustLevel: "low",
        content: "Refund Policy\n\nRefunds are available for 30 days from the purchase date.",
      },
    ],
  );

  const report = verifyAnswers({
    answers: [
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Refunds are available for 30 days from the purchase date.",
        answerPath: "answers/refunds.md",
      },
    ],
    sources,
    generatedAt: "2026-07-05T03:00:00.000Z",
  });

  assert.deepEqual(report.summary, {
    verified: 2,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
    answersWithoutClaims: 0,
    answersWithFailures: 0,
  });
});

test("programmatic API verifies one in-memory answer against raw source content", async () => {
  const report = await verifyAnswerContents({
    answer: "Refunds are available for 30 days from the purchase date.",
    answerLabel: "support-agent draft",
    sources: [
      {
        sourcePath: "help/refunds.html",
        content: `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "high",
    generatedAt: "2026-07-05T03:30:00.000Z",
  });

  assert.equal(report.answerLabel, "support-agent draft");
  assert.equal(report.answerPath, undefined);
  assert.equal(report.generatedAt, "2026-07-05T03:30:00.000Z");
  assert.equal(report.sources[0]?.title, "Refund Policy");
  assert.equal(report.sources[0]?.trustLevel, "high");
  assert.deepEqual(report.summary, {
    verified: 1,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  });
});

test("programmatic API returns fail-policy metadata for one answer file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-single-file-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 16 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "high",
    });
    const result = await verifyAnswerFileResult({
      answerPath,
      sources,
      failOn: ["contradicted", "unsupported"],
      generatedAt: "2026-07-05T03:35:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-05T03:35:00.000Z");
    assert.equal(result.report.answerPath, answerPath);
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API supports positional verifyAnswerFileResult calls", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-single-file-result-positional-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 16 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "high",
    });

    const resultWithFailOnOnly = await verifyAnswerFileResult(answerPath, sources, [
      "contradicted",
      "unsupported",
    ]);
    const resultWithAllArgs = await verifyAnswerFileResult(
      answerPath,
      sources,
      "2026-07-06T21:00:00.000Z",
      "HR escalation draft",
      ["contradicted"],
    );

    assert.equal(resultWithFailOnOnly.report.answerPath, answerPath);
    assert.equal(resultWithFailOnOnly.shouldFail, true);
    assert.deepEqual(resultWithFailOnOnly.failVerdicts, ["contradicted"]);

    assert.equal(resultWithAllArgs.report.generatedAt, "2026-07-06T21:00:00.000Z");
    assert.equal(resultWithAllArgs.report.answerLabel, "HR escalation draft");
    assert.equal(resultWithAllArgs.shouldFail, true);
    assert.deepEqual(resultWithAllArgs.failVerdicts, ["contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns fail-policy metadata for file inputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-single-file-input-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 16 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await verifyAnswerFileInputsResult({
      answerPath,
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "medium",
      failOn: ["contradicted"],
      generatedAt: "2026-07-06T11:00:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-06T11:00:00.000Z");
    assert.equal(result.report.answerPath, answerPath);
    assert.equal(result.report.sources[0]?.trustLevel, "medium");
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns fail-policy metadata for one in-memory answer", () => {
  const result = verifyAnswerResult({
    answer: "Employees receive 16 weeks of paid parental leave.",
    answerLabel: "HR escalation draft",
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["contradicted"],
    generatedAt: "2026-07-05T03:40:00.000Z",
  });

  assert.equal(result.report.generatedAt, "2026-07-05T03:40:00.000Z");
  assert.equal(result.report.answerLabel, "HR escalation draft");
  assert.equal(result.report.answerPath, undefined);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["contradicted"]);
});

test("programmatic API returns fail-policy metadata for one raw-content verification", async () => {
  const options: InMemorySingleVerificationResultOptions = {
    answer: "Employees receive 12 weeks of paid parental leave.",
    answerPath: "answers/hr.md",
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
    generatedAt: "2026-07-05T03:42:00.000Z",
  };
  const result = await verifyAnswerContentsResult(options);

  assert.equal(result.report.generatedAt, "2026-07-05T03:42:00.000Z");
  assert.equal(result.report.answerPath, "answers/hr.md");
  assert.equal(result.shouldFail, false);
  assert.deepEqual(result.failVerdicts, []);
});

test("programmatic API returns top-level fail-policy metadata for in-memory batches", () => {
  const result = verifyAnswersResult({
    answers: [
      {
        answer: "Employees receive 16 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Short.",
        answerLabel: "empty draft",
      },
    ],
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["needs_review", "contradicted", "unsupported"],
    generatedAt: "2026-07-05T03:43:00.000Z",
  });

  assert.equal(result.report.generatedAt, "2026-07-05T03:43:00.000Z");
  assert.equal(result.report.summary.answersWithFailures, 2);
  assert.equal(result.report.summary.answersWithoutClaims, 1);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
});

test("programmatic API batches in-memory answers against raw source content", async () => {
  const report = await verifyAnswerBatchContents({
    answers: [
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Refunds are available for 14 days from the purchase date.",
        answerLabel: "support escalation",
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
      {
        sourcePath: "help/refunds.html",
        content: `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "medium",
    failOn: ["contradicted"],
    generatedAt: "2026-07-05T03:45:00.000Z",
  });

  assert.equal(report.generatedAt, "2026-07-05T03:45:00.000Z");
  assert.equal(report.answerCount, 2);
  assert.deepEqual(report.summary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 0,
    answersWithoutClaims: 0,
    answersWithFailures: 1,
  });
  assert.deepEqual(
    report.answers.map((answer) => ({
      label: answer.answerLabel,
      path: answer.answerPath,
      shouldFail: answer.shouldFail,
    })),
    [
      {
        label: "hr",
        path: "answers/hr.md",
        shouldFail: false,
      },
      {
        label: "support escalation",
        path: "<memory:2>",
        shouldFail: true,
      },
    ],
  );
  assert.equal(report.sources[1]?.title, "Refund Policy");
  assert.equal(report.sources[1]?.trustLevel, "medium");
});

test("programmatic API returns top-level fail-policy metadata for batch file verification", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-result-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourcePath = join(tempDir, "policy.md");

    await mkdir(answerDir, { recursive: true });
    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "high",
    });
    const result = await verifyAnswerBatchResult({
      answerPaths: [],
      answerDirPaths: [answerDir],
      sources,
      failOn: ["needs_review", "contradicted"],
      generatedAt: "2026-07-05T03:46:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-05T03:46:00.000Z");
    assert.equal(result.report.summary.answersWithFailures, 2);
    assert.equal(result.report.summary.answersWithoutClaims, 1);
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns top-level fail-policy metadata for batch file inputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-file-input-result-"));

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
        join(answerDir, "hr.md"),
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(join(sourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await verifyAnswerBatchFileInputsResult({
      answerPaths: [],
      answerDirPaths: [answerDir],
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
      failOn: ["needs_review", "contradicted"],
      generatedAt: "2026-07-06T13:05:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-06T13:05:00.000Z");
    assert.equal(result.report.summary.answersWithFailures, 2);
    assert.equal(result.report.summary.answersWithoutClaims, 1);
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns top-level fail-policy metadata for raw-content batches", async () => {
  const result = await verifyAnswerBatchContentsResult({
    answers: [
      {
        answer: "Refunds are available for 14 days from the purchase date.",
        answerLabel: "support escalation",
      },
      {
        answer: "Short.",
        answerPath: "answers/empty.md",
      },
    ],
    sources: [
      {
        sourcePath: "help/refunds.html",
        content: `<!doctype html>
<html>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "high",
    failOn: ["unsupported", "needs_review", "contradicted"],
    generatedAt: "2026-07-05T03:47:00.000Z",
  });

  assert.equal(result.report.generatedAt, "2026-07-05T03:47:00.000Z");
  assert.equal(result.report.summary.answersWithFailures, 2);
  assert.equal(result.report.summary.answersWithoutClaims, 1);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
});

test("programmatic API rejects empty in-memory source batches", async () => {
  await assert.rejects(
    () =>
      loadSourcesFromContent({
        sources: [],
      }),
    {
      message: "At least one in-memory source is required.",
    },
  );
});

test("programmatic API evaluates in-memory fixture arrays for workflow callers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-evaluation-batch-"));

  try {
    const answerPath = join(tempDir, "answers", "hr-answer.md");
    const sourcePath = join(tempDir, "sources", "hr-policy.md");
    const fixturePath = join(tempDir, "fixtures", "hr-policy.json");

    await mkdir(join(tempDir, "answers"), { recursive: true });
    await mkdir(join(tempDir, "sources"), { recursive: true });
    await mkdir(join(tempDir, "fixtures"), { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const scorecards = await evaluateFixtures({
      fixtures: [
        {
          name: "HR policy fixture",
          answerPath: "answers/hr-answer.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        },
      ],
      baseDir: tempDir,
      fixturePaths: [fixturePath],
      generatedAt: "2026-07-05T19:00:00.000Z",
    });

    assert.equal(scorecards.length, 1);
    assert.equal(scorecards[0]?.fixtureName, "HR policy fixture");
    assert.equal(scorecards[0]?.fixturePath, fixturePath);
    assert.equal(scorecards[0]?.answerPath, answerPath);
    assert.deepEqual(scorecards[0]?.sourcePaths, [sourcePath]);
    assert.equal(scorecards[0]?.report.generatedAt, "2026-07-05T19:00:00.000Z");
    assert.equal(scorecards[0]?.summaryMatches, true);
    assert.equal(scorecards[0]?.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API loads and evaluates in-memory fixture JSON files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-evaluation-content-"));

  try {
    const answerPath = join(tempDir, "answers", "hr-answer.md");
    const sourcePath = join(tempDir, "sources", "hr-policy.md");
    const fixturePath = join(tempDir, "fixtures", "hr-policy.json");
    const fixtureContent = JSON.stringify({
      name: "HR policy fixture",
      answerPath: "../answers/hr-answer.md",
      sourcePaths: ["../sources/hr-policy.md"],
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["verified"],
    });

    await mkdir(join(tempDir, "answers"), { recursive: true });
    await mkdir(join(tempDir, "sources"), { recursive: true });
    await mkdir(join(tempDir, "fixtures"), { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const fixture = loadEvaluationFixtureFromContent(Buffer.from(fixtureContent, "utf8"));
    assert.equal(fixture.name, "HR policy fixture");
    assert.deepEqual(fixture.expectedClaimVerdicts, ["verified"]);

    const scorecards = await evaluateFixtureContents({
      fixtures: [
        {
          fixturePath,
          content: fixtureContent,
        },
      ],
      generatedAt: "2026-07-05T20:30:00.000Z",
    });

    assert.equal(scorecards.length, 1);
    assert.equal(scorecards[0]?.fixturePath, fixturePath);
    assert.equal(scorecards[0]?.answerPath, answerPath);
    assert.deepEqual(scorecards[0]?.sourcePaths, [sourcePath]);
    assert.equal(scorecards[0]?.report.generatedAt, "2026-07-05T20:30:00.000Z");
    assert.equal(scorecards[0]?.summaryMatches, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API evaluates one in-memory fixture JSON file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-evaluation-single-content-"));

  try {
    const answerPath = join(tempDir, "answers", "support-answer.md");
    const sourcePath = join(tempDir, "sources", "support-policy.md");
    const fixturePath = join(tempDir, "fixtures", "support-policy.json");
    const fixtureContent = JSON.stringify({
      name: "Support policy fixture",
      answerPath: "../answers/support-answer.md",
      sourcePaths: ["../sources/support-policy.md"],
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["verified"],
    });

    await mkdir(join(tempDir, "answers"), { recursive: true });
    await mkdir(join(tempDir, "sources"), { recursive: true });
    await mkdir(join(tempDir, "fixtures"), { recursive: true });
    await Promise.all([
      writeFile(
        answerPath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        sourcePath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
    ]);

    const scorecard = await evaluateFixtureContent({
      fixturePath,
      content: fixtureContent,
      generatedAt: "2026-07-05T20:45:00.000Z",
    });

    assert.equal(scorecard.fixturePath, fixturePath);
    assert.equal(scorecard.answerPath, answerPath);
    assert.deepEqual(scorecard.sourcePaths, [sourcePath]);
    assert.equal(scorecard.report.generatedAt, "2026-07-05T20:45:00.000Z");
    assert.equal(scorecard.summaryMatches, true);
    assert.equal(scorecard.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API rejects empty in-memory evaluation batches", async () => {
  await assert.rejects(
    evaluateFixtures({
      fixtures: [],
    }),
    /At least one evaluation fixture is required\./,
  );
});

test("programmatic API rejects empty in-memory evaluation fixture JSON batches", async () => {
  await assert.rejects(
    evaluateFixtureContents({
      fixtures: [],
    }),
    /At least one in-memory evaluation fixture is required\./,
  );
});

test("programmatic API rejects empty file-backed evaluation batches", async () => {
  await assert.rejects(
    evaluateFixtureFiles({
      fixturePaths: [],
      fixtureDirPaths: [],
    }),
    /No evaluation fixture files found in /,
  );
});

test("programmatic API returns mismatch metadata for in-memory evaluation batches", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-eval-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "source.md");
    const fixturePath = join(tempDir, "fixture.json");

    await Promise.all([
      writeFile(answerPath, "Refunds are available for 30 days from the purchase date.\n", "utf8"),
      writeFile(sourcePath, "Refunds are available for 14 days from the purchase date.\n", "utf8"),
    ]);

    const result = await evaluateFixturesResult({
      fixtures: [
        {
          name: "Refund mismatch fixture",
          answerPath,
          sourcePaths: [sourcePath],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        },
      ],
      fixturePaths: [fixturePath],
      generatedAt: "2026-07-05T21:00:00.000Z",
    });

    assert.equal(result.shouldFail, true);
    assert.equal(result.mismatchCount, 1);
    assert.equal(result.scorecards.length, 1);
    assert.equal(result.scorecards[0]?.fixturePath, fixturePath);
    assert.equal(result.scorecards[0]?.report.generatedAt, "2026-07-05T21:00:00.000Z");
    assert.equal(result.scorecards[0]?.summaryMatches, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns mismatch metadata for in-memory evaluation fixture JSON helpers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-eval-content-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "source.md");
    const fixturePath = join(tempDir, "fixture.json");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const fixtureContent = JSON.stringify({
      name: "HR match fixture",
      answerPath,
      sourcePaths: [sourcePath],
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["verified"],
    });

    const batchResult = await evaluateFixtureContentsResult({
      fixtures: [
        {
          fixturePath,
          content: fixtureContent,
        },
      ],
      generatedAt: "2026-07-05T21:15:00.000Z",
    });
    const singleResult = await evaluateFixtureContentResult({
      fixturePath,
      content: fixtureContent,
      generatedAt: "2026-07-05T21:15:00.000Z",
    });

    assert.equal(batchResult.shouldFail, false);
    assert.equal(batchResult.mismatchCount, 0);
    assert.equal(batchResult.scorecards[0]?.report.generatedAt, "2026-07-05T21:15:00.000Z");
    assert.equal(singleResult.hasMismatch, false);
    assert.equal(singleResult.scorecard.fixturePath, fixturePath);
    assert.equal(singleResult.scorecard.report.generatedAt, "2026-07-05T21:15:00.000Z");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns mismatch metadata for fixture file evaluation helpers", async () => {
  const batchResult = await evaluateFixtureFilesResult({
    fixturePaths: [],
    fixtureDirPaths: [join(process.cwd(), "examples/evaluations")],
    generatedAt: "2026-07-05T21:30:00.000Z",
  });
  const singleResult = await evaluateFixtureFileResult({
    fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
    generatedAt: "2026-07-05T21:30:00.000Z",
  });
  const contentResult = await evaluateFixtureContentResult({
    fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
    content: await readFile(join(process.cwd(), "examples/evaluations/hr-policy.json")),
    generatedAt: "2026-07-05T21:30:00.000Z",
  });

  assert.equal(batchResult.shouldFail, false);
  assert.equal(batchResult.mismatchCount, 0);
  assert.equal(batchResult.scorecards.length, 2);
  assert.equal(singleResult.hasMismatch, false);
  assert.equal(singleResult.scorecard.fixtureName, "HR policy example");
  assert.equal(contentResult.hasMismatch, false);
  assert.equal(contentResult.scorecard.fixtureName, "HR policy example");
});

test("programmatic API accepts object-style single fixture file evaluation helpers", async () => {
  const fixturePath = join(process.cwd(), "examples/evaluations/support-policy.json");

  const scorecard = await evaluateFixtureFile({
    fixturePath,
    generatedAt: "2026-07-05T21:35:00.000Z",
  });
  const result = await evaluateFixtureFileResult({
    fixturePath,
    generatedAt: "2026-07-05T21:35:00.000Z",
  });

  assert.equal(scorecard.fixturePath, fixturePath);
  assert.equal(scorecard.report.generatedAt, "2026-07-05T21:35:00.000Z");
  assert.equal(result.hasMismatch, false);
  assert.equal(result.scorecard.fixturePath, fixturePath);
  assert.equal(result.scorecard.report.generatedAt, "2026-07-05T21:35:00.000Z");
});

test("programmatic API exports verification report renderers", () => {
  const report = verifyAnswer(
    "Benefits begin on day one of employment.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Benefits begin on day one of employment.",
      },
    ],
    "2026-07-05T02:30:00.000Z",
    "examples/answers/hr-answer.md",
  );
  const batchReport = {
    generatedAt: "2026-07-05T02:30:00.000Z",
    answerCount: 1,
    sourceCount: 1,
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high" as const,
      },
    ],
    answers: [
      {
        answerLabel: "hr-answer",
        answerPath: "examples/answers/hr-answer.md",
        report,
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithFailures: 0,
      answersWithoutClaims: 0,
    },
  };

  assert.match(renderTextReport(report), /Quorum Verification Report/);
  assert.match(renderMarkdownReport(report), /# Quorum Verification Report/);
  assert.match(renderHtmlReport(report), /<!doctype html>/i);
  assert.match(renderReviewerDecisionCsv(report), /answer_label,answer_path/);
  assert.match(renderSummaryCsv(report), /primary_verdict/);
  assert.match(renderBatchMarkdownReport(batchReport), /# Quorum Batch Verification Report/);
  assert.match(renderBatchHtmlReport(batchReport), /<!doctype html>/i);
  assert.match(renderBatchReviewerDecisionCsv(batchReport), /answer_label,answer_path/);
  assert.match(renderBatchSummaryCsv(batchReport), /primary_verdict/);
  assert.equal(renderAnswerLabel("examples/answers/hr-answer.md"), "hr-answer");
  assert.deepEqual(
    renderAnswerLabels([
      "/tmp/quorum/hr/answer.md",
      "/tmp/quorum/support/answer.md",
    ]),
    ["hr/answer", "support/answer"],
  );
  assert.equal(
    renderAnswerPreview("<main><p>Refunds are available within 30 days of purchase.</p></main>"),
    "Refunds are available within 30 days of purchase.",
  );
});

test("programmatic API imports reviewer decision csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
      "utf8",
    );

    const report = await importReviewerDecisionFile(reviewCsvPath);

    assert.equal(report.summary.totalClaims, 1);
    assert.equal(report.summary.reviewedClaims, 1);
    assert.equal(report.answerGroups[0]?.label, "HR answer");
    assert.equal(report.answerGroups[0]?.answerPath, "answers/hr.md");
    assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API imports reviewer decision csv files through options objects", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-options-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
      "utf8",
    );

    const report = await importReviewerDecisionFile({ reviewCsvPath });

    assert.equal(report.summary.totalClaims, 1);
    assert.equal(report.summary.reviewedClaims, 1);
    assert.equal(report.answerGroups[0]?.label, "HR answer");
    assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API imports reviewer decision csv content through workflow helpers", () => {
  const report = importReviewerDecisionContents(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
  );

  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.summary.reviewedClaims, 1);
  assert.equal(report.answerGroups[0]?.label, "HR answer");
  assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
});

test("programmatic API imports reviewer decision csv content through options objects", () => {
  const report = importReviewerDecisionContents({
    reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
  });

  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.summary.reviewedClaims, 1);
  assert.equal(report.answerGroups[0]?.label, "HR answer");
  assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
});

test("programmatic API applies fail policy to imported reviewer decision csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-result-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
      "utf8",
    );

    const result = await importReviewerDecisionFileResult(reviewCsvPath, ["unsupported"]);

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["unsupported"]);
    assert.equal(result.report.summary.reviewedClaims, 1);
    assert.equal(result.report.summary.unsupported, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API applies fail policy to imported reviewer decision csv files through options objects", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-result-options-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
      "utf8",
    );

    const result = await importReviewerDecisionFileResult({
      reviewCsvPath,
      failOn: ["unsupported"],
    });

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["unsupported"]);
    assert.equal(result.report.summary.reviewedClaims, 1);
    assert.equal(result.report.summary.unsupported, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API applies fail policy to reviewer decision csv content workflow helpers", () => {
  const result = importReviewerDecisionContentsResult(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
    ["unsupported"],
  );

  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
  assert.equal(result.report.summary.reviewedClaims, 1);
  assert.equal(result.report.summary.unsupported, 1);
});

test("programmatic API applies fail policy to reviewer decision csv content through options objects", () => {
  const result = importReviewerDecisionContentsResult({
    reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
    failOn: ["unsupported"],
  });

  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
  assert.equal(result.report.summary.reviewedClaims, 1);
  assert.equal(result.report.summary.unsupported, 1);
});

test("programmatic API exports reviewer import helpers for in-memory callers", () => {
  const report = importReviewerDecisions(`claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
`);

  const markdown = renderReviewerDecisionImportMarkdownReport(report, ["needs_review"]);

  assert.equal(report.summary.pendingClaims, 1);
  assert.match(markdown, /# Quorum Reviewer Decision Import/);
  assert.match(markdown, /- Pending claims: 1/);
});

test("programmatic API exports reviewer import fail-policy helpers for in-memory callers", () => {
  const result = importReviewerDecisionsResult(
    `claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive free catered lunch every day.,unsupported,No approved source matched strongly enough,,,unsupported,Needs People Ops review
`,
    ["unsupported"],
  );

  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
  assert.equal(result.report.summary.totalClaims, 1);
  assert.equal(result.report.summary.unsupported, 1);
});

test("programmatic API exports fail-policy helpers for workflow callers", () => {
  assert.deepEqual(CLAIM_VERDICTS, [
    "verified",
    "unsupported",
    "contradicted",
    "needs_review",
  ]);
  assert.equal(parseClaimVerdict("contradicted"), "contradicted");
  assert.throws(() => parseClaimVerdict("bad"), /Unsupported verdict "bad"/);

  const report = verifyAnswer(
    "Short.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    "2026-07-06T00:15:00.000Z",
  );

  assert.deepEqual(matchingFailVerdicts(report, ["needs_review", "unsupported"]), [
    "needs_review",
  ]);
  assert.deepEqual(
    matchingFailVerdicts(report, ["needs_review", "needs_review", "unsupported"]),
    ["needs_review"],
  );
  assert.equal(shouldFailReport(report, ["unsupported"]), false);
  assert.equal(shouldFailReport(report, ["needs_review"]), true);
});

test("programmatic API de-duplicates repeated fail verdicts in workflow results", async () => {
  const singleResult = verifyAnswerResult({
    answer: "Employees receive 16 weeks of paid parental leave.",
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["contradicted", "contradicted"],
    generatedAt: "2026-07-06T00:16:00.000Z",
  });

  assert.deepEqual(singleResult.failVerdicts, ["contradicted"]);

  const batchResult = verifyAnswersResult({
    answers: [
      {
        answer: "Short.",
        answerPath: "answers/empty.md",
      },
      {
        answer: "Employees receive 16 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
    ],
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["needs_review", "needs_review", "contradicted", "contradicted"],
    generatedAt: "2026-07-06T00:17:00.000Z",
  });

  assert.deepEqual(batchResult.failVerdicts, ["needs_review", "contradicted"]);

  const importResult = importReviewerDecisionContentsResult(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
    ["unsupported", "unsupported"],
  );

  assert.deepEqual(importResult.failVerdicts, ["unsupported"]);
});

test("programmatic API serves single-answer verification over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const indexResponse = await fetch(api.url);
    assert.equal(indexResponse.status, 200);
    assert.deepEqual(await indexResponse.json(), {
      service: "quorum",
      endpoints: [
        { method: "GET", path: "/health", description: "Return a simple readiness response." },
        {
          method: "GET",
          path: "/openapi.json",
          description: "Return the OpenAPI description for this server.",
        },
        { method: "POST", path: "/verify", description: "Verify one answer from JSON request content." },
        {
          method: "POST",
          path: "/verify-batch",
          description: "Verify multiple answers from JSON request content.",
        },
        {
          method: "POST",
          path: "/import-review",
          description: "Import reviewer CSV content from JSON request content.",
        },
        {
          method: "POST",
          path: "/evaluate",
          description: "Evaluate fixture JSON content from request payloads.",
        },
      ],
    });

    const healthResponse = await fetch(`${api.url}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    const openApiResponse = await fetch(`${api.url}/openapi.json`);
    assert.equal(openApiResponse.status, 200);
    const openApi = await openApiResponse.json() as {
      openapi: string;
      info: { title: string; version: string };
      servers: Array<{ url: string }>;
      paths: Record<string, { get?: { summary: string }; post?: { summary: string } }>;
      components: {
        schemas: {
          ClaimVerdict: { enum: string[] };
          SourceTrustLevel: { enum: string[] };
        };
      };
    };

    assert.equal(openApi.openapi, "3.1.0");
    assert.equal(openApi.info.title, "Quorum Local API");
    assert.equal(openApi.info.version, "0.1.0");
    assert.deepEqual(openApi.servers, [{ url: api.url }]);
    assert.equal(openApi.paths["/health"]?.get?.summary, "Readiness check");
    assert.equal(openApi.paths["/verify"]?.post?.summary, "Verify one answer");
    assert.equal(openApi.paths["/verify-batch"]?.post?.summary, "Verify multiple answers");
    assert.equal(openApi.paths["/import-review"]?.post?.summary, "Import reviewer decisions");
    assert.equal(openApi.paths["/evaluate"]?.post?.summary, "Evaluate fixtures");
    assert.deepEqual(openApi.components.schemas.SourceTrustLevel.enum, ["low", "medium", "high"]);
    assert.deepEqual(openApi.components.schemas.ClaimVerdict.enum, [
      "verified",
      "unsupported",
      "contradicted",
      "needs_review",
    ]);

    const verifyResponse = await fetch(`${api.url}/verify`, {
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
        defaultTrustLevel: "high",
        failOn: ["contradicted"],
      }),
    });

    assert.equal(verifyResponse.status, 200);
    const result = await verifyResponse.json() as {
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        answerLabel?: string;
        summary: Record<string, number>;
      };
    };

    assert.equal(result.shouldFail, false);
    assert.deepEqual(result.failVerdicts, []);
    assert.equal(result.report.answerLabel, "HR reviewer packet");
    assert.deepEqual(result.report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await api.close();
  }
});

test("programmatic API serves batch verification over HTTP", async () => {
  const server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("Expected the API server to bind to a TCP port.");
    }

    const apiUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${apiUrl}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            answer: "Employees receive 12 weeks of paid parental leave.",
            answerPath: "answers/hr.md",
            answerLabel: "HR queue",
          },
          {
            answer: "Employees receive free catered lunch every day.",
            answerPath: "answers/support.md",
          },
        ],
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
        failOn: ["unsupported"],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        summary: Record<string, number>;
        answers: Array<{
          answerLabel: string;
        }>;
      };
    };

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["unsupported"]);
    assert.equal(result.report.answers[0]?.answerLabel, "HR queue");
    assert.deepEqual(result.report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("programmatic API serves reviewer CSV import over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/import-review`, {
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

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        summary: Record<string, number>;
        answerGroups: Array<{
          label: string;
        }>;
      };
    };

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review"]);
    assert.deepEqual(result.report.summary, {
      totalClaims: 1,
      reviewedClaims: 1,
      pendingClaims: 0,
      overriddenClaims: 1,
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 1,
    });
    assert.equal(result.report.answerGroups[0]?.label, "HR reviewer packet");
  } finally {
    await api.close();
  }
});

test("programmatic API serves evaluation over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const fixtureContent = await readFile(join(process.cwd(), "examples/evaluations/hr-policy.json"), "utf8");
    const response = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
            content: fixtureContent,
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      mismatchCount: number;
      scorecards: Array<{
        fixtureName: string;
        summaryMatches: boolean;
        matchedClaims: number;
        totalExpectedClaims: number;
      }>;
    };

    assert.equal(result.shouldFail, false);
    assert.equal(result.mismatchCount, 0);
    assert.equal(result.scorecards[0]?.fixtureName, "HR policy example");
    assert.equal(result.scorecards[0]?.summaryMatches, true);
    assert.equal(result.scorecards[0]?.matchedClaims, 3);
    assert.equal(result.scorecards[0]?.totalExpectedClaims, 3);
  } finally {
    await api.close();
  }
});

test("programmatic API exports batch evaluation helpers", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixturePaths: [],
    fixtureDirPaths: [join(process.cwd(), "examples/evaluations")],
    generatedAt: "2026-07-05T03:00:00.000Z",
  });

  const rendered = renderEvaluationTextReport(scorecards);

  assert.equal(scorecards.length, 2);
  assert.equal(scorecards.some(hasEvaluationMismatch), false);
  assert.match(rendered, /Fixtures: 2/);
  assert.match(renderEvaluationHtmlReport(scorecards), /<!doctype html>/i);
  assert.match(renderEvaluationSummaryCsv(scorecards), /fixture_name,fixture_path,answer_path/);
});
