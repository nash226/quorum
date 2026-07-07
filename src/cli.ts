#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  BatchVerificationReport,
  ClaimAssessment,
  ClaimVerdict,
  SourceDocument,
  SourceTrustLevel,
} from "./domain.js";
import {
  evaluateFixtureFiles,
  renderEvaluationHtmlReport,
  hasEvaluationMismatch,
  renderEvaluationMarkdownReport,
  renderEvaluationTextReport,
  renderEvaluationSummaryCsv,
} from "./evaluation.js";
import {
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
  orderBatchAnswersForReview,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextPrimaryEvidenceLabel,
  renderTextAssessmentLines,
  renderTextReport,
} from "./report-renderer.js";
import {
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportReport,
  renderReviewerDecisionImportSummaryCsv,
} from "./reviewer-decision-import.js";
import { startApiServer } from "./api-server.js";
import { parseSourceTrustLevel } from "./source-loader.js";
import { renderAnswerPreview, stripByteOrderMark } from "./text.js";
import {
  importReviewerDecisionFile,
  loadSourceDocuments,
  verifyAnswerFile,
  verifyBatchAnswers,
} from "./workflow.js";

interface VerifyArgs {
  sourcePaths: string[];
  sourceDirs: string[];
  defaultTrustLevel?: SourceTrustLevel;
  json: boolean;
  failOn: ClaimVerdict[];
}

interface VerifySingleArgs extends VerifyArgs {
  answerPath: string;
  answerLabel?: string;
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  reviewCsvOutPath?: string;
  summaryCsvOutPath?: string;
}

