import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  evaluateFixtureContent,
  evaluateFixture,
  evaluateFixtureFiles,
  evaluateFixtureFile,
  hasEvaluationMismatch,
  loadEvaluationFixture,
  loadEvaluationFixtureFromContent,
  renderEvaluationAggregateSummaryCsv,
  renderEvaluationDomainSummaryCsv,
  renderEvaluationHtmlReport,
  renderEvaluationMarkdownReport,
  renderEvaluationScorecard,
  renderEvaluationSummaryCsv,
  renderEvaluationTextReport,
  resolveEvaluationFixturePaths,
} from "../src/index.js";

test("loads and evaluates the HR example fixture", async () => {
  const fixturePath = resolve("examples/evaluations/hr-policy.json");
  const fixture = await loadEvaluationFixture(fixturePath);
  const scorecard = await evaluateFixture(fixture, {
    baseDir: resolve("examples/evaluations"),
    fixturePath,
    generatedAt: "2026-07-05T10:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR reviewer packet");
  assert.equal(scorecard.answerHasClaims, true);
  assert.equal(
    scorecard.answerPreview,
    "Employees receive 18 weeks of paid parental leave. Full-time employees receive 20 days of paid vacation each calendar...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["contradicted", "verified", "unsupported"],
  );
});

test("evaluates a shipped inline HR medical leave fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/medical-leave-policy.json"),
    generatedAt: "2026-07-15T23:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR medical leave policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR medical leave reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "hr/medical-leave@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR bereavement fixture across leave claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/bereavement-leave-policy.json"),
    generatedAt: "2026-07-16T07:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR bereavement leave policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR bereavement leave reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-bereavement-leave@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR jury-duty fixture across leave claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/jury-duty-policy.json"),
    generatedAt: "2026-07-16T02:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR jury duty policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR jury duty reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-jury-duty@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR offboarding fixture across separation claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/offboarding-policy.json"),
    generatedAt: "2026-07-17T01:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR offboarding policy example");
  assert.equal(scorecard.answerLabel, "HR offboarding reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-offboarding@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR relocation fixture across reimbursement claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/relocation-policy.json"),
    generatedAt: "2026-07-16T02:00:00.000Z",
  });
  assert.equal(scorecard.fixtureName, "HR relocation policy example");
  assert.equal(scorecard.answerLabel, "HR relocation reviewer packet");
  assert.deepEqual(scorecard.actualSummary, { verified: 1, contradicted: 0, unsupported: 1, needs_review: 1 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "needs_review", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-relocation@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR tuition reimbursement fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/tuition-reimbursement-policy.json"),
    generatedAt: "2026-07-16T03:00:00.000Z",
  });
  assert.equal(scorecard.fixtureName, "HR tuition reimbursement policy example");
  assert.equal(scorecard.answerLabel, "HR tuition reimbursement reviewer packet");
  assert.deepEqual(scorecard.actualSummary, { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "contradicted", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-tuition-reimbursement@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR bonus eligibility fixture across compensation claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/bonus-eligibility-policy.json"),
    generatedAt: "2026-07-19T05:00:00.000Z",
  });
  assert.equal(scorecard.fixtureName, "HR bonus eligibility policy example");
  assert.equal(scorecard.answerLabel, "HR bonus eligibility reviewer packet");
  assert.deepEqual(scorecard.actualSummary, { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "contradicted", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-bonus-eligibility@2026-07-19");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR travel reimbursement fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/travel-reimbursement-policy.json"),
    generatedAt: "2026-07-16T04:00:00.000Z",
  });
  assert.equal(scorecard.fixtureName, "HR travel reimbursement policy example");
  assert.equal(scorecard.answerLabel, "HR travel reimbursement reviewer packet");
  assert.deepEqual(scorecard.actualSummary, { verified: 1, contradicted: 1, unsupported: 0, needs_review: 1 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "contradicted", "needs_review"]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-travel-reimbursement@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR employee referral fixture across bonus claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/employee-referral-policy.json"),
    generatedAt: "2026-07-19T10:00:00.000Z",
  });
  assert.equal(scorecard.fixtureName, "HR employee referral policy example");
  assert.equal(scorecard.answerLabel, "HR employee referral reviewer packet");
  assert.deepEqual(scorecard.actualSummary, { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "contradicted", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-employee-referral@2026-07-19");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates fixture files relative to the fixture directory", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support-policy.json"),
    generatedAt: "2026-07-05T10:05:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Annual plan customers can request a refund within 30 days of purchase. Enterprise support requests receive a first re...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support escalation fixture across routing verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/escalation-policy.json"),
    generatedAt: "2026-07-14T04:30:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support escalation policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support escalation reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Escalated support tickets receive a first response within 4 business hours. Escalated support tickets receive a first...",
  );
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/escalation@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support guest access fixture across membership claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/guest-access-policy.json"),
    generatedAt: "2026-07-16T05:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support guest access policy example");
  assert.equal(scorecard.domain, "support");
  assert.deepEqual(scorecard.actualSummary, { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "contradicted", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "support/guest-access@2026-07-16");
});

