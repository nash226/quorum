import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  evaluateFixtureContent,
  evaluateFixture,
  evaluateFixtureFiles,
  evaluateFixtureFile,
  hasEvaluationMismatch,
  loadEvaluationFixture,
  loadEvaluationFixtureFromContent,
  renderEvaluationAggregateSummaryCsv,
  renderEvaluationDomainSummaryCsv,
  renderEvaluationHtmlReport,
  renderEvaluationMarkdownReport,
  renderEvaluationScorecard,
  renderEvaluationSummaryCsv,
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
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Employees receive 18 weeks of paid parental leave. Full-time employees receive 20 days of paid vacation each calendar...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
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
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support-policy.json"),
    generatedAt: "2026-07-05T10:05:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support policy example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Annual plan customers can request a refund within 30 days of purchase. Enterprise support requests receive a first re...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("evaluates a support fixture that routes a partial match to review", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/escalation-policy.json"),
    generatedAt: "2026-07-14T04:30:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support escalation ambiguity example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support escalation reviewer packet");
  assert.equal(scorecard.answerPreview, "Support tickets receive a first response after escalation.");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 1,
  });
  assert.deepEqual(scorecard.claims.map((claim) => claim.actualVerdict), ["needs_review"]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.score, 1);
});

test("evaluates nested shipped fixture files for additional domain coverage", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/onboarding-policy.json"),
    generatedAt: "2026-07-05T10:05:30.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR onboarding policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR onboarding reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Healthcare coverage begins after 30 days of employment. Remote employees may request ergonomic equipment reimbursemen...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("evaluates shipped HTML fixture files for exported help-center style coverage", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/support/html-billing-policy.json"),
    generatedAt: "2026-07-09T16:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support billing HTML example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support billing reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Support Billing Draft Customers can request billing credits for duplicate charges within 7 days. Annual plan refunds...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["verified", "contradicted", "unsupported"],
  );
});

