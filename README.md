# Quorum

[![CI](https://github.com/nash226/quorum/actions/workflows/ci.yml/badge.svg)](https://github.com/nash226/quorum/actions/workflows/ci.yml)

Quorum is an evidence gate for enterprise AI agents. It checks AI-generated
business claims against approved company sources before answers reach
customers, employees, tickets, workflows, or downstream systems.

## Why Quorum Exists

AI answers can sound confident while drifting from the policies a business has
approved. Quorum breaks an answer into claims, compares each claim with source
evidence, and returns one of four reviewer-ready verdicts:

- `verified`
- `contradicted`
- `unsupported`
- `needs_review`

The first wedge is HR and customer-support policy verification, where answers
are document-grounded, high-volume, and costly to get wrong.

## Quick Start

```bash
npm install
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --json
```

For a CI gate, fail when risky verdicts appear:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --fail-on contradicted \
  --fail-on unsupported
```

The full CLI workflow, report options, source metadata, reviewer import, and
evaluation commands are in [docs/cli-guide.md](docs/cli-guide.md).

The checked-in 41-fixture benchmark includes HR onboarding, leave-carryover,
benefits-enrollment, remote-work, performance-review, and
expense-reimbursement,
support refunds, data-export, and priority-support reviewer packets that prove
policy claims, surface
contradictions, and route uncertain or unsupported answers for review.
It also covers HR performance-review cadence and promotion claims.
Reviewer queue overviews carry the applied `queueStatus` in JSON and CSV,
making filtered handoffs auditable by downstream consumers.
The packed smoke check also posts a reviewer CSV and fixture to the HTTP
`/review-queue` endpoint, verifying queue totals and benchmark drift together.
Queue consumers can request a targeted `pending`, `reviewed`, or `no_claims`
handoff with the CLI or `/review-queue` API, and the filtered totals remain
auditable in the generated JSON and CSV artifacts.
The benchmark now also covers support service-credit windows, limits, and
unsupported automatic-credit promises.
It now includes a focused HR parental-leave packet that verifies leave duration,
detects a conflicting duration, and routes an unrelated unsupported office-hours claim.
It also covers support account-suspension appeals, distinguishing a conflicting
appeal window, a verified abuse-reinstatement rule, and an unsupported waiver promise.
Claim extraction also retains short standalone policy statements such as
`No refunds.` instead of dropping them when they appear outside a list.
The benchmark now also covers HR payroll-change timing, identity verification,
and unsupported rejected-deposit promises.
It now includes an HR bereavement-leave packet that verifies an immediate-family
entitlement and related carryover claim while routing an unrelated stipend claim as unsupported.
It now also covers HR offboarding, checking final-pay timing and access
deprovisioning while routing an unconditional severance promise as unsupported.
The benchmark now also covers support account recovery, verifying email-change
and unlock controls while flagging an unsafe MFA-reset promise.
It now also covers support plan changes, verifying downgrade access while
flagging a conflicting upgrade window and an unsupported free-month offer.
The benchmark now also covers billing-suspension appeals, verifying the
outstanding-balance condition while routing a premature appeal to review and
flagging an unsupported automatic reinstatement promise.
It now also covers support account-contact changes, verifying the ownership
check while flagging a conflicting verification window and an unrelated
unsupported promise.
It now also covers support incident communications, verifying the published
update cadence while routing a conflicting cadence to review and an unrelated
HR carryover claim as unsupported.
It now also covers HR workplace accommodations, verifying the request channel
while flagging a conflicting response-time promise and an unsupported stipend.
The benchmark now also covers HR time-off requests, verifying the notice rule,
routing conflicting notice and rollover claims for review, and catching an
unsupported stipend claim.
Support escalation coverage now also spans a verified response window, a
conflicting response claim routed for review, and an unsupported
dedicated-engineer promise.
Support data-retention coverage now also verifies the deletion channel, flags a
conflicting completion window, and catches an unsupported recovery promise.
Support delivery-delay coverage now also verifies a status-update window,
flags a conflicting delivery guarantee, and catches an automatic replacement
promise for reviewer follow-up.
Support charge-dispute coverage now also verifies the dispute window, catches a
conflicting deadline, and routes an automatic-reversal promise for review.

## Documentation Map

- [CLI guide](docs/cli-guide.md): local verification, reports, imports, and evaluation.
- [HTTP API integration](docs/api-integration.md): server startup, discovery, requests, and artifacts.
- [Reviewer queue workflow](docs/reviewer-queue.md): reviewer CSV handoff and queue summaries.
- [Evaluation fixture guide](docs/evaluation-fixtures.md): benchmark context, shipped coverage, and adding fixtures.
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

`npm run check` runs the repository verification gate used by CI. It combines
the test suite, TypeScript build, packed-package smoke check, and evaluation
score gate.

The repository is intentionally small:

```text
src/          verifier, CLI, reports, workflow, and HTTP API
tests/        unit, API, CLI, smoke, and fixture coverage
examples/     HR and support answers, sources, and evaluation fixtures
docs/         product, workflow, integration, roadmap, and status context
```

## Product Direction

Quorum is growing from a local verifier toward an evidence layer in front of
enterprise agent workflows. Near-term work is to expand HR and support policy
coverage and choose the durable queue backend and dashboard boundary.

See [docs/roadmap.md](docs/roadmap.md) for the working roadmap. Human sign-off
items use the [decision queue](docs/decision-queue.md).
