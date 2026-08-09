import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("extracts HTML metadata after a UTF-8 BOM", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.html",
    "\uFEFF<html><head><title>HR Benefits Policy</title></head><body><p>Employees get 12 weeks.</p></body></html>",
    0,
  );

  assert.equal(source.title, "HR Benefits Policy");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees get 12 weeks\./);
});

test("extracts metadata and evidence from htm source exports", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.htm",
    "<html><head><title>HR Benefits Policy</title></head><body><p>Employees get 12 weeks.</p></body></html>",
    0,
  );

  assert.equal(source.title, "HR Benefits Policy");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees get 12 weeks\./);
});

test("extracts metadata from XML source exports", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.xml",
    `<policy><title>HR parental leave policy</title><updated_at>2026-07-01</updated_at><trust_level>high</trust_level><rule>Employees get 12 weeks.</rule></policy>`,
    0,
  );

  assert.equal(source.title, "HR parental leave policy");
  assert.equal(source.updatedAt, "2026-07-01");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /Employees get 12 weeks\./);
});

test("extracts metadata from namespaced XML source exports", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.xml",
    `<policy xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>HR parental leave policy</dc:title><dcterms:modified>2026-07-01</dcterms:modified><rule>Employees get 12 weeks.</rule></policy>`,
    0,
  );

  assert.equal(source.title, "HR parental leave policy");
  assert.equal(source.updatedAt, "2026-07-01");
  assert.match(source.content, /Employees get 12 weeks\./);
});

test("extracts frontmatter from legacy Mac line endings", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.md",
    "---\rtitle: HR Benefits Policy\rupdatedAt: 2026-08-05\rtrustLevel: high\r---\rEmployees get 12 weeks.\r",
    0,
  );

  assert.equal(source.title, "HR Benefits Policy");
  assert.equal(source.updatedAt, "2026-08-05");
  assert.equal(source.trustLevel, "high");
  assert.equal(source.content, "Employees get 12 weeks.\n");
});

test("extracts subject and body from RFC 822 email source exports", async () => {
  const source = await sourceDocumentFromFile(
    "docs/support/refund-policy.eml",
    "From: support@example.com\r\nDate: 2026-08-03\r\nSubject: Refund policy update\r\n\r\nCustomers can request refunds within 30 days.\r\n",
    0,
  );

  assert.equal(source.title, "Refund policy update");
  assert.equal(source.updatedAt, "2026-08-03");
  assert.equal(source.content, "Customers can request refunds within 30 days.");
});

test("unfolds continued RFC 822 headers before extracting email metadata", async () => {
  const source = await sourceDocumentFromFile(
    "docs/support/refund-policy.eml",
    "Date: 2026-08-03\nSubject: Refund policy\n update for contractors\n\nCustomers can request refunds within 30 days.\n",
    0,
  );

  assert.equal(source.title, "Refund policy update for contractors");
  assert.equal(source.updatedAt, "2026-08-03");
  assert.equal(source.content, "Customers can request refunds within 30 days.");
});

test("extracts readable text from DOCX source content", async () => {
  const content = await readFile("node_modules/mammoth/test/test-data/single-paragraph.docx");
  const source = await sourceDocumentFromFile("docs/hr-policy.docx", content, 0);

  assert.equal(source.title, "hr-policy");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Walking on imported air");
});

