import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  API_CAPABILITIES as SERVER_API_CAPABILITIES,
  API_ALLOWED_METHODS as SERVER_API_ALLOWED_METHODS,
  API_CORS_ALLOWED_HEADERS as SERVER_API_CORS_ALLOWED_HEADERS,
  API_CORS_MAX_AGE_SECONDS as SERVER_API_CORS_MAX_AGE_SECONDS,
  API_CORS_EXPOSED_HEADERS as SERVER_API_CORS_EXPOSED_HEADERS,
  API_ENDPOINTS as SERVER_API_ENDPOINTS,
  API_MAX_REQUEST_BYTES as SERVER_API_MAX_REQUEST_BYTES,
  API_REQUEST_TIMEOUT_MS as SERVER_API_REQUEST_TIMEOUT_MS,
  CAPABILITIES_PATH as SERVER_CAPABILITIES_PATH,
  HEALTH_PATH as SERVER_HEALTH_PATH,
  HEALTHZ_PATH as SERVER_HEALTHZ_PATH,
  API_DISCOVERY_HEADERS as SERVER_API_DISCOVERY_HEADERS,
  API_REQUEST_ID_HEADER as SERVER_API_REQUEST_ID_HEADER,
  API_SERVICE_NAME as SERVER_API_SERVICE_NAME,
  API_VERSION as SERVER_API_VERSION,
  createApiServer,
  EVALUATE_PATH as SERVER_EVALUATE_PATH,
  EXTRACT_CLAIMS_PATH as SERVER_EXTRACT_CLAIMS_PATH,
  IMPORT_REVIEW_PATH as SERVER_IMPORT_REVIEW_PATH,
  REVIEW_QUEUE_PATH as SERVER_REVIEW_QUEUE_PATH,
  OPENAPI_PATH as SERVER_OPENAPI_PATH,
  READYZ_PATH as SERVER_READYZ_PATH,
  startApiServer,
  VERIFY_BATCH_PATH as SERVER_VERIFY_BATCH_PATH,
  VERIFY_PATH as SERVER_VERIFY_PATH,
} from "../src/api-server.js";
import {
  ANSWER_EXTENSIONS,
  API_CAPABILITIES,
  API_CAPABILITY_HEADERS,
  API_CORS_ALLOWED_HEADERS,
  API_CORS_MAX_AGE_SECONDS,
  API_CORS_EXPOSED_HEADERS,
  API_ROOT_PATH,
  API_ENDPOINTS,
  API_MAX_REQUEST_BYTES,
  API_REQUEST_TIMEOUT_MS,
  CAPABILITIES_PATH,
  HEALTH_PATH,
  HEALTHZ_PATH,
  API_DISCOVERY_HEADERS,
  API_REQUEST_ID_HEADER,
  API_SERVICE_NAME,
  API_VERSION,
  EVALUATE_PATH,
  EXTRACT_CLAIMS_PATH,
  IMPORT_REVIEW_PATH,
  REVIEW_QUEUE_PATH,
  READYZ_PATH,
  VERIFY_BATCH_PATH,
  VERIFY_PATH,
  type ApiEvaluateResponse,
  type ApiImportReviewResponse,
  type ApiReviewQueueResponse,
  type ApiVerifyBatchResponse,
  type ApiVerifyResponse,
  createOpenApiDocument,
  type ApiCapabilitiesResponse,
  type ApiDiscoveryEndpoint,
  type ApiDiscoveryResponse,
  type ApiHealthResponse,
  CLAIM_VERDICTS,
  createApiServer as rootCreateApiServer,
  importReviewerDecisionContents,
  importReviewerDecisionContentsResult,
  evaluateFixtureContent,
  evaluateFixtureContentResult,
  evaluateFixtureContents,
  evaluateFixtureContentsResult,
  evaluateFixtureFile,
  evaluateFixtureFileResult,
  evaluateFixtureFiles,
  evaluateFixtureFilesResult,
  evaluateFixtures,
  evaluateFixturesResult,
  hasEvaluationMismatch,
  importReviewerDecisionFile,
  importReviewerDecisionFileResult,
  importReviewerDecisions,
  importReviewerDecisionsResult,
  type InMemorySingleVerificationResultOptions,
  loadEvaluationFixtureFromContent,
  loadSources,
  loadSourcesFromContent,
  matchingFailVerdicts,
  parseClaimVerdict,
  renderAnswerLabel,
  renderAnswerLabels,
  renderAnswerPreview,
  renderBatchHtmlReport,
  renderBatchAggregateSummaryCsv,
  renderBatchMarkdownReport,
  renderBatchReviewerDecisionCsv,
  renderBatchSummaryCsv,
  renderBatchTextReport,
  renderEvaluationAggregateSummaryCsv,
  renderEvaluationDomainSummaryCsv,
  renderEvaluationHtmlReport,
  renderEvaluationMarkdownReport,
  renderEvaluationSummaryCsv,
  renderEvaluationTextReport,
  renderHtmlReport,
  renderMarkdownReport,
  renderReviewerDecisionImportHtmlReport,
  renderReviewerDecisionImportReport,
  renderReviewerDecisionImportMarkdownReport,
  renderReviewerDecisionImportQueueSummaryCsv,
  renderReviewerDecisionImportSummaryCsv,
  renderReviewerDecisionCsv,
  renderSummaryCsv,
  renderTextReport,
  resolveAnswerPaths,
  resolveSourcePaths,
  OPENAPI_PATH,
  SOURCE_EXTENSIONS,
  startApiServer as rootStartApiServer,
  shouldFailReport,
  verifyAnswers,
  verifyAnswersResult,
  verifyAnswerBatchContents,
  verifyAnswerBatchContentsResult,
  verifyAnswerBatchFileInputs,
  verifyAnswerBatchFileInputsResult,
  verifyAnswerContents,
  verifyAnswerContentsResult,
  verifyAnswer,
  verifyAnswerBatch,
  verifyAnswerBatchResult,
  verifyAnswerFile,
  verifyAnswerFileInputs,
  verifyAnswerFileInputsResult,
  verifyAnswerFileResult,
  verifyAnswerResult,
} from "../src/index.js";
import { createSimplePdf } from "./pdf-test-helpers.js";

test("programmatic API exposes supported source and answer extensions", () => {
  assert.deepEqual([...SOURCE_EXTENSIONS], [".md", ".markdown", ".txt", ".html", ".htm", ".pdf", ".docx"]);
  assert.deepEqual([...ANSWER_EXTENSIONS], [".md", ".markdown", ".txt", ".html", ".htm", ".pdf", ".docx"]);
});

test("API discovery exposes transport limits and supported methods", () => {
  assert.deepEqual(API_CAPABILITIES.httpMethods, ["GET", "HEAD", "POST", "OPTIONS"]);
  assert.deepEqual(API_CAPABILITIES.headerNames, API_CAPABILITY_HEADERS);
  assert.equal(API_CAPABILITY_HEADERS.requestId, "X-Quorum-Request-Id");
  assert.equal(API_CAPABILITY_HEADERS.etag, "ETag");
  assert.equal(API_CAPABILITY_HEADERS.allow, "Allow");
  assert.equal(API_CAPABILITY_HEADERS.corsMaxAge, "Access-Control-Max-Age");
  assert.equal(API_CORS_MAX_AGE_SECONDS, 600);
  assert.equal(SERVER_API_CORS_MAX_AGE_SECONDS, API_CORS_MAX_AGE_SECONDS);
  assert.deepEqual(API_CAPABILITIES.requestContentTypes, ["application/json", "application/*+json"]);
  assert.deepEqual(API_CAPABILITIES.binaryContentEncodings, ["base64"]);
  assert.deepEqual(API_CAPABILITIES.reviewQueueStatuses, ["pending", "reviewed", "no_claims"]);
  assert.equal(API_CAPABILITIES.maxRequestBytes, API_MAX_REQUEST_BYTES);
  assert.equal(API_CAPABILITIES.requestTimeoutMs, SERVER_API_REQUEST_TIMEOUT_MS);
  assert.deepEqual(API_CAPABILITIES.cors, {
    allowedOrigins: ["*"],
    allowedHeaders: ["Content-Type", "X-Quorum-Request-Id", "If-None-Match"],
    exposedHeaders: API_CORS_EXPOSED_HEADERS.split(", "),
    maxAgeSeconds: API_CORS_MAX_AGE_SECONDS,
  });
});

test("API discovery endpoint inventory contains one entry per method and path", () => {
  const endpointKeys = API_ENDPOINTS.map(({ method, path }) => `${method} ${path}`);

  assert.equal(new Set(endpointKeys).size, endpointKeys.length);
});

test("API CORS exposed headers contain each browser-visible header once", () => {
  const exposedHeaders = API_CORS_EXPOSED_HEADERS.split(", ");

  assert.equal(new Set(exposedHeaders).size, exposedHeaders.length);
});

test("programmatic API re-exports embedded server helpers and metadata", () => {
  assert.strictEqual(rootCreateApiServer, createApiServer);
  assert.strictEqual(rootStartApiServer, startApiServer);
  assert.strictEqual(CAPABILITIES_PATH, SERVER_CAPABILITIES_PATH);
  assert.equal(API_ROOT_PATH, "/");
  assert.strictEqual(HEALTH_PATH, SERVER_HEALTH_PATH);
  assert.strictEqual(HEALTHZ_PATH, SERVER_HEALTHZ_PATH);
  assert.strictEqual(OPENAPI_PATH, SERVER_OPENAPI_PATH);
  assert.strictEqual(READYZ_PATH, SERVER_READYZ_PATH);
  assert.strictEqual(EVALUATE_PATH, SERVER_EVALUATE_PATH);
  assert.strictEqual(EXTRACT_CLAIMS_PATH, SERVER_EXTRACT_CLAIMS_PATH);
  assert.strictEqual(IMPORT_REVIEW_PATH, SERVER_IMPORT_REVIEW_PATH);
  assert.strictEqual(REVIEW_QUEUE_PATH, SERVER_REVIEW_QUEUE_PATH);
  assert.strictEqual(VERIFY_BATCH_PATH, SERVER_VERIFY_BATCH_PATH);
  assert.strictEqual(VERIFY_PATH, SERVER_VERIFY_PATH);
  assert.deepEqual(API_DISCOVERY_HEADERS, SERVER_API_DISCOVERY_HEADERS);
  assert.equal(API_CORS_ALLOWED_HEADERS, SERVER_API_CORS_ALLOWED_HEADERS);
  assert.equal(API_CORS_EXPOSED_HEADERS, SERVER_API_CORS_EXPOSED_HEADERS);
  assert.equal(API_REQUEST_ID_HEADER, SERVER_API_REQUEST_ID_HEADER);
  assert.strictEqual(API_SERVICE_NAME, SERVER_API_SERVICE_NAME);
  assert.strictEqual(API_VERSION, SERVER_API_VERSION);
  assert.deepEqual(API_CAPABILITIES, SERVER_API_CAPABILITIES);
  assert.deepEqual(API_ENDPOINTS, SERVER_API_ENDPOINTS);
});

test("programmatic API can build the OpenAPI document without starting the server", () => {
  const openApi = createOpenApiDocument({
    serverUrl: "http://127.0.0.1:3000/",
  }) as {
    openapi: string;
    info: { title: string; version: string };
    servers: Array<{ url: string }>;
    paths: Record<string, {
      post?: {
        summary: string;
        parameters?: Array<{ $ref?: string }>;
        requestBody?: unknown;
      };
    }>;
    components: { parameters: Record<string, { name: string; in: string; required: boolean }> };
  };

  assert.equal(openApi.openapi, "3.1.0");
  assert.equal(openApi.info.title, "Quorum Local API");
  assert.equal(openApi.info.version, API_VERSION);
  assert.deepEqual(openApi.servers, [{ url: "http://127.0.0.1:3000" }]);
  assert.equal(openApi.paths["/verify"]?.post?.summary, "Verify one answer");
  assert.equal(openApi.paths["/evaluate"]?.post?.summary, "Evaluate fixtures");
  assert.equal(openApi.paths["/review-queue"]?.post?.summary, "Summarize reviewer queue and benchmark drift");
  const reviewQueueRequestSchema = openApi.paths["/review-queue"]?.post?.requestBody as {
    content: { "application/json": { schema: { properties: Record<string, { enum?: string[]; description?: string }> } } };
  };
  assert.deepEqual(reviewQueueRequestSchema.content["application/json"].schema.properties.queueStatus, {
    type: "string",
    enum: ["pending", "reviewed", "no_claims"],
    description: "Only include answers in this reviewer queue status.",
  });
  assert.equal(openApi.paths["/extract-claims"]?.post?.summary, "Extract normalized claims");
  const verifyRequestSchema = openApi.paths["/verify"]?.post?.requestBody as {
    content: { "application/json": { schema: { oneOf: Array<{ required: string[] }>; properties: Record<string, { contentEncoding?: string }> } } };
  };
  assert.deepEqual(verifyRequestSchema.content["application/json"].schema.oneOf, [
    { required: ["answer"] },
    { required: ["answerBase64"] },
  ]);
  assert.equal(
    verifyRequestSchema.content["application/json"].schema.properties.answerBase64?.contentEncoding,
    "base64",
  );
  assert.equal("queueStatus" in verifyRequestSchema.content["application/json"].schema.properties, false);
  const extractClaimsRequestSchema = openApi.paths["/extract-claims"]?.post?.requestBody as {
    content: { "application/json": { schema: { oneOf: Array<{ required: string[] }>; properties: Record<string, { contentEncoding?: string }> } } };
  };
  assert.deepEqual(extractClaimsRequestSchema.content["application/json"].schema.oneOf, [
    { required: ["answer"] },
    { required: ["answerBase64"] },
  ]);
  assert.equal(
    extractClaimsRequestSchema.content["application/json"].schema.properties.answerBase64?.contentEncoding,
    "base64",
  );
  assert.deepEqual(openApi.paths["/verify"]?.post?.parameters, [
    { $ref: "#/components/parameters/RequestIdHeader" },
  ]);
  assert.deepEqual(
    (({ name, in: location, required }) => ({ name, in: location, required }))(
      openApi.components.parameters.RequestIdHeader,
    ),
    { name: API_REQUEST_ID_HEADER, in: "header", required: false },
  );
});

test("OpenAPI describes source freshness timestamps as date-time values", () => {
  const openApi = createOpenApiDocument() as {
    components: {
      schemas: Record<string, { properties?: Record<string, { format?: string }> }>;
    };
  };

  assert.equal(openApi.components.schemas.ApiSourceInput?.properties?.updatedAt?.format, "date-time");
  assert.equal(openApi.components.schemas.SourceSummary?.properties?.updatedAt?.format, "date-time");
  assert.equal(
    openApi.components.schemas.EvidenceSnippet?.properties?.documentUpdatedAt?.format,
    "date-time",
  );
});

test("HTTP API extracts normalized claims without loading sources", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/extract-claims`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Quorum-Request-Id": "extract-claims-contract-test",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave. Managers approve travel within five business days.",
        answerPath: "answers/hr-answer.md",
        answerLabel: "HR reviewer packet",
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-quorum-request-id"), "extract-claims-contract-test");
    assert.deepEqual(await response.json(), {
      requestId: "extract-claims-contract-test",
      answerPath: "answers/hr-answer.md",
      answerLabel: "HR reviewer packet",
      answerPreview: "Employees receive 12 weeks of paid parental leave. Managers approve travel within five business days.",
      answerHasClaims: true,
      claims: [
        { id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." },
        { id: "claim_2", text: "Managers approve travel within five business days." },
      ],
    });
  } finally {
    await api.close();
  }
});

test("HTTP API keeps semicolon-separated policy clauses atomic", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/extract-claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave; Healthcare coverage begins after 30 days of employment.",
        answerPath: "answers/hr-answer.md",
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.answerHasClaims, true);
    assert.deepEqual(payload.claims, [
      { id: "claim_1", text: "Employees receive 12 weeks of paid parental leave" },
      { id: "claim_2", text: "Healthcare coverage begins after 30 days of employment." },
    ]);
  } finally {
    await api.close();
  }
});

test("HTTP API marks claim-less answer previews for queue routing", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/extract-claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "Thanks!" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      requestId: response.headers.get("x-quorum-request-id"),
      answerPreview: "Thanks!",
      answerHasClaims: false,
      claims: [],
    });
  } finally {
    await api.close();
  }
});

test("HTTP API exposes claim extraction CORS preflight metadata", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/extract-claims`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:4173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type, X-Quorum-Request-Id, If-None-Match");
    assert.equal(response.headers.get("access-control-max-age"), "600");
  } finally {
    await api.close();
  }
});

test("HTTP API exposes reviewer queue CORS preflight metadata", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/review-queue`, {
      method: "OPTIONS",
      headers: {
        origin: "https://console.example.com",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(
      response.headers.get("access-control-allow-headers"),
      "Content-Type, X-Quorum-Request-Id, If-None-Match",
    );
    assert.equal(response.headers.get("access-control-max-age"), "600");
    assert.equal(response.headers.get("access-control-expose-headers"), API_CORS_EXPOSED_HEADERS);
    assert.equal(await response.text(), "");
  } finally {
    await api.close();
  }
});

test("HTTP API serves bodyless HEAD responses for operational probes", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    for (const path of ["/health", "/healthz", "/readyz", "/livez"]) {
      const response = await fetch(`${api.url}${path}`, { method: "HEAD" });

      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get("cache-control"), "no-store", path);
      assert.equal(await response.text(), "", path);
    }
  } finally {
    await api.close();
  }
});

test("HTTP API exposes CORS preflight metadata for operational probes", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    for (const path of ["/health", "/healthz", "/readyz", "/livez"]) {
      const response = await fetch(`${api.url}${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "https://console.example.com",
          "access-control-request-method": "GET",
          "access-control-request-headers": "x-quorum-request-id",
        },
      });

      assert.equal(response.status, 204, path);
      assert.equal(response.headers.get("access-control-allow-origin"), "*", path);
      assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, OPTIONS", path);
      assert.equal(
        response.headers.get("access-control-allow-headers"),
        "Content-Type, X-Quorum-Request-Id, If-None-Match",
        path,
      );
      assert.equal(response.headers.get("access-control-max-age"), "600", path);
      assert.equal(await response.text(), "", path);
    }
  } finally {
    await api.close();
  }
});

test("HTTP API rejects CORS preflight requests for unknown routes", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/missing`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:4173",
        "access-control-request-method": "GET",
      },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Not found.",
      requestId: response.headers.get("x-quorum-request-id"),
    });
    assert.equal(response.headers.get("access-control-allow-methods"), "GET, HEAD, POST, OPTIONS");
  } finally {
    await api.close();
  }
});

test("HTTP API extracts claims from base64 text and document answers", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const textResponse = await fetch(`${api.url}/extract-claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answerBase64: Buffer.from("Employees receive 12 weeks of paid parental leave.").toString("base64"),
        answerPath: "answers/hr-answer.txt",
      }),
    });
    assert.equal(textResponse.status, 200);
    assert.deepEqual((await textResponse.json()).claims, [
      { id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." },
    ]);

    const documentResponse = await fetch(`${api.url}/extract-claims`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answerBase64: Buffer.from(await readFile(resolve("examples/sources/hr-policy.pdf"))).toString("base64"),
        answerPath: "answers/hr-answer.pdf",
      }),
    });
    assert.equal(documentResponse.status, 200);
    assert.equal((await documentResponse.json()).claims.length, 2);
  } finally {
    await api.close();
  }
});

