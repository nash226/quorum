import type {
  BatchVerificationReport,
  ClaimAssessment,
  VerificationReport,
} from "./domain.js";

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

export function renderBatchMarkdownReport(report: BatchVerificationReport): string {
  const lines = [
    "# Quorum Batch Verification Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Answers reviewed: ${report.answerCount}`,
    `- Sources reviewed: ${report.sourceCount}`,
    `- Verified: ${report.summary.verified}`,
    `- Contradicted: ${report.summary.contradicted}`,
    `- Unsupported: ${report.summary.unsupported}`,
    `- Needs review: ${report.summary.needs_review}`,
    `- Answers matching fail policy: ${report.summary.answersWithFailures}`,
    "",
    "## Answer Reports",
    "",
  ];

  report.answers.forEach((answer, index) => {
    lines.push(
      `### ${index + 1}. ${answer.answerPath}`,
      "",
      `- Fail policy: ${answer.shouldFail ? "matched" : "clear"}`,
      `- Verified: ${answer.report.summary.verified}`,
      `- Contradicted: ${answer.report.summary.contradicted}`,
      `- Unsupported: ${answer.report.summary.unsupported}`,
      `- Needs review: ${answer.report.summary.needs_review}`,
      "",
    );
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderReviewerDecisionCsv(report: VerificationReport): string {
  const rows = [
    [
      "claim_id",
      "claim_text",
      "model_verdict",
      "model_reason",
      "evidence_titles",
      "evidence_quotes",
      "reviewer_verdict",
      "reviewer_notes",
    ],
    ...report.assessments.map((assessment) => [
      assessment.claim.id,
      assessment.claim.text,
      assessment.verdict,
      assessment.reason,
      assessment.evidence.map((evidence) => evidence.documentTitle).join(" | "),
      assessment.evidence.map((evidence) => evidence.quote).join(" | "),
      "",
      "",
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function renderHtmlReport(report: VerificationReport): string {
  const summaryCards = ([
    ["Verified", report.summary.verified, "verified"],
    ["Contradicted", report.summary.contradicted, "contradicted"],
    ["Unsupported", report.summary.unsupported, "unsupported"],
    ["Needs Review", report.summary.needs_review, "needs_review"],
  ] as const)
    .map(
      ([label, value, verdict]) => `
        <section class="summary-card summary-card--${verdict}">
          <span class="summary-card__label">${escapeHtml(label)}</span>
          <strong class="summary-card__value">${value}</strong>
        </section>`,
    )
    .join("");

  const sourceItems = report.sources
    .map((source) => {
      const meta = [`${source.trustLevel} trust`];

      if (source.updatedAt) {
        meta.push(`updated ${escapeHtml(source.updatedAt)}`);
      }

      return `
        <li class="source-list__item">
          <div>
            <strong>${escapeHtml(source.title)}</strong>
            <p>${meta.join(" · ")}</p>
          </div>
        </li>`;
    })
    .join("");

  const assessmentSections = report.assessments
    .map((assessment, index) => renderHtmlAssessment(assessment, index + 1))
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quorum Verification Report</title>
    <style>
      :root {
        color-scheme: light;
        --page: #f4f1ea;
        --panel: rgba(255, 252, 247, 0.92);
        --panel-strong: #fffdf9;
        --ink: #1f2933;
        --muted: #66727f;
        --line: rgba(31, 41, 51, 0.12);
        --shadow: 0 20px 50px rgba(74, 57, 39, 0.12);
        --verified: #1f7a4f;
        --verified-soft: #e6f5ec;
        --contradicted: #9f3a2c;
        --contradicted-soft: #fbe9e5;
        --unsupported: #8a6116;
        --unsupported-soft: #fbf1dc;
        --needs-review: #255a8f;
        --needs-review-soft: #e8f1fb;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(179, 146, 92, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(53, 95, 140, 0.12), transparent 24%),
          linear-gradient(180deg, #f7f4ee 0%, #f1eee7 100%);
      }

      .shell {
        max-width: 1360px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }

      .hero {
        position: relative;
        overflow: hidden;
        padding: 32px;
        border: 1px solid rgba(88, 67, 44, 0.1);
        border-radius: 28px;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(248, 243, 234, 0.88)),
          #fff;
        box-shadow: var(--shadow);
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -8% -42% auto;
        width: 340px;
        height: 340px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(28, 88, 140, 0.18), transparent 62%);
        pointer-events: none;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(31, 41, 51, 0.06);
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1,
      h2,
      h3 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      h1 {
        margin-top: 18px;
        font-size: clamp(2.3rem, 4vw, 3.7rem);
        line-height: 0.96;
        max-width: 9ch;
      }

      .hero__grid {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.95fr);
        gap: 28px;
        align-items: end;
        margin-top: 20px;
      }

      .hero__lead {
        max-width: 62ch;
        margin-top: 16px;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.6;
      }

      .hero__meta {
        display: grid;
        gap: 14px;
      }

      .hero__meta-card {
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.72);
      }

      .hero__meta-card span {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .hero__meta-card strong {
        display: block;
        margin-top: 6px;
        font-size: 1rem;
        line-height: 1.5;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
        margin-top: 24px;
      }

      .summary-card {
        padding: 18px 18px 20px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: 0 10px 28px rgba(55, 44, 31, 0.06);
      }

      .summary-card__label {
        display: block;
        font-size: 0.82rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .summary-card__value {
        display: block;
        margin-top: 12px;
        font-size: 2.35rem;
        line-height: 1;
      }

      .summary-card--verified {
        background: linear-gradient(180deg, var(--verified-soft), rgba(255, 255, 255, 0.9));
      }

      .summary-card--contradicted {
        background: linear-gradient(180deg, var(--contradicted-soft), rgba(255, 255, 255, 0.9));
      }

      .summary-card--unsupported {
        background: linear-gradient(180deg, var(--unsupported-soft), rgba(255, 255, 255, 0.9));
      }

      .summary-card--needs_review {
        background: linear-gradient(180deg, var(--needs-review-soft), rgba(255, 255, 255, 0.9));
      }

      .content-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.85fr);
        gap: 22px;
        margin-top: 24px;
        align-items: start;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .panel {
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: 0 16px 36px rgba(55, 44, 31, 0.06);
      }

      .panel h2 {
        font-size: 1.55rem;
      }

      .panel__subhead {
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.95rem;
        line-height: 1.5;
      }

      .answer {
        margin-top: 18px;
        padding: 18px;
        border-radius: 18px;
        background: var(--panel-strong);
        border: 1px solid var(--line);
        white-space: pre-wrap;
        line-height: 1.65;
      }

      .assessment-list {
        display: grid;
        gap: 16px;
        margin-top: 18px;
      }

      .assessment {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: var(--panel-strong);
      }

      .assessment--verified {
        box-shadow: inset 4px 0 0 var(--verified);
      }

      .assessment--contradicted {
        box-shadow: inset 4px 0 0 var(--contradicted);
      }

      .assessment--unsupported {
        box-shadow: inset 4px 0 0 var(--unsupported);
      }

      .assessment--needs_review {
        box-shadow: inset 4px 0 0 var(--needs-review);
      }

      .assessment__topline {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .assessment__index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        background: rgba(31, 41, 51, 0.06);
        color: var(--muted);
        font-size: 0.9rem;
        flex: none;
      }

      .assessment__title {
        display: flex;
        gap: 14px;
        min-width: 0;
      }

      .assessment h3 {
        font-size: 1.2rem;
        line-height: 1.35;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .badge--verified {
        color: var(--verified);
        background: var(--verified-soft);
      }

      .badge--contradicted {
        color: var(--contradicted);
        background: var(--contradicted-soft);
      }

      .badge--unsupported {
        color: var(--unsupported);
        background: var(--unsupported-soft);
      }

      .badge--needs_review {
        color: var(--needs-review);
        background: var(--needs-review-soft);
      }

      .assessment__reason {
        margin: 14px 0 0;
        color: var(--muted);
        line-height: 1.6;
      }

      .evidence-list {
        display: grid;
        gap: 14px;
        margin-top: 16px;
      }

      .evidence {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(247, 243, 236, 0.65);
      }

      .evidence__meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        color: var(--muted);
        font-size: 0.86rem;
      }

      .evidence blockquote {
        margin: 12px 0 0;
        padding-left: 14px;
        border-left: 3px solid rgba(31, 41, 51, 0.14);
        color: var(--ink);
        line-height: 1.65;
      }

      .evidence-empty {
        margin-top: 16px;
        padding: 15px 16px;
        border-radius: 18px;
        background: rgba(255, 247, 234, 0.75);
        color: var(--muted);
        border: 1px dashed rgba(138, 97, 22, 0.3);
      }

      .source-list {
        display: grid;
        gap: 12px;
        list-style: none;
        padding: 0;
        margin: 18px 0 0;
      }

      .source-list__item {
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--panel-strong);
      }

      .source-list__item p {
        margin: 6px 0 0;
        color: var(--muted);
      }

      .legend {
        display: grid;
        gap: 10px;
        margin-top: 18px;
      }

      .legend__row {
        display: flex;
        gap: 10px;
        align-items: center;
        color: var(--muted);
      }

      .legend__swatch {
        width: 14px;
        height: 14px;
        border-radius: 999px;
      }

      .review-note {
        margin-top: 18px;
        padding: 16px;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(37, 90, 143, 0.08), rgba(255, 255, 255, 0.82));
        border: 1px solid rgba(37, 90, 143, 0.16);
        color: var(--muted);
        line-height: 1.6;
      }

      @media (max-width: 980px) {
        .hero__grid,
        .content-grid,
        .summary-grid {
          grid-template-columns: 1fr;
        }

        .assessment__topline {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="eyebrow">Quorum Evidence Review</span>
        <div class="hero__grid">
          <div>
            <h1>Verification report for reviewer sign-off</h1>
            <p class="hero__lead">
              This report breaks an AI-generated answer into atomic business claims,
              scores them against approved sources, and surfaces the evidence a human
              reviewer should inspect before approving or editing the response.
            </p>
          </div>
          <div class="hero__meta">
            <article class="hero__meta-card">
              <span>Generated</span>
              <strong>${escapeHtml(report.generatedAt)}</strong>
            </article>
            <article class="hero__meta-card">
              <span>Sources reviewed</span>
              <strong>${report.sources.length} approved documents</strong>
            </article>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCards}
        </div>
      </section>

      <section class="content-grid">
        <div class="stack">
          <article class="panel">
            <h2>Submitted answer</h2>
            <p class="panel__subhead">
              Original model output under review before it reaches employees, customers,
              or downstream systems.
            </p>
            <div class="answer">${escapeHtml(report.answer)}</div>
          </article>

          <article class="panel">
            <h2>Claim-by-claim assessment</h2>
            <p class="panel__subhead">
              Review contradicted and unsupported claims first, then inspect claims marked
              as needs review where evidence is related but not decisive.
            </p>
            <div class="assessment-list">
              ${assessmentSections}
            </div>
          </article>
        </div>

        <aside class="stack">
          <article class="panel">
            <h2>Approved sources</h2>
            <p class="panel__subhead">
              Trust levels help Quorum prefer stronger evidence when passages are similarly relevant.
            </p>
            <ul class="source-list">
              ${sourceItems}
            </ul>
          </article>

          <article class="panel">
            <h2>Verdict legend</h2>
            <div class="legend">
              ${renderLegendRow("verified", "Supported strongly enough to trust as written.")}
              ${renderLegendRow("contradicted", "Conflicts with approved source language or numbers.")}
              ${renderLegendRow("unsupported", "No approved source snippet matched strongly enough.")}
              ${renderLegendRow("needs_review", "Related evidence exists, but support is still ambiguous.")}
            </div>
            <div class="review-note">
              Reviewer workflow: approve verified claims, edit or reject contradicted claims,
              and request source updates when the evidence base is incomplete or stale.
            </div>
          </article>
        </aside>
      </section>
    </main>
  </body>
</html>
`;
}

export function renderBatchHtmlReport(report: BatchVerificationReport): string {
  const summaryCards = ([
    ["Answers", report.answerCount, "answers"],
    ["Verified", report.summary.verified, "verified"],
    ["Contradicted", report.summary.contradicted, "contradicted"],
    ["Unsupported", report.summary.unsupported, "unsupported"],
    ["Needs Review", report.summary.needs_review, "needs_review"],
  ] as const)
    .map(
      ([label, value, tone]) => `
        <section class="summary-card summary-card--${tone}">
          <span class="summary-card__label">${escapeHtml(label)}</span>
          <strong class="summary-card__value">${value}</strong>
        </section>`,
    )
    .join("");

  const answerCards = report.answers
    .map((answer, index) => {
      const statusClass = answer.shouldFail ? "status--matched" : "status--clear";

      return `
        <article class="answer-card">
          <div class="answer-card__header">
            <div>
              <span class="answer-card__index">Answer ${index + 1}</span>
              <h2>${escapeHtml(answer.answerPath)}</h2>
            </div>
            <span class="status-pill ${statusClass}">${answer.shouldFail ? "Fail policy matched" : "Fail policy clear"}</span>
          </div>
          <dl class="answer-card__summary">
            <div><dt>Verified</dt><dd>${answer.report.summary.verified}</dd></div>
            <div><dt>Contradicted</dt><dd>${answer.report.summary.contradicted}</dd></div>
            <div><dt>Unsupported</dt><dd>${answer.report.summary.unsupported}</dd></div>
            <div><dt>Needs review</dt><dd>${answer.report.summary.needs_review}</dd></div>
          </dl>
        </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quorum Batch Verification Report</title>
    <style>
      :root {
        color-scheme: light;
        --page: #f4f1ea;
        --panel: rgba(255, 252, 247, 0.92);
        --panel-strong: #fffdf9;
        --ink: #1f2933;
        --muted: #66727f;
        --line: rgba(31, 41, 51, 0.12);
        --shadow: 0 20px 50px rgba(74, 57, 39, 0.12);
        --verified: #1f7a4f;
        --verified-soft: #e6f5ec;
        --contradicted: #9f3a2c;
        --contradicted-soft: #fbe9e5;
        --unsupported: #8a6116;
        --unsupported-soft: #fbf1dc;
        --needs-review: #255a8f;
        --needs-review-soft: #e8f1fb;
        --answers: #5a4a2e;
        --answers-soft: #f2e6cf;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(179, 146, 92, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(53, 95, 140, 0.12), transparent 24%),
          linear-gradient(180deg, #f7f4ee 0%, #f1eee7 100%);
      }

      .shell {
        max-width: 1200px;
        margin: 0 auto;
        padding: 40px 24px 72px;
      }

      .hero {
        padding: 32px;
        border: 1px solid rgba(88, 67, 44, 0.1);
        border-radius: 28px;
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.94), rgba(248, 243, 234, 0.88)),
          #fff;
        box-shadow: var(--shadow);
      }

      .eyebrow {
        display: inline-flex;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(31, 41, 51, 0.06);
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1,
      h2 {
        margin: 0;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      h1 {
        margin-top: 18px;
        font-size: clamp(2.3rem, 4vw, 3.7rem);
        line-height: 0.96;
      }

      .hero p {
        max-width: 64ch;
        color: var(--muted);
        line-height: 1.6;
      }

      .hero__meta {
        margin-top: 20px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }

      .hero__meta-card,
      .answer-card {
        padding: 18px 20px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.8);
      }

      .hero__meta-card span,
      .answer-card__index,
      .answer-card__summary dt {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .hero__meta-card strong {
        display: block;
        margin-top: 6px;
        font-size: 1rem;
        line-height: 1.5;
      }

      .summary-grid,
      .answers-grid {
        display: grid;
        gap: 16px;
      }

      .summary-grid {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        margin-top: 28px;
      }

      .answers-grid {
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        margin-top: 24px;
      }

      .summary-card {
        padding: 20px;
        border-radius: 22px;
        border: 1px solid transparent;
        background: var(--panel-strong);
      }

      .summary-card__label {
        display: block;
        color: var(--muted);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .summary-card__value {
        display: block;
        margin-top: 10px;
        font-size: 2.3rem;
        line-height: 1;
      }

      .summary-card--answers {
        border-color: rgba(90, 74, 46, 0.18);
        background: var(--answers-soft);
      }

      .summary-card--verified {
        border-color: rgba(31, 122, 79, 0.18);
        background: var(--verified-soft);
      }

      .summary-card--contradicted {
        border-color: rgba(159, 58, 44, 0.18);
        background: var(--contradicted-soft);
      }

      .summary-card--unsupported {
        border-color: rgba(138, 97, 22, 0.18);
        background: var(--unsupported-soft);
      }

      .summary-card--needs_review {
        border-color: rgba(37, 90, 143, 0.18);
        background: var(--needs-review-soft);
      }

      .answers-section {
        margin-top: 32px;
      }

      .answer-card__header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .answer-card h2 {
        margin-top: 8px;
        font-size: 1.25rem;
        word-break: break-word;
      }

      .status-pill {
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 600;
        white-space: nowrap;
      }

      .status--clear {
        background: var(--verified-soft);
        color: var(--verified);
      }

      .status--matched {
        background: var(--contradicted-soft);
        color: var(--contradicted);
      }

      .answer-card__summary {
        margin: 20px 0 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .answer-card__summary div {
        padding: 14px;
        border-radius: 16px;
        background: #f7f4ee;
      }

      .answer-card__summary dd {
        margin: 6px 0 0;
        font-size: 1.35rem;
        font-weight: 700;
      }

      @media (max-width: 720px) {
        .shell {
          padding-inline: 16px;
        }

        .hero,
        .answer-card {
          padding: 22px;
        }

        .answer-card__header {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="eyebrow">Quorum batch review</span>
        <h1>Batch verification report for review queues</h1>
        <p>
          This report aggregates multiple AI-generated answers against the same approved
          source set so reviewers can spot risky answers quickly before downstream use.
        </p>
        <div class="hero__meta">
          <section class="hero__meta-card">
            <span>Generated</span>
            <strong>${escapeHtml(report.generatedAt)}</strong>
          </section>
          <section class="hero__meta-card">
            <span>Approved sources</span>
            <strong>${report.sourceCount} documents</strong>
          </section>
          <section class="hero__meta-card">
            <span>Fail policy matches</span>
            <strong>${report.summary.answersWithFailures} answers</strong>
          </section>
        </div>
        <div class="summary-grid">
          ${summaryCards}
        </div>
      </section>
      <section class="answers-section">
        <div class="answers-grid">
          ${answerCards}
        </div>
      </section>
    </main>
  </body>
</html>`;
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

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
}

function renderHtmlAssessment(
  assessment: ClaimAssessment,
  index: number,
): string {
  const evidenceBlock =
    assessment.evidence.length === 0
      ? `<div class="evidence-empty">No approved source snippet matched strongly enough for automatic evidence attachment.</div>`
      : `<div class="evidence-list">
          ${assessment.evidence
            .map(
              (evidence) => `
                <article class="evidence">
                  <div class="evidence__meta">
                    <strong>${escapeHtml(evidence.documentTitle)}</strong>
                    <span>${escapeHtml(evidence.documentTrustLevel)} trust</span>
                    <span>score ${evidence.score}</span>
                  </div>
                  <blockquote>${escapeHtml(evidence.quote)}</blockquote>
                </article>`,
            )
            .join("")}
        </div>`;

  return `
    <article class="assessment assessment--${assessment.verdict}">
      <div class="assessment__topline">
        <div class="assessment__title">
          <span class="assessment__index">${index}</span>
          <div>
            <h3>${escapeHtml(assessment.claim.text)}</h3>
          </div>
        </div>
        <span class="badge badge--${assessment.verdict}">${escapeVerdictLabel(assessment.verdict)}</span>
      </div>
      <p class="assessment__reason">${escapeHtml(assessment.reason)}</p>
      ${evidenceBlock}
    </article>`;
}

function renderLegendRow(verdict: ClaimAssessment["verdict"], description: string): string {
  return `
    <div class="legend__row">
      <span class="legend__swatch badge--${verdict}"></span>
      <strong>${escapeVerdictLabel(verdict)}</strong>
      <span>${escapeHtml(description)}</span>
    </div>`;
}

function escapeVerdictLabel(verdict: ClaimAssessment["verdict"]): string {
  return verdict.replace("_", " ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
