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

The checked-in 73-fixture benchmark spans 24 HR and 49 support workflows, including
leave, onboarding, payroll, accommodations, refunds, refund status, account
security, billing, tax exemption, delivery, service levels, gift cards, and accessibility requests. Each packet exercises reviewer-facing
verdict routing against approved Markdown, HTML, PDF, or directory-backed
sources. See the [evaluation fixture guide](docs/evaluation-fixtures.md) for
the current coverage inventory and extension workflow.
Regression tests verify the total and HR/support split so adding a fixture keeps
this product snapshot and the [fixture guide](docs/evaluation-fixtures.md)
accurate.
The support benchmark now also covers holiday service hours, preserving the
published chat schedule while catching an unconditional coverage promise. The
packed smoke check asserts that this evaluation remains in the generated report.
The benchmark inventory also verifies that every approved source ID is unique,
so evidence references remain unambiguous across the full packet set.
The packed smoke check also verifies priority-support answers, preserving the
14-day response commitment while catching a conflicting 30-day promise and an
unsupported dedicated-account-manager claim.
The packed smoke check also verifies usage-limits answers, preserving the
standard request limit while routing broad increase claims to review and
flagging unsupported automatic increases.
The packed smoke check also verifies support return answers, preserving the
30-day eligibility rule while catching a conflicting 45-day window and routing
an inspection-exception claim for review.
It also verifies support service-credit answers in the packed benchmark,
preserving the approved credit limit while catching a request-window conflict
and an unsupported outage compensation promise.
The packed smoke check also verifies support refund answers, preserving the
approved refund paths while catching a conflicting annual-plan window and an
unsupported automatic-credit promise.

The packed smoke check also verifies that tax-exemption answers appear in the
benchmark report, covering certificate submission, review timing, and an
unsupported enterprise-upgrade promise.

The packed smoke check also verifies that support data-export answers appear in
the benchmark report, preserving the approved request path while catching
timing drift and unsupported manager-notification claims.
It also verifies that support subscription-pause answers appear in the packed
benchmark report, preserving billing eligibility and catching unsupported
automatic-resumption claims.
The packed smoke check also verifies support guest-access answers, preserving
the workspace-owner invitation control while catching an incorrect access
duration and an unsupported automatic member-conversion promise.
It also checks the generated summary CSV for the same three-claim verdict
breakdown, keeping the machine-readable benchmark artifact aligned with the
reviewer-facing report.
The packed smoke check also verifies payment-method answers, preserving the
account-owner control while catching a stale invoice-window claim and an
unsupported automatic-refund promise.

The support benchmark now also covers authorized-contact answers, preserving
the account-owner confirmation control before account discussions while
flagging an unsafe no-confirmation billing-contact promise.

The benchmark inventory is currently reconciled at 73 fixtures, including the
shipped HR travel-reimbursement coverage described below.

The HR benchmark now includes medical-leave coverage for matched sick-day and
manager-notification claims alongside an unsupported unlimited-leave promise.

The packed smoke check also verifies HR benefits-enrollment answers, preserving
the approved dental enrollment window while catching conflicting health-coverage
timing and an unsupported home-office stipend.

The HR benchmark now directly regression-tests bereavement leave, preserving
paid-leave and vacation-carryover verification while routing an unsupported
home-office stipend claim for review.

The HR benchmark now also covers relocation reimbursement, including an
approved request path, a reimbursement-limit review, and an unsupported
home-sale promise.

The HR benchmark now also covers jury-duty leave, including a verified paid-leave
allowance, a contradicted duration, and an unsupported meal-stipend promise.

The HR benchmark now also covers dependent-benefits eligibility, including
qualifying-event timing and unsupported undocumented-dependent claims.

The HR benchmark now also covers tuition reimbursement, including an approved
annual limit, a contradicted submission deadline, and an unsupported tutoring promise.

The HR benchmark now also covers travel reimbursement, including a verified
annual limit, a contradicted submission window, and a business-class claim routed to review.
The packed smoke check also verifies the HR compensation review packet, including
the annual review cadence, a conflicting eligibility window, and an unsupported
airport-shuttle claim.

The support benchmark now has direct regression coverage for plan changes,
including billing eligibility, conflicting upgrade timing, and unsupported
automatic-upgrade claims.

