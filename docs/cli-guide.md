# CLI Guide

This guide contains the operational detail that used to make the repository
README difficult to scan. It is the primary reference for local CLI workflows.

## Capability Index

This concise index is the source for the generated capability snapshot in
`docs/status.md`. Detailed context and examples remain in this guide and the
linked workflow documents.

- read Markdown, text, HTML, PDF, and DOCX answers and approved sources
- discover approved sources from explicit paths or directories
- load source titles, freshness, trust levels, and durable source IDs
- extract normalized atomic claims, including common exported-answer formats
- classify claims as `verified`, `contradicted`, `unsupported`, or `needs_review`
- preserve reviewer labels, answer context, evidence, and audit timestamps
- render text, JSON, Markdown, HTML, reviewer CSV, and summary CSV artifacts
- write report artifacts atomically for queue watchers
- batch verify answers with explicit empty-answer routing
- import reviewer decisions with pending, reviewed, and no-claims queue states
- export queue summaries and combine reviewer workload with benchmark drift
- run HR and support evaluation fixtures with mismatch and score gates
- expose evaluation scorecards, domain rollups, and aggregate summaries
- serve a local HTTP API for verification, claim previews, reviewer imports, queue overviews, and evaluation
- publish discovery, capabilities, health, readiness, liveness, version, and OpenAPI contracts
- expose request limits, CORS settings, queue statuses, and supported encodings
- support request IDs, method negotiation, ETags, and conditional contract requests
- export stable programmatic API paths, methods, and error response types

## Check the contract version

The CLI exposes the same version used by the HTTP API and generated OpenAPI
contract. Use JSON output when an integration needs a stable probe:

```bash
npm run dev -- version --json
# {"service":"quorum","version":"0.1.0"}
```

The plain `version`, `--version`, and `-v` forms print a human-readable value.

## Verify one answer

Verify an answer against one or more approved sources:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source examples/sources/hr-policy.md \
  --out reports/hr-report.json \
  --markdown-out reports/hr-report.md \
  --html-out reports/hr-report.html \
  --review-csv-out reports/hr-review.csv \
  --summary-csv-out reports/hr-summary.csv
```

Supported answer and source files include Markdown, text, exported HTML, PDF,
and DOCX. Use `--source-dir` for a directory of approved sources and
`--default-trust-level high` when sources do not carry trust metadata.

Use `--json` for the report-only machine-readable shape. Use `--result-json`
or `--result-json-out <path>` when a workflow also needs `shouldFail` and
`failVerdicts`.

Answers can be streamed from stdin:

```bash
cat examples/answers/hr-answer.md | npm run dev -- verify \
  --answer - --source-dir examples/sources --json
```

## Preview claims

Preview normalized claims without loading sources:

```bash
npm run dev -- extract-claims \
  --answer examples/answers/hr-answer.md \
  --result-json
```

The default JSON output remains the claims array. `--result-json` adds the
`answerHasClaims` routing flag, which lets queue integrations identify empty
drafts without recounting claims. `--answer-label` adds a reviewer-facing
label to human-readable output.

## Batch verification

Verify every answer in a directory and produce one reviewer handoff:

```bash
npm run dev -- verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --review-csv-out reports/reviewer-queue.csv \
  --summary-csv-out reports/reviewer-queue-summary.csv
```

Batch summaries include per-answer verdict totals, source context, and
`answer_has_claims`. Empty answers remain explicit queue rows instead of being
silently discarded.

## Import reviewer decisions

After a reviewer fills in `reviewer_verdict` and `reviewer_notes`, import the
CSV into machine-readable and human-facing artifacts:

```bash
npm run dev -- import-review \
  --review-csv reports/reviewer-queue.csv \
  --result-json-out reports/reviewer-queue.json \
  --markdown-out reports/reviewer-queue.md \
  --html-out reports/reviewer-queue.html \
  --summary-csv-out reports/reviewer-queue-final.csv
