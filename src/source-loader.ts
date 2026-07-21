import { basename } from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { SourceDocument, SourceTrustLevel } from "./domain.js";
import { stripByteOrderMark } from "./text.js";

interface SourceMetadata {
  title?: string;
  updatedAt?: string;
  trustLevel?: SourceTrustLevel;
}

interface ParsedSource {
  metadata: SourceMetadata;
  body: string;
}

interface SourceDocumentOptions {
  id?: string;
  defaultTrustLevel?: SourceTrustLevel;
  title?: string;
  updatedAt?: string;
  trustLevel?: SourceTrustLevel;
}

const MARKDOWN_TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
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
const OPEN_HTML_DETAILS_ATTRIBUTE =
  /(^|\s)open(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|$)/i;

export function sourceDocumentFromFile(
  sourcePath: string,
  content: string,
  index: number,
  options?: SourceDocumentOptions,
): Promise<SourceDocument>;
export function sourceDocumentFromFile(
  sourcePath: string,
  content: Uint8Array,
  index: number,
  options?: SourceDocumentOptions,
): Promise<SourceDocument>;
export async function sourceDocumentFromFile(
  sourcePath: string,
  content: string | Uint8Array,
  index: number,
  options: SourceDocumentOptions = {},
): Promise<SourceDocument> {
  if (isPdfSource(sourcePath)) {
    return pdfSourceDocumentFromFile(sourcePath, content, index, options);
  }

  if (isDocxSource(sourcePath)) {
    return docxSourceDocumentFromFile(sourcePath, content, index, options);
  }

  const textContent = typeof content === "string" ? content : new TextDecoder().decode(content);
  const parsed = parseSource(sourcePath, textContent);

  return {
    id: options.id ?? `source_${index + 1}`,
    sourcePath,
    title: options.title ?? parsed.metadata.title ?? sourceTitleFromPath(sourcePath),
    updatedAt: validatedUpdatedAt(sourcePath, options.updatedAt ?? parsed.metadata.updatedAt),
    trustLevel: options.trustLevel ?? parsed.metadata.trustLevel ?? options.defaultTrustLevel ?? "medium",
    content: parsed.body,
  };
}

export function parseSource(sourcePath: string, content: string): ParsedSource {
  const normalizedContent = stripByteOrderMark(content);

  if (isHtmlSource(sourcePath)) {
    return parseHtmlSource(normalizedContent);
  }

  const normalized = normalizedContent.replace(/\r\n/g, "\n");
  const frontmatterDelimiter = getFrontmatterDelimiter(normalized);

  if (!frontmatterDelimiter) {
    return { metadata: {}, body: normalizeMarkdownSourceTables(normalized) };
  }

  const frontmatterBoundary = `\n${frontmatterDelimiter}`;
  const frontmatterEndIndex = normalized.indexOf(frontmatterBoundary, frontmatterDelimiter.length + 1);

  if (frontmatterEndIndex === -1) {
    return { metadata: {}, body: normalizeMarkdownSourceTables(normalized) };
  }

  const frontmatter = normalized.slice(
    frontmatterDelimiter.length + 1,
    frontmatterEndIndex,
  );
  const bodyStartIndex =
    frontmatterEndIndex +
    frontmatterBoundary.length +
    (normalized[frontmatterEndIndex + frontmatterBoundary.length] === "\n" ? 1 : 0);

  return {
    metadata: parseFrontmatter(frontmatter),
    body: normalizeMarkdownSourceTables(normalized.slice(bodyStartIndex)),
  };
}

function getFrontmatterDelimiter(content: string): "---" | "+++" | undefined {
  if (content.startsWith("---\n")) {
    return "---";
  }

  if (content.startsWith("+++\n")) {
    return "+++";
  }

  return undefined;
}

function parseFrontmatter(frontmatter: string): SourceMetadata {
  const metadata: SourceMetadata = {};

  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*(?::|=)\s*(.*?)\s*$/);

    if (!match) {
      continue;
    }

    const key = match[1];
    const value = stripQuotes(match[2] ?? "");

    if (key === "title" && value) {
      metadata.title = value;
    } else if ((key === "updatedAt" || key === "updated_at") && value) {
      metadata.updatedAt = value;
    } else if ((key === "trustLevel" || key === "trust_level") && value) {
      metadata.trustLevel = parseSourceTrustLevel(value);
    }
  }

  return metadata;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