test("evaluates a shipped fixture that discovers approved sources from a directory", async () => {
  const fixturePath = resolve("examples/evaluations/support/source-directory-policy.json");
  const scorecard = await evaluateFixtureFile({
    fixturePath,
    generatedAt: "2026-07-12T17:00:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "Support source directory example");
  assert.equal(scorecard.domain, "support");
  assert.equal(scorecard.answerLabel, "Support source directory reviewer packet");
  assert.deepEqual(scorecard.sourceDirs, [resolve("examples/sources")]);
  assert.deepEqual(scorecard.sourcePaths, [
    resolve("examples/sources/hr-policy.md"),
    resolve("examples/sources/hr-policy.pdf"),
    resolve("examples/sources/support-billing-policy.html"),
    resolve("examples/sources/support-playbook.md"),
  ]);
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
});

test("evaluates shipped PDF fixture files for document-export coverage", async () => {
  const scorecard = await evaluateFixtureFile({
    fixturePath: resolve("examples/evaluations/hr/pdf-policy.json"),
    generatedAt: "2026-07-09T22:45:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR PDF policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.answerLabel, "HR PDF reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Employees receive 18 weeks of paid parental leave. Full-time employees receive 20 days of paid vacation each calendar...",
  );
  assert.deepEqual(scorecard.sourceDirs, []);
  assert.deepEqual(scorecard.sourcePaths, [resolve("examples/sources/hr-policy.pdf")]);
  assert.equal(scorecard.report.sources[0]?.title, "HR Benefits Policy PDF");
  assert.equal(scorecard.report.sources[0]?.updatedAt, "2026-06-15T09:30:00-04:00");
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.matchedClaims, 3);
  assert.equal(scorecard.totalExpectedClaims, 3);
  assert.equal(scorecard.score, 1);
  assert.deepEqual(
    scorecard.claims.map((claim) => claim.actualVerdict),
    ["contradicted", "verified", "unsupported"],
  );
});

test("evaluates one in-memory fixture file relative to its fixture path", async () => {
  const fixturePath = resolve("examples/evaluations/hr-policy.json");
  const fixtureContent = await loadEvaluationFixture(fixturePath);
  const scorecard = await evaluateFixtureContent({
    fixturePath,
    content: JSON.stringify(fixtureContent),
    generatedAt: "2026-07-05T10:06:00.000Z",
  });

  assert.equal(scorecard.fixtureName, "HR policy example");
  assert.equal(scorecard.domain, "hr");
  assert.equal(scorecard.fixturePath, fixturePath);
  assert.equal(scorecard.answerLabel, "HR reviewer packet");
  assert.equal(
    scorecard.answerPreview,
    "Employees receive 18 weeks of paid parental leave. Full-time employees receive 20 days of paid vacation each calendar...",
  );
  assert.equal(scorecard.summaryMatches, true);
  assert.equal(scorecard.report.generatedAt, "2026-07-05T10:06:00.000Z");
});

test("resolves fixture paths from nested directories in stable order", async () => {
  const fixturePaths = await resolveEvaluationFixturePaths(
    [resolve("examples/evaluations/hr-policy.json")],
    [resolve("examples/evaluations")],
  );

  assert.deepEqual(fixturePaths, [
    resolve("examples/evaluations/hr-policy.json"),
    resolve("examples/evaluations/empty-answer.json"),
    resolve("examples/evaluations/hr/onboarding-policy.json"),
    resolve("examples/evaluations/hr/pdf-policy.json"),
    resolve("examples/evaluations/support-policy.json"),
    resolve("examples/evaluations/support/account-security-policy.json"),
    resolve("examples/evaluations/support/escalation-policy.json"),
    resolve("examples/evaluations/support/html-billing-policy.json"),
    resolve("examples/evaluations/support/source-directory-policy.json"),
  ]);
});

test("scores an empty-answer fixture as a matching zero-claim scorecard", async () => {
  const scorecard = await evaluateFixtureFile(
    resolve("examples/evaluations/empty-answer.json"),
    { generatedAt: "2026-07-12T03:00:00.000Z" },
  );

  assert.equal(scorecard.fixtureName, "Empty answer example");
  assert.equal(scorecard.answerLabel, "Support empty draft");
  assert.deepEqual(scorecard.actualSummary, {
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  });
  assert.equal(scorecard.summaryMatches, true);
  assert.deepEqual(scorecard.claims, []);
  assert.equal(scorecard.matchedClaims, 0);
  assert.equal(scorecard.totalExpectedClaims, 0);
  assert.equal(scorecard.score, 1);
});

test("evaluates fixture files from explicit paths and fixture directories", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixturePaths: [resolve("examples/evaluations/hr-policy.json")],
    fixtureDirPaths: [resolve("examples/evaluations")],
    generatedAt: "2026-07-05T10:07:00.000Z",
  });

  assert.equal(scorecards.length, 9);
  assert.deepEqual(
    scorecards.map((scorecard) => scorecard.fixtureName),
    [
      "HR policy example",
      "Empty answer example",
      "HR onboarding policy example",
      "HR PDF policy example",
      "Support policy example",
      "Support account policy example",
      "Support escalation ambiguity example",
      "Support billing HTML example",
      "Support source directory example",
    ],
  );
  assert.ok(
    scorecards.every(
      (scorecard) => scorecard.report.generatedAt === "2026-07-05T10:07:00.000Z",
    ),
  );
});

test("filters evaluation fixture files by domain", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixtureDirPaths: [resolve("examples/evaluations")],
    fixturePaths: [],
    domains: ["hr"],
    generatedAt: "2026-07-09T20:20:00.000Z",
  });

  assert.equal(scorecards.length, 3);
  assert.deepEqual(
    scorecards.map((scorecard) => scorecard.fixtureName),
    ["HR policy example", "HR onboarding policy example", "HR PDF policy example"],
  );
  assert.ok(scorecards.every((scorecard) => scorecard.domain === "hr"));
});

test("reports when domain filters match no evaluation fixtures", async () => {
  await assert.rejects(
    evaluateFixtureFiles({
      fixtureDirPaths: [resolve("examples/evaluations")],
      fixturePaths: [],
      domains: ["finance"],
    }),
    /No evaluation fixtures matched domain filter: finance/,
  );
});

