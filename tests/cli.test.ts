import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { createSimplePdf } from "./pdf-test-helpers.js";

test("verify applies the default trust override only to sources without metadata", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const plainSourcePath = join(tempDir, "plain-source.md");
    const metadataSourcePath = join(tempDir, "metadata-source.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        plainSourcePath,
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        metadataSourcePath,
        `---
title: Metadata Source
trustLevel: low
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      plainSourcePath,
      "--source",
      metadataSourcePath,
      "--default-trust-level",
      "high",
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; title: string; trustLevel: string }>;
    };

    assert.deepEqual(report.sources, [
      { id: "source_1", title: "plain-source", trustLevel: "high" },
      { id: "source_2", title: "Metadata Source", trustLevel: "low" },
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify rejects unsupported default trust overrides", async () => {
  await assert.rejects(
    runCli([
      "verify",
      "--answer",
      "examples/answers/hr-answer.md",
      "--source",
      "examples/sources/hr-policy.md",
      "--default-trust-level",
      "critical",
    ]),
    /Unsupported trust level: critical/,
  );
});

test("verify accepts pdf sources", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-pdf-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.pdf");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        createSimplePdf("Employees receive 12 weeks of paid parental leave."),
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; title: string; trustLevel: string }>;
      summary: Record<string, number>;
    };

    assert.deepEqual(report.sources, [
      { id: "source_1", title: "hr-policy", trustLevel: "medium" },
    ]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify reads the answer from stdin when answer is '-'", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-stdin-"));

  try {
    const sourcePath = join(tempDir, "hr-policy.md");
    await writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");

    const stdout = await runCliWithInput(
      ["verify", "--answer", "-", "--source", sourcePath, "--json"],
      "Employees receive 12 weeks of paid parental leave.\n",
    );
    const report = JSON.parse(stdout) as {
      answerPath: string;
      summary: Record<string, number>;
    };

    assert.equal(report.answerPath, "-");
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify matches claims against html sources with named entities", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-html-entities-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "refund-policy.html");

    await Promise.all([
      writeFile(
        answerPath,
        "Customers' refund requests require manager review after 30 days.\n",
        "utf8",
      ),
      writeFile(
        sourcePath,
        `<!doctype html>
<html>
  <head>
    <title>Refunds &amp; Exceptions</title>
  </head>
  <body>
    <main>
      <p>Customers&rsquo; refund requests require manager review after 30 days.</p>
    </main>
  </body>
</html>`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      summary: Record<string, number>;
      sources: Array<{ title: string }>;
    };

    assert.deepEqual(report.sources.map((source) => source.title), ["Refunds & Exceptions"]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify records the answer path in JSON and reviewer csv outputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-review-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--review-csv-out",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerPath?: string;
      summary: Record<string, number>;
    };

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.summary.verified, 1);

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = reviewCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(
      lines[1] ?? "",
      new RegExp(
        `^${escapeRegExp(answerPath)},Employees receive 12 weeks of paid parental leave\\.,clear,,claim_1,`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify writes reviewer csv fail-policy columns for single answers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-review-fail-policy-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 18 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    await assert.rejects(
      runCli([
        "verify",
        "--answer",
        answerPath,
        "--source",
        sourcePath,
        "--review-csv-out",
        reviewCsvOutPath,
        "--fail-on",
        "contradicted",
      ]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /CLI exited with code 2/);
        return true;
      },
    );

    const reviewCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = reviewCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(
      lines[1] ?? "",
      new RegExp(
        `^${escapeRegExp(answerPath)},Employees receive 18 weeks of paid parental leave\\.,matched,contradicted,claim_1,`,
      ),
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify threads fail-policy context into single-answer text, markdown, and html reports", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-single-fail-policy-reports-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "hr-policy.md");
    const markdownOutPath = join(tempDir, "reports", "review.md");
    const htmlOutPath = join(tempDir, "reports", "review.html");

    await Promise.all([
      writeFile(answerPath, "Employees receive 18 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await runCliAllowFailure([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--markdown-out",
      markdownOutPath,
      "--html-out",
      htmlOutPath,
      "--fail-on",
      "contradicted",
    ]);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, /Fail policy: matched/);
    assert.match(result.stdout, /Fail verdicts: contradicted/);

    const [markdownReport, htmlReport] = await Promise.all([
      readFile(markdownOutPath, "utf8"),
      readFile(htmlOutPath, "utf8"),
    ]);

    assert.match(markdownReport, /- Fail policy: matched \(contradicted\)/);
    assert.match(htmlReport, /<span>Fail policy<\/span>\s*<strong>matched \(contradicted\)<\/strong>/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch returns an aggregate report for each answer file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const batchOutPath = join(tempDir, "reports", "batch-report.json");
    const batchMarkdownOutPath = join(tempDir, "reports", "batch-report.md");
    const batchHtmlOutPath = join(tempDir, "reports", "batch-report.html");
    const batchReviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");
    const batchSummaryCsvOutPath = join(tempDir, "reports", "batch-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(answerDir, "hr.md"), "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(join(answerDir, "support.txt"), "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--out",
      batchOutPath,
      "--markdown-out",
      batchMarkdownOutPath,
      "--html-out",
      batchHtmlOutPath,
      "--review-csv-out",
      batchReviewCsvOutPath,
      "--summary-csv-out",
      batchSummaryCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      sourceCount: number;
      sources: Array<{ id: string; title: string; trustLevel: string }>;
      answers: Array<{
        answerLabel: string;
        answerPath: string;
        shouldFail: boolean;
        failVerdicts: string[];
        report: { summary: Record<string, number> };
      }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 2);
    assert.equal(report.sourceCount, 2);
    assert.deepEqual(report.sources, [
      { id: "source_1", title: "hr-policy", trustLevel: "medium" },
      { id: "source_2", title: "support-playbook", trustLevel: "medium" },
    ]);
    assert.equal(report.answers.length, 2);
    assert.deepEqual(
      report.answers.map((answer) => answer.answerPath).sort(),
      [join(answerDir, "hr.md"), join(answerDir, "support.txt")],
    );
    assert.deepEqual(
      report.answers.map((answer) => answer.answerLabel).sort(),
      ["hr", "support"],
    );
    assert.deepEqual(report.answers.map((answer) => answer.failVerdicts), [[], []]);
    assert.equal(report.summary.verified, 2);
    assert.equal(report.summary.answersWithFailures, 0);

    const savedReport = JSON.parse(await readFile(batchOutPath, "utf8")) as typeof report;
    assert.equal(savedReport.answerCount, 2);
    assert.match(await readFile(batchMarkdownOutPath, "utf8"), /# Quorum Batch Verification Report/);
    assert.match(await readFile(batchMarkdownOutPath, "utf8"), /- Answer preview: Employees receive 12 weeks of paid parental leave\./);
    assert.match(await readFile(batchHtmlOutPath, "utf8"), /<title>Quorum Batch Verification Report<\/title>/);
    assert.match(await readFile(batchHtmlOutPath, "utf8"), /Answer preview/);
    assert.match(
      await readFile(batchReviewCsvOutPath, "utf8"),
      /answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes/,
    );
    assert.match(
      await readFile(batchSummaryCsvOutPath, "utf8"),
      /answer_label,answer_path,answer_preview,primary_verdict,primary_claim,primary_reason,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts,source_titles,source_trust_levels,source_updated_at/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch accepts repeated answer files alongside answer directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-mixed-inputs-"));

  try {
    const answerDir = join(tempDir, "answers");
    const nestedAnswerDir = join(answerDir, "nested");
    const sourceDir = join(tempDir, "sources");
    const directAnswerPath = join(tempDir, "priority-answer.md");
    const nestedAnswerPath = join(nestedAnswerDir, "support.txt");

    await Promise.all([
      mkdir(nestedAnswerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(directAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(nestedAnswerPath, "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      directAnswerPath,
      "--answer-dir",
      answerDir,
      "--answer",
      nestedAnswerPath,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      answers: Array<{ answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 2);
    assert.deepEqual(report.answers.map((answer) => answer.answerPath), [
      directAnswerPath,
      nestedAnswerPath,
    ]);
    assert.equal(report.summary.verified, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch disambiguates duplicate answer labels across directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-duplicate-labels-"));

  try {
    const answerDir = join(tempDir, "answers");
    const hrDir = join(answerDir, "hr");
    const supportDir = join(answerDir, "support");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(hrDir, { recursive: true }),
      mkdir(supportDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(hrDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(join(supportDir, "policy.md"), "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-policy.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answers: Array<{ answerLabel: string; answerPath: string }>;
    };

    assert.deepEqual(
      report.answers.map((answer) => answer.answerLabel),
      ["hr/policy", "support/policy"],
    );
    assert.deepEqual(
      report.answers.map((answer) => answer.answerPath),
      [join(hrDir, "policy.md"), join(supportDir, "policy.md")],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify preserves explicit source order ahead of directory-discovered files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-source-order-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const firstSourcePath = join(tempDir, "first.md");
    const secondSourcePath = join(tempDir, "second.md");
    const directorySourcePath = join(sourceDir, "directory.md");

    await mkdir(sourceDir, { recursive: true });

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        firstSourcePath,
        `---
title: First Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
      writeFile(
        secondSourcePath,
        `---
title: Second Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
      writeFile(
        directorySourcePath,
        `---
title: Directory Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      secondSourcePath,
      "--source-dir",
      sourceDir,
      "--source",
      firstSourcePath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; title: string; trustLevel: string }>;
      assessments: Array<{
        evidence: Array<{ documentId: string; documentTitle: string }>;
      }>;
    };

    assert.deepEqual(report.sources, [
      { id: "source_1", title: "Second Source", trustLevel: "medium" },
      { id: "source_2", title: "First Source", trustLevel: "medium" },
      { id: "source_3", title: "Directory Source", trustLevel: "medium" },
    ]);
    assert.equal(report.assessments[0]?.evidence[0]?.documentId, "source_1");
    assert.equal(report.assessments[0]?.evidence[0]?.documentTitle, "Second Source");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify dedupes repeated source files that use different path spellings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-source-dedupe-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const sourcePath = join(sourceDir, "shared.md");
    const explicitSourcePath = `${sourceDir}/./shared.md`;

    await mkdir(sourceDir, { recursive: true });

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: Shared Source
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      explicitSourcePath,
      "--source-dir",
      resolve(sourceDir),
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      sources: Array<{ id: string; title: string; trustLevel: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.sources.length, 1);
    assert.deepEqual(report.sources, [
      { id: "source_1", title: "Shared Source", trustLevel: "medium" },
    ]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch preserves explicit answer order ahead of directory-discovered files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-order-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const secondAnswerPath = join(tempDir, "second.md");
    const firstAnswerPath = join(tempDir, "first.md");
    const directoryAnswerPath = join(answerDir, "directory.md");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(firstAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(secondAnswerPath, "Refunds are available within 30 days of purchase.\n", "utf8"),
      writeFile(directoryAnswerPath, "Healthcare coverage begins after 30 days of employment.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\nHealthcare coverage begins after 30 days of employment.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "support-playbook.md"),
        "Refunds are available within 30 days of purchase.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      secondAnswerPath,
      "--answer",
      firstAnswerPath,
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answers: Array<{ answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.deepEqual(report.answers.map((answer) => answer.answerPath), [
      secondAnswerPath,
      firstAnswerPath,
      directoryAnswerPath,
    ]);
    assert.equal(report.summary.verified, 3);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch dedupes repeated answer files that use different path spellings", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-answer-dedupe-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const answerPath = join(answerDir, "shared.md");
    const explicitAnswerPath = `${answerDir}/./shared.md`;

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer",
      explicitAnswerPath,
      "--answer-dir",
      resolve(answerDir),
      "--source-dir",
      sourceDir,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      answerCount: number;
      answers: Array<{ answerPath: string }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 1);
    assert.deepEqual(report.answers.map((answer) => answer.answerPath), [explicitAnswerPath]);
    assert.equal(report.summary.verified, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch exits non-zero when a fail-on verdict appears in any answer", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-fail-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    await assert.rejects(
      runCli([
        "verify-batch",
        "--answer-dir",
        answerDir,
        "--source-dir",
        sourceDir,
        "--fail-on",
        "contradicted",
        "--json",
      ]),
      /CLI exited with code 2/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch reports matching fail verdicts in json and summary csv output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-fail-verdicts-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const batchSummaryCsvOutPath = join(tempDir, "reports", "batch-summary.csv");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const result = await runCliAllowFailure([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
      "--summary-csv-out",
      batchSummaryCsvOutPath,
      "--fail-on",
      "contradicted",
      "--fail-on",
      "unsupported",
      "--json",
    ]);

    assert.equal(result.code, 2);

    const report = JSON.parse(result.stdout) as {
      answers: Array<{ shouldFail: boolean; failVerdicts: string[] }>;
    };

    assert.equal(report.answers[0]?.shouldFail, true);
    assert.deepEqual(report.answers[0]?.failVerdicts, ["contradicted", "unsupported"]);

    assert.match(
      await readFile(batchSummaryCsvOutPath, "utf8"),
      /hr,.*hr\.md,Employees receive 18 weeks of paid parental leave\. Employees receive free catered lunch every day\.,contradicted,Employees receive 18 weeks of paid parental leave\.,A closely matching approved source uses different numeric terms\.,hr-policy,medium,,2,0,1,1,0,matched,contradicted \| unsupported,hr-policy,medium,/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch prints claim-level details in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
    ]);

    assert.match(stdout, /Quorum Batch Verification Report/);
    assert.match(stdout, /Sources:\n- hr-policy \(medium trust\)/);
    assert.match(stdout, /Summary: 0 verified, 1 contradicted, 1 unsupported, 0 needs review/);
    assert.match(stdout, /Fail policy: clear/);
    assert.match(stdout, /Fail verdicts: none/);
    assert.match(stdout, /Answer preview: Employees receive 18 weeks of paid parental leave\. Employees receive free catered lunch every day\./);
    assert.match(stdout, /Primary finding: contradicted/);
    assert.match(stdout, /Primary claim: Employees receive 18 weeks of paid parental leave\./);
    assert.match(stdout, /Primary evidence: hr-policy/);
    assert.match(stdout, /CONTRADICTED  Employees receive 18 weeks of paid parental leave\./);
    assert.match(stdout, /UNSUPPORTED  Employees receive free catered lunch every day\./);
    assert.match(stdout, /Evidence \(hr-policy, medium trust, score /);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch truncates long answer previews in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-preview-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        join(answerDir, "long.md"),
        `Employees receive 12 weeks of paid parental leave.

Managers approve travel within five business days, and international trips require finance review before booking.
`,
        "utf8",
      ),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
    ]);

    assert.match(
      stdout,
      /Answer preview: Employees receive 12 weeks of paid parental leave\. Managers approve travel within five business days, and internation\.\.\./,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch prints an explicit empty state in the default text output", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-empty-text-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(sourceDir, "hr-policy.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const stdout = await runCli([
      "verify-batch",
      "--answer-dir",
      answerDir,
      "--source-dir",
      sourceDir,
    ]);

    assert.match(stdout, /No claims were extracted from this answer\./);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("verify-batch writes a combined reviewer decision csv", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-batch-review-csv-"));

  try {
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");

    await runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers",
      "--source-dir",
      "examples/sources",
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const savedCsv = await readFile(reviewCsvOutPath, "utf8");
    const lines = savedCsv.trim().split("\n");

    assert.equal(
      lines[0],
      "answer_label,answer_path,answer_preview,answer_fail_policy,answer_fail_verdicts,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(
      lines[1] ?? "",
      /^hr-answer,examples\/answers\/hr-answer\.md,Employees receive 18 weeks of paid parental leave\..*,clear,,claim_1,/,
    );
    assert.match(lines[lines.length - 1] ?? "", /,,$/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review preserves answer paths from batch reviewer decision csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-batch-review-"));

  try {
    const reviewCsvOutPath = join(tempDir, "reports", "batch-review.csv");

    await runCli([
      "verify-batch",
      "--answer-dir",
      "examples/answers",
      "--source-dir",
      "examples/sources",
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      claims: Array<{ answerLabel?: string; answerPath?: string }>;
      answerGroups: Array<{
        label: string;
        answerPath?: string;
        summary: { totalClaims: number };
      }>;
    };

    assert.equal(report.claims[0]?.answerLabel, "hr-answer");
    assert.equal(report.claims[0]?.answerPath, "examples/answers/hr-answer.md");
    assert.equal(report.claims[report.claims.length - 1]?.answerPath, "examples/answers/support-answer.md");
    assert.equal(report.answerGroups[0]?.label, "hr-answer");
    assert.equal(report.answerGroups[0]?.answerPath, "examples/answers/hr-answer.md");
    assert.equal(report.answerGroups[0]?.summary.totalClaims, 3);
    assert.equal(report.answerGroups[1]?.label, "support-answer");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review preserves answer paths from single-answer reviewer csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-single-review-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "source.md");
    const reviewCsvOutPath = join(tempDir, "reports", "review.csv");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    await runCli([
      "verify",
      "--answer",
      answerPath,
      "--source",
      sourcePath,
      "--review-csv-out",
      reviewCsvOutPath,
    ]);

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvOutPath,
      "--json",
    ]);

    const report = JSON.parse(stdout) as {
      claims: Array<{ answerPath?: string }>;
    };

    assert.equal(report.claims[0]?.answerPath, answerPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review writes a markdown summary report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-markdown-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const markdownOutPath = join(tempDir, "reports", "review-import.md");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,"","",`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--markdown-out",
      markdownOutPath,
      "--fail-on",
      "unsupported",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Reviewer decision Markdown report written to/);

    const markdownReport = await readFile(markdownOutPath, "utf8");
    assert.match(markdownReport, /# Quorum Reviewer Decision Import/);
    assert.match(markdownReport, /- Total claims: 2/);
    assert.match(markdownReport, /- Fail policy: matched \(unsupported\)/);
    assert.match(markdownReport, /## Answer Groups/);
    assert.match(markdownReport, /### hr-answer/);
    assert.match(markdownReport, /- Answer file: examples\/answers\/hr-answer\.md/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review writes an html summary report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-html-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const htmlOutPath = join(tempDir, "reports", "review-import.html");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,claim_2,<Flag this answer for legal review.>,unsupported,No approved source contains enough overlapping policy language.,"","","","","","","Needs counsel review before publish"`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--html-out",
      htmlOutPath,
      "--fail-on",
      "unsupported",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Reviewer decision HTML report written to/);

    const htmlReport = await readFile(htmlOutPath, "utf8");
    assert.match(htmlReport, /<!doctype html>/i);
    assert.match(htmlReport, /<title>Quorum Reviewer Decision Import<\/title>/);
    assert.match(htmlReport, /<span>Fail policy<\/span><strong>matched \(unsupported\)<\/strong>/);
    assert.match(htmlReport, /<h2><code>hr-answer<\/code><\/h2>/);
    assert.match(htmlReport, /<p class="answer-group__path"><code>examples\/answers\/hr-answer\.md<\/code><\/p>/);
    assert.match(htmlReport, /Needs counsel review before publish/);
    assert.match(htmlReport, /&lt;Flag this answer for legal review\.\&gt;/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review writes a summary csv report", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-summary-csv-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");
    const summaryCsvOutPath = join(tempDir, "reports", "review-import-summary.csv");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,answer_preview,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,claim_2,Refunds are available within 14 days of purchase.,contradicted,A closely matching approved source uses different numeric terms.,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,needs_review,Escalate to support ops
`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--summary-csv-out",
      summaryCsvOutPath,
      "--fail-on",
      "needs_review",
    ]);

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Reviewer decision summary CSV written to/);

    const summaryCsv = await readFile(summaryCsvOutPath, "utf8");
    const lines = summaryCsv.trim().split("\n");
    assert.equal(
      lines[0],
      "answer_label,answer_path,answer_preview,primary_final_verdict,primary_claim,primary_model_reason,primary_reviewer_notes,primary_evidence_title,primary_evidence_trust_level,primary_evidence_updated_at,primary_evidence_score,primary_evidence_quote,total_claims,reviewed_claims,pending_claims,overridden_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts",
    );
    assert.equal(
      lines[1],
      "hr-answer,examples/answers/hr-answer.md,Employees receive 12 weeks of paid parental leave.,verified,Employees receive 12 weeks of paid parental leave.,The claim is strongly supported by an approved source.,Approved,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,1,1,0,0,1,0,0,0,clear,",
    );
    assert.equal(
      lines[2],
      "support-answer,examples/answers/support-answer.md,Refunds are available within 14 days of purchase.,needs_review,Refunds are available within 14 days of purchase.,A closely matching approved source uses different numeric terms.,Escalate to support ops,Support Playbook,medium,2026-06-01,0.842,Refunds are available within 30 days of purchase.,1,1,0,1,0,0,0,1,matched,needs_review",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("import-review exits non-zero when a final reviewer-aware verdict matches fail-on", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-cli-import-fail-on-"));

  try {
    const reviewCsvPath = join(tempDir, "reports", "review.csv");

    await mkdir(join(tempDir, "reports"), { recursive: true });
    await writeFile(
      reviewCsvPath,
      `answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_updated_at,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,contradicted,A closely matching approved source uses different numeric terms.,HR Policy,high,2026-05-31,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved after policy check
examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,,,,
`,
      "utf8",
    );

    const result = await runCliAllowFailure([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--json",
      "--fail-on",
      "unsupported",
      "--fail-on",
      "contradicted",
    ]);

    assert.equal(result.code, 2);
    assert.equal(result.stderr, "");

    const report = JSON.parse(result.stdout) as {
      summary: Record<string, number>;
    };

    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.unsupported, 1);
    assert.equal(report.summary.contradicted, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

async function runCli(args: string[]): Promise<string> {
  const result = await runCliAllowFailure(args);

  if (result.code === 0) {
    return result.stdout;
  }

  throw new Error(result.stderr.trim() || `CLI exited with code ${result.code}`);
}

async function runCliWithInput(args: string[], input: string): Promise<string> {
  const result = await runCliAllowFailure(args, input);

  if (result.code === 0) {
    return result.stdout;
  }

  throw new Error(result.stderr.trim() || `CLI exited with code ${result.code}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runCliAllowFailure(
  args: string[],
  input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout!.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr!.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    if (input !== undefined) {
      child.stdin!.write(input);
      child.stdin!.end();
    }
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
