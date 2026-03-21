import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { verifyAnswer } from "./claim-verifier.js";
import type {
  BatchVerificationReport,
  BatchVerificationRunResult,
  BatchVerificationResult,
  ClaimVerdict,
  SingleVerificationResult,
  SourceDocument,
  SourceTrustLevel,
  VerificationReport,
} from "./domain.js";
import { matchingFailVerdicts } from "./report-policy.js";
import { renderAnswerLabels, stripByteOrderMark } from "./text.js";
import { sourceDocumentFromFile } from "./source-loader.js";
import {
  importReviewerDecisions,
  importReviewerDecisionsResult,
  type ReviewerDecisionImportReport,
  type ReviewerDecisionImportResult,
} from "./reviewer-decision-import.js";

export interface SourceLoadOptions {
  sourcePaths: string[];
  sourceDirs: string[];
  sourceIdsByPath?: Record<string, string>;
  defaultTrustLevel?: SourceTrustLevel;
}

export interface InMemorySourceInput {
  sourcePath: string;
  content: string | Uint8Array;
  /** Stable caller-owned identifier preserved in evidence and reports. */
  id?: string;
  title?: string;
  updatedAt?: string;
  trustLevel?: SourceTrustLevel;
}

export interface InMemorySourceLoadOptions {
  sources: InMemorySourceInput[];
  defaultTrustLevel?: SourceTrustLevel;
}

export interface BatchVerificationOptions {
  answerPaths: string[];
  answerDirPaths: string[];
  answerLabelsByPath?: Record<string, string>;
  sources: SourceDocument[];
  failOn?: ClaimVerdict[];
  generatedAt?: string;
}

export interface InMemoryAnswerInput {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
}

export interface InMemoryContentAnswerInput {
  answer: string | Uint8Array;
  answerPath?: string;
  answerLabel?: string;
}

export interface InMemoryBatchVerificationOptions {
  answers: InMemoryAnswerInput[];
  sources: SourceDocument[];
  failOn?: ClaimVerdict[];
  generatedAt?: string;
}

export interface InMemoryBatchContentVerificationOptions {
  answers: InMemoryContentAnswerInput[];
  sources: InMemorySourceInput[];
  defaultTrustLevel?: SourceTrustLevel;
  failOn?: ClaimVerdict[];
  generatedAt?: string;
}

export interface InMemorySingleVerificationOptions {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
  sources: InMemorySourceInput[];
  defaultTrustLevel?: SourceTrustLevel;
  generatedAt?: string;
}

export interface InMemorySingleVerificationResultOptions
  extends InMemorySingleVerificationOptions {
  failOn?: ClaimVerdict[];
}

export interface InMemoryContentSingleVerificationOptions
  extends Omit<InMemorySingleVerificationOptions, "answer"> {
  answer: string | Uint8Array;
}

export interface InMemoryContentSingleVerificationResultOptions
  extends InMemoryContentSingleVerificationOptions {
  failOn?: ClaimVerdict[];
}

export interface SingleFileVerificationOptions {
  answerPath: string;
  answerLabel?: string;
  sources: SourceDocument[];
  failOn?: ClaimVerdict[];
  generatedAt?: string;
}

export interface SingleFileReportOptions {
  answerPath: string;
  answerLabel?: string;
  sources: SourceDocument[];
  generatedAt?: string;
}

export interface SingleFileInputVerificationOptions extends SourceLoadOptions {
  answerPath: string;
  answerLabel?: string;
  generatedAt?: string;
}

export interface SingleFileInputVerificationResultOptions
  extends SingleFileInputVerificationOptions {
  failOn?: ClaimVerdict[];
}

export interface BatchFileInputVerificationOptions extends SourceLoadOptions {
  answerPaths: string[];
  answerDirPaths: string[];
  answerLabelsByPath?: Record<string, string>;
  failOn?: ClaimVerdict[];
  generatedAt?: string;
}