test("preserves a caller-supplied source identifier for DOCX content", async () => {
  const content = await readFile("node_modules/mammoth/test/test-data/single-paragraph.docx");
  const source = await sourceDocumentFromFile("docs/hr-policy.docx", content, 0, {
    id: "people-ops/hr-policy@2026-05-31",
  });

  assert.equal(source.id, "people-ops/hr-policy@2026-05-31");
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
  const textExtensionSource = await sourceDocumentFromFile(
    "docs/policies/returns-policy.text",
    "Escalate returns within one hour.",
    2,
  );
  const logSource = await sourceDocumentFromFile(
    "docs/policies/support-audit.log",
    "Escalate failed password resets within one hour.",
    3,
  );
  const rstSource = await sourceDocumentFromFile(
    "docs/policies/incident-response.rst",
    "Escalate incidents within one hour.",
    3,
  );
  const restSource = await sourceDocumentFromFile(
    "docs/policies/incident-response.rest",
    "Escalate incidents within one hour.",
    4,
  );
  const csvSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.csv",
    "policy,details\nleave,Employees get 12 weeks.\n",
    4,
  );
  const iniSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.ini",
    "[leave]\nweeks=12\n",
    5,
  );
  const propertiesSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.properties",
    "leave.weeks=12\nleave.paid=true\n",
    6,
  );
  const confSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.conf",
    "leave.weeks=12\n",
    7,
  );
  const cfgSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.cfg",
    "leave.weeks=12\n",
    8,
  );
  const textileSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.textile",
    "Employees receive 12 weeks of paid parental leave.",
    7,
  );
  const ndjsonSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.ndjson",
    '{"policy":"Employees receive 12 weeks of paid parental leave."}\n',
    8,
  );
  const yamlSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.yaml",
    "leaveWeeks: 12\n",
    9,
  );

  assert.equal(markdownSource.title, "leave-policy");
  assert.equal(textSource.title, "escalation-guide");
  assert.equal(textExtensionSource.title, "returns-policy");
  assert.equal(logSource.title, "support-audit");
  assert.equal(rstSource.title, "incident-response");
  assert.equal(restSource.title, "incident-response");
  assert.equal(csvSource.title, "leave-policy");
  assert.equal(csvSource.content, "policy: leave; details: Employees get 12 weeks.");
  assert.equal(iniSource.title, "leave-policy");
  assert.equal(iniSource.content, "[leave]\nweeks=12\n");
  assert.equal(propertiesSource.title, "leave-policy");
  assert.equal(propertiesSource.content, "leave.weeks=12\nleave.paid=true\n");
  assert.equal(confSource.title, "leave-policy");
  assert.equal(confSource.content, "leave.weeks=12\n");
  assert.equal(cfgSource.title, "leave-policy");
  assert.equal(cfgSource.content, "leave.weeks=12\n");
  assert.equal(textileSource.title, "leave-policy");
  assert.equal(ndjsonSource.title, "leave-policy");
  assert.match(ndjsonSource.content, /Employees receive 12 weeks/);
  assert.equal(yamlSource.title, "leave-policy");
});

test("preserves embedded newlines inside quoted delimited source fields", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.csv",
    'policy,title\n"Employees receive 12 weeks of paid parental leave.\nRequests require manager approval.",Leave policy\n',
    0,
  );

  assert.match(source.content, /Employees receive 12 weeks of paid parental leave\.\nRequests require manager approval\./);
  assert.match(source.content, /title: Leave policy/);
});

test("strips the Org-mode alias from fallback source titles", async () => {
  const source = await sourceDocumentFromFile("policies/benefits.org-mode", "Policy text", 0);
  assert.equal(source.title, "benefits");
});

test("normalizes quoted csv policy exports and reads metadata columns", async () => {
  const source = await sourceDocumentFromFile(
    "exports/benefits.CSV",
    'title,updatedAt,trustLevel,policy\n"Benefits, US",2026-06-15,high,"Employees receive 12 weeks, paid."\n',
    0,
  );

  assert.equal(source.title, "Benefits, US");
  assert.equal(source.updatedAt, "2026-06-15");
  assert.equal(source.trustLevel, "high");
  assert.equal(
    source.content,
    "title: Benefits, US; updatedAt: 2026-06-15; trustLevel: high; policy: Employees receive 12 weeks, paid.",
  );
});

test("normalizes tab-separated policy exports", async () => {
  const source = await sourceDocumentFromFile(
    "exports/benefits.TSV",
    "policy\towner\nEmployees receive medical coverage\tPeople Ops\n",
    1,
  );

  assert.equal(source.content, "policy: Employees receive medical coverage; owner: People Ops");
});

test("strips AsciiDoc extensions from fallback source titles", async () => {
  const adocSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.adoc",
    "Employees receive 12 weeks of paid parental leave.\n",
    0,
  );
  const asciidocSource = await sourceDocumentFromFile(
    "docs/policies/escalation-guide.asciidoc",
    "Escalate unresolved tickets within one business day.\n",
    1,
  );

  assert.equal(adocSource.title, "leave-policy");
  assert.equal(asciidocSource.title, "escalation-guide");
});

test("strips LaTeX extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.tex",
    "Employees receive 12 weeks of paid parental leave.\n",
    0,
  );

  assert.equal(source.title, "leave-policy");
  assert.equal(source.content, "Employees receive 12 weeks of paid parental leave.");
});

