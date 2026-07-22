# Programmatic API

Quorum can run inside a Node.js workflow without starting the HTTP server or
spawning the CLI. Import the package entrypoint when an agent runner already
has answer and policy content in memory.

## Verify in-memory content

`verifyAnswerContents` parses answer and source content, preserves source
metadata, and returns the same report shape used by the CLI and HTTP API:

```ts
import { verifyAnswerContentsResult } from "quorum";

const result = await verifyAnswerContentsResult({
  answer: "Refunds are available for 30 days from the purchase date.",
  answerLabel: "support-agent draft",
  sources: [{
    sourcePath: "policies/refunds.md",
    content: "Refunds are available for 30 days from the purchase date.",
    id: "support/refunds@2026-07-15",
    title: "Refund Policy",
    trustLevel: "high",
  }],
  failOn: ["contradicted", "unsupported"],
});

console.log(result.report.summary); // { verified: 1, contradicted: 0, ... }
console.log(result.shouldFail); // false
```

Use `answerPath` and `sourcePath` to keep document extensions available when
the content is PDF or DOCX bytes. Use `verifyAnswerContents` when a plain
`VerificationReport` is enough, `verifyAnswer` when sources are already loaded
as `SourceDocument` values, or `verifyAnswers` for multiple string answers
sharing those sources. For queue workers that receive several answers and
sources as in-memory content, use `verifyAnswerBatchContentsResult` to keep
the gate result (`shouldFail` and `failVerdicts`) alongside the batch report:

```ts
import { verifyAnswerBatchContentsResult } from "quorum";

const result = await verifyAnswerBatchContentsResult({
  answers: [
    { answer: "Refunds are available for 30 days.", answerLabel: "refunds" },
    { answer: "Refunds are always available.", answerLabel: "draft" },
  ],
  sources: [{
    sourcePath: "policies/refunds.md",
    content: "Refunds are available for 30 days.",
  }],
  failOn: ["contradicted", "unsupported"],
});

console.log(result.report.answers.length); // 2
console.log(result.shouldFail, result.failVerdicts);
```

The exported `extractClaims` helper can preview claims before verification when
a workflow needs to route or annotate them.

## Use file-backed workflows

For a worker that receives paths rather than content, the package also exports
`verifyAnswerFileInputs` and `verifyAnswers`. These helpers load approved
sources, apply the same fail policy, and return reviewer-ready reports without
requiring a local HTTP process:

```ts
import { verifyAnswerFileInputsResult } from "quorum";

const result = await verifyAnswerFileInputsResult({
  answerPath: "answers/hr-answer.md",
  sourcePaths: ["policies/hr-policy.md"],
  sourceDirs: [],
  failOn: ["contradicted", "unsupported"],
});

if (result.shouldFail) {
  throw new Error(`Policy verification failed: ${result.failVerdicts.join(", ")}`);
}
```

The package also exports evaluation, reviewer-decision import, report-rendering,
source-loading, and HTTP server helpers from the same public entrypoint. Use
the [HTTP integration guide](api-integration.md) when the caller is a separate
service or browser-facing workflow.

## Install and verify

The package currently targets Node.js 22 or newer:

```bash
npm install quorum
```

When consuming a checked-out repository during development, run `npm install`
and `npm run build` before importing from the generated `dist/` package. The
`quorum`, `quorum/server`, and `quorum/cli` exports all reference those built
artifacts.
