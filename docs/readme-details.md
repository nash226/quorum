# README Details

This page keeps the practical information moved out of the short project README.

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

## CLI and reports

Use `verify` for one answer, `verify-batch` for a directory or repeated answer paths, and `import-review` for completed reviewer decisions. Reports can be printed as text or written as JSON, Markdown, HTML, reviewer-decision CSV, and batch summary CSV. Reviewer exports preserve answer paths and labels, evidence titles, trust/freshness metadata, claim verdicts, and reviewer overrides.

Common options include `--source`, `--source-dir`, `--answer`, `--answer-dir`, `--default-trust-level`, `--json`, `--out`, `--markdown-out`, `--html-out`, `--review-csv-out`, `--summary-csv-out`, and repeated `--fail-on`. A selected fail verdict makes the CLI exit with status `2`.

## Inputs and metadata

Answers and approved sources support Markdown/text exports, HTML, PDF, and the formats exposed by `quorum formats`. Source metadata may be supplied in frontmatter:

```markdown
---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
---
```

Reports preserve `title`, `updatedAt`, and `trustLevel`; sources without a trust level default to `medium`, or use `--default-trust-level`. HTML exports can provide publish-time metadata and PDF documents can provide embedded title and modification metadata.

## Development and direction

The main code lives in `src/`, with tests in `tests/` and HR/support examples in `examples/`. Run `npm test` and `npm run build` before submitting changes; CI runs both commands for pushes and pull requests.

See the [CLI guide](cli-guide.md), [roadmap](roadmap.md), [product brief](product-brief.md), [demo notes](demo.md), and [human decision queue](decision-queue.md) for deeper product and workflow context.