interface VerifyBatchArgs extends VerifyArgs {
  answerPaths: string[];
  answerDirPaths: string[];
  answerLabelsByPath?: Record<string, string>;
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

interface EvaluateArgs {
  fixturePaths: string[];
  fixtureDirPaths: string[];
  json: boolean;
  failOnMismatch: boolean;
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  summaryCsvOutPath?: string;
}

interface ServeArgs {
  host?: string;
  port?: number;
}

const HELP_FLAGS = new Set(["--help", "-h"]);
type CommandName = "verify" | "verify-batch" | "import-review" | "evaluate" | "serve";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === undefined) {
    printHelp();
    return;
  }

  if (command === "help" || isHelpFlag(command)) {
    printHelp();
    return;
  }

  if (command === "verify") {
    if (args.some(isHelpFlag)) {
      printHelp("verify");
      return;
    }

    await runVerify(args);
    return;
  }

  if (command === "verify-batch") {
    if (args.some(isHelpFlag)) {
      printHelp("verify-batch");
      return;
    }

    await runVerifyBatch(args);
    return;
  }

  if (command === "import-review") {
    if (args.some(isHelpFlag)) {
      printHelp("import-review");
      return;
    }

    await runImportReview(args);
    return;
  }

  if (command === "evaluate") {
    if (args.some(isHelpFlag)) {
      printHelp("evaluate");
      return;
    }

    await runEvaluate(args);
    return;
  }

  if (command === "serve") {
    if (args.some(isHelpFlag)) {
      printHelp("serve");
      return;
    }

    await runServe(args);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

async function runVerify(args: string[]): Promise<void> {
  const parsed = parseVerifyArgs(args);
  const sources = await loadSources(parsed);
  const report = await verifyAnswerFile(parsed.answerPath, sources, undefined, parsed.answerLabel);
  const jsonReport = JSON.stringify(report, null, 2);
  const htmlReport = renderHtmlReport(report, parsed.failOn);
  const markdownReport = renderMarkdownReport(report, parsed.failOn);
  const reviewerDecisionCsv = renderReviewerDecisionCsv(report, parsed.failOn);
  const summaryCsv = renderSummaryCsv(report, parsed.failOn);
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

  if (parsed.summaryCsvOutPath) {
    console.log(`Summary CSV written to ${parsed.summaryCsvOutPath}`);
  }

  if (shouldFail) {
    process.exitCode = 2;
  }
}

async function runVerifyBatch(args: string[]): Promise<void> {
  const parsed = parseVerifyBatchArgs(args);
  const sources = await loadSources(parsed);
  const batchReport = await verifyBatchAnswers({
    answerPaths: parsed.answerPaths,
    answerDirPaths: parsed.answerDirPaths,
    answerLabelsByPath: parsed.answerLabelsByPath,
    sources,
    failOn: parsed.failOn,
  });
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
  const report = await importReviewerDecisionFile(parsed.reviewCsvPath);
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

async function runEvaluate(args: string[]): Promise<void> {
  const parsed = parseEvaluateArgs(args);
  const scorecards = await evaluateFixtureFiles({
    fixturePaths: parsed.fixturePaths,
    fixtureDirPaths: parsed.fixtureDirPaths,
  });
  const jsonReport = JSON.stringify(
    scorecards.length === 1 ? scorecards[0] : scorecards,
    null,
    2,
  );
  const markdownReport = renderEvaluationMarkdownReport(scorecards);
  const htmlReport = renderEvaluationHtmlReport(scorecards);
  const summaryCsvReport = renderEvaluationSummaryCsv(scorecards);
  const shouldFail = scorecards.some(hasEvaluationMismatch);

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
    await writeReportFile(parsed.summaryCsvOutPath, summaryCsvReport);
  }

  if (parsed.json) {
    console.log(jsonReport);
  } else {
    process.stdout.write(renderEvaluationTextReport(scorecards));

    if (parsed.outPath) {
      console.log(`Evaluation report written to ${parsed.outPath}`);
    }

    if (parsed.markdownOutPath) {
      console.log(`Evaluation Markdown report written to ${parsed.markdownOutPath}`);
    }

    if (parsed.htmlOutPath) {
      console.log(`Evaluation HTML report written to ${parsed.htmlOutPath}`);
    }

    if (parsed.summaryCsvOutPath) {
      console.log(`Evaluation summary CSV written to ${parsed.summaryCsvOutPath}`);
    }
  }

  if (parsed.failOnMismatch && shouldFail) {
    process.exitCode = 2;
  }
}

async function runServe(args: string[]): Promise<void> {
  const parsed = parseServeArgs(args);
  const api = await startApiServer({
    host: parsed.host,
    port: parsed.port,
  });

  console.log(`Quorum API listening on ${api.url}`);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      void api.close().finally(resolve);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

function parseVerifyArgs(args: string[]): VerifySingleArgs {
  const parsed = parseSharedVerifyArgs(args, new Set([
    "--answer",
    "--answer-label",
    "--out",
    "--markdown-out",
    "--html-out",
    "--review-csv-out",
    "--summary-csv-out",
  ]));
  let answerPath = "";
  let answerLabel: string | undefined;
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let reviewCsvOutPath: string | undefined;
  let summaryCsvOutPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer" && next) {
      answerPath = next;
      index += 1;
    } else if (arg === "--answer-label" && next) {
      answerLabel = next;
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

  if (!answerPath) {
    throw new Error("Missing --answer <path>");
  }

  return {
    ...parsed,
    answerPath,
    answerLabel,
    outPath,
    markdownOutPath,
    htmlOutPath,
    reviewCsvOutPath,
    summaryCsvOutPath,
  };
}

function parseServeArgs(args: string[]): ServeArgs {
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--host" && next) {
      host = next;
      index += 1;
      continue;
    }

    if (arg === "--port" && next) {
      const parsedPort = Number.parseInt(next, 10);

      if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
        throw new Error(`Invalid --port value: ${next}`);
      }

      port = parsedPort;
      index += 1;
      continue;
    }

    throw new Error(`Unknown or incomplete argument: ${arg}`);
  }

  return { host, port };
}

