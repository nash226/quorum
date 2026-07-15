import assert from "node:assert/strict";
import test from "node:test";
import {
  importReviewerDecisions,
  filterReviewerDecisionImportReport,
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportReport,
  renderReviewerDecisionImportQueueSummaryCsv,
  renderReviewerDecisionImportSummaryCsv,
} from "../src/reviewer-decision-import.js";

test("filters imported answer groups by reviewer queue status", () => {
  const csv = [
    "answer_label,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
    "pending-answer,true,claim_1,Refunds are available.,unsupported,No evidence.,Support Policy,Refunds are available within 30 days.,,",
    "reviewed-answer,true,claim_2,Employees receive leave.,verified,Supported.,HR Policy,Employees receive leave.,verified,Approved",
    "no-claims-answer,false,,,,,,,,",
  ].join("\n");
  const report = importReviewerDecisions(csv);

  const pending = filterReviewerDecisionImportReport(report, "pending");
  assert.deepEqual(pending.answerGroups.map((group) => group.label), ["pending-answer"]);
  assert.equal(pending.summary.pendingClaims, 1);
  assert.equal(pending.queueSummary.pendingAnswers, 1);
  assert.equal(pending.queueSummary.reviewedAnswers, 0);

  const noClaims = filterReviewerDecisionImportReport(report, "no_claims");
  assert.deepEqual(noClaims.answerGroups.map((group) => group.label), ["no-claims-answer"]);
  assert.equal(noClaims.summary.totalClaims, 0);
  assert.equal(noClaims.queueSummary.noClaimsAnswers, 1);
});

