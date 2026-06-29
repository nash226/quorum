import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnswer } from "../src/claim-verifier.js";
import type { BatchVerificationReport, SourceDocument } from "../src/domain.js";
import {
  renderBatchHtmlReport,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderTextReport,
} from "../src/report-renderer.js";

const hrPolicy: SourceDocument = {
  id: "hr_policy",
  title: "HR Policy",
  trustLevel: "high",
  updatedAt: "2026-05-31",
  content: `
Employees receive 12 weeks of paid parental leave.
Full-time employees receive 20 days of paid vacation each calendar year.
Healthcare coverage begins after 30 days of employment.
`,
};

test("renders the text report used by the CLI", () => {
  const report = verifyAnswer(
    "Full-time employees receive 20 days of paid vacation each calendar year.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  const rendered = renderTextReport(report);

  assert.match(rendered, /Quorum Verification Report/);
  assert.match(rendered, /Sources: HR Policy/);
  assert.match(rendered, /VERIFIED  Full-time employees receive 20 days/);
  assert.match(rendered, /Evidence \(HR Policy, high trust, score /);
});

test("renders a markdown reviewer report with summary, sources, and evidence", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  const rendered = renderMarkdownReport(report);

  assert.match(rendered, /# Quorum Verification Report/);
  assert.match(rendered, /Generated: 2026-06-28T00:00:00.000Z/);
  assert.match(rendered, /- Verified: 0/);
  assert.match(rendered, /- Contradicted: 1/);
  assert.match(rendered, /- Unsupported: 1/);
  assert.match(rendered, /## Sources/);
  assert.match(rendered, /\*\*HR Policy\*\* \(trust: high, updated: 2026-05-31\)/);
  assert.match(rendered, /### 1\. Employees receive 18 weeks of paid parental leave\./);
  assert.match(rendered, /- Verdict: `contradicted`/);
  assert.match(rendered, /> Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /- Evidence: No approved source snippet matched strongly enough\./);
});

test("renders a reviewer decision csv with claim context and blank reviewer fields", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  const rendered = renderReviewerDecisionCsv(report);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[0],
    "claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
  );
  assert.match(
    lines[1] ?? "",
    /^claim_1,Employees receive 18 weeks of paid parental leave\.,contradicted,/,
  );
  assert.match(lines[1] ?? "", /HR Policy/);
  assert.match(
    lines[2] ?? "",
    /^claim_2,Employees receive free catered lunch every day\.,unsupported,/,
  );
  assert.match(lines[2] ?? "", /,,$/);
});

test("renders a professional HTML reviewer report with escaped content", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\n<Flag this answer for legal review.>",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  const rendered = renderHtmlReport(report);

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<title>Quorum Review Console<\/title>/);
  assert.match(rendered, /Claim review queue/);
  assert.match(rendered, /Evidence detail/);
  assert.match(rendered, /Reviewer decision/);
  assert.match(rendered, /<span class="pill pill--contradicted">contradicted<\/span>/);
  assert.match(rendered, /HR Policy<\/strong>/);
  assert.match(rendered, /high trust/);
  assert.match(rendered, /Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /&lt;Flag this answer for legal review\.&gt;/);
  assert.doesNotMatch(rendered, /<Flag this answer for legal review\.>/);
});

test("renders explicit empty states when no claims are extracted from a single answer", () => {
  const report = verifyAnswer("Short.\n", [hrPolicy], "2026-06-28T00:00:00.000Z");

  const text = renderTextReport(report);
  const markdown = renderMarkdownReport(report);
  const html = renderHtmlReport(report);

  assert.match(text, /No claims were extracted from this answer\./);
  assert.match(markdown, /## Claim Assessments\n\nNo claims were extracted from this answer\./);
  assert.match(html, /No claims were extracted from this answer\./);
  assert.match(html, /<tr class="empty-row">/);
});

test("renders a markdown batch report with per-answer summaries", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerPath: "examples/answers/hr-answer.md",
        report: verifyAnswer("Employees receive 12 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: false,
      },
      {
        answerPath: "examples/answers/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchMarkdownReport(batchReport);

  assert.match(rendered, /# Quorum Batch Verification Report/);
  assert.match(rendered, /- Answers reviewed: 2/);
  assert.match(rendered, /- Answers matching fail policy: 1/);
  assert.match(rendered, /### 1\. examples\/answers\/hr-answer\.md/);
  assert.match(rendered, /- Fail policy: clear/);
  assert.match(rendered, /### 2\. examples\/answers\/support-answer\.md/);
  assert.match(rendered, /- Fail policy: matched/);
});

test("renders an HTML batch report with escaped answer paths and fail status", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sourceCount: 2,
    answerCount: 1,
    answers: [
      {
        answerPath: "<queued>/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchHtmlReport(batchReport);

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<title>Quorum Batch Verification Report<\/title>/);
  assert.match(rendered, /Batch verification report for review queues/);
  assert.match(rendered, /Fail policy matched/);
  assert.match(rendered, /&lt;queued&gt;\/support-answer\.md/);
  assert.doesNotMatch(rendered, /<queued>\/support-answer\.md/);
});

test("renders explicit empty states for batch answers with no extracted claims", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerPath: "examples/answers/empty.md",
        report: verifyAnswer("Short.\n", [hrPolicy]),
        shouldFail: false,
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithFailures: 0,
    },
  };

  const markdown = renderBatchMarkdownReport(batchReport);
  const html = renderBatchHtmlReport(batchReport);

  assert.match(markdown, /No claims were extracted from this answer\./);
  assert.match(html, /No claims were extracted from this answer\./);
});

test("renders a batch reviewer decision csv with answer path context", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerPath: "examples/answers/hr-answer.md",
        report: verifyAnswer("Employees receive 18 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: true,
      },
      {
        answerPath: "examples/answers/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
      },
    ],
    summary: {
      verified: 0,
      contradicted: 1,
      unsupported: 1,
      needs_review: 0,
      answersWithFailures: 2,
    },
  };

  const rendered = renderBatchReviewerDecisionCsv(batchReport);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[0],
    "answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
  );
  assert.match(
    lines[1] ?? "",
    /^examples\/answers\/hr-answer\.md,claim_1,Employees receive 18 weeks of paid parental leave\.,contradicted,/,
  );
  assert.match(lines[1] ?? "", /HR Policy/);
  assert.match(
    lines[2] ?? "",
    /^examples\/answers\/support-answer\.md,claim_1,Employees receive free catered lunch every day\.,unsupported,/,
  );
  assert.match(lines[2] ?? "", /,,$/);
});
