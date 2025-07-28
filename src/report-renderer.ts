import type {
  BatchVerificationReport,
  ClaimAssessment,
  VerificationReport,
} from "./domain.js";

export function renderTextReport(report: VerificationReport): string {
  const lines = [
    "Quorum Verification Report",
    "",
    ...(report.answerPath ? [`Answer: ${report.answerPath}`] : []),
    `Sources: ${report.sources.map((source) => source.title).join(", ")}`,
    `Summary: ${report.summary.verified} verified, ${report.summary.contradicted} contradicted, ${report.summary.unsupported} unsupported, ${report.summary.needs_review} needs review`,
    "",
  ];

  if (report.assessments.length === 0) {
    lines.push("No claims were extracted from this answer.", "");
  }

  for (const assessment of report.assessments) {
    lines.push(...renderTextAssessmentLines(assessment), "");
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
    ...(report.answerPath ? [`- Answer path: \`${report.answerPath}\``] : []),
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

  if (report.assessments.length === 0) {
    lines.push("No claims were extracted from this answer.", "");
  }

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
    "## Answer Reports",
    "",
  ];

  report.answers.forEach((answer, index) => {
    lines.push(
      `### ${index + 1}. ${answer.answerPath}`,
      "",
      `- Fail policy: ${answer.shouldFail ? "matched" : "clear"}`,
      `- Fail verdicts: ${answer.failVerdicts.length > 0 ? answer.failVerdicts.join(", ") : "none"}`,
      `- Verified: ${answer.report.summary.verified}`,
      `- Contradicted: ${answer.report.summary.contradicted}`,
      `- Unsupported: ${answer.report.summary.unsupported}`,
      `- Needs review: ${answer.report.summary.needs_review}`,
      "",
    );

    if (answer.report.assessments.length === 0) {
      lines.push("No claims were extracted from this answer.", "");
      return;
    }

    lines.push("#### Claim Assessments", "");
    answer.report.assessments.forEach((assessment, assessmentIndex) => {
      lines.push(
        ...renderMarkdownAssessment(assessment, assessmentIndex + 1).map((line) =>
          line.startsWith("### ")
            ? line.replace("### ", "##### ")
            : line,
        ),
        "",
      );
    });
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

export function renderReviewerDecisionCsv(report: VerificationReport): string {
  const rows = [
    [
      "answer_path",
      "claim_id",
      "claim_text",
      "model_verdict",
      "model_reason",
      "evidence_titles",
      "evidence_trust_levels",
      "evidence_scores",
      "evidence_quotes",
      "reviewer_verdict",
      "reviewer_notes",
    ],
    ...report.assessments.map((assessment) => [
      report.answerPath ?? "",
      assessment.claim.id,
      assessment.claim.text,
      assessment.verdict,
      assessment.reason,
      assessment.evidence.map((evidence) => evidence.documentTitle).join(" | "),
      assessment.evidence.map((evidence) => evidence.documentTrustLevel).join(" | "),
      assessment.evidence.map((evidence) => evidence.score.toFixed(3)).join(" | "),
      assessment.evidence.map((evidence) => evidence.quote).join(" | "),
      "",
      "",
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function renderBatchReviewerDecisionCsv(report: BatchVerificationReport): string {
  const rows = [
    [
      "answer_path",
      "claim_id",
      "claim_text",
      "model_verdict",
      "model_reason",
      "evidence_titles",
      "evidence_trust_levels",
      "evidence_scores",
      "evidence_quotes",
      "reviewer_verdict",
      "reviewer_notes",
    ],
    ...report.answers.flatMap((answer) =>
      answer.report.assessments.map((assessment) => [
        answer.answerPath,
        assessment.claim.id,
        assessment.claim.text,
        assessment.verdict,
        assessment.reason,
        assessment.evidence.map((evidence) => evidence.documentTitle).join(" | "),
        assessment.evidence.map((evidence) => evidence.documentTrustLevel).join(" | "),
        assessment.evidence.map((evidence) => evidence.score.toFixed(3)).join(" | "),
        assessment.evidence.map((evidence) => evidence.quote).join(" | "),
        "",
        "",
      ]),
    ),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function renderBatchSummaryCsv(report: BatchVerificationReport): string {
  const sourceTitles = report.sources.map((source) => source.title).join(" | ");
  const sourceTrustLevels = report.sources.map((source) => source.trustLevel).join(" | ");
  const sourceUpdatedAt = report.sources.map((source) => source.updatedAt ?? "").join(" | ");
  const rows = [
    [
      "answer_path",
      "total_claims",
      "verified",
      "contradicted",
      "unsupported",
      "needs_review",
      "fail_policy",
      "fail_verdicts",
      "source_titles",
      "source_trust_levels",
      "source_updated_at",
    ],
    ...report.answers.map((answer) => [
      answer.answerPath,
      answer.report.assessments.length.toString(),
      answer.report.summary.verified.toString(),
      answer.report.summary.contradicted.toString(),
      answer.report.summary.unsupported.toString(),
      answer.report.summary.needs_review.toString(),
      answer.shouldFail ? "matched" : "clear",
      answer.failVerdicts.join(" | "),
      sourceTitles,
      sourceTrustLevels,
      sourceUpdatedAt,
    ]),
  ];

  return `${rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n")}\n`;
}

export function renderHtmlReport(report: VerificationReport): string {
  return renderReviewConsoleHtmlReport(report);
}

function renderReviewConsoleHtmlReport(report: VerificationReport): string {
  const selectedAssessment = selectPrimaryAssessment(report.assessments);
  const averageScore = averageEvidenceScore(report.assessments);
  const assessmentRows =
    report.assessments.length === 0
      ? renderReviewConsoleEmptyStateRow()
      : report.assessments
          .map((assessment) =>
            renderReviewConsoleAssessmentRow(
              assessment,
              assessment === selectedAssessment,
            ),
          )
          .join("");
  const sourceItems = report.sources
    .map((source) => {
      const metadata = [`${source.trustLevel} trust`];

      if (source.updatedAt) {
        metadata.push(`updated ${escapeHtml(source.updatedAt)}`);
      }

      return `
                <li class="source-item">
                  <strong>${escapeHtml(source.title)}</strong>
                  <span>${metadata.join(" - ")}</span>
                </li>`;
    })
    .join("");
  const answerPathField = report.answerPath
    ? `
                <div class="field">
                  <span>Answer path</span>
                  <strong>${escapeHtml(report.answerPath)}</strong>
                </div>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quorum Review Console</title>
    <style>
      :root {
        color-scheme: light;
        --app-bg: #eef2f6;
        --nav-bg: #17202b;
        --surface: #ffffff;
        --surface-muted: #f7f9fb;
        --ink: #202833;
        --muted: #637083;
        --line: #d8e0e8;
        --line-strong: #c4ced8;
        --verified: #16835b;
        --verified-bg: #e7f4ee;
        --contradicted: #b23b3b;
        --contradicted-bg: #fae9e9;
        --unsupported: #987018;
        --unsupported-bg: #fbf3df;
        --needs-review: #2d68a5;
        --needs-review-bg: #e7f0fb;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Aptos", "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
        color: var(--ink);
        background: var(--app-bg);
      }

      button,
      input {
        font: inherit;
      }

      .app {
        display: grid;
        grid-template-columns: 228px minmax(0, 1fr);
        min-height: 100vh;
      }

      .rail {
        padding: 18px 14px;
        background: var(--nav-bg);
        color: #dbe4ee;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 6px;
        background: #f1c766;
        color: #161b22;
        font-weight: 800;
      }

      .brand strong {
        font-size: 17px;
      }

      .nav {
        display: grid;
        gap: 4px;
        margin-top: 18px;
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 34px;
        padding: 0 10px;
        border-radius: 6px;
        color: #b6c2d0;
        font-size: 14px;
      }

      .nav-item.active {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.1);
      }

      .nav-item svg,
      .btn svg {
        width: 16px;
        height: 16px;
        flex: none;
      }

      .rail-section {
        margin-top: 28px;
        padding: 0 10px;
      }

      .rail-label {
        margin-bottom: 9px;
        color: #8190a2;
        font-size: 11px;
        text-transform: uppercase;
      }

      .rail-meter {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.11);
      }

      .rail-meter span {
        display: block;
        width: 72%;
        height: 100%;
        background: #62c89b;
      }

      .main {
        min-width: 0;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        height: 64px;
        padding: 0 24px;
        border-bottom: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.92);
      }

      .breadcrumb {
        color: var(--muted);
        font-size: 13px;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .search {
        width: 280px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface-muted);
        color: var(--ink);
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid var(--line-strong);
        border-radius: 6px;
        background: #ffffff;
        color: var(--ink);
        font-size: 13px;
        font-weight: 650;
      }

      .btn.primary {
        border-color: #1f2933;
        background: #1f2933;
        color: #ffffff;
      }

      .workspace {
        padding: 24px;
      }

      .page-title {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 18px;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        font-size: 26px;
        line-height: 1.15;
      }

      .subtitle,
      .small {
        color: var(--muted);
      }

      .subtitle {
        margin-top: 6px;
        font-size: 14px;
      }

      .small {
        font-size: 12px;
        line-height: 1.4;
      }

      .status-strip {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 18px;
      }

      .stat {
        padding: 14px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 1px 1px rgba(29, 40, 52, 0.04);
      }

      .stat span {
        display: block;
        color: var(--muted);
        font-size: 12px;
      }

      .stat strong {
        display: block;
        margin-top: 7px;
        font-size: 24px;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 390px;
        gap: 16px;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--surface);
        box-shadow: 0 1px 2px rgba(29, 40, 52, 0.05);
      }

      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 54px;
        padding: 0 16px;
        border-bottom: 1px solid var(--line);
      }

      .panel-head h2 {
        font-size: 16px;
      }

      .tabs {
        display: flex;
        gap: 6px;
      }

      .tab {
        padding: 6px 10px;
        border-radius: 6px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 650;
      }

      .tab.active {
        background: #e9edf2;
        color: var(--ink);
      }

      .table-wrap {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th {
        height: 38px;
        padding: 0 14px;
        color: var(--muted);
        border-bottom: 1px solid var(--line);
        font-size: 11px;
        text-align: left;
        text-transform: uppercase;
      }

      td {
        padding: 14px;
        border-bottom: 1px solid var(--line);
        font-size: 13px;
        vertical-align: top;
      }

      tr.selected {
        background: #fbfcfe;
      }

      .empty-row td {
        color: var(--muted);
        font-style: italic;
      }

      .claim-text {
        max-width: 470px;
        font-weight: 650;
        line-height: 1.45;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 750;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .pill::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
      }

      .pill--verified {
        background: var(--verified-bg);
        color: var(--verified);
      }

      .pill--contradicted {
        background: var(--contradicted-bg);
        color: var(--contradicted);
      }

      .pill--unsupported {
        background: var(--unsupported-bg);
        color: var(--unsupported);
      }

      .pill--needs_review {
        background: var(--needs-review-bg);
        color: var(--needs-review);
      }

      .drawer {
        position: sticky;
        top: 84px;
      }

      .drawer-body {
        padding: 16px;
      }

      .drawer h3 {
        font-size: 20px;
        line-height: 1.35;
      }

      .evidence-quote {
        margin-top: 12px;
        padding: 14px;
        border: 1px solid var(--line);
        border-left: 3px solid var(--contradicted);
        border-radius: 6px;
        background: #fbfcfd;
        font-size: 13px;
        line-height: 1.55;
      }

      .evidence-quote--verified {
        border-left-color: var(--verified);
      }

      .evidence-quote--unsupported {
        border-left-color: var(--unsupported);
      }

      .evidence-quote--needs_review {
        border-left-color: var(--needs-review);
      }

      .field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
      }

      .field {
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface-muted);
      }

      .field span {
        display: block;
        color: var(--muted);
        font-size: 11px;
      }

      .field strong {
        display: block;
        margin-top: 5px;
        font-size: 13px;
      }

      .decision-box {
        margin-top: 14px;
        padding: 12px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: #ffffff;
      }

      .segmented {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 4px;
        margin-top: 10px;
        padding: 4px;
        border-radius: 6px;
        background: #edf1f5;
      }

      .segmented span {
        padding: 7px 4px;
        border-radius: 4px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }

      .segmented .active {
        background: #ffffff;
        color: var(--ink);
        box-shadow: 0 1px 2px rgba(29, 40, 52, 0.12);
      }

      .source-list {
        display: grid;
        gap: 8px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
      }

      .source-item {
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 6px;
        background: var(--surface-muted);
      }

      .source-item strong,
      .source-item span {
        display: block;
      }

      .source-item span {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
      }

      .answer-panel {
        margin-top: 16px;
      }

      .answer-text {
        max-height: 190px;
        overflow: auto;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.55;
      }

      @media (max-width: 1020px) {
        .app,
        .layout {
          grid-template-columns: 1fr;
        }

        .rail,
        .drawer {
          position: static;
        }

        .status-strip {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <aside class="rail">
        <div class="brand">
          <span class="brand-mark">Q</span>
          <strong>Quorum</strong>
        </div>
        <nav class="nav">
          <div class="nav-item active">${reviewIcon()} Review queue</div>
          <div class="nav-item">${documentIcon()} Sources</div>
          <div class="nav-item">${auditIcon()} Audit log</div>
          <div class="nav-item">${exportIcon()} Exports</div>
        </nav>
        <section class="rail-section">
          <div class="rail-label">Policy corpus</div>
          <div class="small">${report.sources.length} approved documents</div>
          <div style="height: 10px"></div>
          <div class="rail-meter"><span></span></div>
          <div style="height: 8px"></div>
          <div class="small">Reviewer-ready evidence package</div>
        </section>
      </aside>

      <main class="main">
        <header class="topbar">
          <div class="breadcrumb">Quorum / Review queue</div>
          <div class="toolbar">
            <input class="search" value="Current answer review" aria-label="Search" />
            <button class="btn">${filterIcon()} Filter</button>
            <button class="btn primary">${exportIcon()} Export</button>
          </div>
        </header>

        <section class="workspace">
          <div class="page-title">
            <div>
              <h1>Claim review queue</h1>
              <p class="subtitle">Evidence checks before agent answers reach HR and support workflows.</p>
            </div>
            <div class="toolbar">
              <button class="btn">Assign</button>
              <button class="btn primary">Mark reviewed</button>
            </div>
          </div>

          <section class="status-strip">
            <div class="stat"><span>Answers reviewed</span><strong>1</strong></div>
            <div class="stat"><span>Contradicted claims</span><strong>${report.summary.contradicted}</strong></div>
            <div class="stat"><span>Unsupported claims</span><strong>${report.summary.unsupported}</strong></div>
            <div class="stat"><span>Avg evidence score</span><strong>${averageScore}</strong></div>
            <div class="stat"><span>Needs reviewer</span><strong>${report.summary.contradicted + report.summary.unsupported + report.summary.needs_review}</strong></div>
          </section>

          <section class="layout">
            <article class="panel">
              <div class="panel-head">
                <h2>Open claims</h2>
                <div class="tabs">
                  <span class="tab active">High risk</span>
                  <span class="tab">All</span>
                  <span class="tab">Mine</span>
                </div>
              </div>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Verdict</th>
                      <th>Claim</th>
                      <th>Source match</th>
                      <th>Owner</th>
                      <th>SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${assessmentRows}
                  </tbody>
                </table>
              </div>
            </article>

            <aside class="panel drawer">
              ${renderReviewConsoleEvidencePanel(selectedAssessment)}
              <section class="drawer-body answer-panel">
                <h2>Submitted answer</h2>
                <p class="subtitle">Original model output under review.</p>
                ${report.answerPath ? `<div class="field-grid">${answerPathField}</div>` : ""}
                <div class="field answer-text">${escapeHtml(report.answer)}</div>
              </section>
              <section class="drawer-body">
                <h2>Approved sources</h2>
                <ul class="source-list">
                  ${sourceItems}
                </ul>
              </section>
            </aside>
          </section>
        </section>
      </main>
    </div>
  </body>
</html>
`;
}

export function renderBatchHtmlReport(report: BatchVerificationReport): string {
  const sourceList = report.sources
    .map((source) => {
      const metadata = [`${source.trustLevel} trust`];

      if (source.updatedAt) {
        metadata.push(`updated ${escapeHtml(source.updatedAt)}`);
      }

      return `
            <li><strong>${escapeHtml(source.title)}</strong><span>${metadata.join(" - ")}</span></li>`;
    })
    .join("");
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
      const assessmentMarkup =
        answer.report.assessments.length === 0
          ? `<p class="answer-card__empty">No claims were extracted from this answer.</p>`
          : `
            <div class="answer-card__claims">
              ${answer.report.assessments
                .map((assessment) => {
                  const evidence = assessment.evidence[0];
                  const evidenceMarkup = evidence
                    ? `<p class="claim-item__evidence"><strong>${escapeHtml(evidence.documentTitle)}</strong>: ${escapeHtml(evidence.quote)}</p>`
                    : `<p class="claim-item__evidence claim-item__evidence--empty">No approved source snippet matched strongly enough.</p>`;

                  return `
                    <article class="claim-item">
                      <div class="claim-item__header">
                        <span class="claim-pill claim-pill--${assessment.verdict}">${escapeHtml(formatVerdictLabel(assessment.verdict))}</span>
                        <span class="claim-item__score">${evidence ? `score ${evidence.score}` : "no evidence"}</span>
                      </div>
                      <h3>${escapeHtml(assessment.claim.text)}</h3>
                      <p class="claim-item__reason">${escapeHtml(assessment.reason)}</p>
                      ${evidenceMarkup}
                    </article>`;
                })
                .join("")}
            </div>`;

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
            <div><dt>Fail verdicts</dt><dd>${answer.failVerdicts.length > 0 ? escapeHtml(answer.failVerdicts.join(", ")) : "none"}</dd></div>
            <div><dt>Verified</dt><dd>${answer.report.summary.verified}</dd></div>
            <div><dt>Contradicted</dt><dd>${answer.report.summary.contradicted}</dd></div>
            <div><dt>Unsupported</dt><dd>${answer.report.summary.unsupported}</dd></div>
            <div><dt>Needs review</dt><dd>${answer.report.summary.needs_review}</dd></div>
          </dl>
          ${assessmentMarkup}
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
      .source-list,
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

      .source-list {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 24px;
        padding: 0;
        list-style: none;
      }

      .source-list li {
        padding: 16px 18px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.72);
      }

      .source-list strong,
      .source-list span {
        display: block;
      }

      .source-list strong {
        font-size: 1rem;
      }

      .source-list span {
        margin-top: 6px;
        color: var(--muted);
        line-height: 1.5;
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

      .answer-card__empty {
        margin-top: 16px;
        color: var(--muted);
        font-size: 0.95rem;
      }

      .answer-card__claims {
        margin-top: 18px;
        display: grid;
        gap: 12px;
      }

      .claim-item {
        padding: 16px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.7);
      }

      .claim-item__header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .claim-pill {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .claim-pill--verified {
        background: var(--verified-soft);
        color: var(--verified);
      }

      .claim-pill--contradicted {
        background: var(--contradicted-soft);
        color: var(--contradicted);
      }

      .claim-pill--unsupported {
        background: var(--unsupported-soft);
        color: var(--unsupported);
      }

      .claim-pill--needs_review {
        background: var(--needs-review-soft);
        color: var(--needs-review);
      }

      .claim-item__score {
        color: var(--muted);
        font-size: 0.82rem;
      }

      .claim-item h3 {
        margin-top: 12px;
        font-size: 1.05rem;
        line-height: 1.45;
      }

      .claim-item__reason,
      .claim-item__evidence {
        margin: 10px 0 0;
        color: var(--muted);
        line-height: 1.55;
      }

      .claim-item__evidence strong {
        color: var(--ink);
      }

      .claim-item__evidence--empty {
        font-style: italic;
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
        <ul class="source-list">
          ${sourceList}
        </ul>
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

export function renderTextAssessmentLines(assessment: ClaimAssessment): string[] {
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

function formatVerdictLabel(verdict: string): string {
  return verdict.replace("_", " ");
}

function selectPrimaryAssessment(
  assessments: ClaimAssessment[],
): ClaimAssessment | undefined {
  const priority: Record<ClaimAssessment["verdict"], number> = {
    contradicted: 0,
    unsupported: 1,
    needs_review: 2,
    verified: 3,
  };

  return [...assessments].sort(
    (left, right) => priority[left.verdict] - priority[right.verdict],
  )[0];
}

function averageEvidenceScore(assessments: ClaimAssessment[]): string {
  const scores = assessments.flatMap((assessment) =>
    assessment.evidence.map((evidence) => evidence.score),
  );

  if (scores.length === 0) {
    return "0.00";
  }

  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  return average.toFixed(2);
}

function renderReviewConsoleAssessmentRow(
  assessment: ClaimAssessment,
  selected: boolean,
): string {
  const primaryEvidence = assessment.evidence[0];
  const sourceMatch = primaryEvidence
    ? `<strong>${escapeHtml(primaryEvidence.documentTitle)}</strong><div class="small">${escapeHtml(primaryEvidence.documentTrustLevel)} trust - score ${primaryEvidence.score}</div>`
    : `<span class="small">No approved snippet</span>`;

  return `
                    <tr${selected ? ` class="selected"` : ""}>
                      <td><span class="pill pill--${assessment.verdict}">${escapeVerdictLabel(assessment.verdict)}</span></td>
                      <td>
                        <div class="claim-text">${escapeHtml(assessment.claim.text)}</div>
                        <div class="small">Answer review / ${escapeHtml(assessment.claim.id)}</div>
                      </td>
                      <td>${sourceMatch}</td>
                      <td>${escapeHtml(ownerForAssessment(assessment))}</td>
                      <td><strong>${escapeHtml(slaForAssessment(assessment))}</strong></td>
                    </tr>`;
}

function renderReviewConsoleEmptyStateRow(): string {
  return `
                    <tr class="empty-row">
                      <td colspan="5">No claims were extracted from this answer.</td>
                    </tr>`;
}

function renderReviewConsoleEvidencePanel(
  assessment: ClaimAssessment | undefined,
): string {
  if (!assessment) {
    return `
              <div class="panel-head">
                <h2>Evidence detail</h2>
              </div>
              <div class="drawer-body">
                <p class="subtitle">No claims were extracted from this answer.</p>
              </div>`;
  }

  const primaryEvidence = assessment.evidence[0];
  const evidenceQuote = primaryEvidence
    ? `<div class="evidence-quote evidence-quote--${assessment.verdict}">
        <strong>${escapeHtml(primaryEvidence.documentTitle)}</strong><br />
        ${escapeHtml(primaryEvidence.quote)}
      </div>`
    : `<div class="evidence-quote evidence-quote--${assessment.verdict}">
        No approved source snippet matched strongly enough for automatic evidence attachment.
      </div>`;

  const trustLevel = primaryEvidence?.documentTrustLevel ?? "n/a";
  const score = primaryEvidence?.score.toString() ?? "n/a";
  const sourceTitle = primaryEvidence?.documentTitle ?? "No source attached";
  const recommendedDecision = decisionForAssessment(assessment);

  return `
              <div class="panel-head">
                <h2>Evidence detail</h2>
                <span class="pill pill--${assessment.verdict}">${escapeVerdictLabel(assessment.verdict)}</span>
              </div>
              <div class="drawer-body">
                <h3>${escapeHtml(assessment.claim.text)}</h3>
                <p class="subtitle">${escapeHtml(assessment.reason)}</p>
                ${evidenceQuote}
                <div class="field-grid">
                  <div class="field"><span>Trust level</span><strong>${escapeHtml(trustLevel)}</strong></div>
                  <div class="field"><span>Evidence score</span><strong>${escapeHtml(score)}</strong></div>
                  <div class="field"><span>Source</span><strong>${escapeHtml(sourceTitle)}</strong></div>
                  <div class="field"><span>Claim ID</span><strong>${escapeHtml(assessment.claim.id)}</strong></div>
                </div>
                <div class="decision-box">
                  <strong>Reviewer decision</strong>
                  <div class="segmented">
                    <span${recommendedDecision === "Approve" ? ` class="active"` : ""}>Approve</span>
                    <span${recommendedDecision === "Edit" ? ` class="active"` : ""}>Edit</span>
                    <span${recommendedDecision === "Reject" ? ` class="active"` : ""}>Reject</span>
                  </div>
                </div>
              </div>`;
}

function decisionForAssessment(assessment: ClaimAssessment): "Approve" | "Edit" | "Reject" {
  if (assessment.verdict === "verified") {
    return "Approve";
  }

  if (assessment.verdict === "unsupported") {
    return "Reject";
  }

  return "Edit";
}

function ownerForAssessment(assessment: ClaimAssessment): string {
  const evidenceTitle = assessment.evidence[0]?.documentTitle.toLowerCase() ?? "";

  if (evidenceTitle.includes("hr")) {
    return "People Ops";
  }

  if (evidenceTitle.includes("support")) {
    return "Support Ops";
  }

  if (assessment.verdict === "verified") {
    return "Auto";
  }

  return "Reviewer";
}

function slaForAssessment(assessment: ClaimAssessment): string {
  if (assessment.verdict === "contradicted") {
    return "Today";
  }

  if (assessment.verdict === "unsupported") {
    return "1 day";
  }

  if (assessment.verdict === "needs_review") {
    return "2 days";
  }

  return "Closed";
}

function reviewIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
}

function documentIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`;
}

function auditIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-5"/></svg>`;
}

function exportIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`;
}

function filterIcon(): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 3H2l8 9v7l4 2v-9z"/></svg>`;
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
