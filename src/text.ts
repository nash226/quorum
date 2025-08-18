import { basename, extname } from "node:path";

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "can",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "their",
  "they",
  "this",
  "to",
  "with",
]);

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/g)
    .map((part) => part.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .match(/[a-z0-9]+/g)
    ?.filter((token) => token.length > 1 && !STOPWORDS.has(token)) ?? [];
}

export function uniqueTokens(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function overlapScore(left: string, right: string): number {
  const leftTokens = uniqueTokens(left);
  const rightTokens = uniqueTokens(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / leftTokens.size;
}

export function normalizeForContainment(text: string): string {
  return tokenize(text).join(" ");
}

export function renderAnswerPreview(answer: string): string {
  const normalized = answer.replace(/\s+/g, " ").trim();

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117).trimEnd()}...`;
}

export function renderAnswerLabel(answerPath: string): string {
  const extension = extname(answerPath);
  return basename(answerPath, extension);
}

export function renderAnswerLabels(answerPaths: string[]): string[] {
  const partsByPath = answerPaths.map(splitAnswerLabelParts);
  const labelDepths = partsByPath.map(() => 1);

  while (true) {
    const labels = partsByPath.map((parts, index) =>
      renderAnswerLabelWithDepth(parts, labelDepths[index] ?? 1),
    );
    const duplicateIndexes = collectDuplicateLabelIndexes(labels);

    if (duplicateIndexes.size === 0) {
      return labels;
    }

    let advanced = false;

    for (const index of duplicateIndexes) {
      const parts = partsByPath[index] ?? [];
      const currentDepth = labelDepths[index] ?? 1;

      if (currentDepth < parts.length) {
        labelDepths[index] = currentDepth + 1;
        advanced = true;
      }
    }

    if (!advanced) {
      return labels;
    }
  }
}

function splitAnswerLabelParts(answerPath: string): string[] {
  const normalizedPath = answerPath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/").filter(Boolean);

  if (parts.length === 0) {
    return [renderAnswerLabel(answerPath)];
  }

  const lastIndex = parts.length - 1;
  const lastPart = parts[lastIndex] ?? "";
  const extension = extname(lastPart);
  parts[lastIndex] = extension ? lastPart.slice(0, -extension.length) : lastPart;

  return parts;
}

function renderAnswerLabelWithDepth(parts: string[], depth: number): string {
  return parts.slice(-depth).join("/");
}

function collectDuplicateLabelIndexes(labels: string[]): Set<number> {
  const indexesByLabel = new Map<string, number[]>();

  labels.forEach((label, index) => {
    const indexes = indexesByLabel.get(label) ?? [];
    indexes.push(index);
    indexesByLabel.set(label, indexes);
  });

  const duplicates = new Set<number>();

  for (const indexes of indexesByLabel.values()) {
    if (indexes.length <= 1) {
      continue;
    }

    indexes.forEach((index) => duplicates.add(index));
  }

  return duplicates;
}
