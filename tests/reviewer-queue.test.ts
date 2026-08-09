import assert from "node:assert/strict";
import test from "node:test";
import { renderReviewerQueueCsv, type ReviewerQueueOverview } from "../src/index.js";

test("renders a reviewer queue overview for programmatic integrations", () => {
  const overview: ReviewerQueueOverview = {
    generatedAt: "2026-08-03T12:00:00.000Z",
    queueStatus: "pending",
    domains: ["hr", "support"],
    review: {
      totalAnswers: 3, pendingAnswers: 1, reviewedAnswers: 1, noClaimsAnswers: 1,
      totalClaims: 2, pendingClaims: 1, reviewedClaims: 1,
      verdicts: { verified: 1, contradicted: 0, unsupported: 1, needs_review: 0 },
    },
    evaluation: {
      fixtureCount: 4, mismatchCount: 1, mismatchRate: 0.25, score: 0.75,
      scoreLabel: "75%", scoreThresholdPassed: false,
    },
  };

  assert.match(renderReviewerQueueCsv(overview), /^"schema_version","generated_at","queue_status","domains"/);
  assert.match(renderReviewerQueueCsv(overview), /"1","2026-08-03T12:00:00\.000Z","pending","hr;support","3","1"/);
  assert.match(renderReviewerQueueCsv(overview), /"4","1","0\.25","0\.75","75%","false"/);
});