test("evaluates a shipped support SLA fixture across risk verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/sla-policy.json"),
    generatedAt: "2026-07-14T05:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support SLA policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support SLA reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Enterprise support requests receive a first response within four business hours. Refunds for annual plans require a r...",
  );
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support live chat fixture from HTML policy", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/live-chat-policy.json"),
    generatedAt: "2026-07-15T09:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support live chat policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support live chat reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.match(scorecard.report.sources[0]?.sourcePath ?? "", /support-billing-policy\.html$/);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support password reset fixture across risk verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/password-reset-policy.json"),
    generatedAt: "2026-07-14T07:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support password reset policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support password reset reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support warranty fixture across eligibility claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/warranty-policy.json"),
    generatedAt: "2026-07-18T09:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support warranty policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support warranty reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/warranty@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support account fixture across security claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/account-security-policy.json"),
    generatedAt: "2026-07-15T08:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support account reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 1,
    unsupported: 0,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "contradicted",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support authentication device fixture across security claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("tests/fixtures/authentication-device-policy.json"),
    generatedAt: "2026-07-15T09:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support authentication device policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support authentication device reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/authentication-device@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates authentication device coverage in the checked-in benchmark", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/authentication-device-policy.json"),
    generatedAt: "2026-07-15T09:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support authentication device policy example");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.equal(scorecard.report.sources[0]?.id, "support/authentication-device@2026-07-15");
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support account recovery fixture across security controls", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/account-recovery-policy.json"),
    generatedAt: "2026-07-15T20:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account recovery policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support account recovery reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/account-recovery@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support account merge fixture across ownership controls", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/account-merge-policy.json"),
    generatedAt: "2026-07-15T22:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account merge policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support account merge reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/account-merge@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support shipping address fixture across timing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/address-change-policy.json"),
    generatedAt: "2026-07-16T05:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support shipping address change policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support shipping address change reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/address-change@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support contact change fixture across account controls", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/contact-change-policy.json"),
    generatedAt: "2026-07-15T21:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account contact change policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support account contact change reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/contact-change@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support account closure fixture across lifecycle claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/account-closure-policy.json"),
    generatedAt: "2026-07-15T23:55:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account closure policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support account closure reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 0,
    needs_review: 2,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/account-closure@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support workspace access fixture across membership controls", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/workspace-access-policy.json"),
    generatedAt: "2026-07-17T03:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support workspace access policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support workspace access reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/workspace-access@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support data retention fixture across deletion claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/data-retention-policy.json"),
    generatedAt: "2026-07-16T08:00:00.000Z",
  });
  assert.equal(scorecard.fixtureName, "Support data retention policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support data retention reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/data-retention@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support usage limits fixture across rate claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/usage-limits-policy.json"),
    generatedAt: "2026-07-15T23:58:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support usage limits policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support usage limits reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/usage-limits@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support holiday-hours fixture across coverage claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/holiday-hours-policy.json"),
    generatedAt: "2026-07-16T19:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support holiday hours policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support holiday hours reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "support/holiday-hours@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support cancellation fixture across risk verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/cancellation-policy.json"),
    generatedAt: "2026-07-15T05:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support subscription cancellation policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support cancellation reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support order cancellation fixture across order claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/order-cancellation-policy.json"),
    generatedAt: "2026-07-15T23:58:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support order cancellation policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support order cancellation reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 0,
    needs_review: 2,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/order-cancellation@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support billing address fixture across account claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/billing-address-policy.json"),
    generatedAt: "2026-07-15T23:45:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support billing address policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support billing address reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/billing-address@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support invoice correction fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/invoice-correction-policy.json"),
    generatedAt: "2026-07-15T15:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support invoice correction policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support invoice correction reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/invoice-correction@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support tax exemption fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/tax-exemption-policy.json"),
    generatedAt: "2026-07-15T23:55:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support tax exemption policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support tax exemption reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/tax-exemption@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support subscription pause fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/subscription-pause-policy.json"),
    generatedAt: "2026-07-15T16:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support subscription pause policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support subscription pause reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/subscription-pause@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support subscription renewal fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/subscription-renewal-policy.json"),
    generatedAt: "2026-07-15T17:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support subscription renewal policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support subscription renewal reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/subscription-renewal@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support billing suspension fixture across appeal claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/billing-suspension-policy.json"),
    generatedAt: "2026-07-15T21:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support billing suspension appeal policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support billing suspension reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/account-suspension@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support payment method fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/payment-method-policy.json"),
    generatedAt: "2026-07-15T23:15:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support payment method policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support payment method reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/payment-method@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support authorized contact fixture across account controls", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/authorized-contact-policy.json"),
    generatedAt: "2026-07-16T23:15:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support authorized contact policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support authorized contact reviewer packet");
  assert.deepEqual(scorecard.actualSummary, { verified: 2, contradicted: 0, unsupported: 1, needs_review: 0 });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["verified", "verified", "unsupported"]);
  assert.equal(scorecard.report.sources[0]?.id, "support/authorized-contact@2026-07-16");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support refunds fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/refunds-policy.json"),
    generatedAt: "2026-07-15T09:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support refunds policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support refunds reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support refund status fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/refund-status-policy.json"),
    generatedAt: "2026-07-15T12:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support refund status policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support refund status reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/refund-status@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support payment failure fixture across billing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/payment-failure-policy.json"),
    generatedAt: "2026-07-15T13:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support payment failure policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support payment failure reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 2,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "unsupported",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/payment-failure@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support data export fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/data-export-policy.json"),
    generatedAt: "2026-07-15T10:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support data export policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support data export reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/data-export@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support priority fixture across routing claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/priority-support-policy.json"),
    generatedAt: "2026-07-15T11:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support priority support policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support priority support reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/priority-support@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR leave fixture across risk verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/leave-policy.json"),
    generatedAt: "2026-07-14T06:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR leave policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR leave reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "contradicted",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR leave carryover fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/leave-carryover-policy.json"),
    generatedAt: "2026-07-15T12:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR leave carryover policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR leave carryover reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-leave-carryover@2026-07-15");
  assert.equal(scorecard.report.sources[0]?.title, "HR Leave Carryover Policy");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR parental leave fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/parental-leave-policy.json"),
    generatedAt: "2026-07-15T17:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR parental leave policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR parental leave reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-parental-leave@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR onboarding fixture across routing verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/onboarding-policy.json"),
    generatedAt: "2026-07-05T10:05:30.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR onboarding policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR onboarding reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Healthcare coverage begins after 30 days of employment. Remote employees may request ergonomic equipment reimbursemen...",
  );
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "needs_review",
  ]);
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.report.sources[0]?.title, "HR Benefits Policy");
  assert.equal(scorecard.report.sources[0]?.id, "source_1");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR professional development fixture across risk verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/professional-development-policy.json"),
    generatedAt: "2026-07-15T06:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR professional development policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR professional development reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-professional-development@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR compensation fixture across risk verdicts", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/compensation-policy.json"),
    generatedAt: "2026-07-15T07:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR compensation review policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR compensation reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-compensation@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR benefits fixture across enrollment claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/benefits-enrollment-policy.json"),
    generatedAt: "2026-07-15T10:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR benefits enrollment policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR benefits enrollment reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "contradicted",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-benefits-enrollment@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR performance review fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/performance-review-policy.json"),
    generatedAt: "2026-07-15T14:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR performance review policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR performance review reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-performance-review@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR remote work fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/remote-work-policy.json"),
    generatedAt: "2026-07-15T13:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR remote work policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR remote work reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-remote-work@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline HR expense reimbursement fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/expense-reimbursement-policy.json"),
    generatedAt: "2026-07-15T15:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR expense reimbursement policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR expense reimbursement reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-expense-reimbursement@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR payroll change fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/payroll-policy.json"),
    generatedAt: "2026-07-15T18:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR payroll change policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR payroll change reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "contradicted",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.title, "HR Payroll Change Policy");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR dependent benefits fixture across eligibility claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/dependent-benefits-policy.json"),
    generatedAt: "2026-07-15T22:30:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR dependent benefits policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR dependent benefits reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-dependent-benefits@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR bereavement leave fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/bereavement-leave-policy.json"),
    generatedAt: "2026-07-15T19:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR bereavement leave policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR bereavement leave reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-bereavement-leave@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR offboarding fixture across separation claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/offboarding-policy.json"),
    generatedAt: "2026-07-15T20:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR offboarding policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR offboarding reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 2,
    contradicted: 0,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-offboarding@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR workplace accommodation fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/workplace-accommodation-policy.json"),
    generatedAt: "2026-07-15T22:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR workplace accommodation policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR workplace accommodation reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "unsupported",
  ]);
  assert.equal(
    scorecard.report.sources[0]?.id,
    "people-ops/hr-workplace-accommodation@2026-07-15",
  );
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates the HR time-off fixture across review and unsupported claims", async () => {
  const fixturePath = resolve("examples/evaluations/hr/time-off-policy.json");
  const scorecard = await evaluateFixtureFile(fixturePath, {
    generatedAt: "2026-07-15T00:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR time-off request policy example");
  assert.equal(scorecard.domain, "hr");
  assert.deepEqual(scorecard.report.summary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 2,
  });
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["verified", "needs_review", "needs_review", "unsupported"],
  );
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support account merge fixture across lifecycle claims", async () => {
  const fixturePath = resolve("examples/evaluations/support/account-merge-policy.json");
  const scorecard = await evaluateFixtureFile(fixturePath, {
    generatedAt: "2026-07-15T00:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account merge policy example");
  assert.equal(scorecard.domain, "support");
  assert.deepEqual(scorecard.report.summary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["verified", "contradicted", "unsupported"],
  );
  assert.equal(scorecard.report.sources[0]?.id, "support/account-merge@2026-07-15");
  assert.equal(scorecard.score, 1);
});

