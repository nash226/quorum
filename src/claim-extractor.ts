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

    if (isListIntro(line, lines, index)) {
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

function isListIntro(
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

    return hasMarkdownClaimPrefix(nextLine);
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
      isListIntro(nextLine, lines, index)
    ) {
      return false;
    }

    return /^[a-z0-9("'[]/.test(nextLine);
  }

  return false;
}
