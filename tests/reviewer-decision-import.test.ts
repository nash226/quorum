import assert from "node:assert/strict";
import test from "node:test";
import {
  importReviewerDecisions,
  renderReviewerDecisionImportReport,
} from "../src/reviewer-decision-import.js";

test("imports reviewer decisions with overrides, notes, and quoted csv fields", () => {
  const report = importReviewerDecisions(`claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,"Employees receive 18 weeks of paid parental leave.",contradicted,"A closely matching approved source uses different numeric terms.","HR Policy","Employees receive 12 weeks of paid parental leave.",verified,"Approved after checking the June addendum"
claim_2,"Employees receive free catered lunch every day.",unsupported,"No approved source contains enough overlapping policy language.","HR Policy","No approved source snippet matched strongly enough.",,"Needs People Ops confirmation, not policy evidence"
claim_3,"Healthcare coverage begins after 30 days of employment.",verified,"The claim is strongly supported by an approved source.","HR Policy","Healthcare coverage begins after 30 days of employment.",needs_review,"Reviewer wants legal to check:
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
  assert.equal(report.claims[1]?.reviewerVerdict, undefined);
  assert.equal(report.claims[2]?.reviewerVerdict, "needs_review");
  assert.match(report.claims[2]?.reviewerNotes ?? "", /waiting on plan language/);
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
    importReviewerDecisions(`claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Approved
claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,"",`),
  );

  assert.match(rendered, /Quorum Reviewer Decision Import/);
  assert.match(rendered, /Claims: 2 total, 1 reviewed, 1 pending/);
  assert.match(rendered, /Overrides: 0/);
  assert.match(rendered, /VERIFIED  Employees receive 12 weeks/);
  assert.match(rendered, /Reviewer verdict: pending reviewer decision/);
});