export interface BatchFileInputVerificationResultOptions
  extends BatchFileInputVerificationOptions {
  failOn?: ClaimVerdict[];
}

export interface SingleVerificationResultOptions {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
  sources: SourceDocument[];
  failOn?: ClaimVerdict[];
  generatedAt?: string;
}

export interface ReviewerDecisionContentImportOptions {
  reviewCsvContent: string;
  generatedAt?: string;
}

export interface ReviewerDecisionContentImportResultOptions
  extends ReviewerDecisionContentImportOptions {
  failOn?: ClaimVerdict[];
}

export interface ReviewerDecisionFileImportOptions {
  reviewCsvPath: string;
  generatedAt?: string;
}

export interface ReviewerDecisionFileImportResultOptions
  extends ReviewerDecisionFileImportOptions {
  failOn?: ClaimVerdict[];
}

export const SOURCE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".pdf", ".docx"]);
export const ANSWER_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
  ".pdf",
  ".docx",
]);
export const STDIN_ANSWER_PATH = "<stdin>";

export async function resolveSourcePaths(
  sourcePaths: string[],
  sourceDirs: string[],
): Promise<string[]> {
  await Promise.all(sourcePaths.map((sourcePath) => ensureFilePath(sourcePath, "Approved source")));
  const directoryFiles = (
    await Promise.all(sourceDirs.map((sourceDir) => listSourceFiles(sourceDir)))
  ).flat();

  return dedupePathsInOrder([...sourcePaths, ...directoryFiles]);
}

export async function resolveAnswerPaths(
  answerPaths: string[],
  answerDirs: string[],
): Promise<string[]> {
  await Promise.all(
    answerPaths
      .filter((answerPath) => answerPath !== "-")
      .map((answerPath) => ensureFilePath(answerPath, "Answer")),
  );
  const directoryFiles = (
    await Promise.all(answerDirs.map((answerDir) => listAnswerFiles(answerDir)))
  ).flat();

  return dedupePathsInOrder([...answerPaths, ...directoryFiles]);
}

export async function loadSourceDocuments(
  options: SourceLoadOptions,
): Promise<SourceDocument[]> {
  const sourcePaths = await resolveSourcePaths(options.sourcePaths, options.sourceDirs);

  if (sourcePaths.length === 0) {
    const locations = [...options.sourcePaths, ...options.sourceDirs].join(", ");
    throw new Error(`No approved source files found in ${locations}`);
  }

  return Promise.all(
    sourcePaths.map(async (sourcePath, index) => {
      const content = await readFile(sourcePath);
      return sourceDocumentFromFile(sourcePath, content, index, {
        id: options.sourceIdsByPath?.[sourcePath],
        defaultTrustLevel: options.defaultTrustLevel,
      });
    }),
  );
}

export async function loadSourceDocumentsFromContent(
  options: InMemorySourceLoadOptions,
): Promise<SourceDocument[]> {
  if (options.sources.length === 0) {
    throw new Error("At least one in-memory source is required.");
  }

  return Promise.all(
    options.sources.map((source, index) => {
      if (typeof source.content === "string") {
        return sourceDocumentFromFile(source.sourcePath, source.content, index, {
          id: source.id,
          defaultTrustLevel: options.defaultTrustLevel,
          title: source.title,
          updatedAt: source.updatedAt,
          trustLevel: source.trustLevel,
        });
      }

      return sourceDocumentFromFile(source.sourcePath, source.content, index, {
        id: source.id,
        defaultTrustLevel: options.defaultTrustLevel,
        title: source.title,
        updatedAt: source.updatedAt,
        trustLevel: source.trustLevel,
      });
    }),
  );
}

