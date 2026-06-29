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
  report: Pick<VerificationReport, "summary">,
  failOn: ClaimVerdict[],
): boolean {
  return failOn.some((verdict) => report.summary[verdict] > 0);
}

export function matchingFailVerdicts(
  report: Pick<VerificationReport, "summary">,
  failOn: ClaimVerdict[],
): ClaimVerdict[] {
  return failOn.filter((verdict) => report.summary[verdict] > 0);
}