test("imports reviewer decisions with overrides, notes, and quoted csv fields", () => {
  const report = importReviewerDecisions(`claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,"Employees receive 18 weeks of paid parental leave.",contradicted,"A closely matching approved source uses different numeric terms.","HR Policy",high,2026-05-31,0.857,"Employees receive 12 weeks of paid parental leave.",verified,"Approved after checking the June addendum"
claim_2,"Employees receive free catered lunch every day.",unsupported,"No approved source contains enough overlapping policy language.","HR Policy",high,2026-05-31,0.251,"No approved source snippet matched strongly enough.",,"Needs People Ops confirmation, not policy evidence"
claim_3,"Healthcare coverage begins after 30 days of employment.",verified,"The claim is strongly supported by an approved source.","HR Policy",high,2026-05-31,0.992,"Healthcare coverage begins after 30 days of employment.",needs_review,"Reviewer wants legal to check:
waiting on plan language"
`);

  assert.deepEqual(report.summary, {
    totalClaims: 3,
    reviewedClaims: 2,
    pendingClaims: 1,
    overriddenClaims: 2,
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.equal(report.answerGroups.length, 1);
  assert.equal(report.answerGroups[0]?.label, "Unspecified answer");
  assert.equal(report.answerGroups[0]?.answerHasClaims, true);
  assert.equal(report.answerGroups[0]?.reviewStatus, "pending");
  assert.equal(report.answerGroups[0]?.summary.reviewedClaims, 2);
  assert.deepEqual(report.queueSummary, {
    totalAnswers: 1,
    pendingAnswers: 1,
    reviewedAnswers: 0,
    noClaimsAnswers: 0,
  });

  assert.equal(report.claims[0]?.finalVerdict, "verified");
  assert.equal(report.claims[0]?.overridden, true);
  assert.equal(
    report.claims[1]?.reviewerNotes,
    "Needs People Ops confirmation, not policy evidence",
  );
  assert.deepEqual(report.claims[0]?.evidenceTrustLevels, ["high"]);
  assert.deepEqual(report.claims[0]?.evidenceUpdatedAt, ["2026-05-31"]);
  assert.deepEqual(report.claims[0]?.evidenceScores, ["0.857"]);
  assert.equal(report.claims[1]?.reviewerVerdict, undefined);
  assert.equal(report.claims[2]?.reviewerVerdict, "needs_review");
  assert.match(report.claims[2]?.reviewerNotes ?? "", /waiting on plan language/);
});

test("imports batch reviewer decisions with answer path context", () => {
  const report = importReviewerDecisions(`answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,matched,unsupported,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,,
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,clear,,claim_2,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate to support ops
`);

  assert.equal(report.claims[0]?.answerLabel, "hr-answer");
  assert.equal(report.claims[0]?.answerPath, "examples/answers/hr-answer.md");
  assert.equal(
    report.claims[0]?.answerPreview,
    "Employees receive 12 weeks of paid parental leave.",
  );
  assert.equal(report.claims[0]?.originalAnswerFailPolicy, "matched");
  assert.deepEqual(report.claims[0]?.originalAnswerFailVerdicts, ["unsupported"]);
  assert.equal(report.answerGroups.length, 2);
  assert.equal(report.answerGroups[0]?.label, "hr-answer");
  assert.equal(report.answerGroups[0]?.answerPath, "examples/answers/hr-answer.md");
  assert.equal(report.answerGroups[0]?.originalAnswerFailPolicy, "matched");
  assert.deepEqual(report.answerGroups[0]?.originalAnswerFailVerdicts, ["unsupported"]);
  assert.equal(report.answerGroups[0]?.summary.pendingClaims, 1);
  assert.equal(report.answerGroups[1]?.summary.needs_review, 1);
  assert.deepEqual(report.queueSummary, {
    totalAnswers: 2,
    pendingAnswers: 1,
    reviewedAnswers: 1,
    noClaimsAnswers: 0,
  });
  assert.equal(report.claims[1]?.answerPath, "examples/answers/support-answer.md");
  assert.deepEqual(report.claims[1]?.evidenceTrustLevels, ["medium"]);
  assert.deepEqual(report.claims[1]?.evidenceUpdatedAt, ["2026-06-01"]);
  assert.deepEqual(report.claims[1]?.evidenceScores, ["0.842"]);
  assert.equal(report.claims[1]?.reviewerVerdict, "needs_review");
});

test("imports reviewer csv files that start with a utf-8 byte order mark", () => {
  const report = importReviewerDecisions(`\uFEFFanswer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
`);

  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.answerGroups[0]?.label, "hr-answer");
  assert.equal(report.answerGroups[0]?.summary.reviewedClaims, 1);
});

test("imports reviewer csv metadata rows for answers with no extracted claims", () => {
  const report = importReviewerDecisions(`answer_label,answer_path,answer_preview,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
empty,examples/answers/empty.md,Short.,false,,,,No claims were extracted from this answer.,,,,
`);

  assert.equal(report.claims.length, 0);
  assert.equal(report.answerGroups.length, 1);
  assert.equal(report.answerGroups[0]?.label, "empty");
  assert.equal(report.answerGroups[0]?.answerPath, "examples/answers/empty.md");
  assert.equal(report.answerGroups[0]?.answerHasClaims, false);
  assert.equal(report.answerGroups[0]?.summary.totalClaims, 0);
  assert.equal(report.answerGroups[0]?.reviewStatus, "no_claims");
  assert.deepEqual(report.queueSummary, {
    totalAnswers: 1,
    pendingAnswers: 0,
    reviewedAnswers: 0,
    noClaimsAnswers: 1,
  });
  assert.match(
    renderReviewerDecisionImportReport(report),
    /No claims were extracted from this answer\./,
  );
  assert.match(
    renderReviewerDecisionImportReport(report),
    /Answer has claims: no/,
  );
  assert.match(
    renderReviewerDecisionImportReport(report),
    /Queue: 1 answers, 0 pending, 0 reviewed, 1 with no claims/,
  );
  assert.match(
    renderReviewerDecisionImportMarkdownReport(report),
    /No claims were extracted from this answer\./,
  );
  assert.match(
    renderReviewerDecisionImportMarkdownReport(report),
    /- Answer has claims: no/,
  );
  assert.match(
    renderReviewerDecisionImportHtmlReport(report),
    /Review note/,
  );
  assert.match(
    renderReviewerDecisionImportHtmlReport(report),
    /Answer has claims: no/,
  );
  assert.match(
    renderReviewerDecisionImportSummaryCsv(report),
    /empty,examples\/answers\/empty\.md,Short\.,false,no_claims,needs_review,,No claims were extracted from this answer\.,,.*0,0,0,0,0,0,0,0,,,clear,/,
  );
});

test("imports escaped evidence delimiters without corrupting reviewer csv context", () => {
  const report = importReviewerDecisions(`answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/support-answer.md,Refunds are available within 30 days standard purchases.,claim_1,Refunds are available within 30 days standard purchases.,verified,The claim is strongly supported by an approved source.,Support \\| Policy,high,2026-06-01,0.998,Refunds are available within 30 days \\| standard purchases.,,
`);

  assert.deepEqual(report.claims[0]?.evidenceTitles, ["Support | Policy"]);
  assert.deepEqual(report.claims[0]?.evidenceTrustLevels, ["high"]);
  assert.deepEqual(report.claims[0]?.evidenceUpdatedAt, ["2026-06-01"]);
  assert.deepEqual(report.claims[0]?.evidenceScores, ["0.998"]);
  assert.deepEqual(report.claims[0]?.evidenceQuotes, [
    "Refunds are available within 30 days | standard purchases.",
  ]);
});

test("groups preview-only imports separately when answer paths are missing", () => {
  const report = importReviewerDecisions(`answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,Employees receive 12 weeks of paid parental leave.,,
Refunds are available within 14 days of purchase.,claim_2,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,Refunds are available within 30 days of purchase.,,
`);

  assert.equal(
    report.claims[0]?.answerPreview,
    "Employees receive 12 weeks of paid parental leave.",
  );
  assert.equal(
    report.claims[1]?.answerPreview,
    "Refunds are available within 14 days of purchase.",
  );
  assert.equal(report.answerGroups.length, 2);
  assert.equal(report.answerGroups[0]?.label, "Employees receive 12 weeks of paid parental leave.");
  assert.equal(report.answerGroups[1]?.label, "Refunds are available within 14 days of purchase.");

  const rendered = renderReviewerDecisionImportReport(report);
  assert.match(rendered, /Answer: Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /Answer preview: Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /Answer: Refunds are available within 14 days of purchase\./);
});

test("groups imported reviewer decisions by answer in the JSON report", () => {
  const report = importReviewerDecisions(`answer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_2,Healthcare coverage begins after 30 days of employment.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.991,Healthcare coverage begins after 30 days of employment.,,
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,claim_3,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate to support ops
`);

  assert.equal(report.answerGroups.length, 2);
  assert.equal(report.answerGroups[0]?.label, "hr-answer");
  assert.equal(report.answerGroups[0]?.answerPath, "examples/answers/hr-answer.md");
  assert.equal(report.answerGroups[0]?.claims.length, 2);
  assert.equal(report.answerGroups[0]?.summary.reviewedClaims, 1);
  assert.equal(report.answerGroups[0]?.summary.pendingClaims, 1);
  assert.equal(report.answerGroups[1]?.label, "support-answer");
  assert.equal(report.answerGroups[1]?.summary.needs_review, 1);
  assert.equal(report.answerGroups[1]?.summary.overriddenClaims, 1);
});

test("rejects csv files that do not match the expected export columns", () => {
  assert.throws(
    () =>
      importReviewerDecisions(`claim_id,claim_text,reviewer_notes
claim_1,Sample,Needs approval
`),
    /missing required columns/i,
  );
});

test("rejects duplicate claim rows for the same answer", () => {
  assert.throws(
    () =>
      importReviewerDecisions(`answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Supported by policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Supported by policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Approved
`),
    /duplicate claim_id 'claim_1'.*rows 2 and 3/i,
  );
});

test("allows the same claim id for different answers", () => {
  const report = importReviewerDecisions(`answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Supported by policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
answers/support.md,claim_1,Refunds are available within 30 days.,verified,Supported by policy,Support Policy,Refunds are available within 30 days.,,
`);

  assert.equal(report.summary.totalClaims, 2);
  assert.equal(report.answerGroups.length, 2);
});

test("renders a reviewer decision import summary for humans", () => {
  const rendered = renderReviewerDecisionImportReport(
    importReviewerDecisions(`answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,,"","",`),
    ["unsupported"],
  );

  assert.match(rendered, /Quorum Reviewer Decision Import/);
  assert.match(rendered, /Claims: 2 total, 1 reviewed, 1 pending/);
  assert.match(rendered, /Overrides: 0/);
  assert.match(rendered, /Fail policy: matched \(unsupported\)/);
  assert.match(rendered, /Answer Groups/);
  assert.match(rendered, /Answer: hr-answer/);
  assert.match(rendered, /Answer file: examples\/answers\/hr-answer\.md/);
  assert.match(rendered, /Answer: support-answer/);
  assert.match(rendered, /Fail policy: clear/);
  assert.match(rendered, /Fail policy: matched \(unsupported\)/);
  assert.match(rendered, /VERIFIED  Employees receive 12 weeks/);
  assert.match(rendered, /Evidence:/);
  assert.match(
    rendered,
    /HR Policy, high trust, updated 2026-05-31, score 0\.998: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(rendered, /Reviewer verdict: pending reviewer decision/);
});

test("renders a reviewer decision import markdown report", () => {
  const rendered = renderReviewerDecisionImportMarkdownReport(
    importReviewerDecisions(`answer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,Employees receive free catered lunch every day.,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,,"","",`),
    ["unsupported"],
  );

  assert.match(rendered, /^# Quorum Reviewer Decision Import/m);
  assert.match(rendered, /- Total claims: 2/);
  assert.match(rendered, /- Fail policy: matched \(unsupported\)/);
  assert.match(rendered, /## Answer Groups/);
  assert.match(rendered, /### hr-answer/);
  assert.match(rendered, /- Answer file: examples\/answers\/hr-answer\.md/);
  assert.match(rendered, /- Answer preview: Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /### support-answer/);
  assert.match(rendered, /- Fail policy: clear/);
  assert.match(rendered, /- Fail policy: matched \(unsupported\)/);
  assert.match(rendered, /#### 1\. Employees receive 12 weeks/);
  assert.match(rendered, /- Evidence:/);
  assert.match(
    rendered,
    /  - HR Policy, high trust, updated 2026-05-31, score 0\.998: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(rendered, /- Reviewer verdict: verified/);
  assert.match(rendered, /- Reviewer verdict: pending reviewer decision/);
});

test("keeps user-provided markdown report context on one structural line", () => {
  const report = importReviewerDecisions(
    'answer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes\n' +
      '"reviewer`packet",answers/review.md,"Preview line one\nline two",claim_1,"Claim line one\nline two",verified,"Reason line one\nline two",Policy,Approved,verified,"Note line one\nline two"',
  );
  const rendered = renderReviewerDecisionImportMarkdownReport(report);

  assert.match(rendered, /### reviewer\\`packet/);
  assert.match(rendered, /- Answer preview: Preview line one line two/);
  assert.match(rendered, /#### 1\. Claim line one line two/);
  assert.match(rendered, /- Reviewer notes: Note line one line two/);
  assert.doesNotMatch(rendered, /^line two$/m);
});

test("renders a reviewer decision import html report", () => {
  const rendered = renderReviewerDecisionImportHtmlReport(
    importReviewerDecisions(`answer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_source_paths,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,examples/sources/hr-policy.md,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,<Flag this answer for legal review.>,claim_2,<Flag this answer for legal review.>,unsupported,No approved source contains enough overlapping policy language.,"","","","","","","","Needs counsel review before publish"`),
    ["unsupported"],
  );

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<title>Quorum Reviewer Decision Import<\/title>/);
  assert.match(rendered, /Imported reviewer decisions, final verdicts/);
  assert.match(rendered, /<span>Total claims<\/span><strong>2<\/strong>/);
  assert.match(rendered, /<span>Queue answers<\/span><strong>2<\/strong>/);
  assert.match(rendered, /<span>Queue pending<\/span><strong>1<\/strong>/);
  assert.match(rendered, /<span>Queue reviewed<\/span><strong>1<\/strong>/);
  assert.match(rendered, /<span>Queue no claims<\/span><strong>0<\/strong>/);
  assert.match(rendered, /<span>Fail policy<\/span><strong>matched \(unsupported\)<\/strong>/);
  assert.match(rendered, /Answer file/);
  assert.match(rendered, /<h2><code>hr-answer<\/code><\/h2>/);
  assert.match(rendered, /<p class="answer-group__path"><code>examples\/answers\/hr-answer\.md<\/code><\/p>/);
  assert.match(rendered, /<p class="answer-group__preview">Employees receive 12 weeks of paid parental leave\.<\/p>/);
  assert.match(rendered, /1 claims<\/span>/);
  assert.match(rendered, /Fail policy clear/);
  assert.match(rendered, /Fail policy matched \(unsupported\)/);
  assert.match(rendered, /Evidence context/);
  assert.match(rendered, /<strong>HR Policy - high trust - updated 2026-05-31 - path examples\/sources\/hr-policy\.md - score 0\.998<\/strong>/);
  assert.match(rendered, /Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /Needs counsel review before publish/);
  assert.match(rendered, /&lt;Flag this answer for legal review\.\&gt;/);
  assert.doesNotMatch(rendered, /<Flag this answer for legal review\.>/);
});

test("renders a reviewer decision import summary csv", () => {
  const rendered = renderReviewerDecisionImportSummaryCsv(
    importReviewerDecisions(`answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_2,Healthcare coverage begins after 30 days of employment.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.991,Healthcare coverage begins after 30 days of employment.,,
examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,claim_3,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate to support ops
`, "2026-07-01T12:00:00.000Z"),
    ["needs_review", "unsupported"],
  );

  const lines = rendered.trim().split("\n");
  assert.equal(
    lines[0],
    "generated_at,answer_label,answer_path,answer_preview,answer_has_claims,review_status,primary_final_verdict,primary_claim,primary_model_reason,primary_reviewer_notes,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_source_path,primary_evidence_source_id,primary_evidence_score,primary_evidence_quote,total_claims,reviewed_claims,pending_claims,overridden_claims,verified,contradicted,unsupported,needs_review,original_answer_fail_policy,original_answer_fail_verdicts,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids",
  );
  assert.equal(
    lines[1],
    "2026-07-01T12:00:00.000Z,examples/answers/hr-answer.md,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,true,pending,verified,Employees receive 12 weeks of paid parental leave.,The claim is strongly supported by an approved source.,Approved,HR Policy,high,2026-05-31,,,0.998,Employees receive 12 weeks of paid parental leave.,2,1,1,0,2,0,0,0,,,clear,,HR Policy,high,2026-05-31,,",
  );
  assert.equal(
    lines[2],
    "2026-07-01T12:00:00.000Z,examples/answers/support-answer.md,examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,true,reviewed,needs_review,Refunds are available within 14 days of purchase.,A closely matching approved source uses different numeric terms.,Escalate to support ops,Support Playbook,medium,2026-06-01,,,0.842,Refunds are available within 30 days of purchase.,1,1,0,1,0,0,0,1,,,matched,needs_review,Support Playbook,medium,2026-06-01,,",
  );
});

test("renders queue totals as a standalone csv artifact", () => {
  const rendered = renderReviewerDecisionImportQueueSummaryCsv(
    importReviewerDecisions(`answer_label,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
pending,true,claim_1,Refunds are available.,unsupported,No evidence.,Support Policy,Refunds are available within 30 days.,,
reviewed,true,claim_2,Employees receive leave.,verified,Supported.,HR Policy,Employees receive leave.,verified,Approved
empty,false,,,,,,,,
`, "2026-07-01T12:00:00.000Z"),
    ["unsupported"],
  );

  assert.equal(
    rendered.trim(),
    "generated_at,total_answers,pending_answers,reviewed_answers,no_claims_answers,total_claims,reviewed_claims,pending_claims,overridden_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts\n" +
      "2026-07-01T12:00:00.000Z,3,1,1,1,2,1,1,0,1,0,1,0,matched,unsupported",
  );
});
