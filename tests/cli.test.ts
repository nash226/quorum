import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      { id: "source_1", title: "Metadata Source", trustLevel: "low" },
      { id: "source_2", title: "plain-source.md", trustLevel: "high" },
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
      answers: Array<{
        answerPath: string;
        shouldFail: boolean;
        failVerdicts: string[];
        report: { summary: Record<string, number> };
      }>;
      summary: Record<string, number>;
    };

    assert.equal(report.answerCount, 2);
    assert.equal(report.sourceCount, 2);
    assert.equal(report.answers.length, 2);
    assert.deepEqual(
      report.answers.map((answer) => answer.answerPath).sort(),
      [join(answerDir, "hr.md"), join(answerDir, "support.txt")],
    );
    assert.deepEqual(report.answers.map((answer) => answer.failVerdicts), [[], []]);
    assert.equal(report.summary.verified, 2);
    assert.equal(report.summary.answersWithFailures, 0);

    const savedReport = JSON.parse(await readFile(batchOutPath, "utf8")) as typeof report;
    assert.equal(savedReport.answerCount, 2);
    assert.match(await readFile(batchMarkdownOutPath, "utf8"), /# Quorum Batch Verification Report/);
    assert.match(await readFile(batchHtmlOutPath, "utf8"), /<title>Quorum Batch Verification Report<\/title>/);
    assert.match(
      await readFile(batchReviewCsvOutPath, "utf8"),
      /answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes/,
    );
    assert.match(
      await readFile(batchSummaryCsvOutPath, "utf8"),
      /answer_path,total_claims,verified,contradicted,unsupported,needs_review,fail_policy,fail_verdicts/,
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
      /matched,contradicted \| unsupported/,
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
    assert.match(stdout, /Summary: 0 verified, 1 contradicted, 1 unsupported, 0 needs review/);
    assert.match(stdout, /Fail policy: clear/);
    assert.match(stdout, /Fail verdicts: none/);
    assert.match(stdout, /CONTRADICTED  Employees receive 18 weeks of paid parental leave\./);
    assert.match(stdout, /UNSUPPORTED  Employees receive free catered lunch every day\./);
    assert.match(stdout, /Evidence \(hr-policy\.md, medium trust, score /);
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
      "answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes",
    );
    assert.match(lines[1] ?? "", /^examples\/answers\/hr-answer\.md,/);
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
      claims: Array<{ answerPath?: string }>;
    };

    assert.equal(report.claims[0]?.answerPath, "examples/answers/hr-answer.md");
    assert.equal(report.claims[report.claims.length - 1]?.answerPath, "examples/answers/support-answer.md");
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
      `answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
examples/answers/support-answer.md,claim_2,Employees receive free catered lunch every day.,unsupported,No approved source contains enough overlapping policy language.,,,,"","",`,
      "utf8",
    );

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--markdown-out",
      markdownOutPath,
    ]);

    assert.match(stdout, /Reviewer decision Markdown report written to/);

    const markdownReport = await readFile(markdownOutPath, "utf8");
    assert.match(markdownReport, /# Quorum Reviewer Decision Import/);
    assert.match(markdownReport, /- Total claims: 2/);
    assert.match(markdownReport, /- Answer path: `examples\/answers\/hr-answer\.md`/);
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
      `answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_trust_levels,evidence_scores,evidence_quotes,reviewer_verdict,reviewer_notes
examples/answers/hr-answer.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,The claim is strongly supported by an approved source.,HR Policy,high,0.998,Employees receive 12 weeks of paid parental leave.,verified,Approved
examples/answers/support-answer.md,claim_2,<Flag this answer for legal review.>,unsupported,No approved source contains enough overlapping policy language.,"","","","","","Needs counsel review before publish"`,
      "utf8",
    );

    const stdout = await runCli([
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--html-out",
      htmlOutPath,
    ]);

    assert.match(stdout, /Reviewer decision HTML report written to/);

    const htmlReport = await readFile(htmlOutPath, "utf8");
    assert.match(htmlReport, /<!doctype html>/i);
    assert.match(htmlReport, /<title>Quorum Reviewer Decision Import<\/title>/);
    assert.match(htmlReport, /<code>examples\/answers\/hr-answer\.md<\/code>/);
    assert.match(htmlReport, /Needs counsel review before publish/);
    assert.match(htmlReport, /&lt;Flag this answer for legal review\.\&gt;/);
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

async function runCliAllowFailure(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}
