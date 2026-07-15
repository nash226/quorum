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
- HR leave, onboarding, professional development, and compensation review
- support account security, cancellation, escalation, live chat, password
  reset, SLA, billing, and source-directory workflows

The benchmark currently contains 17 fixtures. The generated
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
6. Run `npm test`, `npm run build`, `npm run smoke`, and `npm run evaluate:ci`.

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
- Support password-reset, cancellation, SLA, and live-chat coverage expands
  the first customer-support wedge across common high-risk answers.

Keep this context near the fixture workflow instead of growing the repository
README with another chronological capability list.
