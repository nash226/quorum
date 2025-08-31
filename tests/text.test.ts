import assert from "node:assert/strict";
import test from "node:test";
import { renderAnswerLabels, splitIntoSentences } from "../src/text.js";

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

test("strips inline list markers when splitting sentences", () => {
  assert.deepEqual(
    splitIntoSentences(
      "1) Employees receive 12 weeks. 2) Managers approve travel. • Finance reviews international trips. (a) Legal approves exceptions. iv) Support handles billing.",
    ),
    [
      "Employees receive 12 weeks.",
      "Managers approve travel.",
      "Finance reviews international trips.",
      "Legal approves exceptions.",
      "Support handles billing.",
    ],
  );
});
