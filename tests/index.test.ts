import assert from "node:assert/strict";
import test from "node:test";
import {
  API_ALLOWED_METHODS,
  API_CAPABILITIES,
  API_REQUEST_CONTENT_TYPES,
  extractClaims,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
  verifyAnswerBatchContentsResult,
  verifyAnswerContentsResult,
  type SourceDocumentOptions,
  type ApiErrorResponse,
} from "../src/index.js";

const sourceDocumentOptions: SourceDocumentOptions = {
  id: "hr/leave@2026-08-05",
  title: "Leave Policy",
  updatedAt: "2026-08-05",
  trustLevel: "high",
};

test("public package entrypoint exports typed source document options", () => {
  assert.deepEqual(sourceDocumentOptions, {
    id: "hr/leave@2026-08-05",
    title: "Leave Policy",
    updatedAt: "2026-08-05",
    trustLevel: "high",
  });
});

test("public package entrypoint exports the claim extractor", () => {
  assert.deepEqual(
    extractClaims(`# Policy\n\n- Employees receive 12 weeks of paid parental leave.`),
    [{ id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." }],
  );
});

test("public package entrypoint exports in-memory verification for Node workflows", async () => {
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

  assert.equal(result.report.answerLabel, "support-agent draft");
  assert.deepEqual(result.report.summary, {
    verified: 1,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  });
  assert.equal(result.shouldFail, false);
  assert.deepEqual(result.failVerdicts, []);
});

test("public package entrypoint renders verification artifacts for Node workflows", async () => {
  const result = await verifyAnswerContentsResult({
    answer: "Refunds are available for 30 days from the purchase date.",
    answerPath: "answers/refunds.md",
    sources: [{
      sourcePath: "policies/refunds.md",
      content: "Refunds are available for 30 days from the purchase date.",
      title: "Refund Policy",
      trustLevel: "high",
    }],
    generatedAt: "2026-08-07T00:00:00.000Z",
  });

  assert.match(renderTextReport(result.report), /Quorum Verification Report/);
  assert.match(renderMarkdownReport(result.report), /# Quorum Verification Report/);
  assert.match(renderHtmlReport(result.report), /<!doctype html>/i);
  assert.match(renderReviewerDecisionCsv(result.report), /claim_id,claim_text/);
  assert.match(renderSummaryCsv(result.report), /primary_verdict/);
});

test("public package entrypoint exports the in-memory batch gate result", async () => {
  const result = await verifyAnswerBatchContentsResult({
    answers: [{ answer: "The office provides free helicopter rides.", answerLabel: "draft" }],
    sources: [{ sourcePath: "policies/refunds.md", content: "Refunds are available for 30 days." }],
    failOn: ["unsupported"],
  });

  assert.equal(result.report.answers.length, 1);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
});

test("public package entrypoint exports the canonical HTTP method contract", () => {
  assert.deepEqual(API_ALLOWED_METHODS, ["GET", "HEAD", "POST", "OPTIONS"]);
  assert.deepEqual(API_CAPABILITIES.httpMethods, [...API_ALLOWED_METHODS]);
});

test("public package entrypoint exports the canonical JSON media-type contract", () => {
  assert.deepEqual(API_REQUEST_CONTENT_TYPES, ["application/json", "application/*+json"]);
  assert.deepEqual(API_CAPABILITIES.requestContentTypes, [...API_REQUEST_CONTENT_TYPES]);
});

test("public package entrypoint exports the HTTP error response contract", () => {
  const error: ApiErrorResponse = {
    error: "Content-Type must be JSON.",
    requestId: "request-123",
  };

  assert.deepEqual(error, {
    error: "Content-Type must be JSON.",
    requestId: "request-123",
  });
});