test("normalizes common LaTeX markup into readable source evidence", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.tex",
    "% Internal note\n\\section{Leave Policy}\n\\textbf{Employees} receive 12 weeks of paid parental leave.\n",
    0,
  );

  assert.equal(source.content, "Leave Policy\nEmployees receive 12 weeks of paid parental leave.");
});

test("normalizes common Textile markup into readable source evidence", async () => {
  const source = await sourceDocumentFromFile(
    "support-policy.textile",
    "h1. Support Policy\n\n*Customers* may [\"request help\":https://example.test/help].\n* Response time is four hours.",
    0,
  );

  assert.equal(source.title, "support-policy");
  assert.equal(source.content, "Support Policy\n\nCustomers may request help.\nResponse time is four hours.");
});

test("strips MDX extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.mdx",
    "Employees receive 12 weeks of paid parental leave.\n",
    0,
  );

  assert.equal(source.title, "leave-policy");
  assert.equal(source.content, "Employees receive 12 weeks of paid parental leave.\n");
});

test("strips XHTML extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/refunds.xhtml",
    "Customers can request refunds within 30 days.",
    0,
  );

  assert.equal(source.title, "refunds");
});

test("strips Quarto Markdown extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.qmd",
    "Employees receive 12 weeks of paid parental leave.\n",
    0,
  );

  assert.equal(source.title, "leave-policy");
  assert.equal(source.content, "Employees receive 12 weeks of paid parental leave.\n");
});

test("strips Org-mode extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile("docs/policies/leave-policy.org", "Employees receive 12 weeks of paid parental leave.\n", 0);

  assert.equal(source.title, "leave-policy");
  assert.equal(source.content, "Employees receive 12 weeks of paid parental leave.\n");
});

test("strips MediaWiki extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.mediawiki",
    "Employees receive 12 weeks of paid parental leave.\n",
    0,
  );

  assert.equal(source.title, "leave-policy");
  assert.equal(source.content, "Employees receive 12 weeks of paid parental leave.");
});

test("normalizes common MediaWiki markup into claim-readable source text", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.mediawiki",
    "== Leave policy ==\nEmployees '''receive''' [[12 weeks|twelve weeks]] of ''paid'' leave.\n* Submit a request. <ref>Internal note</ref>\n",
    0,
  );

  assert.equal(source.content, "Leave policy\nEmployees receive twelve weeks of paid leave.\nSubmit a request.");
});

test("preserves MediaWiki br tags as policy line breaks", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/leave-policy.wiki",
    "Employees receive 12 weeks of paid leave.<br>Requests require manager approval.",
    0,
  );

  assert.equal(source.content, "Employees receive 12 weeks of paid leave.\nRequests require manager approval.");
});

test("strips wiki extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile("docs/policies/leave-policy.wiki", "Employees receive 12 weeks of paid parental leave.\n", 0);

  assert.equal(source.title, "leave-policy");
  assert.equal(source.content, "Employees receive 12 weeks of paid parental leave.");
});

test("strips JSON extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.json",
    '{"policy":"Employees get 12 weeks."}',
    0,
  );

  assert.equal(source.title, "benefits");
  assert.equal(source.content, "policy: Employees get 12 weeks.");
});

test("strips XML extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile("docs/policies/benefits.xml", "<policy>Employees get 12 weeks.</policy>", 0);

  assert.equal(source.title, "benefits");
  assert.equal(source.content, "Employees get 12 weeks.");
});

test("strips XHTML extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.xhtml",
    "<html><body><p>Employees receive medical coverage after 30 days.</p></body></html>",
    0,
  );

  assert.equal(source.title, "benefits");
  assert.match(source.content, /Employees receive medical coverage after 30 days/);
});

test("strips log extensions from fallback source titles", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/support-escalation.log",
    "Escalate priority incidents immediately.",
    0,
  );

  assert.equal(source.title, "support-escalation");
});

test("normalizes structured JSON source exports into claim-readable lines", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.json",
    '{"policy":{"leave":"Employees get 12 weeks."},"regions":["US","CA"]}',
    0,
  );

  assert.equal(source.content, "policy.leave: Employees get 12 weeks.\nregions[1]: US\nregions[2]: CA");
});

