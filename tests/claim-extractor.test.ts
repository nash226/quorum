import assert from "node:assert/strict";
import test from "node:test";
import { extractClaims, extractClaimsResult } from "../src/claim-extractor.js";

test("returns a queue-routing signal alongside normalized claims", () => {
  assert.deepEqual(extractClaimsResult("Employees receive 12 weeks of leave."), {
    answerHasClaims: true,
    claims: [{ id: "claim_1", text: "Employees receive 12 weeks of leave." }],
  });

  assert.deepEqual(extractClaimsResult("# Draft notes\n\n---"), {
    answerHasClaims: false,
    claims: [],
  });
});

test("preserves short claims instead of silently dropping them", () => {
  const claims = extractClaims(`
- No refunds.
- N/A for contractors.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "No refunds.",
    "N/A for contractors.",
  ]);
});

test("preserves short standalone policy statements", () => {
  const claims = extractClaims("No refunds.\nN/A.");

  assert.deepEqual(claims.map((claim) => claim.text), ["No refunds."]);
});

test("splits ordinary sentences into atomic conjunction claims", () => {
  const claims = extractClaims(
    "Employees receive 12 weeks of paid leave and Managers approve exceptions within five business days.",
  );

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid leave",
    "Managers approve exceptions within five business days.",
  ]);
});

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

test("strips common unicode numbered-list markers from claims", () => {
  const claims = extractClaims(`① Employees receive 12 weeks of paid parental leave.
❷ Healthcare coverage begins after 30 days of employment.
⓷ Contractors do not receive paid vacation.`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
    "Healthcare coverage begins after 30 days of employment.",
    "Contractors do not receive paid vacation.",
  ]);
});

test("strips middle-dot bullets from localized answers", () => {
  const claims = extractClaims(`· Employees receive 12 weeks of paid parental leave.
· Healthcare coverage begins after 30 days of employment.`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
    "Healthcare coverage begins after 30 days of employment.",
  ]);
});

test("strips Arabic-Indic and Persian numbered-list markers from claims", () => {
  const claims = extractClaims(`١. Employees receive 12 weeks of paid parental leave.
۲) Healthcare coverage begins after 30 days of employment.
۳) Employees may request remote work after onboarding.`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
    "Healthcare coverage begins after 30 days of employment.",
    "Employees may request remote work after onboarding.",
  ]);
});

test("strips fullwidth numbered-list markers from localized exports", () => {
  const claims = extractClaims(`１. Employees receive 12 weeks of paid parental leave.
２) Healthcare coverage begins after 30 days of employment.`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
    "Healthcare coverage begins after 30 days of employment.",
  ]);
});

test("strips bracketed numbered-list markers from exported answers", () => {
  const claims = extractClaims(`[1] Employees receive 12 weeks of paid parental leave.
[2] Healthcare coverage begins after 30 days of employment.`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
    "Healthcare coverage begins after 30 days of employment.",
  ]);
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

test("extracts claims from one-column markdown table answers", () => {
  const claims = extractClaims(`| Policy |
| --- |
| Employees receive 12 weeks of paid parental leave. |
| Managers approve exceptions within five business days. |
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
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

test("extracts markdown table claims when cells use inline html line breaks", () => {
  const claims = extractClaims(`| Policy | Details |
| --- | --- |
| Parental leave | Employees receive 12 weeks of paid parental leave.<br>For full-time staff only. |
| Support | Managers approve billing exceptions within five business days.<br />Escalations require director review after that. |
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Parental leave: For full-time staff only.",
      "Support: Managers approve billing exceptions within five business days.",
      "Support: Escalations require director review after that.",
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

test("extracts claims from one-column html table answers", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th></tr>
      </thead>
      <tbody>
        <tr><td>Employees receive 12 weeks of paid parental leave.</td></tr>
        <tr><td>Managers approve exceptions within five business days.</td></tr>
      </tbody>
    </table>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
    ],
  );
});

test("extracts clean claims from html description list answers", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <dl>
      <dt>Parental leave</dt>
      <dd>Employees receive 12 weeks of paid parental leave.</dd>
      <dt>Healthcare</dt>
      <dd>Coverage begins after 30 days of employment.</dd>
      <dd>Part-time staff receive prorated coverage.</dd>
    </dl>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Healthcare: Coverage begins after 30 days of employment.",
      "Healthcare: Part-time staff receive prorated coverage.",
    ],
  );
});

test("extracts claims from html figure captions", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <figure>
      <img src="/leave-policy.png" alt="Leave policy summary" />
      <figcaption>Employees receive 12 weeks of paid parental leave.</figcaption>
    </figure>
  </body>
</html>`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Employees receive 12 weeks of paid parental leave.",
  ]);
});

test("extracts table captions alongside html table row claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <table>
      <caption>Support response targets.</caption>
      <thead>
        <tr><th>Queue</th><th>Policy</th></tr>
      </thead>
      <tbody>
        <tr><td>Enterprise</td><td>First response arrives within four business hours.</td></tr>
      </tbody>
    </table>
  </body>
</html>`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Support response targets.",
    "Enterprise: First response arrives within four business hours.",
  ]);
});

test("ignores collapsed html details body content while keeping the visible summary", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <details>
      <summary>Refund policy</summary>
      <p>Customers can request refunds within 30 days.</p>
    </details>
    <details open>
      <summary>Support policy</summary>
      <p>Managers approve escalations within two business days.</p>
    </details>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    ["Managers approve escalations within two business days."],
  );
});

test("ignores collapsed html details summaries without visible claim bodies", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <details>
      <summary>Refund policy</summary>
    </details>
  </body>
</html>`);

  assert.deepEqual(claims, []);
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

