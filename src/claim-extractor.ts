import type { AtomicClaim } from "./domain.js";
import { splitIntoSentences } from "./text.js";

const UPPERCASE_ROMAN_NUMERAL_PREFIX = /^([IVXLCDM]{2,})[.)]\s+/;
const LOWERCASE_ROMAN_NUMERAL_DOT_PREFIX = /^([ivxlcdm]{2,})\.\s+/;
const PARENTHESIZED_ROMAN_NUMERAL_PREFIX = /^\(([IVXLCDMivxlcdm]{2,})\)\s+/;
const LOWERCASE_ROMAN_NUMERAL_PREFIX = /^([ivxlcdm]{2,})\)\s+/;
const VALID_ROMAN_NUMERAL = /^(?=[IVXLCDM]+$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const UNICODE_BULLET_PREFIX = /^(?:[\u2022\u2023\u25E6\u2043\u2219])\s+/;
const DASH_BULLET_PREFIX = /^(?:[\u2013\u2014])\s+/;
const DEFINITION_LIST_PREFIX = /^:\s+/;
const MARKDOWN_TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const MARKDOWN_CALLOUT_PREFIX = /^\[![A-Z][A-Z0-9_-]*\][+-]?\s*/i;

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
  let activeFenceCharacter: "`" | "~" | undefined;
  let insideIndentedCodeBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();

    if (insideIndentedCodeBlock) {
      if (line.length === 0) {
        insideIndentedCodeBlock = false;
      }

      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (activeFenceCharacter) {
      if (isClosingFence(line, activeFenceCharacter)) {
        activeFenceCharacter = undefined;
      }

      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    const openingFenceCharacter = getOpeningFenceCharacter(line);
    if (openingFenceCharacter) {
      activeFenceCharacter = openingFenceCharacter;
      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (isIndentedCodeBlockLine(rawLine, previousLineBelongsToMarkdownClaim)) {
      insideIndentedCodeBlock = true;
      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (
      line.length === 0 ||
      isHeading(line) ||
      isSetextHeading(line, lines, index) ||
      isDefinitionListTerm(line, lines, index)
    ) {
      previousLineCanContinue = false;
      continue;
    }

    if (isIntroLabel(line, lines, index)) {
      previousLineCanContinue = false;
      continue;
    }

    const tableRowCells = parseMarkdownTableCells(line);
    if (tableRowCells) {
      const tableRowClaim = normalizeMarkdownTableRow(tableRowCells, lines, index);
      if (tableRowClaim) {
        normalizedLines.push(tableRowClaim);
      }

      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
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

function getOpeningFenceCharacter(line: string): "`" | "~" | undefined {
  if (/^`{3,}[^`]*$/.test(line)) {
    return "`";
  }

  if (/^~{3,}[^~]*$/.test(line)) {
    return "~";
  }

  return undefined;
}

function isClosingFence(line: string, fenceCharacter: "`" | "~"): boolean {
  if (fenceCharacter === "`") {
    return /^`{3,}\s*$/.test(line);
  }

  return /^~{3,}\s*$/.test(line);
}

function isIndentedCodeBlockLine(
  rawLine: string,
  previousLineBelongsToMarkdownClaim: boolean,
): boolean {
  if (previousLineBelongsToMarkdownClaim) {
    return false;
  }

  return /^(?: {4,}|\t)/.test(rawLine);
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

function isDefinitionListTerm(line: string, lines: string[], currentIndex: number): boolean {
  if (DEFINITION_LIST_PREFIX.test(line)) {
    return false;
  }

  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const nextLine = (lines[index] ?? "").trim();

    if (nextLine.length === 0) {
      continue;
    }

    return DEFINITION_LIST_PREFIX.test(nextLine);
  }

  return false;
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
    MARKDOWN_CALLOUT_PREFIX,
    DEFINITION_LIST_PREFIX,
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

function normalizeMarkdownTableRow(
  cells: string[],
  lines: string[],
  currentIndex: number,
): string | undefined {
  if (isMarkdownTableSeparatorRow(cells) || isMarkdownTableHeaderRow(lines, currentIndex)) {
    return undefined;
  }

  const [firstCell, ...otherCells] = cells;
  if (!firstCell) {
    return otherCells.join("; ");
  }

  if (otherCells.length === 0) {
    return firstCell;
  }

  return `${firstCell}: ${otherCells.join("; ")}`;
}

function parseMarkdownTableCells(line: string): string[] | undefined {
  if (!line.includes("|")) {
    return undefined;
  }

  const segments = splitMarkdownTableSegments(line);
  if (segments.length < 3) {
    return undefined;
  }

  const hasOuterPipes = line.startsWith("|") || line.endsWith("|");
  const relevantSegments = hasOuterPipes ? segments.slice(1, -1) : segments;
  const cells = relevantSegments.map((cell) => cell.trim()).filter(Boolean);

  return cells.length >= 2 ? cells : undefined;
}

function splitMarkdownTableSegments(line: string): string[] {
  const segments: string[] = [];
  let current = "";

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\\" && (nextCharacter === "\\" || nextCharacter === "|")) {
      current += nextCharacter;
      index += 1;
      continue;
    }

    if (character === "|") {
      segments.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  segments.push(current);
  return segments;
}

function isMarkdownTableSeparatorRow(cells: string[]): boolean {
  return cells.every((cell) => MARKDOWN_TABLE_SEPARATOR_CELL.test(cell));
}

function isMarkdownTableHeaderRow(lines: string[], currentIndex: number): boolean {
  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    const nextLine = (lines[index] ?? "").trim();

    if (nextLine.length === 0) {
      return false;
    }

    const nextCells = parseMarkdownTableCells(nextLine);
    return nextCells ? isMarkdownTableSeparatorRow(nextCells) : false;
  }

  return false;
}
