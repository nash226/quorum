import type { AtomicClaim } from "./domain.js";
import { splitIntoSentences, stripByteOrderMark } from "./text.js";

const UPPERCASE_ROMAN_NUMERAL_PREFIX = /^([IVXLCDM]{2,})[.)]\s+/;
const LOWERCASE_ROMAN_NUMERAL_DOT_PREFIX = /^([ivxlcdm]{2,})\.\s+/;
const PARENTHESIZED_ROMAN_NUMERAL_PREFIX = /^\(([IVXLCDMivxlcdm]{2,})\)\s+/;
const LOWERCASE_ROMAN_NUMERAL_PREFIX = /^([ivxlcdm]{2,})\)\s+/;
const VALID_ROMAN_NUMERAL = /^(?=[IVXLCDM]+$)M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const UNICODE_BULLET_PREFIX = /^(?:[\u00B7\u2022\u2023\u25AA\u25AB\u25CF\u25E6\u2043\u2219])\s+/;
const UNICODE_NUMBER_PREFIX = /^[\u2460-\u2473\u24F5-\u24FE\u2776-\u277F\u2780-\u2789\u278A-\u2793]\s+/;
const ARABIC_NUMBER_PREFIX = /^[\u0660-\u0669\u06F0-\u06F9]+[.)]\s+/;
const FULLWIDTH_NUMBER_PREFIX = /^[\uFF10-\uFF19]+[.)]\s+/;
const BRACKETED_NUMBER_PREFIX = /^\[\d+\]\s+/;
const DASH_BULLET_PREFIX = /^(?:[\u2013\u2014])\s+/;
const DEFINITION_LIST_PREFIX = /^:\s+/;
const MARKDOWN_TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const MARKDOWN_CALLOUT_PREFIX = /^\[![A-Z][A-Z0-9_-]*\][+-]?\s*/i;
const MARKDOWN_REFERENCE_DEFINITION_PREFIX = /^\[[^\]]+\]:\s*\S+/;
const MARKDOWN_FOOTNOTE_DEFINITION_PREFIX = /^\[\^[^\]]+\]:\s+/;
const MARKDOWN_TABLE_HTML_BREAK_PLACEHOLDER = "__QUORUM_TABLE_HTML_BREAK__";
const EXPLICIT_CLAIM_MARKER = "QUORUMEXPLICITCLAIM";
const INTRO_LABEL_PATTERN = /^(?:(?:draft|final|the|our)?\s*(?:answer|response|summary|result|conclusion|recommendation|notes?|details?|claims?|findings?|outcome|rationale)(?:\s+(?:summary|notes?|details?))?|(?:policy|deployment|support|key|leave)(?:\s+[A-Za-z][A-Za-z0-9-]*){0,3}|[A-Za-z][A-Za-z0-9 /-]*\s+policy(?:\s+(?:summary|notes?|details?))?):$/i;
const OPEN_HTML_DETAILS_ATTRIBUTE =
  /(^|\s)open(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|$)/i;
const HTML_ANSWER_MARKUP_PATTERN =
  /<!doctype|<\/?(?:html|body|main|section|article|header|footer|aside|details|summary|blockquote|ul|ol|li|p|div|span|br|h[1-6]|table|caption|thead|tbody|tfoot|tr|td|th|figure|figcaption|dl|dt|dd|a|strong|em|b|i|code|script|style|iframe)\b/i;
