import assert from "node:assert/strict";
import test from "node:test";
import { renderAnswerLabels, renderAnswerPreview, splitIntoSentences } from "../src/text.js";

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

test("strips inline numeric-colon list markers when splitting sentences", () => {
  assert.deepEqual(
    splitIntoSentences(
      "1: Employees receive 12 weeks. 2: Managers approve travel within five business days.",
    ),
    [
      "Employees receive 12 weeks.",
      "Managers approve travel within five business days.",
    ],
  );
});

test("renders readable previews from exported html answers", () => {
  assert.equal(
    renderAnswerPreview(`<!doctype html>
<html>
  <head>
    <title>Ignored</title>
    <style>.hidden { display: none; }</style>
  </head>
  <body>
    <main>
      <h1>Support Queue</h1>
      <p>Refunds are available within 30 days of purchase.</p>
    </main>
  </body>
</html>`),
    "Support Queue Refunds are available within 30 days of purchase.",
  );
});

test("decodes common html entities in previews", () => {
  assert.equal(
    renderAnswerPreview("<p>Managers approve travel &amp; lodging within 5 days &lt;when policy applies&gt;.</p>"),
    "Managers approve travel & lodging within 5 days <when policy applies>.",
  );
});

test("ignores screen-reader-only html sections in previews", () => {
  assert.equal(
    renderAnswerPreview(`<!doctype html>
<html>
  <body>
    <div class="sr-only">
      <p>Skip to main content</p>
    </div>
    <section class="visually-hidden announcement">
      <p>Dialog closed</p>
    </section>
    <main>
      <p>Refunds are available within 30 days of purchase.</p>
    </main>
  </body>
</html>`),
    "Refunds are available within 30 days of purchase.",
  );
});
