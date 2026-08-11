import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  API_CORS_ALLOWED_HEADERS,
  API_CORS_EXPOSED_HEADERS,
  API_CORS_MAX_AGE_SECONDS,
  API_ENDPOINTS,
  API_VERSION,
  API_ROOT_PATH,
  FORMATS_PATH,
  VERSION_PATH,
  createOpenApiDocument,
  startApiServer,
} from "../src/index.js";

test("HTTP API version follows package metadata", async () => {
  const packageVersion = (JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string }).version;

  assert.equal(API_VERSION, packageVersion);
});

test("HTTP API exposes a dedicated machine-readable version endpoint", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}${VERSION_PATH}`);
    assert.equal(response.status, 200);
    const etag = response.headers.get("etag");
    assert.match(etag ?? "", /^\"[a-f0-9]{64}\"$/);
    assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
    const payload = await response.json() as { requestId: string; service: string; version: string };
    assert.equal(payload.requestId, response.headers.get("x-quorum-request-id"));
    assert.deepEqual({ ...payload, requestId: "" }, { requestId: "", service: "quorum", version: API_VERSION });

    const headResponse = await fetch(`${api.url}${VERSION_PATH}`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("etag"), etag);
    assert.equal(await headResponse.text(), "");

    const notModifiedResponse = await fetch(`${api.url}${VERSION_PATH}`, {
      headers: { "if-none-match": etag ?? "" },
    });
    assert.equal(notModifiedResponse.status, 304);
    assert.equal(notModifiedResponse.headers.get("etag"), etag);
    assert.equal(await notModifiedResponse.text(), "");
  } finally {
    await api.close();
  }
});

test("HTTP API revalidates bodyless discovery probes with conditional HEAD", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    for (const path of [API_ROOT_PATH, "/capabilities", FORMATS_PATH, "/openapi.json"]) {
      const headResponse = await fetch(`${api.url}${path}`, { method: "HEAD" });
      assert.equal(headResponse.status, 200, path);
      const etag = headResponse.headers.get("etag");
      assert.match(etag ?? "", /^\"[a-f0-9]{64}\"$/, path);
      assert.equal(await headResponse.text(), "", path);

      const notModifiedResponse = await fetch(`${api.url}${path}`, {
        method: "HEAD",
        headers: { "if-none-match": etag ?? "" },
      });
      assert.equal(notModifiedResponse.status, 304, path);
      assert.equal(notModifiedResponse.headers.get("etag"), etag, path);
      assert.equal(await notModifiedResponse.text(), "", path);
    }
  } finally {
    await api.close();
  }
});

test("HTTP API revalidates stable discovery responses with conditional GET", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    for (const path of [API_ROOT_PATH, "/capabilities", "/openapi.json"]) {
      const response = await fetch(`${api.url}${path}`);
      assert.equal(response.status, 200, path);
      const etag = response.headers.get("etag");
      assert.match(etag ?? "", /^\"[a-f0-9]{64}\"$/, path);
      assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate", path);
      assert.ok((await response.text()).length > 0, path);

      const notModifiedResponse = await fetch(`${api.url}${path}`, {
        headers: { "if-none-match": etag ?? "" },
      });
      assert.equal(notModifiedResponse.status, 304, path);
      assert.equal(notModifiedResponse.headers.get("etag"), etag, path);
      assert.equal(await notModifiedResponse.text(), "", path);
    }
  } finally {
    await api.close();
  }
});

test("HTTP API scopes browser preflight methods to every discovered route", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const paths = [...new Set(API_ENDPOINTS.map((endpoint) => endpoint.path))];

    for (const path of paths) {
      const expectedMethods = API_ENDPOINTS
        .filter((endpoint) => endpoint.path === path)
        .map((endpoint) => endpoint.method)
        .join(", ");
      const requestedMethod = API_ENDPOINTS.find((endpoint) => endpoint.path === path)?.method;
      const response = await fetch(`${api.url}${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "https://browser.example",
          "access-control-request-method": requestedMethod ?? "GET",
          "access-control-request-headers": "content-type, x-quorum-request-id",
        },
      });

      assert.equal(response.status, 204, path);
      assert.equal(response.headers.get("access-control-allow-origin"), "*");
      assert.equal(response.headers.get("access-control-allow-methods"), expectedMethods, path);
      assert.equal(response.headers.get("access-control-allow-headers"), API_CORS_ALLOWED_HEADERS, path);
      assert.equal(response.headers.get("access-control-expose-headers"), API_CORS_EXPOSED_HEADERS, path);
      assert.equal(response.headers.get("access-control-max-age"), API_CORS_MAX_AGE_SECONDS.toString(), path);
      assert.equal(await response.text(), "", path);
    }
  } finally {
    await api.close();
  }
});