function parseVerifyBatchArgs(args: string[]): VerifyBatchArgs {
  const parsed = parseSharedVerifyArgs(args, new Set([
    "--answer",
    "--answer-label",
    "--answer-dir",
    "--out",
    "--markdown-out",
    "--html-out",
    "--review-csv-out",
    "--summary-csv-out",
  ]));
  const explicitAnswers: Array<{ path: string; label?: string }> = [];
  const answerDirPaths: string[] = [];
  const answerLabelsByPath: Record<string, string> = {};
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let reviewCsvOutPath: string | undefined;
  let summaryCsvOutPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer" && next) {
      explicitAnswers.push({ path: next });
      index += 1;
    } else if (arg === "--answer-label" && next) {
      const lastExplicitAnswer = explicitAnswers.at(-1);

      if (!lastExplicitAnswer) {
        throw new Error("Batch answer labels require a preceding --answer <path|->.");
      }

      if (lastExplicitAnswer.label !== undefined) {
        throw new Error(
          `Batch answer ${lastExplicitAnswer.path} already has a label. Use one --answer-label per explicit --answer input.`,
        );
      }

      lastExplicitAnswer.label = next;
      if (!(lastExplicitAnswer.path in answerLabelsByPath)) {
        answerLabelsByPath[lastExplicitAnswer.path] = next;
      }
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

  const answerPaths = explicitAnswers.map((answer) => answer.path);

  if (answerPaths.length === 0 && answerDirPaths.length === 0) {
    throw new Error("Provide at least one --answer <path> or --answer-dir <path>");
  }

  const stdinAnswerCount = answerPaths.filter((answerPath) => answerPath === "-").length;

  if (stdinAnswerCount > 1) {
    throw new Error("Only one --answer - is allowed because stdin can only be consumed once.");
  }

  return {
    ...parsed,
    answerPaths,
    answerDirPaths,
    answerLabelsByPath: Object.keys(answerLabelsByPath).length > 0 ? answerLabelsByPath : undefined,
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

function parseEvaluateArgs(args: string[]): EvaluateArgs {
  const fixturePaths: string[] = [];
  const fixtureDirPaths: string[] = [];
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let summaryCsvOutPath: string | undefined;
  let json = false;
  let failOnMismatch = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--fixture" && next) {
      fixturePaths.push(next);
      index += 1;
    } else if (arg === "--fixture-dir" && next) {
      fixtureDirPaths.push(next);
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
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--fail-on-mismatch") {
      failOnMismatch = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (fixturePaths.length === 0 && fixtureDirPaths.length === 0) {
    throw new Error("Provide at least one --fixture <path> or --fixture-dir <path>");
  }

  return {
    fixturePaths,
    fixtureDirPaths,
    json,
    failOnMismatch,
    outPath,
    markdownOutPath,
    htmlOutPath,
    summaryCsvOutPath,
  };
}

async function loadSources(args: VerifyArgs): Promise<SourceDocument[]> {
  return loadSourceDocuments({
    sourcePaths: args.sourcePaths,
    sourceDirs: args.sourceDirs,
    defaultTrustLevel: args.defaultTrustLevel,
  });
}

async function readTextInput(inputPath: string): Promise<string> {
  if (inputPath !== "-") {
    return stripByteOrderMark(await readFile(inputPath, "utf8"));
  }

  return stripByteOrderMark(await readStdin());
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function ensureFilePath(path: string, label: string): Promise<void> {
  let pathStat;

  try {
    pathStat = await stat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`${label} file not found: ${path}`);
    }

    throw error;
  }

  if (!pathStat.isFile()) {
    throw new Error(`${label} path is not a file: ${path}`);
  }
}

async function ensureDirectoryPath(path: string, label: string): Promise<void> {
  let pathStat;

  try {
    pathStat = await stat(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`${label} directory not found: ${path}`);
    }

    throw error;
  }

  if (!pathStat.isDirectory()) {
    throw new Error(`${label} path is not a directory: ${path}`);
  }
}

