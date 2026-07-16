# Reviewer Queue Workflow

Quorum's reviewer handoff is a file-based workflow: verify answers into a
claim-level CSV, let a reviewer fill in the decision columns, then import the
completed CSV to produce queue-ready summaries.

## 1. Create a review packet

Run batch verification with the reviewer CSV and summary CSV artifacts enabled:

```bash
npm run dev -- verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --review-csv-out reports/reviewer-queue.csv \
  --summary-csv-out reports/reviewer-queue-summary.csv
```

The reviewer CSV preserves the answer label and path, normalized answer
preview, model verdict, evidence quote, source ID, and source freshness. The
summary CSV is one row per answer and includes `answer_has_claims`,
`review_status`, and claim-level totals for queue routing.

## 2. Review claim rows

A reviewer fills in `reviewer_verdict` and `reviewer_notes` for each claim.
Leave `reviewer_verdict` empty when the claim still needs a decision. Answers
with no extracted claims are represented by metadata rows with
`answer_has_claims=false`; they are not silently treated as reviewed.

## 3. Import the completed decisions

Import the CSV to produce JSON, Markdown, HTML, and a queue summary CSV:

```bash
npm run dev -- import-review \
  --review-csv reports/reviewer-queue.csv \
  --result-json-out reports/reviewer-queue.json \
  --markdown-out reports/reviewer-queue.md \
  --html-out reports/reviewer-queue.html \
  --summary-csv-out reports/reviewer-queue-final.csv
```

The imported JSON contains `queueSummary` with `totalAnswers`,
`pendingAnswers`, `reviewedAnswers`, and `noClaimsAnswers`. Each answer group
also has `review_status` (`pending`, `reviewed`, or `no_claims`) so a queue
consumer can route rows without recounting claims. The HTML report presents
the same totals for human review, while the CSV keeps stable answer and source
context for downstream handoff.

For a targeted handoff, filter the import at the boundary where it is created:

```bash
npm run dev -- import-review \
  --review-csv reports/reviewer-queue.csv \
  --queue-status pending \
  --result-json-out reports/reviewer-queue-pending.json \
  --summary-csv-out reports/reviewer-queue-pending.csv
```

Use `pending`, `reviewed`, or `no_claims`. The filtered report recalculates its
queue totals, grouped claims, artifacts, and optional `--fail-on` result, so a
downstream reviewer receives only the selected state.

## Benchmark drift alongside reviewer work

Run evaluation separately when the queue also needs benchmark drift context:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --result-json-out reports/evaluation.json \
  --aggregate-summary-csv-out reports/evaluation-summary.csv
```

The result JSON and aggregate summary expose `mismatchCount`; domain summaries
include the same count so a queue or dashboard can flag drift without scanning
every scorecard. Use `--fail-on-mismatch` in CI when any mismatch should block
the workflow.

## Create one queue overview

Use `review-queue` when an operator or dashboard needs reviewer workload and
benchmark drift in one machine-readable handoff:

```bash
npm run dev -- review-queue \
  --review-csv reports/reviewer-queue.csv \
  --fixture-dir examples/evaluations \
  --generated-at 2026-07-15T04:00:00.000Z \
  --json \
  --out reports/reviewer-queue-overview.json \
  --csv-out reports/reviewer-queue-overview.csv
```

The overview includes pending, reviewed, and no-claims answer totals, claim
workload totals, and optional evaluation fixture, mismatch, and score metrics.
It also includes `queueStatus` in JSON and CSV (`null` or an empty CSV value
when unfiltered) so downstream consumers can audit which workload slice the
totals represent.
Add `--queue-status pending`, `--queue-status reviewed`, or
`--queue-status no_claims` to scope the overview to one handoff state. The
claim and answer totals are recalculated for the selected state, while optional
benchmark metrics remain unchanged. Use `--generated-at` when a retryable
workflow needs the JSON and CSV outputs to carry the same audit timestamp.
Add `--domain hr` or `--domain support` (repeatable) when the handoff should
compare queue work with only selected policy domains. The JSON and CSV outputs
echo the applied domain scope, and benchmark counts and drift metrics are
calculated from that same filtered fixture set. A domain filter requires
`--fixture` or `--fixture-dir`; the command rejects a filter that matches no
fixtures so an empty scope cannot look like a healthy queue.