export async function verifyAnswerFile(
  answerPath: string,
  sources: SourceDocument[],
  generatedAt?: string,
  answerLabel?: string,
): Promise<VerificationReport>;
export async function verifyAnswerFile(
  options: SingleFileReportOptions,
): Promise<VerificationReport>;
export async function verifyAnswerFile(
  answerPathOrOptions: string | SingleFileReportOptions,
  sources?: SourceDocument[],
  generatedAt = new Date().toISOString(),
  answerLabel?: string,
): Promise<VerificationReport> {
  const options =
    typeof answerPathOrOptions === "string"
      ? {
          answerPath: answerPathOrOptions,
          sources: sources ?? [],
          generatedAt,
          answerLabel,
        }
      : answerPathOrOptions;

  const resolvedGeneratedAt = options.generatedAt ?? new Date().toISOString();

  if (typeof answerPathOrOptions === "string" && sources === undefined) {
    throw new Error("verifyAnswerFile requires sources when called with positional arguments.");
  }

  const answerPath = options.answerPath;

  if (answerPath !== "-") {
    await ensureFilePath(answerPath, "Answer");
  }

  const answer = await readAnswerInput(answerPath);
  const report = verifyAnswer(
    answer,
    options.sources,
    resolvedGeneratedAt,
    answerPath === "-" ? STDIN_ANSWER_PATH : answerPath,
  );

  if (options.answerLabel !== undefined) {
    report.answerLabel = options.answerLabel;
  }

  return report;
}

export async function verifyAnswerFileResult(
  answerPath: string,
  sources: SourceDocument[],
  failOn?: ClaimVerdict[],
): Promise<SingleVerificationResult>;
export async function verifyAnswerFileResult(
  answerPath: string,
  sources: SourceDocument[],
  generatedAt?: string,
  answerLabel?: string,
  failOn?: ClaimVerdict[],
): Promise<SingleVerificationResult>;
export async function verifyAnswerFileResult(
  options: SingleFileVerificationOptions,
): Promise<SingleVerificationResult>;
export async function verifyAnswerFileResult(
  answerPathOrOptions: string | SingleFileVerificationOptions,
  sources?: SourceDocument[],
  generatedAtOrFailOn?: string | ClaimVerdict[],
  answerLabel?: string,
  failOn: ClaimVerdict[] = [],
): Promise<SingleVerificationResult> {
  const options =
    typeof answerPathOrOptions === "string"
      ? {
          answerPath: answerPathOrOptions,
          sources: sources ?? [],
          generatedAt:
            typeof generatedAtOrFailOn === "string" ? generatedAtOrFailOn : new Date().toISOString(),
          answerLabel,
          failOn: Array.isArray(generatedAtOrFailOn) ? generatedAtOrFailOn : failOn,
        }
      : answerPathOrOptions;

  if (typeof answerPathOrOptions === "string" && sources === undefined) {
    throw new Error(
      "verifyAnswerFileResult requires sources when called with positional arguments.",
    );
  }

  return buildSingleVerificationResult(
    await verifyAnswerFile(
      options.answerPath,
      options.sources,
      options.generatedAt ?? new Date().toISOString(),
      options.answerLabel,
    ),
    options.failOn,
  );
}

export async function verifyAnswerFileInputs(
  options: SingleFileInputVerificationOptions,
): Promise<VerificationReport> {
  const sources = await loadSourceDocuments({
    sourcePaths: options.sourcePaths,
    sourceDirs: options.sourceDirs,
    defaultTrustLevel: options.defaultTrustLevel,
  });

  return verifyAnswerFile(
    options.answerPath,
    sources,
    options.generatedAt ?? new Date().toISOString(),
    options.answerLabel,
  );
}

export async function verifyAnswerFileInputsResult(
  options: SingleFileInputVerificationResultOptions,
): Promise<SingleVerificationResult> {
  return buildSingleVerificationResult(await verifyAnswerFileInputs(options), options.failOn);
}

