import { basename } from "node:path";
import { PDFParse } from "pdf-parse";
import type { SourceDocument, SourceTrustLevel } from "./domain.js";

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
  defaultTrustLevel?: SourceTrustLevel;
}

export function sourceDocumentFromFile(
  sourcePath: string,
  content: string,
  index: number,
  options?: SourceDocumentOptions,
): Promise<SourceDocument>;
export function sourceDocumentFromFile(
  sourcePath: string,
  content: Buffer,
  index: number,
  options?: SourceDocumentOptions,
): Promise<SourceDocument>;
export async function sourceDocumentFromFile(
  sourcePath: string,
  content: string | Buffer,
  index: number,
  options: SourceDocumentOptions = {},
): Promise<SourceDocument> {
  if (isPdfSource(sourcePath)) {
    return pdfSourceDocumentFromFile(sourcePath, content, index, options);
  }

  const textContent = typeof content === "string" ? content : content.toString("utf8");
  const parsed = parseSource(sourcePath, textContent);

  return {
    id: `source_${index + 1}`,
    title: parsed.metadata.title ?? sourceTitleFromPath(sourcePath),
    updatedAt: parsed.metadata.updatedAt,
    trustLevel: parsed.metadata.trustLevel ?? options.defaultTrustLevel ?? "medium",
    content: parsed.body,
  };
}

export function parseSource(sourcePath: string, content: string): ParsedSource {
  if (isHtmlSource(sourcePath)) {
    return parseHtmlSource(content);
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  if (!match) {
    return { metadata: {}, body: content };
  }

  return {
    metadata: parseFrontmatter(match[1] ?? ""),
    body: normalized.slice(match[0].length),
  };
}

function parseFrontmatter(frontmatter: string): SourceMetadata {
  const metadata: SourceMetadata = {};

  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);

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
  return /\.html?$/i.test(sourcePath);
}

function isPdfSource(sourcePath: string): boolean {
  return /\.pdf$/i.test(sourcePath);
}

function sourceTitleFromPath(sourcePath: string): string {
  return basename(sourcePath).replace(/\.(?:md|markdown|txt|html?|pdf)$/i, "");
}

function parseHtmlSource(content: string): ParsedSource {
  const normalized = content.replace(/\r\n/g, "\n");
  const titleMatch = normalized.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return {
    metadata: {
      title: titleMatch ? decodeHtmlEntities(stripTags(titleMatch[1] ?? "")).trim() : undefined,
    },
    body: normalizeHtmlText(normalized),
  };
}

function normalizeHtmlText(content: string): string {
  return decodeHtmlEntities(
    content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<\/?(p|div|ul|ol|section|article|main|header|footer|aside|body|html)\b[^>]*>/gi, "\n")
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
  content: string | Buffer,
  index: number,
  options: SourceDocumentOptions,
): Promise<SourceDocument> {
  const parser = new PDFParse({
    data: typeof content === "string" ? Buffer.from(content, "binary") : content,
  });

  try {
    const result = await parser.getText();

    return {
      id: `source_${index + 1}`,
      title: sourceTitleFromPath(sourcePath),
      updatedAt: undefined,
      trustLevel: options.defaultTrustLevel ?? "medium",
      content: normalizePdfText(result.text),
    };
  } finally {
    await parser.destroy();
  }
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
