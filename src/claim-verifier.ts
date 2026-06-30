import { extractClaims } from "./claim-extractor.js";
import type {
  ClaimAssessment,
  ClaimVerdict,
  EvidenceSnippet,
  SourceDocument,
  SourceTrustLevel,
  VerificationReport,
} from "./domain.js";
import {
  normalizeForContainment,
  overlapScore,
  splitIntoSentences,
} from "./text.js";

interface CandidateEvidence extends EvidenceSnippet {
  numberUnits: string[];
}

const UNIT_WORDS = [
  "day",
  "days",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
  "percent",
  "percentage",
  "hour",
  "hours",
];

export function verifyAnswer(
  answer: string,
  sources: SourceDocument[],
  generatedAt = new Date().toISOString(),
  answerPath?: string,
): VerificationReport {
  const assessments = extractClaims(answer).map((claim) =>
    assessClaim(claim.id, claim.text, sources),
  );

  return {
    generatedAt,
    answerPath,
    answer,
    sources: sources.map(({ id, title, updatedAt, trustLevel }) => ({
      id,
      title,
      updatedAt,
      trustLevel,
    })),
    assessments,
    summary: summarize(assessments),
  };
}

function assessClaim(
  claimId: string,
  claimText: string,
  sources: SourceDocument[],
): ClaimAssessment {
  const candidate = findBestEvidence(claimText, sources);

  if (!candidate || candidate.score < 0.35) {
    return {
      claim: { id: claimId, text: claimText },
      verdict: "unsupported",
      evidence: [],
      reason: "No approved source contains enough overlapping policy language.",
    };
  }

  const claimNumbers = extractNumberUnits(claimText);
  const hasComparableNumbers =
    claimNumbers.length > 0 && candidate.numberUnits.length > 0;

  if (
    hasComparableNumbers &&
    !sameNumberUnitSet(claimNumbers, candidate.numberUnits) &&
    candidate.score >= 0.55
  ) {
    return {
      claim: { id: claimId, text: claimText },
      verdict: "contradicted",
      evidence: [stripInternalFields(candidate)],
      reason: "A closely matching approved source uses different numeric terms.",
    };
  }

  if (isContainedClaim(claimText, candidate.quote) || candidate.score >= 0.72) {
    return {
      claim: { id: claimId, text: claimText },
      verdict: "verified",
      evidence: [stripInternalFields(candidate)],
      reason: "The claim is strongly supported by an approved source.",
    };
  }

  return {
    claim: { id: claimId, text: claimText },
    verdict: "needs_review",
    evidence: [stripInternalFields(candidate)],
    reason: "An approved source appears related, but support is not strong enough.",
  };
}

function findBestEvidence(
  claimText: string,
  sources: SourceDocument[],
): CandidateEvidence | undefined {
  const candidates = sources.flatMap((source) =>
    splitIntoSentences(source.content).map((sentence) => ({
      documentId: source.id,
      documentTitle: source.title,
      documentTrustLevel: source.trustLevel,
      documentUpdatedAt: source.updatedAt,
      quote: sentence,
      score: overlapScore(claimText, sentence),
      numberUnits: extractNumberUnits(sentence),
    })),
  );

  return candidates.sort(compareEvidenceCandidates)[0];
}

function extractNumberUnits(text: string): string[] {
  const matches = text.toLowerCase().matchAll(/\b(\d+(?:\.\d+)?)\s*([a-z%]+)?/g);
  const values: string[] = [];

  for (const match of matches) {
    const value = match[1];
    const unit = match[2] ?? "";
    const normalizedUnit = unit === "%" ? "percent" : unit;

    if (!unit || UNIT_WORDS.includes(normalizedUnit)) {
      values.push(`${value}:${normalizedUnit || "number"}`);
    }
  }

  return values;
}

function sameNumberUnitSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const value of leftSet) {
    if (!rightSet.has(value)) {
      return false;
    }
  }

  return true;
}

function isContainedClaim(claimText: string, evidenceText: string): boolean {
  const claim = normalizeForContainment(claimText);
  const evidence = normalizeForContainment(evidenceText);
  return evidence.includes(claim) || claim.includes(evidence);
}

function compareEvidenceCandidates(left: CandidateEvidence, right: CandidateEvidence): number {
  const scoreDelta = right.score - left.score;

  if (Math.abs(scoreDelta) > 0.05) {
    return scoreDelta;
  }

  const trustDelta =
    trustLevelRank(right.documentTrustLevel) - trustLevelRank(left.documentTrustLevel);

  if (trustDelta !== 0) {
    return trustDelta;
  }

  return scoreDelta;
}

function trustLevelRank(trustLevel: SourceTrustLevel): number {
  switch (trustLevel) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

function summarize(assessments: ClaimAssessment[]): Record<ClaimVerdict, number> {
  const summary: Record<ClaimVerdict, number> = {
    verified: 0,
    unsupported: 0,
    contradicted: 0,
    needs_review: 0,
  };

  for (const assessment of assessments) {
    summary[assessment.verdict] += 1;
  }

  return summary;
}

function stripInternalFields(candidate: CandidateEvidence): EvidenceSnippet {
  return {
    documentId: candidate.documentId,
    documentTitle: candidate.documentTitle,
    documentTrustLevel: candidate.documentTrustLevel,
    documentUpdatedAt: candidate.documentUpdatedAt,
    quote: candidate.quote,
    score: Number(candidate.score.toFixed(3)),
  };
}