export function parseSourceTrustLevel(value: string): SourceTrustLevel {
  const trustLevel = tryParseTrustLevel(value);

  if (!trustLevel) {
    throw new Error(`Unsupported trust level: ${value}`);
  }

  return trustLevel;
}

function tryParseTrustLevel(value: string): SourceTrustLevel | undefined {
  switch (value.toLowerCase()) {
    case "high":
    case "medium":
    case "low":
      return value.toLowerCase() as SourceTrustLevel;
    default:
      return undefined;
  }
}

function isHtmlSource(sourcePath: string): boolean {
  return /\.html?$/i.test(sourcePath);
}

function isPdfSource(sourcePath: string): boolean {
  return /\.pdf$/i.test(sourcePath);
}

function isDocxSource(sourcePath: string): boolean {
  return /\.docx$/i.test(sourcePath);
}

function sourceTitleFromPath(sourcePath: string): string {
  return basename(sourcePath).replace(/\.(?:md|markdown|txt|html?|pdf|docx)$/i, "");
}

function parseHtmlSource(content: string): ParsedSource {
  const normalized = content.replace(/\r\n/g, "\n");
  const titleMatch = normalized.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const headingMatch = normalized.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const documentTitle = titleMatch ? decodeHtmlEntities(stripTags(titleMatch[1] ?? "")).trim() : "";
  const headingTitle = headingMatch ? decodeHtmlEntities(stripTags(headingMatch[1] ?? "")).trim() : "";
  const metaTitle = findHtmlMetaContent(normalized, {
      property: ["og:title"],
      name: ["og:title", "twitter:title", "title", "dc.title", "dcterms.title"],
      itemprop: ["headline", "name"],
    });
  const title = selectHtmlTitle({
    documentTitle,
    metaTitle,
    headingTitle,
  });
  const updatedAt = findHtmlMetaContent(normalized, {
    property: ["article:modified_time", "og:updated_time"],
    name: [
      "article:modified_time",
      "og:updated_time",
      "last-modified",
      "last_modified",
      "updated_at",
      "updatedAt",
      "date.modified",
      "dc.date.modified",
      "dcterms.modified",
    ],
    httpEquiv: ["last-modified"],
    itemprop: ["datemodified"],
  }) || findHtmlTimeDate(normalized);
  const trustLevel = tryParseTrustLevel(
    findHtmlMetaContent(normalized, {
      property: ["quorum:trustLevel", "quorum:trust_level"],
      name: ["quorum-trust-level", "quorum:trustLevel", "trustLevel", "trust_level"],
    }) ?? "",
  );

  return {
    metadata: {
      title: title || undefined,
      updatedAt: updatedAt || undefined,
      trustLevel,
    },
    body: normalizeHtmlText(normalized),
  };
}

function selectHtmlTitle(input: {
  documentTitle: string;
  metaTitle?: string;
  headingTitle: string;
}): string | undefined {
  if (input.metaTitle) {
    return input.metaTitle;
  }

  if (shouldPreferHeadingTitle(input.documentTitle, input.headingTitle)) {
    return input.headingTitle;
  }

  return input.documentTitle || input.headingTitle || undefined;
}

function shouldPreferHeadingTitle(documentTitle: string, headingTitle: string): boolean {
  if (!documentTitle || !headingTitle) {
    return false;
  }

  const normalizedHeading = normalizeComparableHtmlTitle(headingTitle);
  const normalizedDocumentTitle = normalizeComparableHtmlTitle(documentTitle);

  if (normalizedDocumentTitle === normalizedHeading) {
    return false;
  }

  const titleSegments = documentTitle
    .split(/\s(?:\||-|–|—|·|•)\s/g)
    .map((segment) => normalizeComparableHtmlTitle(segment))
    .filter(Boolean);

  return titleSegments.length > 1 && titleSegments.includes(normalizedHeading);
}

function normalizeComparableHtmlTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().toLowerCase();
}

