export { verifyAnswer } from "./claim-verifier.js";
export type {
  AtomicClaim,
  BatchVerificationReport,
  BatchVerificationResult,
  ClaimAssessment,
  ClaimVerdict,
  EvidenceSnippet,
  SourceDocument,
  SourceTrustLevel,
  VerificationReport,
} from "./domain.js";
export {
  importReviewerDecisions,
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportReport,
  renderReviewerDecisionImportSummaryCsv,
} from "./reviewer-decision-import.js";
export type {
  ImportedReviewerDecision,
  ReviewerDecisionGroup,
  ReviewerDecisionImportReport,
} from "./reviewer-decision-import.js";
export {
  renderBatchHtmlReport,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
} from "./report-renderer.js";
export {
  importReviewerDecisionFile,
  loadSourceDocuments as loadSources,
  resolveAnswerPaths,
  resolveSourcePaths,
  STDIN_ANSWER_PATH,
  verifyAnswerFile,
  verifyBatchAnswers as verifyAnswerBatch,
} from "./workflow.js";
export type { BatchVerificationOptions, SourceLoadOptions } from "./workflow.js";
export { parseSource, parseSourceTrustLevel, sourceDocumentFromFile } from "./source-loader.js";
