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
const UPPERCASE_ROMAN_NUMERAL_PREFIX = /^([IVXLCDM]{2,})[.)]\s+/;
const LOWERCASE_ROMAN_NUMERAL_DOT_PREFIX = /^([ivxlcdm]{2,})\.\s+/;
const PARENTHESIZED_ROMAN_NUMERAL_PREFIX = /^\(([IVXLCDMivxlcdm]{2,})\)\s+/;
const LOWERCASE_ROMAN_NUMERAL_PREFIX = /^([ivxlcdm]{2,})\)\s+/;
const VALID_ROMAN_NUMERAL = /^(?=[IVXLCDM]+$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const LIST_PREFIX_PATTERNS = [
  /^[-*+]\s+/,
  /^(?:[\u2022\u2023\u25E6\u2043\u2219])\s+/,
  /^(?:[\u2013\u2014])\s+/,
  /^\d+[.)]\s+/,
  /^\d+:\s+/,
  /^\(\d+\)\s+/,
  /^(?:[a-zA-Z][.)]|\([a-zA-Z]\))\s+/,
  /^\[[ xX]\]\s+/,
];

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+/g)
    .map((part) => stripLeadingClaimMarker(part).trim())
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
  if (answerPath === "-" || answerPath === "<stdin>") {
    return "<stdin>";
  }

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

function stripLeadingClaimMarker(text: string): string {
  let normalized = text.trim();
  let previous = "";

  while (normalized !== previous) {
    previous = normalized;
    normalized = stripOneLeadingClaimMarker(normalized).trimStart();
  }

  return normalized;
}

function stripOneLeadingClaimMarker(text: string): string {
  for (const pattern of LIST_PREFIX_PATTERNS) {
    const stripped = text.replace(pattern, "");

    if (stripped !== text) {
      return stripped;
    }
  }

  return stripRomanNumeralPrefix(text);
}

function stripRomanNumeralPrefix(text: string): string {
  const matchers = [
    UPPERCASE_ROMAN_NUMERAL_PREFIX,
    LOWERCASE_ROMAN_NUMERAL_DOT_PREFIX,
    PARENTHESIZED_ROMAN_NUMERAL_PREFIX,
    LOWERCASE_ROMAN_NUMERAL_PREFIX,
  ];

  for (const matcher of matchers) {
    const match = text.match(matcher);

    if (match?.[1] && isRomanNumeral(match[1])) {
      return text.slice(match[0].length);
    }
  }

  return text;
}

function isRomanNumeral(value: string): boolean {
  return VALID_ROMAN_NUMERAL.test(value.toUpperCase());
}
