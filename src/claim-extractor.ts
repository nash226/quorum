import type { AtomicClaim } from "./domain.js";
import { splitIntoSentences } from "./text.js";

const UPPERCASE_ROMAN_NUMERAL_PREFIX = /^([IVXLCDM]{2,})[.)]\s+/;
const PARENTHESIZED_ROMAN_NUMERAL_PREFIX = /^\(([IVXLCDMivxlcdm]{2,})\)\s+/;
const LOWERCASE_ROMAN_NUMERAL_PREFIX = /^([ivxlcdm]{2,})\)\s+/;
const VALID_ROMAN_NUMERAL = /^(?=[IVXLCDM]+$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;

export function extractClaims(answer: string): AtomicClaim[] {
  return splitIntoSentences(normalizeAnswer(answer))
    .filter((sentence) => sentence.length >= 12)
    .map((text, index) => ({
      id: `claim_${index + 1}`,
      text,
    }));
}

function normalizeAnswer(answer: string): string {
  const lines = answer.replace(/\r/g, "").split("\n");
  const normalizedLines: string[] = [];
  let previousLineCanContinue = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (line.length === 0 || isHeading(line)) {
      previousLineCanContinue = false;
      continue;
    }

    if (isIntroLabel(line, lines, index)) {
      previousLineCanContinue = false;
      continue;
    }

    const explicitClaimPrefix = hasMarkdownClaimPrefix(line);
    const normalizedLine = stripMarkdownClaimPrefix(line);
    const currentLineCanContinue =
      explicitClaimPrefix || canContinuePlainLine(normalizedLine, lines, index);

    if (
      !explicitClaimPrefix &&
      previousLineCanContinue &&
      normalizedLines.length > 0
    ) {
      normalizedLines[normalizedLines.length - 1] += ` ${normalizedLine}`;
      previousLineCanContinue = currentLineCanContinue;
      continue;
    }

    normalizedLines.push(normalizedLine);
    previousLineCanContinue = currentLineCanContinue;
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

function stripOneMarkdownClaimPrefix(line: string): string {
  const directPrefixes = [
    /^>\s*/,
    /^[-*+]\s+/,
    /^\d+[.)]\s+/,
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
): boolean {
  if (/[.!?]$/.test(line)) {
    return false;
  }

  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const nextLine = (lines[index] ?? "").trim();

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

    return /^[a-z0-9("'[]/.test(nextLine);
  }

  return false;
}