```

Use `--queue-status pending`, `reviewed`, or `no_claims` for a targeted
handoff. The filtered result recalculates answer groups, claims, queue totals,
artifacts, and optional fail-policy results.

For example, create a pending-only handoff with both machine-readable artifacts:

```bash
npm run dev -- import-review \
  --review-csv reports/reviewer-queue.csv \
  --queue-status pending \
  --result-json-out reports/reviewer-queue-pending.json \
  --summary-csv-out reports/reviewer-queue-pending.csv
```

Use `--queue-summary-csv-out <path>` when a downstream system accepts only a
single CSV row of total, pending, reviewed, and no-claims queue totals.

The full end-to-end handoff, including benchmark drift, is in
[docs/reviewer-queue.md](reviewer-queue.md).

## Evaluation fixtures

Run the checked-in benchmark:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --min-score 0.95 \
  --fail-on-mismatch
```

Useful output options include:

- `--json` or `--result-json-out <path>` for gate-aware scorecards.
- `--markdown-out <path>` and `--html-out <path>` for review and demos.
- `--summary-csv-out <path>` for one row per fixture.
- `--domain-summary-csv-out <path>` for one row per domain.
- `--aggregate-summary-csv-out <path>` for one overall benchmark row.
- `--domain hr` or `--domain support` to run selected policy domains. Repeat
  the flag to include more than one domain.

When a domain filter is supplied, Quorum excludes fixtures from other domains
before calculating scorecards, mismatch counts, and aggregate totals. This is
useful when a team owns only one policy area and wants a focused gate:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --domain support \
  --min-score 0.95 \
  --fail-on-mismatch \
  --aggregate-summary-csv-out reports/support-evaluation.csv
```

The resulting aggregate CSV describes the selected support fixtures only; it
does not represent the full HR-and-support benchmark. Omit `--domain` for the
repository-wide gate used by CI.

Fixture context and the process for adding coverage live in
[docs/evaluation-fixtures.md](evaluation-fixtures.md).

## Source metadata and stable identity

Source frontmatter can provide `title`, `updatedAt`, and `trustLevel`:

```markdown
---
title: HR Benefits Policy
updatedAt: 2026-06-15
trustLevel: high
---
```

When an upstream system already has durable document IDs, preserve them for
audit references:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source examples/sources/hr-policy.md \
  --source-id people-ops/hr-policy@2026-07-14 \
  --json
```

The API requires unique `sources[].id` values. Explicit CLI sources accept
`--source-id`; directory sources retain positional fallback IDs.

Report-producing workflows accept `--generated-at <timestamp>` so retries can
reuse one audit timestamp across JSON, text, Markdown, HTML, and CSV output.

## Fail-policy gates

Select risky verdicts with repeated `--fail-on` flags:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --fail-on contradicted \
  --fail-on unsupported
```

Use `--fail-on needs_review` when an answer must not continue without human
review. This also treats an answer with no extracted claims as a review-policy
failure, so empty or unparseable handoffs cannot silently pass a gate:

```bash
npm run dev -- verify \
  --answer examples/answers/empty-answer.md \
  --source-dir examples/sources \
  --fail-on needs_review
```

When a selected verdict appears, the CLI exits with status code `2`. The same
decision is available as `shouldFail` and `failVerdicts` in result JSON.

## Commands at a glance

Use `quorum --help` for the top-level command list. Every command also accepts
`--help` (or `-h`) and prints its usage without reading input files or starting
the server, which makes the flag safe for install and integration probes.

| Command | Purpose |
| --- | --- |
| `verify` | Verify one answer and render reports. |
| `verify-batch` | Verify a directory of answers and create a reviewer CSV. |
| `extract-claims` | Preview normalized claims before verification. |
| `import-review` | Import reviewer decisions and create queue artifacts. |
| `review-queue` | Combine reviewer workload with optional benchmark drift. |
| `evaluate` | Run checked-in evaluation fixtures and scorecards. |
| `serve` | Start the local HTTP API. |
| `openapi` | Export the generated OpenAPI contract. |
| `version` | Print the CLI and API contract version. |

For HTTP usage, use [docs/api-integration.md](api-integration.md) rather than
duplicating API payloads in this guide.
