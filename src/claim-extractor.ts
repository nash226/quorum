import type { AtomicClaim } from "./domain.js";
import { splitIntoSentences } from "./text.js";

export function extractClaims(answer: string): AtomicClaim[] {
  return splitIntoSentences(normalizeAnswer(answer))
    .filter((sentence) => sentence.length >= 12)
    .map((text, index) => ({
      id: `claim_${index + 1}`,
      text,
    }));
}

function normalizeAnswer(answer: string): string {
  const normalizedLines: string[] = [];
  let previousLineCanContinue = false;

  for (const rawLine of answer.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0 || isHeading(line)) {
      previousLineCanContinue = false;
      continue;
    }

    const explicitClaimPrefix = hasMarkdownClaimPrefix(line);
    const normalizedLine = stripMarkdownClaimPrefix(line);

    if (
      !explicitClaimPrefix &&
      previousLineCanContinue &&
      normalizedLines.length > 0
    ) {
      normalizedLines[normalizedLines.length - 1] += ` ${normalizedLine}`;
      continue;
    }

    normalizedLines.push(normalizedLine);
    previousLineCanContinue = explicitClaimPrefix;
  }

  return normalizedLines.join("\n");
}

function stripMarkdownClaimPrefix(line: string): string {
  return line
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "");
}

function hasMarkdownClaimPrefix(line: string): boolean {
  return /^>\s*|^[-*+]\s+|^\d+[.)]\s+|^\[[ xX]\]\s+/.test(line);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}