test("splits independently capitalized comma-and conjunctions into claims", () => {
  const claims = extractClaims(
    "Customers can cancel monthly subscriptions from account billing settings, and Managers approve exceptions within five business days.",
  );

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers can cancel monthly subscriptions from account billing settings",
    "Managers approve exceptions within five business days.",
  ]);
});

test("splits comma conjunctions when the next claim starts with a number", () => {
  const claims = extractClaims(
    "Customers can cancel monthly subscriptions from account billing settings, and 30-day refunds require manager approval.",
  );

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers can cancel monthly subscriptions from account billing settings",
    "30-day refunds require manager approval.",
  ]);
});

test("keeps lowercase comma conjunctions together when they may be continuations", () => {
  const claims = extractClaims(
    "Customers can cancel monthly subscriptions from account billing settings, and refund requests remain subject to the annual plan policy.",
  );

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers can cancel monthly subscriptions from account billing settings, and refund requests remain subject to the annual plan policy.",
  ]);
});

test("preserves uncertainty wording in compound claims", () => {
  const claims = extractClaims(
    "Customers may request a refund within 30 days, and eligibility depends on plan terms.",
  );

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers may request a refund within 30 days, and eligibility depends on plan terms.",
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

test("strips square bullets from exported policy answers", () => {
  const claims = extractClaims(`Policy notes:

▪ Employees receive 12 weeks of paid parental leave
▫ Healthcare coverage begins after 30 days of employment
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave",
      "Healthcare coverage begins after 30 days of employment",
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

test("keeps colon-terminated business claims instead of treating them as labels", () => {
  const claims = extractClaims(`No refunds are available:
Customers can request store credit within 30 days.
`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "No refunds are available:",
    "Customers can request store credit within 30 days.",
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
    <details open>
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

test("ignores html code blocks between claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <p>Customers can request refunds within 30 days.</p>
    <pre><code>{
  "refundWindowDays": 30,
  "requiresManagerApprovalAfterDays": true
}</code></pre>
    <p>Annual plans require support approval.</p>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Annual plans require support approval.",
    ],
  );
});

test("ignores standalone html code elements between claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <p>Customers can request refunds within 30 days.</p>
    <p>Use <code>Employees receive 12 weeks of paid parental leave.</code> as the example response.</p>
    <p>Annual plans require support approval.</p>
  </body>
</html>`);

  assert.deepEqual(claims.map((claim) => claim.text), [
    "Customers can request refunds within 30 days.",
    "Use as the example response.",
    "Annual plans require support approval.",
  ]);
});

test("ignores html heading text before html list claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <h1>HR Policy Summary</h1>
    <h2>Leave</h2>
    <ul>
      <li>Employees receive 12 weeks of paid parental leave.</li>
      <li>Healthcare coverage begins after 30 days of employment.</li>
    </ul>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Healthcare coverage begins after 30 days of employment.",
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

test("ignores html head metadata before html answer claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <head>
    <title>HR Policy Summary</title>
    <meta name="description" content="Internal answer draft" />
  </head>
  <body>
    <p>Employees receive 12 weeks of paid parental leave.</p>
    <p>Managers approve exceptions within five business days.</p>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
    ],
  );
});

test("ignores html navigation and control chrome before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
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
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Annual plans require support approval.",
    ],
  );
});

test("ignores html dialog chrome before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <dialog open>
      <p>Copy answer to clipboard before publishing.</p>
      <button type="button">Copy answer</button>
    </dialog>
    <main>
      <p>Employees receive 12 weeks of paid parental leave.</p>
      <p>Managers approve exceptions within five business days.</p>
    </main>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
    ],
  );
});

test("ignores html iframe chrome before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <iframe src="https://example.com/widget">
      <p>Copied to clipboard.</p>
      <p>Open the full answer in the portal.</p>
    </iframe>
    <main>
      <p>Employees receive 12 weeks of paid parental leave.</p>
      <p>Managers approve exceptions within five business days.</p>
    </main>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
    ],
  );
});

test("ignores hidden html chrome before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
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
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Annual plans require support approval.",
    ],
  );
});

test("ignores inline css-hidden html sections before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <div style="display: none;">
      <p>Draft policy change pending approval.</p>
    </div>
    <section style="visibility:hidden">
      <p>Copied to clipboard.</p>
    </section>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Annual plans require support approval.",
    ],
  );
});

test("ignores common screen-reader-only html sections before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
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
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Customers can request refunds within 30 days.",
      "Annual plans require support approval.",
    ],
  );
});

test("ignores html header, footer, and aside chrome before extracting claims", () => {
  const claims = extractClaims(`<!doctype html>
<html>
  <body>
    <header>
      <p>Internal draft for review only.</p>
    </header>
    <aside>
      <p>Search knowledge base</p>
    </aside>
    <main>
      <p>Employees receive 12 weeks of paid parental leave.</p>
      <p>Annual plans require support approval.</p>
    </main>
    <footer>
      <p>Last updated by knowledge bot.</p>
    </footer>
  </body>
</html>`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Annual plans require support approval.",
    ],
  );
});

test("strips inline-only html fragments before extracting claims", () => {
  const claims = extractClaims(`
<a href="/policy">Employees receive 12 weeks of paid parental leave.</a>
<strong>Managers approve exceptions within five business days.</strong>
<em>Healthcare coverage begins after 30 days of employment.</em>
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
      "Healthcare coverage begins after 30 days of employment.",
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
