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

export interface SourceDocumentOptions {
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
  const normalizedContent = normalizeLineEndings(stripByteOrderMark(content));

  if (isHtmlSource(sourcePath)) {
    return parseHtmlSource(normalizedContent);
  }

  if (isEmailSource(sourcePath)) {
    return parseEmailSource(normalizedContent);
  }

  if (isRtfSource(sourcePath)) {
    return { metadata: {}, body: normalizeRtfSource(normalizedContent) };
  }

  if (isJsonSource(sourcePath)) {
    return parseJsonSource(normalizedContent, /(?:json5|jsonc)$/i.test(sourcePath));
  }

  if (isXmlSource(sourcePath)) {
    return parseXmlSource(normalizedContent);
  }

  if (isYamlSource(sourcePath)) {
    return parseYamlSource(normalizedContent);
  }

  if (isTomlSource(sourcePath)) {
    return parseTomlSource(normalizedContent);
  }

  if (isDelimitedSource(sourcePath)) {
    return parseDelimitedSource(normalizedContent, /\.tsv$/i.test(sourcePath));
  }

  if (isLatexSource(sourcePath)) {
    return { metadata: {}, body: normalizeLatexSource(normalizedContent) };
  }

  if (isTextileSource(sourcePath)) {
    return parseTextileSource(normalizedContent);
  }

  if (isMediaWikiSource(sourcePath)) {
    return { metadata: {}, body: normalizeMediaWikiSource(normalizedContent) };
  }

  const normalized = normalizedContent;
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

    const key = match[1]?.replace(/[-_]/g, "").toLowerCase();
    const value = stripQuotes(match[2] ?? "");