export async function verifyAnswerBatchFileInputs(
  options: BatchFileInputVerificationOptions,
): Promise<BatchVerificationReport> {
  const sources = await loadSourceDocuments({
    sourcePaths: options.sourcePaths,
    sourceDirs: options.sourceDirs,
    defaultTrustLevel: options.defaultTrustLevel,
  });

  return verifyBatchAnswers({
    answerPaths: options.answerPaths,
    answerDirPaths: options.answerDirPaths,
    answerLabelsByPath: options.answerLabelsByPath,
    sources,
    failOn: options.failOn,
    generatedAt: options.generatedAt,
  });
}

export async function verifyAnswerBatchFileInputsResult(
  options: BatchFileInputVerificationResultOptions,
): Promise<BatchVerificationRunResult> {
  return buildBatchVerificationResult(
    await verifyAnswerBatchFileInputs(options),
    options.failOn,
  );
}

export async function verifyAnswerContents(
  options: InMemoryContentSingleVerificationOptions,
): Promise<VerificationReport> {
  const sources = await loadSourceDocumentsFromContent({
    sources: options.sources,
    defaultTrustLevel: options.defaultTrustLevel,
  });
  const report = verifyAnswer(
    await answerContentToText(options.answer, options.answerPath),
    sources,
    options.generatedAt ?? new Date().toISOString(),
    options.answerPath,
  );

  if (options.answerPath === undefined) {
    delete report.answerPath;
  }

  if (options.answerLabel !== undefined) {
    report.answerLabel = options.answerLabel;
  }

  return report;
}

export async function verifyAnswerContentsResult(
  options: InMemoryContentSingleVerificationResultOptions,
): Promise<SingleVerificationResult> {
  return buildSingleVerificationResult(await verifyAnswerContents(options), options.failOn);
}

