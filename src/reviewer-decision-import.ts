import { parseDelimitedList } from "./csv-list.js";
import type { ClaimVerdict } from "./domain.js";
import { matchingFailVerdicts, parseClaimVerdict } from "./report-policy.js";
import { stripByteOrderMark } from "./text.js";

const REQUIRED_HEADERS = [
  "claim_id",
  "claim_text",
  "model_verdict",
  "model_reason",
  "evidence_titles",
  "evidence_quotes",
  "reviewer_verdict",
  "reviewer_notes",
] as const;
const OPTIONAL_ANSWER_LABEL_HEADER = "answer_label";
const OPTIONAL_ANSWER_PATH_HEADER = "answer_path";
const OPTIONAL_ANSWER_PREVIEW_HEADER = "answer_preview";
const OPTIONAL_ANSWER_HAS_CLAIMS_HEADER = "answer_has_claims";
const OPTIONAL_EVIDENCE_TRUST_LEVELS_HEADER = "evidence_trust_levels";
const OPTIONAL_EVIDENCE_UPDATED_AT_HEADER = "evidence_updated_at";
const OPTIONAL_EVIDENCE_SCORES_HEADER = "evidence_scores";
const NO_CLAIMS_REVIEW_REASON = "No claims were extracted from this answer.";

type ReviewerDecisionHeader = (typeof REQUIRED_HEADERS)[number];

export interface ImportedReviewerDecision {
  answerLabel?: string;
  answerPath?: string;
  answerPreview?: string;
  claimId: string;
  claimText: string;
  modelVerdict: ClaimVerdict;
  modelReason: string;
  evidenceTitles: string[];
  evidenceTrustLevels: string[];
  evidenceUpdatedAt: string[];
  evidenceScores: string[];
  evidenceQuotes: string[];
  reviewerVerdict?: ClaimVerdict;
  reviewerNotes?: string;
  finalVerdict: ClaimVerdict;
  overridden: boolean;
}

export interface ReviewerDecisionImportReport {
  claims: ImportedReviewerDecision[];
  answerGroups: ReviewerDecisionGroup[];
  summary: {
    totalClaims: number;
    reviewedClaims: number;
    pendingClaims: number;
    overriddenClaims: number;
  } & Record<ClaimVerdict, number>;
}

export interface ReviewerDecisionGroup {
  answerLabel?: string;
  answerPath?: string;
  answerPreview?: string;
  label: string;
  claims: ImportedReviewerDecision[];
  emptyStateReason?: string;
  summary: ReviewerDecisionImportReport["summary"];
}

interface ImportedAnswerGroupSeed {
  answerLabel?: string;
  answerPath?: string;
  answerPreview?: string;
  emptyStateReason?: string;
}

export function importReviewerDecisions(
  csvContent: string,
): ReviewerDecisionImportReport {
  const rows = parseCsv(stripByteOrderMark(csvContent));

  if (rows.length === 0) {
    throw new Error("Reviewer decision CSV is empty.");
  }

  const headers = rows[0] ?? [];
  assertHeaders(headers);
  const columnIndex = createColumnIndex(headers);
  const claims: ImportedReviewerDecision[] = [];
  const answerGroupSeeds: ImportedAnswerGroupSeed[] = [];

  rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim().length > 0))
    .forEach((row, rowIndex) => {
      const importedRow = importDecisionRow(row, rowIndex + 2, columnIndex);

      if ("claimId" in importedRow) {
        claims.push(importedRow);
      } else {
        answerGroupSeeds.push(importedRow);
      }
    });

  const summary: ReviewerDecisionImportReport["summary"] = {
    totalClaims: claims.length,
    reviewedClaims: 0,
    pendingClaims: 0,
    overriddenClaims: 0,
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  };

  for (const claim of claims) {
    summary[claim.finalVerdict] += 1;

    if (claim.reviewerVerdict) {
      summary.reviewedClaims += 1;
    } else {
      summary.pendingClaims += 1;
    }

    if (claim.overridden) {
      summary.overriddenClaims += 1;
    }
  }

  return {
    claims,
    answerGroups: groupImportedClaims(claims, answerGroupSeeds),
    summary,
  };
}

