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
    for (const path of [API_ROOT_PATH, "/capabilities", "/openapi.json"]) {
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

test("OpenAPI documents the version endpoint", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, {
      get?: { operationId?: string; responses?: Record<string, { headers?: Record<string, unknown> }> };
      head?: { operationId?: string };
    }>;
    components: { schemas: Record<string, { required?: string[] }> };
  };

  assert.equal(document.paths[VERSION_PATH]?.get?.operationId, "getVersion");
  assert.equal(document.paths[VERSION_PATH]?.head?.operationId, "headVersion");
  assert.ok(document.paths[VERSION_PATH]?.get?.responses?.["304"]?.headers?.ETag);
  assert.deepEqual(document.components.schemas.ApiVersionResponse.required, ["requestId", "service", "version"]);
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