test("HTTP API restricts CORS responses to configured origins", async () => {
  const api = await startApiServer({
    host: "127.0.0.1",
    port: 0,
    corsAllowedOrigins: ["https://console.example.com"],
  });

  try {
    const capabilitiesResponse = await fetch(`${api.url}/capabilities`);
    const capabilitiesPayload = await capabilitiesResponse.json() as ApiCapabilitiesResponse;
    assert.deepEqual(capabilitiesPayload.capabilities.cors.allowedOrigins, ["https://console.example.com"]);

    const openApiResponse = await fetch(`${api.url}/openapi.json`);
    const openApi = await openApiResponse.json() as {
      paths: { "/": { get: { responses: { "200": { content: { "application/json": { examples: {
        discoveryIndex: { value: { capabilities: ApiCapabilitiesResponse["capabilities"] } };
      } } } } } } } };
    };
    assert.deepEqual(
      openApi.paths["/"].get.responses["200"].content["application/json"].examples.discoveryIndex.value.capabilities.cors.allowedOrigins,
      ["https://console.example.com"],
    );

    const allowedResponse = await fetch(`${api.url}/health`, {
      headers: { origin: "https://console.example.com" },
    });
    assert.equal(allowedResponse.headers.get("access-control-allow-origin"), "https://console.example.com");
    assert.equal(allowedResponse.headers.get("vary"), "Origin");

    const deniedResponse = await fetch(`${api.url}/health`, {
      headers: { origin: "https://unapproved.example.com" },
    });
    assert.equal(deniedResponse.headers.get("access-control-allow-origin"), null);
    assert.equal(deniedResponse.headers.get("vary"), "Origin");
  } finally {
    await api.close();
  }
});

test("HTTP API marks mutable JSON responses as non-cacheable and contracts as revalidatable", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const requests: Array<Promise<Response>> = [
      fetch(api.url),
      fetch(`${api.url}/capabilities`),
      fetch(`${api.url}/version`),
      fetch(`${api.url}/openapi.json`),
      fetch(`${api.url}/extract-claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: "Employees receive 12 weeks of leave." }),
      }),
      fetch(`${api.url}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answer: "Employees receive 12 weeks of leave.",
          sources: [{ sourcePath: "hr.md", content: "Employees receive 12 weeks of leave." }],
        }),
      }),
      fetch(`${api.url}/missing`),
    ];

    const responses = await Promise.all(requests);

    for (const [index, response] of responses.entries()) {
      assert.equal(
        response.headers.get("cache-control"),
        index === 0 || index === 1 || index === 2 || index === 3 ? "public, max-age=0, must-revalidate" : "no-store",
      );
      await response.arrayBuffer();
    }

    const discoveryResponse = responses[0];
    const discoveryEtag = discoveryResponse.headers.get("etag");
    assert.match(discoveryEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    const headDiscoveryResponse = await fetch(api.url, { method: "HEAD" });
    assert.equal(headDiscoveryResponse.status, 200);
    assert.equal(headDiscoveryResponse.headers.get("etag"), discoveryEtag);
    assert.equal(await headDiscoveryResponse.text(), "");
    const notModifiedDiscoveryResponse = await fetch(api.url, {
      headers: { "if-none-match": discoveryEtag ?? "" },
    });
    assert.equal(notModifiedDiscoveryResponse.status, 304);
    assert.equal(notModifiedDiscoveryResponse.headers.get("etag"), discoveryEtag);
    assert.equal(await notModifiedDiscoveryResponse.text(), "");
  } finally {
    await api.close();
  }
});

test("HTTP API routes valid requests with query strings by pathname", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const healthResponse = await fetch(`${api.url}/healthz?probe=readiness`);
    assert.equal(healthResponse.status, 200);
    const healthPayload = await healthResponse.json() as ApiHealthResponse;
    assert.equal(healthPayload.requestId, healthResponse.headers.get("x-quorum-request-id"));
    assert.deepEqual({ ...healthPayload, requestId: "" }, {
      ok: true,
      requestId: "",
      service: "quorum",
      version: "0.1.0",
    });

    const extractClaimsResponse = await fetch(`${api.url}/extract-claims?format=json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "Employees receive 12 weeks of leave." }),
    });
    assert.equal(extractClaimsResponse.status, 200);
    assert.deepEqual(await extractClaimsResponse.json(), {
      requestId: extractClaimsResponse.headers.get("x-quorum-request-id"),
      answerPreview: "Employees receive 12 weeks of leave.",
      answerHasClaims: true,
      claims: [{ id: "claim_1", text: "Employees receive 12 weeks of leave." }],
    });
  } finally {
    await api.close();
  }
});

test("HTTP API serves the Kubernetes readiness alias as a JSON probe", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/readyz?probe=kubernetes`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = await response.json() as ApiHealthResponse;
    assert.deepEqual({ ...payload, requestId: "" }, {
      ok: true,
      requestId: "",
      service: "quorum",
      version: "0.1.0",
    });
    assert.equal(payload.requestId, response.headers.get("x-quorum-request-id"));
  } finally {
    await api.close();
  }
});

test("programmatic API verifies an answer file against loaded sources", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });
    const report = await verifyAnswerFile(answerPath, sources, "2026-07-05T00:00:00.000Z");

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.generatedAt, "2026-07-05T00:00:00.000Z");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API verifies an answer file through an options object", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-file-options-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });
    const report = await verifyAnswerFile({
      answerPath,
      answerLabel: "HR reviewer packet",
      sources,
      generatedAt: "2026-07-06T19:00:00.000Z",
    });

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.answerLabel, "HR reviewer packet");
    assert.equal(report.generatedAt, "2026-07-06T19:00:00.000Z");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API verifies file inputs without a separate source-loading step", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-file-inputs-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    const sourcePath = join(sourceDir, "policy.md");

    await mkdir(sourceDir, { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const report = await verifyAnswerFileInputs({
      answerPath,
      sourcePaths: [],
      sourceDirs: [sourceDir],
      generatedAt: "2026-07-06T10:00:00.000Z",
    });

    assert.equal(report.answerPath, answerPath);
    assert.equal(report.generatedAt, "2026-07-06T10:00:00.000Z");
    assert.equal(report.sources[0]?.title, "HR Policy");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API rejects an empty file-backed source directory", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-empty-sources-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourceDir = join(tempDir, "sources");
    await mkdir(sourceDir, { recursive: true });
    await writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8");

    await assert.rejects(
      verifyAnswerFileInputs({ answerPath, sourcePaths: [], sourceDirs: [sourceDir] }),
      /No approved source files found in/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API applies an explicit answer label to file verification helpers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-file-label-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
    });

    const report = await verifyAnswerFile(
      answerPath,
      sources,
      "2026-07-06T12:00:00.000Z",
      "HR reviewer packet",
    );
    const result = await verifyAnswerFileResult({
      answerPath,
      answerLabel: "HR reviewer packet",
      sources,
      failOn: ["contradicted"],
      generatedAt: "2026-07-06T12:00:00.000Z",
    });
    const directFileReport = await verifyAnswerFileInputs({
      answerPath,
      answerLabel: "HR reviewer packet",
      sourcePaths: [sourcePath],
      sourceDirs: [],
      generatedAt: "2026-07-06T12:00:00.000Z",
    });
    const directFileResult = await verifyAnswerFileInputsResult({
      answerPath,
      answerLabel: "HR reviewer packet",
      sourcePaths: [sourcePath],
      sourceDirs: [],
      failOn: ["contradicted"],
      generatedAt: "2026-07-06T12:00:00.000Z",
    });

    assert.equal(report.answerLabel, "HR reviewer packet");
    assert.equal(result.report.answerLabel, "HR reviewer packet");
    assert.equal(directFileReport.answerLabel, "HR reviewer packet");
    assert.equal(directFileResult.report.answerLabel, "HR reviewer packet");
    assert.equal(result.shouldFail, false);
    assert.equal(directFileResult.shouldFail, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API resolves source and answer paths in CLI order", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-paths-"));

  try {
    const answerDir = join(tempDir, "answers");
    const nestedAnswerDir = join(answerDir, "nested");
    const sourceDir = join(tempDir, "sources");
    const nestedSourceDir = join(sourceDir, "nested");
    const explicitAnswerPath = join(tempDir, "explicit-answer.md");
    const explicitSourcePath = join(tempDir, "explicit-source.md");
    const directoryAnswerPath = join(answerDir, "a-answer.md");
    const nestedAnswerPath = join(nestedAnswerDir, "b-answer.txt");
    const directorySourcePath = join(sourceDir, "a-source.md");
    const nestedSourcePath = join(nestedSourceDir, "b-source.html");

    await Promise.all([
      mkdir(nestedAnswerDir, { recursive: true }),
      mkdir(nestedSourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(explicitAnswerPath, "Explicit answer.\n", "utf8"),
      writeFile(directoryAnswerPath, "Directory answer.\n", "utf8"),
      writeFile(nestedAnswerPath, "Nested answer.\n", "utf8"),
      writeFile(explicitSourcePath, "Explicit source.\n", "utf8"),
      writeFile(directorySourcePath, "Directory source.\n", "utf8"),
      writeFile(
        nestedSourcePath,
        "<html><body><main><p>Nested source.</p></main></body></html>",
        "utf8",
      ),
    ]);

    assert.deepEqual(
      await resolveAnswerPaths([explicitAnswerPath], [answerDir]),
      [explicitAnswerPath, directoryAnswerPath, nestedAnswerPath],
    );
    assert.deepEqual(
      await resolveSourcePaths([explicitSourcePath], [sourceDir]),
      [explicitSourcePath, directorySourcePath, nestedSourcePath],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API reports missing explicit batch answer paths during resolution", async () => {
  await assert.rejects(
    resolveAnswerPaths(["missing-answer.md"], []),
    /Answer file not found: missing-answer\.md/,
  );
});

test("programmatic API batches file and directory answers with fail verdicts", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const explicitAnswerPath = join(tempDir, "support-answer.md");
    const directoryAnswerPath = join(answerDir, "hr-answer.md");
    const hrSourcePath = join(sourceDir, "hr-policy.md");
    const supportSourcePath = join(sourceDir, "support-policy.md");

    await mkdir(answerDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });
    await Promise.all([
      writeFile(
        explicitAnswerPath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        directoryAnswerPath,
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        hrSourcePath,
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(
        supportSourcePath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
    });
    const report = await verifyAnswerBatch({
      answerPaths: [explicitAnswerPath],
      answerDirPaths: [answerDir],
      sources,
      failOn: ["contradicted"],
      generatedAt: "2026-07-05T01:00:00.000Z",
    });

    assert.equal(report.generatedAt, "2026-07-05T01:00:00.000Z");
    assert.equal(report.answerCount, 2);
    assert.equal(report.summary.verified, 1);
    assert.equal(report.summary.contradicted, 1);
    assert.equal(report.summary.answersWithFailures, 1);
    assert.deepEqual(
      report.answers.map((answer) => ({
        label: answer.answerLabel,
        shouldFail: answer.shouldFail,
      })),
      [
        { label: "support-answer", shouldFail: false },
        { label: "hr-answer", shouldFail: true },
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API batches file inputs without a separate source-loading step", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-file-inputs-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");
    const answerPath = join(answerDir, "hr.md");
    const sourcePath = join(sourceDir, "policy.md");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        sourcePath,
        `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
        "utf8",
      ),
    ]);

    const report = await verifyAnswerBatchFileInputs({
      answerPaths: [],
      answerDirPaths: [answerDir],
      sourcePaths: [],
      sourceDirs: [sourceDir],
      generatedAt: "2026-07-06T13:00:00.000Z",
    });

    assert.equal(report.generatedAt, "2026-07-06T13:00:00.000Z");
    assert.equal(report.answerCount, 1);
    assert.equal(report.sources[0]?.title, "HR Policy");
    assert.deepEqual(report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 1,
      answersWithoutClaims: 0,
      answersWithFailures: 0,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API preserves explicit batch answer labels", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-labels-"));

  try {
    const answerDir = join(tempDir, "answers");
    const explicitAnswerPath = join(tempDir, "support.md");
    const directoryAnswerPath = join(answerDir, "hr.md");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(explicitAnswerPath, "Refunds are available for 30 days from the purchase date.\n", "utf8"),
      writeFile(directoryAnswerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(
        join(sourceDir, "refunds.md"),
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        join(sourceDir, "benefits.md"),
        "Employees receive 12 weeks of paid parental leave.\n",
        "utf8",
      ),
    ]);

    const sources = await loadSources({
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
    });
    const report = await verifyAnswerBatch({
      answerPaths: [explicitAnswerPath],
      answerDirPaths: [answerDir],
      answerLabelsByPath: {
        [explicitAnswerPath]: "Support escalation packet",
      },
      sources,
      generatedAt: "2026-07-06T15:00:00.000Z",
    });

    assert.deepEqual(
      report.answers.map((answer) => ({
        label: answer.answerLabel,
        path: answer.answerPath,
        reportLabel: answer.report.answerLabel,
      })),
      [
        {
          label: "Support escalation packet",
          path: explicitAnswerPath,
          reportLabel: "Support escalation packet",
        },
        {
          label: "hr",
          path: directoryAnswerPath,
          reportLabel: "hr",
        },
      ],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API still supports direct in-memory verification", () => {
  const report = verifyAnswer(
    "Benefits begin on day one of employment.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Benefits begin on day one of employment.",
      },
    ],
    "2026-07-05T02:00:00.000Z",
  );

  assert.equal(report.summary.verified, 1);
  assert.equal(report.generatedAt, "2026-07-05T02:00:00.000Z");
});

test("programmatic API batches in-memory answers for workflow callers", () => {
  const sources = [
    {
      id: "source_1",
      title: "Benefits policy",
      trustLevel: "high" as const,
      content: "Employees receive 12 weeks of paid parental leave.",
    },
    {
      id: "source_2",
      title: "Refund policy",
      trustLevel: "high" as const,
      content: "Refunds are available for 30 days from the purchase date.",
    },
  ];

  const report = verifyAnswers({
    answers: [
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Employees receive 16 weeks of paid parental leave.",
        answerLabel: "HR escalation draft",
      },
      {
        answer: "Refunds are available for 30 days from the purchase date.",
        answerPath: "answers/support.md",
      },
    ],
    sources,
    failOn: ["contradicted"],
    generatedAt: "2026-07-05T02:15:00.000Z",
  });

  assert.equal(report.generatedAt, "2026-07-05T02:15:00.000Z");
  assert.equal(report.answerCount, 3);
  assert.equal(report.summary.verified, 2);
  assert.equal(report.summary.contradicted, 1);
  assert.equal(report.summary.answersWithFailures, 1);
  assert.deepEqual(
    report.answers.map((answer) => ({
      label: answer.answerLabel,
      path: answer.answerPath,
      shouldFail: answer.shouldFail,
    })),
    [
      {
        label: "hr",
        path: "answers/hr.md",
        shouldFail: false,
      },
      {
        label: "HR escalation draft",
        path: "<memory:2>",
        shouldFail: true,
      },
      {
        label: "support",
        path: "answers/support.md",
        shouldFail: false,
      },
    ],
  );
});

test("programmatic API loads in-memory source content for embedded workflows", async () => {
  const sources = await loadSourcesFromContent({
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
        content: `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "low",
  });

  assert.deepEqual(
    sources.map((source) => ({
      title: source.title,
      trustLevel: source.trustLevel,
      content: source.content,
    })),
    [
      {
        title: "HR Policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      },
      {
        title: "Refund Policy",
        trustLevel: "low",
        content: "Refund Policy\n\nRefunds are available for 30 days from the purchase date.",
      },
    ],
  );

  const report = verifyAnswers({
    answers: [
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Refunds are available for 30 days from the purchase date.",
        answerPath: "answers/refunds.md",
      },
    ],
    sources,
    generatedAt: "2026-07-05T03:00:00.000Z",
  });

  assert.deepEqual(report.summary, {
    verified: 2,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
    answersWithClaims: 2,
    answersWithoutClaims: 0,
    answersWithFailures: 0,
  });
});

