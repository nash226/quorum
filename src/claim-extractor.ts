import type { AtomicClaim } from "./domain.js";
import { splitIntoSentences } from "./text.js";

const UPPERCASE_ROMAN_NUMERAL_PREFIX = /^([IVXLCDM]{2,})[.)]\s+/;
const LOWERCASE_ROMAN_NUMERAL_DOT_PREFIX = /^([ivxlcdm]{2,})\.\s+/;
const PARENTHESIZED_ROMAN_NUMERAL_PREFIX = /^\(([IVXLCDMivxlcdm]{2,})\)\s+/;
const LOWERCASE_ROMAN_NUMERAL_PREFIX = /^([ivxlcdm]{2,})\)\s+/;
const VALID_ROMAN_NUMERAL = /^(?=[IVXLCDM]+$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const UNICODE_BULLET_PREFIX = /^(?:[\u2022\u2023\u25E6\u2043\u2219])\s+/;
const DASH_BULLET_PREFIX = /^(?:[\u2013\u2014])\s+/;

export function extractClaims(answer: string): AtomicClaim[] {
  return splitIntoSentences(stripInlineMarkdown(normalizeAnswer(answer)))
    .flatMap(splitCompoundClaim)
    .filter((sentence) => sentence.length >= 12)
    .map((text, index) => ({
      id: `claim_${index + 1}`,
      text,
    }));
}

function splitCompoundClaim(sentence: string): string[] {
  return sentence
    .split(/;\s+(?=[A-Z0-9("'])/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeAnswer(answer: string): string {
  const lines = answer.replace(/\r/g, "").split("\n");
  const normalizedLines: string[] = [];
  let previousLineCanContinue = false;
  let previousLineBelongsToMarkdownClaim: boolean = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (line.length === 0 || isHeading(line) || isSetextHeading(line, lines, index)) {
      previousLineCanContinue = false;
      continue;
    }

    if (isIntroLabel(line, lines, index)) {
      previousLineCanContinue = false;
      continue;
    }

    const explicitClaimPrefix = hasMarkdownClaimPrefix(line);
    const normalizedLine = stripMarkdownClaimPrefix(line);
    const belongsToMarkdownClaim: boolean =
      explicitClaimPrefix ||
      (previousLineBelongsToMarkdownClaim && isIndentedContinuation(rawLine));
    const currentLineCanContinue =
      explicitClaimPrefix ||
      canContinuePlainLine(normalizedLine, lines, index, belongsToMarkdownClaim);

    if (
      previousLineCanContinue &&
      normalizedLines.length > 0 &&
      shouldMergeWithPreviousLine(
        line,
        rawLine,
        normalizedLine,
        explicitClaimPrefix,
        previousLineBelongsToMarkdownClaim,
      )
    ) {
      normalizedLines[normalizedLines.length - 1] += ` ${normalizedLine}`;
      previousLineCanContinue = currentLineCanContinue;
      previousLineBelongsToMarkdownClaim = belongsToMarkdownClaim;
      continue;
    }

    normalizedLines.push(normalizedLine);
    previousLineCanContinue = currentLineCanContinue;
    previousLineBelongsToMarkdownClaim = belongsToMarkdownClaim;
  }

  return normalizedLines.join("\n");
}

function stripMarkdownClaimPrefix(line: string): string {
  let normalized = line;
  let previous = "";

  while (normalized !== previous) {
    previous = normalized;
    normalized = stripOneMarkdownClaimPrefix(normalized);
  }

  return normalized;
}

function hasMarkdownClaimPrefix(line: string): boolean {
  return stripOneMarkdownClaimPrefix(line) !== line;
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

function isSetextHeading(line: string, lines: string[], currentIndex: number): boolean {
  if (isSetextHeadingUnderline(line)) {
    return true;
  }

  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const nextLine = (lines[index] ?? "").trim();

    if (nextLine.length === 0) {
      return false;
    }

    return isSetextHeadingUnderline(nextLine);
  }

  return false;
}

function isSetextHeadingUnderline(line: string): boolean {
  return /^(?:={2,}|-{2,})$/.test(line);
}

function stripOneMarkdownClaimPrefix(line: string): string {
  const directPrefixes = [
    /^>\s*/,
    /^[-*+]\s+/,
    UNICODE_BULLET_PREFIX,
    DASH_BULLET_PREFIX,
    /^\d+[.)]\s+/,
    /^\d+:\s+/,
    /^\(\d+\)\s+/,
    /^(?:[a-zA-Z][.)]|\([a-zA-Z]\))\s+/,
    /^\[[ xX]\]\s+/,
  ];

  for (const prefix of directPrefixes) {
    const stripped = line.replace(prefix, "");
    if (stripped !== line) {
      return stripped;
    }
  }

  return stripRomanNumeralPrefix(line);
}

function stripRomanNumeralPrefix(line: string): string {
  const matchers = [
    UPPERCASE_ROMAN_NUMERAL_PREFIX,
    LOWERCASE_ROMAN_NUMERAL_DOT_PREFIX,
    PARENTHESIZED_ROMAN_NUMERAL_PREFIX,
    LOWERCASE_ROMAN_NUMERAL_PREFIX,
  ];

  for (const matcher of matchers) {
    const match = line.match(matcher);

    if (match?.[1] && isRomanNumeral(match[1])) {
      return line.slice(match[0].length);
    }
  }

  return line;
}

function isRomanNumeral(value: string): boolean {
  return VALID_ROMAN_NUMERAL.test(value.toUpperCase());
}

function isIntroLabel(
  line: string,
  lines: string[],
  currentIndex: number,
): boolean {
  if (!/:$/.test(line)) {
    return false;
  }

  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const nextLine = (lines[index] ?? "").trim();

    if (nextLine.length === 0) {
      continue;
    }

    return true;
  }

  return false;
}

function canContinuePlainLine(
  line: string,
  lines: string[],
  currentIndex: number,
  belongsToMarkdownClaim: boolean,
): boolean {
  if (/[.!?]$/.test(line)) {
    return false;
  }

  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const nextRawLine = lines[index] ?? "";
    const nextLine = nextRawLine.trim();

    if (nextLine.length === 0) {
      return false;
    }

    if (
      isHeading(nextLine) ||
      hasMarkdownClaimPrefix(nextLine) ||
      isIntroLabel(nextLine, lines, index)
    ) {
      return false;
    }

    return (
      /^[a-z0-9("'[]/.test(nextLine) ||
      (belongsToMarkdownClaim && isIndentedContinuation(nextRawLine))
    );
  }

  return false;
}

function shouldMergeWithPreviousLine(
  line: string,
  rawLine: string,
  normalizedLine: string,
  explicitClaimPrefix: boolean,
  previousLineBelongsToMarkdownClaim: boolean,
): boolean {
  if (explicitClaimPrefix) {
    return isQuotedContinuationLine(normalizedLine, rawLine);
  }

  return (
    /^[a-z0-9("'[]/.test(line) ||
    (previousLineBelongsToMarkdownClaim && isIndentedContinuation(rawLine))
  );
}

function isQuotedContinuationLine(normalizedLine: string, rawLine: string): boolean {
  if (!/^>\s*/.test(rawLine.trimStart())) {
    return false;
  }

  if (hasMarkdownClaimPrefix(normalizedLine)) {
    return false;
  }

  return /^[a-z0-9("'[]/.test(normalizedLine);
}

function isIndentedContinuation(line: string): boolean {
  return /^\s+/.test(line);
}

function stripInlineMarkdown(answer: string): string {
  return answer
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, "$1")
    .replace(/(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g, "$2")
    .replace(/(\*|_)(\S(?:[\s\S]*?\S)?)\1/g, "$2");
}
