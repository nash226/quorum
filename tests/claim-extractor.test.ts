import assert from "node:assert/strict";
import test from "node:test";
import { extractClaims } from "../src/claim-extractor.js";

test("extracts clean claims from markdown list answers", () => {
  const claims = extractClaims(`# HR Policy Summary

1. Employees receive 12 weeks of paid parental leave
2. Healthcare coverage begins after 30 days of employment
- Contractors do not receive paid vacation
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
      "Contractors do not receive paid vacation",
    ],
  );
});

test("skips setext markdown headings before list claims", () => {
  const claims = extractClaims(`HR Policy Summary
=================

1. Employees receive 12 weeks of paid parental leave
2. Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
    ],
  );
});

test("skips setext markdown headings before wrapped plain-text claims", () => {
  const claims = extractClaims(`Support Notes
-------------

Employees receive 12 weeks of paid parental leave
for full-time staff only.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave for full-time staff only.",
  ]);
});

test("keeps claims that appear before markdown thematic breaks", () => {
  const claims = extractClaims(`Employees receive 12 weeks of paid parental leave.
---
Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("ignores quote, checkbox, and heading markdown prefixes", () => {
  const claims = extractClaims(`## Support Notes

> Customers can request refunds within 30 days.
- [x] Enterprise support requests receive a first response within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("extracts clean claims from markdown definition lists", () => {
  const claims = extractClaims(`Leave policy
: Employees receive 12 weeks of paid parental leave.
: Managers approve exceptions within five business days.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
    ],
  );
});

test("keeps wrapped markdown definition list items as single claims", () => {
  const claims = extractClaims(`Leave policy
: Employees receive 12 weeks of paid parental leave
  for full-time staff only.

Support policy
: Enterprise support requests receive a first response
  within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("extracts clean claims from markdown table answers", () => {
  const claims = extractClaims(`| Policy | Details |
| --- | --- |
| Parental leave | Employees receive 12 weeks of paid parental leave. |
| Healthcare | Coverage begins after 30 days of employment. |
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Healthcare: Coverage begins after 30 days of employment.",
    ],
  );
});

test("extracts markdown tables without trailing pipe punctuation noise", () => {
  const claims = extractClaims(`| Queue | Policy |
| --- | --- |
| Refunds | Customers can request refunds within 30 days |
| Escalations | Managers approve exceptions within two business days |
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Refunds: Customers can request refunds within 30 days",
      "Escalations: Managers approve exceptions within two business days",
    ],
  );
});

test("extracts clean claims from html table answers", () => {
  const claims = extractClaims(`<!doctype html>
<html>
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
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Healthcare: Coverage begins after 30 days of employment.",
    ],
  );
});

test("keeps escaped pipes inside markdown table cells", () => {
  const claims = extractClaims(`| Policy | Details |
| --- | --- |
| Support tiers | Enterprise support covers billing \\| technical issues. |
| Leave policy | Employees receive 12 weeks for full-time \\| part-time staff. |
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Support tiers: Enterprise support covers billing | technical issues.",
      "Leave policy: Employees receive 12 weeks for full-time | part-time staff.",
    ],
  );
});

test("keeps wrapped blockquote lines as a single claim", () => {
  const claims = extractClaims(`## Support Notes

> Customers can request refunds within 30 days
> for billing disputes only.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers can request refunds within 30 days for billing disputes only.",
  ]);
});

test("ignores standalone markdown callout labels before quoted claims", () => {
  const claims = extractClaims(`## Support Notes

> [!NOTE]
> Customers can request refunds within 30 days.
> Billing managers approve exceptions within two business days.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Billing managers approve exceptions within two business days.",
    ],
  );
});

test("strips inline markdown callout labels from claim content", () => {
  const claims = extractClaims(`## Policy Notes

> [!WARNING] Employees receive 12 weeks of paid parental leave
> for full-time staff only.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave for full-time staff only.",
  ]);
});

