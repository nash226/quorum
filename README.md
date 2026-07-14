# Quorum

[![CI](https://github.com/nash226/quorum/actions/workflows/ci.yml/badge.svg)](https://github.com/nash226/quorum/actions/workflows/ci.yml)

Quorum is an evidence gate for enterprise AI agents. It checks AI-generated
business claims against approved company sources before they reach customers,
employees, tickets, workflows, or downstream systems.

## Why Quorum Exists

AI answers can sound confident while drifting from approved company knowledge.
Quorum breaks an answer into claims, checks each claim against trusted sources,
and produces a reviewer-ready evidence report.

Claims are labeled `verified`, `contradicted`, `unsupported`, or
`needs_review`. The goal is to help reviewers make safer decisions, not to
replace them.

## Demo

<a href="docs/assets/quorum-demo.mp4">
  <img src="docs/assets/quorum-demo-poster.png" alt="Watch the Quorum demo video" width="100%">
</a>

[Watch the Quorum demo](docs/assets/quorum-demo.mp4) · [Read the demo walkthrough](docs/demo.md)

## What It Does

- Verifies one answer or a batch of answers against approved Markdown, text,
  HTML, PDF, or DOCX sources.
- Preserves source metadata and stable source IDs for audit trails.
- Produces text, JSON, Markdown, HTML, reviewer CSV, and summary CSV reports.
- Imports reviewer decisions and applies configurable fail policies.
- Runs evaluation fixtures and scorecards for HR and support policy domains.
- Serves a lightweight HTTP API with an OpenAPI contract for workflow clients.

## Quick Start

```bash
npm install

npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --json
```

For a reviewer handoff, add `--markdown-out`, `--html-out`, or
`--review-csv-out`. To block a workflow when risky verdicts appear, add
`--fail-on contradicted` or `--fail-on unsupported`.

Preview normalized claims without loading sources:

```bash
npm run dev -- extract-claims --answer examples/answers/hr-answer.md --json
```

## Documentation

- [CLI guide](docs/cli-guide.md) — commands, reports, reviewer imports, and evaluations
- [HTTP API integration](docs/api-integration.md) — local service, requests, artifacts, and OpenAPI
- [Demo walkthrough](docs/demo.md) — the end-to-end product story
- [Product brief](docs/product-brief.md) — problem, users, and initial wedge
- [Roadmap](docs/roadmap.md) — current priorities and next steps
- [Project status](docs/status.md) — generated capability snapshot
- [Decision queue](docs/decision-queue.md) — process for product and operational decisions

## Development

```bash
npm test
npm run build
npm run smoke
npm run evaluate:ci
```

See [AGENTS.md](AGENTS.md) for contribution and verification guidelines.
