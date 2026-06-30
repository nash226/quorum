import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnswer } from "../src/claim-verifier.js";
import type { SourceDocument } from "../src/domain.js";

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

test("selects the strongest evidence across multiple sources", () => {
  const report = verifyAnswer(
    "Customers can cancel subscriptions from billing settings.",
    [hrPolicy, supportPolicy],
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(report.assessments[0]?.verdict, "verified");
  assert.equal(report.assessments[0]?.evidence[0]?.documentId, "support_policy");
});
