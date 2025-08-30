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

test("strips inline markdown formatting from extracted claims", () => {
  const claims = extractClaims(`Policy summary:

- **Parental leave:** Employees receive \`12 weeks\` of paid parental leave.
- Review the [support playbook](https://example.com/support) before escalating tickets.
- ~~Legacy note~~ Current onboarding steps apply to full-time staff.
`);

  assert.deepEqual(
    claims.map((claim) => claim.text),
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Review the support playbook before escalating tickets.",
      "Legacy note Current onboarding steps apply to full-time staff.",
    ],
  );
});