test("ingests JSONC and JSON5 exports with comments while preserving comment-like strings", async () => {
  const jsoncSource = await sourceDocumentFromFile(
    "docs/policies/benefits.jsonc",
    `{
      // Approved policy metadata
      "title": "Benefits Policy",
      "policy": "Use https://intranet.example/policy // current"
    }`,
    0,
  );
  const json5Source = await sourceDocumentFromFile(
    "docs/policies/benefits.json5",
    `{
      /* Exported from the policy system */
      "policy": "Employees get 12 weeks."
    }`,
    1,
  );

  assert.equal(jsoncSource.title, "Benefits Policy");
  assert.match(jsoncSource.content, /https:\/\/intranet\.example\/policy \/\/ current/);
  assert.equal(json5Source.content, "policy: Employees get 12 weeks.");
});

test("loads metadata from structured JSON and YAML source exports", async () => {
  const jsonSource = await sourceDocumentFromFile(
    "docs/policy.json",
    JSON.stringify({ title: "Benefits Policy", updatedAt: "2026-07-20", trustLevel: "high", policy: "Employees receive paid leave." }),
    0,
  );
  const yamlSource = await sourceDocumentFromFile(
    "docs/policy.yaml",
    "title: Support Policy\nupdated_at: 2026-07-21\ntrust_level: low\npolicy: Refunds are available within 30 days.\n",
    1,
  );

  assert.equal(jsonSource.title, "Benefits Policy");
  assert.equal(jsonSource.updatedAt, "2026-07-20");
  assert.equal(jsonSource.trustLevel, "high");
  assert.equal(yamlSource.title, "Support Policy");
  assert.equal(yamlSource.updatedAt, "2026-07-21");
  assert.equal(yamlSource.trustLevel, "low");
});

test("normalizes JSONL source exports into claim-readable text", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.jsonl",
    '{"policy":"Employees get 12 weeks.","region":"US"}\n{"policy":"Contractors get 6 weeks.","region":"CA"}\n',
    0,
  );

  assert.equal(source.title, "benefits");
  assert.equal(source.content, "[1].policy: Employees get 12 weeks.\n[1].region: US\n[2].policy: Contractors get 6 weeks.\n[2].region: CA");
});

test("preserves metadata from the first JSONL source record", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.jsonl",
    '{"title":"Benefits Policy","updatedAt":"2026-07-20","trustLevel":"high","policy":"Employees get 12 weeks."}\n{"policy":"Contractors get 6 weeks."}\n',
    0,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-07-20");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /\[1\]\.policy: Employees get 12 weeks\./);
});

test("maps common structured modification keys to source freshness", async () => {
  const jsonSource = await sourceDocumentFromFile(
    "docs/policy.json",
    JSON.stringify({ title: "Benefits Policy", modifiedAt: "2026-07-22", policy: "Employees receive paid leave." }),
    0,
  );
  const yamlSource = await sourceDocumentFromFile(
    "docs/policy.yaml",
    "title: Support Policy\nlast_modified: 2026-07-23\npolicy: Refunds are available within 30 days.\n",
    1,
  );
  const tomlSource = await sourceDocumentFromFile(
    "docs/policy.toml",
    'title = "Travel Policy"\nlastUpdated = "2026-07-24"\npolicy = "Submit expenses within 30 days."',
    2,
  );

  assert.equal(jsonSource.updatedAt, "2026-07-22");
  assert.equal(yamlSource.updatedAt, "2026-07-23");
  assert.equal(tomlSource.updatedAt, "2026-07-24");
});

test("normalizes XML source exports into claim-readable text", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.xml",
    '<?xml version="1.0"?><policy><leave>Employees get 12 weeks.</leave><region>US &amp; CA</region></policy>',
    0,
  );

  assert.equal(source.content, "Employees get 12 weeks.\nUS & CA");
});

test("normalizes YAML source exports into claim-readable lines", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.yaml",
    `policy:\n  leave: Employees get 12 weeks.\nregions:\n  - US\n  - CA`,
    0,
  );

  assert.equal(source.title, "benefits");
  assert.equal(source.content, "policy.leave: Employees get 12 weeks.\nregions[1]: US\nregions[2]: CA");
});

test("normalizes TOML source exports and preserves metadata", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.toml",
    'title = "Benefits Policy"\nupdated_at = "2026-07-20"\ntrust_level = "high"\n[policy]\nleave = "Employees get 12 weeks."',
    0,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-07-20");
  assert.equal(source.trustLevel, "high");
  assert.equal(source.content, 'title: "Benefits Policy"\nupdated_at: "2026-07-20"\ntrust_level: "high"\npolicy.leave: "Employees get 12 weeks."');
});

