# Demo Workflow

This demo shows Quorum checking AI-generated HR and customer-support answers
against approved policy sources.

## Run The Demo

HR policy verification:

```bash
npm install
npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --out reports/hr-report.json --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv --fail-on contradicted --fail-on unsupported
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

The CLI prints a human-readable report and writes machine-readable JSON reports
plus a styled HTML reviewer report and reviewer-decision CSV under `reports/`.

For multi-answer workflows, Quorum can also export batch review summaries:

```bash
npm run dev -- verify-batch --answer-dir examples/answers --source-dir examples/sources --out reports/batch-report.json --markdown-out reports/batch-report.md --html-out reports/batch-report.html --review-csv-out reports/batch-review.csv --summary-csv-out reports/batch-summary.csv --fail-on contradicted
```

The same batch run can now produce two reviewer-facing queue artifacts:

- `reports/batch-summary.csv`: one row per answer with an `answer_label`,
  `answer_preview`, primary finding, fail-policy status, primary evidence
  trust/freshness, and source metadata for queue routing.
- `reports/batch-review.csv`: one row per claim with evidence quotes, trust
  levels, scores, and reviewer-decision columns for detailed review.

When a team wants to review only a selected subset, the same command also
accepts repeated `--answer` paths:

```bash
npm run dev -- verify-batch --answer examples/answers/hr-answer.md --answer examples/answers/support-answer.md --source-dir examples/sources --review-csv-out reports/selected-review.csv
```
Quorum keeps repeated `--answer` paths in that explicit order in the batch
report and reviewer CSV, then appends any extra files discovered through
`--answer-dir`.
Because the samples contain risky claims, the demo commands exit with status
code `2` when `--fail-on` is enabled.

After a reviewer fills in the exported CSV, import it back into Quorum with:

```bash
npm run dev -- import-review --review-csv reports/hr-review.csv --out reports/hr-review-import.json --markdown-out reports/hr-review-import.md --summary-csv-out reports/hr-review-import-summary.csv
```

The import summary preserves the model verdict, the reviewer verdict when one
is present, whether the reviewer overrode the model, and any reviewer notes.
When the CSV came from `verify-batch --review-csv-out`, the import also keeps
the original `answer_path` and `answer_preview` for each reviewed claim so
batch handoffs stay grouped by answer file with recognizable reviewer context.
The JSON import artifact also includes answer-level `answerGroups` summaries so
queue tooling can route follow-up work one answer at a time. The summary CSV
import artifact adds one row per answer group with reviewed, pending,
overridden, and final verdict totals for spreadsheet queues.

Quorum also accepts exported HTML knowledge base pages via `--source` or
`--source-dir`, which lets teams verify answers against help-center exports
without first converting those pages to Markdown.

## Why This Matters

The report is intentionally claim-level instead of answer-level. A business
response can be mostly right while still containing one risky claim. Quorum
surfaces the exact claim, evidence snippet, source title, score, and reason so a
reviewer can decide what to approve, edit, or reject.
