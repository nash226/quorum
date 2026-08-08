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
const HTML_PREVIEW_MARKUP_PATTERN =
  /<!doctype|<\/?(?:html|body|main|section|article|header|footer|aside|blockquote|ul|ol|li|p|div|span|br|h[1-6]|table|caption|thead|tbody|tfoot|tr|td|th|figure|figcaption|dl|dt|dd|a|strong|em|b|i|code)\b/i;
const HTML_PREVIEW_PAGE_CHROME_PATTERN =
  /<(nav|form|button|select|textarea|template|noscript|svg|dialog|header|footer|aside|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_PREVIEW_HIDDEN_SECTION_PATTERNS = [
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\shidden(?:\s|=|>|\/))[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sinert(?:\s|=|>|\/))[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\saria-hidden\s*=\s*["']?true["']?)[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sstyle\s*=\s*["'][^"']*\bdisplay\s*:\s*none\b[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sstyle\s*=\s*["'][^"']*\bvisibility\s*:\s*hidden\b[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sclass\s*=\s*["'][^"']*\b(?:sr-only|screen-reader-only|screen-reader-text|visually-hidden|visuallyhidden)\b[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi,
];
const HTML_PREVIEW_BLOCK_BREAK_TAGS =
  /<(br|\/p|\/div|\/li|\/section|\/article|\/main|\/header|\/footer|\/aside|\/blockquote|\/figure|\/figcaption|\/h[1-6]|\/tr|\/td|\/th|\/dt|\/dd)\b[^>]*>/gi;
const HTML_PREVIEW_STRIP_TAGS = /<\/?[^>\n]+>/g;
const LIST_PREFIX_PATTERNS = [
  /^>\s+/,
  /^[-*+]\s+/,
  /^(?:[\u2022\u2023\u25E6\u2043\u2219])\s+/,
  /^(?:[\u2013\u2014])\s+/,
  /^\d+[.)]\s+/,
  /^[一二三四五六七八九十百千万億]+、\s*/,
  /^\d+:\s+/,
  /^\(\d+\)\s+/,
  /^(?:[a-zA-Z][.)]|\([a-zA-Z]\))\s+/,
  /^[Ａ-Ｚａ-ｚ][.)．）]\s+/,
  /^\([Ａ-Ｚａ-ｚ]\)\s+/,
  /^\[[ xX]\]\s+/,
];

export function stripByteOrderMark(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

export function splitIntoSentences(text: string): string[] {
  const abbreviationMarker = "\u0000";
  const decimalMarker = "\uE000";
  const urlMarker = "\uE001";
  const protectedText = text
    .replace(
      /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|e\.g|i\.e|etc|a\.m|p\.m)\./gi,
      (abbreviation) => abbreviation.slice(0, -1) + abbreviationMarker,
    )
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => {
      const trailingPunctuation = url.match(/[.!?]+$/)?.[0] ?? "";
      const urlBody = trailingPunctuation ? url.slice(0, -trailingPunctuation.length) : url;
      return `${urlBody.replaceAll(".", urlMarker)}${trailingPunctuation}`;
    });

  return protectedText
    .replace(/[\r\u2028\u2029]/g, "\n")
    .replace(/(\d)\.(?=\d)/g, `$1${decimalMarker}`)
    .split(/\n+|(?<=[.!?…\u0589\u0F0D\u0F0E\u104B\u1362\u17D4\u1803\u1804\u0E5A\u0E5B\u06D4])\s+|(?<=[\u3002\uFF01\uFF1F\u061F\u0964\u0965])(?:\s+|(?=\p{L}|\p{N}))/gu)
    .map((part) =>
      stripLeadingClaimMarker(part)
        .replaceAll(decimalMarker, ".")
        .replaceAll(urlMarker, ".")
        .replaceAll(abbreviationMarker, ".")
        .trim(),
    )
    .filter(Boolean);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .match(/[\p{L}\p{N}]+/gu)
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
  const normalized = normalizeAnswerPreviewText(answer).replace(/\s+/g, " ").trim();

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

function normalizeAnswerPreviewText(answer: string): string {
  if (!HTML_PREVIEW_MARKUP_PATTERN.test(answer)) {
    return answer;
  }

  const visibleAnswer = HTML_PREVIEW_HIDDEN_SECTION_PATTERNS.reduce(
    (currentAnswer, pattern) => currentAnswer.replace(pattern, " "),
    answer,
  );

  return decodeHtmlEntities(
    visibleAnswer
      .replace(/<!doctype[^>]*>/gi, " ")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(HTML_PREVIEW_PAGE_CHROME_PATTERN, " ")
      .replace(HTML_PREVIEW_BLOCK_BREAK_TAGS, " ")
      .replace(HTML_PREVIEW_STRIP_TAGS, " "),
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}