test("evaluates the support plan change fixture across billing claims", async () => {
  const fixturePath = resolve("examples/evaluations/support/plan-change-policy.json");
  const scorecard = await evaluateFixtureFile(fixturePath, {
    generatedAt: "2026-07-15T00:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support plan change policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support plan change reviewer packet");
  assert.deepEqual(scorecard.report.summary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["verified", "contradicted", "unsupported"],
  );
  assert.equal(scorecard.report.sources[0]?.id, "source_1");
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support shipping protection fixture across claim routing", async () => {
  const fixturePath = resolve("examples/evaluations/support/shipping-protection-policy.json");
  const scorecard = await evaluateFixtureFile(fixturePath, {
    generatedAt: "2026-07-15T18:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support shipping protection policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support shipping protection reviewer packet");
  assert.deepEqual(scorecard.report.summary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["verified", "needs_review", "unsupported"],
  );
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support service credit fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/service-credit-policy.json"),
    generatedAt: "2026-07-15T16:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support service credit policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support service credit reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "contradicted",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/service-credit@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support data retention fixture across deletion claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/data-retention-policy.json"),
    generatedAt: "2026-07-15T23:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support data retention policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support data retention reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/data-retention@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support charge dispute fixture across payment claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/charge-dispute-policy.json"),
    generatedAt: "2026-07-15T23:30:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support charge dispute policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support charge dispute reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/charge-dispute@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support delivery delay fixture across shipping claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/delivery-delay-policy.json"),
    generatedAt: "2026-07-15T23:45:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support delivery delay policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support delivery delay reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/delivery-delay@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support return fixture across eligibility claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/return-policy.json"),
    generatedAt: "2026-07-15T23:50:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support return policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support return reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/return@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support replacement fixture across eligibility claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/replacement-policy.json"),
    generatedAt: "2026-07-15T23:55:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support replacement policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support replacement reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/replacement@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support address change fixture across order claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/address-change-policy.json"),
    generatedAt: "2026-07-15T23:55:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support shipping address change policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support shipping address change reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/address-change@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support warranty fixture across eligibility claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/warranty-policy.json"),
    generatedAt: "2026-07-15T23:59:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support warranty policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support warranty reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/warranty@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support accessibility fixture across accommodation claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/accessibility-policy.json"),
    generatedAt: "2026-07-15T23:59:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support accessibility policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support accessibility reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "unsupported",
    "needs_review",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/accessibility@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support gift card fixture across redemption claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/gift-card-policy.json"),
    generatedAt: "2026-07-15T23:59:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support gift card policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support gift card reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/gift-card@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support order tracking fixture across delivery claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/order-tracking-policy.json"),
    generatedAt: "2026-07-16T00:05:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support order tracking policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support order tracking reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support account suspension fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/account-suspension-policy.json"),
    generatedAt: "2026-07-15T17:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support account suspension policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support account suspension reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "contradicted",
    "verified",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/account-suspension@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped inline support incident communication fixture across policy claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/incident-communication-policy.json"),
    generatedAt: "2026-07-15T21:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support incident communication policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support incident communication reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 0,
    unsupported: 1,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "needs_review",
    "unsupported",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/incident-communication@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped support service outage fixture across incident claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/service-outage-policy.json"),
    generatedAt: "2026-07-15T23:59:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support service outage policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support service outage reviewer packet");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "contradicted",
    "needs_review",
    "verified",
  ]);
  assert.equal(scorecard.report.sources[0]?.id, "support/service-outage@2026-07-15");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates shipped HTML fixture files for exported help-center style coverage", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/html-billing-policy.json"),
    generatedAt: "2026-07-09T16:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support billing HTML example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support billing reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Support Billing Draft Customers can request billing credits for duplicate charges within 7 days. Annual plan refunds...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["verified", "contradicted", "unsupported"],
  );
});

