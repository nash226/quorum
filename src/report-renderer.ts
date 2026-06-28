import type { ClaimAssessment, VerificationReport } from "./domain.js";

export function renderTextReport(report: VerificationReport): string {
  const lines = [
    "Quorum Verification Report",
    "",
    `Sources: ${report.sources.map((source) => source.title).join(", ")}`,
    `Summary: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    "",
  ];

  for (const assessment of report.assessments) {
    lines.push(...renderTextAssessment(assessment), "");
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderMarkdownReport(report: VerificationReport): string {
  const lines = [
    "# Quorum Verification Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Sources reviewed: ${report.sources.length}`,
    `- Verified: ${report.summary.verified}`,
    `- Contradicted: ${report.summary.contradicted}`,
    `- Unsupported: ${report.summary.unsupported}`,
    `- Needs review: ${report.summary.needs_review}`,
    "",
    "## Sources",
    "",
    ...report.sources.map((source) => {
      const metadata = [`trust: ${source.trustLevel}`];

      if (source.updatedAt) {
        metadata.push(`updated: ${source.updatedAt}`);
      }

      return `- **${source.title}** (${metadata.join(", ")})`;
    }),
    "",
    "## Claim Assessments",
    "",
  ];

  report.assessments.forEach((assessment, index) => {
    lines.push(...renderMarkdownAssessment(assessment, index + 1), "");
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function renderTextAssessment(assessment: ClaimAssessment): string[] {
  const lines = [
    `${assessment.verdict.toUpperCase()}  ${assessment.claim.text}`,
    `Reason: ${assessment.reason}`,
  ];

  for (const evidence of assessment.evidence) {
    lines.push(
      `Evidence (${evidence.documentTitle}, ${evidence.documentTrustLevel} trust, score ${evidence.score}):`,
      `  ${evidence.quote}`,
    );
  }

  return lines;
}

function renderMarkdownAssessment(
  assessment: ClaimAssessment,
  index: number,
): string[] {
  const lines = [
    `### ${index}. ${assessment.claim.text}`,
    "",
    `- Verdict: \`${assessment.verdict}\``,
    `- Reason: ${assessment.reason}`,
  ];

  if (assessment.evidence.length === 0) {
    lines.push("- Evidence: No approved source snippet matched strongly enough.");
    return lines;
  }

  lines.push("- Evidence:");

  for (const evidence of assessment.evidence) {
    lines.push(
      `  - **${evidence.documentTitle}** (${evidence.documentTrustLevel} trust, score ${evidence.score})`,
      `    > ${evidence.quote}`,
    );
  }

  return lines;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;

  while (end > 0 && lines[end - 1] === "") {
    end -= 1;
  }

  return lines.slice(0, end);
}
