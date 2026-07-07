import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { evaluateFixtureContentsResult, type InMemoryEvaluationFixtureInput } from "./evaluation.js";
import { parseClaimVerdict } from "./report-policy.js";
import { parseSourceTrustLevel } from "./source-loader.js";
import {
  importReviewerDecisionContentsResult,
  verifyAnswerBatchContentsResult,
  verifyAnswerContentsResult,
  type InMemoryAnswerInput,
  type InMemorySourceInput,
} from "./workflow.js";

export interface ApiSourceInput {
  sourcePath: string;
  content: string;
}

export interface VerifyApiRequest {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
  sources: ApiSourceInput[];
  defaultTrustLevel?: string;
  failOn?: string[];
}

export interface VerifyBatchApiRequest {
  answers: Array<{
    answer: string;
    answerPath?: string;
    answerLabel?: string;
  }>;
  sources: ApiSourceInput[];
  defaultTrustLevel?: string;
  failOn?: string[];
}

export interface ImportReviewApiRequest {
  reviewCsvContent: string;
  failOn?: string[];
}

export interface EvaluateApiRequest {
  fixtures: Array<{
    fixturePath: string;
    content: string;
  }>;
}

export interface ApiServerOptions {
  host?: string;
  port?: number;
}

export interface StartedApiServer {
  host: string;
  port: number;
  server: Server;
  url: string;
  close(): Promise<void>;
}

const OPENAPI_PATH = "/openapi.json";
const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type";
const API_SERVICE_NAME = "quorum";
const API_VERSION = "0.1.0";

export function createApiServer(): Server {
  return createServer(async (request, response) => {
    try {
      await handleApiRequest(request, response);
    } catch (error: unknown) {
      if (error instanceof ApiRequestError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }

      writeJson(response, 500, { error: "Internal server error." });
    }
  });
}

