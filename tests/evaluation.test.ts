import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateFixture,
  evaluateFixtureFiles,
  evaluateFixtureFile,
  hasEvaluationMismatch,
  loadEvaluationFixture,
  renderEvaluationScorecard,
  renderEvaluationTextReport,
  resolveEvaluationFixturePaths,
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

test("resolves fixture paths from nested directories in stable order", async () => {
  const fixturePaths = await resolveEvaluationFixturePaths(
    [resolve("examples/evaluations/hr-policy.json")],
    [resolve("examples/evaluations")],
  );

  assert.deepEqual(fixturePaths, [
    resolve("examples/evaluations/hr-policy.json"),
    resolve("examples/evaluations/support-policy.json"),
  ]);
});

test("evaluates fixture files from explicit paths and fixture directories", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixturePaths: [resolve("examples/evaluations/hr-policy.json")],
    fixtureDirPaths: [resolve("examples/evaluations")],
    generatedAt: "2026-07-05T10:07:00.000Z",
  });

  assert.equal(scorecards.length, 2);
  assert.deepEqual(
    scorecards.map((scorecard) => scorecard.fixtureName),
    ["HR policy example", "Support policy example"],
  );
  assert.ok(
    scorecards.every(
      (scorecard) => scorecard.report.generatedAt === "2026-07-05T10:07:00.000Z",
    ),
  );
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

test("renders evaluation text report totals and mismatch detection", () => {
  const scorecards = [
    {
      fixtureName: "Match fixture",
      answerPath: "/tmp/answer-1.md",
      sourcePaths: ["/tmp/source-1.md"],
      report: {
        generatedAt: "2026-07-05T10:15:00.000Z",
        answerPath: "/tmp/answer-1.md",
        answerLabel: "answer-1",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [],
        summary: {
          verified: 1,
          contradicted: 0,
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
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      summaryMatches: true,
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 0,
      score: 1,
    },
    {
      fixtureName: "Mismatch fixture",
      answerPath: "/tmp/answer-2.md",
      sourcePaths: ["/tmp/source-2.md"],
      report: {
        generatedAt: "2026-07-05T10:16:00.000Z",
        answerPath: "/tmp/answer-2.md",
        answerLabel: "answer-2",
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
      claims: [],
      matchedClaims: 0,
      totalExpectedClaims: 1,
      score: 0,
    },
  ];

  const rendered = renderEvaluationTextReport(scorecards);

  assert.equal(hasEvaluationMismatch(scorecards[0]), false);
  assert.equal(hasEvaluationMismatch(scorecards[1]), true);
  assert.match(rendered, /Quorum Evaluation Report/);
  assert.match(rendered, /Fixtures: 2/);
  assert.match(rendered, /Fixtures with mismatches: 1/);
});
