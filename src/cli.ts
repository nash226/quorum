#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import type {
  BatchVerificationReport,
  BatchVerificationResult,
  ClaimAssessment,
  ClaimVerdict,
  SourceDocument,
  SourceTrustLevel,
  VerificationReport,
} from "./domain.js";
import {
  matchingFailVerdicts,
  parseClaimVerdict,
  shouldFailReport,
} from "./report-policy.js";
import {
  renderBatchHtmlReport,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderTextAssessmentLines,
  renderTextReport,
} from "./report-renderer.js";
import {
  importReviewerDecisions,
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportReport,
  renderReviewerDecisionImportSummaryCsv,
} from "./reviewer-decision-import.js";
import { parseSourceTrustLevel, sourceDocumentFromFile } from "./source-loader.js";
import { renderAnswerLabels, renderAnswerPreview } from "./text.js";

interface VerifyArgs {
  sourcePaths: string[];
  sourceDirs: string[];
  defaultTrustLevel?: SourceTrustLevel;
  json: boolean;
  failOn: ClaimVerdict[];
}

interface VerifySingleArgs extends VerifyArgs {
  answerPath: string;
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  reviewCsvOutPath?: string;
}

interface VerifyBatchArgs extends VerifyArgs {
  answerPaths: string[];
  answerDirPaths: string[];
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  reviewCsvOutPath?: string;
  summaryCsvOutPath?: string;
}

interface ImportReviewArgs {
  reviewCsvPath: string;
  json: boolean;
  failOn: ClaimVerdict[];
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  summaryCsvOutPath?: string;
}

const SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".pdf"]);
const ANSWER_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "verify") {
    await runVerify(args);
    return;
  }

  if (command === "verify-batch") {
    await runVerifyBatch(args);
    return;
  }

  if (command === "import-review") {
    await runImportReview(args);
    return;
  }

  if (command !== undefined) {
    printHelp();
    process.exitCode = 1;
  } else {
    printHelp();
  }
}

async function runVerify(args: string[]): Promise<void> {
  const parsed = parseVerifyArgs(args);
  const sources = await loadSources(parsed);
  const report = await verifySingleAnswer(parsed.answerPath, sources);
  const jsonReport = JSON.stringify(report, null, 2);
  const htmlReport = renderHtmlReport(report, parsed.failOn);
  const markdownReport = renderMarkdownReport(report, parsed.failOn);
  const reviewerDecisionCsv = renderReviewerDecisionCsv(report, parsed.failOn);
  const shouldFail = shouldFailReport(report, parsed.failOn);

  if (parsed.outPath) {
    await writeReportFile(parsed.outPath, jsonReport);
  }

  if (parsed.markdownOutPath) {
    await writeReportFile(parsed.markdownOutPath, markdownReport);
  }

  if (parsed.htmlOutPath) {
    await writeReportFile(parsed.htmlOutPath, htmlReport);
  }

  if (parsed.reviewCsvOutPath) {
    await writeReportFile(parsed.reviewCsvOutPath, reviewerDecisionCsv);
  }

  if (parsed.json) {
    console.log(jsonReport);
    if (shouldFail) {
      process.exitCode = 2;
    }
    return;
  }

  process.stdout.write(renderTextReport(report, parsed.failOn));

  if (parsed.outPath) {
    console.log(`Report written to ${parsed.outPath}`);
  }

  if (parsed.markdownOutPath) {
    console.log(`Markdown report written to ${parsed.markdownOutPath}`);
  }

  if (parsed.htmlOutPath) {
    console.log(`HTML report written to ${parsed.htmlOutPath}`);
  }

  if (parsed.reviewCsvOutPath) {
    console.log(`Reviewer decision CSV written to ${parsed.reviewCsvOutPath}`);
  }

  if (shouldFail) {
    process.exitCode = 2;
  }
}

