import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyAnswer } from "../src/claim-verifier.js";
import { sourceDocumentFromFile } from "../src/source-loader.js";

async function verifyExample(answerPath: string, sourcePath: string) {
  const [answer, sourceContent] = await Promise.all([
    readFile(answerPath, "utf8"),
    readFile(sourcePath),
  ]);

  return verifyAnswer(answer, [await sourceDocumentFromFile(sourcePath, sourceContent, 0)]);
}

test("HR example produces one verified, contradicted, and unsupported claim", async () => {
  const report = await verifyExample(
    "examples/answers/hr-answer.md",
    "examples/sources/hr-policy.md",
  );

  assert.deepEqual(report.summary, {
    verified: 1,
    unsupported: 1,
    contradicted: 1,
    needs_review: 0,
  });
});

test("support security example covers verification and escalation claims", async () => {
  const report = await verifyExample(
    "examples/fixtures/support-security-answer.md",
    "examples/fixtures/support-security-playbook.md",
  );

  assert.deepEqual(report.summary, {
    verified: 1,
    unsupported: 1,
    contradicted: 0,
    needs_review: 2,
  });
});

test("support example produces one verified, contradicted, and unsupported claim", async () => {
  const report = await verifyExample(
    "examples/answers/support-answer.md",
    "examples/sources/support-playbook.md",
  );

  assert.deepEqual(report.summary, {
    verified: 1,
    unsupported: 1,
    contradicted: 1,
    needs_review: 0,
  });
});

test("support HTML example produces one verified, contradicted, and unsupported claim", async () => {
  const report = await verifyExample(
    "examples/answers/support-billing-answer.html",
    "examples/sources/support-billing-policy.html",
  );

  assert.deepEqual(report.summary, {
    verified: 1,
    unsupported: 1,
    contradicted: 1,
    needs_review: 0,
  });
});

test("support refund example covers verified, contradicted, and unsupported policy claims", async () => {
  const report = await verifyExample(
    "examples/evaluations/support-refunds-answer.md",
    "examples/evaluations/support-refunds-policy.md",
  );

  assert.deepEqual(report.summary, {
    verified: 2,
    unsupported: 1,
    contradicted: 0,
    needs_review: 1,
  });
  assert.match(report.assessments[1]?.evidence[0]?.quote ?? "", /original invoice number/);
});
