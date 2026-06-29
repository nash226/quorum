#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import type { ClaimVerdict, SourceTrustLevel } from "./domain.js";
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
  answerPath: string;
  sourcePaths: string[];
  sourceDirs: string[];
  defaultTrustLevel?: SourceTrustLevel;
  json: boolean;
  failOn: ClaimVerdict[];
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  reviewCsvOutPath?: string;
}

interface ImportReviewArgs {
  reviewCsvPath: string;
  json: boolean;
  outPath?: string;
}

const SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".pdf"]);

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "verify") {
    await runVerify(args);
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
  const answer = await readFile(parsed.answerPath, "utf8");
  const sourcePaths = await resolveSourcePaths(parsed.sourcePaths, parsed.sourceDirs);
  const sources = await Promise.all(
    sourcePaths.map(async (sourcePath, index) => {
      const content = await readFile(sourcePath);
      return sourceDocumentFromFile(sourcePath, content, index, {
        defaultTrustLevel: parsed.defaultTrustLevel,
      });
    }),
  );

  const report = verifyAnswer(answer, sources);
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

function parseVerifyArgs(args: string[]): VerifyArgs {
  const sourcePaths: string[] = [];
  const sourceDirs: string[] = [];
  let answerPath = "";
  let defaultTrustLevel: SourceTrustLevel | undefined;
  let outPath: string | undefined;
  let markdownOutPath: string | undefined;
  let htmlOutPath: string | undefined;
  let reviewCsvOutPath: string | undefined;
  let json = false;
  const failOn: ClaimVerdict[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer" && next) {
      answerPath = next;
      index += 1;
    } else if (arg === "--source" && next) {
      sourcePaths.push(next);
      index += 1;
    } else if (arg === "--source-dir" && next) {
      sourceDirs.push(next);
      index += 1;
    } else if (arg === "--default-trust-level" && next) {
      defaultTrustLevel = parseSourceTrustLevel(next);
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
    } else if (arg === "--fail-on" && next) {
      failOn.push(parseClaimVerdict(next));
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!answerPath) {
    throw new Error("Missing --answer <path>");
  }

  if (sourcePaths.length === 0 && sourceDirs.length === 0) {
    throw new Error("Provide at least one --source <path> or --source-dir <path>");
  }

  return {
    answerPath,
    sourcePaths,
    sourceDirs,
    defaultTrustLevel,
    json,
    failOn,
    outPath,
    markdownOutPath,
    htmlOutPath,
    reviewCsvOutPath,
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

async function listSourceFiles(sourceDir: string): Promise<string[]> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(sourceDir, entry.name);

      if (entry.isDirectory()) {
        return listSourceFiles(path);
      }

      if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        return [path];
      }

      return [];
    }),
  );

  return files.flat();
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
  quorum import-review --review-csv <path> [--json] [--out <path>]

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --default-trust-level high --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --fail-on contradicted --fail-on unsupported
  npm run dev -- import-review --review-csv reports/hr-review.csv --out reports/hr-review-import.json
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