const HTML_PAGE_CHROME_PATTERN =
  /<(nav|form|button|select|textarea|template|noscript|svg|dialog|header|footer|aside|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;
const HTML_HIDDEN_SECTION_PATTERNS = [
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\shidden(?:\s|=|>|\/))[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sinert(?:\s|=|>|\/))[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\saria-hidden\s*=\s*["']?true["']?)[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sstyle\s*=\s*["'][^"']*\bdisplay\s*:\s*none\b[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sstyle\s*=\s*["'][^"']*\bvisibility\s*:\s*hidden\b[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi,
  /<([A-Za-z][A-Za-z0-9:-]*)\b(?=[^>]*\sclass\s*=\s*["'][^"']*\b(?:sr-only|screen-reader-only|screen-reader-text|visually-hidden|visuallyhidden)\b[^"']*["'])[^>]*>[\s\S]*?<\/\1>/gi,
];
const HTML_BLOCK_BREAK_TAGS =
  /<(br|\/p|\/div|\/li|\/section|\/article|\/main|\/header|\/footer|\/aside|\/blockquote|\/details|\/figure|\/figcaption|\/h[1-6])\b[^>]*>/gi;
const HTML_BLOCK_TAGS =
  /<\/?(p|div|ul|ol|section|article|main|header|footer|aside|body|html|details|blockquote|figure)\b[^>]*>/gi;
const HTML_INLINE_TAGS =
  /<\/?(?:summary|li|span|br|h[1-6]|figcaption)\b[^>]*>/gi;
const REMAINING_HTML_TAGS = /<\/?[^>\n]+>/g;
const HTML_HEADING_PATTERN = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

export function extractClaims(answer: string): AtomicClaim[] {
  return splitIntoSentences(stripInlineMarkdown(normalizeAnswer(answer)))
    .flatMap((sentence) => {
      const isExplicitClaim = sentence.startsWith(EXPLICIT_CLAIM_MARKER);
      const text = isExplicitClaim ? sentence.slice(EXPLICIT_CLAIM_MARKER.length) : sentence;

      return splitCompoundClaim(text).map((part) => ({ isExplicitClaim, text: part }));
    })
    .filter(
      ({ isExplicitClaim, text }) =>
        Boolean(text) &&
        (isExplicitClaim ||
          (text.length >= 12 && !isThematicBreak(text)) ||
          isShortPunctuatedClaim(text)),
    )
    .map(({ text }, index) => ({
      id: `claim_${index + 1}`,
      text,
    }));
}

export interface ExtractClaimsResult {
  answerHasClaims: boolean;
  claims: AtomicClaim[];
}

/** Return normalized claims with the queue-routing signal used by API workflows. */
export function extractClaimsResult(answer: string): ExtractClaimsResult {
  const claims = extractClaims(answer);
  return {
    answerHasClaims: claims.length > 0,
    claims,
  };
}

function isThematicBreak(text: string): boolean {
  return /^(?:-{3,}|_{3,}|\*{3,})$/.test(text);
}

function isShortPunctuatedClaim(text: string): boolean {
  return (
    text.length >= 8 &&
    text.length < 12 &&
    /[.!?\u3002\uFF01\uFF1F]$/.test(text) &&
    /\p{L}{2,}/u.test(text)
  );
}

function splitCompoundClaim(sentence: string): string[] {
  return sentence
    .split(/;\s+(?=[A-Z0-9("'])/g)
    .flatMap((part) =>
      part.split(/,\s+(?:and|but|or)\s+(?=[A-Z0-9("'])/g),
    )
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeAnswer(answer: string): string {
  const lines = normalizeHtmlAnswerMarkup(protectMarkdownTableHtmlBreaks(stripByteOrderMark(answer)))
    .replace(/\r/g, "")
    .split("\n");
  const normalizedLines: string[] = [];
  let previousLineCanContinue = false;
  let previousLineBelongsToMarkdownClaim: boolean = false;
  let activeFenceCharacter: "`" | "~" | undefined;
  let insideIndentedCodeBlock = false;
  let insideMarkdownDefinition = false;
  let insideHtmlComment = false;
  let activeFrontmatterDelimiter: "---" | "+++" | undefined;
  let seenBodyContent = false;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? "";
    const lineWithoutComments = stripHtmlComments(rawLine, {
      insideHtmlComment,
    });
    insideHtmlComment = lineWithoutComments.insideHtmlComment;
    const line = lineWithoutComments.line.trim();

    if (activeFrontmatterDelimiter) {
      if (line === activeFrontmatterDelimiter) {
        activeFrontmatterDelimiter = undefined;
      }

      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (insideIndentedCodeBlock) {
      if (line.length === 0) {
        insideIndentedCodeBlock = false;
      }

      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (insideMarkdownDefinition) {
      if (line.length === 0 || isIndentedContinuation(lineWithoutComments.line)) {
        previousLineCanContinue = false;
        previousLineBelongsToMarkdownClaim = false;
        continue;
      }

      insideMarkdownDefinition = false;
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

    if (line.length === 0) {
      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    const frontmatterDelimiter = getFrontmatterOpeningDelimiter(
      line,
      lines,
      index,
      seenBodyContent,
    );
    if (frontmatterDelimiter) {
      activeFrontmatterDelimiter = frontmatterDelimiter;
      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (isMarkdownDefinition(line)) {
      insideMarkdownDefinition = true;
      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
      continue;
    }

    if (
      isHeading(line) ||
      isSetextHeading(line, lines, index) ||
      isDefinitionListTerm(line, lines, index)
    ) {
      previousLineCanContinue = false;
      previousLineBelongsToMarkdownClaim = false;
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
        normalizedLines.push(`${EXPLICIT_CLAIM_MARKER}${tableRowClaim}`);
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

    normalizedLines.push(
      `${explicitClaimPrefix ? EXPLICIT_CLAIM_MARKER : ""}${normalizedLine}`,
    );
    seenBodyContent = true;
    previousLineCanContinue = currentLineCanContinue;
    previousLineBelongsToMarkdownClaim = belongsToMarkdownClaim;
  }

  return normalizedLines.join("\n");
}

function protectMarkdownTableHtmlBreaks(answer: string): string {
  return answer
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line.includes("|")
        ? line.replace(/<br\b[^>]*\/?>/gi, MARKDOWN_TABLE_HTML_BREAK_PLACEHOLDER)
        : line,
    )
    .join("\n");
}

function normalizeHtmlAnswerMarkup(answer: string): string {
  if (!HTML_ANSWER_MARKUP_PATTERN.test(answer)) {
    return answer;
  }

  const answerWithoutHiddenChrome = HTML_HIDDEN_SECTION_PATTERNS.reduce(
    (normalizedAnswer, pattern) => normalizedAnswer.replace(pattern, " "),
    answer,
  );

  return decodeHtmlEntities(
    answerWithoutHiddenChrome
      .replace(/<details\b([^>]*)>([\s\S]*?)<\/details>/gi, (_match, attributes, content) =>
        normalizeHtmlDetailsMarkup(attributes ?? "", content ?? ""),
      )
      .replace(/<!doctype[^>]*>/gi, " ")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
      .replace(HTML_PAGE_CHROME_PATTERN, " ")
      .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, " ")
      .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(HTML_HEADING_PATTERN, (_match, depth: string, headingContent: string) => {
        const headingLevel = Number.parseInt(depth, 10);
        const prefix = "#".repeat(Number.isNaN(headingLevel) ? 1 : headingLevel);
        return `\n${prefix} ${headingContent.trim()}\n`;
      })
      .replace(/<dl\b[^>]*>[\s\S]*?<\/dl>/gi, (descriptionListMarkup: string) =>
        normalizeHtmlDescriptionListMarkup(descriptionListMarkup),
      )
      .replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableMarkup: string) =>
        normalizeHtmlTableMarkup(tableMarkup),
      )
      .replace(
        /<summary\b[^>]*>([\s\S]*?)<\/summary>/gi,
        (_match, summaryContent: string) => `${summaryContent.trim()}:\n`,
      )
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(HTML_BLOCK_BREAK_TAGS, "\n")
      .replace(HTML_BLOCK_TAGS, "\n")
      .replace(HTML_INLINE_TAGS, " "),
  )
    .replace(REMAINING_HTML_TAGS, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

function normalizeHtmlDetailsMarkup(attributes: string, content: string): string {
  if (OPEN_HTML_DETAILS_ATTRIBUTE.test(attributes)) {
    return content;
  }

  return " ";
}

function normalizeHtmlTableMarkup(tableMarkup: string): string {
  const captionMatch = tableMarkup.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i);
  const rows = Array.from(tableMarkup.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi))
    .map((match) => normalizeHtmlTableRow(match[1] ?? ""))
    .filter((row): row is string => Boolean(row));

  const lines = [
    captionMatch ? normalizeHtmlTableCell(captionMatch[1] ?? "") : undefined,
    ...rows,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function normalizeHtmlDescriptionListMarkup(descriptionListMarkup: string): string {
  const items = Array.from(
    descriptionListMarkup.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi),
  ).map((match) => ({
    kind: (match[1] ?? "").toLowerCase(),
    text: normalizeHtmlTableCell(match[2] ?? ""),
  }));

  const lines: string[] = [];
  let activeTerm: string | undefined;

  for (const item of items) {
    if (item.text.length === 0) {
      continue;
    }

    if (item.kind === "dt") {
      activeTerm = item.text;
      continue;
    }

    if (activeTerm) {
      lines.push(`${activeTerm}: ${item.text}`);
      continue;
    }

    lines.push(item.text);
  }

  return lines.join("\n");
}

function normalizeHtmlTableRow(rowMarkup: string): string | undefined {
  const cells = Array.from(rowMarkup.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)).map(
    (match) => ({
      kind: (match[1] ?? "").toLowerCase(),
      text: normalizeHtmlTableCell(match[2] ?? ""),
    }),
  );

  const populatedCells = cells.filter((cell) => cell.text.length > 0);
  if (populatedCells.length === 0) {
    return undefined;
  }

  if (populatedCells.every((cell) => cell.kind === "th")) {
    return undefined;
  }

  if (populatedCells.length === 1) {
    return populatedCells[0]?.text;
  }

  const [firstCell, ...otherCells] = populatedCells.map((cell) => cell.text);
  if (!firstCell) {
    return otherCells.join("; ");
  }

  return `${firstCell}: ${otherCells.join("; ")}`;
}

function normalizeHtmlTableCell(cellMarkup: string): string {
  return decodeHtmlEntities(
    cellMarkup
      .replace(/<br\b[^>]*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s*\n\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
    return hasSetextHeadingContentAbove(lines, currentIndex);
  }

  if (!isSetextHeadingText(line)) {
    return false;
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

function hasSetextHeadingContentAbove(lines: string[], currentIndex: number): boolean {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const previousLine = (lines[index] ?? "").trim();

    if (previousLine.length === 0) {
      continue;
    }

    return isSetextHeadingText(previousLine);
  }

  return false;
}

function isSetextHeadingText(line: string): boolean {
  return !/[.!?]$/.test(line);
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
    UNICODE_NUMBER_PREFIX,
    ARABIC_NUMBER_PREFIX,
    FULLWIDTH_NUMBER_PREFIX,
    BRACKETED_NUMBER_PREFIX,
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
  if (!INTRO_LABEL_PATTERN.test(line)) {
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

function isMarkdownDefinition(line: string): boolean {
  return (
    MARKDOWN_REFERENCE_DEFINITION_PREFIX.test(line) ||
    MARKDOWN_FOOTNOTE_DEFINITION_PREFIX.test(line)
  );
}

function getFrontmatterOpeningDelimiter(
  line: string,
  lines: string[],
  currentIndex: number,
  seenBodyContent: boolean,
): "---" | "+++" | undefined {
  if (seenBodyContent || (line !== "---" && line !== "+++")) {
    return undefined;
  }

  if (!findFrontmatterClosingIndex(line, lines, currentIndex)) {
    return undefined;
  }

  return hasFrontmatterContent(lines, currentIndex, line) ? line : undefined;
}

function findFrontmatterClosingIndex(
  delimiter: "---" | "+++",
  lines: string[],
  currentIndex: number,
): number | undefined {
  for (let index = currentIndex + 1; index < lines.length; index += 1) {
    if ((lines[index] ?? "").trim() === delimiter) {
      return index;
    }
  }

  return undefined;
}

function hasFrontmatterContent(
  lines: string[],
  currentIndex: number,
  delimiter: "---" | "+++",
): boolean {
  const closingIndex = findFrontmatterClosingIndex(delimiter, lines, currentIndex);
  if (closingIndex === undefined) {
    return false;
  }

  for (let index = currentIndex + 1; index < closingIndex; index += 1) {
    const line = (lines[index] ?? "").trim();
    if (line.length === 0) {
      continue;
    }

    return /^[A-Za-z0-9_.-]+\s*[:=]/.test(line);
  }

  return false;
}

function stripHtmlComments(
  line: string,
  state: { insideHtmlComment: boolean },
): { line: string; insideHtmlComment: boolean } {
  let remaining = line;
  let normalized = "";
  let insideComment = state.insideHtmlComment;

  while (remaining.length > 0) {
    if (insideComment) {
      const commentEndIndex = remaining.indexOf("-->");
      if (commentEndIndex === -1) {
        return {
          line: normalized,
          insideHtmlComment: true,
        };
      }

      remaining = remaining.slice(commentEndIndex + 3);
      insideComment = false;
      continue;
    }

    const commentStartIndex = remaining.indexOf("<!--");
    if (commentStartIndex === -1) {
      normalized += remaining;
      break;
    }

    normalized += remaining.slice(0, commentStartIndex);
    remaining = remaining.slice(commentStartIndex + 4);
    insideComment = true;
  }

  return {
    line: normalized,
    insideHtmlComment: insideComment,
  };
}

function stripInlineMarkdown(answer: string): string {
  return answer
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/\[\^([^\]]+)\]/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, "$1")
    .replace(/(\*\*|__)(\S(?:[\s\S]*?\S)?)\1/g, "$2")
    .replace(/(\*|_)(\S(?:[\s\S]*?\S)?)\1/g, "$2");
}

function decodeHtmlEntities(content: string): string {
  const namedEntities = new Map<string, string>([
    ["nbsp", " "],
    ["amp", "&"],
    ["quot", '"'],
    ["apos", "'"],
    ["lt", "<"],
    ["gt", ">"],
    ["rsquo", "’"],
    ["lsquo", "‘"],
    ["rdquo", "”"],
    ["ldquo", "“"],
    ["mdash", "—"],
    ["ndash", "–"],
    ["hellip", "…"],
    ["middot", "·"],
    ["bull", "•"],
  ]);

  return content
    .replace(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g, (match, hex, decimal) => {
      const numericValue =
        typeof hex === "string" && hex.length > 0
          ? Number.parseInt(hex, 16)
          : Number.parseInt(decimal ?? "", 10);

      if (!Number.isInteger(numericValue) || numericValue <= 0 || numericValue > 0x10ffff) {
        return match;
      }

      try {
        return String.fromCodePoint(numericValue);
      } catch {
        return match;
      }
    })
    .replace(/&#39;/gi, "'")
    .replace(/&([a-z][a-z0-9]+);/gi, (match, entityName) => {
      const decoded = namedEntities.get(entityName.toLowerCase());
      return decoded ?? match;
    });
}

function normalizeMarkdownTableRow(
  cells: string[],
  lines: string[],
  currentIndex: number,
): string | undefined {
  if (isMarkdownTableSeparatorRow(cells) || isMarkdownTableHeaderRow(lines, currentIndex)) {
    return undefined;
  }

  const [rawFirstCell, ...rawOtherCells] = cells;
  const firstCell = rawFirstCell ? normalizeMarkdownTableCell(rawFirstCell) : "";

  if (rawOtherCells.length === 1 && rawOtherCells[0]?.includes(MARKDOWN_TABLE_HTML_BREAK_PLACEHOLDER)) {
    const fragments = splitMarkdownTableCellFragments(rawOtherCells[0]);

    if (!firstCell) {
      return fragments.join("\n");
    }

    return fragments.map((fragment) => `${firstCell}: ${fragment}`).join("\n");
  }

  const otherCells = rawOtherCells.map(normalizeMarkdownTableCell);
  if (!firstCell) {
    return otherCells.join("; ");
  }

  if (otherCells.length === 0) {
    return firstCell;
  }

  return `${firstCell}: ${otherCells.join("; ")}`;
}

function normalizeMarkdownTableCell(cell: string): string {
  return normalizeHtmlTableCell(
    cell.replaceAll(MARKDOWN_TABLE_HTML_BREAK_PLACEHOLDER, "<br>"),
  );
}

function splitMarkdownTableCellFragments(cell: string): string[] {
  return cell
    .split(MARKDOWN_TABLE_HTML_BREAK_PLACEHOLDER)
    .map(normalizeMarkdownTableCell)
    .filter(Boolean);
}

function parseMarkdownTableCells(line: string): string[] | undefined {
  if (!line.includes("|")) {
    return undefined;
  }

  const segments = splitMarkdownTableSegments(line);
  if (segments.length < 2) {
    return undefined;
  }

  const hasOuterPipes = line.startsWith("|") || line.endsWith("|");
  const relevantSegments = hasOuterPipes ? segments.slice(1, -1) : segments;
  const cells = relevantSegments.map((cell) => cell.trim()).filter(Boolean);

  return cells.length >= 1 ? cells : undefined;
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
