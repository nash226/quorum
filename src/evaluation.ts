import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import { serializeDelimitedList } from "./csv-list.js";
import type { ClaimAssessment, ClaimVerdict, SourceTrustLevel, VerificationReport } from "./domain.js";
import { parseClaimVerdict } from "./report-policy.js";
import { parseSourceTrustLevel } from "./source-loader.js";
import {
  loadSourceDocuments,
  loadSourceDocumentsFromContent,
  resolveSourcePaths,
  type InMemorySourceInput,
  verifyAnswerFile,
} from "./workflow.js";

export interface EvaluationFixture {
  name: string;
  domain?: string;
  answerPath: string;
  answer?: string;
  answerLabel?: string;
  sourcePaths?: string[];
  sourceDirs?: string[];
  sources?: InMemorySourceInput[];
  defaultTrustLevel?: SourceTrustLevel;
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
  domain?: string;
  fixturePath?: string;
  answerPath: string;
  answerLabel?: string;
  answerPreview: string;
  /** Whether the evaluated answer produced at least one normalized claim. */
  answerHasClaims?: boolean;
  sourceDirs: string[];
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
  domains?: string[];
  generatedAt?: string;
  minScore?: number;
}

export interface SingleEvaluationFileOptions {
  fixturePath: string;
  generatedAt?: string;
}

export interface SingleEvaluationFileResultOptions {
  fixturePath: string;
  generatedAt?: string;
}

export interface EvaluationFixtureRunResult {
  scorecard: EvaluationScorecard;
  hasMismatch: boolean;
}

export type EvaluationFailureReason = "mismatch" | "min_score";

export interface EvaluationBatchRunResult {
  scorecards: EvaluationScorecard[];
  shouldFail: boolean;
  failureReasons: EvaluationFailureReason[];
  mismatchCount: number;
  summary: EvaluationAggregateSummary;
  minScore?: number;
  scoreThresholdPassed?: boolean;
}

export interface EvaluationAggregateSummary {
  fixtureCount: number;
  answersWithClaims: number;
  answersWithoutClaims: number;
  matchedClaims: number;
  totalExpectedClaims: number;
  score: number | null;
  scoreLabel: string;
  expectedSummary: Record<ClaimVerdict, number>;
  actualSummary: Record<ClaimVerdict, number>;
  domains: EvaluationDomainAggregateSummary[];
}

export interface EvaluationDomainAggregateSummary {
  domain: string;
  fixtureCount: number;
  mismatchCount: number;
  answersWithClaims: number;
  answersWithoutClaims: number;
  matchedClaims: number;
  totalExpectedClaims: number;
  score: number | null;
  scoreLabel: string;
  expectedSummary: Record<ClaimVerdict, number>;
  actualSummary: Record<ClaimVerdict, number>;
}

export interface InMemoryEvaluationBatchOptions {
  fixtures: EvaluationFixture[];
  baseDir?: string;
  baseDirs?: string[];
  fixturePaths?: string[];
  domains?: string[];
  generatedAt?: string;
  minScore?: number;
}

export interface InMemoryEvaluationFixtureInput {
  fixturePath: string;
  content: string | Uint8Array;
}

export interface InMemoryEvaluationFixtureFileBatchOptions {
  fixtures: InMemoryEvaluationFixtureInput[];
  domains?: string[];
  generatedAt?: string;
  minScore?: number;
}

export interface InMemoryEvaluationFixtureFileOptions {
  fixturePath: string;
  content: string | Uint8Array;
  generatedAt?: string;
}

export class EvaluationFixtureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationFixtureValidationError";
  }
}

export async function loadEvaluationFixture(fixturePath: string): Promise<EvaluationFixture> {
  return loadEvaluationFixtureFromContent(await readFile(fixturePath, "utf8"), fixturePath);
}

