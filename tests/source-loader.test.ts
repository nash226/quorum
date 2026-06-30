import assert from "node:assert/strict";
import test from "node:test";
import { createSimplePdf } from "./pdf-test-helpers.js";
import { parseSource, sourceDocumentFromFile } from "../src/source-loader.js";

test("builds source documents from file names when metadata is absent", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0);

  assert.equal(source.id, "source_1");
  assert.equal(source.title, "hr-policy");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Employees get 12 weeks.");
});

test("strips supported text extensions from fallback source titles", async () => {
  const markdownSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.markdown",
    "Employees get 12 weeks.",
    0,
  );
  const textSource = await sourceDocumentFromFile(
    "docs/policies/escalation-guide.txt",
    "Escalate incidents within one hour.",
    1,
  );

  assert.equal(markdownSource.title, "leave-policy");
  assert.equal(textSource.title, "escalation-guide");
});

test("applies the default trust override when metadata is absent", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0, {
    defaultTrustLevel: "high",
  });

  assert.equal(source.trustLevel, "high");
});

test("parses supported frontmatter metadata and strips it from content", () => {
  const parsed = parseSource("docs/hr-policy.md", `---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
owner: People Ops
---
# HR Policy

Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.match(parsed.body, /^# HR Policy/);
  assert.doesNotMatch(parsed.body, /People Ops/);
});

test("keeps frontmatter trust levels ahead of the default override", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.md",
    `---
title: HR Benefits Policy
trustLevel: low
---
Employees get 12 weeks.
`,
    0,
    { defaultTrustLevel: "high" },
  );

  assert.equal(source.trustLevel, "low");
});

test("extracts readable text and title from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
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
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Refund Policy/);
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /- Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /analytics|display: none/);
});

test("decodes numeric html entities from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits &#8212; US</title>
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days&#46;</p>
      <p>People Ops&#x2019; policy applies to full-time staff.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Benefits — US");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
  assert.match(source.content, /People Ops’ policy applies to full-time staff\./);
});

test("falls back to the html file name when the page has no title", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.htm",
    "<html><body><p>Escalate priority incidents immediately.</p></body></html>",
    3,
  );

  assert.equal(source.title, "escalations");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("extracts readable text from pdf sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.pdf",
    createSimplePdf("Employees receive 12 weeks of paid parental leave."),
    0,
    { defaultTrustLevel: "high" },
  );

  assert.equal(source.title, "hr-policy");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /Employees receive 12 weeks of paid parental leave\./);
});