test("keeps malformed structured exports readable instead of failing ingestion", async () => {
  const malformedJson = await sourceDocumentFromFile(
    "docs/policies/benefits.json",
    '{"policy":{"leave":"Employees get 12 weeks."}',
    0,
  );
  const malformedXml = await sourceDocumentFromFile(
    "docs/policies/benefits.xml",
    "<policy><leave>Employees get 12 weeks.",
    1,
  );

  assert.equal(malformedJson.title, "benefits");
  assert.equal(malformedJson.content, '{"policy":{"leave":"Employees get 12 weeks."}');
  assert.equal(malformedXml.title, "benefits");
  assert.equal(malformedXml.content, "Employees get 12 weeks.");
});

test("applies the default trust override when metadata is absent", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0, {
    defaultTrustLevel: "high",
  });

  assert.equal(source.trustLevel, "high");
});

test("preserves a caller-supplied source identifier", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0, {
    id: "people-ops/hr-policy@2026-05-31",
  });

  assert.equal(source.id, "people-ops/hr-policy@2026-05-31");
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

test("parses frontmatter metadata with case and separator variants", () => {
  const source = parseSource(
    "docs/hr-policy.md",
    `---
Title: HR Benefits Policy
updated-at: 2026-05-31
TRUST_LEVEL: high
---
Employees receive paid leave.
`,
  );

  assert.deepEqual(source.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.equal(source.body, "Employees receive paid leave.\n");
});

test("parses frontmatter metadata with CRLF line endings", () => {
  const parsed = parseSource(
    "docs/hr-policy.md",
    "---\r\ntitle: HR Benefits Policy\r\nupdatedAt: 2026-05-31\r\ntrustLevel: high\r\n---\r\nEmployees receive paid leave.\r\n",
  );

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.equal(parsed.body, "Employees receive paid leave.\n");
});

test("parses toml-style source frontmatter delimited by plus signs", () => {
  const parsed = parseSource("docs/hr-policy.md", `+++
title = "HR Benefits Policy"
updated_at = "2026-05-31"
trust_level = "high"
+++
# HR Policy

Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.match(parsed.body, /^# HR Policy/);
});

test("parses source frontmatter when the file starts with a utf-8 byte order mark", () => {
  const parsed = parseSource("docs/hr-policy.md", `\uFEFF---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
---
Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.equal(parsed.body, "Employees get 12 weeks.\n");
});

test("parses source frontmatter with Windows line endings", () => {
  const parsed = parseSource(
    "docs/hr-policy.md",
    "---\r\ntitle: HR Benefits Policy\r\nupdatedAt: 2026-05-31\r\ntrustLevel: high\r\n---\r\nEmployees get 12 weeks.\r\n",
  );

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.equal(parsed.body, "Employees get 12 weeks.\n");
});

test("strips a UTF-8 BOM from binary source exports before parsing", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.md",
    new TextEncoder().encode("\uFEFF---\ntitle: Benefits Policy\n---\nEmployees receive paid leave.\n"),
    0,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.content, "Employees receive paid leave.\n");
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

test("rejects invalid source freshness metadata", async () => {
  await assert.rejects(
    sourceDocumentFromFile(
      "docs/hr-policy.md",
      `---
updatedAt: not-a-timestamp
---
Employees get 12 weeks.
`,
      0,
    ),
    /Invalid updatedAt timestamp for source: docs\/hr-policy\.md/,
  );
});

test("rejects invalid snake_case source freshness metadata", async () => {
  await assert.rejects(
    sourceDocumentFromFile(
      "docs/hr-policy.md",
      `---
updated_at: not-a-timestamp
---
Employees get 12 weeks.
`,
      0,
    ),
    /Invalid updatedAt timestamp for source: docs\/hr-policy\.md/,
  );
});

test("prefers explicit source metadata overrides over parsed metadata", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.md",
    `---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: low
---
Employees get 12 weeks.
`,
    0,
    {
      title: "HR Handbook",
      updatedAt: "2026-06-15",
      trustLevel: "high",
      defaultTrustLevel: "medium",
    },
  );

  assert.equal(source.title, "HR Handbook");
  assert.equal(source.updatedAt, "2026-06-15");
  assert.equal(source.trustLevel, "high");
});

test("extracts readable text and title from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
    <meta property="article:modified_time" content="2026-06-15" />
    <meta name="quorum-trust-level" content="high" />
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
  assert.equal(source.updatedAt, "2026-06-15");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /Refund Policy/);
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /- Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /analytics|display: none/);
});

