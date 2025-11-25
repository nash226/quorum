import type { ClaimVerdict, VerificationReport } from "./domain.js";

export const CLAIM_VERDICTS: ClaimVerdict[] = [
  "verified",
  "unsupported",
  "contradicted",
  "needs_review",
];

export function parseClaimVerdict(value: string): ClaimVerdict {
  if (CLAIM_VERDICTS.includes(value as ClaimVerdict)) {
    return value as ClaimVerdict;
  }

  throw new Error(
    `Unsupported verdict "${value}". Expected one of: ${CLAIM_VERDICTS.join(", ")}`,
  );
}

export function shouldFailReport(
  report: FailPolicyReport,
  failOn: ClaimVerdict[],
): boolean {
  return matchingFailVerdicts(report, failOn).length > 0;
}

export function matchingFailVerdicts(
  report: FailPolicyReport,
  failOn: ClaimVerdict[],
): ClaimVerdict[] {
  const matchedVerdicts: ClaimVerdict[] = [];

  for (const verdict of failOn) {
    if (matchedVerdicts.includes(verdict)) {
      continue;
    }

    if (verdict === "needs_review" && hasImplicitNeedsReview(report)) {
      matchedVerdicts.push(verdict);
      continue;
    }

    if (report.summary[verdict] > 0) {
      matchedVerdicts.push(verdict);
    }
  }

  return matchedVerdicts;
}

export type FailPolicyReport = Pick<VerificationReport, "summary"> & {
  assessments?: unknown[];
  claims?: unknown[];
  answerGroups?: Array<{ claims?: unknown[] }>;
};

function hasImplicitNeedsReview(report: FailPolicyReport): boolean {
  if (report.summary.needs_review > 0) {
    return false;
  }

  if ("assessments" in report && Array.isArray(report.assessments)) {
    return report.assessments.length === 0;
  }

  if ("claims" in report && Array.isArray(report.claims)) {
    return report.claims.length === 0;
  }

  if ("answerGroups" in report && Array.isArray(report.answerGroups)) {
    return report.answerGroups.some(
      (group) => Array.isArray(group.claims) && group.claims.length === 0,
    );
  }

  return false;
}
