import assert from "node:assert/strict";
import test from "node:test";
import { parseSource, sourceDocumentFromFile } from "../src/source-loader.js";

test("builds source documents from file names when metadata is absent", () => {
  const source = sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0);

  assert.equal(source.id, "source_1");
  assert.equal(source.title, "hr-policy.md");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.content, "Employees get 12 weeks.");
});

test("parses supported frontmatter metadata and strips it from content", () => {
  const parsed = parseSource("docs/hr-policy.md", `---
title: HR Benefits Policy
updatedAt: 2026-05-31
owner: People Ops
---
# HR Policy

Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
  });
  assert.match(parsed.body, /^# HR Policy/);
  assert.doesNotMatch(parsed.body, /People Ops/);
});

test("extracts readable text and title from exported html sources", () => {
  const source = sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
    <style>.hidden { display: none; }</style>
  </head>
  <body>
    <main>
      <h1>Refund Policy</h1>
      <p>Customers can request refunds within 30 days.</p>
      <ul>
        <li>Annual plans require support approval.</li>
      </ul>
    </main>
    <script>window.analytics = true;</script>
  </body>
</html>`,
    1,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Refund Policy/);
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /- Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /analytics|display: none/);
});

test("falls back to the html file name when the page has no title", () => {
  const source = sourceDocumentFromFile(
    "docs/help-center/escalations.htm",
    "<html><body><p>Escalate priority incidents immediately.</p></body></html>",
    2,
  );

  assert.equal(source.title, "escalations");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});
