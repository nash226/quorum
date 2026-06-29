import assert from "node:assert/strict";
import test from "node:test";
import {
  matchingFailVerdicts,
  parseClaimVerdict,
  shouldFailReport,
} from "../src/report-policy.js";
import type { ClaimVerdict, VerificationReport } from "../src/domain.js";

const report = {
  summary: {
    verified: 2,
    unsupported: 1,
    contradicted: 0,
    needs_review: 0,
  },
} satisfies Pick<VerificationReport, "summary">;

test("parses supported claim verdicts", () => {
  assert.equal(parseClaimVerdict("unsupported"), "unsupported");
  assert.equal(parseClaimVerdict("needs_review"), "needs_review");
});

test("rejects unsupported fail-on verdicts", () => {
  assert.throws(() => parseClaimVerdict("maybe"), /Unsupported verdict/);
});

test("fails reports when selected verdicts are present", () => {
  const failOn: ClaimVerdict[] = ["unsupported", "contradicted"];

  assert.equal(shouldFailReport(report, failOn), true);
  assert.equal(shouldFailReport(report, ["contradicted"]), false);
  assert.deepEqual(matchingFailVerdicts(report, failOn), ["unsupported"]);
  assert.deepEqual(matchingFailVerdicts(report, ["contradicted"]), []);
});