export async function startApiServer(options: ApiServerOptions = {}): Promise<StartedApiServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const server = createApiServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Could not determine API server address.");
  }

  return {
    host,
    port: address.port,
    server,
    url: `http://${host}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  applyCorsHeaders(response);
  const url = request.url ?? "/";

  if (request.method === "OPTIONS") {
    writeNoContent(response);
    return;
  }

  if (request.method === "GET" && url === "/") {
    writeJson(response, 200, {
      service: API_SERVICE_NAME,
      version: API_VERSION,
      openapiPath: OPENAPI_PATH,
      endpoints: [
        { method: "GET", path: "/health", description: "Return a simple readiness response." },
        { method: "GET", path: OPENAPI_PATH, description: "Return the OpenAPI description for this server." },
        { method: "POST", path: "/verify", description: "Verify one answer from JSON request content." },
        {
          method: "POST",
          path: "/verify-batch",
          description: "Verify multiple answers from JSON request content.",
        },
        {
          method: "POST",
          path: "/import-review",
          description: "Import reviewer CSV content from JSON request content.",
        },
        {
          method: "POST",
          path: "/evaluate",
          description: "Evaluate fixture JSON content from request payloads.",
        },
      ],
    });
    return;
  }

  if (request.method === "GET" && url === "/health") {
    writeJson(response, 200, {
      ok: true,
      service: API_SERVICE_NAME,
      version: API_VERSION,
    });
    return;
  }

  if (request.method === "GET" && url === OPENAPI_PATH) {
    writeJson(response, 200, buildOpenApiDocument(request));
    return;
  }

  if (url === "/verify") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseVerifyRequest(await readJsonBody(request));
    const result = await verifyAnswerContentsResult({
      answer: body.answer,
      answerPath: body.answerPath,
      answerLabel: body.answerLabel,
      sources: body.sources,
      defaultTrustLevel: body.defaultTrustLevel,
      failOn: body.failOn,
    });
    writeJson(response, 200, result);
    return;
  }

  if (url === "/verify-batch") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseVerifyBatchRequest(await readJsonBody(request));
    const result = await verifyAnswerBatchContentsResult({
      answers: body.answers,
      sources: body.sources,
      defaultTrustLevel: body.defaultTrustLevel,
      failOn: body.failOn,
    });
    writeJson(response, 200, result);
    return;
  }

  if (url === "/import-review") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseImportReviewRequest(await readJsonBody(request));
    const result = importReviewerDecisionContentsResult({
      reviewCsvContent: body.reviewCsvContent,
      failOn: body.failOn,
    });
    writeJson(response, 200, result);
    return;
  }

  if (url === "/evaluate") {
    if (request.method !== "POST") {
      writeMethodNotAllowed(response, "POST");
      return;
    }

    requireJsonRequest(request);
    const body = parseEvaluateRequest(await readJsonBody(request));
    const result = await evaluateFixtureContentsResult({
      fixtures: body.fixtures,
    });
    writeJson(response, 200, result);
    return;
  }

  writeJson(response, 404, { error: "Not found." });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (body.length === 0) {
    throw requestError("Request body must be valid JSON.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw requestError("Request body must be valid JSON.");
  }
}

function requireJsonRequest(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];

  if (typeof contentType !== "string" || !isJsonContentType(contentType)) {
    throw requestError("Content-Type must be application/json.", 415);
  }
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function parseVerifyRequest(value: unknown): {
  answer: string;
  answerPath?: string;
  answerLabel?: string;
  sources: InMemorySourceInput[];
  defaultTrustLevel?: ReturnType<typeof parseSourceTrustLevel>;
  failOn?: ReturnType<typeof parseFailOnVerdicts>;
} {
  const record = requireRecord(value, "Verify request body");

  return {
    answer: requireString(record.answer, "answer"),
    answerPath: optionalString(record.answerPath, "answerPath"),
    answerLabel: optionalString(record.answerLabel, "answerLabel"),
    sources: parseSources(record.sources),
    defaultTrustLevel: parseOptionalTrustLevel(record.defaultTrustLevel),
    failOn: parseOptionalFailOn(record.failOn),
  };
}

function parseVerifyBatchRequest(value: unknown): {
  answers: InMemoryAnswerInput[];
  sources: InMemorySourceInput[];
  defaultTrustLevel?: ReturnType<typeof parseSourceTrustLevel>;
  failOn?: ReturnType<typeof parseFailOnVerdicts>;
} {
  const record = requireRecord(value, "Batch verify request body");
  const answersValue = record.answers;

  if (!Array.isArray(answersValue) || answersValue.length === 0) {
    throw requestError("answers must be a non-empty array.");
  }

  return {
    answers: answersValue.map((answer, index) => parseAnswerInput(answer, index)),
    sources: parseSources(record.sources),
    defaultTrustLevel: parseOptionalTrustLevel(record.defaultTrustLevel),
    failOn: parseOptionalFailOn(record.failOn),
  };
}

function parseImportReviewRequest(value: unknown): {
  reviewCsvContent: string;
  failOn?: ReturnType<typeof parseFailOnVerdicts>;
} {
  const record = requireRecord(value, "Import review request body");

  return {
    reviewCsvContent: requireString(record.reviewCsvContent, "reviewCsvContent"),
    failOn: parseOptionalFailOn(record.failOn),
  };
}

function parseEvaluateRequest(value: unknown): {
  fixtures: InMemoryEvaluationFixtureInput[];
} {
  const record = requireRecord(value, "Evaluate request body");
  const fixturesValue = record.fixtures;

  if (!Array.isArray(fixturesValue) || fixturesValue.length === 0) {
    throw requestError("fixtures must be a non-empty array.");
  }

  return {
    fixtures: fixturesValue.map((fixture, index) => parseFixtureInput(fixture, index)),
  };
}

function parseAnswerInput(value: unknown, index: number): InMemoryAnswerInput {
  const record = requireRecord(value, `answers[${index}]`);

  return {
    answer: requireString(record.answer, `answers[${index}].answer`),
    answerPath: optionalString(record.answerPath, `answers[${index}].answerPath`),
    answerLabel: optionalString(record.answerLabel, `answers[${index}].answerLabel`),
  };
}

function parseFixtureInput(value: unknown, index: number): InMemoryEvaluationFixtureInput {
  const record = requireRecord(value, `fixtures[${index}]`);

  return {
    fixturePath: requireString(record.fixturePath, `fixtures[${index}].fixturePath`),
    content: requireString(record.content, `fixtures[${index}].content`),
  };
}

function parseSources(value: unknown): InMemorySourceInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw requestError("sources must be a non-empty array.");
  }

  return value.map((source, index) => {
    const record = requireRecord(source, `sources[${index}]`);

    return {
      sourcePath: requireString(record.sourcePath, `sources[${index}].sourcePath`),
      content: requireString(record.content, `sources[${index}].content`),
    };
  });
}

function parseOptionalTrustLevel(
  value: unknown,
): ReturnType<typeof parseSourceTrustLevel> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseSourceTrustLevel(requireString(value, "defaultTrustLevel"));
}

function parseOptionalFailOn(value: unknown): ReturnType<typeof parseFailOnVerdicts> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return parseFailOnVerdicts(value);
}

function parseFailOnVerdicts(value: unknown) {
  if (!Array.isArray(value)) {
    throw requestError("failOn must be an array of verdict strings.");
  }

  return value.map((entry, index) => parseClaimVerdict(requireString(entry, `failOn[${index}]`)));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw requestError(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw requestError(`${fieldName} must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireString(value, fieldName);
}