test("programmatic API verifies one in-memory answer against raw source content", async () => {
  const report = await verifyAnswerContents({
    answer: "Refunds are available for 30 days from the purchase date.",
    answerLabel: "support-agent draft",
    sources: [
      {
        sourcePath: "help/refunds.html",
        content: `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "high",
    generatedAt: "2026-07-05T03:30:00.000Z",
  });

  assert.equal(report.answerLabel, "support-agent draft");
  assert.equal(report.answerPath, undefined);
  assert.equal(report.generatedAt, "2026-07-05T03:30:00.000Z");
  assert.equal(report.sources[0]?.title, "Refund Policy");
  assert.equal(report.sources[0]?.trustLevel, "high");
  assert.deepEqual(report.summary, {
    verified: 1,
    contradicted: 0,
    unsupported: 0,
    needs_review: 0,
  });
});

test("async in-memory verification extracts PDF and DOCX answer bytes", async () => {
  const pdfAnswer = createSimplePdf("Employees receive 12 weeks of paid leave.");
  const pdfReport = await verifyAnswerContents({
    answer: pdfAnswer,
    answerPath: "answers/leave-answer.pdf",
    sources: [
      {
        sourcePath: "policies/leave-policy.md",
        content: "Employees receive 12 weeks of paid leave.",
      },
    ],
  });

  assert.equal(pdfReport.summary.verified, 1);

  const docxAnswer = await readFile("node_modules/mammoth/test/test-data/single-paragraph.docx");
  const docxReport = await verifyAnswerContents({
    answer: docxAnswer,
    answerPath: "answers/docx-answer.docx",
    sources: [
      {
        sourcePath: "policies/docx-policy.docx",
        content: docxAnswer,
      },
    ],
  });

  assert.equal(docxReport.summary.verified, 1);

  const batchReport = await verifyAnswerBatchContents({
    answers: [
      {
        answer: pdfAnswer,
        answerPath: "answers/leave-answer.pdf",
        answerLabel: "Leave answer",
      },
    ],
    sources: [
      {
        sourcePath: "policies/leave-policy.md",
        content: "Employees receive 12 weeks of paid leave.",
      },
    ],
  });

  assert.equal(batchReport.summary.verified, 1);
});

test("programmatic API accepts explicit metadata for in-memory sources", async () => {
  const report = await verifyAnswerContents({
    answer: "Employees receive 12 weeks of paid parental leave.",
    sources: [
      {
        sourcePath: "policies/hr-policy.md",
        title: "People Ops Handbook",
        updatedAt: "2026-06-15",
        trustLevel: "high",
        content: `---
title: Old Handbook
trustLevel: low
updatedAt: 2026-05-31
---
Employees receive 12 weeks of paid parental leave.
`,
      },
    ],
    generatedAt: "2026-07-07T22:00:00.000Z",
  });

  assert.equal(report.sources[0]?.title, "People Ops Handbook");
  assert.equal(report.sources[0]?.updatedAt, "2026-06-15");
  assert.equal(report.sources[0]?.trustLevel, "high");
  assert.equal(report.summary.verified, 1);
});

test("programmatic API returns fail-policy metadata for one answer file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-single-file-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 16 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "high",
    });
    const result = await verifyAnswerFileResult({
      answerPath,
      sources,
      failOn: ["contradicted", "unsupported"],
      generatedAt: "2026-07-05T03:35:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-05T03:35:00.000Z");
    assert.equal(result.report.answerPath, answerPath);
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API supports positional verifyAnswerFileResult calls", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-single-file-result-positional-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 16 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "high",
    });

    const resultWithFailOnOnly = await verifyAnswerFileResult(answerPath, sources, [
      "contradicted",
      "unsupported",
    ]);
    const resultWithAllArgs = await verifyAnswerFileResult(
      answerPath,
      sources,
      "2026-07-06T21:00:00.000Z",
      "HR escalation draft",
      ["contradicted"],
    );

    assert.equal(resultWithFailOnOnly.report.answerPath, answerPath);
    assert.equal(resultWithFailOnOnly.shouldFail, true);
    assert.deepEqual(resultWithFailOnOnly.failVerdicts, ["contradicted"]);

    assert.equal(resultWithAllArgs.report.generatedAt, "2026-07-06T21:00:00.000Z");
    assert.equal(resultWithAllArgs.report.answerLabel, "HR escalation draft");
    assert.equal(resultWithAllArgs.shouldFail, true);
    assert.deepEqual(resultWithAllArgs.failVerdicts, ["contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns fail-policy metadata for file inputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-single-file-input-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "policy.md");

    await Promise.all([
      writeFile(answerPath, "Employees receive 16 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await verifyAnswerFileInputsResult({
      answerPath,
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "medium",
      failOn: ["contradicted"],
      generatedAt: "2026-07-06T11:00:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-06T11:00:00.000Z");
    assert.equal(result.report.answerPath, answerPath);
    assert.equal(result.report.sources[0]?.trustLevel, "medium");
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns fail-policy metadata for one in-memory answer", () => {
  const result = verifyAnswerResult({
    answer: "Employees receive 16 weeks of paid parental leave.",
    answerLabel: "HR escalation draft",
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["contradicted"],
    generatedAt: "2026-07-05T03:40:00.000Z",
  });

  assert.equal(result.report.generatedAt, "2026-07-05T03:40:00.000Z");
  assert.equal(result.report.answerLabel, "HR escalation draft");
  assert.equal(result.report.answerPath, undefined);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["contradicted"]);
});

test("programmatic API returns fail-policy metadata for one raw-content verification", async () => {
  const options: InMemorySingleVerificationResultOptions = {
    answer: "Employees receive 12 weeks of paid parental leave.",
    answerPath: "answers/hr.md",
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
    ],
    failOn: ["unsupported"],
    generatedAt: "2026-07-05T03:42:00.000Z",
  };
  const result = await verifyAnswerContentsResult(options);

  assert.equal(result.report.generatedAt, "2026-07-05T03:42:00.000Z");
  assert.equal(result.report.answerPath, "answers/hr.md");
  assert.equal(result.shouldFail, false);
  assert.deepEqual(result.failVerdicts, []);
});

test("programmatic API returns top-level fail-policy metadata for in-memory batches", () => {
  const result = verifyAnswersResult({
    answers: [
      {
        answer: "Employees receive 16 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
      {
        answer: "Short.",
        answerLabel: "empty draft",
      },
    ],
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["needs_review", "contradicted", "unsupported"],
    generatedAt: "2026-07-05T03:43:00.000Z",
  });

  assert.equal(result.report.generatedAt, "2026-07-05T03:43:00.000Z");
  assert.equal(result.report.summary.answersWithFailures, 2);
  assert.equal(result.report.summary.answersWithoutClaims, 1);
  assert.equal(result.report.answers[0]?.answerHasClaims, true);
  assert.equal(result.report.answers[1]?.answerHasClaims, false);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
});

test("programmatic API batches in-memory answers against raw source content", async () => {
  const report = await verifyAnswerBatchContents({
    answers: [
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
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
        content: `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "medium",
    failOn: ["contradicted"],
    generatedAt: "2026-07-05T03:45:00.000Z",
  });

  assert.equal(report.generatedAt, "2026-07-05T03:45:00.000Z");
  assert.equal(report.answerCount, 2);
  assert.deepEqual(report.summary, {
    verified: 1,
    contradicted: 1,
    unsupported: 0,
    needs_review: 0,
    answersWithClaims: 2,
    answersWithoutClaims: 0,
    answersWithFailures: 1,
  });
  assert.deepEqual(
    report.answers.map((answer) => ({
      label: answer.answerLabel,
      path: answer.answerPath,
      shouldFail: answer.shouldFail,
    })),
    [
      {
        label: "hr",
        path: "answers/hr.md",
        shouldFail: false,
      },
      {
        label: "support escalation",
        path: "<memory:2>",
        shouldFail: true,
      },
    ],
  );
  assert.equal(report.sources[1]?.title, "Refund Policy");
  assert.equal(report.sources[1]?.trustLevel, "medium");
});

test("programmatic API returns top-level fail-policy metadata for batch file verification", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-result-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourcePath = join(tempDir, "policy.md");

    await mkdir(answerDir, { recursive: true });
    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const sources = await loadSources({
      sourcePaths: [sourcePath],
      sourceDirs: [],
      defaultTrustLevel: "high",
    });
    const result = await verifyAnswerBatchResult({
      answerPaths: [],
      answerDirPaths: [answerDir],
      sources,
      failOn: ["needs_review", "contradicted"],
      generatedAt: "2026-07-05T03:46:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-05T03:46:00.000Z");
    assert.equal(result.report.summary.answersWithFailures, 2);
    assert.equal(result.report.summary.answersWithoutClaims, 1);
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns top-level fail-policy metadata for batch file inputs", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-batch-file-input-result-"));

  try {
    const answerDir = join(tempDir, "answers");
    const sourceDir = join(tempDir, "sources");

    await Promise.all([
      mkdir(answerDir, { recursive: true }),
      mkdir(sourceDir, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(answerDir, "empty.md"), "Short.\n", "utf8"),
      writeFile(
        join(answerDir, "hr.md"),
        "Employees receive 16 weeks of paid parental leave.\n",
        "utf8",
      ),
      writeFile(join(sourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const result = await verifyAnswerBatchFileInputsResult({
      answerPaths: [],
      answerDirPaths: [answerDir],
      sourcePaths: [],
      sourceDirs: [sourceDir],
      defaultTrustLevel: "high",
      failOn: ["needs_review", "contradicted"],
      generatedAt: "2026-07-06T13:05:00.000Z",
    });

    assert.equal(result.report.generatedAt, "2026-07-06T13:05:00.000Z");
    assert.equal(result.report.summary.answersWithFailures, 2);
    assert.equal(result.report.summary.answersWithoutClaims, 1);
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API returns top-level fail-policy metadata for raw-content batches", async () => {
  const result = await verifyAnswerBatchContentsResult({
    answers: [
      {
        answer: "Refunds are available for 14 days from the purchase date.",
        answerLabel: "support escalation",
      },
      {
        answer: "Short.",
        answerPath: "answers/empty.md",
      },
    ],
    sources: [
      {
        sourcePath: "help/refunds.html",
        content: `<!doctype html>
<html>
  <body>
    <main>
      <p>Refunds are available for 30 days from the purchase date.</p>
    </main>
  </body>
</html>`,
      },
    ],
    defaultTrustLevel: "high",
    failOn: ["unsupported", "needs_review", "contradicted"],
    generatedAt: "2026-07-05T03:47:00.000Z",
  });

  assert.equal(result.report.generatedAt, "2026-07-05T03:47:00.000Z");
  assert.equal(result.report.summary.answersWithFailures, 2);
  assert.equal(result.report.summary.answersWithoutClaims, 1);
  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["needs_review", "contradicted"]);
});

test("programmatic API rejects empty in-memory source batches", async () => {
  await assert.rejects(
    () =>
      loadSourcesFromContent({
        sources: [],
      }),
    {
      message: "At least one in-memory source is required.",
    },
  );
});

test("programmatic API evaluates in-memory fixture arrays for workflow callers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-evaluation-batch-"));

  try {
    const answerPath = join(tempDir, "answers", "hr-answer.md");
    const sourcePath = join(tempDir, "sources", "hr-policy.md");
    const fixturePath = join(tempDir, "fixtures", "hr-policy.json");

    await mkdir(join(tempDir, "answers"), { recursive: true });
    await mkdir(join(tempDir, "sources"), { recursive: true });
    await mkdir(join(tempDir, "fixtures"), { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const scorecards = await evaluateFixtures({
      fixtures: [
        {
          name: "HR policy fixture",
          answerPath: "answers/hr-answer.md",
          sourcePaths: ["sources/hr-policy.md"],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        },
      ],
      baseDir: tempDir,
      fixturePaths: [fixturePath],
      generatedAt: "2026-07-05T19:00:00.000Z",
    });

    assert.equal(scorecards.length, 1);
    assert.equal(scorecards[0]?.fixtureName, "HR policy fixture");
    assert.equal(scorecards[0]?.fixturePath, fixturePath);
    assert.equal(scorecards[0]?.answerPath, answerPath);
    assert.deepEqual(scorecards[0]?.sourcePaths, [sourcePath]);
    assert.equal(scorecards[0]?.report.generatedAt, "2026-07-05T19:00:00.000Z");
    assert.equal(scorecards[0]?.summaryMatches, true);
    assert.equal(scorecards[0]?.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API loads and evaluates in-memory fixture JSON files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-evaluation-content-"));

  try {
    const answerPath = join(tempDir, "answers", "hr-answer.md");
    const sourcePath = join(tempDir, "sources", "hr-policy.md");
    const fixturePath = join(tempDir, "fixtures", "hr-policy.json");
    const fixtureContent = JSON.stringify({
      name: "HR policy fixture",
      answerPath: "../answers/hr-answer.md",
      sourcePaths: ["../sources/hr-policy.md"],
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["verified"],
    });

    await mkdir(join(tempDir, "answers"), { recursive: true });
    await mkdir(join(tempDir, "sources"), { recursive: true });
    await mkdir(join(tempDir, "fixtures"), { recursive: true });
    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const fixture = loadEvaluationFixtureFromContent(Buffer.from(fixtureContent, "utf8"));
    assert.equal(fixture.name, "HR policy fixture");
    assert.deepEqual(fixture.expectedClaimVerdicts, ["verified"]);

    const scorecards = await evaluateFixtureContents({
      fixtures: [
        {
          fixturePath,
          content: fixtureContent,
        },
      ],
      generatedAt: "2026-07-05T20:30:00.000Z",
    });

    assert.equal(scorecards.length, 1);
    assert.equal(scorecards[0]?.fixturePath, fixturePath);
    assert.equal(scorecards[0]?.answerPath, answerPath);
    assert.deepEqual(scorecards[0]?.sourcePaths, [sourcePath]);
    assert.equal(scorecards[0]?.report.generatedAt, "2026-07-05T20:30:00.000Z");
    assert.equal(scorecards[0]?.summaryMatches, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API evaluates one in-memory fixture JSON file", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-evaluation-single-content-"));

  try {
    const answerPath = join(tempDir, "answers", "support-answer.md");
    const sourcePath = join(tempDir, "sources", "support-policy.md");
    const fixturePath = join(tempDir, "fixtures", "support-policy.json");
    const fixtureContent = JSON.stringify({
      name: "Support policy fixture",
      answerPath: "../answers/support-answer.md",
      sourcePaths: ["../sources/support-policy.md"],
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["verified"],
    });

    await mkdir(join(tempDir, "answers"), { recursive: true });
    await mkdir(join(tempDir, "sources"), { recursive: true });
    await mkdir(join(tempDir, "fixtures"), { recursive: true });
    await Promise.all([
      writeFile(
        answerPath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
      writeFile(
        sourcePath,
        "Refunds are available for 30 days from the purchase date.\n",
        "utf8",
      ),
    ]);

    const scorecard = await evaluateFixtureContent({
      fixturePath,
      content: fixtureContent,
      generatedAt: "2026-07-05T20:45:00.000Z",
    });

    assert.equal(scorecard.fixturePath, fixturePath);
    assert.equal(scorecard.answerPath, answerPath);
    assert.deepEqual(scorecard.sourcePaths, [sourcePath]);
    assert.equal(scorecard.report.generatedAt, "2026-07-05T20:45:00.000Z");
    assert.equal(scorecard.summaryMatches, true);
    assert.equal(scorecard.score, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API rejects empty in-memory evaluation batches", async () => {
  await assert.rejects(
    evaluateFixtures({
      fixtures: [],
    }),
    /At least one evaluation fixture is required\./,
  );
});

test("programmatic API rejects empty in-memory evaluation fixture JSON batches", async () => {
  await assert.rejects(
    evaluateFixtureContents({
      fixtures: [],
    }),
    /At least one in-memory evaluation fixture is required\./,
  );
});

test("programmatic API rejects invalid in-memory evaluation fixture fields", async () => {
  await assert.rejects(
    evaluateFixtureContents({
      fixtures: [
        {
          fixturePath: "fixtures/broken.json",
          content: JSON.stringify({
            name: "Broken fixture",
            answerPath: "answers/hr.md",
            sourcePaths: ["sources/hr-policy.md"],
            expectedSummary: {
              verified: 1,
              contradicted: 0,
              unsupported: 0,
              needs_review: 0,
            },
            defaultTrustLevel: "urgent",
          }),
        },
      ],
    }),
    /Evaluation fixture fixtures\/broken\.json\.defaultTrustLevel unsupported trust level: urgent\./,
  );
});

test("programmatic API rejects domain filters that match no evaluation fixtures", async () => {
  await assert.rejects(
    evaluateFixtureContents({
      fixtures: [
        {
          fixturePath: resolve("examples/evaluations/hr-policy.json"),
          content: await readFile(resolve("examples/evaluations/hr-policy.json"), "utf8"),
        },
      ],
      domains: ["finance"],
    }),
    /No evaluation fixtures matched domain filter: finance/,
  );
});

test("programmatic API rejects evaluation fixtures whose expected claim verdicts do not match summary totals", async () => {
  await assert.rejects(
    evaluateFixtureContents({
      fixtures: [
        {
          fixturePath: "fixtures/broken.json",
          content: JSON.stringify({
            name: "Broken fixture",
            answerPath: "answers/hr.md",
            sourcePaths: ["sources/hr-policy.md"],
            expectedSummary: {
              verified: 2,
              contradicted: 0,
              unsupported: 0,
              needs_review: 0,
            },
            expectedClaimVerdicts: ["verified"],
          }),
        },
      ],
    }),
    /Evaluation fixture fixtures\/broken\.json\.expectedClaimVerdicts must include 2 entries to match the totals in Evaluation fixture fixtures\/broken\.json\.expectedSummary\./,
  );
});

test("programmatic API rejects empty file-backed evaluation batches", async () => {
  await assert.rejects(
    evaluateFixtureFiles({
      fixturePaths: [],
      fixtureDirPaths: [],
    }),
    /No evaluation fixture files found in /,
  );
});

test("programmatic API returns mismatch metadata for in-memory evaluation batches", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-eval-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "source.md");
    const fixturePath = join(tempDir, "fixture.json");

    await Promise.all([
      writeFile(answerPath, "Refunds are available for 30 days from the purchase date.\n", "utf8"),
      writeFile(sourcePath, "Refunds are available for 14 days from the purchase date.\n", "utf8"),
    ]);

    const result = await evaluateFixturesResult({
      fixtures: [
        {
          name: "Refund mismatch fixture",
          answerPath,
          sourcePaths: [sourcePath],
          expectedSummary: {
            verified: 1,
            contradicted: 0,
            unsupported: 0,
            needs_review: 0,
          },
          expectedClaimVerdicts: ["verified"],
        },
      ],
      fixturePaths: [fixturePath],
      generatedAt: "2026-07-05T21:00:00.000Z",
    });

    assert.equal(result.shouldFail, true);
    assert.equal(result.mismatchCount, 1);
    assert.deepEqual(result.failureReasons, ["mismatch"]);
    assert.equal(result.summary.fixtureCount, 1);
    assert.equal(result.summary.matchedClaims, 0);
    assert.equal(result.summary.totalExpectedClaims, 1);
    assert.equal(result.summary.score, 0);
    assert.equal(result.summary.scoreLabel, "0%");
    assert.equal(result.scorecards.length, 1);
    assert.equal(result.scorecards[0]?.fixturePath, fixturePath);
    assert.equal(result.scorecards[0]?.report.generatedAt, "2026-07-05T21:00:00.000Z");
    assert.equal(result.scorecards[0]?.summaryMatches, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic in-memory evaluation batches enforce minimum aggregate scores", async () => {
  const answerPath = join(process.cwd(), "examples/answers/hr-answer.md");
  const sourcePath = join(process.cwd(), "examples/sources/hr-policy.md");
  const result = await evaluateFixturesResult({
    fixtures: [
      {
        name: "HR threshold fixture",
        answerPath,
        sourcePaths: [sourcePath],
        expectedSummary: {
          verified: 3,
          contradicted: 0,
          unsupported: 0,
          needs_review: 0,
        },
        expectedClaimVerdicts: ["verified", "verified", "verified"],
      },
    ],
    minScore: 1,
  });

  assert.equal(result.shouldFail, true);
  assert.equal(result.minScore, 1);
  assert.equal(result.scoreThresholdPassed, false);
  assert.equal(result.mismatchCount, 1);
});

test("programmatic API returns mismatch metadata for in-memory evaluation fixture JSON helpers", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-eval-content-result-"));

  try {
    const answerPath = join(tempDir, "answer.md");
    const sourcePath = join(tempDir, "source.md");
    const fixturePath = join(tempDir, "fixture.json");

    await Promise.all([
      writeFile(answerPath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
      writeFile(sourcePath, "Employees receive 12 weeks of paid parental leave.\n", "utf8"),
    ]);

    const fixtureContent = JSON.stringify({
      name: "HR match fixture",
      answerPath,
      sourcePaths: [sourcePath],
      expectedSummary: {
        verified: 1,
        contradicted: 0,
        unsupported: 0,
        needs_review: 0,
      },
      expectedClaimVerdicts: ["verified"],
    });

    const batchResult = await evaluateFixtureContentsResult({
      fixtures: [
        {
          fixturePath,
          content: fixtureContent,
        },
      ],
      generatedAt: "2026-07-05T21:15:00.000Z",
    });
    const singleResult = await evaluateFixtureContentResult({
      fixturePath,
      content: fixtureContent,
      generatedAt: "2026-07-05T21:15:00.000Z",
    });

    assert.equal(batchResult.shouldFail, false);
    assert.equal(batchResult.mismatchCount, 0);
    assert.equal(batchResult.summary.fixtureCount, 1);
    assert.equal(batchResult.summary.mismatchCount, 0);
    assert.equal(batchResult.summary.matchedClaims, 1);
    assert.equal(batchResult.summary.totalExpectedClaims, 1);
    assert.equal(batchResult.summary.score, 1);
    assert.equal(batchResult.summary.scoreLabel, "100%");
    assert.equal(batchResult.scorecards[0]?.report.generatedAt, "2026-07-05T21:15:00.000Z");
    assert.equal(singleResult.hasMismatch, false);
    assert.equal(singleResult.scorecard.fixturePath, fixturePath);
    assert.equal(singleResult.scorecard.report.generatedAt, "2026-07-05T21:15:00.000Z");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API can gate evaluation batches on a minimum aggregate score", async () => {
  const fixturePath = join(process.cwd(), "examples/evaluations/hr-policy.json");
  const fixtureContent = await readFile(fixturePath, "utf8");

  const passing = await evaluateFixtureContentsResult({
    fixtures: [{ fixturePath, content: fixtureContent }],
    minScore: 1,
  });
  const failing = await evaluateFixtureContentsResult({
    fixtures: [
      {
        fixturePath,
        content: fixtureContent.replace(
          '["contradicted", "verified", "unsupported"]',
          '["unsupported", "verified", "contradicted"]',
        ),
      },
    ],
    minScore: 1,
  });

  assert.equal(passing.shouldFail, false);
  assert.equal(passing.minScore, 1);
  assert.equal(passing.scoreThresholdPassed, true);
  assert.deepEqual(passing.failureReasons, []);
  assert.equal(failing.shouldFail, true);
  assert.equal(failing.minScore, 1);
  assert.equal(failing.scoreThresholdPassed, false);
  assert.deepEqual(failing.failureReasons, ["mismatch", "min_score"]);
});

test("programmatic API returns mismatch metadata for fixture file evaluation helpers", async () => {
  const batchResult = await evaluateFixtureFilesResult({
    fixturePaths: [],
    fixtureDirPaths: [join(process.cwd(), "examples/evaluations")],
    generatedAt: "2026-07-05T21:30:00.000Z",
  });
  const singleResult = await evaluateFixtureFileResult({
    fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
    generatedAt: "2026-07-05T21:30:00.000Z",
  });
  const contentResult = await evaluateFixtureContentResult({
    fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
    content: await readFile(join(process.cwd(), "examples/evaluations/hr-policy.json")),
    generatedAt: "2026-07-05T21:30:00.000Z",
  });

  assert.equal(batchResult.shouldFail, false);
  assert.equal(batchResult.mismatchCount, 0);
  assert.equal(batchResult.summary.fixtureCount, 77);
  assert.equal(batchResult.summary.mismatchCount, 0);
  assert.equal(batchResult.summary.matchedClaims, 228);
  assert.equal(batchResult.summary.totalExpectedClaims, 228);
  assert.equal(batchResult.summary.score, 1);
  assert.equal(batchResult.summary.scoreLabel, "100%");
  assert.deepEqual(batchResult.summary.domains, [
    {
      domain: "hr",
      fixtureCount: 27,
      mismatchCount: 0,
      mismatchRate: 0,
      answersWithClaims: 27,
      answersWithoutClaims: 0,
      matchedClaims: 82,
      totalExpectedClaims: 82,
      score: 1,
      scoreLabel: "100%",
      expectedSummary: { verified: 32, contradicted: 19, unsupported: 22, needs_review: 9 },
      actualSummary: { verified: 32, contradicted: 19, unsupported: 22, needs_review: 9 },
    },
    {
      domain: "support",
      fixtureCount: 50,
      mismatchCount: 0,
      mismatchRate: 0,
      answersWithClaims: 49,
      answersWithoutClaims: 1,
      matchedClaims: 146,
      totalExpectedClaims: 146,
      score: 1,
      scoreLabel: "100%",
      expectedSummary: { verified: 55, contradicted: 33, unsupported: 42, needs_review: 16 },
      actualSummary: { verified: 55, contradicted: 33, unsupported: 42, needs_review: 16 },
    },
  ]);
  assert.equal(batchResult.scorecards.length, 77);
  assert.equal(singleResult.hasMismatch, false);
  assert.equal(singleResult.scorecard.fixtureName, "HR policy example");
  assert.equal(contentResult.hasMismatch, false);
  assert.equal(contentResult.scorecard.fixtureName, "HR policy example");
});

test("programmatic API accepts object-style single fixture file evaluation helpers", async () => {
  const fixturePath = join(process.cwd(), "examples/evaluations/support-policy.json");

  const scorecard = await evaluateFixtureFile({
    fixturePath,
    generatedAt: "2026-07-05T21:35:00.000Z",
  });
  const result = await evaluateFixtureFileResult({
    fixturePath,
    generatedAt: "2026-07-05T21:35:00.000Z",
  });

  assert.equal(scorecard.fixturePath, fixturePath);
  assert.equal(scorecard.report.generatedAt, "2026-07-05T21:35:00.000Z");
  assert.equal(result.hasMismatch, false);
  assert.equal(result.scorecard.fixturePath, fixturePath);
  assert.equal(result.scorecard.report.generatedAt, "2026-07-05T21:35:00.000Z");
});

test("programmatic API exports verification report renderers", () => {
  const report = verifyAnswer(
    "Benefits begin on day one of employment.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Benefits begin on day one of employment.",
      },
    ],
    "2026-07-05T02:30:00.000Z",
    "examples/answers/hr-answer.md",
  );
  const batchReport = {
    generatedAt: "2026-07-05T02:30:00.000Z",
    answerCount: 1,
    sourceCount: 1,
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high" as const,
      },
    ],
    answers: [
      {
        answerLabel: "hr-answer",
        answerPath: "examples/answers/hr-answer.md",
        report,
        shouldFail: false,
        failVerdicts: [],
      },
    ],
    summary: {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
      answersWithClaims: 1,
      answersWithFailures: 0,
      answersWithoutClaims: 0,
    },
  };

  assert.match(renderTextReport(report), /Quorum Verification Report/);
  assert.match(renderMarkdownReport(report), /# Quorum Verification Report/);
  assert.match(renderHtmlReport(report), /<!doctype html>/i);
  assert.match(renderReviewerDecisionCsv(report), /generated_at,answer_label,answer_path/);
  assert.match(renderSummaryCsv(report), /primary_verdict/);
  assert.match(renderBatchMarkdownReport(batchReport), /# Quorum Batch Verification Report/);
  assert.match(renderBatchHtmlReport(batchReport), /<!doctype html>/i);
  assert.match(renderBatchReviewerDecisionCsv(batchReport), /generated_at,answer_label,answer_path/);
  assert.match(renderBatchSummaryCsv(batchReport), /primary_verdict/);
  assert.equal(renderAnswerLabel("examples/answers/hr-answer.md"), "hr-answer");
  assert.deepEqual(
    renderAnswerLabels([
      "/tmp/quorum/hr/answer.md",
      "/tmp/quorum/support/answer.md",
    ]),
    ["hr/answer", "support/answer"],
  );
  assert.equal(
    renderAnswerPreview("<main><p>Refunds are available within 30 days of purchase.</p></main>"),
    "Refunds are available within 30 days of purchase.",
  );
});

test("programmatic API imports reviewer decision csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
      "utf8",
    );

    const report = await importReviewerDecisionFile(reviewCsvPath);

    assert.equal(report.summary.totalClaims, 1);
    assert.equal(report.summary.reviewedClaims, 1);
    assert.equal(report.answerGroups[0]?.label, "HR answer");
    assert.equal(report.answerGroups[0]?.answerPath, "answers/hr.md");
    assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API imports reviewer decision csv files through options objects", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-options-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
      "utf8",
    );

    const report = await importReviewerDecisionFile({ reviewCsvPath });

    assert.equal(report.summary.totalClaims, 1);
    assert.equal(report.summary.reviewedClaims, 1);
    assert.equal(report.answerGroups[0]?.label, "HR answer");
    assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API imports reviewer decision csv content through workflow helpers", () => {
  const report = importReviewerDecisionContents(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
  );

  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.summary.reviewedClaims, 1);
  assert.equal(report.answerGroups[0]?.label, "HR answer");
  assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
});

test("programmatic API imports reviewer decision csv content through options objects", () => {
  const report = importReviewerDecisionContents({
    reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Looks good
`,
  });

  assert.equal(report.summary.totalClaims, 1);
  assert.equal(report.summary.reviewedClaims, 1);
  assert.equal(report.answerGroups[0]?.label, "HR answer");
  assert.equal(report.claims[0]?.reviewerNotes, "Looks good");
});

test("programmatic API applies fail policy to imported reviewer decision csv files", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-result-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
      "utf8",
    );

    const result = await importReviewerDecisionFileResult(reviewCsvPath, ["unsupported"]);

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["unsupported"]);
    assert.equal(result.report.summary.reviewedClaims, 1);
    assert.equal(result.report.summary.unsupported, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API applies fail policy to imported reviewer decision csv files through options objects", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-api-import-result-options-"));

  try {
    const reviewCsvPath = join(tempDir, "review.csv");
    await writeFile(
      reviewCsvPath,
      `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
      "utf8",
    );

    const result = await importReviewerDecisionFileResult({
      reviewCsvPath,
      failOn: ["unsupported"],
    });

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["unsupported"]);
    assert.equal(result.report.summary.reviewedClaims, 1);
    assert.equal(result.report.summary.unsupported, 1);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("programmatic API applies fail policy to reviewer decision csv content workflow helpers", () => {
  const result = importReviewerDecisionContentsResult(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
    ["unsupported"],
  );

  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
  assert.equal(result.report.summary.reviewedClaims, 1);
  assert.equal(result.report.summary.unsupported, 1);
});

test("programmatic API applies fail policy to reviewer decision csv content through options objects", () => {
  const result = importReviewerDecisionContentsResult({
    reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
    failOn: ["unsupported"],
  });

  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
  assert.equal(result.report.summary.reviewedClaims, 1);
  assert.equal(result.report.summary.unsupported, 1);
});

test("programmatic API exports reviewer import helpers for in-memory callers", () => {
  const report = importReviewerDecisions(`claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,,
`);

  const markdown = renderReviewerDecisionImportMarkdownReport(report, ["needs_review"]);

  assert.equal(report.summary.pendingClaims, 1);
  assert.match(markdown, /# Quorum Reviewer Decision Import/);
  assert.match(markdown, /- Pending claims: 1/);
});

test("programmatic API exports reviewer import fail-policy helpers for in-memory callers", () => {
  const result = importReviewerDecisionsResult(
    `claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
claim_1,Employees receive free catered lunch every day.,unsupported,No approved source matched strongly enough,,,unsupported,Needs People Ops review
`,
    ["unsupported"],
  );

  assert.equal(result.shouldFail, true);
  assert.deepEqual(result.failVerdicts, ["unsupported"]);
  assert.equal(result.report.summary.totalClaims, 1);
  assert.equal(result.report.summary.unsupported, 1);
});

test("programmatic API exports fail-policy helpers for workflow callers", () => {
  assert.deepEqual(CLAIM_VERDICTS, [
    "verified",
    "unsupported",
    "contradicted",
    "needs_review",
  ]);
  assert.equal(parseClaimVerdict("contradicted"), "contradicted");
  assert.throws(() => parseClaimVerdict("bad"), /Unsupported verdict "bad"/);

  const report = verifyAnswer(
    "Short.",
    [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    "2026-07-06T00:15:00.000Z",
  );

  assert.deepEqual(matchingFailVerdicts(report, ["needs_review", "unsupported"]), [
    "needs_review",
  ]);
  assert.deepEqual(
    matchingFailVerdicts(report, ["needs_review", "needs_review", "unsupported"]),
    ["needs_review"],
  );
  assert.equal(shouldFailReport(report, ["unsupported"]), false);
  assert.equal(shouldFailReport(report, ["needs_review"]), true);
});

test("programmatic API de-duplicates repeated fail verdicts in workflow results", async () => {
  const singleResult = verifyAnswerResult({
    answer: "Employees receive 16 weeks of paid parental leave.",
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["contradicted", "contradicted"],
    generatedAt: "2026-07-06T00:16:00.000Z",
  });

  assert.deepEqual(singleResult.failVerdicts, ["contradicted"]);

  const batchResult = verifyAnswersResult({
    answers: [
      {
        answer: "Short.",
        answerPath: "answers/empty.md",
      },
      {
        answer: "Employees receive 16 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
      },
    ],
    sources: [
      {
        id: "source_1",
        title: "Benefits policy",
        trustLevel: "high",
        content: "Employees receive 12 weeks of paid parental leave.",
      },
    ],
    failOn: ["needs_review", "needs_review", "contradicted", "contradicted"],
    generatedAt: "2026-07-06T00:17:00.000Z",
  });

  assert.deepEqual(batchResult.failVerdicts, ["needs_review", "contradicted"]);

  const importResult = importReviewerDecisionContentsResult(
    `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,unsupported,Needs policy follow-up
`,
    ["unsupported", "unsupported"],
  );

  assert.deepEqual(importResult.failVerdicts, ["unsupported"]);
});

test("HTTP API advertises the allowed method on POST-only route errors", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      headers: { "X-Quorum-Request-Id": "wrong-method-check" },
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(response.headers.get("access-control-expose-headers"), API_CORS_EXPOSED_HEADERS);
    assert.deepEqual(await response.json(), {
      error: "Method not allowed. Use POST.",
      requestId: "wrong-method-check",
    });
  } finally {
    await api.close();
  }
});

test("HTTP API advertises allowed methods on GET-only route errors", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/health`, {
      method: "POST",
      headers: { "X-Quorum-Request-Id": "health-method-check" },
    });

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.deepEqual(await response.json(), {
      error: "Method not allowed. Use GET, HEAD.",
      requestId: "health-method-check",
    });
  } finally {
    await api.close();
  }
});

test("HTTP API supports conditional OpenAPI downloads with ETags", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const firstResponse = await fetch(`${api.url}/openapi.json`);
    const etag = firstResponse.headers.get("etag");

    assert.equal(firstResponse.status, 200);
    assert.match(etag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(firstResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.equal(firstResponse.headers.get("access-control-expose-headers"), API_CORS_EXPOSED_HEADERS);
    assert.ok((await firstResponse.text()).includes('"openapi": "3.1.0"'));

    const notModifiedResponse = await fetch(`${api.url}/openapi.json`, {
      headers: { "if-none-match": etag ?? "" },
    });

    assert.equal(notModifiedResponse.status, 304);
    assert.equal(notModifiedResponse.headers.get("etag"), etag);
    assert.equal(await notModifiedResponse.text(), "");

    const headResponse = await fetch(`${api.url}/openapi.json`, {
      method: "HEAD",
      headers: { "if-none-match": '"stale-etag"' },
    });

    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("etag"), etag);
    assert.equal(await headResponse.text(), "");
  } finally {
    await api.close();
  }
});

test("programmatic API serves single-answer verification over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const generatedAt = "2026-07-07T19:15:00.000Z";

  try {
    const indexResponse = await fetch(api.url, {
      headers: { "X-Quorum-Request-Id": "workflow-trace-2026-07-10" },
    });
    const expectedEndpoints: readonly ApiDiscoveryEndpoint[] = API_ENDPOINTS;
    const expectedDiscoveryResponse: ApiDiscoveryResponse = {
      requestId: "workflow-trace-2026-07-10",
      service: "quorum",
      version: "0.1.0",
      openapiPath: "/openapi.json",
      capabilities: API_CAPABILITIES,
      endpoints: expectedEndpoints,
    };
    const expectedCapabilitiesResponse: ApiCapabilitiesResponse = {
      requestId: "",
      service: "quorum",
      version: "0.1.0",
      openapiPath: "/openapi.json",
      capabilities: API_CAPABILITIES,
    };
    const expectedHealthResponse: ApiHealthResponse = {
      ok: true,
      requestId: "",
      service: "quorum",
      version: "0.1.0",
    };
    assert.equal(indexResponse.status, 200);
    assert.equal(indexResponse.headers.get("access-control-allow-origin"), "*");
    assert.equal(
      indexResponse.headers.get("access-control-expose-headers"),
      API_CORS_EXPOSED_HEADERS,
    );
    assert.equal(indexResponse.headers.get("x-quorum-request-id"), "workflow-trace-2026-07-10");
    assert.equal(indexResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(indexResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(indexResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(indexResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(indexResponse.headers.get("x-quorum-request-timeout-ms"), "30000");
    assert.deepEqual(await indexResponse.json(), expectedDiscoveryResponse);

    const capabilitiesResponse = await fetch(`${api.url}/capabilities`);
    assert.equal(capabilitiesResponse.status, 200);
    const capabilitiesEtag = capabilitiesResponse.headers.get("etag");
    assert.match(capabilitiesEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(capabilitiesResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(capabilitiesResponse.headers.get("x-quorum-request-timeout-ms"), "30000");
    assert.match(capabilitiesResponse.headers.get("x-quorum-request-id") ?? "", /^[0-9a-f-]{36}$/);
    const capabilitiesPayload = await capabilitiesResponse.json() as ApiCapabilitiesResponse;
    expectedCapabilitiesResponse.requestId = capabilitiesResponse.headers.get("x-quorum-request-id") ?? "";
    assert.deepEqual(capabilitiesPayload, expectedCapabilitiesResponse);

    const conditionalCapabilitiesHeadResponse = await fetch(`${api.url}/capabilities`, { method: "HEAD" });
    assert.equal(conditionalCapabilitiesHeadResponse.status, 200);
    assert.equal(conditionalCapabilitiesHeadResponse.headers.get("etag"), capabilitiesEtag);
    assert.equal(await conditionalCapabilitiesHeadResponse.text(), "");

    const notModifiedCapabilitiesResponse = await fetch(`${api.url}/capabilities`, {
      headers: { "if-none-match": capabilitiesEtag ?? "" },
    });
    assert.equal(notModifiedCapabilitiesResponse.status, 304);
    assert.equal(notModifiedCapabilitiesResponse.headers.get("etag"), capabilitiesEtag);
    assert.equal(await notModifiedCapabilitiesResponse.text(), "");

    const versionResponse = await fetch(`${api.url}/version`);
    assert.equal(versionResponse.status, 200);
    const versionEtag = versionResponse.headers.get("etag");
    assert.match(versionEtag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(versionResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.deepEqual(await versionResponse.json(), {
      requestId: versionResponse.headers.get("x-quorum-request-id"),
      service: "quorum",
      version: "0.1.0",
    });

    const notModifiedVersionResponse = await fetch(`${api.url}/version`, {
      headers: { "if-none-match": versionEtag ?? "" },
    });
    assert.equal(notModifiedVersionResponse.status, 304);
    assert.equal(notModifiedVersionResponse.headers.get("etag"), versionEtag);
    assert.equal(await notModifiedVersionResponse.text(), "");

    const healthResponse = await fetch(`${api.url}/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal(healthResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(healthResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(healthResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(healthResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(healthResponse.headers.get("x-quorum-request-timeout-ms"), "30000");
    assert.equal(healthResponse.headers.get("cache-control"), "no-store");
    assert.match(healthResponse.headers.get("x-quorum-request-id") ?? "", /^[0-9a-f-]{36}$/);
    const healthPayload = await healthResponse.json() as ApiHealthResponse;
    expectedHealthResponse.requestId = healthResponse.headers.get("x-quorum-request-id") ?? "";
    assert.deepEqual(healthPayload, expectedHealthResponse);

    const healthzResponse = await fetch(`${api.url}/healthz`);
    assert.equal(healthzResponse.status, 200);
    assert.equal(healthzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(healthzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(healthzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(healthzResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(healthzResponse.headers.get("cache-control"), "no-store");
    assert.match(healthzResponse.headers.get("x-quorum-request-id") ?? "", /^[0-9a-f-]{36}$/);
    const healthzPayload = await healthzResponse.json() as ApiHealthResponse;
    assert.equal(healthzPayload.requestId, healthzResponse.headers.get("x-quorum-request-id"));
    assert.deepEqual({ ...healthzPayload, requestId: "" }, { ...expectedHealthResponse, requestId: "" });

    const readyzResponse = await fetch(`${api.url}/readyz`);
    assert.equal(readyzResponse.status, 200);
    assert.equal(readyzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(readyzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(readyzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(readyzResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(readyzResponse.headers.get("x-quorum-request-timeout-ms"), "30000");
    assert.equal(readyzResponse.headers.get("cache-control"), "no-store");
    assert.match(readyzResponse.headers.get("x-quorum-request-id") ?? "", /^[0-9a-f-]{36}$/);
    const readyzPayload = await readyzResponse.json() as ApiHealthResponse;
    assert.equal(readyzPayload.requestId, readyzResponse.headers.get("x-quorum-request-id"));
    assert.deepEqual({ ...readyzPayload, requestId: "" }, { ...expectedHealthResponse, requestId: "" });

    const livezResponse = await fetch(`${api.url}/livez`);
    assert.equal(livezResponse.status, 200);
    assert.equal(livezResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(livezResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(livezResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(livezResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(livezResponse.headers.get("x-quorum-request-timeout-ms"), "30000");
    assert.equal(livezResponse.headers.get("cache-control"), "no-store");
    assert.match(livezResponse.headers.get("x-quorum-request-id") ?? "", /^[0-9a-f-]{36}$/);
    const livezPayload = await livezResponse.json() as ApiHealthResponse;
    assert.equal(livezPayload.requestId, livezResponse.headers.get("x-quorum-request-id"));
    assert.deepEqual({ ...livezPayload, requestId: "" }, { ...expectedHealthResponse, requestId: "" });

    const headIndexResponse = await fetch(api.url, { method: "HEAD" });
    assert.equal(headIndexResponse.status, 200);
    assert.equal(headIndexResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headIndexResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headIndexResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headIndexResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headIndexResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(await headIndexResponse.text(), "");

    const headCapabilitiesResponse = await fetch(`${api.url}/capabilities`, { method: "HEAD" });
    assert.equal(headCapabilitiesResponse.status, 200);
    assert.equal(headCapabilitiesResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headCapabilitiesResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(await headCapabilitiesResponse.text(), "");

    const headVersionResponse = await fetch(`${api.url}/version`, { method: "HEAD" });
    assert.equal(headVersionResponse.status, 200);
    assert.equal(headVersionResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headVersionResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headVersionResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headVersionResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headVersionResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(headVersionResponse.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    assert.match(headVersionResponse.headers.get("etag") ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(await headVersionResponse.text(), "");

    const headHealthResponse = await fetch(`${api.url}/health`, { method: "HEAD" });
    assert.equal(headHealthResponse.status, 200);
    assert.equal(headHealthResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headHealthResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headHealthResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headHealthResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headHealthResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(headHealthResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headHealthResponse.text(), "");

    const headHealthzResponse = await fetch(`${api.url}/healthz`, { method: "HEAD" });
    assert.equal(headHealthzResponse.status, 200);
    assert.equal(headHealthzResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headHealthzResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headHealthzResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headHealthzResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headHealthzResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(headHealthzResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headHealthzResponse.text(), "");

    const headReadyzResponse = await fetch(`${api.url}/readyz`, { method: "HEAD" });
    assert.equal(headReadyzResponse.status, 200);
    assert.equal(headReadyzResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headReadyzResponse.text(), "");

    const headLivezResponse = await fetch(`${api.url}/livez`, { method: "HEAD" });
    assert.equal(headLivezResponse.status, 200);
    assert.equal(headLivezResponse.headers.get("cache-control"), "no-store");
    assert.equal(await headLivezResponse.text(), "");

    const headOpenApiResponse = await fetch(`${api.url}/openapi.json`, { method: "HEAD" });
    assert.equal(headOpenApiResponse.status, 200);
    assert.equal(headOpenApiResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(headOpenApiResponse.headers.get("x-quorum-service"), "quorum");
    assert.equal(headOpenApiResponse.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(headOpenApiResponse.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(headOpenApiResponse.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(await headOpenApiResponse.text(), "");

    const openApiResponse = await fetch(`${api.url}/openapi.json`);
    assert.equal(openApiResponse.status, 200);
    const openApi = await openApiResponse.json() as {
      openapi: string;
      info: { title: string; version: string };
      servers: Array<{ url: string }>;
      paths: Record<
        string,
        {
          get?: { summary: string; responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> };
          head?: { summary: string; responses?: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }> };
          options?: {
            summary: string;
            responses?: Record<string, { headers?: Record<string, { description?: string }> }>;
          };
          post?: {
            summary: string;
            requestBody?: {
              content?: Record<
                string,
                {
                  examples?: Record<string, { summary?: string; value?: unknown }>;
                  schema?: { $ref?: string; allOf?: Array<{ $ref?: string; properties?: Record<string, unknown> }> };
                }
              >;
            };
            responses?: Record<
              string,
              {
                headers?: Record<string, { description?: string }>;
                content?: Record<
                  string,
                  {
                    examples?: Record<string, { summary?: string; value?: unknown }>;
                    schema?: { $ref?: string; allOf?: Array<{ $ref?: string; properties?: Record<string, unknown> }> };
                  }
                >;
              }
            >;
          };
        }
      >;
      components: {
        schemas: {
          ApiErrorResponse: {
            required: string[];
          };
          ApiCapabilities: {
            required: string[];
            properties: {
              httpMethods: { items: { enum: string[] } };
            };
          };
          ApiCapabilitiesResponse: {
            required: string[];
          };
          ApiHealthResponse: {
            required: string[];
          };
          ApiIndexResponse: {
            required: string[];
          };
          ApiDiscoveryEndpoint: {
            properties: {
              method: { enum: string[] };
            };
          };
          ApiVersionResponse: {
            required: string[];
          };
          BatchVerificationReport: {
            properties: Record<string, unknown>;
          };
          BatchVerificationSummary: {
            allOf: Array<{ required?: string[] }>;
          };
          BatchVerificationRunResult: Record<string, unknown>;
          ClaimVerdict: { enum: string[] };
          EvaluationAggregateSummary: {
            required: string[];
            properties: Record<string, unknown>;
          };
          EvaluationDomainAggregateSummary: {
            required: string[];
          };
          EvaluationBatchRunResult: {
            required: string[];
          };
          ApiEvaluationFixtureInput: {
            properties: Record<string, unknown>;
          };
          EvaluationFixture: {
            required: string[];
            properties: Record<string, unknown>;
          };
          EvaluationScorecard: {
            properties: Record<string, unknown>;
          };
          ReviewerDecisionImportReport: {
            properties: Record<string, unknown>;
          };
          ReviewerDecisionImportResult: Record<string, unknown>;
          SingleVerificationResult: Record<string, unknown>;
          SourceTrustLevel: { enum: string[] };
          VerificationReport: {
            required: string[];
            properties: Record<string, unknown>;
          };
        };
      };
    };

    assert.equal(openApi.openapi, "3.1.0");
    assert.equal(openApi.info.title, "Quorum Local API");
    assert.equal(openApi.info.version, "0.1.0");
    assert.deepEqual(openApi.servers, [{ url: api.url }]);
    assert.deepEqual(openApi.components.schemas.ApiEvaluationFixtureInput.properties, {
      fixturePath: { type: "string" },
      content: {
        type: "string",
        description: "JSON-encoded evaluation fixture document.",
        contentMediaType: "application/json",
        contentSchema: { $ref: "#/components/schemas/EvaluationFixture" },
      },
    });
    assert.deepEqual(openApi.components.schemas.EvaluationFixture.required, [
      "name",
      "answerPath",
      "expectedSummary",
    ]);
    assert.deepEqual(Object.keys(openApi.components.schemas.EvaluationFixture.properties), [
      "name",
      "domain",
      "answerPath",
      "answer",
      "answerLabel",
      "sourcePaths",
      "sourceDirs",
      "sources",
      "defaultTrustLevel",
      "expectedSummary",
      "expectedClaimVerdicts",
    ]);
    const operationId = (operation: object | undefined) =>
      (operation as { operationId?: string } | undefined)?.operationId;
    assert.equal(operationId(openApi.paths["/"]?.get), "getApiDiscovery");
    assert.equal(operationId(openApi.paths["/"]?.head), "headApiDiscovery");
    assert.equal(operationId(openApi.paths["/"]?.options), "optionsApiDiscovery");
    assert.equal(operationId(openApi.paths["/capabilities"]?.get), "getCapabilities");
    assert.equal(operationId(openApi.paths["/capabilities"]?.head), "headCapabilities");
    assert.equal(operationId(openApi.paths["/capabilities"]?.options), "optionsCapabilities");
    assert.equal(operationId(openApi.paths["/health"]?.get), "getHealth");
    assert.equal(operationId(openApi.paths["/health"]?.head), "headHealth");
    assert.equal(operationId(openApi.paths["/health"]?.options), "optionsHealth");
    assert.equal(operationId(openApi.paths["/healthz"]?.get), "getHealthz");
    assert.equal(operationId(openApi.paths["/healthz"]?.head), "headHealthz");
    assert.equal(operationId(openApi.paths["/healthz"]?.options), "optionsHealthz");
    assert.equal(operationId(openApi.paths["/readyz"]?.get), "getReadyz");
    assert.equal(operationId(openApi.paths["/readyz"]?.head), "headReadyz");
    assert.equal(operationId(openApi.paths["/readyz"]?.options), "optionsReadyz");
    assert.equal(operationId(openApi.paths["/livez"]?.get), "getLivez");
    assert.equal(operationId(openApi.paths["/livez"]?.head), "headLivez");
    assert.equal(operationId(openApi.paths["/livez"]?.options), "optionsLivez");
    assert.equal(operationId(openApi.paths["/openapi.json"]?.get), "getOpenApi");
    assert.equal(operationId(openApi.paths["/openapi.json"]?.head), "headOpenApi");
    assert.equal(operationId(openApi.paths["/openapi.json"]?.options), "optionsOpenApi");
    assert.equal(operationId(openApi.paths["/extract-claims"]?.options), "optionsExtractClaims");
    assert.equal(operationId(openApi.paths["/extract-claims"]?.post), "postExtractClaims");
    assert.equal(operationId(openApi.paths["/verify"]?.options), "optionsVerify");
    assert.equal(operationId(openApi.paths["/verify"]?.post), "postVerify");
    assert.equal(operationId(openApi.paths["/verify-batch"]?.options), "optionsVerifyBatch");
    assert.equal(operationId(openApi.paths["/verify-batch"]?.post), "postVerifyBatch");
    assert.equal(operationId(openApi.paths["/import-review"]?.options), "optionsImportReview");
    assert.equal(operationId(openApi.paths["/import-review"]?.post), "postImportReview");
    assert.equal(operationId(openApi.paths["/review-queue"]?.options), "optionsReviewQueue");
    assert.equal(operationId(openApi.paths["/review-queue"]?.post), "postReviewQueue");
    assert.equal(operationId(openApi.paths["/evaluate"]?.options), "optionsEvaluate");
    assert.equal(operationId(openApi.paths["/evaluate"]?.post), "postEvaluate");
    assert.equal(openApi.paths["/"]?.get?.summary, "Service discovery");
    assert.equal(openApi.paths["/"]?.head?.summary, "Service discovery headers");
    assert.equal(openApi.paths["/"]?.options?.summary, "Service discovery preflight");
    assert.equal(openApi.paths["/capabilities"]?.get?.summary, "Capability discovery");
    assert.equal(openApi.paths["/capabilities"]?.head?.summary, "Capability discovery headers");
    assert.equal(openApi.paths["/capabilities"]?.options?.summary, "Capability discovery preflight");
    assert.equal(openApi.paths["/health"]?.get?.summary, "Readiness check");
    assert.equal(openApi.paths["/health"]?.head?.summary, "Readiness check headers");
    assert.equal(openApi.paths["/health"]?.options?.summary, "Readiness preflight");
    assert.equal(openApi.paths["/healthz"]?.get?.summary, "Readiness check alias");
    assert.equal(openApi.paths["/healthz"]?.head?.summary, "Readiness check alias headers");
    assert.equal(openApi.paths["/healthz"]?.options?.summary, "Readiness alias preflight");
    assert.equal(openApi.paths["/readyz"]?.get?.summary, "Kubernetes readiness check alias");
    assert.equal(openApi.paths["/readyz"]?.head?.summary, "Kubernetes readiness check alias headers");
    assert.equal(openApi.paths["/readyz"]?.options?.summary, "Kubernetes readiness alias preflight");
    assert.equal(openApi.paths["/livez"]?.get?.summary, "Kubernetes liveness check alias");
    assert.equal(openApi.paths["/livez"]?.head?.summary, "Kubernetes liveness check alias headers");
    assert.equal(openApi.paths["/livez"]?.options?.summary, "Kubernetes liveness alias preflight");
    assert.equal(openApi.paths["/openapi.json"]?.options?.summary, "OpenAPI description preflight");
    assert.equal(openApi.paths["/openapi.json"]?.head?.summary, "OpenAPI description headers");
    assert.equal(openApi.paths["/extract-claims"]?.options?.summary, "Claim extraction preflight");
    assert.equal(openApi.paths["/extract-claims"]?.post?.summary, "Extract normalized claims");
    assert.equal(openApi.paths["/verify"]?.options?.summary, "Verify preflight");
    assert.equal(openApi.paths["/verify"]?.post?.summary, "Verify one answer");
    const verifyResponses = openApi.paths["/verify"]?.post?.responses as
      | Record<string, { description?: string; headers?: Record<string, { description?: string }> }>
      | undefined;
    assert.equal(
      verifyResponses?.["413"]?.description,
      `The JSON request body exceeded the ${API_MAX_REQUEST_BYTES}-byte limit.`,
    );
    assert.deepEqual(Object.keys(verifyResponses?.["200"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "X-Quorum-Max-Request-Bytes",
      "X-Quorum-OpenAPI-Path",
      "X-Quorum-Request-Id",
      "X-Quorum-Request-Timeout-Ms",
      "X-Quorum-Service",
      "X-Quorum-Version",
    ]);
    assert.equal(
      verifyResponses?.["200"]?.headers?.["X-Quorum-Request-Id"]?.description,
      "Request correlation identifier echoed by the server.",
    );
    assert.equal(
      verifyResponses?.["200"]?.headers?.["Cache-Control"]?.description,
      "Evidence and workflow responses are not cacheable.",
    );
    assert.deepEqual(Object.keys(verifyResponses?.["400"]?.headers ?? {}).sort(), [
      "Cache-Control",
      "X-Quorum-Max-Request-Bytes",
      "X-Quorum-OpenAPI-Path",
      "X-Quorum-Request-Id",
      "X-Quorum-Request-Timeout-Ms",
      "X-Quorum-Service",
      "X-Quorum-Version",
    ]);
    assert.equal(openApi.paths["/verify-batch"]?.options?.summary, "Batch verify preflight");
    assert.equal(openApi.paths["/verify-batch"]?.post?.summary, "Verify multiple answers");
    assert.equal(openApi.paths["/import-review"]?.options?.summary, "Reviewer import preflight");
    assert.equal(openApi.paths["/import-review"]?.post?.summary, "Import reviewer decisions");
    assert.equal(openApi.paths["/review-queue"]?.options?.summary, "Reviewer queue overview preflight");
    assert.equal(openApi.paths["/review-queue"]?.post?.summary, "Summarize reviewer queue and benchmark drift");
    assert.equal(openApi.paths["/evaluate"]?.options?.summary, "Evaluation preflight");
    assert.equal(openApi.paths["/evaluate"]?.post?.summary, "Evaluate fixtures");
    assert.equal(
      openApi.paths["/verify"]?.options?.responses?.["204"]?.headers?.["Access-Control-Allow-Methods"]?.description,
      "HTTP methods allowed by this endpoint.",
    );
    const discoveryExamples = openApi.paths["/"]?.get?.responses?.["200"]?.content?.["application/json"] as
      | { examples?: Record<string, { value: unknown }> }
      | undefined;
    const capabilitiesExamples = openApi.paths["/capabilities"]?.get?.responses?.["200"]?.content?.[
      "application/json"
    ] as
      | { examples?: Record<string, { value: unknown }> }
      | undefined;
    const healthExamples = openApi.paths["/health"]?.get?.responses?.["200"]?.content?.["application/json"] as
      | { examples?: Record<string, { value: unknown }> }
      | undefined;
    const healthzExamples = openApi.paths["/healthz"]?.get?.responses?.["200"]?.content?.["application/json"] as
      | { examples?: Record<string, { value: unknown }> }
      | undefined;
    const openApiExamples = openApi.paths["/openapi.json"]?.get?.responses?.["200"]?.content?.[
      "application/json"
    ] as
      | { examples?: Record<string, { value: unknown }> }
      | undefined;
    assert.deepEqual(
      discoveryExamples?.examples?.["discoveryIndex"]?.value,
      {
        requestId: "discovery-contract-test",
        service: API_SERVICE_NAME,
        version: API_VERSION,
        openapiPath: "/openapi.json",
        capabilities: API_CAPABILITIES,
        endpoints: API_ENDPOINTS,
      },
    );
    assert.deepEqual(
      capabilitiesExamples?.examples?.["capabilitiesOnly"]?.value,
      {
        requestId: "capabilities-contract-test",
        service: API_SERVICE_NAME,
        version: API_VERSION,
        openapiPath: "/openapi.json",
        capabilities: API_CAPABILITIES,
      },
    );
    assert.deepEqual(
      healthExamples?.examples?.["ready"]?.value,
      {
        ok: true,
        requestId: "health-contract-test",
        service: API_SERVICE_NAME,
        version: API_VERSION,
      },
    );
    assert.deepEqual(
      healthzExamples?.examples?.["readinessAlias"]?.value,
      {
        ok: true,
        requestId: "health-contract-test",
        service: API_SERVICE_NAME,
        version: API_VERSION,
      },
    );
    assert.equal(
      (openApi.paths["/health"]?.get?.responses?.["200"] as unknown as {
        headers?: Record<string, { schema?: { const?: string } }>;
      })?.headers?.["Cache-Control"]?.schema?.const,
      "no-store",
    );
    assert.equal(
      (openApi.paths["/healthz"]?.get?.responses?.["200"] as unknown as {
        headers?: Record<string, { schema?: { const?: string } }>;
      })?.headers?.["Cache-Control"]?.schema?.const,
      "no-store",
    );
    for (const probePath of ["/readyz", "/livez"] as const) {
      assert.equal(
        (openApi.paths[probePath]?.get?.responses?.["200"] as unknown as {
          headers?: Record<string, { schema?: { const?: string } }>;
        })?.headers?.["Cache-Control"]?.schema?.const,
        "no-store",
      );
      assert.equal(
        (openApi.paths[probePath]?.head?.responses?.["200"] as unknown as {
          headers?: Record<string, { schema?: { const?: string } }>;
        })?.headers?.["Cache-Control"]?.schema?.const,
        "no-store",
      );
    }
    assert.deepEqual(
      openApiExamples?.examples?.["openApiDocument"]?.value,
      {
        openapi: "3.1.0",
        info: {
          title: "Quorum Local API",
          version: API_VERSION,
        },
        servers: [{ url: "http://127.0.0.1:3000" }],
        paths: {
          "/verify": {
            post: {
              summary: "Verify one answer",
            },
          },
        },
      },
    );
    assert.deepEqual(
      openApi.paths["/verify"]?.post?.requestBody?.content?.["application/json"]?.examples?.[
        "hrPolicyAnswer"
      ]?.value,
      {
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerPath: "answers/hr.md",
        answerLabel: "HR policy answer",
        generatedAt,
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            title: "HR Policy",
            updatedAt: "2026-05-31",
            trustLevel: "high",
            content: `---
title: HR Policy
trustLevel: high
updatedAt: 2026-05-31
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        defaultTrustLevel: "high",
        failOn: ["contradicted", "unsupported"],
        includeArtifacts: ["markdown", "review_csv"],
        failOnStatus: true,
      },
    );
    assert.deepEqual(
      openApi.paths["/verify-batch"]?.post?.requestBody?.content?.["application/json"]?.examples?.[
        "mixedBatchReviewQueue"
      ]?.value,
      {
        generatedAt: "2026-07-07T19:20:00.000Z",
        answers: [
          {
            answer: "Employees receive 12 weeks of paid parental leave.",
            answerPath: "answers/hr.md",
            answerLabel: "HR policy answer",
          },
          {
            answer: "Refund requests are answered within one business day.",
            answerPath: "answers/support.md",
            answerLabel: "Support queue answer",
          },
        ],
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            title: "HR Policy",
            trustLevel: "high",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
          {
            sourcePath: "sources/support-playbook.md",
            title: "Support Playbook",
            trustLevel: "medium",
            content: `---
title: Support Playbook
trustLevel: medium
---
Refund requests receive an initial response within one business day.
`,
          },
        ],
        failOn: ["unsupported"],
        includeArtifacts: ["html", "summary_csv"],
        failOnStatus: true,
      },
    );
    assert.deepEqual(
      openApi.paths["/import-review"]?.post?.requestBody?.content?.["application/json"]?.examples?.[
        "reviewedQueueExport"
      ]?.value,
      {
        reviewCsvContent: [
          "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
          "HR policy answer,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Approved for publish",
        ].join("\n"),
        generatedAt: "2026-07-07T19:22:00.000Z",
        failOn: ["needs_review"],
        queueStatus: "reviewed",
        includeArtifacts: ["markdown", "summary_csv"],
        failOnStatus: true,
      },
    );
    const importReviewRequestSchema = openApi.paths["/import-review"]?.post?.requestBody?.content?.[
      "application/json"
    ]?.schema as { properties?: Record<string, unknown> } | undefined;
    assert.deepEqual(
      (importReviewRequestSchema?.properties?.queueStatus as Record<string, unknown> | undefined),
      {
        type: "string",
        enum: ["pending", "reviewed", "no_claims"],
        description: "Only return answer groups in this reviewer queue status.",
      },
    );
    const importReviewExample = openApi.paths["/import-review"]?.post?.requestBody?.content?.[
      "application/json"
    ]?.examples?.["reviewedQueueExport"]?.value;
    assert.ok(importReviewExample);
    assert.equal(
      importReviewerDecisionContentsResult(importReviewExample.reviewCsvContent).report.summary
        .reviewedClaims,
      1,
    );
    assert.deepEqual(
      openApi.paths["/evaluate"]?.post?.requestBody?.content?.["application/json"]?.examples?.[
        "hrFixtureScorecard"
      ]?.value,
      {
        domains: ["hr"],
        generatedAt: "2026-07-07T19:25:00.000Z",
        fixtures: [
          {
            fixturePath: "evaluations/hr-policy.json",
            content: JSON.stringify(
              {
                name: "HR policy API fixture",
                answerPath: "answers/hr.md",
                answer: "Employees receive 12 weeks of paid parental leave.",
                sources: [
                  {
                    sourcePath: "sources/hr-policy.md",
                    title: "HR Policy",
                    trustLevel: "high",
                    content: "Employees receive 12 weeks of paid parental leave.\n",
                  },
                ],
                expectedSummary: {
                  verified: 1,
                  contradicted: 0,
                  unsupported: 0,
                  needs_review: 0,
                },
                expectedClaimVerdicts: ["verified"],
              },
              null,
              2,
            ),
          },
        ],
        includeArtifacts: [
          "html",
          "summary_csv",
          "domain_summary_csv",
          "aggregate_summary_csv",
        ],
        failOnStatus: true,
      },
    );
    assert.equal(
      openApi.paths["/"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiIndexResponse",
    );
    assert.equal(
      openApi.paths["/capabilities"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiCapabilitiesResponse",
    );
    assert.equal(
      openApi.paths["/verify"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema?.allOf?.[0]?.$ref,
      "#/components/schemas/SingleVerificationResult",
    );
    const verifyResponseExample =
      openApi.paths["/verify"]?.post?.responses?.["200"]?.content?.["application/json"]?.examples?.[
        "verifiedAnswer"
      ]?.value as
        | {
            report?: { summary?: { verified?: number } };
            artifacts?: { markdown?: string };
          }
        | undefined;
    assert.equal(
      verifyResponseExample?.report?.summary?.verified,
      1,
    );
    assert.equal(
      verifyResponseExample?.artifacts?.markdown,
      "# Quorum Verification Report\n\nSummary: 1 verified, 0 contradicted, 0 unsupported, 0 needs review\n",
    );
    assert.equal(
      openApi.paths["/verify-batch"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema?.allOf?.[0]?.$ref,
      "#/components/schemas/BatchVerificationRunResult",
    );
    const verifyBatchResponseExample =
      openApi.paths["/verify-batch"]?.post?.responses?.["200"]?.content?.["application/json"]?.examples?.[
        "verifiedQueue"
      ]?.value as
        | {
            report?: { answerCount?: number };
            artifacts?: { summary_csv?: string };
          }
        | undefined;
    assert.equal(
      verifyBatchResponseExample?.report?.answerCount,
      2,
    );
    assert.equal(
      verifyBatchResponseExample?.artifacts?.summary_csv?.includes("Support queue answer"),
      true,
    );
    assert.equal(
      openApi.paths["/import-review"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema?.allOf?.[0]?.$ref,
      "#/components/schemas/ReviewerDecisionImportResult",
    );
    const importReviewResponseExample =
      openApi.paths["/import-review"]?.post?.responses?.["200"]?.content?.["application/json"]?.examples?.[
        "reviewedQueueSummary"
      ]?.value as
        | {
            report?: { summary?: { reviewedClaims?: number } };
            artifacts?: { summary_csv?: string };
          }
        | undefined;
    assert.equal(
      importReviewResponseExample?.report?.summary?.reviewedClaims,
      1,
    );
    assert.equal(
      importReviewResponseExample?.artifacts?.summary_csv?.includes("HR policy answer"),
      true,
    );
    assert.equal(
      openApi.paths["/evaluate"]?.post?.responses?.["200"]?.content?.["application/json"]?.schema?.allOf?.[0]?.$ref,
      "#/components/schemas/EvaluationBatchRunResult",
    );
    const evaluateResponseExample =
      openApi.paths["/evaluate"]?.post?.responses?.["200"]?.content?.["application/json"]?.examples?.[
        "matchedFixture"
      ]?.value as
        | {
            mismatchCount?: number;
            scorecards?: Array<{ domain?: string }>;
            summary?: {
              scoreLabel?: string;
              domains?: Array<{ domain?: string }>;
            };
            artifacts?: { summary_csv?: string };
          }
        | undefined;
    assert.equal(
      evaluateResponseExample?.mismatchCount,
      0,
    );
    assert.equal(
      evaluateResponseExample?.summary?.scoreLabel,
      "100%",
    );
    assert.equal(
      (evaluateResponseExample?.scorecards?.[0] as { domain?: string } | undefined)?.domain,
      "hr",
    );
    assert.equal(
      (evaluateResponseExample?.summary as { domains?: Array<{ domain?: string }> } | undefined)?.domains?.[0]?.domain,
      "hr",
    );
    assert.equal(
      evaluateResponseExample?.artifacts?.summary_csv?.includes("HR policy API fixture"),
      true,
    );
    assert.equal(
      openApi.paths["/verify"]?.post?.responses?.["400"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiErrorResponse",
    );
    const verify400Example = openApi.paths["/verify"]?.post?.responses?.["400"]?.content?.[
      "application/json"
    ]?.examples?.["invalidRequest"]?.value as
      | {
          error?: string;
          requestId?: string;
        }
      | undefined;
    assert.equal(
      verify400Example?.error,
      "sources must be a non-empty array.",
    );
    assert.equal(verify400Example?.requestId, "workflow-trace-2026-07-10");
    const verify405Example = openApi.paths["/verify"]?.post?.responses?.["405"]?.content?.[
      "application/json"
    ]?.examples?.["wrongMethod"]?.value as
      | {
          error?: string;
          requestId?: string;
        }
      | undefined;
    assert.equal(
      verify405Example?.error,
      "Method not allowed. Use POST.",
    );
    assert.equal(verify405Example?.requestId, "workflow-trace-2026-07-10");
    assert.equal(
      (openApi.paths["/verify"]?.post?.responses?.["405"]?.headers?.Allow as { schema?: { const?: string } } | undefined)
        ?.schema?.const,
      "POST",
    );
    assert.equal(
      openApi.paths["/verify"]?.post?.responses?.["405"]?.headers?.Allow?.description,
      "HTTP method accepted by this endpoint.",
    );
    assert.equal(
      openApi.paths["/verify"]?.post?.responses?.["415"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiErrorResponse",
    );
    const verify415Example = openApi.paths["/verify"]?.post?.responses?.["415"]?.content?.[
      "application/json"
    ]?.examples?.["invalidContentType"]?.value as
      | {
          error?: string;
          requestId?: string;
        }
      | undefined;
    assert.equal(
      verify415Example?.error,
      "Content-Type must be JSON.",
    );
    assert.equal(verify415Example?.requestId, "workflow-trace-2026-07-10");
    assert.equal(
      openApi.paths["/verify"]?.post?.responses?.["500"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiErrorResponse",
    );
    const verify500Example = openApi.paths["/verify"]?.post?.responses?.["500"]?.content?.[
      "application/json"
    ]?.examples?.["internalError"]?.value as
      | {
          error?: string;
          requestId?: string;
        }
      | undefined;
    assert.equal(
      verify500Example?.error,
      "Internal server error.",
    );
    assert.equal(verify500Example?.requestId, "workflow-trace-2026-07-10");
    const verify409Example = openApi.paths["/verify"]?.post?.responses?.["409"]?.content?.[
      "application/json"
    ]?.examples?.["failPolicyMatch"]?.value as
      | {
          shouldFail?: boolean;
          failVerdicts?: string[];
        }
      | undefined;
    assert.equal(
      verify409Example?.shouldFail,
      true,
    );
    assert.deepEqual(
      verify409Example?.failVerdicts,
      ["contradicted"],
    );
    const verifyBatch409Example = openApi.paths["/verify-batch"]?.post?.responses?.["409"]?.content?.[
      "application/json"
    ]?.examples?.["failPolicyMatch"]?.value as
      | {
          failVerdicts?: string[];
        }
      | undefined;
    assert.deepEqual(
      verifyBatch409Example?.failVerdicts,
      ["unsupported"],
    );
    const importReview409Example = openApi.paths["/import-review"]?.post?.responses?.["409"]?.content?.[
      "application/json"
    ]?.examples?.["failPolicyMatch"]?.value as
      | {
          failVerdicts?: string[];
        }
      | undefined;
    assert.deepEqual(
      importReview409Example?.failVerdicts,
      ["needs_review"],
    );
    const evaluate409Example = openApi.paths["/evaluate"]?.post?.responses?.["409"]?.content?.[
      "application/json"
    ]?.examples?.["mismatchDetected"]?.value as
      | {
          summary?: { mismatchCount?: number };
        }
      | undefined;
    assert.equal(
      evaluate409Example?.summary?.mismatchCount,
      1,
    );
    assert.deepEqual(openApi.components.schemas.ApiIndexResponse.required, [
      "requestId",
      "service",
      "version",
      "openapiPath",
      "capabilities",
      "endpoints",
    ]);
    assert.deepEqual(openApi.components.schemas.ApiCapabilitiesResponse.required, [
      "requestId",
      "service",
      "version",
      "openapiPath",
      "capabilities",
    ]);
    assert.deepEqual(openApi.components.schemas.ApiCapabilities.required, [
      "httpMethods",
      "headerNames",
      "cors",
      "requestContentTypes",
      "binaryContentEncodings",
      "maxRequestBytes",
      "requestTimeoutMs",
      "sourceExtensions",
      "answerExtensions",
      "verdicts",
      "trustLevels",
      "reviewQueueStatuses",
      "verifyArtifacts",
      "verifyBatchArtifacts",
      "importReviewArtifacts",
      "evaluateArtifacts",
      "extractClaims",
    ]);
    assert.deepEqual(openApi.components.schemas.ApiDiscoveryEndpoint.properties.method.enum, [
      ...SERVER_API_ALLOWED_METHODS,
    ]);
    assert.deepEqual(openApi.components.schemas.ApiCapabilities.properties.httpMethods.items.enum, [
      ...SERVER_API_ALLOWED_METHODS,
    ]);
    assert.deepEqual(openApi.components.schemas.ApiHealthResponse.required, [
      "ok",
      "requestId",
      "service",
      "version",
    ]);
    assert.deepEqual(openApi.components.schemas.ApiVersionResponse.required, ["requestId", "service", "version"]);
    assert.deepEqual(openApi.components.schemas.ApiErrorResponse.required, ["error", "requestId"]);
    assert.deepEqual(openApi.components.schemas.VerificationReport.required, [
      "generatedAt",
      "answerPreview",
      "answer",
      "sources",
      "assessments",
      "summary",
    ]);
    assert.deepEqual(openApi.components.schemas.VerificationReport.properties.generatedAt, {
      type: "string",
      format: "date-time",
    });
    assert.deepEqual(openApi.components.schemas.BatchVerificationSummary.allOf[1]?.required, [
      "answersWithClaims",
      "answersWithoutClaims",
      "answersWithFailures",
    ]);
    assert.deepEqual(openApi.components.schemas.BatchVerificationReport.properties.generatedAt, {
      type: "string",
      format: "date-time",
    });
    assert.deepEqual(openApi.components.schemas.ReviewerDecisionImportReport.properties.generatedAt, {
      type: "string",
      format: "date-time",
    });
    const verifyExample = openApi.paths["/verify"]?.post?.responses?.["200"]?.content?.[
      "application/json"
    ]?.examples?.["verifiedAnswer"]?.value as
      | {
          report?: {
            sources?: Array<{ updatedAt?: string }>;
            assessments?: Array<{ evidence?: Array<{ documentUpdatedAt?: string }> }>;
          };
        }
      | undefined;
    assert.equal(verifyExample?.report?.sources?.[0]?.updatedAt, "2026-05-31T00:00:00.000Z");
    assert.equal(
      verifyExample?.report?.assessments?.[0]?.evidence?.[0]?.documentUpdatedAt,
      "2026-05-31T00:00:00.000Z",
    );
    assert.ok(openApi.components.schemas.SingleVerificationResult);
    assert.ok(openApi.components.schemas.BatchVerificationRunResult);
    assert.deepEqual(
      (openApi.components.schemas.SingleVerificationResult as { required: string[] }).required,
      ["requestId", "report", "shouldFail", "failVerdicts"],
    );
    assert.deepEqual(openApi.components.schemas.EvaluationAggregateSummary.required, [
      "fixtureCount",
      "mismatchCount",
      "mismatchRate",
      "answersWithClaims",
      "answersWithoutClaims",
      "matchedClaims",
      "totalExpectedClaims",
      "score",
      "scoreLabel",
      "expectedSummary",
      "actualSummary",
      "domains",
    ]);
    assert.deepEqual(openApi.components.schemas.EvaluationScorecard.properties.domain, {
      type: "string",
    });
    assert.deepEqual(openApi.components.schemas.EvaluationScorecard.properties.answerHasClaims, {
      type: "boolean",
    });
    assert.deepEqual(openApi.components.schemas.EvaluationAggregateSummary.properties.domains, {
      type: "array",
      items: { $ref: "#/components/schemas/EvaluationDomainAggregateSummary" },
    });
    const evaluateRequestSchema = openApi.paths["/evaluate"]?.post?.requestBody?.content?.[
      "application/json"
    ]?.schema as { properties?: Record<string, unknown> } | undefined;
    assert.deepEqual(evaluateRequestSchema?.properties?.domains, {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    });
    assert.deepEqual(openApi.components.schemas.EvaluationDomainAggregateSummary.required, [
      "domain",
      "fixtureCount",
      "mismatchCount",
      "mismatchRate",
      "answersWithClaims",
      "answersWithoutClaims",
      "matchedClaims",
      "totalExpectedClaims",
      "score",
      "scoreLabel",
      "expectedSummary",
      "actualSummary",
    ]);
    assert.ok(openApi.components.schemas.ReviewerDecisionImportResult);
    assert.ok(openApi.components.schemas.EvaluationBatchRunResult);
    assert.deepEqual(
      (openApi.components.schemas.EvaluationBatchRunResult.required as string[]).slice().sort(),
      ["failureReasons", "mismatchCount", "requestId", "scorecards", "shouldFail", "summary"],
    );
    assert.deepEqual(openApi.components.schemas.SourceTrustLevel.enum, ["low", "medium", "high"]);
    assert.deepEqual(openApi.components.schemas.ClaimVerdict.enum, [
      "verified",
      "unsupported",
      "contradicted",
      "needs_review",
    ]);

    const verifyResponse = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerLabel: "HR reviewer packet",
        generatedAt,
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        defaultTrustLevel: "high",
        failOn: ["contradicted"],
      }),
    });

    assert.equal(verifyResponse.status, 200);
    const result = await verifyResponse.json() as {
      requestId: string;
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        generatedAt: string;
        answerLabel?: string;
        summary: Record<string, number>;
      };
    };

    assert.equal(result.shouldFail, false);
    assert.equal(result.requestId, verifyResponse.headers.get("x-quorum-request-id"));
    assert.deepEqual(result.failVerdicts, []);
    assert.equal(result.report.generatedAt, generatedAt);
    assert.equal(result.report.answerLabel, "HR reviewer packet");
    assert.deepEqual(result.report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await api.close();
  }
});

test("programmatic API formats IPv6 loopback server URLs for callers", async () => {
  const api = await startApiServer({ host: "::1", port: 0 });

  try {
    assert.match(api.url, /^http:\/\/\[::1\]:\d+$/);

    const discoveryResponse = await fetch(api.url);
    assert.equal(discoveryResponse.status, 200);

    const openApiResponse = await fetch(`${api.url}/openapi.json`);
    assert.equal(openApiResponse.status, 200);
    const openApi = await openApiResponse.json() as {
      servers: Array<{ url: string }>;
    };

    assert.deepEqual(openApi.servers, [{ url: api.url }]);
  } finally {
    await api.close();
  }
});

test("HTTP API accepts explicit source metadata in verify requests", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            id: "people-ops/hr-policy@2026-06-15",
            sourcePath: "policies/hr-policy.md",
            title: "People Ops Handbook",
            updatedAt: "2026-06-15",
            trustLevel: "high",
            content: `---
title: Old Handbook
trustLevel: low
updatedAt: 2026-05-31
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json() as {
      report: {
        summary: Record<string, number>;
        sources: Array<{
          title: string;
          id: string;
          updatedAt?: string;
          trustLevel: string;
        }>;
      };
    };

    assert.equal(result.report.summary.verified, 1);
    assert.equal(result.report.sources[0]?.title, "People Ops Handbook");
    assert.equal(result.report.sources[0]?.id, "people-ops/hr-policy@2026-06-15");
    assert.equal(result.report.sources[0]?.updatedAt, "2026-06-15");
    assert.equal(result.report.sources[0]?.trustLevel, "high");
  } finally {
    await api.close();
  }
});

test("HTTP API rejects duplicate source IDs before producing ambiguous evidence", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            id: "people-ops/hr-policy@2026-06-15",
            sourcePath: "policies/hr-policy.md",
            content: "Employees receive 12 weeks of paid parental leave.",
          },
          {
            id: "people-ops/hr-policy@2026-06-15",
            sourcePath: "policies/hr-policy-copy.md",
            content: "Employees receive 12 weeks of paid parental leave.",
          },
        ],
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json() as { error: string };
    assert.match(payload.error, /Duplicate source ID: people-ops\/hr-policy@2026-06-15/);
  } finally {
    await api.close();
  }
});

test("programmatic API answers CORS preflight requests", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), API_CORS_ALLOWED_HEADERS);
    assert.equal(response.headers.get("access-control-max-age"), "600");
    assert.equal(
      response.headers.get("access-control-expose-headers"),
      API_CORS_EXPOSED_HEADERS,
    );
    assert.equal(response.headers.get("x-quorum-service"), "quorum");
    assert.equal(response.headers.get("x-quorum-version"), "0.1.0");
    assert.equal(response.headers.get("x-quorum-openapi-path"), "/openapi.json");
    assert.equal(response.headers.get("x-quorum-max-request-bytes"), "1048576");
    assert.equal(await response.text(), "");
  } finally {
    await api.close();
  }
});

test("programmatic API rejects JSON request bodies larger than the documented limit", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    assert.equal(API_MAX_REQUEST_BYTES, 1024 * 1024);
    assert.equal(SERVER_API_MAX_REQUEST_BYTES, API_MAX_REQUEST_BYTES);
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "x".repeat(API_MAX_REQUEST_BYTES), sources: [] }),
    });

    assert.equal(response.status, 413);
    const payload = (await response.json()) as { error: string; requestId: string };
    assert.equal(payload.error, `Request body must not exceed ${API_MAX_REQUEST_BYTES} bytes.`);
    assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("programmatic API enforces the request limit while reading chunked bodies", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await new Promise<{ statusCode?: number; body: string }>((resolve, reject) => {
      const request = httpRequest(
        `${api.url}/verify`,
        { method: "POST", headers: { "content-type": "application/json" } },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () =>
            resolve({
              statusCode: response.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      request.on("error", reject);
      request.write("x".repeat(API_MAX_REQUEST_BYTES + 1));
      request.end();
    });

    assert.equal(response.statusCode, 413);
    const payload = JSON.parse(response.body) as { error: string; requestId: string };
    assert.equal(payload.error, `Request body must not exceed ${API_MAX_REQUEST_BYTES} bytes.`);
    assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("programmatic API bounds request duration with a configurable timeout", () => {
  const defaultServer = createApiServer();
  const configuredServer = createApiServer({ requestTimeoutMs: 1_500 });

  try {
    assert.equal(defaultServer.requestTimeout, SERVER_API_REQUEST_TIMEOUT_MS);
    assert.equal(API_REQUEST_TIMEOUT_MS, SERVER_API_REQUEST_TIMEOUT_MS);
    assert.equal(configuredServer.requestTimeout, 1_500);
  } finally {
    defaultServer.close();
    configuredServer.close();
  }
});

test("programmatic API advertises the configured request timeout", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0, requestTimeoutMs: 1_500 });

  try {
    const response = await fetch(`${api.url}/`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-quorum-request-timeout-ms"), "1500");
    const payload = await response.json() as { capabilities: { requestTimeoutMs: number } };
    assert.equal(payload.capabilities.requestTimeoutMs, 1_500);
  } finally {
    await api.close();
  }
});

test("OpenAPI discovery examples advertise configured runtime limits", async () => {
  const api = await startApiServer({
    host: "127.0.0.1",
    port: 0,
    maxRequestBytes: 1_500,
    requestTimeoutMs: 1_500,
  });

  try {
    const response = await fetch(`${api.url}/openapi.json`);
    assert.equal(response.status, 200);
    const openApi = await response.json() as {
      paths: Record<string, {
        get: {
          responses: Record<string, {
            content: Record<string, {
              examples: Record<string, {
                value: { capabilities: { maxRequestBytes: number; requestTimeoutMs: number } };
              }>;
            }>;
          }>;
        };
      }>;
    };

    assert.deepEqual(
      openApi.paths["/"].get.responses["200"].content["application/json"].examples.discoveryIndex.value.capabilities,
      { ...API_CAPABILITIES, maxRequestBytes: 1_500, requestTimeoutMs: 1_500 },
    );
    assert.deepEqual(
      openApi.paths["/capabilities"].get.responses["200"].content["application/json"].examples.capabilitiesOnly.value.capabilities,
      { ...API_CAPABILITIES, maxRequestBytes: 1_500, requestTimeoutMs: 1_500 },
    );
  } finally {
    await api.close();
  }
});

test("programmatic API advertises and enforces a configured request size limit", async () => {
  const maxRequestBytes = 1_500;
  const api = await startApiServer({ host: "127.0.0.1", port: 0, maxRequestBytes });

  try {
    const discoveryResponse = await fetch(`${api.url}/`);
    assert.equal(discoveryResponse.headers.get("x-quorum-max-request-bytes"), String(maxRequestBytes));
    const discoveryPayload = await discoveryResponse.json() as {
      capabilities: { maxRequestBytes: number; requestTimeoutMs: number };
    };
    assert.equal(discoveryPayload.capabilities.maxRequestBytes, maxRequestBytes);
    assert.equal(discoveryPayload.capabilities.requestTimeoutMs, SERVER_API_REQUEST_TIMEOUT_MS);

    const openApiResponse = await fetch(`${api.url}/openapi.json`);
    const openApi = await openApiResponse.json() as {
      paths: { "/verify": { post: { responses: { "413": { description: string } } } } };
    };
    assert.equal(openApi.paths["/verify"].post.responses["413"].description, `The JSON request body exceeded the ${maxRequestBytes}-byte limit.`);

    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "x".repeat(maxRequestBytes), sources: [] }),
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json() as { error: string }).error, `Request body must not exceed ${maxRequestBytes} bytes.`);
  } finally {
    await api.close();
  }
});

test("every JSON POST endpoint enforces the configured request size limit", async () => {
  const maxRequestBytes = 512;
  const api = await startApiServer({ host: "127.0.0.1", port: 0, maxRequestBytes });
  const postPaths = [...new Set(API_ENDPOINTS.filter((endpoint) => endpoint.method === "POST").map((endpoint) => endpoint.path))];

  try {
    for (const path of postPaths) {
      const response = await fetch(`${api.url}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: "x".repeat(maxRequestBytes), sources: [] }),
      });

      assert.equal(response.status, 413, path);
      assert.equal(
        (await response.json() as { error: string }).error,
        `Request body must not exceed ${maxRequestBytes} bytes.`,
        path,
      );
    }
  } finally {
    await api.close();
  }
});

test("programmatic API rejects invalid request timeout configuration", () => {
  for (const requestTimeoutMs of [0, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createApiServer({ requestTimeoutMs }),
      /requestTimeoutMs must be a positive safe integer in milliseconds\./,
    );
  }
});

test("programmatic API rejects invalid request size configuration", () => {
  for (const maxRequestBytes of [0, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createApiServer({ maxRequestBytes }),
      /maxRequestBytes must be a positive safe integer in bytes\./,
    );
  }
});

test("programmatic API serves batch verification over HTTP", async () => {
  const generatedAt = "2026-07-07T19:20:00.000Z";
  const server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();

    if (address === null || typeof address === "string") {
      throw new Error("Expected the API server to bind to a TCP port.");
    }

    const apiUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${apiUrl}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        generatedAt,
        answers: [
          {
            answer: "Employees receive 12 weeks of paid parental leave.",
            answerPath: "answers/hr.md",
            answerLabel: "HR queue",
          },
          {
            answer: "Employees receive free catered lunch every day.",
            answerPath: "answers/support.md",
          },
        ],
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        failOn: ["unsupported"],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        generatedAt: string;
        summary: Record<string, number>;
        answers: Array<{
          answerLabel: string;
          answerHasClaims: boolean;
        }>;
      };
    };

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["unsupported"]);
    assert.equal(result.report.generatedAt, generatedAt);
    assert.equal(result.report.answers[0]?.answerLabel, "HR queue");
    assert.equal(result.report.answers[0]?.answerHasClaims, true);
    assert.equal(result.report.answers[1]?.answerHasClaims, true);
    assert.deepEqual(result.report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 1,
      needs_review: 0,
      answersWithClaims: 2,
      answersWithoutClaims: 0,
      answersWithFailures: 1,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

test("programmatic API requires a JSON content type for POST endpoints", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "text/plain",
        "X-Quorum-Request-Id": "invalid-content-type-check",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
      }),
    });

    assert.equal(response.status, 415);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const payload = (await response.json()) as { error: string; requestId: string };
    assert.equal(payload.error, "Content-Type must be JSON.");
    assert.equal(payload.requestId, "invalid-content-type-check");
    assert.equal(response.headers.get("x-quorum-request-id"), payload.requestId);
  } finally {
    await api.close();
  }
});

test("programmatic API accepts JSON content types with parameters", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      report: {
        summary: Record<string, number>;
      };
    };

    assert.deepEqual(result.report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await api.close();
  }
});

test("programmatic API accepts vendor JSON content types", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/extract-claims`, {
      method: "POST",
      headers: {
        "content-type": "application/vnd.quorum.claim-preview+json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      answerHasClaims: boolean;
      claims: Array<{ id: string; text: string }>;
    };

    assert.equal(result.answerHasClaims, true);
    assert.deepEqual(result.claims, [
      { id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." },
    ]);
  } finally {
    await api.close();
  }
});

test("programmatic API serves reviewer CSV import over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation
`,
        failOn: ["needs_review"],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        summary: Record<string, number>;
        queueSummary: Record<string, number>;
        answerGroups: Array<{
          label: string;
          reviewStatus: string;
        }>;
      };
    };

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review"]);
    assert.deepEqual(result.report.summary, {
      totalClaims: 1,
      reviewedClaims: 1,
      pendingClaims: 0,
      overriddenClaims: 1,
      verified: 0,
      contradicted: 0,
      unsupported: 0,
      needs_review: 1,
    });
    assert.deepEqual(result.report.queueSummary, {
      totalAnswers: 1,
      pendingAnswers: 0,
      reviewedAnswers: 1,
      noClaimsAnswers: 0,
    });
    assert.equal(result.report.answerGroups[0]?.label, "HR reviewer packet");
    assert.equal(result.report.answerGroups[0]?.reviewStatus, "reviewed");
  } finally {
    await api.close();
  }
});

test("HTTP reviewer imports can filter answer groups by queue status", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/import-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reviewCsvContent: [
          "answer_label,answer_path,answer_preview,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
          "Pending answer,answers/pending.md,Pending.,true,claim_1,Pending policy claim.,needs_review,Needs review,HR Policy,Pending policy claim.,,",
          "Reviewed answer,answers/reviewed.md,Reviewed.,true,claim_1,Reviewed policy claim.,verified,Matched,HR Policy,Reviewed policy claim.,verified,Approved",
          "No claims answer,answers/empty.md,Empty.,false,,,,No claims were extracted from this answer.,,,",
        ].join("\n"),
        queueStatus: "pending",
        failOn: ["needs_review"],
        failOnStatus: true,
      }),
    });

    assert.equal(response.status, 409);
    const result = await response.json() as {
      shouldFail: boolean;
      failVerdicts: string[];
      report: {
        queueSummary: Record<string, number>;
        answerGroups: Array<{ label: string; reviewStatus: string }>;
      };
    };

    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review"]);
    assert.deepEqual(result.report.queueSummary, {
      totalAnswers: 1,
      pendingAnswers: 1,
      reviewedAnswers: 0,
      noClaimsAnswers: 0,
    });
    assert.deepEqual(result.report.answerGroups.map((group) => [group.label, group.reviewStatus]), [
      ["Pending answer", "pending"],
    ]);
  } finally {
    await api.close();
  }
});

test("programmatic API serves reviewer queue overview over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const generatedAt = "2026-07-07T19:30:00.000Z";

  try {
    const fixtureContent = await readFile(join(process.cwd(), "examples/evaluations/hr-policy.json"), "utf8");
    const response = await fetch(`${api.url}${REVIEW_QUEUE_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [API_REQUEST_ID_HEADER]: "review-queue-trace-2026-07-19",
      },
      body: JSON.stringify({
        generatedAt,
        reviewCsvContent: [
          "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
          "HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched,HR Policy,Employees receive 12 weeks of paid parental leave.,,",
        ].join("\n"),
        domains: ["hr"],
        fixtures: [{ fixturePath: "examples/evaluations/hr-policy.json", content: fixtureContent }],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as ApiReviewQueueResponse;
    assert.equal(result.requestId, "review-queue-trace-2026-07-19");
    assert.equal(response.headers.get("x-quorum-request-id"), "review-queue-trace-2026-07-19");
    assert.equal(result.generatedAt, generatedAt);
    assert.equal(result.queueStatus, null);
    assert.deepEqual(result.domains, ["hr"]);
    assert.deepEqual(result.review, {
      totalAnswers: 1,
      pendingAnswers: 1,
      reviewedAnswers: 0,
      noClaimsAnswers: 0,
      totalClaims: 1,
      pendingClaims: 1,
      reviewedClaims: 0,
      verdicts: { verified: 1, contradicted: 0, unsupported: 0, needs_review: 0 },
    });
    assert.equal(result.evaluation?.fixtureCount, 1);
    assert.equal(result.evaluation?.mismatchCount, 0);
    assert.equal(result.evaluation?.scoreLabel, "100%");
  } finally {
    await api.close();
  }
});

test("programmatic API filters reviewer queue overview by queue status", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}${REVIEW_QUEUE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queueStatus: "pending",
        reviewCsvContent: [
          "answer_label,answer_path,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
          "Pending answer,answers/pending.md,true,claim_1,Pending policy claim.,needs_review,Needs review,HR Policy,Pending policy claim.,,",
          "Reviewed answer,answers/reviewed.md,true,claim_1,Reviewed policy claim.,verified,Matched,HR Policy,Reviewed policy claim.,verified,Approved",
        ].join("\n"),
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as ApiReviewQueueResponse;
    assert.equal(result.queueStatus, "pending");
    assert.deepEqual(result.domains, []);
    assert.deepEqual(result.review, {
      totalAnswers: 1,
      pendingAnswers: 1,
      reviewedAnswers: 0,
      noClaimsAnswers: 0,
      totalClaims: 1,
      pendingClaims: 1,
      reviewedClaims: 0,
      verdicts: { verified: 0, contradicted: 0, unsupported: 0, needs_review: 1 },
    });
  } finally {
    await api.close();
  }
});

test("programmatic API rejects invalid reviewer queue statuses", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}${REVIEW_QUEUE_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queueStatus: "in_progress",
        reviewCsvContent: "claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes\n",
      }),
    });

    assert.equal(response.status, 400);
    const result = await response.json() as { error: string; requestId: string };
    assert.equal(result.error, "Invalid reviewer queue status: in_progress. Expected pending, reviewed, or no_claims.");
    assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("programmatic API serves evaluation over HTTP", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const generatedAt = "2026-07-07T19:25:00.000Z";

  try {
    const fixtureContent = await readFile(join(process.cwd(), "examples/evaluations/hr-policy.json"), "utf8");
    const response = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        generatedAt,
        fixtures: [
          {
            fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
            content: fixtureContent,
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      mismatchCount: number;
      summary: {
        fixtureCount: number;
        matchedClaims: number;
        totalExpectedClaims: number;
        score: number;
        scoreLabel: string;
      };
      scorecards: Array<{
        fixtureName: string;
        report: {
          generatedAt: string;
        };
        summaryMatches: boolean;
        matchedClaims: number;
        totalExpectedClaims: number;
      }>;
    };

    assert.equal(result.shouldFail, false);
    assert.equal(result.mismatchCount, 0);
    assert.equal(result.summary.fixtureCount, 1);
    assert.equal(result.summary.matchedClaims, 3);
    assert.equal(result.summary.totalExpectedClaims, 3);
    assert.equal(result.summary.score, 1);
    assert.equal(result.summary.scoreLabel, "100%");
    assert.equal(result.scorecards[0]?.fixtureName, "HR policy example");
    assert.equal(result.scorecards[0]?.report.generatedAt, generatedAt);
    assert.equal(result.scorecards[0]?.summaryMatches, true);
    assert.equal(result.scorecards[0]?.matchedClaims, 3);
    assert.equal(result.scorecards[0]?.totalExpectedClaims, 3);
  } finally {
    await api.close();
  }
});

test("programmatic API can embed reviewer artifacts in HTTP responses", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const verifyResponse = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        answerLabel: "HR reviewer packet",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        failOn: ["contradicted"],
        includeArtifacts: ["text", "markdown", "html", "result_json", "review_csv", "summary_csv"],
      }),
    });
    assert.equal(verifyResponse.status, 200);
    const verifyResult = await verifyResponse.json() as ApiVerifyResponse;
    assert.ok(verifyResult.artifacts);
    assert.equal(verifyResult.artifacts.text, renderTextReport(verifyResult.report, verifyResult.failVerdicts));
    assert.equal(
      verifyResult.artifacts.markdown,
      renderMarkdownReport(verifyResult.report, verifyResult.failVerdicts),
    );
    assert.equal(verifyResult.artifacts.html, renderHtmlReport(verifyResult.report, verifyResult.failVerdicts));
    {
      const { artifacts: _artifacts, requestId: _requestId, ...resultWithoutArtifacts } = verifyResult;
      assert.deepEqual(JSON.parse(verifyResult.artifacts.result_json ?? "null"), resultWithoutArtifacts);
    }
    assert.equal(
      verifyResult.artifacts.review_csv,
      renderReviewerDecisionCsv(verifyResult.report, verifyResult.failVerdicts),
    );
    assert.equal(
      verifyResult.artifacts.summary_csv,
      renderSummaryCsv(verifyResult.report, verifyResult.failVerdicts),
    );

    const batchResponse = await fetch(`${api.url}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            answer: "Employees receive 12 weeks of paid parental leave.",
            answerPath: "answers/hr.md",
            answerLabel: "HR reviewer packet",
          },
          {
            answer: "Refund requests are answered within one business day.",
            answerPath: "answers/support.md",
            answerLabel: "Support reviewer packet",
          },
        ],
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
          {
            sourcePath: "sources/support-playbook.md",
            content: `---
title: Support Playbook
trustLevel: medium
---
Refund requests receive an initial response within one business day.
`,
          },
        ],
        includeArtifacts: ["text", "markdown", "html", "result_json", "review_csv", "summary_csv", "aggregate_summary_csv"],
      }),
    });
    assert.equal(batchResponse.status, 200);
    const batchResult = await batchResponse.json() as ApiVerifyBatchResponse;
    assert.ok(batchResult.artifacts);
    assert.equal(batchResult.artifacts.text, renderBatchTextReport(batchResult.report));
    assert.equal(batchResult.artifacts.markdown, renderBatchMarkdownReport(batchResult.report));
    assert.equal(batchResult.artifacts.html, renderBatchHtmlReport(batchResult.report));
    {
      const { artifacts: _artifacts, requestId: _requestId, ...resultWithoutArtifacts } = batchResult;
      assert.deepEqual(JSON.parse(batchResult.artifacts.result_json ?? "null"), resultWithoutArtifacts);
    }
    assert.equal(batchResult.artifacts.review_csv, renderBatchReviewerDecisionCsv(batchResult.report));
    assert.equal(batchResult.artifacts.summary_csv, renderBatchSummaryCsv(batchResult.report));
    assert.equal(batchResult.artifacts.aggregate_summary_csv, renderBatchAggregateSummaryCsv(batchResult.report));

    const importResponse = await fetch(`${api.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation
`,
        failOn: ["needs_review"],
        includeArtifacts: ["text", "markdown", "html", "result_json", "summary_csv", "queue_summary_csv"],
      }),
    });
    assert.equal(importResponse.status, 200);
    const importResult = await importResponse.json() as ApiImportReviewResponse;
    assert.ok(importResult.artifacts);
    assert.equal(
      importResult.artifacts.text,
      renderReviewerDecisionImportReport(importResult.report, importResult.failVerdicts),
    );
    assert.equal(
      importResult.artifacts.markdown,
      renderReviewerDecisionImportMarkdownReport(importResult.report, importResult.failVerdicts),
    );
    assert.equal(
      importResult.artifacts.html,
      renderReviewerDecisionImportHtmlReport(importResult.report, importResult.failVerdicts),
    );
    {
      const { artifacts: _artifacts, requestId: _requestId, ...resultWithoutArtifacts } = importResult;
      assert.deepEqual(JSON.parse(importResult.artifacts.result_json ?? "null"), resultWithoutArtifacts);
    }
    assert.equal(
      importResult.artifacts.summary_csv,
      renderReviewerDecisionImportSummaryCsv(importResult.report, importResult.failVerdicts),
    );
    assert.equal(
      importResult.artifacts.queue_summary_csv,
      renderReviewerDecisionImportQueueSummaryCsv(importResult.report, importResult.failVerdicts),
    );

    const fixtureContent = await readFile(join(process.cwd(), "examples/evaluations/hr-policy.json"), "utf8");
    const evaluateResponse = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
            content: fixtureContent,
          },
        ],
        domains: ["hr"],
        includeArtifacts: [
          "text",
          "markdown",
          "html",
          "result_json",
          "summary_csv",
          "domain_summary_csv",
          "aggregate_summary_csv",
        ],
      }),
    });
    assert.equal(evaluateResponse.status, 200);
    const evaluateResult = await evaluateResponse.json() as ApiEvaluateResponse;
    assert.ok(evaluateResult.artifacts);
    assert.deepEqual(evaluateResult.summary.domains, [
      {
        domain: "hr",
        fixtureCount: 1,
        mismatchCount: 0,
        mismatchRate: 0,
        answersWithClaims: 1,
        answersWithoutClaims: 0,
        matchedClaims: 3,
        totalExpectedClaims: 3,
        score: 1,
        scoreLabel: "100%",
        expectedSummary: { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 },
        actualSummary: { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 },
      },
    ]);
    assert.equal(evaluateResult.artifacts.text, renderEvaluationTextReport(evaluateResult.scorecards));
    assert.equal(
      evaluateResult.artifacts.markdown,
      renderEvaluationMarkdownReport(evaluateResult.scorecards),
    );
    assert.equal(evaluateResult.artifacts.html, renderEvaluationHtmlReport(evaluateResult.scorecards));
    const { artifacts: _artifacts, requestId: _requestId, ...resultWithoutArtifacts } = evaluateResult;
    assert.deepEqual(
      JSON.parse(evaluateResult.artifacts.result_json ?? "null"),
      resultWithoutArtifacts,
    );
    assert.equal(
      evaluateResult.artifacts.summary_csv,
      renderEvaluationSummaryCsv(evaluateResult.scorecards),
    );
    assert.equal(
      evaluateResult.artifacts.domain_summary_csv,
      renderEvaluationDomainSummaryCsv(evaluateResult.scorecards),
    );
    assert.equal(
      evaluateResult.artifacts.aggregate_summary_csv,
      renderEvaluationAggregateSummaryCsv(evaluateResult.scorecards),
    );
  } finally {
    await api.close();
  }
});

test("HTTP reviewer artifacts preserve no-claim answers as needs_review", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Short.",
        answerPath: "answers/empty.md",
        answerLabel: "Empty reviewer packet",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: "Employees receive 12 weeks of paid parental leave.\n",
          },
        ],
        failOn: ["needs_review"],
        includeArtifacts: ["review_csv", "summary_csv"],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as ApiVerifyResponse;
    assert.equal(result.shouldFail, true);
    assert.deepEqual(result.failVerdicts, ["needs_review"]);
    assert.equal(result.report.answerLabel, "Empty reviewer packet");
    assert.equal(result.report.assessments.length, 0);
    assert.match(result.artifacts?.review_csv ?? "", /Empty reviewer packet/);
    assert.match(result.artifacts?.review_csv ?? "", /answer_has_claims/);
    assert.match(result.artifacts?.review_csv ?? "", /false/);
    assert.match(result.artifacts?.summary_csv ?? "", /Empty reviewer packet/);
    assert.match(result.artifacts?.summary_csv ?? "", /needs_review/);
    assert.match(result.artifacts?.summary_csv ?? "", /No claims were extracted from this answer\./);
  } finally {
    await api.close();
  }
});

test("evaluate endpoint filters fixtures by domain", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const [hrFixtureContent, supportFixtureContent] = await Promise.all([
      readFile(join(process.cwd(), "examples/evaluations/hr-policy.json"), "utf8"),
      readFile(join(process.cwd(), "examples/evaluations/support-policy.json"), "utf8"),
    ]);

    const response = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: join(process.cwd(), "examples/evaluations/hr-policy.json"),
            content: hrFixtureContent,
          },
          {
            fixturePath: join(process.cwd(), "examples/evaluations/support-policy.json"),
            content: supportFixtureContent,
          },
        ],
        domains: ["support"],
      }),
    });

    assert.equal(response.status, 200);
    const evaluateResult = await response.json() as ApiEvaluateResponse;
    assert.equal(evaluateResult.scorecards.length, 1);
    assert.equal(evaluateResult.scorecards[0]?.domain, "support");
    assert.deepEqual(evaluateResult.summary.domains, [
      {
        domain: "support",
        fixtureCount: 1,
        mismatchCount: 0,
        mismatchRate: 0,
        answersWithClaims: 1,
        answersWithoutClaims: 0,
        matchedClaims: 3,
        totalExpectedClaims: 3,
        score: 1,
        scoreLabel: "100%",
        expectedSummary: { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 },
        actualSummary: { verified: 1, contradicted: 1, unsupported: 1, needs_review: 0 },
      },
    ]);
  } finally {
    await api.close();
  }
});

test("evaluate endpoint rejects invalid fixture content with a 400", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: "fixtures/broken.json",
            content: JSON.stringify({
              name: "Broken fixture",
              answerPath: "answers/hr.md",
              sourcePaths: ["sources/hr-policy.md"],
              expectedSummary: {
                verified: 1,
                contradicted: 0,
                unsupported: 0,
              },
            }),
          },
        ],
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string; requestId: string };
    assert.equal(
      payload.error,
      "Evaluation fixture fixtures/broken.json.expectedSummary.needs_review must be a non-negative integer.",
    );
    assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("HTTP API verifies PDF answer and source bytes sent as base64 JSON content", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const answerBytes = createSimplePdf("Employees receive 12 weeks of paid leave.");
  const sourceBytes = createSimplePdf("Employees receive 12 weeks of paid leave.");

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answerBase64: Buffer.from(answerBytes).toString("base64"),
        answerPath: "answers/leave-answer.pdf",
        sources: [
          {
            sourcePath: "policies/leave-policy.pdf",
            contentBase64: Buffer.from(sourceBytes).toString("base64"),
            title: "Leave policy",
            trustLevel: "high",
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as Awaited<ReturnType<typeof verifyAnswerContentsResult>>;
    assert.equal(result.report.answerPath, "answers/leave-answer.pdf");
    assert.equal(result.report.sources[0]?.title, "Leave policy");
    assert.deepEqual(result.report.summary, {
      verified: 1,
      contradicted: 0,
      unsupported: 0,
      needs_review: 0,
    });
  } finally {
    await api.close();
  }
});

test("HTTP API verifies DOCX answer and source bytes sent as base64 JSON content", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const docxBytes = await readFile("node_modules/mammoth/test/test-data/single-paragraph.docx");

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answerBase64: docxBytes.toString("base64"),
        answerPath: "answers/docx-answer.docx",
        sources: [
          {
            sourcePath: "policies/docx-policy.docx",
            contentBase64: docxBytes.toString("base64"),
            title: "DOCX policy",
            trustLevel: "high",
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as Awaited<ReturnType<typeof verifyAnswerContentsResult>>;
    assert.equal(result.report.answerPath, "answers/docx-answer.docx");
    assert.equal(result.report.sources[0]?.title, "DOCX policy");
    assert.equal(result.report.summary.verified, 1);
  } finally {
    await api.close();
  }
});

test("HTTP API rejects malformed or ambiguous base64 content fields", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    for (const [body, error] of [
      [
        { answerBase64: "not base64", sources: [{ sourcePath: "policy.md", content: "Policy." }] },
        "answerBase64 must be valid base64.",
      ],
      [
        { answer: "Policy.", answerBase64: "UG9saWN5Lg==", sources: [{ sourcePath: "policy.md", content: "Policy." }] },
        "answer and answerBase64 are mutually exclusive.",
      ],
    ] as const) {
      const response = await fetch(`${api.url}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json() as { error: string }).error, error);
    }
  } finally {
    await api.close();
  }
});

test("HTTP API rejects invalid generatedAt timestamps across report workflows", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const requests = [
    {
      path: "/verify",
      body: {
        answer: "Policy.",
        sources: [{ sourcePath: "policy.md", content: "Policy." }],
        generatedAt: "not-a-timestamp",
      },
    },
    {
      path: "/verify-batch",
      body: {
        answers: [{ answer: "Policy.", answerPath: "answer.md" }],
        sources: [{ sourcePath: "policy.md", content: "Policy." }],
        generatedAt: "not-a-timestamp",
      },
    },
    {
      path: "/import-review",
      body: {
        reviewCsvContent: "answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes\nanswer.md,claim_1,Policy.,verified,Matched,Policy,Policy.,verified,\n",
        generatedAt: "not-a-timestamp",
      },
    },
    {
      path: "/evaluate",
      body: {
        fixtures: [{ fixturePath: "fixture.json", content: "{}" }],
        generatedAt: "not-a-timestamp",
      },
    },
  ] as const;

  try {
    for (const request of requests) {
      const response = await fetch(`${api.url}${request.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request.body),
      });

      assert.equal(response.status, 400, request.path);
      assert.equal(
        (await response.json() as { error: string }).error,
        "generatedAt must be a valid timestamp.",
        request.path,
      );
    }
  } finally {
    await api.close();
  }
});

test("HTTP API rejects invalid source updatedAt timestamps", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answer: "Policy.",
        sources: [{ sourcePath: "policy.md", content: "Policy.", updatedAt: "not-a-timestamp" }],
      }),
    });

    assert.equal(response.status, 400);
    assert.equal(
      (await response.json() as { error: string }).error,
      "sources[0].updatedAt must be a valid timestamp.",
    );
  } finally {
    await api.close();
  }
});

test("evaluate endpoint rejects misaligned fixture expectations with a 400", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: "fixtures/broken.json",
            content: JSON.stringify({
              name: "Broken fixture",
              answerPath: "answers/hr.md",
              sourcePaths: ["sources/hr-policy.md"],
              expectedSummary: {
                verified: 2,
                contradicted: 0,
                unsupported: 0,
                needs_review: 0,
              },
              expectedClaimVerdicts: ["verified"],
            }),
          },
        ],
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string; requestId: string };
    assert.equal(
      payload.error,
      "Evaluation fixture fixtures/broken.json.expectedClaimVerdicts must include 2 entries to match the totals in Evaluation fixture fixtures/broken.json.expectedSummary.",
    );
    assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("programmatic API can return conflict statuses for fail-policy matches when requested", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const verifyResponse = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 18 weeks of paid parental leave.",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        failOn: ["contradicted"],
        failOnStatus: true,
      }),
    });
    assert.equal(verifyResponse.status, 409);
    const verifyResult = await verifyResponse.json() as Awaited<ReturnType<typeof verifyAnswerContentsResult>>;
    assert.equal(verifyResult.shouldFail, true);
    assert.deepEqual(verifyResult.failVerdicts, ["contradicted"]);

    const batchResponse = await fetch(`${api.url}/verify-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answers: [
          {
            answer: "Employees receive 18 weeks of paid parental leave.",
            answerPath: "answers/hr.md",
          },
        ],
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        failOn: ["contradicted"],
        failOnStatus: true,
      }),
    });
    assert.equal(batchResponse.status, 409);
    const batchResult = await batchResponse.json() as Awaited<ReturnType<typeof verifyAnswerBatchContentsResult>>;
    assert.equal(batchResult.shouldFail, true);
    assert.deepEqual(batchResult.failVerdicts, ["contradicted"]);

    const importResponse = await fetch(`${api.url}/import-review`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        reviewCsvContent: `answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes
HR reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation
`,
        failOn: ["needs_review"],
        failOnStatus: true,
      }),
    });
    assert.equal(importResponse.status, 409);
    const importResult = await importResponse.json() as ReturnType<typeof importReviewerDecisionContentsResult>;
    assert.equal(importResult.shouldFail, true);
    assert.deepEqual(importResult.failVerdicts, ["needs_review"]);

    const evaluateResponse = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fixtures: [
          {
            fixturePath: join(process.cwd(), "tmp-fixtures", "hr-inline.json"),
            content: JSON.stringify({
              name: "Inline HR API fixture",
              answerPath: "../answers/hr-inline.md",
              answer: "Employees receive 18 weeks of paid parental leave.\n",
              sources: [
                {
                  sourcePath: "../sources/hr-policy.md",
                  title: "HR Policy",
                  trustLevel: "high",
                  content: "Employees receive 12 weeks of paid parental leave.\n",
                },
              ],
              expectedSummary: {
                verified: 1,
                contradicted: 0,
                unsupported: 0,
                needs_review: 0,
              },
              expectedClaimVerdicts: ["verified"],
            }),
          },
        ],
        failOnStatus: true,
      }),
    });
    assert.equal(evaluateResponse.status, 409);
    const evaluateResult = await evaluateResponse.json() as Awaited<ReturnType<typeof evaluateFixtureContentsResult>>;
    assert.equal(evaluateResult.shouldFail, true);
    assert.equal(evaluateResult.mismatchCount, 1);
  } finally {
    await api.close();
  }
});