function findHtmlMetaContent(
  content: string,
  matchers: {
    property?: string[];
    name?: string[];
    httpEquiv?: string[];
    itemprop?: string[];
  },
): string | undefined {
  const propertyMatchers = new Set(matchers.property?.map((value) => value.toLowerCase()) ?? []);
  const nameMatchers = new Set(matchers.name?.map((value) => value.toLowerCase()) ?? []);
  const httpEquivMatchers = new Set(
    matchers.httpEquiv?.map((value) => value.toLowerCase()) ?? [],
  );
  const itempropMatchers = new Set(matchers.itemprop?.map((value) => value.toLowerCase()) ?? []);
  const metaTags = content.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const attributes = parseHtmlAttributes(tag);
    const contentValue = attributes.content;

    if (!contentValue) {
      continue;
    }

    const property = attributes.property?.toLowerCase();
    if (property && propertyMatchers.has(property)) {
      return decodeHtmlEntities(contentValue).trim();
    }

    const name = attributes.name?.toLowerCase();
    if (name && nameMatchers.has(name)) {
      return decodeHtmlEntities(contentValue).trim();
    }

    const httpEquiv = attributes["http-equiv"]?.toLowerCase();
    if (httpEquiv && httpEquivMatchers.has(httpEquiv)) {
      return decodeHtmlEntities(contentValue).trim();
    }

    const itemprop = attributes.itemprop?.toLowerCase();
    if (itemprop && itempropMatchers.has(itemprop)) {
      return decodeHtmlEntities(contentValue).trim();
    }
  }

  return undefined;
}