test("extracts metadata from explicitly supplied uppercase html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.HTML",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
    <meta name="last-modified" content="2026-06-21" />
  </head>
  <body><p>Customers can request refunds within 30 days.</p></body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
  assert.equal(source.updatedAt, "2026-06-21");
  assert.equal(source.content, "Refund Policy\n\nCustomers can request refunds within 30 days.");
});

test("extracts metadata and readable text from buffered html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    Buffer.from(
      `<html><head><title>Refund Policy</title><meta name="last-modified" content="2026-07-29" /></head><body><p>Customers can request refunds within 30 days.</p></body></html>`,
      "utf8",
    ),
    2,
  );

  assert.equal(source.title, "Refund Policy");
  assert.equal(source.updatedAt, "2026-07-29");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Refund Policy\n\nCustomers can request refunds within 30 days.");
});

test("prefers the page heading when html titles include help-center chrome", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Help Center | Refund Policy</title>
  </head>
  <body>
    <main>
      <h1>Refund Policy</h1>
      <p>Customers can request refunds within 30 days.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
});

test("normalizes one-column markdown tables in sources", () => {
  const parsed = parseSource(
    "docs/hr-policy.md",
    `| Policy |
| --- |
| Employees receive 12 weeks of paid parental leave. |
| Managers approve exceptions within five business days. |
`,
  );

  assert.equal(
    parsed.body,
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
      "",
    ].join("\n"),
  );
});

test("normalizes one-column html tables in sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th></tr>
      </thead>
      <tbody>
        <tr><td>Customers can request refunds within 30 days.</td></tr>
        <tr><td>Annual plans require support approval.</td></tr>
      </tbody>
    </table>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
});

test("ignores html navigation and control chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <nav>
      <a href="/kb">Knowledge base home</a>
      <a href="/refunds">Refund policy overview</a>
    </nav>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <button type="button">Copy answer</button>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Knowledge base home|Refund policy overview|Copy answer/);
});

test("ignores html header, footer, and aside chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <header>
      <p>Knowledge base home</p>
    </header>
    <aside>
      <p>Related articles</p>
    </aside>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
    <footer>
      <p>Contact support</p>
    </footer>
  </body>
</html>`,
    3,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Knowledge base home|Related articles|Contact support/);
});

test("ignores html dialog chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <dialog open>
      <p>Answer copied to clipboard.</p>
      <button type="button">Dismiss</button>
    </dialog>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    4,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Answer copied to clipboard|Dismiss/);
});

test("ignores hidden html chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <div hidden>
      <p>Knowledge base navigation</p>
    </div>
    <aside aria-hidden="true">
      <p>Cookie preferences</p>
    </aside>
    <section inert>
      <p>Copied to clipboard</p>
    </section>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    4,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Knowledge base navigation|Cookie preferences|Copied to clipboard/);
});

test("ignores inline css-hidden sections in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <div style="display: none;">
      <p>Draft policy change pending approval</p>
    </div>
    <section style="visibility:hidden">
      <p>Copied to clipboard</p>
    </section>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    5,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Draft policy change pending approval|Copied to clipboard/);
});

test("ignores common screen-reader-only sections in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <div class="sr-only">
      <p>Skip to main content</p>
    </div>
    <section class="visually-hidden announcement">
      <p>Dialog closed</p>
    </section>
    <aside class="screen-reader-text">
      <p>Knowledge base controls</p>
    </aside>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Skip to main content|Dialog closed|Knowledge base controls/);
});

test("ignores html comments in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <!-- internal note: route > legal before updating annual-plan exceptions -->
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /route|legal|annual-plan exceptions/);
});

test("preserves html details summaries as readable source section labels", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <details open>
        <summary>Refund exceptions</summary>
        <p>Customers can request refunds within 30 days.</p>
        <ul>
          <li>Annual plans require support approval.</li>
        </ul>
      </details>
    </main>
  </body>
</html>`,
    7,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Refund exceptions:/);
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /- Annual plans require support approval\./);
});