test("programmatic API validates failOnStatus request fields", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        answer: "Employees receive 12 weeks of paid parental leave.",
        sources: [
          {
            sourcePath: "sources/hr-policy.md",
            content: `---
title: HR Policy
trustLevel: high
---
Employees receive 12 weeks of paid parental leave.
`,
          },
        ],
        failOnStatus: "yes",
      }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: string; requestId: string };
    assert.equal(payload.error, "failOnStatus must be a boolean.");
    assert.match(payload.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    await api.close();
  }
});

test("programmatic API serves inline evaluation fixtures over HTTP without local answer files", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const generatedAt = "2026-07-08T04:05:00.000Z";

  try {
    const response = await fetch(`${api.url}/evaluate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        generatedAt,
        fixtures: [
          {
            fixturePath: join(process.cwd(), "tmp-fixtures", "hr-inline.json"),
            content: JSON.stringify({
              name: "Inline HR API fixture",
              answerPath: "../answers/hr-inline.md",
              answer: "Employees receive 12 weeks of paid parental leave.\n",
              answerLabel: "HR API reviewer packet",
              sources: [
                {
                  sourcePath: "../sources/hr-policy.md",
                  title: "HR Policy",
                  trustLevel: "high",
                  content: "Employees receive 12 weeks of paid parental leave.\n",
                },
              ],
              expectedSummary: {
                verified: 1,
                contradicted: 0,
                unsupported: 0,
                needs_review: 0,
              },
              expectedClaimVerdicts: ["verified"],
            }),
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const result = await response.json() as {
      shouldFail: boolean;
      mismatchCount: number;
      summary: {
        fixtureCount: number;
        matchedClaims: number;
        totalExpectedClaims: number;
        score: number;
        scoreLabel: string;
      };
      scorecards: Array<{
        fixtureName: string;
        answerPath: string;
        answerLabel?: string;
        report: {
          generatedAt: string;
          sources: Array<{
            title: string;
          }>;
        };
        summaryMatches: boolean;
        matchedClaims: number;
        totalExpectedClaims: number;
      }>;
    };

    assert.equal(result.shouldFail, false);
    assert.equal(result.mismatchCount, 0);
    assert.equal(result.summary.fixtureCount, 1);
    assert.equal(result.summary.matchedClaims, 1);
    assert.equal(result.summary.totalExpectedClaims, 1);
    assert.equal(result.summary.score, 1);
    assert.equal(result.summary.scoreLabel, "100%");
    assert.equal(result.scorecards[0]?.fixtureName, "Inline HR API fixture");
    assert.equal(result.scorecards[0]?.answerLabel, "HR API reviewer packet");
    assert.equal(
      result.scorecards[0]?.answerPath,
      join(process.cwd(), "answers", "hr-inline.md"),
    );
    assert.equal(
      result.scorecards[0]?.report.sources[0]?.title,
      "HR Policy",
    );
    assert.equal(result.scorecards[0]?.report.generatedAt, generatedAt);
    assert.equal(result.scorecards[0]?.summaryMatches, true);
    assert.equal(result.scorecards[0]?.matchedClaims, 1);
    assert.equal(result.scorecards[0]?.totalExpectedClaims, 1);
  } finally {
    await api.close();
  }
});

test("programmatic API exports batch evaluation helpers", async () => {
  const scorecards = await evaluateFixtureFiles({
    fixturePaths: [],
    fixtureDirPaths: [join(process.cwd(), "examples/evaluations")],
    generatedAt: "2026-07-05T03:00:00.000Z",
  });

  const rendered = renderEvaluationTextReport(scorecards);

  assert.equal(scorecards.length, 77);
  assert.equal(scorecards.some(hasEvaluationMismatch), false);
  assert.match(rendered, /Fixtures: 77/);
  assert.match(renderEvaluationHtmlReport(scorecards), /<!doctype html>/i);
  assert.match(renderEvaluationSummaryCsv(scorecards), /generated_at,fixture_name,domain,fixture_path,answer_path/);
});