export function loadEvaluationFixtureFromContent(
  content: string | Uint8Array,
  fixturePath?: string,
): EvaluationFixture {
  const fixtureLabel = fixturePath
    ? `Evaluation fixture ${fixturePath}`
    : "Evaluation fixture";
  let parsed: unknown;

  try {
    parsed = JSON.parse(
      typeof content === "string" ? content : new TextDecoder().decode(content),
    );
  } catch {
    throw new EvaluationFixtureValidationError(`${fixtureLabel} must be valid JSON.`);
  }

  return validateEvaluationFixture(parsed, fixtureLabel);
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
  const answerPath = resolveFixtureMetadataPath(baseDir, fixture.answerPath);
  const sourceDirs = (fixture.sourceDirs ?? []).map((sourceDir) => resolve(baseDir, sourceDir));
  const sourcePaths = await resolveSourcePaths(
    (fixture.sourcePaths ?? []).map((sourcePath) => resolve(baseDir, sourcePath)),
    sourceDirs,
  );
  const inlineSources = (fixture.sources ?? []).map((source) => ({
    ...source,
    sourcePath: resolveFixtureMetadataPath(baseDir, source.sourcePath),
  }));
  const resolvedSourcePaths = dedupePathsInOrder([
    ...sourcePaths,
    ...inlineSources.map((source) => source.sourcePath),
  ]);
  const [fileSources, memorySources] = await Promise.all([
    sourcePaths.length > 0
      ? loadSourceDocuments({
          sourcePaths,
          sourceDirs: [],
          defaultTrustLevel: fixture.defaultTrustLevel,
        })
      : Promise.resolve([]),
    inlineSources.length > 0
      ? loadSourceDocumentsFromContent({
          sources: inlineSources,
          defaultTrustLevel: fixture.defaultTrustLevel,
        })
      : Promise.resolve([]),
  ]);
  const sources = [...fileSources, ...memorySources];

  if (sources.length === 0) {
    throw new Error("Evaluation fixture requires at least one source path, source directory, or in-memory source.");
  }

  const report =
    fixture.answer !== undefined
      ? verifyAnswer(
          fixture.answer,
          sources,
          options.generatedAt ?? new Date().toISOString(),
          answerPath,
        )
      : await verifyAnswerFile(
          answerPath,
          sources,
          options.generatedAt ?? new Date().toISOString(),
          fixture.answerLabel,
        );

  if (fixture.answer !== undefined && fixture.answerLabel !== undefined) {
    report.answerLabel = fixture.answerLabel;
  }
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
    domain: fixture.domain,
    fixturePath: options.fixturePath,
    answerPath,
    answerLabel: report.answerLabel,
    answerPreview: report.answerPreview,
    answerHasClaims: report.assessments.length > 0,
    sourceDirs,
    sourcePaths: resolvedSourcePaths,
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

export async function evaluateFixtureResult(
  fixture: EvaluationFixture,
  options: {
    baseDir?: string;
    fixturePath?: string;
    generatedAt?: string;
  } = {},
): Promise<EvaluationFixtureRunResult> {
  return buildEvaluationFixtureResult(await evaluateFixture(fixture, options));
}

export async function evaluateFixtureFile(
  fixturePath: string,
  options?: {
    generatedAt?: string;
  },
): Promise<EvaluationScorecard>;
export async function evaluateFixtureFile(
  options: SingleEvaluationFileOptions,
): Promise<EvaluationScorecard>;
export async function evaluateFixtureFile(
  fixturePathOrOptions: string | SingleEvaluationFileOptions,
  options: {
    generatedAt?: string;
  } = {},
): Promise<EvaluationScorecard> {
  const normalizedOptions = normalizeSingleEvaluationFileOptions(fixturePathOrOptions, options);
  const fixture = await loadEvaluationFixture(normalizedOptions.fixturePath);
  return evaluateFixture(fixture, {
    baseDir: dirname(normalizedOptions.fixturePath),
    fixturePath: normalizedOptions.fixturePath,
    generatedAt: normalizedOptions.generatedAt,
  });
}

export async function evaluateFixtureFileResult(
  fixturePath: string,
  options?: {
    generatedAt?: string;
  },
): Promise<EvaluationFixtureRunResult>;
export async function evaluateFixtureFileResult(
  options: SingleEvaluationFileResultOptions,
): Promise<EvaluationFixtureRunResult>;
export async function evaluateFixtureFileResult(
  fixturePathOrOptions: string | SingleEvaluationFileResultOptions,
  options: {
    generatedAt?: string;
  } = {},
): Promise<EvaluationFixtureRunResult> {
  const normalizedOptions = normalizeSingleEvaluationFileOptions(fixturePathOrOptions, options);
  return buildEvaluationFixtureResult(
    await evaluateFixtureFile(normalizedOptions),
  );
}

export async function evaluateFixtures(
  options: InMemoryEvaluationBatchOptions,
): Promise<EvaluationScorecard[]> {
  if (options.fixtures.length === 0) {
    throw new Error("At least one evaluation fixture is required.");
  }

  const selectedFixtures = selectEvaluationFixtures(options.fixtures, options.domains);

  if (selectedFixtures.length === 0) {
    throw new Error(renderNoMatchingEvaluationDomainsMessage(options.domains));
  }

  return Promise.all(
    selectedFixtures.map(({ fixture, index }) =>
      evaluateFixture(fixture, {
        baseDir: options.baseDirs?.[index] ?? options.baseDir,
        fixturePath: options.fixturePaths?.[index],
        generatedAt: options.generatedAt,
      }),
    ),
  );
}

export async function evaluateFixturesResult(
  options: InMemoryEvaluationBatchOptions,
): Promise<EvaluationBatchRunResult> {
  return buildEvaluationBatchResult(await evaluateFixtures(options), options.minScore);
}

export async function evaluateFixtureContents(
  options: InMemoryEvaluationFixtureFileBatchOptions,
): Promise<EvaluationScorecard[]> {
  if (options.fixtures.length === 0) {
    throw new Error("At least one in-memory evaluation fixture is required.");
  }

  return evaluateFixtures({
    fixtures: options.fixtures.map((fixture) =>
      loadEvaluationFixtureFromContent(fixture.content, fixture.fixturePath),
    ),
    baseDirs: options.fixtures.map((fixture) => dirname(fixture.fixturePath)),
    fixturePaths: options.fixtures.map((fixture) => fixture.fixturePath),
    domains: options.domains,
    generatedAt: options.generatedAt,
  });
}

export async function evaluateFixtureContentsResult(
  options: InMemoryEvaluationFixtureFileBatchOptions,
): Promise<EvaluationBatchRunResult> {
  return buildEvaluationBatchResult(await evaluateFixtureContents(options), options.minScore);
}

export async function evaluateFixtureContent(
  options: InMemoryEvaluationFixtureFileOptions,
): Promise<EvaluationScorecard> {
  const [scorecard] = await evaluateFixtureContents({
    fixtures: [
      {
        fixturePath: options.fixturePath,
        content: options.content,
      },
    ],
    generatedAt: options.generatedAt,
  });

  if (!scorecard) {
    throw new Error("Expected one evaluation scorecard.");
  }

  return scorecard;
}

export async function evaluateFixtureContentResult(
  options: InMemoryEvaluationFixtureFileOptions,
): Promise<EvaluationFixtureRunResult> {
  return buildEvaluationFixtureResult(await evaluateFixtureContent(options));
}

export async function evaluateFixtureFiles(
  options: EvaluationBatchOptions,
): Promise<EvaluationScorecard[]> {
  const fixturePaths = await resolveEvaluationFixturePaths(
    options.fixturePaths,
    options.fixtureDirPaths,
  );

  if (fixturePaths.length === 0) {
    const locations = [...options.fixturePaths, ...options.fixtureDirPaths].join(", ");
    throw new Error(`No evaluation fixture files found in ${locations}`);
  }

  await Promise.all(
    fixturePaths.map((fixturePath) => ensureFilePath(fixturePath, "Evaluation fixture")),
  );

  const fixtures = await Promise.all(
    fixturePaths.map(async (fixturePath) => ({
      fixturePath,
      fixture: await loadEvaluationFixture(fixturePath),
    })),
  );

  const selectedFixtures = selectEvaluationFixtures(
    fixtures.map(({ fixture }) => fixture),
    options.domains,
  );

  if (selectedFixtures.length === 0) {
    throw new Error(renderNoMatchingEvaluationDomainsMessage(options.domains));
  }

  return evaluateFixtures({
    fixtures: selectedFixtures.map(({ fixture }) => fixture),
    baseDirs: selectedFixtures.map(({ index }) => dirname(fixtures[index]!.fixturePath)),
    fixturePaths: selectedFixtures.map(({ index }) => fixtures[index]!.fixturePath),
    generatedAt: options.generatedAt,
  });
}

export async function evaluateFixtureFilesResult(
  options: EvaluationBatchOptions,
): Promise<EvaluationBatchRunResult> {
  return buildEvaluationBatchResult(await evaluateFixtureFiles(options), options.minScore);
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
    ...(scorecard.domain ? [`Domain: ${scorecard.domain}`] : []),
    `Generated at: ${scorecard.report.generatedAt}`,
    `Answer: ${scorecard.answerPath}`,
    ...(scorecard.answerLabel ? [`Answer label: ${scorecard.answerLabel}`] : []),
    `Answer has claims: ${scorecard.answerHasClaims ?? scorecard.claims.length > 0 ? "yes" : "no"}`,
    `Answer preview: ${scorecard.answerPreview || "No answer content provided."}`,
    ...(scorecard.sourceDirs.length > 0
      ? [`Source directories: ${scorecard.sourceDirs.join(", ")}`]
      : []),
    `Sources: ${scorecard.sourcePaths.join(", ")}`,
    ...(scorecard.report.sources.length > 0
      ? [`Source IDs: ${scorecard.report.sources.map((source) => source.id).join(", ")}`]
      : []),
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
  const aggregate = summarizeEvaluationScorecards(scorecards);
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
    `Answers with claims: ${aggregate.answersWithClaims}`,
    `Answers without claims: ${aggregate.answersWithoutClaims}`,
    `Fixtures with mismatches: ${mismatchCount}`,
    `Matched claim verdicts: ${aggregate.matchedClaims}/${aggregate.totalExpectedClaims}`,
    `Overall claim verdict score: ${aggregate.scoreLabel}`,
  );

  if (aggregate.domains.length > 0) {
    lines.push("", "Domain rollups:");

    aggregate.domains.forEach((domainSummary) => {
      lines.push(
        `- ${domainSummary.domain}: ${domainSummary.fixtureCount} fixture${domainSummary.fixtureCount === 1 ? "" : "s"}, ${domainSummary.answersWithClaims} with claims, ${domainSummary.answersWithoutClaims} without claims, ${domainSummary.mismatchCount} mismatch${domainSummary.mismatchCount === 1 ? "" : "es"}, ${domainSummary.matchedClaims}/${domainSummary.totalExpectedClaims} matched (${domainSummary.scoreLabel})`,
        `  Expected verdicts: ${renderSummaryCounts(domainSummary.expectedSummary)}`,
        `  Actual verdicts: ${renderSummaryCounts(domainSummary.actualSummary)}`,
      );
    });
  }

  return `${lines.join("\n")}\n`;
}

