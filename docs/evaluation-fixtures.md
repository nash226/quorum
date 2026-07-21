# Evaluation Fixture Guide

Evaluation fixtures are checked-in examples of business answers and approved
sources. They make verifier behavior reviewable, protect against regressions,
and provide a scorecard that CI can gate.

## What a fixture proves

Each fixture declares expected claim-level verdicts. The current HR and support
set covers:

- verified, contradicted, unsupported, and needs-review outcomes
- Markdown, HTML, PDF, and source-directory ingestion
- empty-answer queue routing
- explicit source IDs and inline source metadata
- HR bonus eligibility, bereavement leave, dependent benefits, medical leave, relocation, leave, leave carryover, onboarding, offboarding, parental leave, professional
  development, compensation review, benefits enrollment, performance review,
  employee referrals, jury duty,
  remote work, workplace accommodations, expense reimbursement, tuition reimbursement, and travel reimbursement
- support account closure, account recovery, account contact changes, account security, account suspension, authorized contacts, billing address changes, billing-suspension appeals, cancellation, guest access, invoice correction, data retention, escalation, incident communication, live chat, order tracking, password
  reset, refunds, charge disputes, delivery delays, data export, payment method
  changes, replacement, workspace access, and tax exemption
  eligibility, subscription pauses, SLA, billing, gift cards, service credits, shipping protection,
  warranty claims, usage limits, subscription renewals, and source-directory workflows
- priority support response-time and unsupported-account-management claims
- phone-support availability, callback timing, and unsupported universal-access claims

The benchmark currently contains 77 fixtures: 27 HR and 50 support workflows.
The generated
[status page](status.md) records the current inventory and recently shipped
changes; this guide records why the fixtures exist and how to extend them.

## Fixture shape

A file-backed fixture usually looks like this:

```json
{
  "name": "Support policy example",
  "domain": "support",
  "answerPath": "../../answers/support-answer.md",
  "sourcePaths": ["../../sources/support-playbook.md"],
  "expectedSummary": {
    "verified": 1,
    "contradicted": 1,
    "unsupported": 1,
    "needs_review": 0
  },
  "expectedClaimVerdicts": ["contradicted", "verified", "unsupported"]
}
```

Use `sourceDirs` when the behavior under test is recursive approved-source
discovery. Use `sources` when the fixture needs inline content or stable source
metadata without adding another shared example document. Inline sources should
still provide a meaningful `sourcePath`, `id`, title, freshness, and trust
level so their evidence looks like a real upstream record.

Every source ID must be unique within a fixture. Quorum rejects duplicate IDs
before scoring because two approved records with the same identity would make
evidence attribution ambiguous. Treat an ID as the stable identity of one
approved record, not as a label for a source path; include a repository key and
revision when the same policy can change over time, such as
`people-ops/leave-policy@2026-07-14`. If two source paths contain different
records, give them different IDs even when their titles match.

## Adding a fixture

1. Add the smallest answer/source or inline fixture that demonstrates one
   business-policy scenario.
2. Include at least one claim whose expected verdict is meaningful to the
   scenario. Three-claim fixtures commonly cover verified, contradicted, and
   unsupported behavior.
3. Add a focused assertion in `tests/evaluation.test.ts` for the fixture name,
   verdicts, metadata, and score.
4. Update deterministic fixture inventory and aggregate expectations when the
   benchmark count or domain totals change.
5. Add a concise README note only when the user-facing product surface changed;
   otherwise document the fixture's context here and let `docs/status.md`
   record the generated shipped inventory.
6. Run `npm run check` to execute the full repository gate, including tests,
   the TypeScript build, HTTP and packaged-entrypoint smoke checks, and the
   evaluation score gate.

## CI contract

The repository evaluation gate runs:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --min-score 0.95 \
  --fail-on-mismatch
