import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { serializeDelimitedList } from "./csv-list.js";
import type { ClaimVerdict, VerificationReport } from "./domain.js";
import { loadSourceDocuments, verifyAnswerFile } from "./workflow.js";

export interface EvaluationFixture {
  name: string;
  answerPath: string;
  sourcePaths: string[];
  expectedSummary: Record<ClaimVerdict, number>;
  expectedClaimVerdicts?: ClaimVerdict[];
}

export interface EvaluationClaimScore {
  index: number;
  claimText: string;
  actualVerdict: ClaimVerdict;
  expectedVerdict?: ClaimVerdict;
  matches: boolean;
}

export interface EvaluationScorecard {
  fixtureName: string;
  fixturePath?: string;
  answerPath: string;
  sourcePaths: string[];
  report: VerificationReport;
  expectedSummary: Record<ClaimVerdict, number>;
  actualSummary: Record<ClaimVerdict, number>;
  summaryMatches: boolean;
  claims: EvaluationClaimScore[];
  matchedClaims: number;
  totalExpectedClaims: number;
  score: number;
}

export interface EvaluationBatchOptions {
  fixturePaths: string[];
  fixtureDirPaths: string[];
  generatedAt?: string;
}

export async function loadEvaluationFixture(fixturePath: string): Promise<EvaluationFixture> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as EvaluationFixture;
}

export async function evaluateFixture(
  fixture: EvaluationFixture,
  options: {
    baseDir?: string;
    fixturePath?: string;
    generatedAt?: string;
  } = {},
): Promise<EvaluationScorecard> {
  const baseDir = options.baseDir ?? process.cwd();
  const answerPath = resolve(baseDir, fixture.answerPath);
  const sourcePaths = fixture.sourcePaths.map((sourcePath) => resolve(baseDir, sourcePath));
  const sources = await loadSourceDocuments({
    sourcePaths,
    sourceDirs: [],
  });
  const report = await verifyAnswerFile(
    answerPath,
    sources,
    options.generatedAt ?? new Date().toISOString(),
  );
  const actualSummary = {
    verified: report.summary.verified,
    contradicted: report.summary.contradicted,
    unsupported: report.summary.unsupported,
    needs_review: report.summary.needs_review,
  };
  const expectedSummary = {
    verified: fixture.expectedSummary.verified,
    contradicted: fixture.expectedSummary.contradicted,
    unsupported: fixture.expectedSummary.unsupported,
    needs_review: fixture.expectedSummary.needs_review,
  };
  const expectedClaimVerdicts = fixture.expectedClaimVerdicts ?? [];
  const claims = report.assessments.map((assessment, index) => {
    const expectedVerdict = expectedClaimVerdicts[index];
    return {
      index,
      claimText: assessment.claim.text,
      actualVerdict: assessment.verdict,
      expectedVerdict,
      matches: expectedVerdict === undefined ? false : expectedVerdict === assessment.verdict,
    };
  });
  const matchedClaims = claims.filter((claim) => claim.matches).length;
  const totalExpectedClaims = expectedClaimVerdicts.length;

  return {
    fixtureName: fixture.name,
    fixturePath: options.fixturePath,
    answerPath,
    sourcePaths,
    report,
    expectedSummary,
    actualSummary,
    summaryMatches: hasMatchingSummary(expectedSummary, actualSummary),
    claims,
    matchedClaims,
    totalExpectedClaims,
    score:
      totalExpectedClaims > 0
        ? matchedClaims / totalExpectedClaims
        : hasMatchingSummary(expectedSummary, actualSummary)
          ? 1
          : 0,
  };
}

export async function evaluateFixtureFile(
  fixturePath: string,
  options: {
    generatedAt?: string;
  } = {},
): Promise<EvaluationScorecard> {
  const fixture = await loadEvaluationFixture(fixturePath);
  return evaluateFixture(fixture, {
    baseDir: dirname(fixturePath),
    fixturePath,
    generatedAt: options.generatedAt,
  });
}

