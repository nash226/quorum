import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateFixture,
  evaluateFixtureFile,
  loadEvaluationFixture,
  renderEvaluationScorecard,
} from "../src/index.js";

test("loads and evaluates the HR example fixture", async () => {
  const fixturePath = resolve("examples/evaluations/hr-policy.json");
  const fixture = await loadEvaluationFixture(fixturePath);
  const scorecard = await evaluateFixture(fixture, {
    baseDir: resolve("examples/evaluations"),
    fixturePath,
    generatedAt: "2026-07-05T10:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR policy example");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["contradicted", "verified", "unsupported"],
  );
});

test("evaluates fixture files relative to the fixture directory", async () => {
  const scorecard = await evaluateFixtureFile(
    resolve("examples/evaluations/support-policy.json"),
    {
      generatedAt: "2026-07-05T10:05:00.000Z",
    },
  );

  assert.equal(scorecard.fixtureName, "Support policy example");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("renders mismatch details in evaluation scorecards", () => {
  const rendered = renderEvaluationScorecard({
    fixtureName: "Mismatch fixture",
    answerPath: "/tmp/answer.md",
    sourcePaths: ["/tmp/source.md"],
    report: {
      generatedAt: "2026-07-05T10:10:00.000Z",
      answerPath: "/tmp/answer.md",
      answerLabel: "answer",
      answerPreview: "Preview",
      answer: "Answer text",
      sources: [],
      assessments: [],
      summary: {
        verified: 0,
        contradicted: 1,
        unsupported: 0,
        needs_review: 0,
      },
    },
    expectedSummary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    },
    actualSummary: {
      verified: 0,
      contradicted: 1,
      unsupported: 0,
      needs_review: 0,
    },
    summaryMatches: false,
    claims: [
      {
        index: 0,
        claimText: "Benefits begin on day one.",
        actualVerdict: "contradicted",
        expectedVerdict: "verified",
        matches: false,
      },
    ],
    matchedClaims: 0,
    totalExpectedClaims: 1,
    score: 0,
  });

  assert.match(rendered, /Summary match: no/);
  assert.match(rendered, /Claim mismatches:/);
  assert.match(rendered, /expected verified, got contradicted/);
});
