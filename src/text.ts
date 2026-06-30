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
