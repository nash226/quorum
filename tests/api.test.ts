import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluateFixtureFiles,
  hasEvaluationMismatch,
  importReviewerDecisionFile,
  importReviewerDecisions,
  loadSources,
  renderBatchHtmlReport,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderEvaluationSummaryCsv,
  renderEvaluationTextReport,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
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
  assert.match(renderEvaluationSummaryCsv(scorecards), /fixture_name,fixture_path,answer_path/);
});
