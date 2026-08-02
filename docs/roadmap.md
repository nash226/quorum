# Roadmap

Quorum should grow from a local verifier into an evidence layer that can sit in
front of enterprise agent workflows.

## Now

- Keep the CLI and local HTTP API reliable and easy to run.
- Improve claim extraction without hiding uncertainty.
- Make reviewer handoff artifacts easier to route, audit, and approve.
- Expand evaluation fixtures and scorecards across HR and support policy domains.

The initial evidence-gate workflow is usable end to end: teams can verify
single or batched answers, route reviewer decisions, and inspect evaluation
results from the CLI or local HTTP API. Near-term work should strengthen these
surfaces rather than add another parallel workflow.

## Shipped foundation

- Batch verification, reviewer queue, and evaluation workflows are available
  through the CLI and local HTTP API.
- Reviewer queue CLI and HTTP surfaces summarize imported decisions alongside
  optional benchmark drift.
- Packaged CLI verification covers Markdown and text documents, HTML/XHTML,
  PDF/DOCX, and structured JSON/YAML/XML/TOML/CSV answer and source exports;
  the supported extension contract is exposed through `quorum formats`.
- Deployment and integration guides document the local API's authentication
  boundary, operational limits, and durable source identifiers.
- The CLI and local HTTP API expose the same verification and reviewer-queue
  report shapes, with `quorum formats` documenting the supported file contract.

## Next

- Add a durable API service boundary for agent integrations beyond the local
  HTTP server (requires a deployment decision).
- Choose the durable queue backend for reviewer work queues and audit history;
  the dashboard boundary is tracked separately in [decision issue #683](https://github.com/nash226/quorum/issues/683).
- Expand the HR and support fixture set as policy coverage grows.

The service and queue items are intentionally decision-gated. Safe work can
continue on fixture coverage and local CLI/API reliability without choosing a
hosting provider, adding credentials, or committing to a durable storage
backend.

The next safe increment is another labeled HR or support fixture only when it
adds a distinct policy pattern and keeps the full benchmark score at its CI
threshold. Fixture additions should include a focused evaluator assertion and
an update to the reviewer-facing README notes so the coverage remains
discoverable.

Batch verification is shipped and should be treated as a foundation for these
next steps, not as a separate roadmap item: its directory and explicit-path
workflows already produce reviewer decisions and queue-routing summaries.

## Later

- Integrate with ticketing, HR, and support platforms.
- Add evaluation datasets for more business domains.
- Measure false positives, false negatives, and reviewer time saved.
