#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import type { ClaimVerdict } from "./domain.js";
import { parseClaimVerdict, shouldFailReport } from "./report-policy.js";
import {
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderTextReport,
} from "./report-renderer.js";
import { sourceDocumentFromFile } from "./source-loader.js";

interface VerifyArgs {
  answerPath: string;
  sourcePaths: string[];
  sourceDirs: string[];
  json: boolean;
  failOn: ClaimVerdict[];
  outPath?: string;
  markdownOutPath?: string;
  htmlOutPath?: string;
  reviewCsvOutPath?: string;
}

const SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm"]);

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command !== "verify") {
    printHelp();
    process.exitCode = command ? 1 : 0;
    return;
  }

  const parsed = parseVerifyArgs(args);
  const answer = await readFile(parsed.answerPath, "utf8");
  const sourcePaths = await resolveSourcePaths(parsed.sourcePaths, parsed.sourceDirs);
  const sources = await Promise.all(
    sourcePaths.map(async (sourcePath, index) => {
      const content = await readFile(sourcePath, "utf8");
      return sourceDocumentFromFile(sourcePath, content, index);
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

function parseVerifyArgs(args: string[]): VerifyArgs {
  const sourcePaths: string[] = [];
  const sourceDirs: string[] = [];
  let answerPath = "";
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
    json,
    failOn,
    outPath,
    markdownOutPath,
    htmlOutPath,
    reviewCsvOutPath,
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
  quorum verify --answer <path> (--source <path> | --source-dir <path>) [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--fail-on <verdict>]

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --fail-on contradicted --fail-on unsupported
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
