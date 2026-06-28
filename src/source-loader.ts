import { basename } from "node:path";
import type { SourceDocument } from "./domain.js";

interface SourceMetadata {
  title?: string;
  updatedAt?: string;
}

interface ParsedSource {
  metadata: SourceMetadata;
  body: string;
}

export function sourceDocumentFromFile(
  sourcePath: string,
  content: string,
  index: number,
): SourceDocument {
  const parsed = parseSource(sourcePath, content);

  return {
    id: `source_${index + 1}`,
    title: parsed.metadata.title ?? stripHtmlExtension(basename(sourcePath)),
    updatedAt: parsed.metadata.updatedAt,
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
    }
  }

  return metadata;
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function isHtmlSource(sourcePath: string): boolean {
  return /\.html?$/i.test(sourcePath);
}

function stripHtmlExtension(fileName: string): string {
  return fileName.replace(/\.html?$/i, "");
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
  return content
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
