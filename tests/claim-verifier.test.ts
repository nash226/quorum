import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnswer } from "../src/claim-verifier.js";
import type { SourceDocument } from "../src/domain.js";
import { sourceDocumentFromFile } from "../src/source-loader.js";

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

const supportPolicy: SourceDocument = {
  id: "support_policy",
  title: "Support Policy",
  trustLevel: "medium",
  content: `
Customers can cancel monthly subscriptions from account billing settings.
Enterprise support requests receive a first response within four business hours.
`,
};

test("verifies claims that match approved sources", () => {
  const report = verifyAnswer(
    "Full-time employees receive 20 days of paid vacation each calendar year.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(report.assessments[0]?.verdict, "verified");
});

test("prefers higher-trust sources when evidence strength is similar", () => {
  const highTrustPolicy: SourceDocument = {
    id: "high_trust",
    title: "Canonical Refund Policy",
    trustLevel: "high",
    content: "Customers can request refunds within 30 calendar days of purchase.",
  };
  const lowTrustPolicy: SourceDocument = {
    id: "low_trust",
    title: "Legacy Refund FAQ",
    trustLevel: "low",
    content: "Customers can request refunds within 30 days after purchase.",
  };

  const report = verifyAnswer("Customers can request refunds within 30 days of purchase.", [
    lowTrustPolicy,
    highTrustPolicy,
  ]);

  assert.equal(report.assessments[0]?.evidence[0]?.documentId, "high_trust");
  assert.equal(report.assessments[0]?.evidence[0]?.documentTrustLevel, "high");
  assert.equal(report.assessments[0]?.evidence[0]?.documentUpdatedAt, undefined);
  assert.equal(report.sources[0]?.trustLevel, "low");
  assert.equal(report.sources[1]?.trustLevel, "high");
});

test("prefers fresher sources when evidence strength and trust are similar", () => {
  const stalePolicy: SourceDocument = {
    id: "stale_policy",
    title: "Refund Policy Archive",
    trustLevel: "high",
    updatedAt: "2026-05-01",
    content: "Customers can request refunds within 30 days after purchase.",
  };
  const freshPolicy: SourceDocument = {
    id: "fresh_policy",
    title: "Refund Policy Current",
    trustLevel: "high",
    updatedAt: "2026-06-15",
    content: "Customers can request refunds within 30 calendar days after purchase.",
  };

  const report = verifyAnswer("Customers can request refunds within 30 days after purchase.", [
    stalePolicy,
    freshPolicy,
  ]);

  assert.equal(report.assessments[0]?.evidence[0]?.documentId, "fresh_policy");
  assert.equal(report.assessments[0]?.evidence[0]?.documentUpdatedAt, "2026-06-15");
});

test("ignores invalid freshness metadata when choosing evidence", () => {
  const invalidDatePolicy: SourceDocument = {
    id: "invalid_date_policy",
    title: "Refund Policy Draft",
    trustLevel: "high",
    updatedAt: "not-a-date",
    content: "Customers can request refunds within 30 days after purchase.",
  };
  const freshPolicy: SourceDocument = {
    id: "fresh_policy",
    title: "Refund Policy Current",
    trustLevel: "high",
    updatedAt: "2026-06-15",
    content: "Customers can request refunds within 30 calendar days after purchase.",
  };

  const report = verifyAnswer("Customers can request refunds within 30 days after purchase.", [
    invalidDatePolicy,
    freshPolicy,
  ]);

  assert.equal(report.assessments[0]?.evidence[0]?.documentId, "fresh_policy");
  assert.equal(report.assessments[0]?.evidence[0]?.documentUpdatedAt, "2026-06-15");
});

test("flags numeric contradictions against approved sources", () => {
  const report = verifyAnswer("Employees receive 18 weeks of paid parental leave.", [
    hrPolicy,
  ]);

  assert.equal(report.summary.contradicted, 1);
  assert.equal(report.assessments[0]?.verdict, "contradicted");
  assert.match(report.assessments[0]?.evidence[0]?.quote ?? "", /12 weeks/);
  assert.equal(report.assessments[0]?.evidence[0]?.documentUpdatedAt, "2026-05-31");
});

test("marks unrelated claims as unsupported", () => {
  const report = verifyAnswer("Employees receive free catered lunch every day.", [
    hrPolicy,
  ]);

  assert.equal(report.summary.unsupported, 1);
  assert.equal(report.assessments[0]?.verdict, "unsupported");
});

test("routes partial source matches to review", () => {
  const report = verifyAnswer("Healthcare coverage begins for workers after onboarding.", [
    hrPolicy,
  ]);

  assert.equal(report.summary.needs_review, 1);
  assert.equal(report.assessments[0]?.verdict, "needs_review");
  assert.match(report.assessments[0]?.evidence[0]?.quote ?? "", /Healthcare/);
});

test("uses normalized markdown table rows as reviewer-friendly evidence quotes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.md",
    `| Policy | Details |
| --- | --- |
| Healthcare | Coverage begins after 30 days of employment. |
`,
    0,
  );

  const report = verifyAnswer("Coverage begins after 30 days of employment.", [source]);

  assert.equal(report.summary.verified, 1);
  assert.equal(
    report.assessments[0]?.evidence[0]?.quote,
    "Healthcare: Coverage begins after 30 days of employment.",
  );
});

test("selects the strongest evidence across multiple sources", () => {
  const report = verifyAnswer(
    "Customers can cancel subscriptions from billing settings.",
    [hrPolicy, supportPolicy],
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(report.assessments[0]?.verdict, "verified");
  assert.equal(report.assessments[0]?.evidence[0]?.documentId, "support_policy");
});

test("verifies claims from answers with inline markdown formatting", () => {
  const report = verifyAnswer(
    "- **Employees receive** `12 weeks` of paid parental leave.\n",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(
    report.assessments[0]?.claim.text,
    "Employees receive 12 weeks of paid parental leave.",
  );
  assert.equal(report.assessments[0]?.verdict, "verified");
});

test("includes reviewer-friendly answer context in single-answer reports", () => {
  const report = verifyAnswer(
    "Employees receive 12 weeks of paid parental leave.\n",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
    "examples/answers/hr-answer.md",
  );

  assert.equal(report.answerPath, "examples/answers/hr-answer.md");
  assert.equal(report.answerLabel, "hr-answer");
  assert.equal(report.answerPreview, "Employees receive 12 weeks of paid parental leave.");
});