test("HTTP API reports the allowed method for an unsupported route method", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}/verify`, { method: "GET" });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    const payload = await response.json() as { error: string; requestId: string };
    assert.equal(payload.error, "Method not allowed. Use POST.");
    assert.equal(payload.requestId, response.headers.get("x-quorum-request-id"));
  } finally {
    await api.close();
  }
});

test("HTTP API keeps unsupported methods consistent across GET-only routes", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });
  const getOnlyPaths = ["/", "/capabilities", "/health", "/healthz", "/readyz", "/livez", "/version", "/openapi.json"];
  const unsupportedMethods = ["POST", "PUT", "DELETE"] as const;

  try {
    for (const path of getOnlyPaths) {
      for (const method of unsupportedMethods) {
        const response = await fetch(`${api.url}${path}`, { method });
        assert.equal(response.status, 405, `${method} ${path}`);
        assert.equal(response.headers.get("allow"), "GET, HEAD", `${method} ${path} Allow`);
        assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8", `${method} ${path} content type`);
        assert.equal(response.headers.get("x-quorum-request-id")?.length, 36, `${method} ${path} request ID`);
        const payload = await response.json() as { error: string; requestId: string };
        assert.equal(payload.error, "Method not allowed. Use GET, HEAD.", `${method} ${path} error`);
        assert.equal(payload.requestId, response.headers.get("x-quorum-request-id"), `${method} ${path} payload request ID`);
      }
    }
  } finally {
    await api.close();
  }
});

test("OpenAPI documents the version endpoint", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, {
      get?: {
        operationId?: string;
        responses?: Record<string, {
          headers?: Record<string, unknown>;
          content?: Record<string, { schema?: { $ref?: string }; examples?: Record<string, { value?: unknown }> }>;
        }>;
      };
      head?: { operationId?: string };
    }>;
    components: { schemas: Record<string, { required?: string[] }> };
  };

  assert.equal(document.paths[VERSION_PATH]?.get?.operationId, "getVersion");
  assert.equal(document.paths[VERSION_PATH]?.head?.operationId, "headVersion");
  assert.ok(document.paths[VERSION_PATH]?.get?.responses?.["304"]?.headers?.ETag);
  assert.equal(
    document.paths[VERSION_PATH]?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
    "#/components/schemas/ApiVersionResponse",
  );
  assert.deepEqual(
    document.paths[VERSION_PATH]?.get?.responses?.["200"]?.content?.["application/json"]?.examples?.version?.value,
    { requestId: "version-contract-test", service: "quorum", version: API_VERSION },
  );
  assert.deepEqual(document.components.schemas.ApiVersionResponse.required, ["requestId", "service", "version"]);
});

test("OpenAPI documents every discovered route and method", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, Record<string, unknown>>;
  };

  for (const endpoint of API_ENDPOINTS) {
    assert.ok(document.paths[endpoint.path], endpoint.path);
    assert.ok(document.paths[endpoint.path]?.[endpoint.method.toLowerCase()], `${endpoint.method} ${endpoint.path}`);
  }
});

test("OpenAPI documents shared method errors for every GET-only route", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, Record<string, {
      responses?: Record<string, {
        headers?: Record<string, { schema?: { const?: string } }>;
        content?: Record<string, { schema?: { $ref?: string } }>;
      }>;
    }>>;
  };

  const getOnlyPaths = ["/", "/capabilities", "/health", "/healthz", "/readyz", "/livez", "/version", "/openapi.json"];
  for (const path of getOnlyPaths) {
    const response = document.paths[path]?.get?.responses?.["405"];
    assert.ok(response, `GET ${path} 405 response`);
    assert.equal(response.headers?.Allow?.schema?.const, "GET, HEAD", `GET ${path} Allow header`);
    assert.equal(
      response.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiErrorResponse",
      `GET ${path} error schema`,
    );
  }
});

test("OpenAPI gives every discovered POST route a JSON request schema", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, Record<string, {
      requestBody?: { content?: Record<string, { schema?: unknown }> };
    }>>;
  };

  for (const endpoint of API_ENDPOINTS.filter(({ method }) => method === "POST")) {
    const operation = document.paths[endpoint.path]?.post;
    assert.ok(operation, `POST ${endpoint.path}`);
    assert.ok(operation.requestBody, `POST ${endpoint.path} request body`);
    assert.ok(operation.requestBody.content?.["application/json"]?.schema, `POST ${endpoint.path} JSON schema`);
  }
});

test("OpenAPI gives every discovered POST route a JSON success response schema", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, Record<string, {
      responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
    }>>;
  };

  for (const endpoint of API_ENDPOINTS.filter(({ method }) => method === "POST")) {
    const operation = document.paths[endpoint.path]?.post;
    assert.ok(operation, `POST ${endpoint.path}`);
    assert.ok(operation.responses?.["200"], `POST ${endpoint.path} success response`);
    assert.ok(
      operation.responses["200"].content?.["application/json"]?.schema,
      `POST ${endpoint.path} JSON success response schema`,
    );
  }
});

test("OpenAPI documents shared method errors for every POST-only route", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, Record<string, {
      responses?: Record<string, {
        headers?: Record<string, { schema?: { const?: string } }>;
        content?: Record<string, { schema?: { $ref?: string } }>;
      }>;
    }>>;
  };

  for (const endpoint of API_ENDPOINTS.filter(({ method }) => method === "POST")) {
    const response = document.paths[endpoint.path]?.post?.responses?.["405"];
    assert.ok(response, `POST ${endpoint.path} 405 response`);
    assert.equal(response.headers?.Allow?.schema?.const, "POST", `POST ${endpoint.path} Allow header`);
    assert.equal(
      response.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/ApiErrorResponse",
      `POST ${endpoint.path} error schema`,
    );
  }
});

test("OpenAPI advertises shared discovery headers on every POST success response", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, Record<string, {
      responses?: Record<string, { headers?: Record<string, unknown> }>;
    }>>;
  };
  const expectedHeaders = [
    "X-Quorum-Service",
    "X-Quorum-Version",
    "X-Quorum-OpenAPI-Path",
    "X-Quorum-Max-Request-Bytes",
    "X-Quorum-Request-Timeout-Ms",
    "X-Quorum-Request-Id",
    "Cache-Control",
  ];

  for (const endpoint of API_ENDPOINTS.filter(({ method }) => method === "POST")) {
    const response = document.paths[endpoint.path]?.post?.responses?.["200"];
    assert.ok(response, `POST ${endpoint.path} success response`);

    for (const header of expectedHeaders) {
      assert.ok(response.headers?.[header], `POST ${endpoint.path} is missing ${header}`);
    }
  }
});

test("OpenAPI documents revalidation for the capabilities endpoint", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, {
      get?: { responses?: Record<string, { headers?: Record<string, unknown> }> };
      head?: { responses?: Record<string, { headers?: Record<string, unknown> }> };
    }>;
  };

  assert.ok(document.paths["/capabilities"]?.get?.responses?.["200"]?.headers?.ETag);
  assert.ok(document.paths["/capabilities"]?.get?.responses?.["304"]?.headers?.ETag);
  assert.ok(document.paths["/capabilities"]?.head?.responses?.["200"]?.headers?.ETag);
  assert.ok(document.paths["/capabilities"]?.head?.responses?.["304"]?.headers?.ETag);
});

test("OpenAPI documents revalidation for the discovery endpoint", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, {
      get?: { responses?: Record<string, { headers?: Record<string, unknown> }> };
      head?: { responses?: Record<string, { headers?: Record<string, unknown> }> };
    }>;
  };

  assert.ok(document.paths[API_ROOT_PATH]?.get?.responses?.["200"]?.headers?.ETag);
  assert.ok(document.paths[API_ROOT_PATH]?.get?.responses?.["304"]?.headers?.ETag);
  assert.ok(document.paths[API_ROOT_PATH]?.head?.responses?.["200"]?.headers?.ETag);
  assert.ok(document.paths[API_ROOT_PATH]?.head?.responses?.["304"]?.headers?.ETag);
});

test("OpenAPI documents revalidation for the OpenAPI endpoint", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, {
      get?: { responses?: Record<string, { headers?: Record<string, unknown> }> };
      head?: { responses?: Record<string, { headers?: Record<string, unknown> }> };
    }>;
  };

  assert.ok(document.paths["/openapi.json"]?.get?.responses?.["200"]?.headers?.ETag);
  assert.ok(document.paths["/openapi.json"]?.get?.responses?.["304"]?.headers?.ETag);
  assert.ok(document.paths["/openapi.json"]?.head?.responses?.["200"]?.headers?.ETag);
  assert.ok(document.paths["/openapi.json"]?.head?.responses?.["304"]?.headers?.ETag);
});