async function runVerifyBatch(args: string[]): Promise<void> {
  const parsed = parseVerifyBatchArgs(args);
  const sources = await loadSources(parsed);
  const answerPaths = await resolveAnswerPaths(parsed.answerPaths, parsed.answerDirPaths);

  if (answerPaths.length === 0) {
    const locations = [...parsed.answerPaths, ...parsed.answerDirPaths].join(", ");
    throw new Error(`No answer files found in ${locations}`);
  }

  const answerLabels = renderAnswerLabels(answerPaths);
  const answers = await Promise.all(
    answerPaths.map(async (answerPath, index) => {
      const report = await verifySingleAnswer(answerPath, sources);
      const failVerdicts = matchingFailVerdicts(report, parsed.failOn);

      return {
        answerLabel: answerLabels[index] ?? answerPath,
        answerPath,
        report,
        shouldFail: failVerdicts.length > 0,
        failVerdicts,
      };
    }),
  );

  const batchReport = summarizeBatchVerification(answers, sources);
  const jsonReport = JSON.stringify(batchReport, null, 2);
  const markdownReport = renderBatchMarkdownReport(batchReport);
  const htmlReport = renderBatchHtmlReport(batchReport);
  const reviewerDecisionCsv = renderBatchReviewerDecisionCsv(batchReport);
  const summaryCsv = renderBatchSummaryCsv(batchReport);

  if (parsed.outPath) {
    await writeReportFile(parsed.outPath, jsonReport);
  }

  if (parsed.markdownOutPath) {
    await writeReportFile(parsed.markdownOutPath, markdownReport);
  }

  if (parsed.htmlOutPath) {
    await writeReportFile(parsed.htmlOutPath, htmlReport);
  }

  if (parsed.reviewCsvOutPath) {
    await writeReportFile(parsed.reviewCsvOutPath, reviewerDecisionCsv);
  }

  if (parsed.summaryCsvOutPath) {
    await writeReportFile(parsed.summaryCsvOutPath, summaryCsv);
  }

  const shouldFail = batchReport.summary.answersWithFailures > 0;

  if (parsed.json) {
    console.log(jsonReport);
    if (shouldFail) {
      process.exitCode = 2;
    }
    return;
  }

  process.stdout.write(renderBatchTextReport(batchReport));

  if (parsed.outPath) {
    console.log(`Batch report written to ${parsed.outPath}`);
  }

  if (parsed.markdownOutPath) {
    console.log(`Batch markdown report written to ${parsed.markdownOutPath}`);
  }

  if (parsed.htmlOutPath) {
    console.log(`Batch HTML report written to ${parsed.htmlOutPath}`);
  }

  if (parsed.reviewCsvOutPath) {
    console.log(`Batch reviewer decision CSV written to ${parsed.reviewCsvOutPath}`);
  }

  if (parsed.summaryCsvOutPath) {
    console.log(`Batch summary CSV written to ${parsed.summaryCsvOutPath}`);
  }

  if (shouldFail) {
    process.exitCode = 2;
  }
}

async function runImportReview(args: string[]): Promise<void> {
  const parsed = parseImportReviewArgs(args);
  const csvContent = await readFile(parsed.reviewCsvPath, "utf8");
  const report = importReviewerDecisions(csvContent);
  const jsonReport = JSON.stringify(report, null, 2);
  const markdownReport = renderReviewerDecisionImportMarkdownReport(report, parsed.failOn);
  const htmlReport = renderReviewerDecisionImportHtmlReport(report, parsed.failOn);
  const summaryCsv = renderReviewerDecisionImportSummaryCsv(report, parsed.failOn);
  const shouldFail = shouldFailReport(report, parsed.failOn);

  if (parsed.outPath) {
    await writeReportFile(parsed.outPath, jsonReport);
  }

  if (parsed.markdownOutPath) {
    await writeReportFile(parsed.markdownOutPath, markdownReport);
  }

  if (parsed.htmlOutPath) {
    await writeReportFile(parsed.htmlOutPath, htmlReport);
  }

  if (parsed.summaryCsvOutPath) {
    await writeReportFile(parsed.summaryCsvOutPath, summaryCsv);
  }

  if (parsed.json) {
    console.log(jsonReport);
    if (shouldFail) {
      process.exitCode = 2;
    }
    return;
  }

  process.stdout.write(renderReviewerDecisionImportReport(report, parsed.failOn));

  if (parsed.outPath) {
    console.log(`Imported reviewer decisions written to ${parsed.outPath}`);
  }

  if (parsed.markdownOutPath) {
    console.log(`Reviewer decision Markdown report written to ${parsed.markdownOutPath}`);
  }

  if (parsed.htmlOutPath) {
    console.log(`Reviewer decision HTML report written to ${parsed.htmlOutPath}`);
  }

  if (parsed.summaryCsvOutPath) {
    console.log(`Reviewer decision summary CSV written to ${parsed.summaryCsvOutPath}`);
  }

  if (shouldFail) {
    process.exitCode = 2;
  }
}