test("evaluates a shipped fixture that discovers approved sources from a directory", async () => {
  const fixturePath = resolve("examples/evaluations/support/source-directory-policy.json");
  const scorecard = await evaluateFixtureFile({
    fixturePath,
    generatedAt: "2026-07-12T17:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support source directory example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support source directory reviewer packet");
  assert.deepEqual(scorecard.sourceDirs, [resolve("examples/sources")]);
  assert.deepEqual(scorecard.sourcePaths, [
    resolve("examples/sources/hr-leave-policy.md"),
    resolve("examples/sources/hr-payroll-policy.md"),
    resolve("examples/sources/hr-policy.md"),
    resolve("examples/sources/hr-policy.pdf"),
    resolve("examples/sources/hr-time-off-policy.md"),
    resolve("examples/sources/support-account-merge-policy.md"),
    resolve("examples/sources/support-account-suspension-policy.md"),
    resolve("examples/sources/support-billing-policy.html"),
    resolve("examples/sources/support-plan-change-policy.md"),
    resolve("examples/sources/support-playbook.md"),
    resolve("examples/sources/support-priority-policy.md"),
    resolve("examples/sources/support-refunds-policy.md"),
    resolve("examples/sources/support-service-outage-policy.md"),
    resolve("examples/sources/support-shipping-protection-policy.md"),
    resolve("examples/sources/support-usage-limits-policy.md"),
    resolve("examples/sources/support-workspace-access-policy.md"),
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("evaluates shipped PDF fixture files for document-export coverage", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/pdf-policy.json"),
    generatedAt: "2026-07-09T22:45:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR PDF policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR PDF reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Employees receive 18 weeks of paid parental leave. Full-time employees receive 20 days of paid vacation each calendar...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.deepEqual(scorecard.sourcePaths, [resolve("examples/sources/hr-policy.pdf")]);
  assert.equal(scorecard.report.sources[0]?.title, "HR Benefits Policy PDF");
  assert.equal(scorecard.report.sources[0]?.updatedAt, "2026-06-15T09:30:00-04:00");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["contradicted", "verified", "unsupported"],
  );
});

test("evaluates one in-memory fixture file relative to its fixture path", async () => {
  const fixturePath = resolve("examples/evaluations/hr-policy.json");
  const fixtureContent = await loadEvaluationFixture(fixturePath);
  const scorecard = await evaluateFixtureContent({
    fixturePath,
    content: JSON.stringify(fixtureContent),
    generatedAt: "2026-07-05T10:06:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.fixturePath, fixturePath);
  assert.equal(scorecard.answerLabel, "HR reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Employees receive 18 weeks of paid parental leave. Full-time employees receive 20 days of paid vacation each calendar...",
  );
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.report.generatedAt, "2026-07-05T10:06:00.000Z");
});

test("resolves fixture paths from nested directories in stable order", async () => {
  const fixturePaths = await resolveEvaluationFixturePaths(
    [resolve("examples/evaluations/hr-policy.json")],
    [resolve("examples/evaluations")],
  );

  assert.deepEqual(fixturePaths, [
    resolve("examples/evaluations/hr-policy.json"),
    resolve("examples/evaluations/empty-answer.json"),
    resolve("examples/evaluations/hr/benefits-enrollment-policy.json"),
    resolve("examples/evaluations/hr/bereavement-leave-policy.json"),
    resolve("examples/evaluations/hr/bonus-eligibility-policy.json"),
      resolve("examples/evaluations/hr/compensation-policy.json"),
      resolve("examples/evaluations/hr/dependent-benefits-policy.json"),
      resolve("examples/evaluations/hr/employee-referral-policy.json"),
      resolve("examples/evaluations/hr/expense-reimbursement-policy.json"),
      resolve("examples/evaluations/hr/jury-duty-policy.json"),
      resolve("examples/evaluations/hr/leave-carryover-policy.json"),
    resolve("examples/evaluations/hr/leave-policy.json"),
    resolve("examples/evaluations/hr/medical-leave-policy.json"),
    resolve("examples/evaluations/hr/offboarding-policy.json"),
    resolve("examples/evaluations/hr/onboarding-policy.json"),
    resolve("examples/evaluations/hr/parental-leave-policy.json"),
    resolve("examples/evaluations/hr/payroll-policy.json"),
    resolve("examples/evaluations/hr/pdf-policy.json"),
    resolve("examples/evaluations/hr/performance-review-policy.json"),
    resolve("examples/evaluations/hr/professional-development-policy.json"),
    resolve("examples/evaluations/hr/relocation-policy.json"),
    resolve("examples/evaluations/hr/remote-work-policy.json"),
    resolve("examples/evaluations/hr/sabbatical-leave-policy.json"),
    resolve("examples/evaluations/hr/source-directory-policy.json"),
    resolve("examples/evaluations/hr/time-off-policy.json"),
    resolve("examples/evaluations/hr/travel-reimbursement-policy.json"),
    resolve("examples/evaluations/hr/tuition-reimbursement-policy.json"),
    resolve("examples/evaluations/hr/workplace-accommodation-policy.json"),
    resolve("examples/evaluations/support-policy.json"),
    resolve("examples/evaluations/support/accessibility-policy.json"),
    resolve("examples/evaluations/support/account-closure-policy.json"),
    resolve("examples/evaluations/support/account-merge-policy.json"),
    resolve("examples/evaluations/support/account-recovery-policy.json"),
    resolve("examples/evaluations/support/account-security-policy.json"),
    resolve("examples/evaluations/support/account-suspension-policy.json"),
    resolve("examples/evaluations/support/address-change-policy.json"),
    resolve("examples/evaluations/support/authentication-device-policy.json"),
    resolve("examples/evaluations/support/authorized-contact-policy.json"),
    resolve("examples/evaluations/support/billing-address-policy.json"),
    resolve("examples/evaluations/support/billing-suspension-policy.json"),
    resolve("examples/evaluations/support/cancellation-policy.json"),
    resolve("examples/evaluations/support/charge-dispute-policy.json"),
    resolve("examples/evaluations/support/contact-change-policy.json"),
    resolve("examples/evaluations/support/data-export-policy.json"),
    resolve("examples/evaluations/support/data-retention-policy.json"),
    resolve("examples/evaluations/support/delivery-delay-policy.json"),
    resolve("examples/evaluations/support/escalation-policy.json"),
    resolve("examples/evaluations/support/gift-card-policy.json"),
    resolve("examples/evaluations/support/guest-access-policy.json"),
    resolve("examples/evaluations/support/holiday-hours-policy.json"),
    resolve("examples/evaluations/support/html-billing-policy.json"),
    resolve("examples/evaluations/support/incident-communication-policy.json"),
    resolve("examples/evaluations/support/invoice-correction-policy.json"),
    resolve("examples/evaluations/support/live-chat-policy.json"),
    resolve("examples/evaluations/support/order-cancellation-policy.json"),
    resolve("examples/evaluations/support/order-tracking-policy.json"),
    resolve("examples/evaluations/support/password-reset-policy.json"),
    resolve("examples/evaluations/support/payment-failure-policy.json"),
    resolve("examples/evaluations/support/payment-method-policy.json"),
    resolve("examples/evaluations/support/plan-change-policy.json"),
    resolve("examples/evaluations/support/priority-support-policy.json"),
    resolve("examples/evaluations/support/refund-status-policy.json"),
    resolve("examples/evaluations/support/refunds-policy.json"),
    resolve("examples/evaluations/support/replacement-policy.json"),
    resolve("examples/evaluations/support/return-policy.json"),
      resolve("examples/evaluations/support/service-credit-policy.json"),
      resolve("examples/evaluations/support/service-outage-policy.json"),
      resolve("examples/evaluations/support/shipping-protection-policy.json"),
      resolve("examples/evaluations/support/sla-policy.json"),
    resolve("examples/evaluations/support/source-directory-policy.json"),
    resolve("examples/evaluations/support/subscription-pause-policy.json"),
    resolve("examples/evaluations/support/subscription-renewal-policy.json"),
    resolve("examples/evaluations/support/tax-exemption-policy.json"),
    resolve("examples/evaluations/support/usage-limits-policy.json"),
    resolve("examples/evaluations/support/warranty-policy.json"),
    resolve("examples/evaluations/support/workspace-access-policy.json"),
  ]);
});

test("scores an empty-answer fixture as a matching zero-claim scorecard", async () => {
  const scorecard = await evaluateFixtureFile(
    resolve("examples/evaluations/empty-answer.json"),
    { generatedAt: "2026-07-12T03:00:00.000Z" },
  );

  assert.equal(scorecard.fixtureName, "Empty answer example");
  assert.equal(scorecard.answerLabel, "Support empty draft");
  assert.equal(scorecard.answerHasClaims, false);
  assert.deepEqual(scorecard.actualSummary, {
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  });
  assert.equal(scorecard.summaryMatches, true);
  assert.deepEqual(scorecard.claims, []);
  assert.equal(scorecard.matchedClaims, 0);
  assert.equal(scorecard.totalExpectedClaims, 0);
  assert.equal(scorecard.score, 1);
});

test("evaluates a shipped HR sabbatical leave fixture across leave claims", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/sabbatical-leave-policy.json"),
    generatedAt: "2026-07-17T01:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR sabbatical leave policy example");
  assert.equal(scorecard.domain, "hr");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), [
    "verified",
    "contradicted",
    "unsupported",
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates fixture files from explicit paths and fixture directories", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixturePaths: [resolve("examples/evaluations/hr-policy.json")],
    fixtureDirPaths: [resolve("examples/evaluations")],
    generatedAt: "2026-07-05T10:07:00.000Z",
  });

  assert.equal(scorecards.length, 76);
  assert.deepEqual(
    scorecards.map((scorecard) => scorecard.fixtureName),
    [
      "HR policy example",
      "Empty answer example",
      "HR benefits enrollment policy example",
      "HR bereavement leave policy example",
      "HR bonus eligibility policy example",
      "HR compensation review policy example",
      "HR dependent benefits policy example",
      "HR employee referral policy example",
      "HR expense reimbursement policy example",
      "HR jury duty policy example",
      "HR leave carryover policy example",
      "HR leave policy example",
      "HR medical leave policy example",
      "HR offboarding policy example",
      "HR onboarding policy example",
      "HR parental leave policy example",
      "HR payroll change policy example",
      "HR PDF policy example",
      "HR performance review policy example",
      "HR professional development policy example",
      "HR relocation policy example",
      "HR remote work policy example",
      "HR sabbatical leave policy example",
      "HR source directory policy example",
      "HR time-off request policy example",
      "HR travel reimbursement policy example",
      "HR tuition reimbursement policy example",
      "HR workplace accommodation policy example",
      "Support policy example",
      "Support accessibility policy example",
      "Support account closure policy example",
      "Support account merge policy example",
      "Support account recovery policy example",
      "Support account policy example",
      "Support account suspension policy example",
      "Support shipping address change policy example",
      "Support authentication device policy example",
      "Support authorized contact policy example",
      "Support billing address policy example",
      "Support billing suspension appeal policy example",
      "Support subscription cancellation policy example",
      "Support charge dispute policy example",
      "Support account contact change policy example",
      "Support data export policy example",
      "Support data retention policy example",
      "Support delivery delay policy example",
      "Support escalation policy example",
      "Support gift card policy example",
      "Support guest access policy example",
      "Support holiday hours policy example",
      "Support billing HTML example",
      "Support incident communication policy example",
      "Support invoice correction policy example",
      "Support live chat policy example",
      "Support order cancellation policy example",
      "Support order tracking policy example",
      "Support password reset policy example",
      "Support payment failure policy example",
      "Support payment method policy example",
      "Support plan change policy example",
      "Support priority support policy example",
      "Support refund status policy example",
      "Support refunds policy example",
      "Support replacement policy example",
      "Support return policy example",
      "Support service credit policy example",
      "Support service outage policy example",
      "Support shipping protection policy example",
      "Support SLA policy example",
      "Support source directory example",
      "Support subscription pause policy example",
      "Support subscription renewal policy example",
      "Support tax exemption policy example",
      "Support usage limits policy example",
      "Support warranty policy example",
      "Support workspace access policy example",
    ],
  );
  assert.ok(
    scorecards.every(
      (scorecard) => scorecard.report.generatedAt === "2026-07-05T10:07:00.000Z",
    ),
  );

  assert.ok(
    scorecards.every((scorecard) => {
      const sourceIds = scorecard.report.sources.map((source) => source.id);
      return new Set(sourceIds).size === sourceIds.length;
    }),
  );
});