test("ignores collapsed html details body content in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <details>
        <summary>Refund exceptions</summary>
        <p>Customers can request refunds within 30 days.</p>
      </details>
      <details open>
        <summary>Visible policy</summary>
        <p>Managers approve exceptions within two business days.</p>
      </details>
    </main>
  </body>
</html>`,
    8,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Refund exceptions:/);
  assert.doesNotMatch(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Visible policy:/);
  assert.match(source.content, /Managers approve exceptions within two business days\./);
});

test("ignores html iframe chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <iframe src="https://example.com/widget">
      <p>Copied to clipboard.</p>
      <p>Open the full article in a new tab.</p>
    </iframe>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    9,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Copied to clipboard|Open the full article in a new tab/);
});

test("preserves html figure and table captions in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/support.html",
    `<!doctype html>
<html>
  <head>
    <title>Support Policies</title>
  </head>
  <body>
    <main>
      <figure>
        <img src="/queue.png" alt="Queue targets" />
        <figcaption>Enterprise queues receive a first response within four business hours.</figcaption>
      </figure>
      <table>
        <caption>Support response targets.</caption>
        <tbody>
          <tr><td>Priority</td><td>Escalate incidents immediately.</td></tr>
        </tbody>
      </table>
    </main>
  </body>
</html>`,
    8,
  );

  assert.equal(source.title, "Support Policies");
  assert.match(
    source.content,
    /Enterprise queues receive a first response within four business hours\./,
  );
  assert.match(source.content, /Support response targets\./);
  assert.match(source.content, /Priority: Escalate incidents immediately\./);
});

test("falls back to html metadata when the page title is absent", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.html",
    `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Escalations Overview" />
    <meta name="last-modified" content="2026-06-20" />
  </head>
  <body>
    <main>
      <p>Escalate priority incidents immediately.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Escalations Overview");
  assert.equal(source.updatedAt, "2026-06-20");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("reads html title and updated date metadata from name attributes when exports omit property", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.html",
    `<!doctype html>
<html>
  <head>
    <meta name="og:title" content="Escalations Overview" />
    <meta name="article:modified_time" content="2026-06-21T08:15:00Z" />
  </head>
  <body>
    <main>
      <p>Escalate priority incidents immediately.</p>
    </main>
  </body>
</html>`,
    3,
  );

  assert.equal(source.title, "Escalations Overview");
  assert.equal(source.updatedAt, "2026-06-21T08:15:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("reads html title metadata from dublin core name attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <meta name="dcterms.title" content="Benefits Policy Handbook" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    5,
  );

  assert.equal(source.title, "Benefits Policy Handbook");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Employees receive medical coverage after 30 days.");
});

test("reads html title metadata from itemprop attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <meta itemprop="headline" content="Benefits Policy Handbook" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Benefits Policy Handbook");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Employees receive medical coverage after 30 days.");
});

test("reads html updated dates from dublin core name attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
    <meta name="DC.date.modified" content="2026-06-22T11:30:00Z" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    5,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-22T11:30:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("reads html updated dates from itemprop attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
    <meta itemprop="dateModified" content="2026-06-23T09:45:00Z" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-23T09:45:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("falls back to the first html heading when title metadata is absent", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/vacation-policy.html",
    `<!doctype html>
<html>
  <body>
    <main>
      <h1>Vacation Policy</h1>
      <p>Full-time employees receive 20 days of paid vacation each calendar year.</p>
    </main>
  </body>
</html>`,
    7,
  );

  assert.equal(source.title, "Vacation Policy");
  assert.equal(source.trustLevel, "medium");
  assert.match(
    source.content,
    /Full-time employees receive 20 days of paid vacation each calendar year\./,
  );
});

test("falls back to a time datetime attribute when html update metadata is absent", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
  </head>
  <body>
    <main>
      <p><time datetime="2026-06-18T14:30:00Z">Updated June 18, 2026</time></p>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    8,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-18T14:30:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Updated June 18, 2026/);
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("extracts readable text from html table sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
  </head>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th><th>Details</th></tr>
      </thead>
      <tbody>
        <tr><td>Parental leave</td><td>Employees receive 12 weeks of paid parental leave.</td></tr>
        <tr><td>Healthcare</td><td>Coverage begins after 30 days of employment.</td></tr>
      </tbody>
    </table>
  </body>
</html>`,
    9,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.match(source.content, /Benefits Policy/);
  assert.match(
    source.content,
    /Parental leave: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(source.content, /Healthcare: Coverage begins after 30 days of employment\./);
});

test("extracts readable text from html description list sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
  </head>
  <body>
    <dl>
      <dt>Parental leave</dt>
      <dd>Employees receive 12 weeks of paid parental leave.</dd>
      <dt>Healthcare</dt>
      <dd>Coverage begins after 30 days of employment.</dd>
      <dd>Part-time staff receive prorated coverage.</dd>
    </dl>
  </body>
</html>`,
    10,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.match(source.content, /Benefits Policy/);
  assert.match(
    source.content,
    /Parental leave: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(source.content, /Healthcare: Coverage begins after 30 days of employment\./);
  assert.match(source.content, /Healthcare: Part-time staff receive prorated coverage\./);
});

