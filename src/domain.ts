export type ClaimVerdict =
  | "verified"
  | "unsupported"
  | "contradicted"
  | "needs_review";

export type SourceTrustLevel = "high" | "medium" | "low";

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  updatedAt?: string;
  trustLevel: SourceTrustLevel;
}

export interface AtomicClaim {
  id: string;
  text: string;
}

export interface EvidenceSnippet {
  documentId: string;
  documentTitle: string;
  documentTrustLevel: SourceTrustLevel;
  quote: string;
  score: number;
}

export interface ClaimAssessment {
  claim: AtomicClaim;
  verdict: ClaimVerdict;
  evidence: EvidenceSnippet[];
  reason: string;
}

export interface VerificationReport {
  generatedAt: string;
  answer: string;
  sources: Array<Pick<SourceDocument, "id" | "title" | "updatedAt" | "trustLevel">>;
  assessments: ClaimAssessment[];
  summary: Record<ClaimVerdict, number>;
}