test("evaluates fixture sources discovered from source directories", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-eval-source-dirs-"));

  try {
    const answersDir = join(tempDir, "answers");
    const sourcesDir = join(tempDir, "sources");
    const fixtureDir = join(tempDir, "fixtures");
    const answerPath = join(answersDir, "support-answer.md");
    const sourcePath = join(sourcesDir, "support-playbook.md");
    const fixturePath = join(fixtureDir, "support-policy.json");

    await Promise.all([
      mkdir(answersDir, { recursive: true }),
      mkdir(sourcesDir, { recursive: true }),
      mkdir(fixtureDir, { recursive: true }),
    ]);

    await Promise.all([
      writeFile(
        answerPath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        sourcePath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        fixturePath,
        JSON.stringify(
          {
            name: "Support policy from source directory",
            answerPath: "../answers/support-answer.md",
            answerLabel: "Support escalation fixture",
            sourceDirs: ["../sources"],
            expectedSummary: {
              verified: 1,
              contradicted: 0,
              unsupported: 0,
              needs_review: 0,
            },
            expectedClaimVerdicts: ["verified"],
          },
          null,
          2,
        ),
        "utf8",
      ),
    ]);

    const scorecard = await evaluateFixtureFile(fixturePath, {
      generatedAt: "2026-07-06T14:00:00.000Z",
    });

    assert.equal(scorecard.fixtureName, "Support policy from source directory");
    assert.equal(scorecard.answerLabel, "Support escalation fixture");
    assert.deepEqual(scorecard.sourceDirs, [sourcesDir]);
    assert.deepEqual(scorecard.sourcePaths, [sourcePath]);
    assert.equal(scorecard.summaryMatches, true);
    assert.equal(scorecard.matchedClaims, 1);
    assert.equal(scorecard.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("evaluates inline fixture answers and sources without reading answer files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-eval-inline-"));
  const fixturePath = join(tempDir, "fixtures", "hr-inline.json");

  try {
    await mkdir(join(tempDir, "fixtures"), { recursive: true });

    const scorecard = await evaluateFixture(
      {
        name: "Inline HR fixture",
        answerPath: "../answers/hr-inline.md",
        answer: "Employees receive 12 weeks of paid parental leave.\n",
        answerLabel: "HR API reviewer packet",
        sources: [
          {
            sourcePath: "../sources/hr-policy.md",
            id: "people-ops/hr-policy@2026-07-08",
            title: "HR Policy",
            trustLevel: "high",
            content: "Employees receive 12 weeks of paid parental leave.\n",
          },
        ],
        expectedSummary: {
          verified: 1,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
        expectedClaimVerdicts: ["verified"],
      },
      {
        baseDir: join(tempDir, "fixtures"),
        fixturePath,
        generatedAt: "2026-07-08T04:00:00.000Z",
      },
    );

    assert.equal(scorecard.fixturePath, fixturePath);
    assert.equal(scorecard.answerPath, join(tempDir, "answers", "hr-inline.md"));
    assert.equal(scorecard.answerLabel, "HR API reviewer packet");
    assert.deepEqual(scorecard.sourcePaths, [join(tempDir, "sources", "hr-policy.md")]);
    assert.equal(scorecard.report.sources[0]?.id, "people-ops/hr-policy@2026-07-08");
    assert.equal(
      scorecard.report.assessments[0]?.evidence[0]?.documentId,
      "people-ops/hr-policy@2026-07-08",
    );
    assert.equal(scorecard.report.sources[0]?.title, "HR Policy");
    assert.equal(scorecard.summaryMatches, true);
    assert.equal(scorecard.matchedClaims, 1);
    assert.equal(scorecard.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects invalid evaluation fixture content with a clear validation error", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Broken fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: "nope",
          },
        }),
      ),
    /Evaluation fixture\.expectedSummary\.needs_review must be a non-negative integer\./,
  );
});

test("rejects evaluation fixtures when claim verdict expectations do not match summary totals", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Broken fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 2,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        }),
      ),
    /Evaluation fixture\.expectedClaimVerdicts must include 2 entries to match the totals in Evaluation fixture\.expectedSummary\./,
  );
});

test("rejects evaluation fixtures when claim verdict counts disagree with summary totals", () => {
  assert.throws(
    () =>
      loadEvaluationFixtureFromContent(
        JSON.stringify({
          name: "Contradictory fixture",
          answerPath: "answers/hr.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 1,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified", "verified"],
        }),
      ),
    /Evaluation fixture\.expectedClaimVerdicts counts must match the totals in Evaluation fixture\.expectedSummary\./,
  );
});

