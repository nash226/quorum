import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