```

`--fail-on-mismatch` blocks CI when actual verdicts differ from expected
verdicts. `--min-score` protects the benchmark from silently losing claim
coverage even when fixture summaries remain structurally valid.

Evaluation output can be written as JSON, Markdown, HTML, and CSV. Aggregate
and domain CSVs expose fixture counts, mismatch rates, claim totals, and
expected-versus-actual verdict rollups for queue or dashboard consumers.

## Context from recent fixture work

Fixture additions are intentionally small PRs because each one should answer a
specific product question:

- HR leave coverage tests a policy domain with verified, contradicted, and
  unsupported leave claims.
- HR professional-development coverage tests inline approved-source metadata
  and durable source identity.
- HR compensation-review coverage tests a separate HR policy scenario while
  preserving the same reviewer-facing verdict contract.
- HR leave-carryover coverage tests a time-bound vacation policy with durable
  source metadata and an unsupported home-office-stipend promise.
- Support password-reset, cancellation, SLA, and live-chat coverage expands
  the first customer-support wedge across common high-risk answers.
- Support refunds coverage isolates a time-bound annual-plan policy with
  verified, contradicted, and unsupported customer claims.
- Support workspace-access coverage tests the workspace-owner invitation control,
  a contradictory access-duration claim, and a needs-review membership claim.
- Support refund-status coverage tests a billing-history control, a matched
  processing-window claim, and an unsupported automatic-retry promise.
- Support data-export coverage tests inline source metadata, durable source
  identity, and conflicting customer policy claims.
- Support priority coverage tests a response-time contradiction alongside an
  unsupported account-management promise.
- HR benefits coverage tests health-coverage eligibility timing alongside a
  verified enrollment window and an unsupported stipend promise.
- HR dependent-benefits coverage tests open-enrollment eligibility, a
  qualifying-event timing contradiction, and an unsupported undocumented
  dependent promise.
- HR remote-work coverage tests a weekly remote-work limit alongside a
  contradicted five-day claim and an unsupported home-office stipend promise.
- HR performance-review coverage tests a review cadence contradiction alongside
  an unsupported promotion promise.
- HR expense-reimbursement coverage tests a submission-window contradiction
  alongside an unsupported commuter-shuttle promise.
- HR parental-leave coverage tests a paid-leave duration contradiction
  alongside a verified duration and an unrelated unsupported office-hours claim.
- HR bereavement-leave coverage tests an immediate-family leave entitlement,
  a related vacation-carryover claim, and an unrelated unsupported stipend claim.
- HR payroll-change coverage tests a payroll timing contradiction alongside
  identity-verification evidence and an unsupported rejected-deposit promise.
- HR travel-reimbursement coverage tests an annual travel limit, a submission-
  window contradiction, and a business-class claim routed to review.
- HR offboarding coverage tests final-pay timing, last-day access deprovisioning,
  and an unsupported unconditional severance promise.
- HR workplace-accommodation coverage tests the approved request channel, a
  contradictory response-time promise, and an unsupported home-office stipend.
- HR bonus-eligibility coverage tests good-standing eligibility, a payout-timing
  contradiction, and an unsupported guaranteed-bonus claim.
- HR employee-referral coverage tests a verified referral bonus, a conflicting
  bonus amount, and an unsupported automatic-payment promise.
- HR jury-duty coverage tests a verified paid-leave entitlement, a conflicting
  leave duration, and an unsupported meal-stipend promise.

- Support service-credit coverage tests an outage request-window contradiction,
  a matched credit-limit claim, and an unrelated unsupported claim.
- Support service-outage coverage tests an incident update cadence contradiction,
  an unsupported blanket-refund promise, and a matched status-confirmation claim.
- Support account-suspension coverage tests an appeal-window contradiction,
  a verified abuse-reinstatement rule, and an unsupported waiver promise.
- Support account-recovery coverage tests an email-change control, an unlock
  timing contradiction, and an unsupported immediate MFA-reset promise.
- Support account-contact coverage tests a verified ownership check, a
  contradicted verification window, and an unrelated unsupported promise.
- Support authentication-device coverage tests trusted-email approval and
  flags an unsupported hardware-key promise.
- Support account-closure coverage tests the ownership control, routes a
  conflicting completion window to review, and routes an unsupported
  automatic-reactivation promise to review.
- Support billing-suspension coverage tests the required payment condition for
  appeals, a premature-appeal claim routed to review, and an unsupported
  automatic reinstatement promise.
- Support billing-address coverage tests an account-owner control, a conflicting
  verification window, and an unrelated unsupported password-manager promise.
- Support incident-communication coverage tests a verified update cadence, a
  related cadence routed to review, and an unrelated unsupported claim.
- Support invoice-correction coverage tests a verified reporting window, a
  conflicting deadline, and an unsupported automatic-refund promise.
- Support subscription-pause coverage tests a verified renewal window, a
  conflicting pause deadline, and an unsupported automatic-refund promise.
- Support payment-method coverage tests a verified account billing control, a
  conflicting update deadline, and an unsupported automatic-refund promise.
- Support data-retention coverage tests an approved deletion channel, a
  conflicting completion window, and an unsupported recovery promise.
- Support escalation coverage tests a verified first-response window, a
  conflicting response claim routed for review, and an unsupported dedicated-engineer
  promise.
- Support gift-card coverage verifies account ownership before redemption,
  catches an expired-card claim, and flags an unsupported automatic refund.
- Support charge-dispute coverage tests a verified dispute window, a conflicting
  deadline, and an automatic-reversal promise routed for review.
- Support delivery-delay coverage tests a verified status-update window, a
  contradicted delivery guarantee, and an unsupported automatic replacement claim.
- Support return coverage tests a verified return window, a contradicted
  deadline, and an automatic-approval promise routed for review.
- Support shipping-address coverage tests a pre-shipment change window, a
  conflicting time limit, and an unrelated insurance promise.
- Support warranty coverage tests a claim window, a conflicting eligibility
  deadline, and an unconditional replacement promise flagged as unsupported.
- Support accessibility coverage verifies the request channel, routes an
  accommodation timing promise for review, and flags unconditional approval.
- Support replacement coverage tests a request window, a conflicting eligibility
  deadline, and an unrelated unsupported subscription promise.
- Support order-tracking coverage tests a verified tracking control, a conflicting
  delivery guarantee routed for review, and an unsupported automatic shipping refund.
- Support shipping-address coverage tests the pre-shipment change control, a
  conflicting time limit, and an unrelated insurance promise.
- Support order-cancellation coverage verifies the unshipped-order cancellation
  window and routes uncertain cancellation and refund promises to review.
- Support tax-exemption coverage verifies certificate submission and review
  timing while flagging an unsupported enterprise-upgrade promise.
- Support usage-limits coverage verifies the standard request limit, routes a
  too-broad increase claim to review, and flags an unsupported automatic increase.
- Support holiday-hours coverage verifies the published holiday chat schedule
  and catches an unconditional coverage promise for excluded accounts.
- Support subscription-renewal coverage verifies the self-service renewal
  window, catches a conflicting post-expiration claim, and flags an unsupported
  automatic-renewal promise.
- Support account-merge coverage verifies ownership of both accounts, catches
  a conflicting merge claim, and flags an unsupported password-manager promise.
- Support shipping-protection coverage verifies the pre-shipment control, routes
  an unconditional approval promise to review, and flags an unrelated unsupported
  password-manager promise.
- HR time-off coverage tests a notice requirement, routes partially matched
  notice and rollover claims for review, and flags an unsupported stipend.

Keep this context near the fixture workflow instead of growing the repository
README with another chronological capability list.
