#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import type { SourceDocument } from "./domain.js";

interface VerifyArgs {
  answerPath: string;
  sourcePaths: string[];
  json: boolean;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command !== "verify") {
    printHelp();
    process.exitCode = command ? 1 : 0;
    return;
  }

  const parsed = parseVerifyArgs(args);
  const answer = await readFile(parsed.answerPath, "utf8");
  const sources = await Promise.all(
    parsed.sourcePaths.map(async (sourcePath, index): Promise<SourceDocument> => {
      const content = await readFile(sourcePath, "utf8");
      return {
        id: `source_${index + 1}`,
        title: basename(sourcePath),
        content,
      };
    }),
  );

  const report = verifyAnswer(answer, sources);

  if (parsed.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report);
}

function parseVerifyArgs(args: string[]): VerifyArgs {
  const sourcePaths: string[] = [];
  let answerPath = "";
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--answer" && next) {
      answerPath = next;
      index += 1;
    } else if (arg === "--source" && next) {
      sourcePaths.push(next);
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

  if (sourcePaths.length === 0) {
    throw new Error("Provide at least one --source <path>");
  }

  return { answerPath, sourcePaths, json };
}

function printReport(report: ReturnType<typeof verifyAnswer>): void {
  console.log("Quorum Verification Report");
  console.log("");
  console.log(`Sources: ${report.sources.map((source) => source.title).join(", ")}`);
  console.log(
    `Summary: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
  );
  console.log("");

  for (const assessment of report.assessments) {
    console.log(`${assessment.verdict.toUpperCase()}  ${assessment.claim.text}`);
    console.log(`Reason: ${assessment.reason}`);

    for (const evidence of assessment.evidence) {
      console.log(`Evidence (${evidence.documentTitle}, score ${evidence.score}):`);
      console.log(`  ${evidence.quote}`);
    }

    console.log("");
  }
}

function printHelp(): void {
  console.log(`Quorum

Usage:
  quorum verify --answer <path> --source <path> [--source <path>] [--json]

Example:
  npm run dev -- verify --answer examples/answers/hr-answer.md --source examples/sources/hr-policy.md
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