function parseVerifyArgs(args: string[]): VerifySingleArgs {
  const parsed = parseSharedVerifyArgs(args, new Set([
    "--answer",
    "--out",
    "--markdown-out",
    "--html-out",
    "--review-csv-out",
  ]));
  let answerPath = "";
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let reviewCsvOutPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer" && next) {
      answerPath = next;
      index += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      index += 1;
    } else if (arg === "--markdown-out" && next) {
      markdownOutPath = next;
      index += 1;
    } else if (arg === "--html-out" && next) {
      htmlOutPath = next;
      index += 1;
    } else if (arg === "--review-csv-out" && next) {
      reviewCsvOutPath = next;
      index += 1;
    }
  }

  if (!answerPath) {
    throw new Error("Missing --answer <path>");
  }

  return {
    ...parsed,
    answerPath,
    outPath,
    markdownOutPath,
    htmlOutPath,
    reviewCsvOutPath,
  };
}

function parseVerifyBatchArgs(args: string[]): VerifyBatchArgs {
  const parsed = parseSharedVerifyArgs(args, new Set([
    "--answer",
    "--answer-dir",
    "--out",
    "--markdown-out",
    "--html-out",
    "--review-csv-out",
    "--summary-csv-out",
  ]));
  const answerPaths: string[] = [];
  const answerDirPaths: string[] = [];
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let reviewCsvOutPath: string | undefined;
  let summaryCsvOutPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer" && next) {
      answerPaths.push(next);
      index += 1;
    } else if (arg === "--answer-dir" && next) {
      answerDirPaths.push(next);
      index += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      index += 1;
    } else if (arg === "--markdown-out" && next) {
      markdownOutPath = next;
      index += 1;
    } else if (arg === "--html-out" && next) {
      htmlOutPath = next;
      index += 1;
    } else if (arg === "--review-csv-out" && next) {
      reviewCsvOutPath = next;
      index += 1;
    } else if (arg === "--summary-csv-out" && next) {
      summaryCsvOutPath = next;
      index += 1;
    }
  }

  if (answerPaths.length === 0 && answerDirPaths.length === 0) {
    throw new Error("Provide at least one --answer <path> or --answer-dir <path>");
  }

  return {
    ...parsed,
    answerPaths,
    answerDirPaths,
    outPath,
    markdownOutPath,
    htmlOutPath,
    reviewCsvOutPath,
    summaryCsvOutPath,
  };
}

