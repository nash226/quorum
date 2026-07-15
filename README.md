# Quorum

[![CI](https://github.com/nash226/quorum/actions/workflows/ci.yml/badge.svg)](https://github.com/nash226/quorum/actions/workflows/ci.yml)

Quorum is an evidence gate for enterprise AI agents.

It checks AI-generated business claims against approved company sources before
those claims reach customers, employees, tickets, workflows, or downstream
systems.

Repository CI runs the full test, build, smoke, and evaluation gate with
read-only contents access; only the main-branch status refresh job can write
back to the repository.

## Demo Video

<a href="docs/assets/quorum-demo.mp4">
  <img src="docs/assets/quorum-demo-poster.png" alt="Watch the Quorum demo video" width="100%">
</a>

[Watch or download the Quorum demo video](docs/assets/quorum-demo.mp4)

## Why Quorum Exists

Enterprise teams are moving from AI experiments to agents that answer policy,
support, HR, product, and operations questions. Those answers often sound
confident even when they drift from approved company knowledge.

Quorum focuses on a narrow but high-value problem:

> Given an AI-generated answer and approved source documents, identify which
> claims are supported, contradicted, unsupported, or need human review.

The goal is not to replace reviewers. The goal is to give reviewers a clear,
auditable evidence report before an agent response becomes a business action.

## What It Does

The current CLI can:

- read an AI-generated answer from a Markdown, text, or exported HTML file
- read an AI-generated answer from a PDF or DOCX file by extracting its readable text
- batch verify multiple AI-generated answers from a directory
- include a per-answer `answerHasClaims` flag in batch results so queue integrations can route empty drafts without recounting claims
- include `answersWithClaims` and `answersWithoutClaims` in batch summaries so queue integrations can route claim-bearing and empty answers without recounting rows
- read one or more approved Markdown, text, or exported HTML source documents
- read one or more approved Markdown, text, exported HTML, PDF, or DOCX source documents
- load source metadata such as `title`, `updatedAt`, and `trustLevel`
- preserve caller-supplied source IDs in API evidence and reports for stable audit references
- reject duplicate API source IDs so evidence references remain unambiguous
- preserve caller-supplied source IDs for explicit CLI sources with `--source-id`, while directory sources keep positional fallback IDs
- override the default trust level for sources that do not include metadata
- split the answer into atomic claims
- split independently capitalized or numeric clauses joined by semicolons or comma conjunctions into separate claims
- strip common Unicode numbered-list markers from exported policy answers
- keep colon-terminated business claims such as `No refunds:` while still skipping recognized wrapper labels such as `Policy summary:`
- ignore HTML `<code>` and `<pre>` blocks so embedded snippets are not treated as business claims
- preserve short, explicit claims such as "No refunds." instead of dropping them during normalization
- compare each claim against approved source snippets
- label each claim as `verified`, `contradicted`, `unsupported`, or
  `needs_review`
- print a human-readable report
- preserve the reviewer-facing `answer_label` in text, Markdown, and HTML reports as well as machine-readable exports
- include the report generation timestamp in text output for audit-friendly handoff
- accept `--generated-at <timestamp>` on report-producing CLI workflows when CI
  retries or snapshot tests need a stable audit timestamp
- validate HTTP `generatedAt` values as timestamps before producing audit reports
- describe generated report timestamps as `date-time` values in the OpenAPI contract for typed clients
- validate approved-source `updatedAt` values as timestamps before using freshness metadata
- describe source freshness timestamps as `date-time` values in the OpenAPI contract for typed clients
- keep OpenAPI freshness examples RFC 3339 date-times so generated-client fixtures validate against the published schema
- write a JSON report for workflow automation
- write a Markdown reviewer report for approvals and handoff
- write a polished HTML reviewer report for demos and human review
- write a reviewer decision CSV that teams can fill in claim by claim while
  preserving the original answer path and stable source IDs for audit handoff
- write requested report artifacts atomically so queue watchers only observe
  complete files during reviewer handoff
- write one-row summary CSVs for single-answer and batch verification workflows, including an explicit `answer_has_claims` routing flag plus the primary evidence score and quote
- write a standalone batch aggregate summary CSV with answer routing totals, verdict totals, and approved-source context for queue handoffs
- preserve stable source IDs in reviewer decision and summary CSV exports so queue rows remain linked to approved records
- preserve stable source IDs in text, Markdown, HTML, and CSV evaluation reports so benchmark evidence remains traceable
- include an explicit `answerHasClaims` signal in evaluation scorecards and CSVs so empty benchmark answers can be routed without recounting claims
- include `answersWithClaims` and `answersWithoutClaims` in evaluation aggregate and domain rollups so queue integrations can route empty benchmark answers without inspecting every scorecard
- include expected and actual verdict totals in evaluation domain and aggregate rollups so HR and support drift is visible at a glance
- include aggregate evaluation mismatch counts in the reusable JSON summary so queue and dashboard consumers can triage benchmark drift from one object
- include aggregate and per-domain evaluation mismatch rates in JSON summaries and CSV/report surfaces so benchmark drift is comparable without client-side calculation
- ship HR and support source-directory evaluation fixtures so directory ingestion is covered across both policy domains
- publish the evaluation scorecard `answerHasClaims` queue-routing field in the generated OpenAPI schema for typed clients
- import filled reviewer decision CSVs into a machine-readable summary
- filter imported reviewer decisions by `pending`, `reviewed`, or `no_claims` queue status for targeted handoffs
- filter HTTP reviewer-import responses by `queueStatus` so integrations can request only pending, reviewed, or claim-less answer groups
- verify the built HTTP server's `queueStatus` reviewer handoffs in the end-to-end smoke gate, including filtered queue totals and artifacts
- advertise the supported HTTP reviewer-import `queueStatus` values in the generated OpenAPI schema for typed clients
- preserve explicit `answer_has_claims` routing decisions when importing reviewer CSVs so downstream summaries do not have to infer empty answers from claim-row counts
- include a queue-ready `review_status` (`pending`, `reviewed`, or `no_claims`) for each imported answer group in JSON reports and summary CSVs
- include a top-level `queueSummary` in reviewer-import JSON reports so queue consumers can route pending, reviewed, and claim-less answers without scanning every group
- export reviewer-import queue totals as a standalone `queue_summary_csv` artifact or `--queue-summary-csv-out` file so CSV-only handoffs do not need to parse JSON
- show the same reviewer queue totals in polished HTML import reports so human handoffs expose pending, reviewed, and claim-less answers at a glance
- show the imported `answer_has_claims` routing signal in text, Markdown, and HTML reviewer handoff reports
- reject duplicate reviewer CSV claim rows for the same answer so imported audit totals stay unambiguous
- render Markdown reviewer-import reports with safe, single-line answer and claim context
- fail a CI job when selected risky verdicts appear
- emit gate-aware JSON results with `shouldFail` and `failVerdicts` for single and batch CLI workflows
- serve a lightweight local HTTP API for single-answer, batch verification, reviewer import, and evaluation workflows
- expose stable programmatic path constants for each HTTP operation so integrations can target the API without repeating route literals
- export the canonical `API_ALLOWED_METHODS` list so integrations can build transport checks without duplicating the HTTP contract
- derive generated OpenAPI method enums from the canonical `API_ALLOWED_METHODS` list so discovery and typed-client contracts cannot drift
- return structured `405` errors with route-specific `Allow` headers when a known API route receives an unsupported method
- reject CORS preflight requests for unknown API routes instead of advertising a route that does not exist
- export `API_ROOT_PATH` for clients that bootstrap from the API discovery endpoint
- expose configured request size and timeout limits in machine-readable API capabilities for integration clients
- expose canonical correlation, discovery, cache, and method-negotiation header names in machine-readable API capabilities
- expose the browser CORS allowlist, exposed response headers, and preflight cache duration in machine-readable API capabilities
- expose reviewer queue statuses (`pending`, `reviewed`, and `no_claims`) in machine-readable API capabilities so integrations can route imported answers without hard-coded values
- publish the supported `base64` binary upload encoding in the OpenAPI capabilities schema for typed clients
- export the `ApiErrorResponse` TypeScript type for request failures with a correlation ID
- generate OpenAPI discovery examples with the server's configured request-size and timeout limits
- serve the generated OpenAPI contract with an `ETag`, allowing integration clients to revalidate it with `If-None-Match`
- allow browser clients to preflight `If-None-Match` when revalidating the OpenAPI contract with its `ETag`
- cache browser CORS preflight results for ten minutes through `Access-Control-Max-Age`
- expose the OpenAPI `ETag` through CORS so browser clients can cache and reuse the validator
- preview normalized claims over HTTP before loading approved sources for verification
- include an `answerHasClaims` routing flag in HTTP claim previews so queue clients can identify empty drafts without recounting claims
- expose the same `answerHasClaims` routing flag from CLI claim previews with opt-in result JSON
- report the CLI and HTTP API contract version with `quorum version` or `quorum --version`
- emit the CLI and API contract version as stable JSON with `quorum version --json`
- revalidate the HTTP `/version` compatibility probe with a stable `ETag`
- revalidate the HTTP `/capabilities` runtime contract with a stable `ETag`
- revalidate the root API discovery contract with a stable `ETag`
- revalidate the generated `/openapi.json` contract with `GET` or `HEAD` and a stable `ETag`
- verify the built CLI's machine-readable version output in the end-to-end smoke gate

## Example

Check the installed CLI contract version before wiring it into a workflow:

```bash
npm run dev -- --version
# quorum 0.1.0
```

Preview the normalized atomic claims Quorum will verify without loading source
documents:

```bash
npm run dev -- extract-claims --answer examples/answers/hr-answer.md --json
npm run dev -- extract-claims --answer examples/answers/empty-answer.md --result-json
cat examples/answers/hr-answer.md | npm run dev -- extract-claims --answer -
npm run dev -- extract-claims --answer examples/answers/hr-answer.md --answer-label "HR reviewer packet"
```

The top-level `quorum --help` synopsis includes the optional
`extract-claims --answer-label <label>` reviewer label, keeping the discoverable
CLI contract aligned with the command-specific help.

When a file-based workflow already has durable approved-document IDs, attach
them to explicit sources so reviewer evidence stays linked to the source
system:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source examples/sources/hr-policy.md \
  --source-id people-ops/hr-policy@2026-07-14 \
  --json
```

API requests must use a unique `sources[].id` for each approved record. Quorum
rejects duplicate IDs before verification so an evidence reference cannot point
to multiple source documents.

When a human is reviewing a claim preview, `--answer-label` adds the
reviewer-facing label to the text output. JSON output remains the same claims
array for scripts that already consume the preview command. Use `--result-json`
(or `--result-json-out <path>`) when a queue integration also needs the
`answerHasClaims` routing flag without recounting the returned claims.

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --answer-label "HR reviewer packet" \
  --source-dir examples/sources \
  --default-trust-level high \
  --out reports/hr-report.json \
  --markdown-out reports/hr-report.md \
  --html-out reports/hr-report.html \
  --review-csv-out reports/hr-review.csv \
  --summary-csv-out reports/hr-summary.csv
```

Use `--result-json` (or `--result-json-out <path>`) on `verify` and
`verify-batch` when a workflow needs the report plus its fail-policy decision in
one payload. The result includes `report`, `shouldFail`, and `failVerdicts`;
`--json` remains available for the report-only shape.

Or stream the answer directly into Quorum when another tool already produced the
text:

```bash
cat examples/answers/hr-answer.md | npm run dev -- verify --answer - --answer-label "HR reviewer packet" --source-dir examples/sources --json
```

Example output:

```text
Quorum Verification Report

Sources: HR Benefits Policy, Customer Support Playbook
Summary: 1 verified, 1 contradicted, 1 unsupported, 0 needs review

CONTRADICTED  Employees receive 18 weeks of paid parental leave.
Reason: A closely matching approved source uses different numeric terms.
Evidence (HR Benefits Policy, high trust, score 0.857):
  Employees receive 12 weeks of paid parental leave.
```

For CI-style blocking:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --fail-on contradicted \
  --fail-on unsupported
```

When a selected verdict is present, Quorum exits with status code `2`.

To import a filled reviewer decision CSV:

```bash
npm run dev -- import-review \
  --review-csv reports/hr-review.csv \
  --out reports/hr-review-import.json \
  --markdown-out reports/hr-review-import.md \
  --html-out reports/hr-review-import.html \
  --summary-csv-out reports/hr-review-import-summary.csv \
  --fail-on needs_review
```

To hand only one queue state to a downstream reviewer or approval step, add
`--queue-status`:

```bash
npm run dev -- import-review \
  --review-csv reports/hr-review.csv \
  --queue-status pending \
  --result-json-out reports/hr-pending.json \
  --summary-csv-out reports/hr-pending-summary.csv
```

The filtered result recomputes answer groups, claims, queue totals, and
fail-policy matches for the selected `pending`, `reviewed`, or `no_claims`
state. This keeps a targeted handoff self-contained instead of requiring the
next system to filter the full import again.

When a downstream queue only accepts CSV, request the overall queue totals as a
single row instead of parsing the JSON report:

```bash
npm run dev -- import-review \
  --review-csv reports/hr-review.csv \
  --queue-summary-csv-out reports/hr-queue-summary.csv
```

The HTTP `POST /import-review` equivalent is
`includeArtifacts: ["queue_summary_csv"]`; its columns include total, pending,
reviewed, and no-claims answers plus claim verdict and fail-policy totals.

Or stream the reviewer CSV directly into the import step:

```bash
cat reports/hr-review.csv | npm run dev -- import-review --review-csv - --json
```

Batch review CSVs generated by `verify-batch --review-csv-out` can be imported
with the same command, and Quorum preserves each claim's `answer_path` so
reviewers can trace decisions back to the original answer file. Markdown, HTML,
and text import outputs preserve the exported `answer_label` while still
showing the original `answer_path`, so batch review handoffs stay organized by
the reviewer-facing label without losing file-level traceability. When the
reviewer CSV includes `answer_fail_policy` and `answer_fail_verdicts`, import
reports also preserve that original answer-level risk signal alongside the
reviewer-aware final verdicts. The JSON import output now includes an
`answerGroups` array with per-answer summaries and grouped claims for workflow
automation. `--summary-csv-out` writes one row per imported answer group with
an explicit `answer_has_claims` routing flag, reviewed, pending, overridden,
final verdict counts, and the original exported
answer-level fail-policy context plus grouped source titles, trust levels, and
update dates for queue routing and audit handoff. Text, Markdown, and HTML
import reports also preserve each evidence source path so reviewers can trace
cited policy text back to the approved document.
The packaged `npm run smoke` check also verifies that the HTTP
`POST /import-review` workflow preserves the exported `answer_preview` inside
its grouped answer response, so API queue clients retain recognizable context
even when they only submit reviewer CSV content.
It also verifies that the same API workflow can return `summary_csv` with the
primary reviewer verdict and evidence title, trust level, freshness, source
path, score, and quote needed to route a review queue row without first
parsing the full JSON report.
It also exercises `verify --answer -` end to end, confirming that a streamed
answer produces a verified report with the stable `<stdin>` answer path.
`import-review --fail-on` evaluates those final verdicts after reviewer
overrides, so teams can block publication on unresolved reviewed outcomes, and
the text, Markdown, and HTML import reports surface whether each answer matched
that fail policy.
For workflow runners that need the report and gate decision in one payload,
`import-review --result-json` emits `report`, `shouldFail`, and `failVerdicts`;
use `--result-json-out <path>` to persist the same gate-aware result alongside
the reviewer handoff artifacts.

To verify a directory of answers against the same approved source set:

```bash
npm run dev -- verify-batch \
  --answer-dir examples/answers \
  --source-dir examples/sources \
  --out reports/batch-report.json \
  --markdown-out reports/batch-report.md \
  --html-out reports/batch-report.html \
  --review-csv-out reports/batch-review.csv \
  --summary-csv-out reports/batch-summary.csv \
  --fail-on contradicted
```

`verify-batch` also accepts repeated `--answer` paths, so teams can review a
curated set of files without moving them into a single directory first:

```bash
npm run dev -- verify-batch \
  --answer examples/answers/hr-answer.md \
  --answer-label "HR reviewer packet" \
  --answer examples/answers/support-answer.md \
  --answer-label "Support escalation packet" \
  --source-dir examples/sources \
  --review-csv-out reports/selected-review.csv
```

When `--answer` is repeated, Quorum keeps those explicit paths attached to each
row and report section, then appends any additional files found through
`--answer-dir`. Reviewer-facing batch reports plus the batch review and summary
CSVs prioritize risky answers first so teams can route the hottest items
without reshaping the export themselves. Add `--answer-label` after any
explicit `--answer` to keep a reviewer-facing queue label for that input while
still preserving the original `answer_path`. Batch Markdown and HTML reports
also include each answer's claim-level verdicts and top evidence so reviewers
can inspect risky answers without jumping straight to JSON.
Answer directories and explicit `--answer` paths also accept PDF and DOCX
answers; Quorum extracts their readable text before claim splitting while
preserving the original file path in reports and reviewer exports.
Batch summary CSV rows also include `answer_has_claims`, so queue consumers can
route no-claim answers explicitly instead of inferring that state from verdict
counts.
The packaged smoke check also verifies that batch summary CSV rows preserve the
answer label, primary finding, evidence freshness, evidence source path, and
source quote used for queue routing.

To run only selected evaluation domains while building scorecards:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --domain hr \
  --summary-csv-out reports/evaluation-summary.csv
```

Repeat `--domain` to include multiple slices. When the flag is present, Quorum
only evaluates fixtures whose `domain` matches one of those values.

Evaluation scorecards can also enforce a minimum aggregate claim score in CI:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --min-score 0.95 \
  --fail-on-mismatch
```

The HTTP `POST /evaluate` workflow accepts the equivalent `minScore` value
between `0` and `1`, and returns `scoreThresholdPassed` with the batch result.
Evaluation result JSON also includes ordered `failureReasons` values (`mismatch`
and/or `min_score`) so workflow callers can explain why a benchmark gate failed.
The [API integration guide](docs/api-integration.md) includes a copy-paste
`POST /evaluate` example that sends fixture content, filters by domain, enforces
`minScore`, and requests benchmark CSV artifacts for workflow handoff.
For CI and workflow clients, `evaluate --result-json` emits that same result
shape with `shouldFail`, mismatch counts, aggregate score, and threshold
metadata; `--min-score` independently exits with status `2` when the threshold
is not met.
Use `--result-json-out <path>` when a workflow needs to persist that gate-aware
result alongside its scorecard files instead of capturing stdout.
The repository CI workflow runs `npm run evaluate:ci` against the shipped HR and
support fixtures, requiring zero expected-result mismatches and an aggregate
claim score of at least `0.95`.
The fixture set also includes an empty-answer case, keeping the zero-claim
scorecard and reviewer-facing “no claims extracted” behavior covered in CI.
The shipped support fixture set also includes a source-directory example, so a
benchmark can discover a maintained approved-source bundle with `sourceDirs`
instead of listing every source file individually.
Evaluation summary CSVs preserve the ordered source IDs used by each fixture
and include the durable ID for a first mismatched claim's evidence when one is
available, so benchmark drift can be reconciled with approved-source records.
It also includes a support escalation example where a partial policy match is
correctly routed to `needs_review`, keeping reviewer handoff behavior covered
in the shipped scorecard gate.
Run `npm run check` locally to execute the same full gate as CI: tests, the
TypeScript build, the end-to-end smoke check, and the shipped-fixture score
gate. The package also runs this same gate automatically before `npm publish`,
so a release cannot skip the repository's verification contract.
The top-level `quorum --help` synopsis mirrors the command-specific help for
stable report timestamps, gate-aware result JSON, and evaluation score
thresholds, so the main CLI entry point remains a usable contract guide.

## Programmatic API

Quorum also exposes a small package API for agent and workflow integrations
that want the verification and reviewer-import flows without shelling out to
the CLI:

The public package exports `extractClaims` for previewing normalized atomic
claims, plus `extractClaimsResult` when a queue integration also needs the
stable `answerHasClaims` routing signal used by the HTTP API:

```ts
import { extractClaims, extractClaimsResult } from "quorum";

const claims = extractClaims("Employees receive 12 weeks of leave.");
// [{ id: "claim_1", text: "Employees receive 12 weeks of leave." }]

const preview = extractClaimsResult("No policy claims were generated.");
// { answerHasClaims: true, claims: [{ id: "claim_1", text: "..." }] }
```

The local HTTP API exposes its stable service, version, OpenAPI path, request
size, and request-correlation response headers in the generated `/openapi.json`
contract, including on error responses, so workflow clients can discover and
trace calls without relying on undocumented transport behavior.

```ts
import {
  ANSWER_EXTENSIONS,
  evaluateFixtureFilesResult,
  importReviewerDecisionContents,
  importReviewerDecisionContentsResult,
  importReviewerDecisionFile,
  evaluateFixtures,
  loadSources,
  loadSourcesFromContent,
  renderAnswerLabel,
  renderAnswerLabels,
  renderAnswerPreview,
  verifyAnswers,
  verifyAnswersResult,
  verifyAnswerBatchContents,
  verifyAnswerBatchContentsResult,
  verifyAnswerBatchFileInputs,
  verifyAnswerBatchFileInputsResult,
  verifyAnswerContents,
  verifyAnswerContentsResult,
  verifyAnswerBatch,
  verifyAnswerBatchResult,
  verifyAnswerFile,
  verifyAnswerFileInputs,
  verifyAnswerFileInputsResult,
  verifyAnswerFileResult,
  verifyAnswerResult,
  SOURCE_EXTENSIONS,
} from "quorum";

const sources = await loadSources({
  sourcePaths: [],
  sourceDirs: ["examples/sources"],
  defaultTrustLevel: "high",
});

const report = await verifyAnswerFile({
  answerPath: "examples/answers/hr-answer.md",
  answerLabel: "HR draft for approval",
  sources,
});

const directFileReport = await verifyAnswerFileInputs({
  answerPath: "examples/answers/hr-answer.md",
  answerLabel: "HR draft for approval",
  sourcePaths: [],
  sourceDirs: ["examples/sources"],
  defaultTrustLevel: "high",
});

const gatedReportWithArgs = await verifyAnswerFileResult(
  "examples/answers/hr-answer.md",
  sources,
  ["contradicted", "unsupported"],
);

const gatedReport = await verifyAnswerFileResult({
  answerPath: "examples/answers/hr-answer.md",
  answerLabel: "HR draft for approval",
  sources,
  failOn: ["contradicted", "unsupported"],
});

const directFileResult = await verifyAnswerFileInputsResult({
  answerPath: "examples/answers/hr-answer.md",
  answerLabel: "HR draft for approval",
  sourcePaths: [],
  sourceDirs: ["examples/sources"],
  defaultTrustLevel: "high",
  failOn: ["contradicted", "unsupported"],
});

const batchReport = await verifyAnswerBatch({
  answerPaths: ["examples/answers/hr-answer.md"],
  answerDirPaths: [],
  answerLabelsByPath: {
    "examples/answers/hr-answer.md": "HR reviewer packet",
  },
  sources,
  failOn: ["contradicted", "unsupported"],
});

const batchResult = await verifyAnswerBatchResult({
  answerPaths: ["examples/answers/hr-answer.md"],
  answerDirPaths: [],
  sources,
  failOn: ["contradicted", "unsupported"],
});

const directBatchReport = await verifyAnswerBatchFileInputs({
  answerPaths: ["examples/answers/hr-answer.md"],
  answerDirPaths: [],
  sourcePaths: [],
  sourceDirs: ["examples/sources"],
  defaultTrustLevel: "high",
  failOn: ["contradicted", "unsupported"],
});

const directBatchResult = await verifyAnswerBatchFileInputsResult({
  answerPaths: ["examples/answers/hr-answer.md"],
  answerDirPaths: [],
  sourcePaths: [],
  sourceDirs: ["examples/sources"],
  defaultTrustLevel: "high",
  failOn: ["contradicted", "unsupported"],
});

const fallbackAnswerLabel = renderAnswerLabel("examples/answers/hr-answer.md");
const reviewerQueueLabels = renderAnswerLabels([
  "exports/hr/answer.md",
  "exports/support/answer.md",
]);
const answerPreview = renderAnswerPreview(
  "<main><p>Refunds are available within 30 days of purchase.</p></main>",
);

const importedReview = await importReviewerDecisionFile("reports/hr-review.csv");
const importedReviewWithOptions = await importReviewerDecisionFile({
  reviewCsvPath: "reports/hr-review.csv",
});

const importedEmbeddedReview = importReviewerDecisionContents(
  `claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
`,
);
const importedEmbeddedReviewWithOptions = importReviewerDecisionContents({
  reviewCsvContent: `claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
`,
});

const importedEmbeddedReviewResult = importReviewerDecisionContentsResult(
  `claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive free catered lunch every day.,unsupported,No approved source matched strongly enough,,,unsupported,Needs People Ops review
`,
  ["unsupported"],
);
const importedEmbeddedReviewResultWithOptions = importReviewerDecisionContentsResult({
  reviewCsvContent: `claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive free catered lunch every day.,unsupported,No approved source matched strongly enough,,,unsupported,Needs People Ops review
`,
  failOn: ["unsupported"],
});

const evaluationScorecards = await evaluateFixtures({
  fixtures: [
    {
      name: "HR policy fixture",
      answerPath: "examples/answers/hr-answer.md",
      answerLabel: "HR reviewer packet",
      sourceDirs: ["examples/sources"],
      expectedSummary: {
        verified: 1,
        contradicted: 1,
        unsupported: 1,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["contradicted", "verified", "unsupported"],
    },
  ],
});

const evaluationResult = await evaluateFixtureFilesResult({
  fixturePaths: [],
  fixtureDirPaths: ["examples/evaluations"],
});
```

The async in-memory verification helpers also accept `Uint8Array` answer
content for PDF and DOCX documents. Provide an `answerPath` ending in `.pdf`
or `.docx` so Quorum selects the matching document extractor; text answers
remain supported without a path.

When a fixture includes `expectedClaimVerdicts`, keep both its list length and
per-verdict counts aligned with `expectedSummary`; Quorum rejects contradictory
fixtures before they can produce misleading evaluation scorecards.

## HTTP API

For lightweight local integrations that prefer JSON over shelling out, Quorum
can also run a built-in HTTP server:

```bash
npm run dev -- serve --port 3000
```

See [docs/api-integration.md](docs/api-integration.md) for a focused
copy-paste guide covering verification, claim previews, request correlation,
fail-gated HTTP responses, binary PDF/DOCX uploads, and reviewer artifacts.
The new [API deployment guide](docs/api-deployment.md) records the local API's
authentication boundary, safe network placement, operational limits, and
durable source-ID conventions for deployers.
The guide also documents the discovery headers that expose the running service
version, OpenAPI path, request limits, and request-correlation ID to clients.
The machine-readable `/` and `/capabilities` responses additionally publish
the canonical response-header names for correlation, caching, and method
negotiation.
Their `capabilities.cors` object also publishes the browser request-header
allowlist, readable response headers, preflight cache duration, and the
configured origin allowlist, so browser integrations can discover the same CORS
policy from `/capabilities` or the generated OpenAPI examples.
It now includes the bootstrap flow for `/`, `/version`, `/readyz`, and `/livez`,
including header-only `HEAD` probes for deployment clients.
It now shows how agent workflows can send base64 answer and source bytes with
the required document extensions, and how to request queue-ready Markdown and
CSV artifacts in the response.

Available endpoints:

- `GET /`
- `HEAD /`
- `GET /capabilities`
- `HEAD /capabilities`
- `GET /health`
- `HEAD /health`
- `GET /healthz`
- `HEAD /healthz`
- `GET /readyz`
- `HEAD /readyz`
- `GET /livez`
- `HEAD /livez`
- `GET /version`
- `HEAD /version`
- `GET /openapi.json`
- `HEAD /openapi.json`
- `POST /verify`
- `POST /extract-claims`
- `POST /verify-batch`
- `POST /import-review`
- `POST /evaluate`

Every listed route also accepts `OPTIONS` and returns CORS preflight headers
for browser-based local clients.
Those preflight responses advertise the exact methods supported by the requested
path, so browser and generated clients do not mistake a POST-only workflow for
a GET or HEAD endpoint.
The API contract test exercises that route-scoped preflight behavior across
every discovered endpoint, including the shared request-header, exposed-header,
and ten-minute cache policy.
The `quorum serve --help` endpoint guide includes both `/readyz` readiness
entries, so Kubernetes deployment wiring is discoverable directly from the
CLI as well as this README.
The `POST /extract-claims` preview keeps independently capitalized policy
clauses separated by semicolons as distinct atomic claims, matching the CLI
claim-extraction behavior used before evidence verification.
Route matching uses the pathname, so harmless query parameters remain compatible
with readiness probes and claim-preview clients.
The package exports `HEALTH_PATH`, `HEALTHZ_PATH`, `READYZ_PATH`, and
`LIVEZ_PATH` alongside the server helpers, so embedded clients and deployment
manifests can reference the readiness and liveness probe paths without
duplicating route strings.
The server allows all browser origins by default for local development; pass
`--cors-origin <origin>` (repeatable) to `quorum serve` or
`corsAllowedOrigins` to `startApiServer` when a deployed client should be
restricted to an explicit origin allowlist. Disallowed origins receive no
`Access-Control-Allow-Origin` response header. The packaged smoke check starts
the CLI with an explicit origin and verifies both allowed and denied browser
responses, keeping the deployable command path aligned with the programmatic
server contract.
POST-only route errors return an `Allow: POST` header, and the generated
OpenAPI contract documents that header so integration clients can recover from
wrong-method calls without hard-coding the route contract. The `Allow` header is
also exposed through CORS so browser clients can inspect the recovery hint.
The generated request contract keeps reviewer `queueStatus` filtering scoped to
`POST /import-review`; ordinary `/verify` requests do not advertise or apply
that queue-only option.
The server bounds each request to 30 seconds by default so a stalled client
cannot hold a workflow listener indefinitely; `quorum serve` can override that
limit with `--request-timeout-ms <milliseconds>`, while integrations embedding
`createApiServer` or `startApiServer` can use `requestTimeoutMs`. Both options
require a positive safe integer number of milliseconds, so invalid timeout
configuration fails instead of silently weakening the request-boundary
contract. The packaged smoke check starts the CLI server with a custom timeout
and verifies that discovery headers expose the configured value.
JSON request bodies are limited to 1 MiB by default; use
`quorum serve --max-request-bytes <bytes>` or the `maxRequestBytes` option on
`createApiServer`/`startApiServer` when API clients need to upload larger
base64-encoded PDF or DOCX content. The effective limit is advertised through
`X-Quorum-Max-Request-Bytes`, `/capabilities`, and the served OpenAPI document.
All `/health`, `/healthz`, `/readyz`, and `/livez` probe responses include
`Cache-Control: no-store` so a proxy or load balancer cannot reuse a stale
healthy response during an outage; the OpenAPI contract documents that header
for both `GET` and `HEAD` probe calls.
All JSON API responses, including verification reports, reviewer imports,
evaluation results, claim previews, and API errors, also include
`Cache-Control: no-store` so intermediaries do not retain evidence or reviewer
decision data from a workflow request. The generated OpenAPI response contract
declares that same `Cache-Control` header for successful, fail-gated, and error
responses so generated clients can preserve the no-store behavior explicitly.
The API test suite verifies this header across discovery, capability, version,
OpenAPI, claim-preview, verification, and error responses.
Browser clients can also preflight `If-None-Match`, so conditional OpenAPI
revalidation works across the documented CORS integration path.
Preflight responses also advertise a ten-minute `Access-Control-Max-Age`, so
browser integrations can reuse the stable route and header contract without
repeating the preflight on every request.
The exposed CORS header list is canonical and duplicate-free, so browser clients
can consume each discovery and caching header once.
The `/readyz` alias provides the same uncached readiness contract for Kubernetes
probes and deployment systems that use the conventional readiness path.
The `/livez` alias provides the same uncached health response for Kubernetes
liveness probes, so deployments can distinguish process liveness from readiness.
The discovery payload keeps each method/path pair unique so generated clients
can build a stable endpoint inventory without de-duplicating it first.
The built `npm run smoke` check now exercises that discovery contract over HTTP,
including preflight headers, the packaged `POST /extract-claims` workflow, and
stable OpenAPI operation identifiers. It also checks that packaged
`HEAD /readyz` and `HEAD /livez` calls return uncached probe headers with no
response body, so deployment clients can validate both Kubernetes aliases
before routing traffic.
The `quorum serve --help` output also lists `POST /extract-claims`, keeping the
CLI server guide aligned with the claim-preview endpoint exposed to integrations,
along with the dedicated `GET` and `HEAD /version` compatibility probes.

Single-answer verification request example:

```bash
curl -s http://127.0.0.1:3000/verify \
  -H 'content-type: application/json' \
  -d '{
    "answer": "Employees receive 12 weeks of paid parental leave.",
    "answerLabel": "HR reviewer packet",
    "generatedAt": "2026-07-07T19:15:00.000Z",
    "sources": [
      {
        "sourcePath": "sources/hr-policy.md",
        "content": "---\ntitle: HR Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n"
      }
    ],
    "failOn": ["contradicted"]
  }'
```

Claim extraction accepts `{ answer }` and returns the same normalized atomic
claims used by verification, without requiring source documents. The response
also includes a normalized, truncated `answerPreview` so queue consumers can
recognize the payload without retaining the original request. Callers can
also pass `answerPath` and `answerLabel` to preserve reviewer context in the
response:

```bash
curl -s http://127.0.0.1:3000/extract-claims \
  -H 'content-type: application/json' \
  -d '{"answer":"Employees receive 12 weeks of paid parental leave.","answerPath":"answers/hr-answer.md","answerLabel":"HR reviewer packet"}'
```

Batch verification uses the same source shape and accepts an `answers` array of
`{ answer, answerPath?, answerLabel? }` objects at `POST /verify-batch`. For
document uploads, use `{ answerBase64, answerPath, answerLabel? }` instead; the
`.pdf` or `.docx` suffix selects the extractor. The packed smoke check covers a
base64 PDF answer in this batch workflow so binary agent uploads stay verified
end to end.
`POST /verify`, `POST /verify-batch`, and `POST /evaluate` also accept an
optional `generatedAt` timestamp so workflow runners can keep report output
stable across retries and fixture snapshots.
All `POST` endpoints require a JSON media type and return `415` when callers
send a different media type. Standard `application/json` (with optional
parameters) and vendor `application/*+json` types are accepted, so typed
workflow clients can use a domain-specific JSON media type without changing
the request envelope. The packaged smoke check verifies a vendor media type
through the built CLI server. API discovery and `/capabilities` advertise both
accepted JSON media-type forms so generated clients can choose either one.
JSON request bodies are limited to 1 MiB; larger payloads return `413` before
verification or evaluation starts so an oversized workflow input cannot cause
unbounded request buffering.
The packaged `npm run smoke` check also sends an oversized verification request
through the built CLI server and verifies the documented status, error, and
request-limit headers.
The HTTP verification endpoints also accept `answerBase64` and
`contentBase64` fields when an agent workflow needs to send PDF or DOCX bytes
inside the JSON request; each field is mutually exclusive with its text
counterpart, and the original `.pdf` or `.docx` path selects the extractor.
The packaged smoke check covers a base64 PDF answer through both the single
`POST /verify` and batch `POST /verify-batch` workflows, keeping direct and
queued binary uploads verified end to end. It also verifies a base64 PDF source
through the packaged single-answer HTTP workflow, including its explicit title
and trust metadata, so binary policy uploads stay traceable as approved evidence.
Successful responses mirror Quorum's existing `verifyAnswerContentsResult` and
`verifyAnswerBatchContentsResult` shapes so workflow callers get the report,
matched fail verdicts, and `shouldFail` status in one JSON payload.
Every API response includes an `X-Quorum-Request-Id` correlation header; callers
may provide a valid value on the request to keep logs and downstream workflow
events tied to their own trace.
The generated OpenAPI document declares that caller-supplied header as an
optional reusable request parameter, so generated clients can preserve the
same trace without hand-maintaining transport metadata.
Successful discovery, capability, health, and version JSON responses also copy
that correlation value into a `requestId` field, so clients that persist only
response bodies retain the same audit trail.
Reviewer-decision import accepts a `{ reviewCsvContent, generatedAt?, failOn? }` JSON body at
`POST /import-review` and returns the same `importReviewerDecisionContentsResult`
shape used by the package API, including grouped answer summaries and
reviewer-aware fail-policy matches.
Evaluation accepts a `{ fixtures }` JSON body at `POST /evaluate`, where each
fixture entry includes `{ fixturePath, content }`, and returns the same
`evaluateFixtureContentsResult` batch shape used by the package API so
workflow callers can score benchmark fixtures without writing them to disk.
That structured result now includes an aggregate `summary` object with
`fixtureCount`, `mismatchCount`, `matchedClaims`, `totalExpectedClaims`, a numeric-or-null
`score`, and a human-readable `scoreLabel`, so local runners can gate
evaluation drift without re-rendering the text or HTML scorecard.
Fixture JSON may also embed inline `answer` and `sources` content so callers
can send a self-contained benchmark payload while still preserving an
`answerPath` trace in the returned scorecard. The generated OpenAPI contract
now describes that JSON-encoded fixture document, including its answer, source,
domain, and expected-verdict fields, so typed API clients can discover the
inline format without reverse-engineering the example payload.
API and in-memory source inputs may also include explicit `title`,
`updatedAt`, and `trustLevel` fields when a caller wants to preserve source
metadata without rewriting the raw document content; those explicit fields take
precedence over any frontmatter or HTML metadata already embedded in the
source body.
`GET /version` returns the service name and HTTP contract version for clients
that need a dedicated compatibility probe without parsing readiness or
discovery payloads. `GET /` returns a small JSON endpoint index plus capability metadata for
supported HTTP methods, accepted JSON request content types, the maximum JSON
request size, source extensions, answer extensions, verdicts, trust levels, and
opt-in artifact names for each workflow surface, while `GET /capabilities`
returns just that capability contract when a local client does not need the
endpoint listing. `GET /healthz` and `HEAD /healthz` mirror `/health` for load
balancers and orchestrators that expect the conventional probe path. `HEAD /`,
`HEAD /capabilities`, `HEAD /health`, `HEAD /healthz`, and `HEAD /openapi.json`
expose the same status code and headers without a JSON body, which makes
lightweight readiness probes and schema checks easier to wire into orchestrators
and load balancers.
The end-to-end smoke gate also verifies that `/openapi.json` preserves its
stable `ETag` across `GET` and `HEAD`, and returns `304 Not Modified` for a
matching `If-None-Match` validator.
Those responses also include `X-Quorum-Service`, `X-Quorum-Version`,
`X-Quorum-OpenAPI-Path`, `X-Quorum-Max-Request-Bytes`, and
`X-Quorum-Request-Timeout-Ms` headers so callers can confirm they reached
Quorum, discover the local schema path, and learn the JSON payload and request
duration limits without parsing a response body first. Browser clients can
read those discovery headers directly because Quorum also exposes them through
`Access-Control-Expose-Headers`; a custom `requestTimeoutMs` server option is
reflected in the timeout header.
Browser clients may also send their own `X-Quorum-Request-Id` value because
Quorum allows that correlation header during CORS preflight; the server echoes
valid values and generates one when the header is absent or invalid.
Error responses now include the same `requestId` in their JSON payload as the
`X-Quorum-Request-Id` response header, so failed requests remain traceable even
for clients that persist response bodies instead of headers.
Successful `POST /verify`, `POST /verify-batch`, `POST /import-review`, and
`POST /evaluate` responses now include that same `requestId` in their JSON
envelope too, so audit records can retain the correlation value without storing
response headers separately.
`POST /extract-claims` previews the normalized `{ id, text }` claim objects used
by verification and returns the same `requestId` in its JSON response and
`X-Quorum-Request-Id` header. It also accepts `answerBase64` for text, PDF, and
DOCX answer content when `answerPath` identifies the document format. Its OpenAPI operation IDs, CORS preflight, and
request-correlation contract are covered by both the TypeScript API suite and the packed-package smoke
check, keeping browser and generated-client integrations aligned. `GET /openapi.json` returns a machine-readable OpenAPI 3.1 description so local
workflow clients can discover both request and response payload shapes without
scraping the README. The OpenAPI document includes reusable schemas for the
discovery, claim extraction, verify, batch verify, import-review, and evaluate responses so
typed local clients can generate against the same contract as the CLI-backed
server. Every documented operation also has a stable `operationId` for generated
client methods, tracing, and route-level integration tests. The document includes
concrete success, fail-on `409`, and common error response examples
for each POST workflow so agent callers can inspect realistic payloads before wiring
up typed integrations. Browser-based local tooling can call the same endpoints directly
because the server replies with permissive CORS headers and handles `OPTIONS`
preflight requests for JSON clients. Routes are matched by pathname, so discovery,
readiness, schema, and POST workflow requests continue to work when clients append
harmless query strings for probes, tracing, or transport preferences.
`POST /verify`, `POST /verify-batch`, `POST /import-review`, and
`POST /evaluate` also accept an `includeArtifacts` array when callers want the
JSON response to embed reviewer-facing text, Markdown, HTML, CSV, or
gate-aware `result_json` artifacts without writing files first. The
`result_json` artifact on each workflow is the same response envelope without
the `artifacts` field, so callers can persist or forward it without rebuilding
the result locally. Evaluation responses can also embed a `domain_summary_csv` artifact
so workflow callers can route fixture results by domain without recomputing
the aggregate rollup, plus an
`aggregate_summary_csv` artifact for one-row overall benchmark gating.
The `POST /import-review` `summary_csv` artifact applies the request's
`failOn` policy, so queue consumers can route imported answer groups using the
same matched verdicts returned in `failVerdicts`.
No-claim answers remain explicit reviewer work items in HTTP artifacts: their
summary rows preserve the answer label and preview, set `answer_has_claims` to
`false`, and report `needs_review` with the standard no-claims reason.
Those same POST endpoints also accept `failOnStatus: true` when local
orchestrators want Quorum to return HTTP `409` for matched fail policies or
evaluation mismatches instead of always returning `200`, which lets workflow
gates block risky outputs without parsing the body first.
Node integrations that want to embed the server directly can now import
`createApiServer`, `startApiServer`, `createOpenApiDocument`, and stable discovery metadata such as
`API_ENDPOINTS`, `CAPABILITIES_PATH`, and `OPENAPI_PATH` plus the typed
`ApiDiscoveryResponse`, `ApiCapabilitiesResponse`, `ApiHealthResponse`, and
`OpenApiDocumentOptions` contracts from the main `quorum` entrypoint,
while `quorum/server` remains available for callers that prefer the dedicated
subpath. The packed-package smoke check verifies successful and fail-gated
single- and batch-CLI invocations, including persisted `verify-batch
--result-json` gate payloads, then starts the server through both entrypoints
and exercises the OpenAPI contract plus a fail-gated `POST /verify` request,
so published npm installs keep the root and dedicated server exports in sync
with the discoverable workflow response contract.

For local tooling that wants Quorum's OpenAPI contract without booting an HTTP
listener first, `createOpenApiDocument` returns the same schema served at
`GET /openapi.json`:

```ts
import { createOpenApiDocument } from "quorum";

const openApi = createOpenApiDocument({
  serverUrl: "http://127.0.0.1:3000",
});

console.log(openApi.openapi);
console.log(openApi.paths["/verify"]?.post?.summary);
```

Teams that prefer shell-based automation can export the same contract without
starting the server via `quorum openapi [--server-url <url>] [--out <path>]`.

`verifyAnswerFile` accepts either positional arguments or a single options
object with `answerPath`, `sources`, `generatedAt`, and `answerLabel`.
`verifyAnswerFileResult` mirrors that flexibility: callers can pass either a
single options object or positional arguments, using a third `failOn` array for
the short form or the full `(answerPath, sources, generatedAt, answerLabel,
failOn)` signature when they need all single-answer controls. The single-file
options objects for `verifyAnswerFileInputs` and `verifyAnswerFileInputsResult`
also accept `answerLabel`, so workflow callers can keep a reviewer-facing label
on single-answer file reports without mutating the returned report object.

For workflow runners that want the same recursive file discovery as the CLI,
`verifyAnswerFileInputs` and `verifyAnswerFileInputsResult` accept the same
`sourcePaths` plus `sourceDirs` shape as the CLI for a single answer, and
`verifyAnswerBatchFileInputs` and `verifyAnswerBatchFileInputsResult` extend
that same one-call pattern to batch file verification. Quorum also exports
`resolveSourcePaths`, `resolveAnswerPaths`, and
`resolveEvaluationFixturePaths` so callers can expand explicit files plus
nested directories in the same stable order before handing the results to
verification or evaluation helpers:

```ts
import {
  resolveAnswerPaths,
  resolveEvaluationFixturePaths,
  resolveSourcePaths,
  ANSWER_EXTENSIONS,
  SOURCE_EXTENSIONS,
} from "quorum";

const sourcePaths = await resolveSourcePaths([], ["examples/sources"]);
const answerPaths = await resolveAnswerPaths([], ["examples/answers"]);
const fixturePaths = await resolveEvaluationFixturePaths([], ["examples/evaluations"]);
const supportedSourceExtensions = [...SOURCE_EXTENSIONS];
const supportedAnswerExtensions = [...ANSWER_EXTENSIONS];
```

Workflow integrations can also reuse Quorum's reviewer-facing naming and
preview logic without reimplementing path parsing or HTML cleanup.
`renderAnswerLabel`, `renderAnswerLabels`, and `renderAnswerPreview` mirror the
same behavior used by the CLI, reviewer CSVs, and HTML reports.
`SOURCE_EXTENSIONS` and `ANSWER_EXTENSIONS` expose the same supported file
types that Quorum uses for recursive source and answer discovery, so workflow
callers can prefilter uploads or filesystem scans without duplicating that
internal list.

For in-memory callers, `verifyAnswer(answerText, sources)` remains available for
teams that already manage file I/O themselves, and `verifyAnswers({ answers,
sources })` batches multiple in-memory agent responses without writing temp
files first:

```ts
const embeddedSingle = await verifyAnswerContents({
  answer: "Refunds are available for 30 days from the purchase date.",
  answerLabel: "support-agent draft",
  sources: [
    {
      sourcePath: "help/refunds.html",
      content: "<html><body><main><p>Refunds are available for 30 days from the purchase date.</p></main></body></html>",
    },
  ],
  defaultTrustLevel: "high",
});

const embeddedSingleResult = verifyAnswerResult({
  answer: "Employees receive 16 weeks of paid parental leave.",
  answerLabel: "HR escalation draft",
  sources,
  failOn: ["contradicted"],
});

const embeddedRawResult = await verifyAnswerContentsResult({
  answer: "Refunds are available for 30 days from the purchase date.",
  sources: [
    {
      sourcePath: "help/refunds.html",
      content: "<html><body><main><p>Refunds are available for 30 days from the purchase date.</p></main></body></html>",
    },
  ],
  failOn: ["contradicted"],
});

const inMemoryBatch = verifyAnswers({
  answers: [
    {
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerPath: "hr-agent/latest-response.md",
    },
    {
      answer: "Refunds are available for 30 days from the purchase date.",
      answerLabel: "support-agent draft",
    },
  ],
  sources,
  failOn: ["contradicted"],
});

const inMemoryBatchResult = verifyAnswersResult({
  answers: [
    {
      answer: "Employees receive 16 weeks of paid parental leave.",
      answerLabel: "HR escalation draft",
    },
  ],
  sources,
  failOn: ["contradicted"],
});

const embeddedSources = await loadSourcesFromContent({
  sources: [
    {
      sourcePath: "policies/hr-policy.md",
      content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
    },
    {
      sourcePath: "help/refunds.html",
      content: "<html><body><main><p>Refunds are available for 30 days from the purchase date.</p></main></body></html>",
    },
  ],
  defaultTrustLevel: "medium",
});

const embeddedBatch = verifyAnswers({
  answers: [
    {
      answer: "Refunds are available for 30 days from the purchase date.",
      answerLabel: "support-agent draft",
    },
  ],
  sources: embeddedSources,
});

const embeddedBatchWithRawSources = await verifyAnswerBatchContents({
  answers: [
    {
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerPath: "hr-agent/latest-response.md",
    },
    {
      answer: "Refunds are available for 14 days from the purchase date.",
      answerLabel: "support escalation",
    },
  ],
  sources: [
    {
      sourcePath: "policies/hr-policy.md",
      content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
    },
    {
      sourcePath: "help/refunds.html",
      content: "<html><body><main><p>Refunds are available for 30 days from the purchase date.</p></main></body></html>",
    },
  ],
  failOn: ["contradicted"],
});

const embeddedBatchWithRawSourcesResult = await verifyAnswerBatchContentsResult({
  answers: [
    {
      answer: "Refunds are available for 14 days from the purchase date.",
      answerLabel: "support escalation",
    },
  ],
  sources: [
    {
      sourcePath: "help/refunds.html",
      content: "<html><body><main><p>Refunds are available for 30 days from the purchase date.</p></main></body></html>",
    },
  ],
  failOn: ["contradicted"],
});
```

The `*Result` helpers wrap a single verification report with `shouldFail` and
`failVerdicts`, so embedded callers can apply the same fail-policy logic as
the CLI without converting one answer into a batch request. Batch workflows
can now use `verifyAnswerBatchResult`, `verifyAnswerBatchFileInputsResult`,
`verifyAnswersResult`, and `verifyAnswerBatchContentsResult` for the same
top-level `shouldFail` and `failVerdicts` summary across a full answer set.
TypeScript consumers can also reuse named option types such as
`SingleVerificationResultOptions` and
`InMemorySingleVerificationResultOptions` when they want those fail-policy
inputs to stay explicit in their own workflow wrappers.

Evaluation workflows can also keep fixture definitions in memory and score them
in one call, which helps agent teams avoid writing temp fixture JSON files:

```ts
const scorecards = await evaluateFixtures({
  fixtures: [
    {
      name: "Support policy fixture",
      domain: "support",
      answerPath: "examples/answers/support-answer.md",
      sourceDirs: ["examples/sources"],
      expectedSummary: {
        verified: 1,
        contradicted: 1,
        unsupported: 1,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["contradicted", "verified", "unsupported"],
    },
  ],
  generatedAt: "2026-07-05T19:00:00.000Z",
});
```

Those in-memory fixtures can also embed an inline `answer` string and inline
`sources` entries when a workflow wants a portable scorecard payload without
writing separate answer or source files to disk. `answerPath` still acts as the
reviewer-facing traceability path in the resulting scorecard and reports.
`expectedClaimVerdicts`, when present, should include one entry per expected
claim across the totals declared in `expectedSummary`.

Reviewer import helpers such as `importReviewerDecisions` and
`renderReviewerDecisionImportMarkdownReport` are also exported for teams that
already manage CSV content in memory. `importReviewerDecisionContents` and
`importReviewerDecisionContentsResult` provide the same workflow-oriented API
shape as the verify helpers when callers already have CSV text, while
`importReviewerDecisionsResult` and `importReviewerDecisionFileResult` wrap
those imported reports with
`shouldFail` and `failVerdicts`, so workflow callers can enforce the same
reviewer-aware fail policy as `import-review --fail-on` without reimplementing
summary checks. Verification report helpers such as
`renderTextReport`, `renderMarkdownReport`, `renderHtmlReport`,
`renderReviewerDecisionCsv`, and the batch renderer variants are exported too,
so package consumers can generate the same human-review artifacts as the CLI.
`verifyAnswerContents` gives embedded callers a one-call path for a single
answer plus raw source content, while `loadSourcesFromContent` still exposes
the same Markdown, HTML, and PDF parsing behavior for callers that want to
reuse a loaded source set across multiple answers. `verifyAnswerBatchContents`
extends that same one-call pattern to in-memory answer batches when callers do
not want to pre-load `SourceDocument[]` themselves.
Fail-policy helpers such as `CLAIM_VERDICTS`, `parseClaimVerdict`,
`matchingFailVerdicts`, and `shouldFailReport` are exported too, so workflow
integrations can validate config and apply the same verdict gating rules as
the CLI without duplicating Quorum's `needs_review` edge-case handling for
empty claim sets.

```ts
import {
  matchingFailVerdicts,
  parseClaimVerdict,
  shouldFailReport,
  verifyAnswerContentsResult,
} from "quorum";

const failOn = ["contradicted", "needs_review"].map(parseClaimVerdict);
const result = await verifyAnswerContentsResult({
  answer: "Short.",
  sources: [
    {
      sourcePath: "policies/hr-policy.md",
      content: "Employees receive 12 weeks of paid parental leave.",
    },
  ],
});

console.log(result.shouldFail);
console.log(matchingFailVerdicts(result.report, failOn));
console.log(shouldFailReport(result.report, failOn));
```

For fixture-driven evaluation work, Quorum also exports
`loadEvaluationFixture`, `loadEvaluationFixtureFromContent`,
`evaluateFixtureContent`, `evaluateFixtureContents`, `evaluateFixtureFile`, `evaluateFixtureFiles`,
`renderEvaluationScorecard`, `renderEvaluationTextReport`,
`renderEvaluationMarkdownReport`, `renderEvaluationHtmlReport`,
`renderEvaluationSummaryCsv`, `renderEvaluationDomainSummaryCsv`,
`renderEvaluationAggregateSummaryCsv`, and
`hasEvaluationMismatch` so teams can keep HR or support benchmark cases in
versioned JSON files, discover nested fixture directories, and score the
current verifier against expected verdicts:

```ts
import {
  evaluateFixtureContent,
  evaluateFixtureContents,
  evaluateFixtureFile,
  evaluateFixtureFiles,
  renderEvaluationHtmlReport,
  renderEvaluationAggregateSummaryCsv,
  hasEvaluationMismatch,
  loadEvaluationFixtureFromContent,
  renderEvaluationDomainSummaryCsv,
  renderEvaluationMarkdownReport,
  renderEvaluationScorecard,
  renderEvaluationSummaryCsv,
  renderEvaluationTextReport,
} from "quorum";

const scorecard = await evaluateFixtureFile({
  fixturePath: "examples/evaluations/hr-policy.json",
});
console.log(renderEvaluationScorecard(scorecard));

const scorecards = await evaluateFixtureFiles({
  fixturePaths: [],
  fixtureDirPaths: ["examples/evaluations"],
});

console.log(renderEvaluationTextReport(scorecards));
console.log(renderEvaluationMarkdownReport(scorecards));
console.log(renderEvaluationHtmlReport(scorecards));
console.log(renderEvaluationSummaryCsv(scorecards));
console.log(renderEvaluationDomainSummaryCsv(scorecards));
console.log(renderEvaluationAggregateSummaryCsv(scorecards));
console.log(scorecards.some(hasEvaluationMismatch));
```

For embedded runners that already have fixture JSON in memory, Quorum can load
and evaluate those definitions without writing temporary fixture files first:

```ts
const fixtureJson = JSON.stringify({
  name: "Support policy fixture",
  domain: "support",
  answerPath: "../answers/support-answer.md",
  sourceDirs: ["../sources"],
  expectedSummary: {
    verified: 1,
    contradicted: 1,
    unsupported: 1,
    needs_review: 0,
  },
  expectedClaimVerdicts: ["contradicted", "verified", "unsupported"],
});

const fixture = loadEvaluationFixtureFromContent(fixtureJson);
const embeddedScorecard = await evaluateFixtureContent({
  fixturePath: "examples/evaluations/support-policy.json",
  content: fixtureJson,
});
const embeddedScorecards = await evaluateFixtureContents({
  fixtures: [
    {
      fixturePath: "examples/evaluations/support-policy.json",
      content: fixtureJson,
    },
  ],
});

console.log(fixture.name);
console.log(renderEvaluationScorecard(embeddedScorecard));
console.log(renderEvaluationScorecard(embeddedScorecards[0]));
```

`evaluateFixtureFile` and `evaluateFixtureFileResult` accept either a fixture
path string or an options object with `fixturePath` and `generatedAt`, which
keeps single-fixture evaluation calls consistent with Quorum's other file-based
programmatic helpers.

Batch result helpers, including `evaluateFixturesResult`, enforce the optional
`minScore` threshold and return `scoreThresholdPassed` alongside `shouldFail`,
so in-memory evaluation gates behave consistently with file-backed and HTTP
evaluation workflows.

Each evaluation fixture can mix explicit `sourcePaths` with recursive
`sourceDirs`, so domain scorecards can point at a maintained source bundle
without rewriting every fixture when a benchmark adds another approved
document. Fixtures can also set `domain` to label HR, support, or other
benchmark groups explicitly in scorecards and summary CSVs, plus `answerLabel`
to preserve the reviewer-facing name of an answer alongside its file path.
Evaluation scorecards and `--summary-csv-out` exports preserve those configured
source directories, resolved source files, optional domains, optional answer
labels, and reviewer-friendly answer previews so drift reviews can see both
the maintained bundle and the reviewer context loaded for each answer.
Inline evaluation sources may also set an `id` such as
`people-ops/hr-policy@2026-07-08`; Quorum carries that durable identifier into
the scorecard report and claim evidence so benchmark failures remain traceable
even when the fixture uses in-memory source content.

The CLI can run those same fixtures directly:

```bash
npm run dev -- evaluate \
  --fixture examples/evaluations/hr-policy.json \
  --fixture examples/evaluations/support-policy.json \
  --markdown-out reports/evaluation-report.md \
  --html-out reports/evaluation-report.html \
  --summary-csv-out reports/evaluation-summary.csv \
  --domain-summary-csv-out reports/evaluation-domain-summary.csv \
  --aggregate-summary-csv-out reports/evaluation-aggregate-summary.csv \
  --fail-on-mismatch
```

Or point Quorum at a fixture directory and let it discover nested JSON fixtures:

```bash
npm run dev -- evaluate \
  --fixture-dir examples/evaluations \
  --fail-on-mismatch
```

`evaluate` prints one scorecard per fixture, highlights claim-level verdict
mismatches, can write Markdown and HTML reports for async review, can write a
one-row-per-fixture summary CSV with answer previews for spreadsheet or CI
triage, and can exit with status code `2` when a labeled benchmark drifts. The
shipped fixture directory includes multiple HR and support policy examples,
including an exported HTML support-policy sample, so teams can exercise both
domains with `--fixture-dir examples/evaluations`.

## Quick Start

```bash
git clone https://github.com/nash226/quorum.git
cd quorum
npm install
npm run check
npm run dev -- verify --answer examples/answers/hr-answer.md --source-dir examples/sources --out reports/hr-report.json --markdown-out reports/hr-report.md --html-out reports/hr-report.html --review-csv-out reports/hr-review.csv
```

## Source Metadata

Source files may include optional frontmatter metadata with either `---` or
`+++` delimiters. `---` frontmatter uses YAML-style `key: value` pairs, while
`+++` frontmatter accepts TOML-style `key = value` pairs:

```markdown
---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
---
```

```toml
+++
title = "HR Benefits Policy"
updatedAt = "2026-05-31"
trustLevel = "high"
+++
```

Quorum includes this metadata in reports so reviewers can see which approved
source supported or contradicted each claim. `trustLevel` accepts `high`,
`medium`, or `low` and helps Quorum prefer stronger approved sources when
multiple passages are similarly relevant. When trust and relevance are similar,
Quorum also prefers fresher approved sources based on `updatedAt`. Sources
without a trust level default to `medium`.

For exported HTML knowledge-base pages, Quorum also picks up common publish-time
metadata such as `<meta property="article:modified_time">` or
`<meta name="last-modified">`, `<meta http-equiv="last-modified">`, and common
Dublin Core fields such as `<meta name="dc.title">` or
`<meta name="dcterms.modified">`. It also reads common Schema.org-style
metadata such as `<meta itemprop="headline">` and
`<meta itemprop="dateModified">`. Quorum also accepts
`<meta name="quorum-trust-level" content="high">` when teams want to preserve a
review trust level alongside the HTML export.

For PDF source documents, Quorum also reads embedded document info such as the
PDF `Title` and modification date when those fields are present. DOCX source
documents are converted to readable text before claim extraction, so Word-based
HR and support policies can enter the same verification workflow without a
manual export step.

When approved sources do not yet include frontmatter, the CLI can override that
default during verification:

```bash
npm run dev -- verify \
  --answer examples/answers/hr-answer.md \
  --source-dir examples/sources \
  --default-trust-level high
```

## CLI Usage

```text
quorum verify --answer <path|-> (--source <path> | --source-dir <path>) [--answer-label <label>] [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
quorum verify-batch (--answer <path|-> | --answer-dir <path>)... (--source <path> | --source-dir <path>) [--default-trust-level <level>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--review-csv-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
quorum import-review --review-csv <path|-> [--queue-status <pending|reviewed|no_claims>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--fail-on <verdict>]
quorum evaluate (--fixture <path> | --fixture-dir <path>)... [--domain <name>]... [--generated-at <timestamp>] [--min-score <0..1>] [--json] [--out <path>] [--markdown-out <path>] [--html-out <path>] [--summary-csv-out <path>] [--domain-summary-csv-out <path>] [--aggregate-summary-csv-out <path>] [--fail-on-mismatch]
quorum openapi [--server-url <url>] [--out <path>]
```

Options:

- `--answer <path|->`: AI-generated answer to verify, including Markdown, text,
  or exported HTML, or `-` to read the answer from stdin
- `verify --answer-label <label>`: override the default path-derived
  `answer_label` for reviewer CSVs, summary CSVs, JSON, and HTML/Markdown
  reports
- `--source <path>`: approved source document; may be repeated
- `--source-dir <path>`: directory of approved source documents
- `--answer <path|->`: answer file to include in a batch run, or `-` to read one answer from stdin once; Markdown, text, and exported HTML paths may be repeated
- `--answer-dir <path>`: directory of AI-generated answers for batch verification
- `--review-csv <path|->`: reviewer decision CSV to import, or `-` to read from stdin
- `--default-trust-level <level>`: use `high`, `medium`, or `low` for sources
  that do not define `trustLevel` metadata
- `--json`: print the full JSON report
- `--out <path>`: write the JSON report to disk
- single-answer JSON reports include `answerPath`, `answerLabel`, and
  `answerPreview` so downstream automation gets the same reviewer context as
  CSV exports
- `--markdown-out <path>`: write a reviewer-friendly Markdown report to disk
- `--html-out <path>`: write a styled HTML reviewer report to disk
- `verify --summary-csv-out <path>`: write one CSV row for the submitted answer with a `generated_at` timestamp plus its `answer_label`, preview, primary finding, primary evidence trust/freshness/path context, verdict totals, fail-policy status, and reviewed source metadata
- `verify-batch --markdown-out <path>`: write a batch summary in Markdown for review queues
- `verify-batch --html-out <path>`: write a styled batch summary in HTML for demos and reviewers
- `verify-batch --review-csv-out <path>`: write one combined reviewer decision CSV across all answers, including an `answer_label` column for faster spreadsheet triage alongside the original `answer_path`
- `verify-batch --summary-csv-out <path>`: write one CSV row per answer with a shared `generated_at` timestamp plus an `answer_label`, `answer_preview`, the highest-priority claim finding, primary evidence title plus trust/freshness/path metadata, verdict totals, fail-policy status, the verdicts that triggered it, and the approved source metadata used for that batch run
- `verify-batch --aggregate-summary-csv-out <path>`: write one CSV row with batch answer-routing totals, verdict totals, and approved-source context for queue dashboards and handoffs
- `verify-batch --answer-label <label>`: apply a reviewer-facing label to the most recent explicit `--answer` input without changing the stored `answer_path`
- `verify-batch --answer -`: pipe one generated answer into a batch run while still mixing in file-based answers for queue-style review
- teams can use `--summary-csv-out` for queue-level routing while keeping `--review-csv-out` for claim-by-claim reviewer decisions on the same batch run
- `--review-csv-out <path>`: write a CSV template for reviewer verdicts and notes, including a run-level `generated_at` timestamp, a reviewer-friendly `answer_label`, the original `answer_preview`, answer-level fail-policy status and fail verdicts, and evidence titles, trust levels, source paths, scores, and quotes
- reviewer CSV exports now include `answer_has_claims` so empty answers still survive spreadsheet review and `import-review` handoffs
- reviewer CSV exports also include `evidence_updated_at` so spreadsheet reviewers can see source freshness beside each claim
- reviewer and summary CSV exports include run-level `generated_at` timestamps plus source-path provenance so reviewers can trace each claim back to the exact approved file
- single-answer and batch reviewer CSV exports include both `answer_path` and `answer_preview` so review imports keep answer provenance and quick reviewer context
- `--fail-on <verdict>`: exit with code `2` when that verdict appears; may be
  repeated
- `import-review --review-csv <path>`: import a filled reviewer decision CSV and
  summarize final verdicts plus reviewer overrides; batch review CSV imports
  also preserve both `answer_label` and `answer_path` context
- `import-review --out <path>`: write the imported reviewer decision summary as
  JSON
- `import-review --markdown-out <path>`: write the imported reviewer decision
  summary as a reviewer-friendly Markdown handoff
- `import-review --html-out <path>`: write the imported reviewer decision
  summary as a polished HTML handoff for review meetings and approvals
- `import-review --summary-csv-out <path>`: write one CSV row per imported
  answer group with a `generated_at` timestamp plus an `answer_has_claims`
  routing flag, the primary final finding, reviewer/model rationale,
  primary evidence title plus trust/freshness/path/score/quote context,
  reviewed/pending status, reviewer overrides, and final verdict totals
- `import-review --queue-status <pending|reviewed|no_claims>`: emit only answer
  groups in one reviewer queue state, with filtered claims and totals for a
  targeted handoff
- `import-review --fail-on <verdict>`: exit with code `2` when that final
  reviewer-aware verdict appears after any overrides; may be repeated
- `evaluate --fixture <path>`: run one evaluation fixture JSON file; may be
  repeated to score multiple labeled examples in one pass
- `evaluate --fixture-dir <path>`: recursively discover evaluation fixture JSON
  files under one or more directories, preserving stable path order
- `evaluate --domain <name>`: restrict a fixture run to one or more domain
  labels such as `hr` or `support`
- `evaluate --min-score <0..1>`: exit with code `2` when the aggregate claim
  score is below the configured threshold
- `evaluate --json`: print the evaluation scorecard JSON for one fixture, or a
  JSON array when multiple fixtures are provided
- `evaluate --out <path>`: write the evaluation scorecard JSON to disk
- `evaluate --result-json-out <path>`: write the gate-aware evaluation result,
  including `shouldFail`, mismatch counts, aggregate score, and threshold
  metadata, to disk
- `evaluate --markdown-out <path>`: write a Markdown report that groups fixture
  summaries, expected vs actual verdict totals, and claim-level mismatches for
  async review
- `openapi --server-url <url>`: set the exported OpenAPI `servers[0].url`
  value for generated clients and workflow tooling
- `openapi --out <path>`: write the machine-readable OpenAPI 3.1 document to
  disk instead of stdout
- `evaluate --html-out <path>`: write a styled HTML evaluation report for
  reviewer walkthroughs, demos, and benchmark drift review
- `evaluate --summary-csv-out <path>`: write one CSV row per fixture with its
  `generated_at` timestamp plus the fixture path, optional domain, answer path, source directories, source
  paths, summary match state, claim-match score, expected vs actual verdict
  totals, and the first mismatched claim's expected versus actual verdict plus
  primary evidence title, trust, freshness, source path, score, and quote when drift
  appears
- `evaluate --domain-summary-csv-out <path>`: write one CSV row per fixture
  domain with the run `generated_at` timestamp plus aggregate fixture counts, mismatch counts, matched claims, and
  score labels for benchmark routing
- `evaluate --aggregate-summary-csv-out <path>`: write one overall CSV row
  with the run `generated_at` timestamp plus total fixture counts, mismatches, matched claims, overall score, and
  per-domain score rollups for CI gates and dashboards
- `evaluate --fail-on-mismatch`: exit with code `2` when any fixture summary or
  expected claim verdict does not match the current verifier output

All report-producing CLI workflows accept `--generated-at <timestamp>` with a
parseable ISO timestamp. When provided, Quorum reuses that value across the
JSON, text, Markdown, HTML, and CSV outputs generated by the command, which
keeps retries and checked-in evaluation snapshots comparable.

Supported source extensions today:

- `.md`
- `.markdown`
- `.txt`
- `.html`
- `.htm`
- `.pdf`
- `.docx`

## Project Structure

```text
src/
  claim-extractor.ts   answer-to-claim extraction
  claim-verifier.ts    evidence matching and verdict logic
  cli.ts               command-line interface
  report-renderer.ts   text, markdown, HTML, and CSV report rendering
  report-policy.ts     fail-on verdict policy
  source-loader.ts     source metadata and HTML loading
tests/                 unit and fixture coverage
examples/              HR and support demo inputs
docs/                  product notes, demo, roadmap, decision queue
```

## Development

```bash
npm run check
```

`npm run check` is the repository verification gate used by CI. It runs the
test suite, TypeScript build, packed-package smoke check, and shipped-fixture
evaluation score gate together.

## Product Direction

The first wedge is HR and customer-support policy verification. These workflows
are document-grounded, high-volume, and risky when AI answers drift from
approved sources.

The current foundation includes a lightweight local HTTP API for agent and
workflow integrations plus a checked-in HR/support evaluation fixture set with
claim-level scorecards and CI gating. Reviewer exports include queue-oriented
summary CSVs, and imported decisions preserve answer context and source
provenance for audit handoff. The new `review-queue` command combines reviewer
workload with optional benchmark-drift metrics in one JSON or CSV overview. See
[docs/reviewer-queue.md](docs/reviewer-queue.md) for the end-to-end batch
verification, review, import, and benchmark-drift workflow.

Near-term work:

- expand the HR and support fixture set as policy coverage grows
- expand the reviewer queue overview with durable queue backends and dashboard
  integrations
- document deployment and integration patterns for the local API, including
  authentication boundaries and durable source identifiers

See [docs/roadmap.md](docs/roadmap.md) for the working roadmap and
[docs/product-brief.md](docs/product-brief.md) for the product brief. For an
auto-updated snapshot of what has shipped on `main`, see
[docs/status.md](docs/status.md).

## Human Decision Queue

Automation uses GitHub issues labeled `needs-human-decision` when it needs
product judgment, credentials, paid services, or other human sign-off.

Review the queue here:

https://github.com/nash226/quorum/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-human-decision

See [docs/decision-queue.md](docs/decision-queue.md) for the workflow.
