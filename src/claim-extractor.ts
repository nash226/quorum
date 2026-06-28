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
  return answer
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => stripMarkdownClaimPrefix(line.trim()))
    .filter((line) => line.length > 0 && !isHeading(line))
    .join("\n");
}

function stripMarkdownClaimPrefix(line: string): string {
  return line
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "");
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}