test("filters evaluation fixture files by domain", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixtureDirPaths: [resolve("examples/evaluations")],
    fixturePaths: [],
    domains: ["hr"],
    generatedAt: "2026-07-09T20:20:00.000Z",
  });

  assert.equal(scorecards.length, 27);
  assert.deepEqual(
    scorecards.map((scorecard) => scorecard.fixtureName),
    [
      "HR policy example",
      "HR benefits enrollment policy example",
      "HR bereavement leave policy example",
      "HR bonus eligibility policy example",
      "HR compensation review policy example",
      "HR dependent benefits policy example",
      "HR employee referral policy example",
      "HR expense reimbursement policy example",
      "HR jury duty policy example",
      "HR leave carryover policy example",
      "HR leave policy example",
      "HR medical leave policy example",
      "HR offboarding policy example",
      "HR onboarding policy example",
      "HR parental leave policy example",
      "HR payroll change policy example",
      "HR PDF policy example",
      "HR performance review policy example",
      "HR professional development policy example",
      "HR relocation policy example",
      "HR remote work policy example",
      "HR sabbatical leave policy example",
      "HR source directory policy example",
      "HR time-off request policy example",
      "HR travel reimbursement policy example",
      "HR tuition reimbursement policy example",
      "HR workplace accommodation policy example",
    ],
  );
  assert.ok(scorecards.every((scorecard) => scorecard.domain === "hr"));
});