export async function evaluateFixtureFiles(
  options: EvaluationBatchOptions,
): Promise<EvaluationScorecard[]> {
  const fixturePaths = await resolveEvaluationFixturePaths(
    options.fixturePaths,
    options.fixtureDirPaths,
  );

  await Promise.all(
    fixturePaths.map((fixturePath) => ensureFilePath(fixturePath, "Evaluation fixture")),
  );

  return Promise.all(
    fixturePaths.map((fixturePath) =>
      evaluateFixtureFile(fixturePath, { generatedAt: options.generatedAt }),
    ),
  );
}

export async function resolveEvaluationFixturePaths(
  fixturePaths: string[],
  fixtureDirPaths: string[],
): Promise<string[]> {
  const directoryFiles = (
    await Promise.all(
      fixtureDirPaths.map((fixtureDirPath) => listEvaluationFixtureFiles(fixtureDirPath)),
    )
  ).flat();

  return dedupePathsInOrder([...fixturePaths, ...directoryFiles]);
}

export function renderEvaluationScorecard(scorecard: EvaluationScorecard): string {
  const lines = [
    `Evaluation Fixture: ${scorecard.fixtureName}`,
    `Answer: ${scorecard.answerPath}`,
    `Sources: ${scorecard.sourcePaths.join(", ")}`,
    `Summary match: ${scorecard.summaryMatches ? "yes" : "no"}`,
    `Claim verdict score: ${scorecard.matchedClaims}/${scorecard.totalExpectedClaims || 0} (${Math.round(scorecard.score * 100)}%)`,
  ];

  if (!scorecard.summaryMatches) {
    lines.push(
      `Expected summary: verified=${scorecard.expectedSummary.verified}, contradicted=${scorecard.expectedSummary.contradicted}, unsupported=${scorecard.expectedSummary.unsupported}, needs_review=${scorecard.expectedSummary.needs_review}`,
      `Actual summary: verified=${scorecard.actualSummary.verified}, contradicted=${scorecard.actualSummary.contradicted}, unsupported=${scorecard.actualSummary.unsupported}, needs_review=${scorecard.actualSummary.needs_review}`,
    );
  }

  const mismatches = scorecard.claims.filter(
    (claim) => claim.expectedVerdict !== undefined && !claim.matches,
  );

  if (mismatches.length > 0) {
    lines.push("", "Claim mismatches:");

    mismatches.forEach((claim) => {
      lines.push(
        `- Claim ${claim.index + 1}: expected ${claim.expectedVerdict}, got ${claim.actualVerdict}`,
        `  ${claim.claimText}`,
      );
    });
  }

  return `${lines.join("\n")}\n`;
}

export function renderEvaluationTextReport(scorecards: EvaluationScorecard[]): string {
  const mismatchCount = scorecards.filter(hasEvaluationMismatch).length;
  const lines = ["Quorum Evaluation Report", ""];

  scorecards.forEach((scorecard, index) => {
    if (index > 0) {
      lines.push("");
    }

    lines.push(...renderEvaluationScorecard(scorecard).trimEnd().split("\n"));
  });

  lines.push(
    "",
    `Fixtures: ${scorecards.length}`,
    `Fixtures with mismatches: ${mismatchCount}`,
  );

  return `${lines.join("\n")}\n`;
}