export async function verifyBatchAnswers(
  options: BatchVerificationOptions,
): Promise<BatchVerificationReport> {
  const answerPaths = await resolveAnswerPaths(options.answerPaths, options.answerDirPaths);

  if (answerPaths.length === 0) {
    const locations = [...options.answerPaths, ...options.answerDirPaths].join(", ");
    throw new Error(`No answer files found in ${locations}`);
  }

  const stdinAnswerCount = answerPaths.filter((answerPath) => answerPath === "-").length;

  if (stdinAnswerCount > 1) {
    throw new Error("Only one answer path can be '-' because stdin can only be consumed once.");
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const stdinAnswer = answerPaths.includes("-") ? await readAnswerInput("-") : undefined;
  const normalizedAnswerPaths = answerPaths.map((answerPath) =>
    answerPath === "-" ? STDIN_ANSWER_PATH : answerPath,
  );
  const answerLabels = renderAnswerLabels(normalizedAnswerPaths);
  const answers = await Promise.all(
    answerPaths.map(async (answerPath, index) => {
      const normalizedAnswerPath = normalizedAnswerPaths[index] ?? answerPath;
      const answerLabel =
        resolveBatchAnswerLabel(
          answerPath,
          normalizedAnswerPath,
          options.answerLabelsByPath,
        ) ?? answerLabels[index] ?? normalizedAnswerPath;
      const report =
        answerPath === "-" && stdinAnswer !== undefined
          ? verifyAnswer(stdinAnswer, options.sources, generatedAt, STDIN_ANSWER_PATH)
          : await verifyAnswerFile(answerPath, options.sources, generatedAt);
      report.answerLabel = answerLabel;
      const failVerdicts = matchingFailVerdicts(report, options.failOn ?? []);

      return {
        answerLabel,
        answerPath: normalizedAnswerPath,
        report,
        shouldFail: failVerdicts.length > 0,
        failVerdicts,
      };
    }),
  );

  return summarizeBatchVerification(answers, options.sources, generatedAt);
}

export async function verifyBatchAnswersResult(
  options: BatchVerificationOptions,
): Promise<BatchVerificationRunResult> {
  return buildBatchVerificationResult(await verifyBatchAnswers(options), options.failOn);
}

export function verifyAnswers(
  options: InMemoryBatchVerificationOptions,
): BatchVerificationReport {
  if (options.answers.length === 0) {
    throw new Error("At least one in-memory answer is required.");
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const normalizedAnswerPaths = options.answers.map(
    (answer, index) => answer.answerPath ?? `<memory:${index + 1}>`,
  );
  const generatedLabels = renderAnswerLabels(normalizedAnswerPaths);
  const answers = options.answers.map((answer, index) => {
    const normalizedAnswerPath = normalizedAnswerPaths[index] ?? `<memory:${index + 1}>`;
    const report = verifyAnswer(
      answer.answer,
      options.sources,
      generatedAt,
      answer.answerPath,
    );
    report.answerPath = normalizedAnswerPath;
    report.answerLabel = answer.answerLabel ?? generatedLabels[index] ?? normalizedAnswerPath;
    const failVerdicts = matchingFailVerdicts(report, options.failOn ?? []);

    return {
      answerLabel: report.answerLabel,
      answerPath: normalizedAnswerPath,
      report,
      shouldFail: failVerdicts.length > 0,
      failVerdicts,
    };
  });

  return summarizeBatchVerification(answers, options.sources, generatedAt);
}

export function verifyAnswersResult(
  options: InMemoryBatchVerificationOptions,
): BatchVerificationRunResult {
  return buildBatchVerificationResult(verifyAnswers(options), options.failOn);
}

export function verifyAnswerResult(
  options: SingleVerificationResultOptions,
): SingleVerificationResult {
  const report = verifyAnswer(
    options.answer,
    options.sources,
    options.generatedAt ?? new Date().toISOString(),
    options.answerPath,
  );

  if (options.answerPath === undefined) {
    delete report.answerPath;
  }

  if (options.answerLabel !== undefined) {
    report.answerLabel = options.answerLabel;
  }

  return buildSingleVerificationResult(report, options.failOn);
}

export async function verifyAnswerBatchContents(
  options: InMemoryBatchContentVerificationOptions,
): Promise<BatchVerificationReport> {
  const sources = await loadSourceDocumentsFromContent({
    sources: options.sources,
    defaultTrustLevel: options.defaultTrustLevel,
  });

  return verifyAnswers({
    answers: await Promise.all(
      options.answers.map(async (answer) => ({
        ...answer,
        answer: await answerContentToText(answer.answer, answer.answerPath),
      })),
    ),
    sources,
    failOn: options.failOn,
    generatedAt: options.generatedAt,
  });
}

export async function verifyAnswerBatchContentsResult(
  options: InMemoryBatchContentVerificationOptions,
): Promise<BatchVerificationRunResult> {
  const sources = await loadSourceDocumentsFromContent({
    sources: options.sources,
    defaultTrustLevel: options.defaultTrustLevel,
  });

  return verifyAnswersResult({
    answers: await Promise.all(
      options.answers.map(async (answer) => ({
        ...answer,
        answer: await answerContentToText(answer.answer, answer.answerPath),
      })),
    ),
    sources,
    failOn: options.failOn,
    generatedAt: options.generatedAt,
  });
}

async function answerContentToText(
  content: string | Uint8Array,
  answerPath?: string,
): Promise<string> {
  if (typeof content === "string") {
    return content;
  }

  if (!answerPath || !/\.(?:pdf|docx)$/i.test(answerPath)) {
    throw new Error("Binary answer content requires answerPath ending in .pdf or .docx.");
  }

  const answerDocument = await sourceDocumentFromFile(answerPath, content, 0);
  return answerDocument.content;
}

export function importReviewerDecisionContents(
  reviewCsvContent: string,
): ReviewerDecisionImportReport;
export function importReviewerDecisionContents(
  options: ReviewerDecisionContentImportOptions,
): ReviewerDecisionImportReport;
export function importReviewerDecisionContents(
  reviewCsvContentOrOptions: string | ReviewerDecisionContentImportOptions,
): ReviewerDecisionImportReport {
  const options =
    typeof reviewCsvContentOrOptions === "string"
      ? { reviewCsvContent: reviewCsvContentOrOptions }
      : reviewCsvContentOrOptions;

  return importReviewerDecisions(
    options.reviewCsvContent,
    options.generatedAt ?? new Date().toISOString(),
  );
}

export function importReviewerDecisionContentsResult(
  reviewCsvContent: string,
  failOn?: ClaimVerdict[],
): ReviewerDecisionImportResult;
export function importReviewerDecisionContentsResult(
  options: ReviewerDecisionContentImportResultOptions,
): ReviewerDecisionImportResult;
export function importReviewerDecisionContentsResult(
  reviewCsvContentOrOptions: string | ReviewerDecisionContentImportResultOptions,
  failOn: ClaimVerdict[] = [],
): ReviewerDecisionImportResult {
  const options =
    typeof reviewCsvContentOrOptions === "string"
      ? { reviewCsvContent: reviewCsvContentOrOptions, failOn }
      : reviewCsvContentOrOptions;

  return importReviewerDecisionsResult(
    options.reviewCsvContent,
    options.failOn ?? [],
    options.generatedAt ?? new Date().toISOString(),
  );
}

export async function importReviewerDecisionFile(
  reviewCsvPath: string,
): Promise<ReviewerDecisionImportReport>;
export async function importReviewerDecisionFile(
  options: ReviewerDecisionFileImportOptions,
): Promise<ReviewerDecisionImportReport>;
export async function importReviewerDecisionFile(
  reviewCsvPathOrOptions: string | ReviewerDecisionFileImportOptions,
): Promise<ReviewerDecisionImportReport> {
  const options =
    typeof reviewCsvPathOrOptions === "string"
      ? { reviewCsvPath: reviewCsvPathOrOptions }
      : reviewCsvPathOrOptions;
  const reviewCsvPath = options.reviewCsvPath;

  if (reviewCsvPath !== "-") {
    await ensureFilePath(reviewCsvPath, "Reviewer decision CSV");
  }

  return importReviewerDecisions(
    await readTextInput(reviewCsvPath),
    options.generatedAt ?? new Date().toISOString(),
  );
}

export async function importReviewerDecisionFileResult(
  reviewCsvPath: string,
  failOn?: ClaimVerdict[],
): Promise<ReviewerDecisionImportResult>;
export async function importReviewerDecisionFileResult(
  options: ReviewerDecisionFileImportResultOptions,
): Promise<ReviewerDecisionImportResult>;
export async function importReviewerDecisionFileResult(
  reviewCsvPathOrOptions: string | ReviewerDecisionFileImportResultOptions,
  failOn: ClaimVerdict[] = [],
): Promise<ReviewerDecisionImportResult> {
  const options =
    typeof reviewCsvPathOrOptions === "string"
      ? { reviewCsvPath: reviewCsvPathOrOptions, failOn }
      : reviewCsvPathOrOptions;
  const reviewCsvPath = options.reviewCsvPath;

  if (reviewCsvPath !== "-") {
    await ensureFilePath(reviewCsvPath, "Reviewer decision CSV");
  }

  return importReviewerDecisionsResult(
    await readTextInput(reviewCsvPath),
    options.failOn ?? [],
    options.generatedAt ?? new Date().toISOString(),
  );
}

function buildSingleVerificationResult(
  report: VerificationReport,
  failOn: ClaimVerdict[] | undefined,
): SingleVerificationResult {
  const failVerdicts = matchingFailVerdicts(report, failOn ?? []);

  return {
    report,
    shouldFail: failVerdicts.length > 0,
    failVerdicts,
  };
}

function buildBatchVerificationResult(
  report: BatchVerificationReport,
  failOn: ClaimVerdict[] | undefined,
): BatchVerificationRunResult {
  const orderedFailVerdicts = (failOn ?? []).filter((verdict, index, allVerdicts) => {
    if (allVerdicts.indexOf(verdict) !== index) {
      return false;
    }

    return report.answers.some((answer) => answer.failVerdicts.includes(verdict));
  });

  return {
    report,
    shouldFail: orderedFailVerdicts.length > 0,
    failVerdicts: orderedFailVerdicts,
  };
}

async function listSourceFiles(sourceDir: string): Promise<string[]> {
  return listFilesWithExtensions(sourceDir, SOURCE_EXTENSIONS, "Approved source");
}

async function listAnswerFiles(answerDir: string): Promise<string[]> {
  return listFilesWithExtensions(answerDir, ANSWER_EXTENSIONS, "Answer");
}

async function listFilesWithExtensions(
  directory: string,
  extensions: ReadonlySet<string>,
  label: string,
): Promise<string[]> {
  await ensureDirectoryPath(directory, label);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.name.startsWith(".")) {
        return [];
      }

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return listFilesWithExtensions(path, extensions, label);
      }

      if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
        return [path];
      }

      return [];
    }),
  );

  return files.flat().sort();
}

