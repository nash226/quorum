import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnswer } from "../src/claim-verifier.js";
import type { BatchVerificationReport, SourceDocument } from "../src/domain.js";
import {
  renderBatchHtmlReport,
  renderBatchAggregateSummaryCsv,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
} from "../src/report-renderer.js";
import { importReviewerDecisions } from "../src/reviewer-decision-import.js";

const hrPolicy: SourceDocument = {
  id: "hr_policy",
  sourcePath: "examples/sources/hr-policy.md",
  title: "HR Policy",
  trustLevel: "high",
  updatedAt: "2026-05-31",
  content: `
Employees receive 12 weeks of paid parental leave.
Full-time employees receive 20 days of paid vacation each calendar year.
Healthcare coverage begins after 30 days of employment.
`,
};

const batchSources = [
  {
    id: hrPolicy.id,
    sourcePath: hrPolicy.sourcePath,
    title: hrPolicy.title,
    trustLevel: hrPolicy.trustLevel,
    updatedAt: hrPolicy.updatedAt,
  },
];

test("renders the text report used by the CLI", () => {
  const report = verifyAnswer(
    "Full-time employees receive 20 days of paid vacation each calendar year.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  const rendered = renderTextReport(report);

  assert.match(rendered, /Quorum Verification Report/);
  assert.match(rendered, /Generated: 2026-06-28T00:00:00\.000Z/);
  assert.match(rendered, /Answer: examples\/answers\/hr-answer\.md/);
  assert.match(rendered, /Answer label: hr-answer/);
  assert.match(rendered, /Sources:\n- HR Policy \(high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md\)/);
  assert.match(rendered, /VERIFIED  Full-time employees receive 20 days/);
  assert.match(rendered, /Evidence \(HR Policy, high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
});

test("renders a markdown reviewer report with summary, sources, and evidence", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  const rendered = renderMarkdownReport(report);

  assert.match(rendered, /# Quorum Verification Report/);
  assert.match(rendered, /Generated: 2026-06-28T00:00:00.000Z/);
  assert.match(rendered, /- Verified: 0/);
  assert.match(rendered, /- Answer path: `examples\/answers\/hr-answer\.md`/);
  assert.match(rendered, /- Answer label: hr-answer/);
  assert.match(rendered, /- Contradicted: 1/);
  assert.match(rendered, /- Unsupported: 1/);
  assert.match(rendered, /## Sources/);
  assert.match(rendered, /\*\*HR Policy\*\* \(trust: high, updated: 2026-05-31, path: examples\/sources\/hr-policy\.md\)/);
  assert.match(rendered, /## Submitted Answer/);
  assert.match(
    rendered,
    /> Employees receive 18 weeks of paid parental leave\.\n> Employees receive free catered lunch every day\./,
  );
  assert.match(rendered, /## Primary Finding/);
  assert.match(rendered, /- Verdict: `contradicted`/);
  assert.match(
    rendered,
    /- Reason: A closely matching approved source uses different numeric terms\./,
  );
  assert.match(rendered, /- Claim: Employees receive 18 weeks of paid parental leave\./);
  assert.match(rendered, /- Evidence: \*\*HR Policy\*\* \(high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
  assert.match(rendered, /### 1\. Employees receive 18 weeks of paid parental leave\./);
  assert.match(rendered, /- Verdict: `contradicted`/);
  assert.match(rendered, /\*\*HR Policy\*\* \(high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
  assert.match(rendered, /> Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /- Evidence: No approved source snippet matched strongly enough\./);
});

test("renders single-answer fail policy context in text, markdown, and html reports", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  const text = renderTextReport(report, ["contradicted", "unsupported"]);
  const markdown = renderMarkdownReport(report, ["contradicted", "unsupported"]);
  const html = renderHtmlReport(report, ["contradicted", "unsupported"]);

  assert.match(text, /Fail policy: matched/);
  assert.match(text, /Generated: 2026-06-28T00:00:00\.000Z/);
  assert.match(text, /Fail verdicts: contradicted, unsupported/);
  assert.match(markdown, /- Fail policy: matched \(contradicted, unsupported\)/);
  assert.match(html, /<span>Fail policy<\/span>\s*<strong>matched \(contradicted, unsupported\)<\/strong>/);
});

test("preserves explicit reviewer labels across single-answer human reports", () => {
  const report = verifyAnswer(
    "Employees receive 12 weeks of paid parental leave.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "answers/hr-answer.md",
  );
  report.answerLabel = "HR reviewer packet";

  assert.match(renderTextReport(report), /Answer label: HR reviewer packet/);
  assert.match(renderMarkdownReport(report), /- Answer label: HR reviewer packet/);
  assert.match(renderHtmlReport(report), /<span>Answer label<\/span>\s*<strong>HR reviewer packet<\/strong>/);
});

test("renders a reviewer decision csv with answer fail-policy context and blank reviewer fields", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  const rendered = renderReviewerDecisionCsv(report, ["contradicted", "unsupported"]);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[0],
    "generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
  );
  assert.match(
    lines[1] ?? "",
    /^2026-06-28T00:00:00.000Z,hr-answer,examples\/answers\/hr-answer\.md,Employees receive 18 weeks of paid parental leave\. Employees receive free catered lunch every day\.,matched,contradicted \| unsupported,true,claim_1,Employees receive 18 weeks of paid parental leave\.,contradicted,/,
  );
  assert.match(lines[1] ?? "", /HR Policy/);
  assert.match(lines[1] ?? "", /high/);
  assert.match(lines[1] ?? "", /2026-05-31/);
  assert.match(lines[1] ?? "", /0\.\d{3}/);
  assert.match(
    lines[2] ?? "",
    /^2026-06-28T00:00:00.000Z,hr-answer,examples\/answers\/hr-answer\.md,Employees receive 18 weeks of paid parental leave\. Employees receive free catered lunch every day\.,matched,contradicted \| unsupported,true,claim_2,Employees receive free catered lunch every day\.,unsupported,/,
  );
  assert.match(lines[2] ?? "", /,,$/);
});

test("renders a reviewer decision csv row for single answers with no extracted claims", () => {
  const report = verifyAnswer("Short.\n", [hrPolicy], "2026-06-28T00:00:00.000Z", "examples/answers/empty.md");

  const rendered = renderReviewerDecisionCsv(report);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[1],
    "2026-06-28T00:00:00.000Z,empty,examples/answers/empty.md,Short.,clear,,false,,,,No claims were extracted from this answer.,,,,,,,,",
  );
});

test("renders a single-answer summary csv with fail-policy and source context", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  const rendered = renderSummaryCsv(report, ["contradicted", "unsupported"]);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[0],
    "generated_at,answer_label,answer_path,answer_preview,answer_has_claims,primary_verdict,primary_claim,primary_reason,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids",
  );
  assert.equal(
    lines[1],
    "2026-06-28T00:00:00.000Z,hr-answer,examples/answers/hr-answer.md,Employees receive 18 weeks of paid parental leave. Employees receive free catered lunch every day.,true,contradicted,Employees receive 18 weeks of paid parental leave.,A closely matching approved source uses different numeric terms.,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy,0.857,Employees receive 12 weeks of paid parental leave.,2,0,1,1,0,matched,contradicted | unsupported,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy",
  );
});

test("renders a no-claim single-answer summary csv row with an explicit review signal", () => {
  const report = verifyAnswer("Short.\n", [hrPolicy], "2026-06-28T00:00:00.000Z", "examples/answers/empty.md");

  const rendered = renderSummaryCsv(report);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[1],
    "2026-06-28T00:00:00.000Z,empty,examples/answers/empty.md,Short.,false,needs_review,,No claims were extracted from this answer.,,,,,,,,0,0,0,0,0,clear,,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy",
  );
});

test("reviewer decision csv round-trips literal pipes in evidence fields", () => {
  const pipePolicy: SourceDocument = {
    id: "support_policy",
    sourcePath: "examples/sources/support-policy.md",
    title: "Support | Policy",
    trustLevel: "high",
    updatedAt: "2026-06-01",
    content: "Refunds are available within 30 days | standard purchases.",
  };
  const report = verifyAnswer(
    "Refunds are available within 30 days standard purchases.",
    [pipePolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/support-answer.md",
  );

  const rendered = renderReviewerDecisionCsv(report);
  const imported = importReviewerDecisions(rendered);

  assert.match(rendered, /Support \\| Policy/);
  assert.match(rendered, /30 days \\| standard purchases/);
  assert.equal(imported.claims[0]?.answerLabel, "support-answer");
  assert.deepEqual(imported.claims[0]?.evidenceTitles, ["Support | Policy"]);
  assert.deepEqual(imported.claims[0]?.evidenceSourcePaths, ["examples/sources/support-policy.md"]);
  assert.deepEqual(imported.claims[0]?.evidenceQuotes, [
    "Refunds are available within 30 days | standard purchases.",
  ]);
});

test("renders a professional HTML reviewer report with escaped content", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\n<Flag this answer for legal review.>",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  const rendered = renderHtmlReport(report, ["contradicted"]);

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<title>Quorum Review Console<\/title>/);
  assert.match(rendered, /Claim review queue/);
  assert.match(rendered, /Evidence detail/);
  assert.match(rendered, /Reviewer decision/);
  assert.match(rendered, /Answer path/);
  assert.match(rendered, /Answer label/);
  assert.match(rendered, /<span>Answer label<\/span>\s*<strong>hr-answer<\/strong>/);
  assert.match(rendered, /examples\/answers\/hr-answer\.md/);
  assert.match(rendered, /<span class="pill pill--contradicted">contradicted<\/span>/);
  assert.match(rendered, /HR Policy<\/strong>/);
  assert.match(rendered, /high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
  assert.match(rendered, /<span>Updated<\/span><strong>2026-05-31<\/strong>/);
  assert.match(rendered, /<span>Contradicted claims<\/span><strong>1<\/strong>/);
  assert.match(rendered, /<span>Unsupported claims<\/span><strong>1<\/strong>/);
  assert.match(rendered, /<span>Needs review<\/span><strong>0<\/strong>/);
  assert.match(rendered, /<span>Fail policy<\/span>\s*<strong>matched \(contradicted\)<\/strong>/);
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
  assert.match(markdown, /## Primary Finding\n\n- Verdict: `needs_review`\n- Reason: No claims were extracted from this answer\./);
  assert.match(markdown, /## Claim Assessments\n\nNo claims were extracted from this answer\./);
  assert.match(html, /No claims were extracted from this answer\./);
  assert.match(html, /<tr class="empty-row">/);
});

test("renders a markdown batch report with per-answer summaries", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerLabel: "hr-answer",
        answerPath: "examples/answers/hr-answer.md",
        report: verifyAnswer("Employees receive 12 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
      {
        answerLabel: "support-answer",
        answerPath: "examples/answers/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchMarkdownReport(batchReport, ["unsupported"]);

  assert.match(rendered, /# Quorum Batch Verification Report/);
  assert.match(rendered, /- Answers reviewed: 2/);
  assert.match(rendered, /- Answers with no extracted claims: 0/);
  assert.match(rendered, /- Fail policy: unsupported/);
  assert.match(rendered, /- Answers matching fail policy: 1/);
  assert.match(rendered, /## Sources/);
  assert.match(rendered, /\*\*HR Policy\*\* \(trust: high, updated: 2026-05-31, path: examples\/sources\/hr-policy\.md\)/);
  assert.match(rendered, /### 1\. support-answer/);
  assert.match(rendered, /- Fail policy: matched/);
  assert.match(rendered, /- Fail verdicts: unsupported/);
  assert.match(rendered, /> Employees receive free catered lunch every day\./);
  assert.match(rendered, /No approved source snippet matched strongly enough\./);
  assert.match(rendered, /### 2\. hr-answer/);
  assert.match(rendered, /- Answer path: `examples\/answers\/hr-answer\.md`/);
  assert.match(rendered, /- Fail policy: clear/);
  assert.match(rendered, /- Fail verdicts: none/);
  assert.match(rendered, /- Answer preview: Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /- Primary finding: verified/);
  assert.match(rendered, /- Primary claim: Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /- Primary evidence: \*\*HR Policy\*\* \(high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
  assert.match(rendered, /\*\*HR Policy\*\* \(high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
  assert.match(rendered, /#### Submitted Answer/);
  assert.match(rendered, /> Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /#### Claim Assessments/);
  assert.match(rendered, /##### 1\. Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /- Verdict: `verified`/);
});

test("prioritizes fail-policy matches first in batch html reports", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerLabel: "clear-answer",
        answerPath: "examples/answers/clear-answer.md",
        report: verifyAnswer("Employees receive 12 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
      {
        answerLabel: "risky-answer",
        answerPath: "examples/answers/risky-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchHtmlReport(batchReport, ["unsupported"]);

  assert.match(
    rendered,
    /<h2>risky-answer<\/h2>[\s\S]*<h2>clear-answer<\/h2>/,
  );
});

test("renders an HTML batch report with escaped answer paths and fail status", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "support-answer",
        answerPath: "<queued>/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchHtmlReport(batchReport, ["unsupported"]);

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<title>Quorum Batch Verification Report<\/title>/);
  assert.match(rendered, /Batch verification report for review queues/);
  assert.match(rendered, /HR Policy<\/strong><span>high trust - updated 2026-05-31 - path examples\/sources\/hr-policy\.md<\/span>/);
  assert.match(rendered, /No extracted claims<\/span>\s*<strong>0 answers<\/strong>/);
  assert.match(rendered, /Fail policy matched/);
  assert.match(rendered, /<span>Fail policy<\/span>\s*<strong>unsupported<\/strong>/);
  assert.match(rendered, /<dt>Primary finding<\/dt><dd>unsupported<\/dd>/);
  assert.match(rendered, /<span class="answer-card__section-label">Primary finding<\/span>/);
  assert.match(rendered, /<span class="answer-card__section-label">Answer preview<\/span>/);
  assert.match(rendered, /<dt>Fail verdicts<\/dt><dd>unsupported<\/dd>/);
  assert.match(rendered, /Submitted answer/);
  assert.match(rendered, /Employees receive free catered lunch every day\./);
  assert.match(rendered, /<h2>support-answer<\/h2>/);
  assert.match(rendered, /&lt;queued&gt;\/support-answer\.md/);
  assert.doesNotMatch(rendered, /<queued>\/support-answer\.md/);
  assert.match(rendered, /No approved source snippet matched strongly enough\./);
  assert.match(rendered, /claim-pill claim-pill--unsupported/);
});

test("batch reviewer decision csv round-trips literal pipes in evidence fields", () => {
  const pipePolicy: SourceDocument = {
    id: "support_policy",
    title: "Support | Policy",
    trustLevel: "medium",
    updatedAt: "2026-06-01",
    content: "Refunds are available within 30 days | standard purchases.",
  };
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: [
      {
        id: pipePolicy.id,
        title: pipePolicy.title,
        trustLevel: pipePolicy.trustLevel,
        updatedAt: pipePolicy.updatedAt,
      },
    ],
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "support-answer",
        answerPath: "examples/answers/support-answer.md",
        report: verifyAnswer(
          "Refunds are available within 30 days standard purchases.",
          [pipePolicy],
          "2026-06-29T00:00:00.000Z",
          "examples/answers/support-answer.md",
        ),
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 0,
    },
  };

  const rendered = renderBatchReviewerDecisionCsv(batchReport);
  const imported = importReviewerDecisions(rendered);

  assert.match(rendered, /Support \\| Policy/);
  assert.deepEqual(imported.claims[0]?.evidenceTitles, ["Support | Policy"]);
  assert.deepEqual(imported.claims[0]?.evidenceQuotes, [
    "Refunds are available within 30 days | standard purchases.",
  ]);
});

test("renders evidence freshness metadata in batch html claims", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "hr-answer",
        answerPath: "examples/answers/hr-answer.md",
        report: verifyAnswer("Employees receive 18 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["contradicted"],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 1,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchHtmlReport(batchReport);

  assert.match(rendered, /HR Policy<\/strong> · high trust, updated 2026-05-31, path examples\/sources\/hr-policy\.md, score /);
  assert.match(rendered, /Employees receive 12 weeks of paid parental leave\./);
});

test("renders explicit empty states for batch answers with no extracted claims", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "empty",
        answerPath: "examples/answers/empty.md",
        report: verifyAnswer("Short.\n", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 1,
      answersWithFailures: 0,
    },
  };

  const markdown = renderBatchMarkdownReport(batchReport);
  const html = renderBatchHtmlReport(batchReport);

  assert.match(markdown, /No claims were extracted from this answer\./);
  assert.match(markdown, /- Answers with no extracted claims: 1/);
  assert.match(markdown, /- Primary finding: needs review/);
  assert.match(markdown, /- Primary reason: No claims were extracted from this answer\./);
  assert.match(html, /No claims were extracted from this answer\./);
  assert.match(html, /No extracted claims<\/span>\s*<strong>1 answers<\/strong>/);
  assert.match(html, /<dt>Primary finding<\/dt><dd>needs review<\/dd>/);
  assert.match(html, /Review required/);
});

test("renders a batch reviewer decision csv with answer path context", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerLabel: "hr-answer",
        answerPath: "examples/answers/hr-answer.md",
        report: verifyAnswer("Employees receive 18 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["contradicted"],
      },
      {
        answerLabel: "support-answer",
        answerPath: "examples/answers/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 1,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 2,
    },
  };

  const rendered = renderBatchReviewerDecisionCsv(batchReport);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[0],
    "generated_at,answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_source_ids,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
  );
  assert.match(
    lines[1] ?? "",
    /^2026-06-29T00:00:00.000Z,hr-answer,examples\/answers\/hr-answer\.md,Employees receive 18 weeks of paid parental leave\.,matched,contradicted,true,claim_1,Employees receive 18 weeks of paid parental leave\.,contradicted,/,
  );
  assert.match(lines[1] ?? "", /HR Policy/);
  assert.match(lines[1] ?? "", /high/);
  assert.match(lines[1] ?? "", /2026-05-31/);
  assert.match(lines[1] ?? "", /0\.\d{3}/);
  assert.match(
    lines[2] ?? "",
    /^2026-06-29T00:00:00.000Z,support-answer,examples\/answers\/support-answer\.md,Employees receive free catered lunch every day\.,matched,unsupported,true,claim_1,Employees receive free catered lunch every day\.,unsupported,/,
  );
  assert.match(lines[2] ?? "", /,,$/);
});

test("renders risky answers first in batch reviewer decision csv rows", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerLabel: "clear-answer",
        answerPath: "examples/answers/clear-answer.md",
        report: verifyAnswer("Employees receive 12 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
      {
        answerLabel: "risky-answer",
        answerPath: "examples/answers/risky-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  };

  const lines = renderBatchReviewerDecisionCsv(batchReport).trim().split("\n");

  assert.match(lines[1] ?? "", /^2026-06-29T00:00:00.000Z,risky-answer,examples\/answers\/risky-answer\.md,/);
  assert.match(lines[2] ?? "", /^2026-06-29T00:00:00.000Z,clear-answer,examples\/answers\/clear-answer\.md,/);
});

test("renders a no-claim batch reviewer decision csv row with answer-level context", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "empty",
        answerPath: "examples/answers/empty.md",
        report: verifyAnswer("Short.\n", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 1,
      answersWithFailures: 0,
    },
  };

  const rendered = renderBatchReviewerDecisionCsv(batchReport);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[1],
    "2026-06-29T00:00:00.000Z,empty,examples/answers/empty.md,Short.,clear,,false,,,,No claims were extracted from this answer.,,,,,,,,",
  );
});

test("renders a batch summary csv with per-answer verdict totals", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 2,
    answers: [
      {
        answerLabel: "hr-answer",
        answerPath: "examples/answers/hr-answer.md",
        report: verifyAnswer("Employees receive 12 weeks of paid parental leave.", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
      {
        answerLabel: "support-answer",
        answerPath: "examples/answers/support-answer.md",
        report: verifyAnswer("Employees receive free catered lunch every day.", [hrPolicy]),
        shouldFail: true,
        failVerdicts: ["unsupported"],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    },
  };

  const rendered = renderBatchSummaryCsv(batchReport);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[0],
    "generated_at,answer_label,answer_path,answer_preview,answer_has_claims,primary_verdict,primary_claim,primary_reason,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids",
  );
  assert.equal(
    lines[1],
    "2026-06-29T00:00:00.000Z,support-answer,examples/answers/support-answer.md,Employees receive free catered lunch every day.,true,unsupported,Employees receive free catered lunch every day.,No approved source contains enough overlapping policy language.,,,,,,,,1,0,0,1,0,matched,unsupported,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy",
  );
  assert.equal(
    lines[2],
    "2026-06-29T00:00:00.000Z,hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,true,verified,Employees receive 12 weeks of paid parental leave.,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy,1.000,Employees receive 12 weeks of paid parental leave.,1,1,0,0,0,clear,,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy",
  );
});

test("renders one aggregate batch summary csv row for queue routing", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 2,
    answers: [],
    summary: {
      verified: 3,
      contradicted: 1,
      unsupported: 2,
      needs_review: 1,
      answersWithClaims: 1,
      answersWithoutClaims: 1,
      answersWithFailures: 2,
    },
  };

  assert.equal(
    renderBatchAggregateSummaryCsv(batchReport),
    "generated_at,answer_count,answers_with_claims,answers_without_claims,answers_with_failures,total_claims,verified,contradicted,unsupported,needs_review,source_count,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids\n2026-06-29T00:00:00.000Z,2,1,1,2,7,3,1,2,1,1,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy\n",
  );
});

test("renders a normalized truncated answer preview in batch summary csv rows", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "long-answer",
        answerPath: "examples/answers/long-answer.md",
        report: verifyAnswer(
          `Employees receive 12 weeks of paid parental leave.

Managers approve travel within five business days, and international trips require finance review before booking.
`,
          [hrPolicy],
        ),
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 0,
    },
  };

  const rendered = renderBatchSummaryCsv(batchReport);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[1],
    '2026-06-29T00:00:00.000Z,long-answer,examples/answers/long-answer.md,"Employees receive 12 weeks of paid parental leave. Managers approve travel within five business days, and internation...",true,unsupported,"Managers approve travel within five business days, and international trips require finance review before booking.",No approved source contains enough overlapping policy language.,,,,,,,,2,1,0,1,0,clear,,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy',
  );
});

test("renders readable html answer previews in batch summary csv rows", () => {
  const supportPolicy: SourceDocument = {
    id: "support_policy",
    title: "Support Policy",
    trustLevel: "medium",
    content: "Refunds are available within 30 days of purchase.",
  };
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: [
      {
        id: supportPolicy.id,
        title: supportPolicy.title,
        trustLevel: supportPolicy.trustLevel,
        updatedAt: supportPolicy.updatedAt,
      },
    ],
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "support-html",
        answerPath: "examples/answers/support.html",
        report: verifyAnswer(
          "<!doctype html><html><body><main><h1>Support Queue</h1><p>Refunds are available within 30 days of purchase.</p></main></body></html>",
          [supportPolicy],
        ),
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 0,
      answersWithFailures: 0,
    },
  };

  const rendered = renderBatchSummaryCsv(batchReport);

  assert.match(
    rendered,
    /support-html,examples\/answers\/support\.html,Support Queue Refunds are available within 30 days of purchase\.,true,verified,/,
  );
  assert.doesNotMatch(rendered, /<!doctype html>/i);
  assert.doesNotMatch(rendered, /<main>|<p>/);
});

test("renders no-claim batch summary csv rows with an explicit review signal", () => {
  const batchReport: BatchVerificationReport = {
    generatedAt: "2026-06-29T00:00:00.000Z",
    sources: batchSources,
    sourceCount: 1,
    answerCount: 1,
    answers: [
      {
        answerLabel: "empty",
        answerPath: "examples/answers/empty.md",
        report: verifyAnswer("Short.\n", [hrPolicy]),
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 0,
      answersWithoutClaims: 1,
      answersWithFailures: 0,
    },
  };

  const rendered = renderBatchSummaryCsv(batchReport);
  const lines = rendered.trim().split("\n");

  assert.equal(
    lines[1],
    "2026-06-29T00:00:00.000Z,empty,examples/answers/empty.md,Short.,false,needs_review,,No claims were extracted from this answer.,,,,,,,,0,0,0,0,0,clear,,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,hr_policy",
  );
});
