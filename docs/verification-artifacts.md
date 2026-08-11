# Verification Artifacts

Quorum produces different artifacts for machine verification, human review, and
queue routing. Keep the original answer and approved sources alongside these
outputs: reports explain a verification run, but they do not replace the
approved evidence records.

## Choose an output

| Need | Output | Use it for |
| --- | --- | --- |
| Integrate with a program | JSON | Claims, verdicts, evidence, and source metadata |
| Review a single answer | Markdown or HTML | A readable evidence report |
| Collect reviewer decisions | Reviewer CSV | Claim-level final verdicts and notes |
| Route completed reviews | Imported-review summary | Final verdict rollups and queue status |

## Produce reports

The `verify` command writes a single-answer report. Select a format with the
output flag and send it to a file for a downstream system or reviewer:

```bash
quorum verify \
  --answer examples/answers/support-answer.md \
  --source examples/sources/support-playbook.md \
  --format json \
  --output artifacts/support-report.json
```

For a human-readable handoff, use `--format markdown` or `--format html`. JSON
is the stable integration shape; rendered reports are views of the same
claims, evidence, verdicts, and source metadata.

Batch verification accepts the same report formats and can additionally write
an aggregate summary for queue or dashboard consumers:

```bash
quorum verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --format json \
  --output artifacts/batch-report.json \
  --aggregate-summary-csv-out artifacts/batch-summary.csv
```

## Route reviewer decisions

Export claim-level rows from a report with `review-queue`, fill in the
reviewer verdict and notes, then import the completed CSV:

```bash
quorum review-queue --report artifacts/support-report.json \
  --csv-out artifacts/support-review.csv
quorum import-review --input artifacts/support-review.csv \
  --output artifacts/support-review-summary.json
```

The imported summary is the routing artifact: it preserves the original answer
and source context while exposing reviewer overrides, final verdict counts, and
pending/reviewed status. Treat reviewer CSV files as mutable handoff copies;
retain the original JSON report for audit context.