function buildOpenApiDocument(request: IncomingMessage) {
  const host = request.headers.host;
  const servers = host ? [{ url: `http://${host}` }] : [];
  const topLevelSummarySchema = {
    type: "object",
    properties: {
      verified: { type: "integer", minimum: 0 },
      contradicted: { type: "integer", minimum: 0 },
      unsupported: { type: "integer", minimum: 0 },
      needs_review: { type: "integer", minimum: 0 },
    },
    required: ["verified", "contradicted", "unsupported", "needs_review"],
  };
  const errorResponse = (description: string) => ({
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ApiErrorResponse" },
      },
    },
  });
  const postErrorResponses = {
    "400": errorResponse("The JSON body was missing required fields or had invalid values."),
    "405": errorResponse("The route only accepts POST."),
    "415": errorResponse("The request Content-Type was not application/json."),
    "500": errorResponse("The server failed while handling the request."),
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Quorum Local API",
      version: API_VERSION,
      description:
        "Local JSON API for Quorum answer verification, batch verification, and reviewer decision imports.",
    },
    servers,
    paths: {
      "/": {
        get: {
          summary: "Service discovery",
          responses: {
            "200": {
              description: "Available Quorum local API endpoints.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiIndexResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
      },
      "/health": {
        get: {
          summary: "Readiness check",
          responses: {
            "200": {
              description: "Server is ready to accept requests.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ApiHealthResponse" },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
      },
      [OPENAPI_PATH]: {
        get: {
          summary: "OpenAPI description",
          responses: {
            "200": {
              description: "Machine-readable API description for this server.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      openapi: { type: "string" },
                    },
                    required: ["openapi"],
                  },
                },
              },
            },
            "500": errorResponse("The server failed while handling the request."),
          },
        },
      },
      "/verify": {
        post: {
          summary: "Verify one answer",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answer: { type: "string" },
                    answerPath: { type: "string" },
                    answerLabel: { type: "string" },
                    sources: {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/ApiSourceInput" },
                    },
                    defaultTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
                    failOn: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ClaimVerdict" },
                    },
                  },
                  required: ["answer", "sources"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Single-answer verification result.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SingleVerificationResult" },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/verify-batch": {
        post: {
          summary: "Verify multiple answers",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answers: {
                      type: "array",
                      minItems: 1,
                      items: {
                        type: "object",
                        properties: {
                          answer: { type: "string" },
                          answerPath: { type: "string" },
                          answerLabel: { type: "string" },
                        },
                        required: ["answer"],
                      },
                    },
                    sources: {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/ApiSourceInput" },
                    },
                    defaultTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
                    failOn: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ClaimVerdict" },
                    },
                  },
                  required: ["answers", "sources"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch verification result.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/BatchVerificationRunResult" },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/import-review": {
        post: {
          summary: "Import reviewer decisions",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reviewCsvContent: { type: "string" },
                    failOn: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ClaimVerdict" },
                    },
                  },
                  required: ["reviewCsvContent"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Reviewer decision import result.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ReviewerDecisionImportResult" },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
      "/evaluate": {
        post: {
          summary: "Evaluate fixtures",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    fixtures: {
                      type: "array",
                      minItems: 1,
                      items: { $ref: "#/components/schemas/ApiEvaluationFixtureInput" },
                    },
                  },
                  required: ["fixtures"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Evaluation scorecard batch result.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/EvaluationBatchRunResult" },
                },
              },
            },
            ...postErrorResponses,
          },
        },
      },
    },
    components: {
      schemas: {
        ApiErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
        },
        ApiDiscoveryEndpoint: {
          type: "object",
          properties: {
            method: {
              type: "string",
              enum: ["GET", "POST", "OPTIONS"],
            },
            path: { type: "string" },
            description: { type: "string" },
          },
          required: ["method", "path", "description"],
        },
        ApiIndexResponse: {
          type: "object",
          properties: {
            service: { type: "string", const: API_SERVICE_NAME },
            version: { type: "string", const: API_VERSION },
            openapiPath: { type: "string", const: OPENAPI_PATH },
            endpoints: {
              type: "array",
              items: { $ref: "#/components/schemas/ApiDiscoveryEndpoint" },
            },
          },
          required: ["service", "version", "openapiPath", "endpoints"],
        },
        ApiHealthResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", const: true },
            service: { type: "string", const: API_SERVICE_NAME },
            version: { type: "string", const: API_VERSION },
          },
          required: ["ok", "service", "version"],
        },
        ApiSourceInput: {
          type: "object",
          properties: {
            sourcePath: { type: "string" },
            content: { type: "string" },
          },
          required: ["sourcePath", "content"],
        },
        ApiEvaluationFixtureInput: {
          type: "object",
          properties: {
            fixturePath: { type: "string" },
            content: { type: "string" },
          },
          required: ["fixturePath", "content"],
        },
        SourceTrustLevel: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        ClaimVerdict: {
          type: "string",
          enum: ["verified", "unsupported", "contradicted", "needs_review"],
        },
        SourceSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            updatedAt: { type: "string" },
            trustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
          },
          required: ["id", "title", "trustLevel"],
        },
        AtomicClaim: {
          type: "object",
          properties: {
            id: { type: "string" },
            text: { type: "string" },
          },
          required: ["id", "text"],
        },
        EvidenceSnippet: {
          type: "object",
          properties: {
            documentId: { type: "string" },
            documentTitle: { type: "string" },
            documentTrustLevel: { $ref: "#/components/schemas/SourceTrustLevel" },
            documentUpdatedAt: { type: "string" },
            quote: { type: "string" },
            score: { type: "number" },
          },
          required: ["documentId", "documentTitle", "documentTrustLevel", "quote", "score"],
        },
        ClaimAssessment: {
          type: "object",
          properties: {
            claim: { $ref: "#/components/schemas/AtomicClaim" },
            verdict: { $ref: "#/components/schemas/ClaimVerdict" },
            evidence: {
              type: "array",
              items: { $ref: "#/components/schemas/EvidenceSnippet" },
            },
            reason: { type: "string" },
          },
          required: ["claim", "verdict", "evidence", "reason"],
        },
        VerificationSummary: topLevelSummarySchema,
        VerificationReport: {
          type: "object",
          properties: {
            generatedAt: { type: "string" },
            answerPath: { type: "string" },
            answerLabel: { type: "string" },
            answerPreview: { type: "string" },
            answer: { type: "string" },
            sources: {
              type: "array",
              items: { $ref: "#/components/schemas/SourceSummary" },
            },
            assessments: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimAssessment" },
            },
            summary: { $ref: "#/components/schemas/VerificationSummary" },
          },
          required: [
            "generatedAt",
            "answerPreview",
            "answer",
            "sources",
            "assessments",
            "summary",
          ],
        },
        SingleVerificationResult: {
          type: "object",
          properties: {
            report: { $ref: "#/components/schemas/VerificationReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["report", "shouldFail", "failVerdicts"],
        },
        BatchVerificationResult: {
          type: "object",
          properties: {
            answerLabel: { type: "string" },
            answerPath: { type: "string" },
            report: { $ref: "#/components/schemas/VerificationReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["answerLabel", "answerPath", "report", "shouldFail", "failVerdicts"],
        },
        BatchVerificationSummary: {
          allOf: [
            topLevelSummarySchema,
            {
              type: "object",
              properties: {
                answersWithoutClaims: { type: "integer", minimum: 0 },
                answersWithFailures: { type: "integer", minimum: 0 },
              },
              required: ["answersWithoutClaims", "answersWithFailures"],
            },
          ],
        },
        BatchVerificationReport: {
          type: "object",
          properties: {
            generatedAt: { type: "string" },
            sources: {
              type: "array",
              items: { $ref: "#/components/schemas/SourceSummary" },
            },
            sourceCount: { type: "integer", minimum: 0 },
            answerCount: { type: "integer", minimum: 0 },
            answers: {
              type: "array",
              items: { $ref: "#/components/schemas/BatchVerificationResult" },
            },
            summary: { $ref: "#/components/schemas/BatchVerificationSummary" },
          },
          required: [
            "generatedAt",
            "sources",
            "sourceCount",
            "answerCount",
            "answers",
            "summary",
          ],
        },
        BatchVerificationRunResult: {
          type: "object",
          properties: {
            report: { $ref: "#/components/schemas/BatchVerificationReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["report", "shouldFail", "failVerdicts"],
        },
        ImportedReviewerDecision: {
          type: "object",
          properties: {
            answerLabel: { type: "string" },
            answerPath: { type: "string" },
            answerPreview: { type: "string" },
            originalAnswerFailPolicy: {
              type: "string",
              enum: ["matched", "clear"],
            },
            originalAnswerFailVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
            claimId: { type: "string" },
            claimText: { type: "string" },
            modelVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            modelReason: { type: "string" },
            evidenceTitles: { type: "array", items: { type: "string" } },
            evidenceTrustLevels: { type: "array", items: { type: "string" } },
            evidenceUpdatedAt: { type: "array", items: { type: "string" } },
            evidenceScores: { type: "array", items: { type: "string" } },
            evidenceQuotes: { type: "array", items: { type: "string" } },
            reviewerVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            reviewerNotes: { type: "string" },
            finalVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            overridden: { type: "boolean" },
          },
          required: [
            "originalAnswerFailVerdicts",
            "claimId",
            "claimText",
            "modelVerdict",
            "modelReason",
            "evidenceTitles",
            "evidenceTrustLevels",
            "evidenceUpdatedAt",
            "evidenceScores",
            "evidenceQuotes",
            "finalVerdict",
            "overridden",
          ],
        },
        ReviewerDecisionImportSummary: {
          allOf: [
            topLevelSummarySchema,
            {
              type: "object",
              properties: {
                totalClaims: { type: "integer", minimum: 0 },
                reviewedClaims: { type: "integer", minimum: 0 },
                pendingClaims: { type: "integer", minimum: 0 },
                overriddenClaims: { type: "integer", minimum: 0 },
              },
              required: [
                "totalClaims",
                "reviewedClaims",
                "pendingClaims",
                "overriddenClaims",
              ],
            },
          ],
        },
        ReviewerDecisionGroup: {
          type: "object",
          properties: {
            answerLabel: { type: "string" },
            answerPath: { type: "string" },
            answerPreview: { type: "string" },
            originalAnswerFailPolicy: {
              type: "string",
              enum: ["matched", "clear"],
            },
            originalAnswerFailVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
            label: { type: "string" },
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/ImportedReviewerDecision" },
            },
            emptyStateReason: { type: "string" },
            summary: { $ref: "#/components/schemas/ReviewerDecisionImportSummary" },
          },
          required: ["originalAnswerFailVerdicts", "label", "claims", "summary"],
        },
        ReviewerDecisionImportReport: {
          type: "object",
          properties: {
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/ImportedReviewerDecision" },
            },
            answerGroups: {
              type: "array",
              items: { $ref: "#/components/schemas/ReviewerDecisionGroup" },
            },
            summary: { $ref: "#/components/schemas/ReviewerDecisionImportSummary" },
          },
          required: ["claims", "answerGroups", "summary"],
        },
        ReviewerDecisionImportResult: {
          type: "object",
          properties: {
            report: { $ref: "#/components/schemas/ReviewerDecisionImportReport" },
            shouldFail: { type: "boolean" },
            failVerdicts: {
              type: "array",
              items: { $ref: "#/components/schemas/ClaimVerdict" },
            },
          },
          required: ["report", "shouldFail", "failVerdicts"],
        },
        EvaluationClaimScore: {
          type: "object",
          properties: {
            index: { type: "integer", minimum: 0 },
            claimText: { type: "string" },
            actualVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            expectedVerdict: { $ref: "#/components/schemas/ClaimVerdict" },
            matches: { type: "boolean" },
          },
          required: ["index", "claimText", "actualVerdict", "matches"],
        },
        EvaluationScorecard: {
          type: "object",
          properties: {
            fixtureName: { type: "string" },
            fixturePath: { type: "string" },
            answerPath: { type: "string" },
            answerLabel: { type: "string" },
            answerPreview: { type: "string" },
            sourceDirs: { type: "array", items: { type: "string" } },
            sourcePaths: { type: "array", items: { type: "string" } },
            report: { $ref: "#/components/schemas/VerificationReport" },
            expectedSummary: { $ref: "#/components/schemas/VerificationSummary" },
            actualSummary: { $ref: "#/components/schemas/VerificationSummary" },
            summaryMatches: { type: "boolean" },
            claims: {
              type: "array",
              items: { $ref: "#/components/schemas/EvaluationClaimScore" },
            },
            matchedClaims: { type: "integer", minimum: 0 },
            totalExpectedClaims: { type: "integer", minimum: 0 },
            score: { type: "number" },
          },
          required: [
            "fixtureName",
            "answerPath",
            "answerPreview",
            "sourceDirs",
            "sourcePaths",
            "report",
            "expectedSummary",
            "actualSummary",
            "summaryMatches",
            "claims",
            "matchedClaims",
            "totalExpectedClaims",
            "score",
          ],
        },
        EvaluationBatchRunResult: {
          type: "object",
          properties: {
            scorecards: {
              type: "array",
              items: { $ref: "#/components/schemas/EvaluationScorecard" },
            },
            shouldFail: { type: "boolean" },
            mismatchCount: { type: "integer", minimum: 0 },
          },
          required: ["scorecards", "shouldFail", "mismatchCount"],
        },
      },
    },
  };
}

function writeMethodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader("Allow", allow);
  writeJson(response, 405, { error: `Method not allowed. Use ${allow}.` });
}

function applyCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
}

function writeNoContent(response: ServerResponse): void {
  response.statusCode = 204;
  response.end();
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

class ApiRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = statusCode;
  }
}

function requestError(message: string, statusCode?: number): ApiRequestError {
  return new ApiRequestError(message, statusCode);
}
