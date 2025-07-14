# Quorum

[![CI](https://github.com/nash226/quorum/actions/workflows/ci.yml/badge.svg)](https://github.com/nash226/quorum/actions/workflows/ci.yml)

Quorum is an evidence gate for enterprise AI agents.

It checks AI-generated business claims against approved company sources before
those claims reach customers, employees, tickets, workflows, or downstream
systems.

## Why Quorum Exists

Enterprise teams are moving from AI experiments to agents that answer policy,
support, HR, product, and operations questions. Those answers often sound
confident even when they drift from approved company knowledge.

Quorum focuses on a narrow but high-value problem:

> Given an AI-generated answer and approved source documents, identify which
> claims are supported, contradicted, unsupported, or need human review.

The goal is not to replace reviewers. The goal is to give reviewers a clear,
auditable evidence report before an agent response becomes a business action.

## What It Does

The current CLI can:

- read an AI-generated answer from a Markdown or text file
- batch verify multiple AI-generated answers from a directory
- read one or more approved Markdown, text, or exported HTML source documents
- read one or more approved Markdown, text, exported HTML, or PDF source documents
- load source metadata such as `title`, `updatedAt`, and `trustLevel`
- override the default trust level for sources that do not include metadata
- split the answer into atomic claims
- compare each claim against approved source snippets
- label each claim as `verified`, `contradicted`, `unsupported`, or
  `needs_review`
- print a human-readable report
- write a JSON report for workflow automation
- write a Markdown reviewer report for approvals and handoff
- write a polished HTML reviewer report for demos and human review
- write a reviewer decision CSV that teams can fill in claim by claim
- import filled reviewer decision CSVs into a machine-readable summary
- fail a CI job when selected risky verdicts appear

## Example

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --default-trust-level high \
  --out reports/hr-report.json \
  --markdown-out reports/hr-report.md \
  --html-out reports/hr-report.html \
  --review-csv-out reports/hr-review.csv
```

Example output:

```text
Quorum Verification Report

Sources: HR Benefits Policy, Customer Support Playbook
Summary: 1 verified, 1 contradicted, 1 unsupported, 0 needs review

CONTRADICTED  Employees receive 18 weeks of paid parental leave.
Reason: A closely matching approved source uses different numeric terms.
Evidence (HR Benefits Policy, high trust, score 0.857):
  Employees receive 12 weeks of paid parental leave.
```

For CI-style blocking:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --fail-on contradicted \
  --fail-on unsupported
```

When a selected verdict is present, Quorum exits with status code `2`.

To import a filled reviewer decision CSV:

```bash
npm run dev -- import-review \
  --review-csv reports/hr-review.csv \
  --out reports/hr-review-import.json
```

To verify a directory of answers against the same approved source set:

```bash
npm run dev -- verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --out reports/batch-report.json \
  --markdown-out reports/batch-report.md \
  --html-out reports/batch-report.html \
  --fail-on contradicted
```

## Quick Start

```bash
git clone https://github.com/nash226/quorum.git
cd quorum
npm install
npm test
npm run build
npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv
```

## Source Metadata

Source files may include optional frontmatter metadata:

```markdown
---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
---
```

Quorum includes this metadata in reports so reviewers can see which approved
source supported or contradicted each claim. `trustLevel` accepts `high`,
`medium`, or `low` and helps Quorum prefer stronger approved sources when
multiple passages are similarly relevant. Sources without a trust level default
to `medium`.

When approved sources do not yet include frontmatter, the CLI can override that
default during verification:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --default-trust-level high
```

## CLI Usage

```text
quorum verify --answer <path> (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--fail-on <verdict>]
quorum verify-batch --answer-dir <path> (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--fail-on <verdict>]
quorum import-review --review-csv <path> [--json] [--out <path>]
```

Options:

- `--answer <path>`: AI-generated answer to verify
- `--source <path>`: approved source document; may be repeated
- `--source-dir <path>`: directory of approved source documents
- `--answer-dir <path>`: directory of AI-generated answers for batch verification
- `--default-trust-level <level>`: use `high`, `medium`, or `low` for sources
  that do not define `trustLevel` metadata
- `--json`: print the full JSON report
- `--out <path>`: write the JSON report to disk
- `--markdown-out <path>`: write a reviewer-friendly Markdown report to disk
- `--html-out <path>`: write a styled HTML reviewer report to disk
- `verify-batch --markdown-out <path>`: write a batch summary in Markdown for review queues
- `verify-batch --html-out <path>`: write a styled batch summary in HTML for demos and reviewers
- `--review-csv-out <path>`: write a CSV template for reviewer verdicts and notes
- `--fail-on <verdict>`: exit with code `2` when that verdict appears; may be
  repeated
- `import-review --review-csv <path>`: import a filled reviewer decision CSV and
  summarize final verdicts plus reviewer overrides
- `import-review --out <path>`: write the imported reviewer decision summary as
  JSON

Supported source extensions today:

- `.md`
- `.markdown`
- `.txt`
- `.html`
- `.htm`
- `.pdf`

## Project Structure

```text
src/
  claim-extractor.ts   answer-to-claim extraction
  claim-verifier.ts    evidence matching and verdict logic
  cli.ts               command-line interface
  report-renderer.ts   text, markdown, HTML, and CSV report rendering
  report-policy.ts     fail-on verdict policy
  source-loader.ts     source metadata and HTML loading
tests/                 unit and fixture coverage
examples/              HR and support demo inputs
docs/                  product notes, demo, roadmap, decision queue
```

## Development

```bash
npm test
npm run build
```

The CI workflow runs both commands on pushes and pull requests.

## Product Direction

The first wedge is HR and customer-support policy verification. These workflows
are document-grounded, high-volume, and risky when AI answers drift from
approved sources.

Near-term work:

- evaluation harness for labeled verdict examples
- richer batch verification exports and workflow hooks
- better claim extraction for bullets, lists, and compound sentences
- API surface for agent integrations

See [docs/roadmap.md](docs/roadmap.md) for the working roadmap and
[docs/product-brief.md](docs/product-brief.md) for the product brief. For an
auto-updated snapshot of what has shipped on `main`, see
[docs/status.md](docs/status.md).

## Human Decision Queue

Automation uses GitHub issues labeled `needs-human-decision` when it needs
product judgment, credentials, paid services, or other human sign-off.

Review the queue here:

https://github.com/nash226/quorum/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-human-decision

See [docs/decision-queue.md](docs/decision-queue.md) for the workflow.

## Status

Quorum is an early MVP. It is intentionally small, deterministic, and easy to
inspect while the product direction is still being validated.
