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
