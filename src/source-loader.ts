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
  const parsed = parseSource(content);

  return {
    id: `source_${index + 1}`,
    title: parsed.metadata.title ?? basename(sourcePath),
    updatedAt: parsed.metadata.updatedAt,
    content: parsed.body,
  };
}

export function parseSource(content: string): ParsedSource {
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
