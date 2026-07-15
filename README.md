# Quorum

[![CI](https://github.com/nash226/quorum/actions/workflows/ci.yml/badge.svg)](https://github.com/nash226/quorum/actions/workflows/ci.yml)

Quorum is an evidence gate for enterprise AI agents. It checks AI-generated
business claims against approved company sources before answers reach
customers, employees, tickets, workflows, or downstream systems.

## Why Quorum Exists

AI answers can sound confident while drifting from approved policy. Quorum
breaks an answer into claims, compares each claim with source evidence, and
returns reviewer-ready `verified`, `contradicted`, `unsupported`, or
`needs_review` verdicts. The first wedge is HR and customer-support policy
verification, where grounded answers are high-volume and costly to get wrong.

## Quick Start

```bash
npm install
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --json
```

For a CI gate, add `--fail-on contradicted --fail-on unsupported`.

The full CLI workflow, report options, source metadata, reviewer import, and
evaluation commands are in [docs/cli-guide.md](docs/cli-guide.md).

The checked-in 58-fixture benchmark spans HR and support workflows, including
leave, onboarding, payroll, accommodations, refunds, account security, billing,
delivery, service levels, and gift cards. Each packet exercises reviewer-facing
verdict routing against approved Markdown, HTML, PDF, or directory-backed
sources. See the [evaluation fixture guide](docs/evaluation-fixtures.md) for
the current coverage inventory and extension workflow.

The support benchmark now has direct regression coverage for plan changes,
including billing eligibility, conflicting upgrade timing, and unsupported
automatic-upgrade claims.

That plan-change packet is evaluated through the same CI mismatch gate as the
rest of the 58-fixture benchmark, so a changed support policy verdict blocks
the build instead of silently changing reviewer output.

Reviewer queue overviews carry the applied `queueStatus` in JSON and CSV, and
the packed smoke check posts reviewer artifacts to `/review-queue` to verify
queue totals and benchmark drift together. The CLI and HTTP API support targeted
`pending`, `reviewed`, and `no_claims` handoffs with auditable filtered totals.

## Documentation Map

- [CLI guide](docs/cli-guide.md): local verification, reports, imports, and evaluation.
- [HTTP API integration](docs/api-integration.md): server startup, discovery, requests, and artifacts.
- [Programmatic API](docs/programmatic-api.md): embed verification in Node.js workflows.
- [Reviewer queue workflow](docs/reviewer-queue.md): reviewer CSV handoff and queue summaries.
- [Evaluation fixture guide](docs/evaluation-fixtures.md): benchmark context and adding fixtures.
- [API deployment guide](docs/api-deployment.md): network boundary, limits, and durable source identity.
- [Demo workflow](docs/demo.md): a click-through product demonstration.
- [Roadmap](docs/roadmap.md): current product priorities and open direction.
- [Status](docs/status.md): generated snapshot of shipped behavior and recent changes.
- [Product brief](docs/product-brief.md): problem, initial user, and product principles.

## Demo Video

<a href="docs/assets/quorum-demo.mp4">
  <img src="docs/assets/quorum-demo-poster.png" alt="Watch the Quorum demo video" width="100%">
</a>

[Watch or download the Quorum demo video](docs/assets/quorum-demo.mp4)

## Development

```bash
npm test
npm run build
npm run smoke
npm run evaluate:ci
```

`npm run check` runs the repository verification gate used by CI.

```text
src/          verifier, CLI, reports, workflow, and HTTP API
tests/        unit, API, CLI, smoke, and fixture coverage
examples/     HR and support answers, sources, and evaluation fixtures
docs/         product, workflow, integration, and status context
```

Quorum is growing from a local verifier toward an evidence layer in front of
enterprise agent workflows. Near-term work is to expand HR and support policy
coverage and choose the durable queue backend and dashboard boundary.

See [docs/roadmap.md](docs/roadmap.md) for the working roadmap. Human sign-off
items use the [decision queue](docs/decision-queue.md).