async function readAnswerInput(inputPath: string): Promise<string> {
  if (inputPath !== "-") {
    const content = await readFile(inputPath);

    if (/\.(?:pdf|docx)$/i.test(inputPath)) {
      const answerDocument = await sourceDocumentFromFile(inputPath, content, 0);
      return answerDocument.content;
    }

    return stripByteOrderMark(content.toString("utf8"));
  }

  return stripByteOrderMark(await readStdin());
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
    if (isMissingPathError(error)) {
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
    const normalizedPath = path === "-" ? STDIN_ANSWER_PATH : resolve(path);

    if (seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    uniquePaths.push(path);
  }

  return uniquePaths;
}

function resolveBatchAnswerLabel(
  answerPath: string,
  normalizedAnswerPath: string,
  answerLabelsByPath: Record<string, string> | undefined,
): string | undefined {
  if (answerLabelsByPath === undefined) {
    return undefined;
  }

  if (answerPath in answerLabelsByPath) {
    return answerLabelsByPath[answerPath];
  }

  if (normalizedAnswerPath in answerLabelsByPath) {
    return answerLabelsByPath[normalizedAnswerPath];
  }

  const resolvedPath = answerPath === "-" ? STDIN_ANSWER_PATH : resolve(answerPath);
  return answerLabelsByPath[resolvedPath];
}

function resolveReviewCsvContent(
  reviewCsvContentOrOptions: string | ReviewerDecisionContentImportOptions,
): string {
  return typeof reviewCsvContentOrOptions === "string"
    ? reviewCsvContentOrOptions
    : reviewCsvContentOrOptions.reviewCsvContent;
}

function resolveReviewCsvPath(
  reviewCsvPathOrOptions: string | ReviewerDecisionFileImportOptions,
): string {
  return typeof reviewCsvPathOrOptions === "string"
    ? reviewCsvPathOrOptions
    : reviewCsvPathOrOptions.reviewCsvPath;
}

function summarizeBatchVerification(
  answers: BatchVerificationResult[],
  sources: SourceDocument[],
  generatedAt: string,
): BatchVerificationReport {
  const summary = {
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
    answersWithoutClaims: 0,
    answersWithFailures: 0,
  };

  for (const answer of answers) {
    summary.verified += answer.report.summary.verified;
    summary.contradicted += answer.report.summary.contradicted;
    summary.unsupported += answer.report.summary.unsupported;
    summary.needs_review += answer.report.summary.needs_review;

    if (answer.report.assessments.length === 0) {
      summary.answersWithoutClaims += 1;
    }

    if (answer.shouldFail) {
      summary.answersWithFailures += 1;
    }
  }

  return {
    generatedAt,
    sources: sources.map((source) => ({
      id: source.id,
      sourcePath: source.sourcePath,
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
