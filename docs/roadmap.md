# Roadmap

Quorum should grow from a local verifier into an evidence layer that can sit in
front of enterprise agent workflows.

## Now

- Keep the CLI and local HTTP API reliable and easy to run.
- Improve claim extraction without hiding uncertainty.
- Make reviewer handoff artifacts easier to route, audit, and approve.
- Expand evaluation fixtures and scorecards across HR and support policy domains.

## Shipped foundation

- Reviewer queue CLI and HTTP surfaces summarize imported decisions alongside
  optional benchmark drift.
- Packaged CLI verification covers Markdown, HTML, PDF, and DOCX answer/source
  ingestion paths.
- Deployment and integration guides document the local API's authentication
  boundary, operational limits, and durable source identifiers.

## Next

- Choose the durable queue backend and dashboard boundary for reviewer work
  queues and audit history.
- Expand the HR and support fixture set as policy coverage grows.

## Later

- Add a dashboard for review queues and audit history.
- Integrate with ticketing, HR, and support platforms.
- Add evaluation datasets for more business domains.
- Measure false positives, false negatives, and reviewer time saved.