export function renderReviewerDecisionImportReport(
  report: ReviewerDecisionImportReport,
  failOn: ClaimVerdict[] = [],
): string {
  const failVerdicts = matchingFailVerdicts(report, failOn);
  const lines = [
    "Quorum Reviewer Decision Import",
    "",
    `Claims: ${report.summary.totalClaims} total, ${report.summary.reviewedClaims} reviewed, ${report.summary.pendingClaims} pending`,
    `Final verdicts: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    `Overrides: ${report.summary.overriddenClaims}`,
    `Fail policy: ${failVerdicts.length > 0 ? `matched (${failVerdicts.join(", ")})` : "clear"}`,
  ];

  if (report.answerGroups.length > 0) {
    lines.push("", "Answer Groups", "");
  }

  for (const group of report.answerGroups) {
    const groupFailVerdicts = matchingFailVerdicts(group, failOn);
    lines.push(
      `Answer: ${group.label}`,
      ...(group.answerPath && group.answerPath !== group.label
        ? [`Answer file: ${group.answerPath}`]
        : []),
      ...(group.answerPreview ? [`Answer preview: ${group.answerPreview}`] : []),
      `Claims: ${group.summary.totalClaims} total, ${group.summary.reviewedClaims} reviewed, ${group.summary.pendingClaims} pending`,
      `Final verdicts: ${group.summary.verified} verified, ${group.summary.contradicted} contradicted, ${group.summary.unsupported} unsupported, ${group.summary.needs_review} needs review`,
      `Overrides: ${group.summary.overriddenClaims}`,
      `Fail policy: ${groupFailVerdicts.length > 0 ? `matched (${groupFailVerdicts.join(", ")})` : "clear"}`,
      "",
    );

    if (group.claims.length === 0) {
      lines.push(group.emptyStateReason ?? NO_CLAIMS_REVIEW_REASON, "");
      continue;
    }

    for (const claim of group.claims) {
      const reviewState = claim.reviewerVerdict
        ? `${claim.reviewerVerdict}${claim.overridden ? " (override)" : ""}`
        : "pending reviewer decision";

      lines.push(`${claim.finalVerdict.toUpperCase()}  ${claim.claimText}`);

      lines.push(`Model verdict: ${claim.modelVerdict}`, `Reviewer verdict: ${reviewState}`);

      if (claim.reviewerNotes) {
        lines.push(`Reviewer notes: ${claim.reviewerNotes}`);
      }

      const evidenceLines = renderImportedEvidenceLines(claim);
      if (evidenceLines.length > 0) {
        lines.push("Evidence:");
        lines.push(...evidenceLines.map((line) => `- ${line}`));
      }

      lines.push("");
    }
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderReviewerDecisionImportMarkdownReport(
  report: ReviewerDecisionImportReport,
  failOn: ClaimVerdict[] = [],
): string {
  const failVerdicts = matchingFailVerdicts(report, failOn);
  const lines = [
    "# Quorum Reviewer Decision Import",
    "",
    "## Summary",
    "",
    `- Total claims: ${report.summary.totalClaims}`,
    `- Reviewed claims: ${report.summary.reviewedClaims}`,
    `- Pending claims: ${report.summary.pendingClaims}`,
    `- Reviewer overrides: ${report.summary.overriddenClaims}`,
    `- Verified: ${report.summary.verified}`,
    `- Contradicted: ${report.summary.contradicted}`,
    `- Unsupported: ${report.summary.unsupported}`,
    `- Needs review: ${report.summary.needs_review}`,
    `- Fail policy: ${failVerdicts.length > 0 ? `matched (${failVerdicts.join(", ")})` : "clear"}`,
  ];

  if (report.answerGroups.length === 0) {
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "## Answer Groups", "");

  report.answerGroups.forEach((group) => {
    const groupFailVerdicts = matchingFailVerdicts(group, failOn);
    lines.push(
      `### ${group.label}`,
      "",
      ...(group.answerPath && group.answerPath !== group.label
        ? [`- Answer file: ${group.answerPath}`]
        : []),
      ...(group.answerPreview ? [`- Answer preview: ${group.answerPreview}`, ""] : []),
      `- Total claims: ${group.summary.totalClaims}`,
      `- Reviewed claims: ${group.summary.reviewedClaims}`,
      `- Pending claims: ${group.summary.pendingClaims}`,
      `- Reviewer overrides: ${group.summary.overriddenClaims}`,
      `- Verified: ${group.summary.verified}`,
      `- Contradicted: ${group.summary.contradicted}`,
      `- Unsupported: ${group.summary.unsupported}`,
      `- Needs review: ${group.summary.needs_review}`,
      `- Fail policy: ${groupFailVerdicts.length > 0 ? `matched (${groupFailVerdicts.join(", ")})` : "clear"}`,
      "",
    );

    if (group.claims.length === 0) {
      lines.push(group.emptyStateReason ?? NO_CLAIMS_REVIEW_REASON, "");
      return;
    }

    group.claims.forEach((claim, index) => {
      const reviewerVerdict = claim.reviewerVerdict
        ? `${claim.reviewerVerdict}${claim.overridden ? " (override)" : ""}`
        : "pending reviewer decision";

      lines.push(
        `#### ${index + 1}. ${claim.claimText}`,
        "",
        `- Final verdict: ${claim.finalVerdict}`,
        `- Model verdict: ${claim.modelVerdict}`,
        `- Reviewer verdict: ${reviewerVerdict}`,
      );

      if (claim.reviewerNotes) {
        lines.push(`- Reviewer notes: ${claim.reviewerNotes}`);
      }

      if (claim.evidenceTitles.length > 0) {
        lines.push("- Evidence:");
        lines.push(...renderImportedEvidenceLines(claim).map((line) => `  - ${line}`));
      }

      lines.push(`- Model reason: ${claim.modelReason}`, "");
    });
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderReviewerDecisionImportSummaryCsv(
  report: ReviewerDecisionImportReport,
  failOn: ClaimVerdict[] = [],
): string {
  const rows = [
    [
      "answer_label",
      "answer_path",
      "answer_preview",
      "primary_final_verdict",
      "primary_claim",
      "primary_model_reason",
      "primary_reviewer_notes",
      "primary_evidence_title",
      "primary_evidence_trust_level",
      "primary_evidence_updated_at",
      "primary_evidence_score",
      "primary_evidence_quote",
      "total_claims",
      "reviewed_claims",
      "pending_claims",
      "overridden_claims",
      "verified",
      "contradicted",
      "unsupported",
      "needs_review",
      "fail_policy",
      "fail_verdicts",
    ],
    ...report.answerGroups.map((group) => {
      const primaryClaim = selectPrimaryImportedClaim(group.claims);
      const failVerdicts = matchingFailVerdicts(group, failOn);

      return [
        group.label,
        group.answerPath ?? "",
        group.answerPreview ?? "",
        primaryClaim?.finalVerdict ?? (group.claims.length === 0 ? "needs_review" : ""),
        primaryClaim?.claimText ?? "",
        primaryClaim?.modelReason ?? (group.claims.length === 0 ? group.emptyStateReason ?? NO_CLAIMS_REVIEW_REASON : ""),
        primaryClaim?.reviewerNotes ?? "",
        primaryClaim?.evidenceTitles[0] ?? "",
        primaryClaim?.evidenceTrustLevels[0] ?? "",
        primaryClaim?.evidenceUpdatedAt[0] ?? "",
        primaryClaim?.evidenceScores[0] ?? "",
        primaryClaim?.evidenceQuotes[0] ?? "",
        group.summary.totalClaims.toString(),
        group.summary.reviewedClaims.toString(),
        group.summary.pendingClaims.toString(),
        group.summary.overriddenClaims.toString(),
        group.summary.verified.toString(),
        group.summary.contradicted.toString(),
        group.summary.unsupported.toString(),
        group.summary.needs_review.toString(),
        failVerdicts.length > 0 ? "matched" : "clear",
        failVerdicts.join(" | "),
      ];
    }),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function renderReviewerDecisionImportHtmlReport(
  report: ReviewerDecisionImportReport,
  failOn: ClaimVerdict[] = [],
): string {
  const failVerdicts = matchingFailVerdicts(report, failOn);
  const groupCards =
    report.answerGroups.length === 0
      ? `
          <section class="empty-state">
            <h2>No claims imported</h2>
            <p>This reviewer decision CSV did not include any claim rows.</p>
          </section>`
      : report.answerGroups
          .map((group) => {
            const groupFailVerdicts = matchingFailVerdicts(group, failOn);
            const claimCards = group.claims
              .map((claim, index) => renderClaimCard(claim, index + 1))
              .join("\n");
            const claimListContent =
              group.claims.length > 0
                ? claimCards
                : `<article class="claim-card"><div class="claim-section"><h4>Review note</h4><p>${escapeHtml(group.emptyStateReason ?? NO_CLAIMS_REVIEW_REASON)}</p></div></article>`;

            return `
              <section class="answer-group">
                <div class="answer-group__header">
                  <div>
                    <p class="eyebrow">Answer file</p>
                    <h2><code>${escapeHtml(group.label)}</code></h2>
                    ${
                      group.answerPath && group.answerPath !== group.label
                        ? `<p class="answer-group__path"><code>${escapeHtml(group.answerPath)}</code></p>`
                        : ""
                    }
                    ${group.answerPreview
                      ? `<p class="answer-group__preview">${escapeHtml(group.answerPreview)}</p>`
                      : ""}
                  </div>
                  <div class="answer-group__meta">
                    <span>${group.summary.totalClaims} claims</span>
                    <span>${group.summary.reviewedClaims} reviewed</span>
                    <span>${group.summary.pendingClaims} pending</span>
                    <span>Fail policy ${groupFailVerdicts.length > 0 ? `matched (${escapeHtml(groupFailVerdicts.join(", "))})` : "clear"}</span>
                  </div>
                </div>
                <div class="answer-group__stats">
                  <article class="group-stat"><span>Verified</span><strong>${group.summary.verified}</strong></article>
                  <article class="group-stat"><span>Contradicted</span><strong>${group.summary.contradicted}</strong></article>
                  <article class="group-stat"><span>Unsupported</span><strong>${group.summary.unsupported}</strong></article>
                  <article class="group-stat"><span>Needs review</span><strong>${group.summary.needs_review}</strong></article>
                  <article class="group-stat"><span>Overrides</span><strong>${group.summary.overriddenClaims}</strong></article>
                </div>
                <div class="claim-list">
                  ${claimListContent}
                </div>
              </section>`
              .trim();
          })
          .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quorum Reviewer Decision Import</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3efe7;
        --paper: #fffdf9;
        --paper-strong: #fff;
        --ink: #1f2933;
        --muted: #5f6c7b;
        --line: #ddd4c5;
        --verified: #19674f;
        --verified-bg: #e4f4ec;
        --contradicted: #9f2f2f;
        --contradicted-bg: #f9e8e6;
        --unsupported: #8a6412;
        --unsupported-bg: #f8efd9;
        --needs-review: #265f99;
        --needs-review-bg: #e6eef9;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Aptos", "Avenir Next", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.95), rgba(243,239,231,0.85) 35%, transparent 60%),
          linear-gradient(180deg, #ede6d9 0%, var(--bg) 48%, #ece4d7 100%);
        color: var(--ink);
      }

      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }

      .hero {
        display: grid;
        gap: 18px;
        margin-bottom: 28px;
        padding: 28px;
        border: 1px solid rgba(31, 41, 51, 0.08);
        border-radius: 24px;
        background: rgba(255, 253, 249, 0.82);
        backdrop-filter: blur(10px);
        box-shadow: 0 20px 50px rgba(84, 67, 39, 0.08);
      }

      .hero h1,
      .claim-card h2,
      .claim-section h3 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        font-weight: 600;
      }

      .hero p {
        margin: 0;
        color: var(--muted);
        max-width: 64ch;
        line-height: 1.5;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 14px;
      }

      .summary-card,
      .answer-group,
      .claim-card,
      .empty-state {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--paper);
        box-shadow: 0 12px 32px rgba(84, 67, 39, 0.06);
      }

      .summary-card {
        padding: 18px;
      }

      .summary-card span {
        display: block;
        font-size: 13px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .summary-card strong {
        display: block;
        margin-top: 8px;
        font-size: 32px;
      }

      .answer-groups,
      .claim-list {
        display: grid;
        gap: 18px;
      }

      .answer-group {
        padding: 22px;
      }

      .answer-group__header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        gap: 16px;
      }

      .answer-group__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        color: var(--muted);
        font-size: 14px;
      }

      .answer-group__preview {
        margin: 10px 0 0;
        color: #314150;
        line-height: 1.5;
        max-width: 72ch;
      }

      .answer-group__path {
        margin: 10px 0 0;
        color: var(--muted);
      }

      .answer-group__stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 12px;
        margin: 18px 0 0;
      }

      .group-stat {
        padding: 14px;
        border: 1px solid rgba(31, 41, 51, 0.08);
        border-radius: 16px;
        background: var(--paper-strong);
      }

      .group-stat span {
        display: block;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .group-stat strong {
        display: block;
        margin-top: 6px;
        font-size: 24px;
      }

      .claim-card {
        padding: 22px;
      }

      .claim-card__header {
        display: flex;
        align-items: start;
        justify-content: space-between;
        gap: 16px;
      }

      .eyebrow {
        margin: 0 0 6px;
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .verdict-pill {
        display: inline-flex;
        align-items: center;
        padding: 7px 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        text-transform: capitalize;
        white-space: nowrap;
      }

      .verdict-pill--verified { color: var(--verified); background: var(--verified-bg); }
      .verdict-pill--contradicted { color: var(--contradicted); background: var(--contradicted-bg); }
      .verdict-pill--unsupported { color: var(--unsupported); background: var(--unsupported-bg); }
      .verdict-pill--needs-review { color: var(--needs-review); background: var(--needs-review-bg); }

      .claim-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin: 18px 0 0;
        padding: 16px 0;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
      }

      .claim-meta dt {
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .claim-meta dd {
        margin: 6px 0 0;
        font-size: 15px;
      }

      .claim-section {
        margin-top: 18px;
      }

      .claim-section p,
      .claim-section li {
        color: #314150;
        line-height: 1.5;
      }

      .claim-section ul {
        margin: 10px 0 0;
        padding-left: 20px;
      }

      .empty-state {
        padding: 28px;
        text-align: center;
      }

      code {
        font-family: "SFMono-Regular", "SF Mono", "Menlo", monospace;
        font-size: 13px;
      }

      @media (max-width: 720px) {
        main { padding: 20px 14px 40px; }
        .hero, .claim-card { padding: 18px; }
        .claim-card__header { flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>Quorum Reviewer Decision Import</h1>
          <p>Imported reviewer decisions, final verdicts, and evidence context in a format that is easier to share during policy reviews and approval handoffs.</p>
        </div>
        <div class="summary-grid">
          <article class="summary-card"><span>Total claims</span><strong>${report.summary.totalClaims}</strong></article>
          <article class="summary-card"><span>Reviewed claims</span><strong>${report.summary.reviewedClaims}</strong></article>
          <article class="summary-card"><span>Pending claims</span><strong>${report.summary.pendingClaims}</strong></article>
          <article class="summary-card"><span>Overrides</span><strong>${report.summary.overriddenClaims}</strong></article>
          <article class="summary-card"><span>Verified</span><strong>${report.summary.verified}</strong></article>
          <article class="summary-card"><span>Contradicted</span><strong>${report.summary.contradicted}</strong></article>
          <article class="summary-card"><span>Unsupported</span><strong>${report.summary.unsupported}</strong></article>
          <article class="summary-card"><span>Needs review</span><strong>${report.summary.needs_review}</strong></article>
          <article class="summary-card"><span>Fail policy</span><strong>${failVerdicts.length > 0 ? `matched (${escapeHtml(failVerdicts.join(", "))})` : "clear"}</strong></article>
        </div>
      </section>
      <section class="answer-groups">
        ${groupCards}
      </section>
    </main>
  </body>
</html>
`;
}

function renderClaimCard(claim: ImportedReviewerDecision, index: number): string {
  const reviewerVerdict = claim.reviewerVerdict
    ? `${claim.reviewerVerdict}${claim.overridden ? " (override)" : ""}`
    : "pending reviewer decision";
  const evidenceItems = renderImportedEvidenceItems(claim);
  const evidenceTitles =
    claim.evidenceTitles.length > 0 ? claim.evidenceTitles.join(", ") : "None";

  return `
    <article class="claim-card">
      <div class="claim-card__header">
        <div>
          <p class="eyebrow">Claim ${index}</p>
          <h3>${escapeHtml(claim.claimText)}</h3>
        </div>
        <span class="verdict-pill verdict-pill--${escapeHtml(claim.finalVerdict.replace("_", "-"))}">
          ${escapeHtml(claim.finalVerdict)}
        </span>
      </div>
      <dl class="claim-meta">
        <div>
          <dt>Model verdict</dt>
          <dd>${escapeHtml(claim.modelVerdict)}</dd>
        </div>
        <div>
          <dt>Reviewer verdict</dt>
          <dd>${escapeHtml(reviewerVerdict)}</dd>
        </div>
        <div>
          <dt>Evidence titles</dt>
          <dd>${escapeHtml(evidenceTitles)}</dd>
        </div>
      </dl>
      <div class="claim-section">
        <h4>Model reason</h4>
        <p>${escapeHtml(claim.modelReason)}</p>
      </div>
      ${
        claim.reviewerNotes
          ? `<div class="claim-section"><h4>Reviewer notes</h4><p>${escapeHtml(claim.reviewerNotes)}</p></div>`
          : ""
      }
      <div class="claim-section">
        <h4>Evidence context</h4>
        <ul>${evidenceItems}</ul>
      </div>
    </article>`
    .trim();
}

function renderImportedEvidenceItems(claim: ImportedReviewerDecision): string {
  const evidence = collectImportedEvidence(claim);

  if (evidence.length === 0) {
    return "<li>No evidence details captured.</li>";
  }

  return evidence
    .map((item) => {
      const metadata = [
        item.title,
        ...(item.trustLevel ? [`${item.trustLevel} trust`] : []),
        ...(item.updatedAt ? [`updated ${item.updatedAt}`] : []),
        ...(item.score ? [`score ${item.score}`] : []),
      ];
      const quote = item.quote ? `: ${escapeHtml(item.quote)}` : "";
      return `<li><strong>${escapeHtml(metadata.join(" - "))}</strong>${quote}</li>`;
    })
    .join("");
}

function renderImportedEvidenceLines(claim: ImportedReviewerDecision): string[] {
  return collectImportedEvidence(claim).map((item) => {
    const metadata = [
      item.title,
      ...(item.trustLevel ? [`${item.trustLevel} trust`] : []),
      ...(item.updatedAt ? [`updated ${item.updatedAt}`] : []),
      ...(item.score ? [`score ${item.score}`] : []),
    ];

    return item.quote ? `${metadata.join(", ")}: ${item.quote}` : metadata.join(", ");
  });
}

function collectImportedEvidence(claim: ImportedReviewerDecision): Array<{
  title: string;
  trustLevel?: string;
  updatedAt?: string;
  score?: string;
  quote?: string;
}> {
  const length = Math.max(
    claim.evidenceTitles.length,
    claim.evidenceTrustLevels.length,
    claim.evidenceUpdatedAt.length,
    claim.evidenceScores.length,
    claim.evidenceQuotes.length,
  );
  const evidence = [];

  for (let index = 0; index < length; index += 1) {
    const title = claim.evidenceTitles[index];
    const trustLevel = claim.evidenceTrustLevels[index];
    const updatedAt = claim.evidenceUpdatedAt[index];
    const score = claim.evidenceScores[index];
    const quote = claim.evidenceQuotes[index];

    if (!title && !trustLevel && !updatedAt && !score && !quote) {
      continue;
    }

    evidence.push({ title: title || "Untitled evidence", trustLevel, updatedAt, score, quote });
  }

  return evidence;
}

function groupImportedClaims(
  claims: ImportedReviewerDecision[],
  seeds: ImportedAnswerGroupSeed[] = [],
): ReviewerDecisionGroup[] {
  const groups = new Map<string, ReviewerDecisionGroup>();

  for (const seed of seeds) {
    getOrCreateImportedGroup(groups, seed).emptyStateReason =
      seed.emptyStateReason ?? NO_CLAIMS_REVIEW_REASON;
  }

  for (const claim of claims) {
    const group = getOrCreateImportedGroup(groups, claim);
    group.claims.push(claim);
    accumulateClaimSummary(group.summary, claim);
  }

  return [...groups.values()];
}

function createEmptyImportSummary(): ReviewerDecisionImportReport["summary"] {
  return {
    totalClaims: 0,
    reviewedClaims: 0,
    pendingClaims: 0,
    overriddenClaims: 0,
    verified: 0,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  };
}

function selectPrimaryImportedClaim(
  claims: ImportedReviewerDecision[],
): ImportedReviewerDecision | undefined {
  const priority: Record<ClaimVerdict, number> = {
    contradicted: 0,
    unsupported: 1,
    needs_review: 2,
    verified: 3,
  };

  return claims.reduce<ImportedReviewerDecision | undefined>((selected, claim) => {
    if (!selected) {
      return claim;
    }

    return priority[claim.finalVerdict] < priority[selected.finalVerdict]
      ? claim
      : selected;
  }, undefined);
}

function accumulateClaimSummary(
  summary: ReviewerDecisionImportReport["summary"],
  claim: ImportedReviewerDecision,
): void {
  summary.totalClaims += 1;
  summary[claim.finalVerdict] += 1;

  if (claim.reviewerVerdict) {
    summary.reviewedClaims += 1;
  } else {
    summary.pendingClaims += 1;
  }

  if (claim.overridden) {
    summary.overriddenClaims += 1;
  }
}

function importDecisionRow(
  row: string[],
  rowNumber: number,
  columnIndex: Record<ReviewerDecisionHeader, number> & {
    answerLabel?: number;
    answerPath?: number;
    answerPreview?: number;
    answerHasClaims?: number;
    evidenceTrustLevels?: number;
    evidenceUpdatedAt?: number;
    evidenceScores?: number;
  },
): ImportedReviewerDecision | ImportedAnswerGroupSeed {
  const answerLabel = readOptionalValue(row, columnIndex.answerLabel ?? -1) || undefined;
  const answerPath = readOptionalValue(row, columnIndex.answerPath ?? -1) || undefined;
  const answerPreview = readOptionalValue(row, columnIndex.answerPreview ?? -1) || undefined;
  const answerHasClaims = parseOptionalBoolean(
    readOptionalValue(row, columnIndex.answerHasClaims ?? -1),
    rowNumber,
    OPTIONAL_ANSWER_HAS_CLAIMS_HEADER,
  );

  if (answerHasClaims === false) {
    return {
      answerLabel,
      answerPath,
      answerPreview,
      emptyStateReason:
        readOptionalValue(row, columnIndex.model_reason) || NO_CLAIMS_REVIEW_REASON,
    };
  }

  const claimId = readRequiredValue(row, rowNumber, columnIndex.claim_id, "claim_id");
  const claimText = readRequiredValue(row, rowNumber, columnIndex.claim_text, "claim_text");
  const modelVerdict = parseVerdict(
    readRequiredValue(row, rowNumber, columnIndex.model_verdict, "model_verdict"),
    rowNumber,
    "model_verdict",
  );
  const reviewerVerdictValue = readOptionalValue(row, columnIndex.reviewer_verdict);
  const reviewerVerdict = reviewerVerdictValue
    ? parseVerdict(reviewerVerdictValue, rowNumber, "reviewer_verdict")
    : undefined;
  const reviewerNotes = readOptionalValue(row, columnIndex.reviewer_notes) || undefined;
  const finalVerdict = reviewerVerdict ?? modelVerdict;

  return {
    answerLabel,
    answerPath,
    answerPreview,
    claimId,
    claimText,
    modelVerdict,
    modelReason: readRequiredValue(
      row,
      rowNumber,
      columnIndex.model_reason,
      "model_reason",
    ),
    evidenceTitles: parseDelimitedList(readOptionalValue(row, columnIndex.evidence_titles)),
    evidenceTrustLevels: parseDelimitedList(
      readOptionalValue(row, columnIndex.evidenceTrustLevels ?? -1),
    ),
    evidenceUpdatedAt: parseDelimitedList(
      readOptionalValue(row, columnIndex.evidenceUpdatedAt ?? -1),
    ),
    evidenceScores: parseDelimitedList(
      readOptionalValue(row, columnIndex.evidenceScores ?? -1),
    ),
    evidenceQuotes: parseDelimitedList(readOptionalValue(row, columnIndex.evidence_quotes)),
    reviewerVerdict,
    reviewerNotes,
    finalVerdict,
    overridden: reviewerVerdict !== undefined && reviewerVerdict !== modelVerdict,
  };
}

function assertHeaders(headers: string[]): void {
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new Error(
      `Reviewer decision CSV is missing required columns: ${missingHeaders.join(", ")}`,
    );
  }
}

function getOrCreateImportedGroup(
  groups: Map<string, ReviewerDecisionGroup>,
  value: ImportedReviewerDecision | ImportedAnswerGroupSeed,
): ReviewerDecisionGroup {
  const key = [
    value.answerLabel ?? "",
    value.answerPath ?? "",
    value.answerPreview ?? "",
  ].join("\u0000");
  const existing = groups.get(key);

  if (existing) {
    return existing;
  }

  const group: ReviewerDecisionGroup = {
    answerLabel: value.answerLabel,
    answerPath: value.answerPath,
    answerPreview: value.answerPreview,
    label: value.answerLabel ?? value.answerPath ?? value.answerPreview ?? "Unspecified answer",
    claims: [],
    emptyStateReason:
      "emptyStateReason" in value ? value.emptyStateReason : undefined,
    summary: createEmptyImportSummary(),
  };
  groups.set(key, group);
  return group;
}

function parseOptionalBoolean(
  value: string,
  rowNumber: number,
  columnName: string,
): boolean | undefined {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new Error(
    `Invalid ${columnName} value on row ${rowNumber}: expected true or false, received "${value}"`,
  );
}

function createColumnIndex(
  headers: string[],
): Record<ReviewerDecisionHeader, number> & {
  answerLabel?: number;
  answerPath?: number;
  answerPreview?: number;
  answerHasClaims?: number;
  evidenceTrustLevels?: number;
  evidenceUpdatedAt?: number;
  evidenceScores?: number;
} {
  const requiredColumnIndex = REQUIRED_HEADERS.reduce(
    (accumulator, header) => ({
      ...accumulator,
      [header]: headers.indexOf(header),
    }),
    {} as Record<ReviewerDecisionHeader, number>,
  );

  const answerPathIndex = headers.indexOf(OPTIONAL_ANSWER_PATH_HEADER);
  const answerLabelIndex = headers.indexOf(OPTIONAL_ANSWER_LABEL_HEADER);
  const answerPreviewIndex = headers.indexOf(OPTIONAL_ANSWER_PREVIEW_HEADER);
  const answerHasClaimsIndex = headers.indexOf(OPTIONAL_ANSWER_HAS_CLAIMS_HEADER);
  const evidenceTrustLevelsIndex = headers.indexOf(OPTIONAL_EVIDENCE_TRUST_LEVELS_HEADER);
  const evidenceUpdatedAtIndex = headers.indexOf(OPTIONAL_EVIDENCE_UPDATED_AT_HEADER);
  const evidenceScoresIndex = headers.indexOf(OPTIONAL_EVIDENCE_SCORES_HEADER);

  return {
    ...requiredColumnIndex,
    ...(answerLabelIndex === -1 ? {} : { answerLabel: answerLabelIndex }),
    ...(answerPathIndex === -1 ? {} : { answerPath: answerPathIndex }),
    ...(answerPreviewIndex === -1 ? {} : { answerPreview: answerPreviewIndex }),
    ...(answerHasClaimsIndex === -1 ? {} : { answerHasClaims: answerHasClaimsIndex }),
    ...(evidenceTrustLevelsIndex === -1
      ? {}
      : { evidenceTrustLevels: evidenceTrustLevelsIndex }),
    ...(evidenceUpdatedAtIndex === -1 ? {} : { evidenceUpdatedAt: evidenceUpdatedAtIndex }),
    ...(evidenceScoresIndex === -1 ? {} : { evidenceScores: evidenceScoresIndex }),
  };
}

function readRequiredValue(
  row: string[],
  rowNumber: number,
  index: number,
  columnName: ReviewerDecisionHeader,
): string {
  const value = row[index]?.trim();

  if (!value) {
    throw new Error(`Row ${rowNumber} is missing ${columnName}.`);
  }

  return value;
}

function readOptionalValue(row: string[], index: number): string {
  return row[index]?.trim() ?? "";
}

function parseVerdict(
  value: string,
  rowNumber: number,
  columnName: ReviewerDecisionHeader,
): ClaimVerdict {
  try {
    return parseClaimVerdict(value);
  } catch (error) {
    throw new Error(
      `Row ${rowNumber} has invalid ${columnName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const normalized = content.replace(/\r\n/g, "\n");

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (character === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const trimmed = [...lines];

  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") {
    trimmed.pop();
  }

  return trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsvValue(value: string): string {
  if (value.includes('"')) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  if (value.includes(",") || value.includes("\n")) {
    return `"${value}"`;
  }

  return value;
}
