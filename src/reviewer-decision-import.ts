import type { ClaimVerdict } from "./domain.js";
import { parseClaimVerdict } from "./report-policy.js";

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
const OPTIONAL_ANSWER_PATH_HEADER = "answer_path";
const OPTIONAL_EVIDENCE_TRUST_LEVELS_HEADER = "evidence_trust_levels";
const OPTIONAL_EVIDENCE_SCORES_HEADER = "evidence_scores";

type ReviewerDecisionHeader = (typeof REQUIRED_HEADERS)[number];

export interface ImportedReviewerDecision {
  answerPath?: string;
  claimId: string;
  claimText: string;
  modelVerdict: ClaimVerdict;
  modelReason: string;
  evidenceTitles: string[];
  evidenceTrustLevels: string[];
  evidenceScores: string[];
  evidenceQuotes: string[];
  reviewerVerdict?: ClaimVerdict;
  reviewerNotes?: string;
  finalVerdict: ClaimVerdict;
  overridden: boolean;
}

export interface ReviewerDecisionImportReport {
  claims: ImportedReviewerDecision[];
  summary: {
    totalClaims: number;
    reviewedClaims: number;
    pendingClaims: number;
    overriddenClaims: number;
  } & Record<ClaimVerdict, number>;
}

export function importReviewerDecisions(
  csvContent: string,
): ReviewerDecisionImportReport {
  const rows = parseCsv(csvContent);

  if (rows.length === 0) {
    throw new Error("Reviewer decision CSV is empty.");
  }

  const headers = rows[0] ?? [];
  assertHeaders(headers);
  const columnIndex = createColumnIndex(headers);
  const claims = rows
    .slice(1)
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row, rowIndex) => importDecisionRow(row, rowIndex + 2, columnIndex));

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

  return { claims, summary };
}