function parseSharedVerifyArgs(
  args: string[],
  commandSpecificOptions: ReadonlySet<string>,
): VerifyArgs {
  const sourcePaths: string[] = [];
  const sourceDirs: string[] = [];
  let defaultTrustLevel: SourceTrustLevel | undefined;
  let json = false;
  const failOn: ClaimVerdict[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--source" && next) {
      sourcePaths.push(next);
      index += 1;
    } else if (arg === "--source-dir" && next) {
      sourceDirs.push(next);
      index += 1;
    } else if (arg === "--default-trust-level" && next) {
      defaultTrustLevel = parseSourceTrustLevel(next);
      index += 1;
    } else if (arg === "--fail-on" && next) {
      failOn.push(parseClaimVerdict(next));
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else if (commandSpecificOptions.has(arg) && next) {
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (sourcePaths.length === 0 && sourceDirs.length === 0) {
    throw new Error("Provide at least one --source <path> or --source-dir <path>");
  }

  return {
    sourcePaths,
    sourceDirs,
    defaultTrustLevel,
    json,
    failOn,
  };
}

function parseImportReviewArgs(args: string[]): ImportReviewArgs {
  let reviewCsvPath = "";
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let summaryCsvOutPath: string | undefined;
  let json = false;
  const failOn: ClaimVerdict[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--review-csv" && next) {
      reviewCsvPath = next;
      index += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      index += 1;
    } else if (arg === "--markdown-out" && next) {
      markdownOutPath = next;
      index += 1;
    } else if (arg === "--html-out" && next) {
      htmlOutPath = next;
      index += 1;
    } else if (arg === "--summary-csv-out" && next) {
      summaryCsvOutPath = next;
      index += 1;
    } else if (arg === "--fail-on" && next) {
      failOn.push(parseClaimVerdict(next));
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!reviewCsvPath) {
    throw new Error("Missing --review-csv <path>");
  }

  return {
    reviewCsvPath,
    json,
    failOn,
    outPath,
    markdownOutPath,
    htmlOutPath,
    summaryCsvOutPath,
  };
}

async function resolveSourcePaths(
  sourcePaths: string[],
  sourceDirs: string[],
): Promise<string[]> {
  const directoryFiles = (
    await Promise.all(sourceDirs.map((sourceDir) => listSourceFiles(sourceDir)))
  ).flat();

  return dedupePathsInOrder([...sourcePaths, ...directoryFiles]);
}

async function resolveAnswerPaths(
  answerPaths: string[],
  answerDirs: string[],
): Promise<string[]> {
  const directoryFiles = (
    await Promise.all(answerDirs.map((answerDir) => listAnswerFiles(answerDir)))
  ).flat();

  return dedupePathsInOrder([...answerPaths, ...directoryFiles]);
}

async function loadSources(args: VerifyArgs): Promise<SourceDocument[]> {
  const sourcePaths = await resolveSourcePaths(args.sourcePaths, args.sourceDirs);

  if (sourcePaths.length === 0) {
    throw new Error("No approved source files found in the provided source locations");
  }

  return Promise.all(
    sourcePaths.map(async (sourcePath, index) => {
      const content = await readFile(sourcePath);
      return sourceDocumentFromFile(sourcePath, content, index, {
        defaultTrustLevel: args.defaultTrustLevel,
      });
    }),
  );
}

async function verifySingleAnswer(
  answerPath: string,
  sources: SourceDocument[],
): Promise<VerificationReport> {
  const answer = await readFile(answerPath, "utf8");
  return verifyAnswer(answer, sources, undefined, answerPath);
}

async function listSourceFiles(sourceDir: string): Promise<string[]> {
  return listFilesWithExtensions(sourceDir, SOURCE_EXTENSIONS);
}

async function listAnswerFiles(answerDir: string): Promise<string[]> {
  return listFilesWithExtensions(answerDir, ANSWER_EXTENSIONS);
}

async function listFilesWithExtensions(
  directory: string,
  extensions: ReadonlySet<string>,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFilesWithExtensions(path, extensions);
      }

      if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        return [path];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

function dedupePathsInOrder(paths: string[]): string[] {
  const seen = new Set<string>();
  const uniquePaths: string[] = [];

  for (const path of paths) {
    const normalizedPath = normalizePathForDedupe(path);

    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    uniquePaths.push(path);
  }

  return uniquePaths;
}

function normalizePathForDedupe(path: string): string {
  return resolve(path);
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines];

  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }

  return trimmed;
}

function renderTextSourceLabel(source: {
  title: string;
  trustLevel: string;
  updatedAt?: string;
}): string {
  const metadata = [`${source.trustLevel} trust`];

  if (source.updatedAt) {
    metadata.push(`updated ${source.updatedAt}`);
  }

  return `${source.title} (${metadata.join(", ")})`;
}