function dedupePathsInOrder(paths: string[]): string[] {
  const seen = new Set<string>();
  const uniquePaths: string[] = [];

  for (const path of paths) {
    const normalizedPath = resolve(path);

    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    uniquePaths.push(path);
  }

  return uniquePaths;
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

function renderBatchTextReport(report: BatchVerificationReport): string {
  const noClaimsReason = "No claims were extracted from this answer.";
  const orderedAnswers = orderBatchAnswersForReview(report.answers);
  const lines = [
    "Quorum Batch Verification Report",
    "",
    `Answers: ${report.answerCount}`,
    "Sources:",
    ...report.sources.map((source) => `- ${renderTextSourceLabel(source)}`),
    `Summary: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    `Answers with no extracted claims: ${report.summary.answersWithoutClaims}`,
    `Answers matching fail policy: ${report.summary.answersWithFailures}`,
    "",
  ];

  for (const answer of orderedAnswers) {
    const primaryAssessment = selectPrimaryAssessment(answer.report.assessments);
    const primaryFinding = primaryAssessment
      ? formatVerdictLabel(primaryAssessment.verdict)
      : "needs review";
    const primaryReason = primaryAssessment?.reason ?? noClaimsReason;

    lines.push(
      answer.answerLabel,
      `  Path: ${answer.answerPath}`,
      `  Summary: ${answer.report.summary.verified} verified, ${answer.report.summary.contradicted} contradicted, ${answer.report.summary.unsupported} unsupported, ${answer.report.summary.needs_review} needs review`,
      `  Fail policy: ${answer.shouldFail ? "matched" : "clear"}`,
      `  Fail verdicts: ${answer.failVerdicts.length > 0 ? answer.failVerdicts.join(", ") : "none"}`,
      `  Answer preview: ${renderAnswerPreview(answer.report.answer) || "No answer content provided."}`,
      `  Primary finding: ${primaryFinding}`,
      `  Primary reason: ${primaryReason}`,
    );

    if (primaryAssessment) {
      lines.push(
        `  Primary claim: ${primaryAssessment.claim.text}`,
        `  Primary evidence: ${renderTextPrimaryEvidenceLabel(primaryAssessment.evidence[0] ?? null)}`,
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

function isHelpFlag(value: string): boolean {
  return HELP_FLAGS.has(value);
}

function printHelp(command?: CommandName): void {
  const helpTextByCommand: Record<CommandName, string> = {
    verify: `Quorum verify

Usage:
  quorum verify --answer <path|-> (--source <path> | --source-dir <path>) [--answer-label <label>] [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]

Options:
  --answer <path|->          Answer file to verify, or - to read from stdin
  --answer-label <label>     Reviewer-facing label to use instead of the path-derived default
  --source <path>            Approved source document; may be repeated
  --source-dir <path>        Directory of approved source documents
  --default-trust-level <level>
                             Override trust level for sources without metadata
  --json                     Print the full JSON report
  --out <path>               Write the JSON report to disk
  --markdown-out <path>      Write a reviewer-friendly Markdown report
  --html-out <path>          Write a styled HTML report
  --review-csv-out <path>    Write a reviewer decision CSV
  --summary-csv-out <path>   Write a one-row summary CSV for this answer
  --fail-on <verdict>        Exit with code 2 when the verdict appears; may repeat

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --answer-label "HR reviewer packet" --source-dir examples/sources --default-trust-level high --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --summary-csv-out reports/hr-summary.csv --fail-on contradicted --fail-on unsupported
  cat examples/answers/hr-answer.md | npm run dev -- verify --answer - --answer-label "HR reviewer packet" --source-dir examples/sources --json
`,
    "verify-batch": `Quorum verify-batch

Usage:
  quorum verify-batch (--answer <path|-> [--answer-label <label>] | --answer-dir <path>)... (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]

Options:
  --answer <path|->          Answer file to include, or - to read one answer from stdin once
  --answer-label <label>     Apply a reviewer-facing label to the most recent explicit --answer input
  --answer-dir <path>        Directory of answer files to include
  --source <path>            Approved source document; may be repeated
  --source-dir <path>        Directory of approved source documents
  --default-trust-level <level>
                             Override trust level for sources without metadata
  --json                     Print the full JSON batch report
  --out <path>               Write the JSON batch report to disk
  --markdown-out <path>      Write a Markdown batch report
  --html-out <path>          Write a styled HTML batch report
  --review-csv-out <path>    Write a reviewer decision CSV
  --summary-csv-out <path>   Write a one-row-per-answer summary CSV
  --fail-on <verdict>        Exit with code 2 when the verdict appears; may repeat

Example:
  npm run dev -- verify-batch --answer examples/answers/hr-answer.md --answer-label "HR reviewer packet" --answer-dir examples/answers --source-dir examples/sources --out reports/batch-report.json --markdown-out reports/batch-report.md --html-out reports/batch-report.html --review-csv-out reports/batch-review.csv --summary-csv-out reports/batch-summary.csv --fail-on contradicted
  cat examples/answers/hr-answer.md | npm run dev -- verify-batch --answer - --answer examples/answers/support-answer.md --source-dir examples/sources --json
`,
    "import-review": `Quorum import-review

Usage:
  quorum import-review --review-csv <path|-> [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]

Options:
  --review-csv <path|->      Reviewer decision CSV to import, or - to read from stdin
  --json                     Print the full imported JSON report
  --out <path>               Write the imported JSON report to disk
  --markdown-out <path>      Write a Markdown import report
  --html-out <path>          Write a styled HTML import report
  --summary-csv-out <path>   Write a one-row-per-answer summary CSV
  --fail-on <verdict>        Exit with code 2 when the verdict appears; may repeat

Example:
  npm run dev -- import-review --review-csv reports/hr-review.csv --out reports/hr-review-import.json --markdown-out reports/hr-review-import.md --html-out reports/hr-review-import.html --summary-csv-out reports/hr-review-import-summary.csv --fail-on needs_review
  cat reports/hr-review.csv | npm run dev -- import-review --review-csv - --json
`,
    evaluate: `Quorum evaluate

Usage:
  quorum evaluate (--fixture <path> | --fixture-dir <path>)... [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on-mismatch]

Options:
  --fixture <path>          Evaluation fixture JSON file; may be repeated
  --fixture-dir <path>      Directory of evaluation fixture JSON files; may be repeated
  --json                    Print the evaluation scorecard JSON
  --out <path>              Write the JSON scorecard output to disk
  --markdown-out <path>     Write a Markdown evaluation report
  --html-out <path>         Write a styled HTML evaluation report
  --summary-csv-out <path>  Write a one-row-per-fixture summary CSV
  --fail-on-mismatch        Exit with code 2 when any fixture summary or claim verdict mismatches

Example:
  npm run dev -- evaluate --fixture examples/evaluations/hr-policy.json --fixture examples/evaluations/support-policy.json --markdown-out reports/evaluation-report.md --html-out reports/evaluation-report.html --summary-csv-out reports/evaluation-summary.csv --fail-on-mismatch
  npm run dev -- evaluate --fixture-dir examples/evaluations --fail-on-mismatch
  npm run dev -- evaluate --fixture examples/evaluations/hr-policy.json --json
`,
    serve: `Quorum serve

Usage:
  quorum serve [--host <host>] [--port <port>]

Options:
  --host <host>             Host interface to bind; defaults to 127.0.0.1
  --port <port>             Port to bind; defaults to 3000, use 0 for an ephemeral port

Endpoints:
  GET  /health              Return a simple readiness response
  GET  /openapi.json        Return the machine-readable API description
  POST /verify              Verify one answer from JSON request content
  POST /verify-batch        Verify multiple answers from JSON request content
  POST /import-review       Import reviewer CSV content from JSON request content
  POST /evaluate            Evaluate fixture JSON content from request payloads

Example:
  npm run dev -- serve --port 3000
`,
  };

  if (command) {
    console.log(helpTextByCommand[command]);
    return;
  }

  console.log(`Quorum

Usage:
  quorum verify --answer <path|-> (--source <path> | --source-dir <path>) [--answer-label <label>] [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
  quorum verify-batch (--answer <path|-> [--answer-label <label>] | --answer-dir <path>)... (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
  quorum import-review --review-csv <path|-> [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
  quorum evaluate (--fixture <path> | --fixture-dir <path>)... [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on-mismatch]
  quorum serve [--host <host>] [--port <port>]

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --answer-label "HR reviewer packet" --source-dir examples/sources --default-trust-level high --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --summary-csv-out reports/hr-summary.csv --fail-on contradicted --fail-on unsupported
  cat examples/answers/hr-answer.md | npm run dev -- verify --answer - --answer-label "HR reviewer packet" --source-dir examples/sources --json
  npm run dev -- verify-batch --answer examples/answers/hr-answer.md --answer-label "HR reviewer packet" --answer-dir examples/answers --source-dir examples/sources --out reports/batch-report.json --markdown-out reports/batch-report.md --html-out reports/batch-report.html --review-csv-out reports/batch-review.csv --summary-csv-out reports/batch-summary.csv --fail-on contradicted
  cat examples/answers/hr-answer.md | npm run dev -- verify-batch --answer - --answer examples/answers/support-answer.md --source-dir examples/sources --json
  npm run dev -- import-review --review-csv reports/hr-review.csv --out reports/hr-review-import.json --markdown-out reports/hr-review-import.md --html-out reports/hr-review-import.html --summary-csv-out reports/hr-review-import-summary.csv --fail-on needs_review
  cat reports/hr-review.csv | npm run dev -- import-review --review-csv - --json
  npm run dev -- evaluate --fixture examples/evaluations/hr-policy.json --fixture examples/evaluations/support-policy.json --markdown-out reports/evaluation-report.md --html-out reports/evaluation-report.html --summary-csv-out reports/evaluation-summary.csv --fail-on-mismatch
  npm run dev -- evaluate --fixture-dir examples/evaluations --fail-on-mismatch
  npm run dev -- serve --port 3000
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
