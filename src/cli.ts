#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import type {
  ClaimVerdict,
  SourceDocument,
  SourceTrustLevel,
  VerificationReport,
} from "./domain.js";
import { parseClaimVerdict, shouldFailReport } from "./report-policy.js";
import {
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderTextReport,
} from "./report-renderer.js";
import {
  importReviewerDecisions,
  renderReviewerDecisionImportReport,
} from "./reviewer-decision-import.js";
import { parseSourceTrustLevel, sourceDocumentFromFile } from "./source-loader.js";

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
  answerDirPath: string;
  outPath?: string;
}

interface ImportReviewArgs {
  reviewCsvPath: string;
  json: boolean;
  outPath?: string;
}

const SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".pdf"]);
const ANSWER_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

interface BatchVerificationResult {
  answerPath: string;
  report: VerificationReport;
  shouldFail: boolean;
}

interface BatchVerificationReport {
  generatedAt: string;
  sourceCount: number;
  answerCount: number;
  answers: BatchVerificationResult[];
  summary: {
    verified: number;
    contradicted: number;
    unsupported: number;
    needs_review: number;
    answersWithFailures: number;
  };
}

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
  const htmlReport = renderHtmlReport(report);
  const markdownReport = renderMarkdownReport(report);
  const reviewerDecisionCsv = renderReviewerDecisionCsv(report);
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

  process.stdout.write(renderTextReport(report));

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
  const answerPaths = await listAnswerFiles(parsed.answerDirPath);

  if (answerPaths.length === 0) {
    throw new Error(`No answer files found in ${parsed.answerDirPath}`);
  }

  const answers = await Promise.all(
    answerPaths.map(async (answerPath) => {
      const report = await verifySingleAnswer(answerPath, sources);

      return {
        answerPath,
        report,
        shouldFail: shouldFailReport(report, parsed.failOn),
      };
    }),
  );

  const batchReport = summarizeBatchVerification(answers, sources.length);
  const jsonReport = JSON.stringify(batchReport, null, 2);

  if (parsed.outPath) {
    await writeReportFile(parsed.outPath, jsonReport);
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

  if (shouldFail) {
    process.exitCode = 2;
  }
}

async function runImportReview(args: string[]): Promise<void> {
  const parsed = parseImportReviewArgs(args);
  const csvContent = await readFile(parsed.reviewCsvPath, "utf8");
  const report = importReviewerDecisions(csvContent);
  const jsonReport = JSON.stringify(report, null, 2);

  if (parsed.outPath) {
    await writeReportFile(parsed.outPath, jsonReport);
  }

  if (parsed.json) {
    console.log(jsonReport);
    return;
  }

  process.stdout.write(renderReviewerDecisionImportReport(report));

  if (parsed.outPath) {
    console.log(`Imported reviewer decisions written to ${parsed.outPath}`);
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
  const parsed = parseSharedVerifyArgs(args, new Set(["--answer-dir", "--out"]));
  let answerDirPath = "";
  let outPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer-dir" && next) {
      answerDirPath = next;
      index += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
      index += 1;
    }
  }

  if (!answerDirPath) {
    throw new Error("Missing --answer-dir <path>");
  }

  return {
    ...parsed,
    answerDirPath,
    outPath,
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
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--review-csv" && next) {
      reviewCsvPath = next;
      index += 1;
    } else if (arg === "--out" && next) {
      outPath = next;
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
    outPath,
  };
}

async function resolveSourcePaths(
  sourcePaths: string[],
  sourceDirs: string[],
): Promise<string[]> {
  const directoryFiles = (
    await Promise.all(sourceDirs.map((sourceDir) => listSourceFiles(sourceDir)))
  ).flat();

  return Array.from(new Set([...sourcePaths, ...directoryFiles])).sort();
}

async function loadSources(args: VerifyArgs): Promise<SourceDocument[]> {
  const sourcePaths = await resolveSourcePaths(args.sourcePaths, args.sourceDirs);

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
  return verifyAnswer(answer, sources);
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

  return files.flat();
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines];

  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }

  return trimmed;
}

function summarizeBatchVerification(
  answers: BatchVerificationResult[],
  sourceCount: number,
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
    sourceCount,
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
    `Sources: ${report.sourceCount}`,
    `Summary: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    `Answers matching fail policy: ${report.summary.answersWithFailures}`,
    "",
  ];

  for (const answer of report.answers) {
    lines.push(
      answer.answerPath,
      `  Summary: ${answer.report.summary.verified} verified, ${answer.report.summary.contradicted} contradicted, ${answer.report.summary.unsupported} unsupported, ${answer.report.summary.needs_review} needs review`,
      `  Fail policy: ${answer.shouldFail ? "matched" : "clear"}`,
      "",
    );
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
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
  quorum verify-batch --answer-dir <path> (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--fail-on <verdict>]
  quorum import-review --review-csv <path> [--json] [--out <path>]

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --default-trust-level high --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --fail-on contradicted --fail-on unsupported
  npm run dev -- verify-batch --answer-dir examples/answers --source-dir examples/sources --out reports/batch-report.json --fail-on contradicted
  npm run dev -- import-review --review-csv reports/hr-review.csv --out reports/hr-review-import.json
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
