import assert from "node:assert/strict";
import test from "node:test";
import {
  importReviewerDecisions,
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportReport,
} from "../src/reviewer-decision-import.js";

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
  const report = importReviewerDecisions(`answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,,
examples/answers/support-answer.md,claim_2,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate to support ops
`);

  assert.equal(report.claims[0]?.answerPath, "examples/answers/hr-answer.md");
  assert.equal(report.claims[1]?.answerPath, "examples/answers/support-answer.md");
  assert.deepEqual(report.claims[1]?.evidenceTrustLevels, ["medium"]);
  assert.deepEqual(report.claims[1]?.evidenceUpdatedAt, ["2026-06-01"]);
  assert.deepEqual(report.claims[1]?.evidenceScores, ["0.842"]);
  assert.equal(report.claims[1]?.reviewerVerdict, "needs_review");
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

test("renders a reviewer decision import summary for humans", () => {
  const rendered = renderReviewerDecisionImportReport(
    importReviewerDecisions(`answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,,"","",`),
  );

  assert.match(rendered, /Quorum Reviewer Decision Import/);
  assert.match(rendered, /Claims: 2 total, 1 reviewed, 1 pending/);
  assert.match(rendered, /Overrides: 0/);
  assert.match(rendered, /Answer Groups/);
  assert.match(rendered, /Answer: examples\/answers\/hr-answer\.md/);
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
    importReviewerDecisions(`answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,,"","",`),
  );

  assert.match(rendered, /^# Quorum Reviewer Decision Import/m);
  assert.match(rendered, /- Total claims: 2/);
  assert.match(rendered, /## Answer Groups/);
  assert.match(rendered, /### examples\/answers\/hr-answer\.md/);
  assert.match(rendered, /#### 1\. Employees receive 12 weeks/);
  assert.match(rendered, /- Evidence:/);
  assert.match(
    rendered,
    /  - HR Policy, high trust, updated 2026-05-31, score 0\.998: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(rendered, /- Reviewer verdict: verified/);
  assert.match(rendered, /- Reviewer verdict: pending reviewer decision/);
});

test("renders a reviewer decision import html report", () => {
  const rendered = renderReviewerDecisionImportHtmlReport(
    importReviewerDecisions(`answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
examples/answers/support-answer.md,claim_2,<Flag this answer for legal review.>,unsupported,No approved source contains enough overlapping policy language.,"","","","","","","Needs counsel review before publish"`),
  );

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<title>Quorum Reviewer Decision Import<\/title>/);
  assert.match(rendered, /Imported reviewer decisions, final verdicts/);
  assert.match(rendered, /<span>Total claims<\/span><strong>2<\/strong>/);
  assert.match(rendered, /Answer file/);
  assert.match(rendered, /<code>examples\/answers\/hr-answer\.md<\/code>/);
  assert.match(rendered, /1 claims<\/span>/);
  assert.match(rendered, /Evidence context/);
  assert.match(rendered, /<strong>HR Policy - high trust - updated 2026-05-31 - score 0\.998<\/strong>/);
  assert.match(rendered, /Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /Needs counsel review before publish/);
  assert.match(rendered, /&lt;Flag this answer for legal review\.\&gt;/);
  assert.doesNotMatch(rendered, /<Flag this answer for legal review\.>/);
});