The support benchmark also verifies account-merge answers against ownership
controls, completion timing, and unsupported service promises.
The support benchmark also covers authentication-device approval against a
trusted-email control while flagging unsupported hardware-key promises.
The support benchmark includes payment-failure coverage for retry promises and
verification-sensitive card updates, keeping billing claims reviewer-visible.
It now also covers service-outage answers, including update-cadence drift,
blanket-refund promises, and incident-status confirmation.
Shipping address-change answers are also regression-tested for the pre-shipment
control, conflicting timing windows, and unsupported insurance promises.
The packed smoke check also verifies warranty answers for the 12-month claim window,
conflicting 24-month eligibility, and unsupported automatic replacement promises.
It also confirms that the gift-card evaluation is included in the packed benchmark
report alongside the other support policy workflows.
The packed smoke check also verifies accessibility-request answers against the
approved request channel while preserving unsupported priority-service claims.
It also verifies that delivery-delay answers are present in the packed benchmark,
covering status-update timing, a conflicting delivery guarantee, and an
unsupported automatic replacement promise.
The support benchmark also directly regression-tests data-retention answers,
covering the approved deletion path, a conflicting completion window, and an
unsupported recovery promise.
The packed smoke check also verifies that this data-retention evaluation is
present in the generated benchmark report.
The packed smoke check also verifies that account-suspension answers remain in
the benchmark report, covering appeal eligibility, an abuse-related
reinstatement contradiction, and an unsupported reinstatement promise.
It also verifies account-closure answers, preserving the verified closure
path while routing retention and reactivation timing claims for review.
The packed smoke check also verifies account-recovery answers against the
email-verification and unlock-timing controls while preserving the
multi-factor-reset claim for reviewer review.
It also verifies charge-dispute answers, covering the approved dispute window,
a documentation conflict, and an unsupported automatic-credit promise.
The packed smoke check also verifies billing-address answers, preserving the
account-owner verification control while catching an incorrect one-hour timing
claim and an unsupported password-manager promise.
The packed smoke check also verifies order-cancellation answers, preserving the
two-hour unshipped-order window while routing post-shipment cancellation and
automatic-refund promises for review.
It also verifies subscription-renewal answers, preserving the self-service
renewal window while catching a conflicting post-expiration claim and an
unsupported automatic-renewal promise.
The packed smoke check also verifies invoice-correction answers, preserving
the reporting window while catching a conflicting deadline and unsupported
automatic-refund promise.

The packed smoke check also verifies refund-status answers, preserving the
approved status-update and processing-window claims while routing an
unsupported instant-refund promise for review.

It also verifies account-contact-change answers in the packed benchmark,
covering current-email verification, a conflicting identity-verification
window, and an unsupported password-manager promise.
The packed smoke check also confirms order-tracking answers preserve the verified
tracking-history claim while routing delivery guarantees and automatic refunds to
review or unsupported verdicts.
The packed smoke check now explicitly asserts that workspace-access answers
appear in the benchmark report, preserving the workspace-owner invitation
control while catching an incorrect acceptance window and an unsupported
automatic-admin promise.

Evaluation fixtures now reject duplicate source IDs, keeping evidence
attribution unambiguous when a packet includes multiple approved records.

Reviewer queue overviews carry the applied `queueStatus` in JSON and CSV, and
the packed smoke check posts reviewer artifacts to `/review-queue` to verify
queue totals and benchmark drift together, including pending, reviewed, and
no-claims handoffs. The CLI and HTTP API support targeted
`pending`, `reviewed`, and `no_claims` handoffs with auditable filtered totals.
Queue overviews can also scope benchmark drift to selected policy domains, and
the CLI/API echo that scope while rejecting filters that match no fixtures.
Queue overviews also expose final `verified`, `contradicted`, `unsupported`,
and `needs_review` claim counts so dashboard consumers can prioritize review
work without recounting individual claims. The human-readable
`review-queue` CLI summary now prints the same verdict breakdown alongside
reviewer workload and benchmark drift.
The same queue command can scope benchmark drift to one or more policy
domains, keeping a focused reviewer handoff from mixing HR and support totals.
The HTTP `/review-queue` response now also echoes the applied domain scope (or
an empty array when unfiltered), so queue and dashboard consumers can audit
which benchmark slice their totals represent.
Imported reviewer Markdown and HTML handoffs now display the same `generatedAt`
timestamp already carried by JSON and queue-summary CSV artifacts, making
multi-format review packets easier to reconcile.

Evaluation runs can now be scoped to one or more policy domains with repeated
`--domain` flags; filtered scorecards and aggregate CSVs describe only the
selected fixtures, while the CI command remains the repository-wide gate.

For a focused local scorecard, pass one or more domains to the evaluator:

```bash
npm run dev -- evaluate --fixture-dir examples/evaluations \
  --domain hr --domain support --min-score 0.95 --fail-on-mismatch
```

This keeps domain-specific review work small while preserving the full
benchmark check used by CI.

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