function summarizeBatchVerification(
  answers: BatchVerificationResult[],
  sources: SourceDocument[],
): BatchVerificationReport {
  const summary = {
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
    answersWithFailures: 0,
  };

  for (const answer of answers) {
    summary.verified += answer.report.summary.verified;
    summary.contradicted += answer.report.summary.contradicted;
    summary.unsupported += answer.report.summary.unsupported;
    summary.needs_review += answer.report.summary.needs_review;

    if (answer.shouldFail) {
      summary.answersWithFailures += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      updatedAt: source.updatedAt,
      trustLevel: source.trustLevel,
    })),
    sourceCount: sources.length,
    answerCount: answers.length,
    answers,
    summary,
  };
}

function renderBatchTextReport(report: BatchVerificationReport): string {
  const lines = [
    "Quorum Batch Verification Report",
    "",
    `Answers: ${report.answerCount}`,
    "Sources:",
    ...report.sources.map((source) => `- ${renderTextSourceLabel(source)}`),
    `Summary: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    `Answers matching fail policy: ${report.summary.answersWithFailures}`,
    "",
  ];

  for (const answer of report.answers) {
    const primaryAssessment = selectPrimaryAssessment(answer.report.assessments);

    lines.push(
      answer.answerLabel,
      `  Path: ${answer.answerPath}`,
      `  Summary: ${answer.report.summary.verified} verified, ${answer.report.summary.contradicted} contradicted, ${answer.report.summary.unsupported} unsupported, ${answer.report.summary.needs_review} needs review`,
      `  Fail policy: ${answer.shouldFail ? "matched" : "clear"}`,
      `  Fail verdicts: ${answer.failVerdicts.length > 0 ? answer.failVerdicts.join(", ") : "none"}`,
      `  Answer preview: ${renderAnswerPreview(answer.report.answer) || "No answer content provided."}`,
      `  Primary finding: ${primaryAssessment ? formatVerdictLabel(primaryAssessment.verdict) : "none"}`,
    );

    if (primaryAssessment) {
      lines.push(
        `  Primary claim: ${primaryAssessment.claim.text}`,
        `  Primary reason: ${primaryAssessment.reason}`,
        `  Primary evidence: ${primaryAssessment.evidence[0]?.documentTitle ?? "No approved source snippet matched strongly enough."}`,
      );
    }

    if (answer.report.assessments.length === 0) {
      lines.push("  No claims were extracted from this answer.", "");
      continue;
    }

    lines.push("");

    for (const assessment of answer.report.assessments) {
      lines.push(...indentLines(renderTextAssessmentLines(assessment), "  "), "");
    }
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function indentLines(lines: string[], prefix: string): string[] {
  return lines.map((line) => (line.length === 0 ? line : `${prefix}${line}`));
}

function formatVerdictLabel(verdict: ClaimVerdict): string {
  return verdict.replace("_", " ");
}

function selectPrimaryAssessment(
  assessments: ClaimAssessment[],
): ClaimAssessment | undefined {
  const priority: Record<ClaimAssessment["verdict"], number> = {
    contradicted: 0,
    unsupported: 1,
    needs_review: 2,
    verified: 3,
  };

  return [...assessments].sort(
    (left, right) => priority[left.verdict] - priority[right.verdict],
  )[0];
}

async function writeReportFile(
  outPath: string,
  reportContents: string,
): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  const output = reportContents.endsWith("\n") ? reportContents : `${reportContents}\n`;
  await writeFile(outPath, output, "utf8");
}

function printHelp(): void {
  console.log(`Quorum

Usage:
  quorum verify --answer <path> (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--fail-on <verdict>]
  quorum verify-batch (--answer <path> | --answer-dir <path>)... (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
  quorum import-review --review-csv <path> [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --default-trust-level high --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --fail-on contradicted --fail-on unsupported
  npm run dev -- verify-batch --answer examples/answers/hr-answer.md --answer-dir examples/answers --source-dir examples/sources --out reports/batch-report.json --markdown-out reports/batch-report.md --html-out reports/batch-report.html --review-csv-out reports/batch-review.csv --summary-csv-out reports/batch-summary.csv --fail-on contradicted
  npm run dev -- import-review --review-csv reports/hr-review.csv --out reports/hr-review-import.json --markdown-out reports/hr-review-import.md --html-out reports/hr-review-import.html --summary-csv-out reports/hr-review-import-summary.csv --fail-on needs_review
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