test("filters the support evaluation fixture set by domain", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixtureDirPaths: [resolve("examples/evaluations")],
    fixturePaths: [],
    domains: ["support"],
    generatedAt: "2026-07-17T06:00:00.000Z",
  });

  assert.equal(scorecards.length, 49);
  assert.ok(scorecards.every((scorecard) => scorecard.domain === "support"));
});

test("reports when domain filters match no evaluation fixtures", async () => {
  await assert.rejects(
    evaluateFixtureFiles({
      fixtureDirPaths: [resolve("examples/evaluations")],
      fixturePaths: [],
      domains: ["finance"],
    }),
    /No evaluation fixtures matched domain filter: finance/,
  );
});

test("evaluates fixture sources discovered from source directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-eval-source-dirs-"));

  try {
    const answersDir = join(tempDir, "answers");
    const sourcesDir = join(tempDir, "sources");
    const fixtureDir = join(tempDir, "fixtures");
    const answerPath = join(answersDir, "support-answer.md");
    const sourcePath = join(sourcesDir, "support-playbook.md");
    const fixturePath = join(fixtureDir, "support-policy.json");

    await Promise.all([
      mkdir(answersDir, { recursive: true }),
      mkdir(sourcesDir, { recursive: true }),
      mkdir(fixtureDir, { recursive: true }),
    ]);

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
      writeFile(
        fixturePath,
        JSON.stringify(
          {
            name: "Support policy from source directory",
            answerPath: "../answers/support-answer.md",
            answerLabel: "Support escalation fixture",
            sourceDirs: ["../sources"],
            expectedSummary: {
              verified: 1,
              contradicted: 0,
              unsupported: 0,
              needs_review: 0,
            },
            expectedClaimVerdicts: ["verified"],
          },
          null,
          2,
        ),
        "utf8",
      ),
    ]);

    const scorecard = await evaluateFixtureFile(fixturePath, {
      generatedAt: "2026-07-06T14:00:00.000Z",
    });

    assert.equal(scorecard.fixtureName, "Support policy from source directory");
    assert.equal(scorecard.answerLabel, "Support escalation fixture");
    assert.deepEqual(scorecard.sourceDirs, [sourcesDir]);
    assert.deepEqual(scorecard.sourcePaths, [sourcePath]);
    assert.equal(scorecard.summaryMatches, true);
    assert.equal(scorecard.matchedClaims, 1);
    assert.equal(scorecard.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluates inline fixture answers and sources without reading answer files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-eval-inline-"));
  const fixturePath = join(tempDir, "fixtures", "hr-inline.json");

  try {
    await mkdir(join(tempDir, "fixtures"), { recursive: true });

    const scorecard = await evaluateFixture(
      {
        name: "Inline HR fixture",
        answerPath: "../answers/hr-inline.md",
        answer: "Employees receive 12 weeks of paid parental leave.\n",
        answerLabel: "HR API reviewer packet",
        sources: [
          {
            sourcePath: "../sources/hr-policy.md",
            id: "people-ops/hr-policy@2026-07-08",
            title: "HR Policy",
            trustLevel: "high",
            content: "Employees receive 12 weeks of paid parental leave.\n",
          },
        ],
        expectedSummary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
        expectedClaimVerdicts: ["verified"],
      },
      {
        baseDir: join(tempDir, "fixtures"),
        fixturePath,
        generatedAt: "2026-07-08T04:00:00.000Z",
      },
    );

    assert.equal(scorecard.fixturePath, fixturePath);
    assert.equal(scorecard.answerPath, join(tempDir, "answers", "hr-inline.md"));
    assert.equal(scorecard.answerLabel, "HR API reviewer packet");
    assert.deepEqual(scorecard.sourcePaths, [join(tempDir, "sources", "hr-policy.md")]);
    assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-policy@2026-07-08");
    assert.equal(
      scorecard.report.assessments[0]?.evidence[0]?.documentId,
      "people-ops/hr-policy@2026-07-08",
    );
    assert.equal(scorecard.report.sources[0]?.title, "HR Policy");
    assert.equal(scorecard.summaryMatches, true);
    assert.equal(scorecard.matchedClaims, 1);
    assert.equal(scorecard.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects invalid evaluation fixture content with a clear validation error", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Broken fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: "nope",
          },
        }),
      ),
    /Evaluation fixture\.expectedSummary\.needs_review must be a non-negative integer\./,
  );
});

test("rejects unknown evaluation summary fields instead of silently ignoring them", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Broken fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
            needsReview: 1,
          },
        }),
      ),
    /Evaluation fixture\.expectedSummary\.needsReview is not a supported verdict summary field\./,
  );
});

test("rejects unknown top-level evaluation fixture fields instead of silently ignoring them", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Broken fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdict: ["verified"],
        }),
      ),
    /Evaluation fixture\.expectedClaimVerdict is not a supported fixture field\./,
  );
});

test("rejects evaluation fixtures when claim verdict expectations do not match summary totals", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Broken fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 2,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        }),
      ),
    /Evaluation fixture\.expectedClaimVerdicts must include 2 entries to match the totals in Evaluation fixture\.expectedSummary\./,
  );
});

test("rejects evaluation fixtures when claim verdict counts disagree with summary totals", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Contradictory fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 1,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified", "verified"],
        }),
      ),
    /Evaluation fixture\.expectedClaimVerdicts counts must match the totals in Evaluation fixture\.expectedSummary\./,
  );
});

