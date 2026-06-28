# Demo Workflow

This demo shows Quorum checking an AI-generated HR answer against an approved
policy source.

## Run The Demo

HR policy verification:

```bash
npm install
npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --out reports/hr-report.json --fail-on contradicted --fail-on unsupported
```

Customer-support playbook verification:

```bash
npm run dev -- verify --answer examples/answers/support-answer.md --source examples/sources/support-playbook.md --out reports/support-report.json --fail-on contradicted --fail-on unsupported
```

## Expected Result

The HR sample answer contains three claims:

- `contradicted`: the answer says employees receive 18 weeks of paid parental
  leave, while the approved policy says 12 weeks.
- `verified`: the vacation claim matches the approved policy.
- `unsupported`: the catered lunch claim has no approved source evidence.

The customer-support sample follows the same pattern: one contradicted refund
window, one verified support-response claim, and one unsupported onboarding
claim.

The CLI prints a human-readable report and writes a machine-readable JSON report
to `reports/hr-report.json`. Because the sample contains risky claims, the demo
command exits with status code `2` when `--fail-on` is enabled.

## Why This Matters

The report is intentionally claim-level instead of answer-level. A business
response can be mostly right while still containing one risky claim. Quorum
surfaces the exact claim, evidence snippet, source title, score, and reason so a
reviewer can decide what to approve, edit, or reject.
