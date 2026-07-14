import assert from "node:assert/strict";
import test from "node:test";
import { API_ALLOWED_METHODS, API_CAPABILITIES, extractClaims, type ApiErrorResponse } from "../src/index.js";

test("public package entrypoint exports the claim extractor", () => {
  assert.deepEqual(
    extractClaims(`# Policy\n\n- Employees receive 12 weeks of paid parental leave.`),
    [{ id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." }],
  );
});

test("public package entrypoint exports the canonical HTTP method contract", () => {
  assert.deepEqual(API_ALLOWED_METHODS, ["GET", "HEAD", "POST", "OPTIONS"]);
  assert.deepEqual(API_CAPABILITIES.httpMethods, [...API_ALLOWED_METHODS]);
});

test("public package entrypoint exports the HTTP error response contract", () => {
  const error: ApiErrorResponse = {
    error: "Content-Type must be application/json.",
    requestId: "request-123",
  };

  assert.deepEqual(error, {
    error: "Content-Type must be application/json.",
    requestId: "request-123",
  });
});
