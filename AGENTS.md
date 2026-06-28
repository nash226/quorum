# AGENTS.md

## Purpose

This repository builds ClaimGuard: a business-facing evidence layer for
enterprise AI agents. The product checks AI-generated business claims against
approved company sources before those claims reach customers, employees, or
downstream systems.

The goal is to ship useful software, documentation, tests, and analysis that a
recruiter, engineer, or enterprise buyer can click through and understand.

Do not create filler commits, meaningless churn, fake history, or changes whose
only purpose is to color a contribution graph.

## Working Style

- Make small, atomic changes.
- Prefer one logical change per commit.
- Keep diffs easy to review.
- Stage only files related to the current task.
- When work is broad, split it into separate tasks or worktrees.
- Leave unrelated files and user changes untouched.
- Record useful follow-up ideas in docs or issues instead of cramming them into
  the current change.

## Parallel Codex Workflow

- Use the local checkout for the main foreground task.
- Use Codex worktrees for independent background tasks.
- Good background tasks include tests, docs, README improvements, small bug
  fixes, dependency cleanup, type checks, and focused refactors.
- Avoid running multiple agents against the same files unless the task is
  explicitly coordinated.
- Before merging work from a background thread, review the diff and run the
  relevant checks.

## Commit Style

Use concise conventional commit messages:

- `feat: add ...`
- `fix: handle ...`
- `test: cover ...`
- `docs: explain ...`
- `chore: clean ...`

Each commit should answer: what changed, why it matters, and how it can be
verified from the diff.

## Verification

Before considering a task done:

- Run the narrowest relevant test, lint, typecheck, or smoke check.
- For TypeScript changes, run `npm test` and `npm run build` when dependencies
  are installed.
- If no check exists yet, explain that and consider adding one.
- Include verification notes in the final response.
- If a check fails, report the failure and either fix it or explain why it is
  outside the current task.

## Project Direction

ClaimGuard helps enterprise teams reduce hallucination risk in AI agents and
AI-assisted workflows.

Initial product surface:

- Ingest approved source documents such as HR policies, support playbooks,
  product docs, contracts, and internal knowledge base pages.
- Accept an AI-generated answer or agent response.
- Break the answer into atomic business claims.
- Compare each claim against approved sources.
- Label each claim as `verified`, `unsupported`, `contradicted`, or
  `needs_review`.
- Produce an evidence report with source snippets and reviewer-ready reasoning.

The first wedge is HR and customer-support policy verification because the
answers are document-grounded, high-volume, and risky when wrong.

## Done Means

- The change is real and useful.
- The repository is healthier or more informative after the change.
- The work can survive someone clicking through the commit, PR, or repo.
