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
  const parsed = parseSource(`---
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
