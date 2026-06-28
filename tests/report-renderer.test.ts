import assert from "node:assert/strict";
import test from "node:test";
import { verifyAnswer } from "../src/claim-verifier.js";
import type { SourceDocument } from "../src/domain.js";
import { renderMarkdownReport, renderTextReport } from "../src/report-renderer.js";

const hrPolicy: SourceDocument = {
  id: "hr_policy",
  title: "HR Policy",
  trustLevel: "high",
  updatedAt: "2026-05-31",
  content: `
Employees receive 12 weeks of paid parental leave.
Full-time employees receive 20 days of paid vacation each calendar year.
Healthcare coverage begins after 30 days of employment.
`,
};

test("renders the text report used by the CLI", () => {
  const report = verifyAnswer(
    "Full-time employees receive 20 days of paid vacation each calendar year.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  const rendered = renderTextReport(report);

  assert.match(rendered, /Quorum Verification Report/);
  assert.match(rendered, /Sources: HR Policy/);
  assert.match(rendered, /VERIFIED  Full-time employees receive 20 days/);
  assert.match(rendered, /Evidence \(HR Policy, high trust, score /);
});

test("renders a markdown reviewer report with summary, sources, and evidence", () => {
  const report = verifyAnswer(
    "Employees receive 18 weeks of paid parental leave.\nEmployees receive free catered lunch every day.",
    [hrPolicy],
    "2026-06-28T00:00:00.000Z",
  );

  const rendered = renderMarkdownReport(report);

  assert.match(rendered, /# Quorum Verification Report/);
  assert.match(rendered, /Generated: 2026-06-28T00:00:00.000Z/);
  assert.match(rendered, /- Verified: 0/);
  assert.match(rendered, /- Contradicted: 1/);
  assert.match(rendered, /- Unsupported: 1/);
  assert.match(rendered, /## Sources/);
  assert.match(rendered, /\*\*HR Policy\*\* \(trust: high, updated: 2026-05-31\)/);
  assert.match(rendered, /### 1\. Employees receive 18 weeks of paid parental leave\./);
  assert.match(rendered, /- Verdict: `contradicted`/);
  assert.match(rendered, /> Employees receive 12 weeks of paid parental leave\./);
  assert.match(rendered, /- Evidence: No approved source snippet matched strongly enough\./);
});
