# Quorum

Quorum is a business-facing evidence layer for enterprise AI agents.

It checks AI-generated business claims against approved company sources before
those claims reach customers, employees, or downstream systems.

## Why This Exists

Enterprise AI is moving from experiments to production agents, but hallucination
controls are still uneven. The first version of Quorum focuses on a narrow,
high-value problem: detecting unsupported or contradicted claims in answers that
should be grounded in company policy or knowledge documents.

## MVP

The initial CLI takes:

- an AI-generated answer
- one or more approved source documents

It returns a claim-by-claim evidence report:

- `verified`
- `unsupported`
- `contradicted`
- `needs_review`

Source files may include optional frontmatter metadata:

```markdown
---
title: HR Benefits Policy
updatedAt: 2026-05-31
---
```

## Quick Start

```bash
npm install
npm test
npm run build
npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --out reports/hr-report.json
```

For a guided walkthrough, see [docs/demo.md](docs/demo.md). For planned
increments, see [docs/roadmap.md](docs/roadmap.md).

## Product Direction

The first wedge is HR and customer-support policy verification. These workflows
are document-grounded, high-volume, and risky when AI answers drift from approved
sources.

Future versions should add:

- source ingestion for PDFs and knowledge bases
- reviewer approval workflows
- audit reports
- API and dashboard surfaces
- integrations with enterprise agent platforms
