# Quorum CLI Guide

## Quick start

```bash
git clone https://github.com/nash226/quorum.git
cd quorum
npm install
npm test
npm run build
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --out reports/hr-report.json \
  --markdown-out reports/hr-report.md \
  --html-out reports/hr-report.html \
  --review-csv-out reports/hr-review.csv
```

## Commands

```text
quorum verify --answer <path> (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--fail-on <verdict>]
quorum verify-batch (--answer <path> | --answer-dir <path>)... (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
quorum import-review --review-csv <path> [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
```

`verify` checks one answer against approved sources. `verify-batch` checks a directory or repeated explicit answer paths and can write combined reviewer and queue-summary CSVs. `import-review` reads completed reviewer decisions, preserves answer paths and labels, groups results by answer, and applies `--fail-on` to final reviewer-aware verdicts.

Common options include `--source`, `--source-dir`, `--answer`, `--answer-dir`, `--default-trust-level`, `--json`, `--out`, `--markdown-out`, `--html-out`, `--review-csv-out`, `--summary-csv-out`, and repeated `--fail-on`. A selected fail verdict makes the CLI exit with status `2`.

## Supported inputs and metadata

Answers and approved sources support Markdown/text exports, HTML, PDF, and the formats exposed by `quorum formats`. Source metadata may be supplied in frontmatter:

```markdown
---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
---
```

Source reports preserve `title`, `updatedAt`, and `trustLevel`; sources without a trust level default to `medium`, or use `--default-trust-level`. HTML exports can provide common publish-time metadata and PDF documents can provide embedded title and modification metadata.

## Reports and development

Reports can be printed as text or written as JSON, Markdown, HTML, reviewer-decision CSV, and batch summary CSV. Reviewer exports include answer provenance, previews, evidence titles, trust/freshness metadata, claim verdicts, and reviewer overrides for queue routing and approval handoff.

The repository is organized around `src/claim-extractor.ts`, `src/claim-verifier.ts`, `src/cli.ts`, `src/report-renderer.ts`, `src/source-loader.ts`, `tests/`, and the HR/support examples. Run `npm test` and `npm run build` before submitting changes; CI runs both commands for pushes and pull requests.

See the [roadmap](roadmap.md), [product brief](product-brief.md), [demo notes](demo.md), and [human decision queue](decision-queue.md) for product context and workflow guidance.
