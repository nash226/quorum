# Quorum Architecture

Quorum is a local-first verification pipeline. It keeps evidence decisions
close to approved source files while producing artifacts that reviewers and
later workflows can inspect.

```text
answer file(s) ──┐
                 ├─> claim extraction ─> evidence matching ─> verdicts
source file(s) ──┘                                      │
                                                        ├─> text / JSON report
                                                        ├─> Markdown / HTML handoff
                                                        └─> reviewer decision CSV
                                                                  │
                                                                  v
                                                        import-review summary
```

## Pipeline boundaries

1. **Input loading** reads answer and approved-source files, including source
   metadata such as title, freshness, and trust level. Batch verification
   reuses the same source set for multiple answers.
2. **Claim extraction** turns an answer into atomic, reviewable claims while
   preserving uncertainty when the text cannot be split confidently.
3. **Evidence matching** compares each claim with approved source passages and
   records the strongest relevant evidence and its score.
4. **Verdict policy** labels claims `verified`, `contradicted`, `unsupported`,
   or `needs_review`. Optional `--fail-on` rules make selected risky outcomes
   non-zero for CI and workflow gates.
5. **Reviewer handoff** exports human-readable reports and a CSV template.
   Reviewers can add a final verdict and notes without changing the original
   answer or approved sources.
6. **Review import** reconstructs the reviewer-aware summary, preserving
   answer provenance and grouping batch answers for queue routing.

## Artifact roles

| Artifact | Best for | Source of truth |
| --- | --- | --- |
| JSON report | automation and integrations | model verdicts and evidence |
| Markdown or HTML report | human review and approvals | rendered JSON report |
| Reviewer CSV | claim-level decisions in a spreadsheet | exported claim/evidence context plus reviewer fields |
| Imported review summary | downstream routing after review | reviewer overrides and final verdicts |

The CSV is a handoff format, not a replacement for the approved source set.
Quorum keeps source snippets, trust, and freshness beside each claim so a
reviewer can validate the decision in context.

## Current deployment boundary

The CLI and local HTTP API are the supported product surfaces today. A future
hosted deployment can call the same verification and reporting boundaries, but
durable queue storage, authentication, and hosting remain separate decisions.
Keeping those concerns outside the local pipeline lets the evidence contract
stabilize before Quorum commits to an operational backend.
