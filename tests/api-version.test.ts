import assert from "node:assert/strict";
import test from "node:test";
import {
  API_VERSION,
  VERSION_PATH,
  createOpenApiDocument,
  startApiServer,
} from "../src/index.js";

test("HTTP API exposes a dedicated machine-readable version endpoint", async () => {
  const api = await startApiServer({ host: "127.0.0.1", port: 0 });

  try {
    const response = await fetch(`${api.url}${VERSION_PATH}`);
    assert.equal(response.status, 200);
    const payload = await response.json() as { requestId: string; service: string; version: string };
    assert.equal(payload.requestId, response.headers.get("x-quorum-request-id"));
    assert.deepEqual({ ...payload, requestId: "" }, { requestId: "", service: "quorum", version: API_VERSION });

    const headResponse = await fetch(`${api.url}${VERSION_PATH}`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(await headResponse.text(), "");
  } finally {
    await api.close();
  }
});

test("OpenAPI documents the version endpoint", () => {
  const document = createOpenApiDocument() as {
    paths: Record<string, { get?: { operationId?: string }; head?: { operationId?: string } }>;
    components: { schemas: Record<string, { required?: string[] }> };
  };

  assert.equal(document.paths[VERSION_PATH]?.get?.operationId, "getVersion");
  assert.equal(document.paths[VERSION_PATH]?.head?.operationId, "headVersion");
  assert.deepEqual(document.components.schemas.ApiVersionResponse.required, ["requestId", "service", "version"]);
});
