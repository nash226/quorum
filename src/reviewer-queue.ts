import type { ClaimVerdict } from "./domain.js";
import type { ReviewerQueueStatus } from "./reviewer-decision-import.js";

export interface ReviewerQueueOverview {
  generatedAt: string;
  queueStatus: ReviewerQueueStatus | null;
  domains: string[];
  review: {
    totalAnswers: number;
    pendingAnswers: number;
    reviewedAnswers: number;
    noClaimsAnswers: number;
    totalClaims: number;
    pendingClaims: number;
    reviewedClaims: number;
    verdicts: Record<ClaimVerdict, number>;
  };
  evaluation: {
    fixtureCount: number;
    mismatchCount: number;
    mismatchRate: number | null;
    score: number | null;
    scoreLabel: string;
    scoreThresholdPassed: boolean;
  } | null;
}

/** Render the queue overview as stable, machine-readable JSON. */
export function renderReviewerQueueJson(overview: ReviewerQueueOverview): string {
  return `${JSON.stringify(overview, null, 2)}\n`;
}

/** Render the queue overview used by CLI and workflow integrations. */
export function renderReviewerQueueCsv(overview: ReviewerQueueOverview): string {
  const values = [
    overview.generatedAt,
    overview.queueStatus ?? "",
    overview.domains.join(";"),
    overview.review.totalAnswers,
    overview.review.pendingAnswers,
    overview.review.reviewedAnswers,
    overview.review.noClaimsAnswers,
    overview.review.totalClaims,
    overview.review.pendingClaims,
    overview.review.reviewedClaims,
    overview.review.verdicts.verified,
    overview.review.verdicts.contradicted,
    overview.review.verdicts.unsupported,
    overview.review.verdicts.needs_review,
    overview.evaluation?.fixtureCount ?? "",
    overview.evaluation?.mismatchCount ?? "",
    overview.evaluation?.mismatchRate ?? "",
    overview.evaluation?.score ?? "",
    overview.evaluation?.scoreLabel ?? "",
    overview.evaluation?.scoreThresholdPassed ?? "",
  ];
  const escape = (value: string | number | boolean) => `"${String(value).replaceAll('"', '""')}"`;
  return `${[
    ["generated_at", "queue_status", "domains", "total_answers", "pending_answers", "reviewed_answers", "no_claims_answers", "total_claims", "pending_claims", "reviewed_claims", "verified", "contradicted", "unsupported", "needs_review", "fixture_count", "mismatch_count", "mismatch_rate", "score", "score_label", "score_threshold_passed"],
    values,
  ].map((row) => row.map(escape).join(",")).join("\n")}\n`;
}