test("renders mismatch details in evaluation scorecards", () => {
  const rendered = renderEvaluationScorecard({
    fixtureName: "Mismatch fixture",
    domain: "hr",
    answerPath: "/tmp/answer.md",
    answerLabel: "HR escalation packet",
    answerPreview: "Benefits begin on day one.",
    sourceDirs: ["/tmp/source-bundle"],
    sourcePaths: ["/tmp/source.md"],
    report: {
      generatedAt: "2026-07-05T10:10:00.000Z",
      answerPath: "/tmp/answer.md",
      answerLabel: "answer",
      answerPreview: "Preview",
      answer: "Answer text",
      sources: [
        {
          id: "people-ops/hr-policy@2026-07-08",
          sourcePath: "/tmp/sources/hr-policy.md",
          title: "HR Policy",
          trustLevel: "high" as const,
        },
      ],
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
  assert.match(rendered, /Domain: hr/);
  assert.match(rendered, /Answer label: HR escalation packet/);
  assert.match(rendered, /Answer preview: Benefits begin on day one\./);
  assert.match(rendered, /Source directories: \/tmp\/source-bundle/);
  assert.match(rendered, /Source IDs: people-ops\/hr-policy@2026-07-08/);
  assert.match(rendered, /Claim mismatches:/);
  assert.match(rendered, /expected verified, got contradicted/);
});

test("renders evaluation text report totals and mismatch detection", () => {
  const scorecards = [
    {
      fixtureName: "Match fixture",
      domain: "support",
      answerPath: "/tmp/answer-1.md",
      answerLabel: "answer-1",
      answerPreview: "Preview 1",
      sourceDirs: [],
      sourcePaths: ["/tmp/source-1.md"],
      report: {
        generatedAt: "2026-07-05T10:15:00.000Z",
        answerPath: "/tmp/answer-1.md",
        answerLabel: "answer-1",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [
          {
            id: "support/refunds@2026-07-08",
            sourcePath: "/tmp/sources/support.md",
            title: "Support Policy",
            trustLevel: "high" as const,
          },
        ],
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
      domain: "hr",
      answerPath: "/tmp/answer-2.md",
      answerLabel: "answer-2",
      answerPreview: "Preview 2",
      sourceDirs: [],
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
  assert.match(rendered, /Generated at: 2026-07-05T10:15:00.000Z/);
  assert.match(rendered, /Generated at: 2026-07-05T10:16:00.000Z/);
  assert.match(rendered, /Fixtures: 2/);
  assert.match(rendered, /Fixtures with mismatches: 1/);
  assert.match(rendered, /Matched claim verdicts: 0\/1/);
  assert.match(rendered, /Overall claim verdict score: 0%/);
  assert.match(rendered, /Domain rollups:/);
  assert.match(rendered, /- hr: 1 fixture, 1 mismatch, 0\/1 matched \(0%\)/);
  assert.match(rendered, /- support: 1 fixture, 0 mismatches, 0\/0 matched \(n\/a\)/);
});

test("renders evaluation summary csv rows for each fixture", () => {
  const rendered = renderEvaluationSummaryCsv([
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: ["/tmp/sources"],
      sourcePaths: ["/tmp/sources/support.md", "/tmp/sources/refunds.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
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
  ]);

  assert.match(
    rendered,
    /^generated_at,fixture_name,domain,fixture_path,answer_path,answer_label,answer_preview,source_dirs,source_paths,source_ids,summary_match,matched_claims,total_expected_claims,score,has_mismatch,mismatch_type,first_mismatch_claim_index,first_mismatch_claim_text,first_mismatch_expected_verdict,first_mismatch_actual_verdict,first_mismatch_evidence_title,first_mismatch_evidence_trust_level,first_mismatch_evidence_updated_at,first_mismatch_evidence_source_path,first_mismatch_evidence_source_id,first_mismatch_evidence_score,first_mismatch_evidence_quote,/,
  );
  assert.match(rendered, /Support policy example/);
  assert.match(rendered, /Support policy example,support,\/tmp\/fixtures\/support\.json/);
  assert.match(rendered, /2026-07-05T10:20:00.000Z,Support policy example,support,\/tmp\/fixtures\/support\.json,\/tmp\/answers\/support\.md,Support reviewer packet,Support answer preview,\/tmp\/sources,\/tmp\/sources\/support\.md \| \/tmp\/sources\/refunds\.md,,yes,0,0,1\.000,no,none,,,,,,,,,,,,1,0,0,0,1,0,0,0/);
});

test("evaluation summary csv includes first mismatched claim details", () => {
  const rendered = renderEvaluationSummaryCsv([
    {
      fixtureName: "HR mismatch example",
      fixturePath: "/tmp/fixtures/hr.json",
      answerPath: "/tmp/answers/hr.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "HR answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/hr.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/hr.md",
        answerLabel: "hr",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [],
        assessments: [
          {
            claim: {
              id: "claim_1",
              text: "Employees receive 18 weeks of paid parental leave.",
            },
            verdict: "contradicted",
            reason: "The approved policy states a different amount of leave.",
            evidence: [
              {
                documentId: "source_1",
                documentPath: "/tmp/sources/hr-policy.md",
                documentTitle: "HR Policy",
                documentTrustLevel: "high",
                documentUpdatedAt: "2026-06-01",
                quote: "Employees receive 12 weeks of paid parental leave.",
                score: 0.857,
              },
            ],
          },
        ],
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
          claimText: "Employees receive 18 weeks of paid parental leave.",
          actualVerdict: "contradicted",
          expectedVerdict: "verified",
          matches: false,
        },
      ],
      matchedClaims: 0,
      totalExpectedClaims: 1,
      score: 0,
    },
  ]);

  assert.match(
    rendered,
    /HR mismatch example,,[^,\n]+,[^,\n]+,HR reviewer packet,HR answer preview,,[^,\n]+,,no,0,1,0\.000,yes,claim_verdict,1,Employees receive 18 weeks of paid parental leave\.,verified,contradicted,HR Policy,high,2026-06-01,\/tmp\/sources\/hr-policy\.md,source_1,0\.857,Employees receive 12 weeks of paid parental leave\.,1,0,0,0,0,1,0,0/,
  );
});

test("renders evaluation domain summary csv rows for each domain", () => {
  const rendered = renderEvaluationDomainSummaryCsv([
    {
      fixtureName: "HR policy example",
      domain: "hr",
      fixturePath: "/tmp/fixtures/hr.json",
      answerPath: "/tmp/answers/hr.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "HR answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/hr.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/hr.md",
        answerLabel: "hr",
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
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
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
  ]);

  assert.equal(
    rendered,
    [
      "generated_at,domain,fixture_count,mismatch_count,matched_claims,total_expected_claims,score,score_label,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review",
      "2026-07-05T10:20:00.000Z,hr,1,0,1,1,1.000,100%,1,0,0,0,1,0,0,0",
      "2026-07-05T10:20:00.000Z,support,1,1,0,1,0.000,0%,1,0,0,0,0,1,0,0",
      "",
    ].join("\n"),
  );
});

test("renders evaluation aggregate summary csv for the full benchmark run", () => {
  const rendered = renderEvaluationAggregateSummaryCsv([
    {
      fixtureName: "HR policy example",
      domain: "hr",
      fixturePath: "/tmp/fixtures/hr.json",
      answerPath: "/tmp/answers/hr.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "HR answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/hr.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/hr.md",
        answerLabel: "hr",
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
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: [],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:20:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
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
  ]);

  assert.equal(
    rendered,
    [
      "generated_at,fixture_count,mismatch_count,matched_claims,total_expected_claims,score,score_label,domains,domain_fixture_counts,domain_mismatch_counts,domain_scores,domain_score_labels,expected_verified,expected_contradicted,expected_unsupported,expected_needs_review,actual_verified,actual_contradicted,actual_unsupported,actual_needs_review",
      "2026-07-05T10:20:00.000Z,2,1,1,2,0.500,50%,hr | support,1 | 1,0 | 1,1.000 | 0.000,100% | 0%,2,0,0,0,1,1,0,0",
      "",
    ].join("\n"),
  );
});

test("renders evaluation markdown report with fixture summaries", () => {
  const rendered = renderEvaluationMarkdownReport([
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: ["/tmp/source-bundle"],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:25:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [
          {
            id: "support/refunds@2026-07-08",
            sourcePath: "/tmp/sources/support.md",
            title: "Support Policy",
            trustLevel: "high" as const,
          },
        ],
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
      claims: [
        {
          index: 0,
          claimText: "Refunds are available for 30 days.",
          actualVerdict: "verified",
          expectedVerdict: "verified",
          matches: true,
        },
      ],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
  ]);

  assert.match(rendered, /^# Quorum Evaluation Report/);
  assert.match(rendered, /## Summary/);
  assert.match(rendered, /- Generated at: 2026-07-05T10:25:00.000Z/);
  assert.match(rendered, /- Matched claim verdicts: 1\/1/);
  assert.match(rendered, /- Overall claim verdict score: 100%/);
  assert.match(rendered, /### Domain Rollups/);
  assert.match(rendered, /- `support`: 1 fixture, 0 mismatches, 1\/1 matched \(100%\)/);
  assert.match(rendered, /### 1\. Support policy example/);
  assert.match(rendered, /- Fixture path: `\/tmp\/fixtures\/support\.json`/);
  assert.match(rendered, /- Answer label: `Support reviewer packet`/);
  assert.match(rendered, /- Answer preview: Support answer preview/);
  assert.match(rendered, /- Source directories: `\/tmp\/source-bundle`/);
  assert.match(rendered, /- Source IDs: `support\/refunds@2026-07-08`/);
  assert.match(rendered, /#### Claim Verdicts/);
  assert.match(rendered, /Claim 1: `verified` \(expected `verified`\)/);
});

test("renders evaluation html report with fixture summaries", () => {
  const rendered = renderEvaluationHtmlReport([
    {
      fixtureName: "Support policy example",
      domain: "support",
      fixturePath: "/tmp/fixtures/support.json",
      answerPath: "/tmp/answers/support.md",
      answerLabel: "Support reviewer packet",
      answerPreview: "Support answer preview",
      sourceDirs: ["/tmp/source-bundle"],
      sourcePaths: ["/tmp/sources/support.md"],
      report: {
        generatedAt: "2026-07-05T10:30:00.000Z",
        answerPath: "/tmp/answers/support.md",
        answerLabel: "support",
        answerPreview: "Preview",
        answer: "Answer text",
        sources: [
          {
            id: "support/refunds@2026-07-08",
            sourcePath: "/tmp/sources/support.md",
            title: "Support Policy",
            trustLevel: "high" as const,
          },
        ],
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
      claims: [
        {
          index: 0,
          claimText: "Refunds are available for 30 days.",
          actualVerdict: "verified",
          expectedVerdict: "verified",
          matches: true,
        },
      ],
      matchedClaims: 1,
      totalExpectedClaims: 1,
      score: 1,
    },
  ]);

  assert.match(rendered, /<!doctype html>/i);
  assert.match(rendered, /<dt>Answer label<\/dt><dd>Support reviewer packet<\/dd>/);
  assert.match(rendered, /<dt>Answer preview<\/dt><dd>Support answer preview<\/dd>/);
  assert.match(rendered, /<dt>Source directories<\/dt><dd>\/tmp\/source-bundle<\/dd>/);
  assert.match(rendered, /<dt>Source IDs<\/dt><dd>support\/refunds@2026-07-08<\/dd>/);
  assert.match(rendered, /Fixture scorecard report/);
  assert.match(rendered, /<span>Matched Claim Verdicts<\/span>\s*<strong>1\/1<\/strong>/);
  assert.match(rendered, /<span>Overall Claim Verdict Score<\/span>\s*<strong>100%<\/strong>/);
  assert.match(rendered, /Generated at 2026-07-05T10:30:00.000Z/);
  assert.match(rendered, /Domain rollups/);
  assert.match(rendered, /1 fixture with 0 mismatches\./);
  assert.match(rendered, /Support policy example/);
  assert.match(rendered, /Expected summary/);
  assert.match(rendered, /Claim verdicts/);
});
