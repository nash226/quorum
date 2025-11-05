import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateFixtureContent,
  evaluateFixtureContents,
  evaluateFixtureFiles,
  evaluateFixtures,
  hasEvaluationMismatch,
  importReviewerDecisionFile,
  importReviewerDecisions,
  loadEvaluationFixtureFromContent,
  loadSources,
  loadSourcesFromContent,
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
  verifyAnswers,
  verifyAnswerContents,
  verifyAnswer,
  verifyAnswerBatch,
  verifyAnswerFile,
} from "../src/index.js";

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

test("programmatic API exports reviewer import helpers for in-memory callers", () => {
  const report = importReviewerDecisions(`claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
`);

  const markdown = renderReviewerDecisionImportMarkdownReport(report, ["needs_review"]);

  assert.equal(report.summary.pendingClaims, 1);
  assert.match(markdown, /# Quorum Reviewer Decision Import/);
  assert.match(markdown, /- Pending claims: 1/);
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
