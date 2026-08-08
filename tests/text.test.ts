import assert from "node:assert/strict";
import test from "node:test";
import { renderAnswerLabels, splitIntoSentences } from "../src/text.js";

test("splits Indic danda punctuation between claims", () => {
  assert.deepEqual(
    splitIntoSentences("कर्मचारी 12 सप्ताह की छुट्टी पाते हैं। बीमा 30 दिनों में शुरू होता है॥"),
    ["कर्मचारी 12 सप्ताह की छुट्टी पाते हैं।", "बीमा 30 दिनों में शुरू होता है॥"],
  );
});

test("keeps simple basenames when answer filenames are already unique", () => {
  assert.deepEqual(
    renderAnswerLabels([
      "examples/answers/hr-answer.md",
      "examples/answers/support-answer.md",
    ]),
    ["hr-answer", "support-answer"],
  );
});

test("disambiguates duplicate answer filenames with parent directories", () => {
  assert.deepEqual(
    renderAnswerLabels([
      "/tmp/quorum/hr/answer.md",
      "/tmp/quorum/support/answer.md",
    ]),
    ["hr/answer", "support/answer"],
  );
});

test("keeps expanding duplicate answer labels until they become unique", () => {
  assert.deepEqual(
    renderAnswerLabels([
      "/tmp/quorum/emea/hr/answer.md",
      "/tmp/quorum/us/hr/answer.md",
      "/tmp/quorum/us/support/answer.md",
    ]),
    ["emea/hr/answer", "us/hr/answer", "support/answer"],
  );
});