function findHtmlTimeDate(content: string): string | undefined {
  const timeTags = content.match(/<time\b[^>]*>[\s\S]*?<\/time>/gi) ?? [];

  for (const tag of timeTags) {
    const attributes = parseHtmlAttributes(tag);
    const datetimeValue = attributes.datetime?.trim();

    if (datetimeValue) {
      return decodeHtmlEntities(datetimeValue);
    }
  }

  return undefined;
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    const key = match[1]?.toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? "";

    if (key) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function normalizeHtmlText(content: string): string {
  const visibleContent = HTML_HIDDEN_SECTION_PATTERNS.reduce(
    (currentContent, pattern) => currentContent.replace(pattern, " "),
    content,
  );

  return decodeHtmlEntities(
    visibleContent
      .replace(/<details\b([^>]*)>([\s\S]*?)<\/details>/gi, (_match, attributes, detailsContent) =>
        normalizeHtmlDetailsMarkup(attributes ?? "", detailsContent ?? ""),
      )
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(HTML_PAGE_CHROME_PATTERN, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
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
      .replace(
        /<(br|\/p|\/div|\/li|\/section|\/article|\/details|\/figure|\/figcaption|\/h[1-6])\b[^>]*>/gi,
        "\n",
      )
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(
        /<\/?(p|div|ul|ol|section|article|main|header|footer|aside|body|html|details|figure|figcaption)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeHtmlDetailsMarkup(attributes: string, content: string): string {
  if (OPEN_HTML_DETAILS_ATTRIBUTE.test(attributes)) {
    return content;
  }

  const summaryMatch = content.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
  return summaryMatch?.[0] ?? " ";
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

function normalizeMarkdownSourceTables(content: string): string {
  const lines = content.split("\n");
  const normalizedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index] ?? "";
    const currentCells = parseMarkdownTableCells(currentLine);
    const nextCells = parseMarkdownTableCells(lines[index + 1] ?? "");

    if (currentCells && nextCells && isMarkdownTableSeparatorRow(nextCells)) {
      index += 1;

      for (let rowIndex = index + 1; rowIndex < lines.length; rowIndex += 1) {
        const rowCells = parseMarkdownTableCells(lines[rowIndex] ?? "");

        if (!rowCells || isMarkdownTableSeparatorRow(rowCells)) {
          index = rowIndex - 1;
          break;
        }

        normalizedLines.push(normalizeMarkdownTableRow(rowCells));
        index = rowIndex;
      }

      continue;
    }

    normalizedLines.push(currentLine);
  }

  return normalizedLines.join("\n");
}

function normalizeMarkdownTableRow(cells: string[]): string {
  const [rawFirstCell, ...rawOtherCells] = cells;
  const firstCell = normalizeMarkdownTableCell(rawFirstCell ?? "");
  const otherCells = rawOtherCells.map(normalizeMarkdownTableCell).filter(Boolean);

  if (!firstCell) {
    return otherCells.join("; ");
  }

  if (otherCells.length === 0) {
    return firstCell;
  }

  return `${firstCell}: ${otherCells.join("; ")}`;
}

function normalizeMarkdownTableCell(cell: string): string {
  return cell
    .replace(/<br\b[^>]*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\\([\\|])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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

function stripTags(content: string): string {
  return content.replace(/<[^>]+>/g, " ");
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
    .replace(/&#(?:x([0-9a-fA-F]+)|([0-9]+));/g, (_match, hex, decimal) => {
      const numericValue =
        typeof hex === "string" && hex.length > 0
          ? Number.parseInt(hex, 16)
          : Number.parseInt(decimal ?? "", 10);

      if (!Number.isInteger(numericValue) || numericValue <= 0 || numericValue > 0x10ffff) {
        return _match;
      }

      try {
        return String.fromCodePoint(numericValue);
      } catch {
        return _match;
      }
    })
    .replace(/&#39;/gi, "'")
    .replace(/&([a-z][a-z0-9]+);/gi, (match, entityName) => {
      const decoded = namedEntities.get(entityName.toLowerCase());
      return decoded ?? match;
    });
}

async function pdfSourceDocumentFromFile(
  sourcePath: string,
  content: string | Uint8Array,
  index: number,
  options: SourceDocumentOptions,
): Promise<SourceDocument> {
  const parser = new PDFParse({
    data: typeof content === "string" ? Buffer.from(content, "binary") : content,
  });

  try {
    const infoResult = await parser.getInfo();
    const result = await parser.getText();
    const pdfInfo = readPdfInfo(infoResult.info);
    const title = readPdfInfoString(pdfInfo, ["Title"]);
    const updatedAt = normalizePdfDate(
      readPdfInfoString(pdfInfo, ["ModDate", "CreationDate"]),
    );

    return {
      id: `source_${index + 1}`,
      sourcePath,
      title: options.title ?? title ?? sourceTitleFromPath(sourcePath),
      updatedAt: validatedUpdatedAt(sourcePath, options.updatedAt ?? updatedAt),
      trustLevel: options.trustLevel ?? options.defaultTrustLevel ?? "medium",
      content: normalizePdfText(result.text),
    };
  } finally {
    await parser.destroy();
  }
}

async function docxSourceDocumentFromFile(
  sourcePath: string,
  content: string | Uint8Array,
  index: number,
  options: SourceDocumentOptions,
): Promise<SourceDocument> {
  if (typeof content === "string") {
    throw new Error(`DOCX source content must be provided as binary data: ${sourcePath}`);
  }

  const result = await mammoth.extractRawText({ buffer: Buffer.from(content) });

  return {
    id: `source_${index + 1}`,
    sourcePath,
    title: options.title ?? sourceTitleFromPath(sourcePath),
    updatedAt: validatedUpdatedAt(sourcePath, options.updatedAt),
    trustLevel: options.trustLevel ?? options.defaultTrustLevel ?? "medium",
    content: normalizeDocxText(result.value),
  };
}

function validatedUpdatedAt(sourcePath: string, updatedAt?: string): string | undefined {
  if (updatedAt === undefined) {
    return undefined;
  }

  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error(`Invalid updatedAt timestamp for source: ${sourcePath}`);
  }

  return updatedAt;
}

function normalizeDocxText(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizePdfText(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^-- \d+ of \d+ --$/.test(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function readPdfInfo(info: unknown): Record<string, unknown> {
  return info && typeof info === "object" ? (info as Record<string, unknown>) : {};
}

function readPdfInfoString(
  info: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = info[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function normalizePdfDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  const match = normalized.match(
    /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}'?\d{2}'?)?$/,
  );

  if (!match) {
    return normalized;
  }

  const [, year, month, day, hour, minute, second, timezone] = match;

  if (!month) {
    return year;
  }

  if (!day) {
    return `${year}-${month}`;
  }

  const date = `${year}-${month}-${day}`;

  if (!hour || !minute || !second) {
    return date;
  }

  const time = `${hour}:${minute}:${second}`;

  if (!timezone) {
    return `${date}T${time}`;
  }

  if (timezone === "Z") {
    return `${date}T${time}Z`;
  }

  const normalizedTimezone = timezone.replace(/'(\d{2})'?$/, ":$1");
  return `${date}T${time}${normalizedTimezone}`;
}