test("renders mismatch details in evaluation scorecards", () => {
  const rendered = renderEvaluationScorecard({
    fixtureName: "Mismatch fixture",
    domain: "hr",
    answerPath: "/tmp/answer.md",
    answerLabel: "HR escalation packet",
    answerPreview: "Benefits begin on day one.",
    sourceDirs: ["/tmp/source-bundle"],
    sourcePaths: ["/tmp/source.md"],
    report: {
      generatedAt: "2026-07-05T10:10:00.000Z",
      answerPath: "/tmp/answer.md",
      answerLabel: "answer",
      answerPreview: "Preview",
      answer: "Answer text",
      sources: [
        {
          id: "people-ops/hr-policy@2026-07-08",
          sourcePath: "/tmp/sources/hr-policy.md",
          title: "HR Policy",
          trustLevel: "high" as const,
        },
      ],
      assessments: [],
      summary: {
        verified: 0,
        contradicted: 1,
        unsupported: 0,
        needs_review: 0,
      },
    },
    expectedSummary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    },
    actualSummary: {
      verified: 0,
      contradicted: 1,
      unsupported: 0,
      needs_review: 0,
    },
    summaryMatches: false,
    claims: [
      {
        index: 0,
        claimText: "Benefits begin on day one.",
        actualVerdict: "contradicted",
        expectedVerdict: "verified",
        matches: false,
      },
    ],
    matchedClaims: 0,
    totalExpectedClaims: 1,
    score: 0,
  });

  assert.match(rendered, /Summary match: no/);
  assert.match(rendered, /Domain: hr/);
  assert.match(rendered, /Answer label: HR escalation packet/);
  assert.match(rendered, /Answer preview: Benefits begin on day one\./);
  assert.match(rendered, /Source directories: \/tmp\/source-bundle/);
  assert.match(rendered, /Source IDs: people-ops\/hr-policy@2026-07-08/);
  assert.match(rendered, /Claim mismatches:/);
  assert.match(rendered, /expected verified, got contradicted/);
});

test("fails closed when a scorecard has summary or claim-count drift", () => {
  const scorecard = {
    summaryMatches: true,
    matchedClaims: 2,
    totalExpectedClaims: 2,
  } as Parameters<typeof hasEvaluationMismatch>[0];

  assert.equal(hasEvaluationMismatch(scorecard), false);
  scorecard.summaryMatches = false;
  assert.equal(hasEvaluationMismatch(scorecard), true);
  scorecard.summaryMatches = true;
  scorecard.totalExpectedClaims = 3;
  assert.equal(hasEvaluationMismatch(scorecard), true);
});

