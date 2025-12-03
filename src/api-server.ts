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
  const url = request.url ?? "/";

  if (request.method === "GET" && url === "/") {
    writeJson(response, 200, {
      service: "quorum",
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
    writeJson(response, 200, { ok: true });
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

  return {
    openapi: "3.1.0",
    info: {
      title: "Quorum Local API",
      version: "0.1.0",
      description:
        "Local JSON API for Quorum answer verification, batch verification, and reviewer decision imports.",
    },
    servers,
    paths: {
      "/health": {
        get: {
          summary: "Readiness check",
          responses: {
            "200": {
              description: "Server is ready to accept requests.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean", const: true },
                    },
                    required: ["ok"],
                  },
                },
              },
            },
          },
        },
      },
      [OPENAPI_PATH]: {
        get: {
          summary: "OpenAPI description",
          responses: {
            "200": {
              description: "Machine-readable API description for this server.",
            },
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
            },
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
            },
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
            },
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
            },
          },
        },
      },
    },
    components: {
      schemas: {
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
      },
    },
  };
}

function writeMethodNotAllowed(response: ServerResponse, allow: string): void {
  response.setHeader("Allow", allow);
  writeJson(response, 405, { error: `Method not allowed. Use ${allow}.` });
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