export function renderEvaluationMarkdownReport(scorecards: EvaluationScorecard[]): string {
  const mismatchCount = scorecards.filter(hasEvaluationMismatch).length;
  const aggregate = summarizeEvaluationScorecards(scorecards);
  const lines = [
    "# Quorum Evaluation Report",
    "",
    "## Summary",
    "",
    `- Generated at: ${summarizeGeneratedAtValues(scorecards)}`,
    `- Fixtures: ${scorecards.length}`,
    `- Answers with claims: ${aggregate.answersWithClaims}`,
    `- Answers without claims: ${aggregate.answersWithoutClaims}`,
    `- Fixtures with mismatches: ${mismatchCount}`,
    `- Matched claim verdicts: ${aggregate.matchedClaims}/${aggregate.totalExpectedClaims}`,
    `- Overall claim verdict score: ${aggregate.scoreLabel}`,
    "",
    ...(aggregate.domains.length > 0
      ? [
          "### Domain Rollups",
          "",
          ...aggregate.domains.map(
            (domainSummary) =>
              `- \`${domainSummary.domain}\`: ${domainSummary.fixtureCount} fixture${domainSummary.fixtureCount === 1 ? "" : "s"}, ${domainSummary.answersWithClaims} with claims, ${domainSummary.answersWithoutClaims} without claims, ${domainSummary.mismatchCount} mismatch${domainSummary.mismatchCount === 1 ? "" : "es"}, ${domainSummary.matchedClaims}/${domainSummary.totalExpectedClaims} matched (${domainSummary.scoreLabel})\n  - Expected verdicts: ${renderSummaryCounts(domainSummary.expectedSummary)}\n  - Actual verdicts: ${renderSummaryCounts(domainSummary.actualSummary)}`,
          ),
          "",
        ]
      : []),
    "## Fixtures",
    "",
  ];

  scorecards.forEach((scorecard, index) => {
    lines.push(
      `### ${index + 1}. ${scorecard.fixtureName}`,
      "",
      ...(scorecard.domain ? [`- Domain: \`${scorecard.domain}\``] : []),
      ...(scorecard.fixturePath ? [`- Fixture path: \`${scorecard.fixturePath}\``] : []),
      `- Answer path: \`${scorecard.answerPath}\``,
      ...(scorecard.answerLabel ? [`- Answer label: \`${scorecard.answerLabel}\``] : []),
      `- Answer has claims: ${scorecard.answerHasClaims ?? scorecard.claims.length > 0 ? "yes" : "no"}`,
      `- Answer preview: ${scorecard.answerPreview || "No answer content provided."}`,
      ...(scorecard.sourceDirs.length > 0
        ? [`- Source directories: ${scorecard.sourceDirs.map((sourceDir) => `\`${sourceDir}\``).join(", ")}`]
        : []),
      `- Sources: ${scorecard.sourcePaths.map((sourcePath) => `\`${sourcePath}\``).join(", ")}`,
      ...(scorecard.report.sources.length > 0
        ? [`- Source IDs: ${scorecard.report.sources.map((source) => `\`${source.id}\``).join(", ")}`]
        : []),
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

export function renderEvaluationHtmlReport(scorecards: EvaluationScorecard[]): string {
  const mismatchCount = scorecards.filter(hasEvaluationMismatch).length;
  const aggregate = summarizeEvaluationScorecards(scorecards);
  const domainCards =
    aggregate.domains.length === 0
      ? ""
      : `<section class="domain-rollups">
        <div class="section-heading">
          <p class="eyebrow">Benchmark groups</p>
          <h2>Domain rollups</h2>
        </div>
        <div class="domain-grid">
          ${aggregate.domains
            .map(
              (domainSummary) => `<article class="summary-card domain-card">
            <h3>${escapeHtml(domainSummary.domain)}</h3>
            <p>${domainSummary.fixtureCount} fixture${domainSummary.fixtureCount === 1 ? "" : "s"} with ${domainSummary.mismatchCount} mismatch${domainSummary.mismatchCount === 1 ? "" : "es"}.</p>
            <dl>
              <div><dt>Answers with claims</dt><dd>${domainSummary.answersWithClaims}</dd></div>
              <div><dt>Answers without claims</dt><dd>${domainSummary.answersWithoutClaims}</dd></div>
              <div><dt>Matched claims</dt><dd>${domainSummary.matchedClaims}/${domainSummary.totalExpectedClaims}</dd></div>
              <div><dt>Score</dt><dd>${domainSummary.scoreLabel}</dd></div>
            </dl>
            <p>Expected: ${escapeHtml(renderSummaryCounts(domainSummary.expectedSummary))}<br />Actual: ${escapeHtml(renderSummaryCounts(domainSummary.actualSummary))}</p>
          </article>`,
            )
            .join("")}
        </div>
      </section>`;
  const fixtureCards = scorecards
    .map((scorecard, index) => {
      const claimItems =
        scorecard.claims.length === 0
          ? `<p class="empty-state">No claims were extracted from this answer.</p>`
          : `<ul class="claim-list">${scorecard.claims
              .map((claim) => {
                const expectedVerdict = claim.expectedVerdict
                  ? `<span class="expected-chip">Expected ${escapeHtml(claim.expectedVerdict)}</span>`
                  : "";

                return `<li class="claim-item">
                  <div class="claim-header">
                    <span class="claim-index">Claim ${claim.index + 1}</span>
                    <div class="claim-badges">
                      <span class="verdict-chip verdict-${escapeHtml(claim.actualVerdict)}">${escapeHtml(claim.actualVerdict)}</span>
                      ${expectedVerdict}
                    </div>
                  </div>
                  <p>${escapeHtml(claim.claimText)}</p>
                </li>`;
              })
              .join("")}</ul>`;

      return `<article class="fixture-card">
        <div class="fixture-card-header">
          <div>
            <p class="eyebrow">Fixture ${index + 1}</p>
            <h2>${escapeHtml(scorecard.fixtureName)}</h2>
            ${
              scorecard.domain
                ? `<p class="fixture-domain">${escapeHtml(scorecard.domain)}</p>`
                : ""
            }
          </div>
          <span class="match-badge ${scorecard.summaryMatches ? "match-yes" : "match-no"}">
            ${scorecard.summaryMatches ? "Summary match" : "Summary mismatch"}
          </span>
        </div>
        <dl class="meta-grid">
          ${scorecard.fixturePath ? `<div><dt>Fixture path</dt><dd>${escapeHtml(scorecard.fixturePath)}</dd></div>` : ""}
          <div><dt>Answer path</dt><dd>${escapeHtml(scorecard.answerPath)}</dd></div>
          ${
            scorecard.answerLabel
              ? `<div><dt>Answer label</dt><dd>${escapeHtml(scorecard.answerLabel)}</dd></div>`
              : ""
          }
          <div><dt>Answer preview</dt><dd>${escapeHtml(scorecard.answerPreview || "No answer content provided.")}</dd></div>
          <div><dt>Answer has claims</dt><dd>${scorecard.answerHasClaims ?? scorecard.claims.length > 0 ? "yes" : "no"}</dd></div>
          ${
            scorecard.sourceDirs.length > 0
              ? `<div><dt>Source directories</dt><dd>${scorecard.sourceDirs.map(escapeHtml).join("<br />")}</dd></div>`
              : ""
          }
          <div><dt>Sources</dt><dd>${scorecard.sourcePaths.map(escapeHtml).join("<br />")}</dd></div>
          ${
            scorecard.report.sources.length > 0
              ? `<div><dt>Source IDs</dt><dd>${scorecard.report.sources.map((source) => escapeHtml(source.id)).join("<br />")}</dd></div>`
              : ""
          }
          <div><dt>Claim verdict score</dt><dd>${scorecard.matchedClaims}/${scorecard.totalExpectedClaims} (${Math.round(scorecard.score * 100)}%)</dd></div>
        </dl>
        <div class="summary-grid">
          <section class="summary-card">
            <h3>Expected summary</h3>
            <ul>
              ${renderHtmlSummaryList(scorecard.expectedSummary)}
            </ul>
          </section>
          <section class="summary-card">
            <h3>Actual summary</h3>
            <ul>
              ${renderHtmlSummaryList(scorecard.actualSummary)}
            </ul>
          </section>
        </div>
        <section class="claims-section">
          <h3>Claim verdicts</h3>
          ${claimItems}
        </section>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quorum Evaluation Report</title>
    <style>
      :root {
        color-scheme: light;
        --page-bg: #f4efe6;
        --surface: rgba(255, 252, 247, 0.96);
        --surface-strong: #fffdf8;
        --border: rgba(97, 73, 44, 0.18);
        --text: #20160f;
        --muted: #6f5a46;
        --accent: #9e5b2a;
        --accent-soft: rgba(158, 91, 42, 0.12);
        --good: #1f7a4d;
        --good-soft: rgba(31, 122, 77, 0.12);
        --bad: #a33f1f;
        --bad-soft: rgba(163, 63, 31, 0.12);
        --warn: #8b5e00;
        --warn-soft: rgba(139, 94, 0, 0.14);
        --shadow: 0 24px 60px rgba(54, 36, 21, 0.12);
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        background:
          radial-gradient(circle at top, rgba(158, 91, 42, 0.14), transparent 30rem),
          linear-gradient(180deg, #f7f2ea 0%, var(--page-bg) 100%);
        color: var(--text);
      }

      main {
        width: min(1100px, calc(100% - 2rem));
        margin: 0 auto;
        padding: 3rem 0 4rem;
      }

      .hero,
      .fixture-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 24px;
        box-shadow: var(--shadow);
      }

      .hero {
        padding: 2.25rem;
        margin-bottom: 1.5rem;
      }

      .eyebrow {
        margin: 0 0 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 0.8rem;
        color: var(--accent);
      }

      h1, h2, h3, p { margin-top: 0; }
      h1 { margin-bottom: 0.75rem; font-size: clamp(2.2rem, 3vw, 3.4rem); }
      h2 { margin-bottom: 0.5rem; font-size: clamp(1.5rem, 2vw, 2.1rem); }
      h3 { margin-bottom: 0.75rem; font-size: 1.05rem; }
      p, li, dd { line-height: 1.55; }

      .summary-strip {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.75rem;
        margin-top: 1.5rem;
      }

      .summary-stat,
      .summary-card,
      .domain-card {
        background: var(--surface-strong);
        border: 1px solid var(--border);
        border-radius: 18px;
        padding: 1rem 1.1rem;
      }

      .summary-stat span,
      dt {
        display: block;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .summary-stat strong {
        display: block;
        margin-top: 0.4rem;
        font-size: 1.8rem;
      }

      .fixture-list {
        display: grid;
        gap: 1.25rem;
      }

      .domain-rollups {
        margin-bottom: 1.5rem;
      }

      .section-heading {
        margin-bottom: 0.9rem;
      }

      .domain-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        gap: 0.9rem;
      }

      .domain-card h3 {
        margin-bottom: 0.45rem;
      }

      .domain-card p {
        margin-bottom: 1rem;
        color: var(--muted);
      }

      .domain-card dl {
        margin: 0;
        display: grid;
        gap: 0.75rem;
      }

      .fixture-domain {
        margin: 0;
        color: var(--muted);
        font-size: 0.95rem;
      }

      .fixture-card {
        padding: 1.5rem;
      }

      .fixture-card-header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: start;
      }

      .match-badge,
      .verdict-chip,
      .expected-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.3rem 0.75rem;
        font-size: 0.85rem;
        white-space: nowrap;
      }

      .match-yes {
        background: var(--good-soft);
        color: var(--good);
      }

      .match-no {
        background: var(--bad-soft);
        color: var(--bad);
      }

      .meta-grid,
      .summary-grid {
        display: grid;
        gap: 0.9rem;
      }

      .meta-grid {
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        margin: 1.25rem 0;
      }

      .meta-grid div {
        background: var(--surface-strong);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 0.9rem 1rem;
      }

      dd {
        margin: 0.35rem 0 0;
        font-size: 0.98rem;
      }

      .summary-grid {
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      }

      .summary-card ul,
      .claim-list {
        margin: 0;
        padding-left: 1.1rem;
      }

      .claims-section {
        margin-top: 1.25rem;
      }

      .claim-item {
        background: var(--surface-strong);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 1rem;
      }

      .claim-item + .claim-item {
        margin-top: 0.75rem;
      }

      .claim-header {
        display: flex;
        justify-content: space-between;
        gap: 0.75rem;
        align-items: start;
        margin-bottom: 0.75rem;
      }

      .claim-index {
        color: var(--muted);
        font-size: 0.92rem;
      }

      .claim-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .verdict-verified {
        background: var(--good-soft);
        color: var(--good);
      }

      .verdict-contradicted,
      .verdict-unsupported {
        background: var(--bad-soft);
        color: var(--bad);
      }

      .verdict-needs_review {
        background: var(--warn-soft);
        color: var(--warn);
      }

      .expected-chip {
        background: var(--accent-soft);
        color: var(--accent);
      }

      .empty-state {
        margin: 0;
        color: var(--muted);
      }

      @media (max-width: 720px) {
        main {
          width: min(100% - 1rem, 1100px);
          padding-top: 1rem;
        }

        .hero,
        .fixture-card {
          border-radius: 20px;
          padding: 1.2rem;
        }

        .fixture-card-header,
        .claim-header {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <p class="eyebrow">Quorum evaluation</p>
        <h1>Fixture scorecard report</h1>
        <p>Review benchmark fixtures, compare expected and actual verdict totals, and spot claim-level drift before workflow changes ship.</p>
        <p class="generated-at">Generated at ${escapeHtml(summarizeGeneratedAtValues(scorecards))}</p>
        <div class="summary-strip">
          <article class="summary-stat">
            <span>Fixtures</span>
            <strong>${scorecards.length}</strong>
          </article>
          <article class="summary-stat">
            <span>Answers With Claims</span>
            <strong>${aggregate.answersWithClaims}</strong>
          </article>
          <article class="summary-stat">
            <span>Answers Without Claims</span>
            <strong>${aggregate.answersWithoutClaims}</strong>
          </article>
          <article class="summary-stat">
            <span>Mismatches</span>
            <strong>${mismatchCount}</strong>
          </article>
          <article class="summary-stat">
            <span>Matched Claim Verdicts</span>
            <strong>${aggregate.matchedClaims}/${aggregate.totalExpectedClaims}</strong>
          </article>
          <article class="summary-stat">
            <span>Overall Claim Verdict Score</span>
            <strong>${aggregate.scoreLabel}</strong>
          </article>
        </div>
      </section>
      ${domainCards}
      <section class="fixture-list">
        ${fixtureCards}
      </section>
    </main>
  </body>
</html>`;
}

export function renderEvaluationSummaryCsv(scorecards: EvaluationScorecard[]): string {
  const rows = [
    [
      "generated_at",
      "fixture_name",
      "domain",
      "fixture_path",
      "answer_path",
      "answer_label",
      "answer_preview",
      "answer_has_claims",
      "source_dirs",
      "source_paths",
      "source_ids",
      "summary_match",
      "matched_claims",
      "total_expected_claims",
      "score",
      "has_mismatch",
      "mismatch_type",
      "first_mismatch_claim_index",
      "first_mismatch_claim_text",
      "first_mismatch_expected_verdict",
      "first_mismatch_actual_verdict",
      "first_mismatch_evidence_title",
      "first_mismatch_evidence_trust_level",
      "first_mismatch_evidence_updated_at",
      "first_mismatch_evidence_source_path",
      "first_mismatch_evidence_source_id",
      "first_mismatch_evidence_score",
      "first_mismatch_evidence_quote",
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
      scorecard.report.generatedAt,
      scorecard.fixtureName,
      scorecard.domain ?? "",
      scorecard.fixturePath ?? "",
      scorecard.answerPath,
      scorecard.answerLabel ?? "",
      scorecard.answerPreview,
      (scorecard.answerHasClaims ?? scorecard.claims.length > 0) ? "yes" : "no",
      serializeDelimitedList(scorecard.sourceDirs),
      serializeDelimitedList(scorecard.sourcePaths),
      serializeDelimitedList(scorecard.report.sources.map((source) => source.id)),
      scorecard.summaryMatches ? "yes" : "no",
      scorecard.matchedClaims.toString(),
      scorecard.totalExpectedClaims.toString(),
      scorecard.score.toFixed(3),
      hasEvaluationMismatch(scorecard) ? "yes" : "no",
      evaluationMismatchType(scorecard),
      renderFirstMismatchClaimIndex(scorecard),
      renderFirstMismatchClaimText(scorecard),
      renderFirstMismatchExpectedVerdict(scorecard),
      renderFirstMismatchActualVerdict(scorecard),
      renderFirstMismatchEvidenceTitle(scorecard),
      renderFirstMismatchEvidenceTrustLevel(scorecard),
      renderFirstMismatchEvidenceUpdatedAt(scorecard),
      renderFirstMismatchEvidenceSourcePath(scorecard),
      renderFirstMismatchEvidenceSourceId(scorecard),
      renderFirstMismatchEvidenceScore(scorecard),
      renderFirstMismatchEvidenceQuote(scorecard),
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

export function renderEvaluationDomainSummaryCsv(scorecards: EvaluationScorecard[]): string {
  const aggregate = summarizeEvaluationScorecards(scorecards);
  const generatedAt = summarizeGeneratedAtValues(scorecards);
  const rows = [
    [
      "generated_at",
      "domain",
      "fixture_count",
      "mismatch_count",
      "answers_with_claims",
      "answers_without_claims",
      "matched_claims",
      "total_expected_claims",
      "score",
      "score_label",
      "expected_verified",
      "expected_contradicted",
      "expected_unsupported",
      "expected_needs_review",
      "actual_verified",
      "actual_contradicted",
      "actual_unsupported",
      "actual_needs_review",
    ],
    ...aggregate.domains.map((domainSummary) => [
      generatedAt,
      domainSummary.domain,
      domainSummary.fixtureCount.toString(),
      domainSummary.mismatchCount.toString(),
      domainSummary.answersWithClaims.toString(),
      domainSummary.answersWithoutClaims.toString(),
      domainSummary.matchedClaims.toString(),
      domainSummary.totalExpectedClaims.toString(),
      domainSummary.score === null ? "" : domainSummary.score.toFixed(3),
      domainSummary.scoreLabel,
      domainSummary.expectedSummary.verified.toString(),
      domainSummary.expectedSummary.contradicted.toString(),
      domainSummary.expectedSummary.unsupported.toString(),
      domainSummary.expectedSummary.needs_review.toString(),
      domainSummary.actualSummary.verified.toString(),
      domainSummary.actualSummary.contradicted.toString(),
      domainSummary.actualSummary.unsupported.toString(),
      domainSummary.actualSummary.needs_review.toString(),
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function renderEvaluationAggregateSummaryCsv(scorecards: EvaluationScorecard[]): string {
  const aggregate = summarizeEvaluationScorecards(scorecards);
  const mismatchCount = scorecards.filter(hasEvaluationMismatch).length;
  const generatedAt = summarizeGeneratedAtValues(scorecards);
  const rows = [
    [
      "generated_at",
      "fixture_count",
      "answers_with_claims",
      "answers_without_claims",
      "mismatch_count",
      "matched_claims",
      "total_expected_claims",
      "score",
      "score_label",
      "domains",
      "domain_fixture_counts",
      "domain_mismatch_counts",
      "domain_answers_with_claims",
      "domain_answers_without_claims",
      "domain_scores",
      "domain_score_labels",
      "expected_verified",
      "expected_contradicted",
      "expected_unsupported",
      "expected_needs_review",
      "actual_verified",
      "actual_contradicted",
      "actual_unsupported",
      "actual_needs_review",
    ],
    [
      generatedAt,
      aggregate.fixtureCount.toString(),
      aggregate.answersWithClaims.toString(),
      aggregate.answersWithoutClaims.toString(),
      mismatchCount.toString(),
      aggregate.matchedClaims.toString(),
      aggregate.totalExpectedClaims.toString(),
      aggregate.score === null ? "" : aggregate.score.toFixed(3),
      aggregate.scoreLabel,
      serializeDelimitedList(aggregate.domains.map((domainSummary) => domainSummary.domain)),
      serializeDelimitedList(
        aggregate.domains.map((domainSummary) => domainSummary.fixtureCount.toString()),
      ),
      serializeDelimitedList(
        aggregate.domains.map((domainSummary) => domainSummary.mismatchCount.toString()),
      ),
      serializeDelimitedList(
        aggregate.domains.map((domainSummary) => domainSummary.answersWithClaims.toString()),
      ),
      serializeDelimitedList(
        aggregate.domains.map((domainSummary) => domainSummary.answersWithoutClaims.toString()),
      ),
      serializeDelimitedList(
        aggregate.domains.map((domainSummary) =>
          domainSummary.score === null ? "" : domainSummary.score.toFixed(3),
        ),
      ),
      serializeDelimitedList(aggregate.domains.map((domainSummary) => domainSummary.scoreLabel)),
      aggregate.expectedSummary.verified.toString(),
      aggregate.expectedSummary.contradicted.toString(),
      aggregate.expectedSummary.unsupported.toString(),
      aggregate.expectedSummary.needs_review.toString(),
      aggregate.actualSummary.verified.toString(),
      aggregate.actualSummary.contradicted.toString(),
      aggregate.actualSummary.unsupported.toString(),
      aggregate.actualSummary.needs_review.toString(),
    ],
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function hasEvaluationMismatch(scorecard: EvaluationScorecard): boolean {
  return !scorecard.summaryMatches || scorecard.matchedClaims < scorecard.totalExpectedClaims;
}

function scorecardHasClaims(scorecard: EvaluationScorecard): boolean {
  return scorecard.answerHasClaims ?? scorecard.claims.length > 0;
}

function validateEvaluationFixture(
  value: unknown,
  fixtureLabel: string,
): EvaluationFixture {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new EvaluationFixtureValidationError(`${fixtureLabel} must be a JSON object.`);
  }

  const record = value as Record<string, unknown>;
  const sourcePaths = optionalStringArray(record.sourcePaths, `${fixtureLabel}.sourcePaths`);
  const sourceDirs = optionalStringArray(record.sourceDirs, `${fixtureLabel}.sourceDirs`);
  const sources = optionalFixtureSources(record.sources, `${fixtureLabel}.sources`);

  if (sourcePaths.length === 0 && sourceDirs.length === 0 && sources.length === 0) {
    throw new EvaluationFixtureValidationError(
      `${fixtureLabel} requires at least one source path, source directory, or in-memory source.`,
    );
  }

  const expectedSummary = parseExpectedSummary(record.expectedSummary, fixtureLabel);
  const expectedClaimVerdicts = parseExpectedClaimVerdicts(
    record.expectedClaimVerdicts,
    fixtureLabel,
  );

  validateExpectedClaimTotals(expectedSummary, expectedClaimVerdicts, fixtureLabel);

  return {
    name: requireNonEmptyString(record.name, `${fixtureLabel}.name`),
    domain: optionalNonEmptyString(record.domain, `${fixtureLabel}.domain`),
    answerPath: requireNonEmptyString(record.answerPath, `${fixtureLabel}.answerPath`),
    answer: optionalNonEmptyString(record.answer, `${fixtureLabel}.answer`),
    answerLabel: optionalNonEmptyString(record.answerLabel, `${fixtureLabel}.answerLabel`),
    sourcePaths: record.sourcePaths === undefined ? undefined : sourcePaths,
    sourceDirs: record.sourceDirs === undefined ? undefined : sourceDirs,
    sources: record.sources === undefined ? undefined : sources,
    defaultTrustLevel: optionalFixtureTrustLevel(
      record.defaultTrustLevel,
      `${fixtureLabel}.defaultTrustLevel`,
    ),
    expectedSummary,
    expectedClaimVerdicts,
  };
}

function buildEvaluationFixtureResult(
  scorecard: EvaluationScorecard,
): EvaluationFixtureRunResult {
  return {
    scorecard,
    hasMismatch: hasEvaluationMismatch(scorecard),
  };
}

function buildEvaluationBatchResult(
  scorecards: EvaluationScorecard[],
  minScore?: number,
): EvaluationBatchRunResult {
  const mismatchCount = scorecards.filter(hasEvaluationMismatch).length;
  const summary = summarizeEvaluationScorecards(scorecards);
  const scoreThresholdPassed =
    minScore === undefined || (summary.score !== null && summary.score >= minScore);
  const failureReasons: EvaluationFailureReason[] = [];

  if (mismatchCount > 0) {
    failureReasons.push("mismatch");
  }

  if (!scoreThresholdPassed) {
    failureReasons.push("min_score");
  }

  return {
    scorecards,
    shouldFail: failureReasons.length > 0,
    failureReasons,
    mismatchCount,
    summary,
    ...(minScore === undefined ? {} : { minScore, scoreThresholdPassed }),
  };
}

function evaluationMismatchType(scorecard: EvaluationScorecard): string {
  if (firstClaimMismatch(scorecard)) {
    return "claim_verdict";
  }

  if (!scorecard.summaryMatches) {
    return "summary";
  }

  return "none";
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new EvaluationFixtureValidationError(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function optionalNonEmptyString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(value, fieldName);
}

function optionalStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new EvaluationFixtureValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) => requireNonEmptyString(entry, `${fieldName}[${index}]`));
}

function optionalFixtureSources(value: unknown, fieldName: string): InMemorySourceInput[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new EvaluationFixtureValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) => {
    const sourceFieldName = `${fieldName}[${index}]`;

    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new EvaluationFixtureValidationError(`${sourceFieldName} must be a JSON object.`);
    }

    const record = entry as Record<string, unknown>;

    return {
      sourcePath: requireNonEmptyString(record.sourcePath, `${sourceFieldName}.sourcePath`),
      content: requireNonEmptyString(record.content, `${sourceFieldName}.content`),
      id: optionalNonEmptyString(record.id, `${sourceFieldName}.id`),
      title: optionalNonEmptyString(record.title, `${sourceFieldName}.title`),
      updatedAt: optionalNonEmptyString(record.updatedAt, `${sourceFieldName}.updatedAt`),
      trustLevel: optionalFixtureTrustLevel(record.trustLevel, `${sourceFieldName}.trustLevel`),
    };
  });
}

function optionalFixtureTrustLevel(
  value: unknown,
  fieldName: string,
): SourceTrustLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    return parseSourceTrustLevel(requireNonEmptyString(value, fieldName));
  } catch (error) {
    if (error instanceof Error) {
      throw new EvaluationFixtureValidationError(`${fieldName} ${error.message.toLowerCase()}.`);
    }

    throw error;
  }
}

function parseExpectedSummary(
  value: unknown,
  fixtureLabel: string,
): Record<ClaimVerdict, number> {
  const fieldName = `${fixtureLabel}.expectedSummary`;

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new EvaluationFixtureValidationError(`${fieldName} must be a JSON object.`);
  }

  const record = value as Record<string, unknown>;

  return {
    verified: requireNonNegativeInteger(record.verified, `${fieldName}.verified`),
    contradicted: requireNonNegativeInteger(record.contradicted, `${fieldName}.contradicted`),
    unsupported: requireNonNegativeInteger(record.unsupported, `${fieldName}.unsupported`),
    needs_review: requireNonNegativeInteger(record.needs_review, `${fieldName}.needs_review`),
  };
}

function parseExpectedClaimVerdicts(
  value: unknown,
  fixtureLabel: string,
): ClaimVerdict[] | undefined {
  const fieldName = `${fixtureLabel}.expectedClaimVerdicts`;

  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new EvaluationFixtureValidationError(`${fieldName} must be an array.`);
  }

  return value.map((entry, index) => {
    try {
      return parseClaimVerdict(requireNonEmptyString(entry, `${fieldName}[${index}]`));
    } catch (error) {
      if (error instanceof Error) {
        throw new EvaluationFixtureValidationError(
          `${fieldName}[${index}] ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`,
        );
      }

      throw error;
    }
  });
}

function validateExpectedClaimTotals(
  expectedSummary: Record<ClaimVerdict, number>,
  expectedClaimVerdicts: ClaimVerdict[] | undefined,
  fixtureLabel: string,
): void {
  if (expectedClaimVerdicts === undefined) {
    return;
  }

  const expectedClaimCount =
    expectedSummary.verified +
    expectedSummary.contradicted +
    expectedSummary.unsupported +
    expectedSummary.needs_review;

  if (expectedClaimVerdicts.length !== expectedClaimCount) {
    throw new EvaluationFixtureValidationError(
      `${fixtureLabel}.expectedClaimVerdicts must include ${expectedClaimCount} entries to match the totals in ${fixtureLabel}.expectedSummary.`,
    );
  }

  const verdictCounts = expectedClaimVerdicts.reduce<Record<ClaimVerdict, number>>(
    (counts, verdict) => {
      counts[verdict] += 1;
      return counts;
    },
    { verified: 0, contradicted: 0, unsupported: 0, needs_review: 0 },
  );

  if (!hasMatchingSummary(expectedSummary, verdictCounts)) {
    throw new EvaluationFixtureValidationError(
      `${fixtureLabel}.expectedClaimVerdicts counts must match the totals in ${fixtureLabel}.expectedSummary.`,
    );
  }
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new EvaluationFixtureValidationError(
      `${fieldName} must be a non-negative integer.`,
    );
  }

  return value as number;
}

function renderFirstMismatchClaimIndex(scorecard: EvaluationScorecard): string {
  const mismatch = firstClaimMismatch(scorecard);
  return mismatch ? (mismatch.index + 1).toString() : "";
}

function renderFirstMismatchClaimText(scorecard: EvaluationScorecard): string {
  return firstClaimMismatch(scorecard)?.claimText ?? "";
}

function renderFirstMismatchExpectedVerdict(scorecard: EvaluationScorecard): string {
  return firstClaimMismatch(scorecard)?.expectedVerdict ?? "";
}

function renderFirstMismatchActualVerdict(scorecard: EvaluationScorecard): string {
  return firstClaimMismatch(scorecard)?.actualVerdict ?? "";
}

function renderFirstMismatchEvidenceTitle(scorecard: EvaluationScorecard): string {
  return firstMismatchEvidence(scorecard)?.documentTitle ?? "";
}

function renderFirstMismatchEvidenceTrustLevel(scorecard: EvaluationScorecard): string {
  return firstMismatchEvidence(scorecard)?.documentTrustLevel ?? "";
}

function renderFirstMismatchEvidenceUpdatedAt(scorecard: EvaluationScorecard): string {
  return firstMismatchEvidence(scorecard)?.documentUpdatedAt ?? "";
}

function renderFirstMismatchEvidenceSourcePath(scorecard: EvaluationScorecard): string {
  return firstMismatchEvidence(scorecard)?.documentPath ?? "";
}

function renderFirstMismatchEvidenceSourceId(scorecard: EvaluationScorecard): string {
  return firstMismatchEvidence(scorecard)?.documentId ?? "";
}

function renderFirstMismatchEvidenceScore(scorecard: EvaluationScorecard): string {
  const evidence = firstMismatchEvidence(scorecard);
  return evidence ? evidence.score.toFixed(3) : "";
}

function renderFirstMismatchEvidenceQuote(scorecard: EvaluationScorecard): string {
  return firstMismatchEvidence(scorecard)?.quote ?? "";
}

function firstClaimMismatch(scorecard: EvaluationScorecard): EvaluationClaimScore | undefined {
  return scorecard.claims.find(
    (claim) => claim.expectedVerdict !== undefined && !claim.matches,
  );
}

function firstMismatchAssessment(scorecard: EvaluationScorecard): ClaimAssessment | undefined {
  const mismatch = firstClaimMismatch(scorecard);

  if (!mismatch) {
    return undefined;
  }

  return scorecard.report.assessments[mismatch.index];
}

function firstMismatchEvidence(scorecard: EvaluationScorecard) {
  return firstMismatchAssessment(scorecard)?.evidence[0];
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

function selectEvaluationFixtures(
  fixtures: EvaluationFixture[],
  domains: string[] | undefined,
): Array<{ fixture: EvaluationFixture; index: number }> {
  const domainFilter = domains?.length ? new Set(domains) : undefined;

  return fixtures
    .map((fixture, index) => ({ fixture, index }))
    .filter(({ fixture }) => {
      if (!domainFilter) {
        return true;
      }

      return fixture.domain !== undefined && domainFilter.has(fixture.domain);
    });
}

function renderNoMatchingEvaluationDomainsMessage(domains: string[] | undefined): string {
  return `No evaluation fixtures matched domain filter: ${(domains ?? []).join(", ")}`;
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

function renderHtmlSummaryList(summary: Record<ClaimVerdict, number>): string {
  return [
    `<li>Verified: ${summary.verified}</li>`,
    `<li>Contradicted: ${summary.contradicted}</li>`,
    `<li>Unsupported: ${summary.unsupported}</li>`,
    `<li>Needs review: ${summary.needs_review}</li>`,
  ].join("");
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

function normalizeSingleEvaluationFileOptions(
  fixturePathOrOptions: string | SingleEvaluationFileOptions,
  options: {
    generatedAt?: string;
  } = {},
): SingleEvaluationFileOptions {
  if (typeof fixturePathOrOptions === "string") {
    return {
      fixturePath: fixturePathOrOptions,
      generatedAt: options.generatedAt,
    };
  }

  return fixturePathOrOptions;
}

function resolveFixtureMetadataPath(baseDir: string, filePath: string): string {
  return filePath.startsWith("<") ? filePath : resolve(baseDir, filePath);
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines];

  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }

  return trimmed;
}

export function summarizeEvaluationScorecards(
  scorecards: EvaluationScorecard[],
): EvaluationAggregateSummary {
  const matchedClaims = scorecards.reduce(
    (total, scorecard) => total + scorecard.matchedClaims,
    0,
  );
  const totalExpectedClaims = scorecards.reduce(
    (total, scorecard) => total + scorecard.totalExpectedClaims,
    0,
  );
  const expectedSummary = sumEvaluationSummaries(scorecards, "expectedSummary");
  const actualSummary = sumEvaluationSummaries(scorecards, "actualSummary");
  const domains = Array.from(
    scorecards.reduce((groups, scorecard) => {
      if (!scorecard.domain) {
        return groups;
      }

      const group = groups.get(scorecard.domain) ?? [];
      group.push(scorecard);
      groups.set(scorecard.domain, group);
      return groups;
    }, new Map<string, EvaluationScorecard[]>()),
  )
    .sort(([leftDomain], [rightDomain]) => leftDomain.localeCompare(rightDomain))
    .map(([domain, domainScorecards]) => {
      const domainMatchedClaims = domainScorecards.reduce(
        (total, scorecard) => total + scorecard.matchedClaims,
        0,
      );
      const domainTotalExpectedClaims = domainScorecards.reduce(
        (total, scorecard) => total + scorecard.totalExpectedClaims,
        0,
      );
      const mismatchCount = domainScorecards.filter(hasEvaluationMismatch).length;
      const answersWithClaims = domainScorecards.filter(scorecardHasClaims).length;
      const expectedSummary = sumEvaluationSummaries(domainScorecards, "expectedSummary");
      const actualSummary = sumEvaluationSummaries(domainScorecards, "actualSummary");
      const score =
        domainTotalExpectedClaims > 0
          ? domainMatchedClaims / domainTotalExpectedClaims
          : null;

      return {
        domain,
        fixtureCount: domainScorecards.length,
        mismatchCount,
        answersWithClaims,
        answersWithoutClaims: domainScorecards.length - answersWithClaims,
        matchedClaims: domainMatchedClaims,
        totalExpectedClaims: domainTotalExpectedClaims,
        score,
        scoreLabel:
          score === null ? "n/a" : `${Math.round((domainMatchedClaims / domainTotalExpectedClaims) * 100)}%`,
        expectedSummary,
        actualSummary,
      };
    });

  return {
    fixtureCount: scorecards.length,
    answersWithClaims: scorecards.filter(scorecardHasClaims).length,
    answersWithoutClaims: scorecards.filter((scorecard) => !scorecardHasClaims(scorecard)).length,
    matchedClaims,
    totalExpectedClaims,
    score: totalExpectedClaims > 0 ? matchedClaims / totalExpectedClaims : null,
    scoreLabel:
      totalExpectedClaims > 0 ? `${Math.round((matchedClaims / totalExpectedClaims) * 100)}%` : "n/a",
    expectedSummary,
    actualSummary,
    domains,
  };
}

function sumEvaluationSummaries(
  scorecards: EvaluationScorecard[],
  key: "expectedSummary" | "actualSummary",
): Record<ClaimVerdict, number> {
  return scorecards.reduce(
    (summary, scorecard) => {
      for (const verdict of ["verified", "contradicted", "unsupported", "needs_review"] as const) {
        summary[verdict] += scorecard[key][verdict];
      }
      return summary;
    },
    { verified: 0, contradicted: 0, unsupported: 0, needs_review: 0 },
  );
}

function renderSummaryCounts(summary: Record<ClaimVerdict, number>): string {
  return `verified=${summary.verified}, contradicted=${summary.contradicted}, unsupported=${summary.unsupported}, needs_review=${summary.needs_review}`;
}

function summarizeGeneratedAtValues(scorecards: EvaluationScorecard[]): string {
  return serializeDelimitedList(
    Array.from(new Set(scorecards.map((scorecard) => scorecard.report.generatedAt))),
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