test("renders evaluation text report totals and mismatch detection", () => {
  const scorecards = [
    {
      fixtureName: "Match fixture",
      domain: "support",
      answerPath: "/tmp/answer-1.md",
      answerLabel: "answer-1",
      answerPreview: "Preview 1",
      sourceDirs: [],
      sourcePaths: ["/tmp/source-1.md"],
      report: {
        generatedAt: "2026-07-05T10:15:00.000Z",
        answerPath: "/tmp/answer-1.md",
        answerLabel: "answer-1",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [
          {
            id: "support/refunds@2026-07-08",
            sourcePath: "/tmp/sources/support.md",
            title: "Support Policy",
            trustLevel: "high" as const,
          },
        ],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 0,
      score: 1,
    },
    {
      fixtureName: "Mismatch fixture",
      domain: "hr",
      answerPath: "/tmp/answer-2.md",
      answerLabel: "answer-2",
      answerPreview: "Preview 2",
      sourceDirs: [],
      sourcePaths: ["/tmp/source-2.md"],
      report: {
        generatedAt: "2026-07-05T10:16:00.000Z",
        answerPath: "/tmp/answer-2.md",
        answerLabel: "answer-2",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 0,
          contradicted: 1,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 0,
        contradicted: 1,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: false,
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 1,
      score: 0,
    },
  ];

  const rendered = renderEvaluationTextReport(scorecards);

  assert.equal(hasEvaluationMismatch(scorecards[0]), false);
  assert.equal(hasEvaluationMismatch(scorecards[1]), true);
  assert.match(rendered, /Quorum Evaluation Report/);
  assert.match(rendered, /Generated at: 2026-07-05T10:15:00.000Z/);
  assert.match(rendered, /Generated at: 2026-07-05T10:16:00.000Z/);
  assert.match(rendered, /Fixtures: 2/);
  assert.match(rendered, /Fixtures with mismatches: 1/);
  assert.match(rendered, /Matched claim verdicts: 0\/1/);
  assert.match(rendered, /Overall claim verdict score: 0%/);
  assert.match(rendered, /Domain rollups:/);
  assert.match(rendered, /- hr: 1 fixture, 0 with claims, 1 without claims, 1 mismatch \(100%\), 0\/1 matched \(0%\)/);
  assert.match(rendered, /- support: 1 fixture, 0 with claims, 1 without claims, 0 mismatches \(0%\), 0\/0 matched \(n\/a\)/);
});

test("renders evaluation summary csv rows for each fixture", () => {
  const rendered = renderEvaluationSummaryCsv([
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: ["/tmp/sources"],
      sourcePaths: ["/tmp/sources/support.md", "/tmp/sources/refunds.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 0,
      score: 1,
    },
  ]);

  assert.match(
    rendered,
    /^generated_at,fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,answer_has_claims,source_dirs,source_paths,source_ids,summary_match,matched_claims,total_expected_claims,score,has_mismatch,mismatch_type,first_mismatch_claim_index,first_mismatch_claim_text,first_mismatch_expected_verdict,first_mismatch_actual_verdict,first_mismatch_evidence_title,first_mismatch_evidence_trust_level,first_mismatch_evidence_updated_at,first_mismatch_evidence_source_path,first_mismatch_evidence_source_id,first_mismatch_evidence_score,first_mismatch_evidence_quote,/,
  );
  assert.match(rendered, /Support policy example/);
  assert.match(rendered, /answer_has_claims/);
  assert.match(rendered, /Support policy example,support,\/tmp\/fixtures\/support\.json/);
  assert.match(rendered, /2026-07-05T10:20:00.000Z,Support policy example,support,\/tmp\/fixtures\/support\.json,\/tmp\/answers\/support\.md,Support reviewer packet,Support answer preview,no,\/tmp\/sources,\/tmp\/sources\/support\.md \| \/tmp\/sources\/refunds\.md,,yes,0,0,1\.000,no,none,,,,,,,,,,,,1,0,0,0,1,0,0,0/);
});

test("evaluation summary csv includes first mismatched claim details", () => {
  const rendered = renderEvaluationSummaryCsv([
    {
      fixtureName: "HR mismatch example",
      fixturePath: "/tmp/fixtures/hr.json",
      answerPath: "/tmp/answers/hr.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "HR answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/hr.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/hr.md",
        answerLabel: "hr",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [
          {
            claim: {
              id: "claim_1",
              text: "Employees receive 18 weeks of paid parental leave.",
            },
            verdict: "contradicted",
            reason: "The approved policy states a different amount of leave.",
            evidence: [
              {
                documentId: "source_1",
                documentPath: "/tmp/sources/hr-policy.md",
                documentTitle: "HR Policy",
                documentTrustLevel: "high",
                documentUpdatedAt: "2026-06-01",
                quote: "Employees receive 12 weeks of paid parental leave.",
                score: 0.857,
              },
            ],
          },
        ],
        summary: {
          verified: 0,
          contradicted: 1,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 0,
        contradicted: 1,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: false,
      claims: [
        {
          index: 0,
          claimText: "Employees receive 18 weeks of paid parental leave.",
          actualVerdict: "contradicted",
          expectedVerdict: "verified",
          matches: false,
        },
      ],
      matchedClaims: 0,
      totalExpectedClaims: 1,
      score: 0,
    },
  ]);

  assert.match(
    rendered,
    /HR mismatch example,,[^,\n]+,[^,\n]+,HR reviewer packet,HR answer preview,yes,,[^,\n]+,,no,0,1,0\.000,yes,claim_verdict,1,Employees receive 18 weeks of paid parental leave\.,verified,contradicted,HR Policy,high,2026-06-01,\/tmp\/sources\/hr-policy\.md,source_1,0\.857,Employees receive 12 weeks of paid parental leave\.,1,0,0,0,0,1,0,0/,
  );
});

test("renders evaluation domain summary csv rows for each domain", () => {
  const rendered = renderEvaluationDomainSummaryCsv([
    {
      fixtureName: "HR policy example",
      domain: "hr",
      fixturePath: "/tmp/fixtures/hr.json",
      answerPath: "/tmp/answers/hr.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "HR answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/hr.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/hr.md",
        answerLabel: "hr",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 0,
          contradicted: 1,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 0,
        contradicted: 1,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: false,
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 1,
      score: 0,
    },
  ]);

  assert.equal(
    rendered,
    [
      "generated_at,domain,fixture_count,mismatch_count,mismatch_rate,answers_with_claims,answers_without_claims,matched_claims,total_expected_claims,score,score_label,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review",
      "2026-07-05T10:20:00.000Z,hr,1,0,0.000,0,1,1,1,1.000,100%,1,0,0,0,1,0,0,0",
      "2026-07-05T10:20:00.000Z,support,1,1,1.000,0,1,0,1,0.000,0%,1,0,0,0,0,1,0,0",
      "",
    ].join("\n"),
  );
});

test("renders evaluation aggregate summary csv for the full benchmark run", () => {
  const rendered = renderEvaluationAggregateSummaryCsv([
    {
      fixtureName: "HR policy example",
      domain: "hr",
      fixturePath: "/tmp/fixtures/hr.json",
      answerPath: "/tmp/answers/hr.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "HR answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/hr.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/hr.md",
        answerLabel: "hr",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 0,
          contradicted: 1,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 0,
        contradicted: 1,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: false,
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 1,
      score: 0,
    },
  ]);

  assert.equal(
    rendered,
    [
      "generated_at,fixture_count,answers_with_claims,answers_without_claims,mismatch_count,mismatch_rate,matched_claims,total_expected_claims,score,score_label,domains,domain_fixture_counts,domain_mismatch_counts,domain_mismatch_rates,domain_answers_with_claims,domain_answers_without_claims,domain_scores,domain_score_labels,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review",
      "2026-07-05T10:20:00.000Z,2,0,2,1,0.500,1,2,0.500,50%,hr | support,1 | 1,0 | 1,0.000 | 1.000,0 | 0,1 | 1,1.000 | 0.000,100% | 0%,2,0,0,0,1,1,0,0",
      "",
    ].join("\n"),
  );
});

test("renders evaluation markdown report with fixture summaries", () => {
  const rendered = renderEvaluationMarkdownReport([
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: ["/tmp/source-bundle"],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:25:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [
          {
            id: "support/refunds@2026-07-08",
            sourcePath: "/tmp/sources/support.md",
            title: "Support Policy",
            trustLevel: "high" as const,
          },
        ],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [
        {
          index: 0,
          claimText: "Refunds are available for 30 days.",
          actualVerdict: "verified",
          expectedVerdict: "verified",
          matches: true,
        },
      ],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
  ]);

  assert.match(rendered, /^# Quorum Evaluation Report/);
  assert.match(rendered, /## Summary/);
  assert.match(rendered, /- Generated at: 2026-07-05T10:25:00.000Z/);
  assert.match(rendered, /- Matched claim verdicts: 1\/1/);
  assert.match(rendered, /- Overall claim verdict score: 100%/);
  assert.match(rendered, /### Domain Rollups/);
  assert.match(rendered, /- `support`: 1 fixture, 1 with claims, 0 without claims, 0 mismatches \(0%\), 1\/1 matched \(100%\)/);
  assert.match(rendered, /### 1\. Support policy example/);
  assert.match(rendered, /- Fixture path: `\/tmp\/fixtures\/support\.json`/);
  assert.match(rendered, /- Answer label: `Support reviewer packet`/);
  assert.match(rendered, /- Answer preview: Support answer preview/);
  assert.match(rendered, /- Source directories: `\/tmp\/source-bundle`/);
  assert.match(rendered, /- Source IDs: `support\/refunds@2026-07-08`/);
  assert.match(rendered, /#### Claim Verdicts/);
  assert.match(rendered, /Claim 1: `verified` \(expected `verified`\)/);
});

test("renders evaluation html report with fixture summaries", () => {
  const rendered = renderEvaluationHtmlReport([
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: ["/tmp/source-bundle"],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:30:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [
          {
            id: "support/refunds@2026-07-08",
            sourcePath: "/tmp/sources/support.md",
            title: "Support Policy",
            trustLevel: "high" as const,
          },
        ],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
      },
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      actualSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [
        {
          index: 0,
          claimText: "Refunds are available for 30 days.",
          actualVerdict: "verified",
          expectedVerdict: "verified",
          matches: true,
        },
      ],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
  ]);

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<dt>Answer label<\/dt><dd>Support reviewer packet<\/dd>/);
  assert.match(rendered, /<dt>Answer preview<\/dt><dd>Support answer preview<\/dd>/);
  assert.match(rendered, /<dt>Source directories<\/dt><dd>\/tmp\/source-bundle<\/dd>/);
  assert.match(rendered, /<dt>Source IDs<\/dt><dd>support\/refunds@2026-07-08<\/dd>/);
  assert.match(rendered, /Fixture scorecard report/);
  assert.match(rendered, /<span>Matched Claim Verdicts<\/span>\s*<strong>1\/1<\/strong>/);
  assert.match(rendered, /<span>Overall Claim Verdict Score<\/span>\s*<strong>100%<\/strong>/);
  assert.match(rendered, /Generated at 2026-07-05T10:30:00.000Z/);
  assert.match(rendered, /Domain rollups/);
  assert.match(rendered, /1 fixture with 0 mismatches \(0%\)\./);
  assert.match(rendered, /Support policy example/);
  assert.match(rendered, /Expected summary/);
  assert.match(rendered, /Claim verdicts/);
});
