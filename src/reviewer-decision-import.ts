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

type ReviewerDecisionHeader = (typeof REQUIRED_HEADERS)[number];

export interface ImportedReviewerDecision {
  claimId: string;
  claimText: string;
  modelVerdict: ClaimVerdict;
  modelReason: string;
  evidenceTitles: string[];
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

    lines.push(
      `${claim.finalVerdict.toUpperCase()}  ${claim.claimText}`,
      `Model verdict: ${claim.modelVerdict}`,
      `Reviewer verdict: ${reviewState}`,
    );

    if (claim.reviewerNotes) {
      lines.push(`Reviewer notes: ${claim.reviewerNotes}`);
    }

    lines.push("");
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function importDecisionRow(
  row: string[],
  rowNumber: number,
  columnIndex: Record<ReviewerDecisionHeader, number>,
): ImportedReviewerDecision {
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
): Record<ReviewerDecisionHeader, number> {
  return REQUIRED_HEADERS.reduce(
    (accumulator, header) => ({
      ...accumulator,
      [header]: headers.indexOf(header),
    }),
    {} as Record<ReviewerDecisionHeader, number>,
  );
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

  while (trimmed.at(-1) === "") {
    trimmed.pop();
  }

  return trimmed;
}