export function renderEvaluationMarkdownReport(scorecards: EvaluationScorecard[]): string {
  const mismatchCount = scorecards.filter(hasEvaluationMismatch).length;
  const lines = [
    "# Quorum Evaluation Report",
    "",
    "## Summary",
    "",
    `- Fixtures: ${scorecards.length}`,
    `- Fixtures with mismatches: ${mismatchCount}`,
    "",
    "## Fixtures",
    "",
  ];

  scorecards.forEach((scorecard, index) => {
    lines.push(
      `### ${index + 1}. ${scorecard.fixtureName}`,
      "",
      ...(scorecard.fixturePath ? [`- Fixture path: \`${scorecard.fixturePath}\``] : []),
      `- Answer path: \`${scorecard.answerPath}\``,
      `- Sources: ${scorecard.sourcePaths.map((sourcePath) => `\`${sourcePath}\``).join(", ")}`,
      `- Summary match: ${scorecard.summaryMatches ? "yes" : "no"}`,
      `- Claim verdict score: ${scorecard.matchedClaims}/${scorecard.totalExpectedClaims} (${Math.round(scorecard.score * 100)}%)`,
      "",
      "#### Expected Summary",
      "",
      ...renderMarkdownSummaryList(scorecard.expectedSummary),
      "",
      "#### Actual Summary",
      "",
      ...renderMarkdownSummaryList(scorecard.actualSummary),
      "",
    );

    if (scorecard.claims.length === 0) {
      lines.push("No claims were extracted from this answer.", "");
      return;
    }

    lines.push("#### Claim Verdicts", "");
    scorecard.claims.forEach((claim) => {
      lines.push(
        `- Claim ${claim.index + 1}: \`${claim.actualVerdict}\`${claim.expectedVerdict ? ` (expected \`${claim.expectedVerdict}\`)` : ""}`,
        `  ${claim.claimText}`,
      );
    });
    lines.push("");
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderEvaluationSummaryCsv(scorecards: EvaluationScorecard[]): string {
  const rows = [
    [
      "fixture_name",
      "fixture_path",
      "answer_path",
      "source_paths",
      "summary_match",
      "matched_claims",
      "total_expected_claims",
      "score",
      "has_mismatch",
      "expected_verified",
      "expected_contradicted",
      "expected_unsupported",
      "expected_needs_review",
      "actual_verified",
      "actual_contradicted",
      "actual_unsupported",
      "actual_needs_review",
    ],
    ...scorecards.map((scorecard) => [
      scorecard.fixtureName,
      scorecard.fixturePath ?? "",
      scorecard.answerPath,
      serializeDelimitedList(scorecard.sourcePaths),
      scorecard.summaryMatches ? "yes" : "no",
      scorecard.matchedClaims.toString(),
      scorecard.totalExpectedClaims.toString(),
      scorecard.score.toFixed(3),
      hasEvaluationMismatch(scorecard) ? "yes" : "no",
      scorecard.expectedSummary.verified.toString(),
      scorecard.expectedSummary.contradicted.toString(),
      scorecard.expectedSummary.unsupported.toString(),
      scorecard.expectedSummary.needs_review.toString(),
      scorecard.actualSummary.verified.toString(),
      scorecard.actualSummary.contradicted.toString(),
      scorecard.actualSummary.unsupported.toString(),
      scorecard.actualSummary.needs_review.toString(),
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function hasEvaluationMismatch(scorecard: EvaluationScorecard): boolean {
  return !scorecard.summaryMatches || scorecard.matchedClaims < scorecard.totalExpectedClaims;
}

function hasMatchingSummary(
  expected: Record<ClaimVerdict, number>,
  actual: Record<ClaimVerdict, number>,
): boolean {
  return (
    expected.verified === actual.verified &&
    expected.contradicted === actual.contradicted &&
    expected.unsupported === actual.unsupported &&
    expected.needs_review === actual.needs_review
  );
}

async function listEvaluationFixtureFiles(fixtureDirPath: string): Promise<string[]> {
  await ensureDirectoryPath(fixtureDirPath, "Evaluation fixture");
  const entries = await readdir(fixtureDirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.name.startsWith(".")) {
        return [];
      }

      const path = join(fixtureDirPath, entry.name);

      if (entry.isDirectory()) {
        return listEvaluationFixtureFiles(path);
      }

      if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
        return [path];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

async function ensureFilePath(path: string, label: string): Promise<void> {
  let pathStat;

  try {
    pathStat = await stat(path);
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new Error(`${label} file not found: ${path}`);
    }

    throw error;
  }

  if (!pathStat.isFile()) {
    throw new Error(`${label} path is not a file: ${path}`);
  }
}

function escapeCsvValue(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

function renderMarkdownSummaryList(summary: Record<ClaimVerdict, number>): string[] {
  return [
    `- Verified: ${summary.verified}`,
    `- Contradicted: ${summary.contradicted}`,
    `- Unsupported: ${summary.unsupported}`,
    `- Needs review: ${summary.needs_review}`,
  ];
}

async function ensureDirectoryPath(path: string, label: string): Promise<void> {
  let pathStat;

  try {
    pathStat = await stat(path);
  } catch (error) {
    if (isMissingPathError(error)) {
      throw new Error(`${label} directory not found: ${path}`);
    }

    throw error;
  }

  if (!pathStat.isDirectory()) {
    throw new Error(`${label} path is not a directory: ${path}`);
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
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