test("extracts readable text from markdown table sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.md",
    `| Policy | Details |
| --- | --- |
| Parental leave | Employees receive 12 weeks of paid parental leave. |
| Healthcare | Coverage begins after 30 days of employment.<br>Part-time staff receive prorated coverage. |
| Support tiers | Enterprise support covers billing \\| technical issues. |
`,
    11,
  );

  assert.equal(source.title, "benefits");
  assert.equal(
    source.content,
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Healthcare: Coverage begins after 30 days of employment. Part-time staff receive prorated coverage.",
      "Support tiers: Enterprise support covers billing | technical issues.",
      "",
    ].join("\n"),
  );
});

test("reads html updated dates from http-equiv metadata", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
    <meta http-equiv="last-modified" content="2026-06-19T09:45:00Z" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    11,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-19T09:45:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
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
    12,
  );

  assert.equal(source.title, "Benefits — US");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
  assert.match(source.content, /People Ops’ policy applies to full-time staff\./);
});

test("decodes common named html entities from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.html",
    `<!doctype html>
<html>
  <head>
    <title>Support &amp; Escalations &mdash; North America</title>
  </head>
  <body>
    <main>
      <p>Customers&rsquo; refund requests require manager review after 30 days.</p>
      <p>Priority incidents need a response within four hours &ndash; including weekends.</p>
    </main>
  </body>
</html>`,
    13,
  );

  assert.equal(source.title, "Support & Escalations — North America");
  assert.match(
    source.content,
    /Customers’ refund requests require manager review after 30 days\./,
  );
  assert.match(
    source.content,
    /Priority incidents need a response within four hours – including weekends\./,
  );
});

test("decodes comparison html entities from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/eligibility.html",
    `<!doctype html>
<html>
  <body>
    <main>
      <p>Employees need &ge; 12 months of service.</p>
      <p>Requests with &le; 5 days notice are not eligible.</p>
      <p>A contractor is &ne; a benefits-eligible employee.</p>
    </main>
  </body>
</html>`,
    14,
  );

  assert.equal(source.content,
    "Employees need ≥ 12 months of service.\n\nRequests with ≤ 5 days notice are not eligible.\n\nA contractor is ≠ a benefits-eligible employee.",
  );
});

test("falls back to the html file name when the page has no title", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.htm",
    "<html><body><p>Escalate priority incidents immediately.</p></body></html>",
    14,
  );

  assert.equal(source.title, "escalations");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("extracts readable text and metadata from exported xml sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.xml",
    `<?xml version="1.0"?>
<policy>
  <title>Benefits Policy</title>
  <meta name="last-modified" content="2026-06-21" />
  <meta name="quorum-trust-level" content="high" />
  <section><heading>Leave</heading><paragraph>Employees receive 12 weeks.</paragraph></section>
</policy>`,
    4,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-21");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /Employees receive 12 weeks\./);
  assert.doesNotMatch(source.content, /<section>|<paragraph>/);
});

test("unwraps CDATA policy text from exported xml sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.xml",
    `<policy><section><![CDATA[Employees receive 12 weeks of paid leave.]]></section></policy>`,
    0,
  );

  assert.equal(source.content, "Employees receive 12 weeks of paid leave.");
  assert.doesNotMatch(source.content, /CDATA/);
});

test("parses XHTML sources and preserves the file-name title fallback", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.xhtml",
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Escalate priority incidents immediately.</p></body></html>',
    15,
  );

  assert.equal(source.title, "escalations");
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

test("extracts embedded pdf title and modification metadata when present", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.pdf",
    createSimplePdf("Employees receive 12 weeks of paid parental leave.", {
      title: "HR Benefits Policy PDF",
      modDate: "D:20260615093000-04'00'",
    }),
    1,
  );

  assert.equal(source.title, "HR Benefits Policy PDF");
  assert.equal(source.updatedAt, "2026-06-15T09:30:00-04:00");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive 12 weeks of paid parental leave\./);
});
