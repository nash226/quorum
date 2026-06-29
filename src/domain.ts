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
  answerPath?: string;
  answer: string;
  sources: Array<Pick<SourceDocument, "id" | "title" | "updatedAt" | "trustLevel">>;
  assessments: ClaimAssessment[];
  summary: Record<ClaimVerdict, number>;
}

export interface BatchVerificationResult {
  answerPath: string;
  report: VerificationReport;
  shouldFail: boolean;
  failVerdicts: ClaimVerdict[];
}

export interface BatchVerificationReport {
  generatedAt: string;
  sourceCount: number;
  answerCount: number;
  answers: BatchVerificationResult[];
  summary: {
    verified: number;
    contradicted: number;
    unsupported: number;
    needs_review: number;
    answersWithFailures: number;
  };
}
