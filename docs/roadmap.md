# Roadmap

Quorum should grow from a local verifier into an evidence layer that can sit in
front of enterprise agent workflows.

## Now

- Keep the CLI and local HTTP API reliable and easy to run.
- Improve claim extraction without hiding uncertainty.
- Make reviewer handoff artifacts easier to route, audit, and approve.
- Expand evaluation fixtures and scorecards across HR and support policy domains.

## Shipped foundation

- Batch verification, reviewer queue, and evaluation workflows are available
  through the CLI and local HTTP API.
- Reviewer queue CLI and HTTP surfaces summarize imported decisions alongside
  optional benchmark drift.
- Packaged CLI verification covers Markdown, HTML, PDF, and DOCX answer/source
  ingestion paths.
- Deployment and integration guides document the local API's authentication
  boundary, operational limits, and durable source identifiers.

## Next

- Add a durable API service boundary for agent integrations beyond the local
  HTTP server.
- Choose the durable queue backend for reviewer work queues and audit history;
  the dashboard boundary is tracked separately in [decision issue #683](https://github.com/nash226/quorum/issues/683).
- Expand the HR and support fixture set as policy coverage grows.

## Later

- Integrate with ticketing, HR, and support platforms.
- Add evaluation datasets for more business domains.
- Measure false positives, false negatives, and reviewer time saved.