    if (key === "title" && value) {
      metadata.title = value;
    } else if (key === "updatedat" && value) {
      metadata.updatedAt = value;
    } else if (key === "trustlevel" && value) {
      metadata.trustLevel = tryParseTrustLevel(value);
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
  return /\.(?:html?|xht|xhtml|shtml|mht|mhtml)$/i.test(sourcePath);
}

function isEmailSource(sourcePath: string): boolean {
  return /\.(?:eml|emlx)$/i.test(sourcePath);
}

function isRtfSource(sourcePath: string): boolean {
  return /\.rtf$/i.test(sourcePath);
}

function isPdfSource(sourcePath: string): boolean {
  return /\.pdf$/i.test(sourcePath);
}

function isDocxSource(sourcePath: string): boolean {
  return /\.docx$/i.test(sourcePath);
}

function isJsonSource(sourcePath: string): boolean {
  return /\.(?:jsonl?|ndjson|json5|jsonc)$/i.test(sourcePath);
}

function isXmlSource(sourcePath: string): boolean {
  return /\.xml$/i.test(sourcePath);
}

function isYamlSource(sourcePath: string): boolean {
  return /\.ya?ml$/i.test(sourcePath);
}

function isTomlSource(sourcePath: string): boolean {
  return /\.toml$/i.test(sourcePath);
}

function isDelimitedSource(sourcePath: string): boolean {
  return /\.(?:csv|tsv)$/i.test(sourcePath);
}

function isLatexSource(sourcePath: string): boolean {
  return /\.tex$/i.test(sourcePath);
}

function isTextileSource(sourcePath: string): boolean {
  return /\.textile$/i.test(sourcePath);
}

function isMediaWikiSource(sourcePath: string): boolean {
  return /\.(?:mediawiki|wiki)$/i.test(sourcePath);
}

function normalizeLatexSource(content: string): string {
  return content
    .replace(/(^|\n)\s*%[^\n]*/g, "$1")
    .replace(/\\(?:begin|end)\{[^}]+\}/g, "")
    .replace(/\\[A-Za-z@]+(?:\s*\[[^\]]*\])?(?:\s*\{([^}]*)\})?/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\\([%&$#_{}])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTextileSource(content: string): string {
  return content
    .replace(/(^|\n)h[1-6]\.\s+/g, "$1")
    .replace(/\[\"([^\"]+)\":([^\s\]]+)\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$)/g, "$1$2")
    .replace(/(^|\n)\*\s+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTextileSource(content: string): ParsedSource {
  const headingMatch = content.match(/^h[1-6]\.\s+(.+)$/m);
  const title = headingMatch?.[1] ? normalizeTextileSource(headingMatch[1]) : undefined;

  return {
    metadata: title ? { title } : {},
    body: normalizeTextileSource(content),
  };
}

function normalizeMediaWikiSource(content: string): string {
  return content
    .replace(/(^|\n)={1,6}\s*(.*?)\s*={1,6}(?=\n|$)/g, "$1$2")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label?: string) => label ?? target)
    .replace(/\[([^\s\]]+)\s+([^\]]+)\]/g, "$2")
    .replace(/'''([^']+)'''/g, "$1")
    .replace(/''([^']+)''/g, "$1")
    .replace(/(^|\n)[#*;:]+\s+/g, "$1")
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sourceTitleFromPath(sourcePath: string): string {
  return basename(sourcePath).replace(/\.(?:md|markdown|mdown|mkdn|mdwn|mdx|qmd|adoc|asciidoc|org(?:-mode)?|mediawiki|wiki|rst|rest|tex|textile|txt|text|log|ini|properties|conf|cfg|env|html?|xht|xhtml|shtml|mht|mhtml|pdf|docx|rtf|jsonl?|ndjson|json5|jsonc|xml|ya?ml|toml|csv|tsv|eml|emlx)$/i, "");
}

function parseEmailSource(content: string): ParsedSource {
  const normalized = normalizeLineEndings(content).replace(/^\d+\n/, "");
  const separator = normalized.search(/\n\n/);
  const headerText = separator === -1 ? normalized : normalized.slice(0, separator);
  const rawBody = separator === -1 ? "" : normalized.slice(separator + 2).trim();
  const headers = new Map<string, string>();
  const unfoldedHeaders = headerText.replace(/\n[ \t]+/g, " ");

  for (const line of unfoldedHeaders.split("\n")) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (match) headers.set(match[1].toLowerCase(), match[2].trim());
  }

  return {
    metadata: { title: headers.get("subject"), updatedAt: headers.get("date") },
    body: decodeEmailBody(rawBody, headers.get("content-transfer-encoding")),
  };
}

function decodeEmailBody(body: string, transferEncoding: string | undefined): string {
  if (transferEncoding?.toLowerCase() !== "quoted-printable") {
    return body;
  }

  return body
    .replace(/=\n/g, "")
    .replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .trim();
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/g, "\n");
}

function normalizeRtfSource(content: string): string {
  return content
    .replace(/\\'[0-9a-fA-F]{2}/g, (match) => String.fromCharCode(Number.parseInt(match.slice(2), 16)))
    .replace(/\\par\b/g, "\n")
    .replace(/\\tab\b/g, "\t")
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseHtmlSource(content: string): ParsedSource {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
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

function parseJsonSource(content: string, allowsComments = false): ParsedSource {
  const jsonContent = allowsComments ? stripJsonComments(content) : content;
  if (/\n/.test(jsonContent.trim())) {
    const lines = jsonContent.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      try {
        const records = lines.map((line) => JSON.parse(line));
        return { metadata: structuredMetadata(records[0]), body: formatStructuredValue(records) };
      } catch {
        // Fall through to regular JSON parsing so malformed exports stay readable.
      }
    }
  }

  try {
    const value: unknown = JSON.parse(jsonContent);
    return { metadata: structuredMetadata(value), body: formatStructuredValue(value) };
  } catch {
    return { metadata: {}, body: content };
  }
}

function stripJsonComments(content: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    const next = content[index + 1] ?? "";

    if (inLineComment) {
      if (character === "\n") {
        inLineComment = false;
        result += character;
      }
      continue;
    }

    if (inBlockComment) {
      if (character === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      } else if (character === "\n") {
        result += character;
      }
      continue;
    }

    if (!inString && character === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (!inString && character === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += character;
    if (character === "\\" && inString && !escaped) {
      escaped = true;
    } else {
      if (character === '"' && !escaped) inString = !inString;
      escaped = false;
    }
  }

  return result;
}

function formatStructuredValue(value: unknown, prefix = ""): string {
  if (value === null || typeof value !== "object") {
    return prefix ? `${prefix}: ${String(value)}` : String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) => formatStructuredValue(item, prefix ? `${prefix}[${index + 1}]` : `[${index + 1}]`))
      .join("\n");
  }

  return Object.entries(value)
    .map(([key, item]) => formatStructuredValue(item, prefix ? `${prefix}.${key}` : key))
    .join("\n");
}

function parseXmlSource(content: string): ParsedSource {
  const metadata: SourceMetadata = {};
  for (const match of content.matchAll(
    /<(?:(?:[A-Za-z_][\w.-]*):)?(title|updatedAt|updated_at|modified|modifiedAt|lastModified|lastUpdated|trustLevel|trust_level)\b[^>]*>([\s\S]*?)<\/(?:(?:[A-Za-z_][\w.-]*):)?\1\s*>/gi,
  )) {
    const key = match[1] ?? "";
    const value = decodeHtmlEntities((match[2] ?? "").replace(/<[^>]+>/g, " ").trim());
    if (value) applyStructuredMetadata(metadata, key, value);
  }
  for (const match of content.matchAll(/<meta\b([^>]*)>/gi)) {
    const attributes = parseHtmlAttributes(`<meta ${match[1] ?? ""}>`);
    const key = attributes.name ?? attributes.property;
    const value = attributes.content;
    if (key && value) applyStructuredMetadata(metadata, key, value);
  }

  return {
    metadata,
    body: decodeHtmlEntities(
      content
        .replace(/<\?xml[\s\S]*?\?>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<!\[CDATA\[/gi, "")
        .replace(/\]\]>/g, "")
        .replace(/<[^>]+>/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"),
    ),
  };
}

function parseYamlSource(content: string): ParsedSource {
  const lines: string[] = [];
  const metadata: SourceMetadata = {};
  const parents: Array<{ indent: number; key: string }> = [];
  const listIndexes = new Map<string, number>();

  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+#.*$/, "").trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#") || line.trim() === "---") continue;
    const indent = line.length - line.trimStart().length;
    const value = line.trim();
    while (parents.at(-1) && indent <= (parents.at(-1)?.indent ?? -1)) parents.pop();
    const prefix = parents.map((parent) => parent.key).join(".");

    if (value.startsWith("- ")) {
      const index = (listIndexes.get(prefix) ?? 0) + 1;
      listIndexes.set(prefix, index);
      lines.push(prefix ? `${prefix}[${index}]: ${value.slice(2).trim()}` : value.slice(2).trim());
      continue;
    }
    const separator = value.indexOf(":");
    if (separator === -1) {
      lines.push(value);
      continue;
    }
    const key = value.slice(0, separator).trim();
    const scalar = value.slice(separator + 1).trim();
    const path = prefix ? `${prefix}.${key}` : key;
    if (scalar) {
      lines.push(`${path}: ${scalar}`);
      if (!prefix) applyStructuredMetadata(metadata, key, scalar);
    }
    else parents.push({ indent, key });
  }

  return { metadata, body: lines.join("\n") || content };
}

function parseTomlSource(content: string): ParsedSource {
  const lines: string[] = [];
  const metadata: SourceMetadata = {};
  let section = "";

  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim() ?? "";
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      lines.push(line);
      continue;
    }
    const key = line.slice(0, separator).trim();
    const scalar = line.slice(separator + 1).trim();
    const path = section ? `${section}.${key}` : key;
    lines.push(`${path}: ${scalar}`);
    if (!section) applyStructuredMetadata(metadata, key, scalar);
  }

  return { metadata, body: lines.join("\n") || content };
}

function parseDelimitedSource(content: string, tabSeparated: boolean): ParsedSource {
  const delimiter = tabSeparated ? "\t" : ",";
  const rows = parseDelimitedRows(content.replace(/\r\n/g, "\n"))
    .filter((row) => row.trim().length > 0)
    .map((row) => parseDelimitedRow(row, delimiter));

  if (rows.length < 2 || rows[0]?.length === 0) {
    return { metadata: {}, body: content };
  }

  const headers = rows[0] ?? [];
  const metadata: SourceMetadata = {};
  const lines = rows.slice(1).map((row) =>
    headers
      .map((header, index) => {
        const value = row[index]?.trim() ?? "";
        return value ? `${header.trim()}: ${value}` : "";
      })
      .filter(Boolean)
      .join("; "),
  ).filter(Boolean);

  for (const row of rows.slice(1)) {
    headers.forEach((header, index) => {
      const value = row[index]?.trim() ?? "";
      if (value) applyStructuredMetadata(metadata, header, value);
    });
  }

  return { metadata, body: lines.join("\n") || content };
}

function parseDelimitedRows(content: string): string[] {
  const rows: string[] = [];
  let row = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index] ?? "";
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        row += '""';
        index += 1;
      } else {
        quoted = !quoted;
        row += character;
      }
    } else if (character === "\n" && !quoted) {
      rows.push(row);
      row = "";
    } else {
      row += character;
    }
  }

  if (row.length > 0) rows.push(row);
  return rows;
}

function parseDelimitedRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell);
  return cells;
}

function structuredMetadata(value: unknown): SourceMetadata {
  const metadata: SourceMetadata = {};

  if (!value || typeof value !== "object" || Array.isArray(value)) return metadata;

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number") {
      applyStructuredMetadata(metadata, key, String(item));
    }
  }

  return metadata;
}

function applyStructuredMetadata(metadata: SourceMetadata, key: string, value: string): void {
  const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();

  if (normalizedKey === "title" && value) metadata.title = stripQuotes(value);
  else if (
    (normalizedKey === "updatedat" ||
      normalizedKey === "modified" ||
      normalizedKey === "modifiedat" ||
      normalizedKey === "lastmodified" ||
      normalizedKey === "lastupdated") &&
    value
  ) {
    metadata.updatedAt = stripQuotes(value);
  }
  else if ((normalizedKey === "trustlevel" || normalizedKey === "quorumtrustlevel") && value) {
    metadata.trustLevel = tryParseTrustLevel(stripQuotes(value));
  }
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
    ["le", "≤"],
    ["ge", "≥"],
    ["ne", "≠"],
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
    id: options.id ?? `source_${index + 1}`,
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
