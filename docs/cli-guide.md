# Quorum CLI Guide

The README covers the shortest path to a first verification. This guide keeps
the detailed CLI workflows in one place.

## Verify one answer

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --default-trust-level high \
  --out reports/hr-report.json \
  --markdown-out reports/hr-report.md \
  --html-out reports/hr-report.html \
  --review-csv-out reports/hr-review.csv \
  --summary-csv-out reports/hr-summary.csv
```

Answers and sources may be Markdown, text, exported HTML, PDF, or DOCX files.
Use `--answer -` to read an answer from standard input. Use `--json` for the
report-only machine-readable shape, or `--result-json` when the workflow also
needs `shouldFail` and `failVerdicts`.

## Verify a batch

```bash
npm run dev -- verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --review-csv-out reports/batch-review.csv \
  --summary-csv-out reports/batch-summary.csv
```

Repeat `--answer` for a curated set of files, and follow each path with
`--answer-label` when a reviewer-facing queue label is useful. Batch reports
prioritize risky answers and preserve each answer path, label, verdict totals,
primary evidence, source metadata, and fail-policy context.

## Import reviewer decisions

```bash
npm run dev -- import-review \
  --review-csv reports/hr-review.csv \
  --out reports/hr-review-import.json \
  --markdown-out reports/hr-review-import.md \
  --html-out reports/hr-review-import.html \
  --summary-csv-out reports/hr-review-import-summary.csv
```

The import step preserves answer paths and labels, groups claims by answer,
records reviewer overrides and notes, and can apply a final policy with
`--fail-on needs_review`. Reviewer CSV input can also be streamed with
`--review-csv -`.

## Evaluate fixtures

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --domain hr \
  --summary-csv-out reports/evaluation-summary.csv
```

Repeat `--domain` to select multiple domains. Evaluation runs can emit
fixture, domain, and aggregate CSV summaries. CI uses the stricter packaged
gate:

```bash
npm run evaluate:ci
```

## Fail policies

Use one or more `--fail-on` flags to make risky verdicts fail the command with
exit code `2`:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --fail-on contradicted \
  --fail-on unsupported
```

Supported verdicts are `verified`, `contradicted`, `unsupported`, and
`needs_review`. Empty answers that produce no claims are treated as
`needs_review` for policy purposes.

## Inspect the CLI contract

```bash
npm run dev -- --version
npm run dev -- --help
npm run dev -- openapi --out reports/openapi.json
```

For HTTP workflows, see the [HTTP API integration guide](api-integration.md).
