# Quorum CLI Guide

Quorum verifies AI-generated answers against approved source documents and
exports reviewer-ready evidence. This guide covers the installed-package
workflow; run `npm run dev -- ...` instead of `quorum ...` while developing
from a checkout.

## Capability Index

- `verify`: compare one AI-generated answer with approved sources.
- `verify-batch`: compare multiple answers with one approved source set.
- `import-review`: apply reviewer decisions and produce queue-ready summaries.
- `formats`: inspect supported answer and source extensions.
- `extract-claims`: preview normalized claims before evidence matching.
- `evaluate`: run domain scorecards against checked-in fixtures.
- `review-queue`: summarize reviewer workload and benchmark drift.
- `serve`: start the local HTTP API for agent integrations.
- `openapi`: export the local API contract.
- `version`: probe the CLI/API contract version.

## Verify one answer

```bash
quorum verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --out reports/hr-report.json \
  --html-out reports/hr-report.html \
  --review-csv-out reports/hr-review.csv \
  --fail-on contradicted --fail-on unsupported
```

Use `--source` more than once for a curated source set. Use `--answer -` to
read an answer from standard input. A selected fail policy makes the command
exit with status `2` when a risky verdict is present.

## Verify a batch

```bash
quorum verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --out reports/batch-report.json \
  --review-csv-out reports/batch-review.csv \
  --summary-csv-out reports/batch-summary.csv
```

Repeat `--answer <path>` when the batch is a curated list, and add
`--answer-label <label>` after an explicit answer when reviewers need a
business-facing name. `--answer-dir` may be combined with explicit answers;
explicit paths remain ordered before discovered files.

## Complete a review

Open the generated reviewer CSV, fill in the reviewer verdict and notes, then
import it:

```bash
quorum import-review \
  --review-csv reports/batch-review.csv \
  --out reports/review-import.json \
  --markdown-out reports/review-import.md \
  --summary-csv-out reports/review-import-summary.csv \
  --fail-on needs_review
```

The JSON output groups imported claims by answer. The summary CSV has one row
per answer for queue routing; both preserve the original answer path and
reviewer-facing label.

## Inspect the contract

Use command help before preparing inputs:

```bash
quorum --help
quorum verify --help
quorum formats --json
quorum version --json
```

`formats --json` is the source of truth for supported answer and source
extensions. `version --json` returns the stable CLI/API contract version for
integration health checks. The same commands are available as npm wrappers:
`npm run formats -- --json` and `npm run version -- --json`.

## Local API and validation

Start the local API with `quorum serve`; export its OpenAPI document with
`quorum openapi`. Before opening a PR or publishing a package, run:

```bash
npm test
npm run build
npm run check
```

The check command also runs the CLI, packaged-artifact, API, and evaluation
smoke checks.
