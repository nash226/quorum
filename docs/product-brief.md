# Product Brief

Quorum helps enterprise teams decide whether an AI-generated business answer is
safe to use. It breaks an answer into claims, compares each claim with approved
company sources, and returns an evidence report for review.

## Problem

Enterprise AI agents are moving into support, HR, operations, and internal
knowledge workflows. These workflows often rely on company-specific rules that
change over time. When an agent confidently invents a policy, benefit, refund
rule, deadline, or escalation path, the damage is not just a bad answer. It can
create customer confusion, employee trust issues, compliance exposure, and
manual cleanup work.

## Initial User

The first user is an AI platform, operations, HR technology, or support leader
who already has approved knowledge sources and wants a lightweight verification
step before agent answers reach people or systems.

## MVP Workflow

1. A user provides an AI-generated answer.
2. A user provides approved source documents.
3. Quorum extracts atomic claims from the answer.
4. Quorum compares each claim with source snippets.
5. Quorum labels each claim as `verified`, `unsupported`, `contradicted`, or
   `needs_review`.
6. Reviewers receive a report with evidence, scores, and reasoning.

## Wedge

Start with HR and customer-support policy verification. The documents are
specific, the risk of wrong answers is clear, and a small CLI can prove the core
workflow before adding dashboards, integrations, or automated enforcement.

## Product Principles

- Show evidence before asking for trust.
- Prefer reviewer-ready reports over opaque scores.
- Keep the first workflow narrow enough to test with real documents.
- Treat uncertainty as a first-class state, not a failure.
- Make every verdict explainable and auditable.
