# CLI Guide

Quorum's CLI is the quickest way to verify an answer locally or in CI. Run
commands from the repository with `npm run dev -- ...`, or use the packaged
`quorum` binary after `npm run build`.

## Choose a command

- `verify` checks one answer against approved sources.
- `verify-batch` checks several answers against the same source set.
- `extract-claims` previews the normalized claim IDs and text without loading sources.
- `import-review` imports reviewer verdicts from a decision CSV.
- `review-queue` summarizes reviewer workload and benchmark drift.
- `evaluate` runs the checked-in evaluation fixtures.
- `serve` starts the HTTP API; `openapi` exports its contract without starting it.

Every command supports `--help`; the top-level `quorum --help` lists the
available commands and their primary inputs.

## Fail-policy gates

Verification commands can be made CI gates by repeating `--fail-on` for each
risky verdict:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --fail-on contradicted \
  --fail-on unsupported
```

Quorum exits with status `2` when a selected verdict is present. Use
`--fail-on needs_review` when uncertain or empty answers must stop for human
review. Reviewer imports apply the policy to the final reviewer-aware verdicts,
including overrides.

For the complete local gate, run `npm run check`.
