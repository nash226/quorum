import type { AtomicClaim } from "./domain.js";
import { splitIntoSentences } from "./text.js";

export function extractClaims(answer: string): AtomicClaim[] {
  return splitIntoSentences(answer)
    .filter((sentence) => sentence.length >= 12)
    .map((text, index) => ({
      id: `claim_${index + 1}`,
      text,
    }));
}