export function renderReviewerDecisionImportReport(
  report: ReviewerDecisionImportReport,
): string {
  const lines = [
    "Quorum Reviewer Decision Import",
    "",
    `Claims: ${report.summary.totalClaims} total, ${report.summary.reviewedClaims} reviewed, ${report.summary.pendingClaims} pending`,
    `Final verdicts: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    `Overrides: ${report.summary.overriddenClaims}`,
  ];

  if (report.claims.length > 0) {
    lines.push("", "Claim Decisions", "");
  }

  for (const claim of report.claims) {
    const reviewState = claim.reviewerVerdict
      ? `${claim.reviewerVerdict}${claim.overridden ? " (override)" : ""}`
      : "pending reviewer decision";

    lines.push(`${claim.finalVerdict.toUpperCase()}  ${claim.claimText}`);

    if (claim.answerPath) {
      lines.push(`Answer path: ${claim.answerPath}`);
    }

    lines.push(`Model verdict: ${claim.modelVerdict}`, `Reviewer verdict: ${reviewState}`);

    if (claim.reviewerNotes) {
      lines.push(`Reviewer notes: ${claim.reviewerNotes}`);
    }

    lines.push("");
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderReviewerDecisionImportMarkdownReport(
  report: ReviewerDecisionImportReport,
): string {
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
  ];

  if (report.claims.length === 0) {
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "## Claim Decisions", "");

  report.claims.forEach((claim, index) => {
    const reviewerVerdict = claim.reviewerVerdict
      ? `${claim.reviewerVerdict}${claim.overridden ? " (override)" : ""}`
      : "pending reviewer decision";

    lines.push(
      `### ${index + 1}. ${claim.claimText}`,
      "",
      `- Final verdict: ${claim.finalVerdict}`,
      `- Model verdict: ${claim.modelVerdict}`,
      `- Reviewer verdict: ${reviewerVerdict}`,
    );

    if (claim.answerPath) {
      lines.push(`- Answer path: \`${claim.answerPath}\``);
    }

    if (claim.reviewerNotes) {
      lines.push(`- Reviewer notes: ${claim.reviewerNotes}`);
    }

    if (claim.evidenceTitles.length > 0) {
      lines.push(
        `- Evidence titles: ${claim.evidenceTitles.join(", ")}`,
      );
    }

    lines.push(`- Model reason: ${claim.modelReason}`, "");
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderReviewerDecisionImportHtmlReport(
  report: ReviewerDecisionImportReport,
): string {
  const claimCards =
    report.claims.length === 0
      ? `
          <section class="empty-state">
            <h2>No claims imported</h2>
            <p>This reviewer decision CSV did not include any claim rows.</p>
          </section>`
      : report.claims
          .map((claim, index) => {
            const reviewerVerdict = claim.reviewerVerdict
              ? `${claim.reviewerVerdict}${claim.overridden ? " (override)" : ""}`
              : "pending reviewer decision";
            const evidenceTitles =
              claim.evidenceTitles.length > 0 ? claim.evidenceTitles.join(", ") : "None";
            const evidenceQuotes =
              claim.evidenceQuotes.length > 0
                ? claim.evidenceQuotes.map((quote) => `<li>${escapeHtml(quote)}</li>`).join("")
                : "<li>No evidence quote captured.</li>";

            return `
              <article class="claim-card">
                <div class="claim-card__header">
                  <div>
                    <p class="eyebrow">Claim ${index + 1}</p>
                    <h2>${escapeHtml(claim.claimText)}</h2>
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
                  ${
                    claim.answerPath
                      ? `<div><dt>Answer path</dt><dd><code>${escapeHtml(claim.answerPath)}</code></dd></div>`
                      : ""
                  }
                </dl>
                <div class="claim-section">
                  <h3>Model reason</h3>
                  <p>${escapeHtml(claim.modelReason)}</p>
                </div>
                ${
                  claim.reviewerNotes
                    ? `<div class="claim-section"><h3>Reviewer notes</h3><p>${escapeHtml(claim.reviewerNotes)}</p></div>`
                    : ""
                }
                <div class="claim-section">
                  <h3>Evidence quotes</h3>
                  <ul>${evidenceQuotes}</ul>
                </div>
              </article>`
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

      .claim-list {
        display: grid;
        gap: 18px;
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
        </div>
      </section>
      <section class="claim-list">
        ${claimCards}
      </section>
    </main>
  </body>
</html>
`;
}

function importDecisionRow(
  row: string[],
  rowNumber: number,
  columnIndex: Record<ReviewerDecisionHeader, number> & {
    answerPath?: number;
    evidenceTrustLevels?: number;
    evidenceScores?: number;
  },
): ImportedReviewerDecision {
  const answerPath = readOptionalValue(row, columnIndex.answerPath ?? -1) || undefined;
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
    answerPath,
    claimId,
    claimText,
    modelVerdict,
    modelReason: readRequiredValue(
      row,
      rowNumber,
      columnIndex.model_reason,
      "model_reason",
    ),
    evidenceTitles: splitEvidenceList(readOptionalValue(row, columnIndex.evidence_titles)),
    evidenceTrustLevels: splitEvidenceList(
      readOptionalValue(row, columnIndex.evidenceTrustLevels ?? -1),
    ),
    evidenceScores: splitEvidenceList(readOptionalValue(row, columnIndex.evidenceScores ?? -1)),
    evidenceQuotes: splitEvidenceList(readOptionalValue(row, columnIndex.evidence_quotes)),
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

function createColumnIndex(
  headers: string[],
): Record<ReviewerDecisionHeader, number> & {
  answerPath?: number;
  evidenceTrustLevels?: number;
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
  const evidenceTrustLevelsIndex = headers.indexOf(OPTIONAL_EVIDENCE_TRUST_LEVELS_HEADER);
  const evidenceScoresIndex = headers.indexOf(OPTIONAL_EVIDENCE_SCORES_HEADER);

  return {
    ...requiredColumnIndex,
    ...(answerPathIndex === -1 ? {} : { answerPath: answerPathIndex }),
    ...(evidenceTrustLevelsIndex === -1
      ? {}
      : { evidenceTrustLevels: evidenceTrustLevelsIndex }),
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

function splitEvidenceList(value: string): string[] {
  return value
    .split(" | ")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
