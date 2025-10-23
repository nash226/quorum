import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadSources,
  verifyAnswer,
  verifyAnswerBatch,
  verifyAnswerFile,
} from "../src/index.js";

test("programmatic API verifies an answer file against loaded sources", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });
    const report = await verifyAnswerFile(answerPath, sources, "2026-07-05T00:00:00.000Z");

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.generatedAt, "2026-07-05T00:00:00.000Z");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API batches file and directory answers with fail verdicts", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const explicitAnswerPath = join(tempDir, "support-answer.md");
    const directoryAnswerPath = join(answerDir, "hr-answer.md");
    const hrSourcePath = join(sourceDir, "hr-policy.md");
    const supportSourcePath = join(sourceDir, "support-policy.md");

    await mkdir(answerDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await Promise.all([
      writeFile(
        explicitAnswerPath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        directoryAnswerPath,
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        hrSourcePath,
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        supportSourcePath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
    });
    const report = await verifyAnswerBatch({
      answerPaths: [explicitAnswerPath],
      answerDirPaths: [answerDir],
      sources,
      failOn: ["contradicted"],
      generatedAt: "2026-07-05T01:00:00.000Z",
    });

    assert.equal(report.generatedAt, "2026-07-05T01:00:00.000Z");
    assert.equal(report.answerCount, 2);
    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.contradicted, 1);
    assert.equal(report.summary.answersWithFailures, 1);
    assert.deepEqual(
      report.answers.map((answer) => ({
        label: answer.answerLabel,
        shouldFail: answer.shouldFail,
      })),
      [
        { label: "support-answer", shouldFail: false },
        { label: "hr-answer", shouldFail: true },
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API still supports direct in-memory verification", () => {
  const report = verifyAnswer(
    "Benefits begin on day one of employment.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Benefits begin on day one of employment.",
      },
    ],
    "2026-07-05T02:00:00.000Z",
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(report.generatedAt, "2026-07-05T02:00:00.000Z");
});