test("does not merge separate quoted claims that start on a new uppercase line", () => {
  const claims = extractClaims(`## Support Notes

> Customers can request refunds within 30 days.
> Billing managers approve exceptions within two business days.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Billing managers approve exceptions within two business days.",
    ],
  );
});

test("keeps wrapped markdown list items as single claims", () => {
  const claims = extractClaims(`# Policy Notes

1. Employees receive 12 weeks of paid parental leave
for full-time staff only.
- Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("keeps indented uppercase markdown list continuations with the same claim", () => {
  const claims = extractClaims(`# Policy Notes

1. Employees receive 12 weeks of paid parental leave
   For full-time staff only.
- Enterprise support requests receive a first response
  Within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave For full-time staff only.",
      "Enterprise support requests receive a first response Within four business hours.",
    ],
  );
});

test("ignores indented markdown code blocks between claims", () => {
  const claims = extractClaims(`Deployment notes:

    npm run deploy --force
    quorum verify --answer draft.md --source-dir sources

Employees receive 12 weeks of paid parental leave.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
  ]);
});

test("keeps indented markdown list continuations even when they use four spaces", () => {
  const claims = extractClaims(`# Policy Notes

1. Employees receive 12 weeks of paid parental leave
    for full-time staff only.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave for full-time staff only.",
  ]);
});

test("extracts clean claims from lettered markdown list answers", () => {
  const claims = extractClaims(`Policy notes:

A. Employees receive 12 weeks of paid parental leave
b) Healthcare coverage begins after 30 days of employment
(c) Contractors do not receive paid vacation
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
      "Contractors do not receive paid vacation",
    ],
  );
});

test("keeps wrapped lettered markdown list items as single claims", () => {
  const claims = extractClaims(`Policy notes:

A. Employees receive 12 weeks of paid parental leave
for full-time staff only.
(b) Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("extracts clean claims from roman numeral markdown list answers", () => {
  const claims = extractClaims(`Policy notes:

II. Employees receive 12 weeks of paid parental leave
III. Healthcare coverage begins after 30 days of employment
iv) Contractors do not receive paid vacation
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
      "Contractors do not receive paid vacation",
    ],
  );
});

test("extracts clean claims from lowercase roman numeral markdown lists with periods", () => {
  const claims = extractClaims(`Policy notes:

ii. Employees receive 12 weeks of paid parental leave
iii. Healthcare coverage begins after 30 days of employment
iv. Contractors do not receive paid vacation
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
      "Contractors do not receive paid vacation",
    ],
  );
});

test("keeps wrapped roman numeral markdown list items as single claims", () => {
  const claims = extractClaims(`Policy notes:

II. Employees receive 12 weeks of paid parental leave
for full-time staff only.
(iv) Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("extracts clean claims from parenthesized numeric markdown list answers", () => {
  const claims = extractClaims(`Policy notes:

(1) Employees receive 12 weeks of paid parental leave
(2) Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
    ],
  );
});

test("extracts clean claims from numeric colon list answers", () => {
  const claims = extractClaims(`Policy notes:

1: Employees receive 12 weeks of paid parental leave
2: Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
    ],
  );
});

test("extracts clean claims from inline enumerated answers", () => {
  const claims = extractClaims(
    "1) Employees receive 12 weeks of paid parental leave. 2) Managers approve travel within five business days. • Finance reviews international trips before booking. (a) Legal approves contract exceptions.",
  );

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve travel within five business days.",
      "Finance reviews international trips before booking.",
      "Legal approves contract exceptions.",
    ],
  );
});

test("extracts clean claims from inline numeric-colon answers", () => {
  const claims = extractClaims(
    "1: Employees receive 12 weeks of paid parental leave. 2: Managers approve travel within five business days.",
  );

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve travel within five business days.",
    ],
  );
});

test("splits semicolon-delimited policy clauses into separate claims", () => {
  const claims = extractClaims(
    "Employees receive 12 weeks of paid parental leave; Healthcare coverage begins after 30 days of employment.",
  );

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("keeps lowercase semicolon continuations in the same claim", () => {
  const claims = extractClaims(
    "Employees receive 12 weeks of paid parental leave; for full-time staff only.",
  );

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave; for full-time staff only.",
  ]);
});

test("keeps wrapped parenthesized numeric markdown list items as single claims", () => {
  const claims = extractClaims(`Policy notes:

(1) Employees receive 12 weeks of paid parental leave
for full-time staff only.
(2) Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("keeps wrapped numeric colon list items as single claims", () => {
  const claims = extractClaims(`Policy notes:

1: Employees receive 12 weeks of paid parental leave
for full-time staff only.
2: Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("extracts clean claims from unicode bullet list answers", () => {
  const claims = extractClaims(`Policy notes:

• Employees receive 12 weeks of paid parental leave
• Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
    ],
  );
});

test("keeps wrapped unicode bullet list items as single claims", () => {
  const claims = extractClaims(`Policy notes:

• Employees receive 12 weeks of paid parental leave
for full-time staff only.
• Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("extracts clean claims from em dash bullet list answers", () => {
  const claims = extractClaims(`Policy notes:

— Employees receive 12 weeks of paid parental leave
— Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
    ],
  );
});

test("keeps wrapped em dash bullet list items as single claims", () => {
  const claims = extractClaims(`Policy notes:

— Employees receive 12 weeks of paid parental leave
for full-time staff only.
— Enterprise support requests receive a first response
within four business hours.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Enterprise support requests receive a first response within four business hours.",
    ],
  );
});

test("skips markdown list intro lines that only label the bullets", () => {
  const claims = extractClaims(`Policy summary:

- Employees receive 12 weeks of paid parental leave.
- Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("skips plain-text intro lines that only label the following claims", () => {
  const claims = extractClaims(`Policy summary:

Employees receive 12 weeks of paid parental leave.
Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("skips plain-text intro lines before wrapped claim continuations", () => {
  const claims = extractClaims(`Key details:

Employees receive 12 weeks of paid parental leave
for full-time staff only.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave for full-time staff only.",
  ]);
});

test("keeps wrapped plain-text lines as one claim when the next line is a continuation", () => {
  const claims = extractClaims(`Employees receive 12 weeks of paid parental leave
for full-time staff only.

Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff only.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("does not merge separate plain-text claims that start on a new uppercase line", () => {
  const claims = extractClaims(`Employees receive 12 weeks of paid parental leave
Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
    ],
  );
});

test("ignores fenced code blocks in markdown answers", () => {
  const claims = extractClaims(`Policy summary:

\`\`\`json
{
  "refundWindowDays": 30,
  "requiresManagerApproval": true
}
\`\`\`

Customers can request refunds within 30 days.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers can request refunds within 30 days.",
  ]);
});

test("strips inline markdown formatting from extracted claims", () => {
  const claims = extractClaims(`Policy summary:

- **Parental leave:** Employees receive \`12 weeks\` of paid parental leave.
- Review the [support playbook](https://example.com/support) before escalating tickets.
- Review the [escalation guide][guide] before escalating billing tickets.[^1]
- ~~Legacy note~~ Current onboarding steps apply to full-time staff.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Review the support playbook before escalating tickets.",
      "Review the escalation guide before escalating billing tickets.",
      "Legacy note Current onboarding steps apply to full-time staff.",
    ],
  );
});

test("ignores html comments between claims", () => {
  const claims = extractClaims(`Employees receive 12 weeks of paid parental leave.
<!-- internal note: verify regional exceptions before publishing -->
Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("ignores markdown reference definitions before claims", () => {
  const claims = extractClaims(`[policy]: https://example.com/policy "Approved policy"
[guide]: https://example.com/guide
Employees receive 12 weeks of paid parental leave.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
  ]);
});

test("ignores markdown footnote definitions and their continuations", () => {
  const claims = extractClaims(`[^1]: Internal reviewer note.
  Continue the internal-only context here.

Employees receive 12 weeks of paid parental leave.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
  ]);
});

test("ignores yaml frontmatter before answer claims", () => {
  const claims = extractClaims(`---
title: HR answer draft
owner: People Ops
---
Employees receive 12 weeks of paid parental leave.
Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});

test("ignores toml frontmatter before answer claims", () => {
  const claims = extractClaims(`+++
title = "HR answer draft"
owner = "People Ops"
+++
Employees receive 12 weeks of paid parental leave.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
  ]);
});

test("extracts clean claims from html answer markup", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <details>
      <summary>Policy summary</summary>
      <ul>
        <li>Employees receive 12 weeks of paid parental leave.</li>
        <li>Customers&rsquo; refund requests require manager review after 30 days.</li>
      </ul>
    </details>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Customers’ refund requests require manager review after 30 days.",
    ],
  );
});

test("strips inline html formatting and links from html answer claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <p>Employees receive <a href="/policy">12 weeks of paid parental leave</a> for full-time staff.</p>
    <p><strong>Managers</strong> approve exceptions within <em>five business days</em>.</p>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave for full-time staff.",
      "Managers approve exceptions within five business days.",
    ],
  );
});

test("keeps leading thematic breaks when they are not frontmatter", () => {
  const claims = extractClaims(`---

Employees receive 12 weeks of paid parental leave.
Healthcare coverage begins after 30 days of employment.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
    ],
  );
});
