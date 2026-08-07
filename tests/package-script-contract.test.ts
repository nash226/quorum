import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { API_VERSION } from "../src/api-server.js";
import { ANSWER_EXTENSIONS, SOURCE_EXTENSIONS } from "../src/workflow.js";

const execFileAsync = promisify(execFile);

test("package scripts keep the documented repository check gate intact", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};

  assert.equal(scripts.check, "npm test && npm run build && npm run smoke && npm run package:smoke && npm run evaluate:ci");
  assert.equal(scripts["extract-claims"], "npm run dev -- extract-claims");
  assert.equal(scripts.verify, "npm run dev -- verify");
  assert.equal(scripts["verify-batch"], "npm run dev -- verify-batch");
  assert.equal(scripts.formats, "npm run dev -- formats");
  assert.equal(scripts.evaluate, "npm run dev -- evaluate");
  assert.equal(scripts["import-review"], "npm run dev -- import-review");
  assert.equal(scripts.smoke, "node scripts/smoke-check.mjs");
  assert.equal(scripts.openapi, "npm run dev -- openapi");
  assert.equal(scripts["review-queue"], "npm run dev -- review-queue");
  assert.equal(scripts["package:smoke"], "npm run build && node scripts/package-smoke-check.mjs");
  assert.equal(scripts["evaluate:ci"], "npm run dev -- evaluate --fixture-dir examples/evaluations --min-score 0.95 --fail-on-mismatch");
  assert.equal(scripts.serve, "npm run dev -- serve");
  assert.equal(scripts.version, "npm run dev -- version");
  assert.equal(scripts["status:refresh"], "node scripts/update-status.mjs");
});

test("version package script forwards JSON contract probes", async () => {
  const { stdout } = await execFileAsync("npm", ["run", "--silent", "version", "--", "--json"], {
    cwd: new URL("..", import.meta.url),
    maxBuffer: 1024 * 1024,
  });
  const version = JSON.parse(stdout) as { service: string; version: string };

  assert.deepEqual(version, { service: "quorum", version: API_VERSION });
});

test("formats package script exposes the machine-readable input contract", async () => {
  const { stdout } = await execFileAsync("npm", ["run", "--silent", "formats", "--", "--json"], {
    cwd: new URL("..", import.meta.url),
    maxBuffer: 1024 * 1024,
  });
  const formats = JSON.parse(stdout) as { version: string; sources: string[]; answers: string[] };

  assert.equal(formats.version, API_VERSION);
  assert.deepEqual(formats.sources, [...SOURCE_EXTENSIONS].sort());
  assert.deepEqual(formats.answers, [...ANSWER_EXTENSIONS].sort());
});

test("formats package script forwards command-specific help flags", async () => {
  const { stdout } = await execFileAsync("npm", ["run", "--silent", "formats", "--", "--help"], {
    cwd: new URL("..", import.meta.url),
    maxBuffer: 1024 * 1024,
  });

  assert.match(stdout, /Usage:\s+quorum formats \[--json\]/);
  assert.match(stdout, /Print the extensions discovered/);
});

test("extract-claims package script forwards command-specific help flags", async () => {
  const { stdout } = await execFileAsync("npm", ["run", "--silent", "extract-claims", "--", "--help"], {
    cwd: new URL("..", import.meta.url),
    maxBuffer: 1024 * 1024,
  });

  assert.match(stdout, /Usage:\s+quorum extract-claims/);
  assert.match(stdout, /--answer <path\|->/);
  assert.match(stdout, /--result-json/);
});

test("import-review package script forwards command-specific help flags", async () => {
  const { stdout } = await execFileAsync("npm", ["run", "--silent", "import-review", "--", "--help"], {
    cwd: new URL("..", import.meta.url),
    maxBuffer: 1024 * 1024,
  });
  assert.match(stdout, /Usage:\s+quorum import-review/);
  assert.match(stdout, /--review-csv <path\|->/);
});

test("openapi package script forwards export arguments", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "quorum-openapi-wrapper-"));
  try {
    const outputPath = join(tempDir, "openapi.json");
    const { stdout } = await execFileAsync("npm", ["run", "--silent", "openapi", "--", "--server-url", "https://quorum.example.test", "--out", outputPath], {
      cwd: new URL("..", import.meta.url),
      maxBuffer: 1024 * 1024,
    });
    const openApi = JSON.parse(await readFile(outputPath, "utf8")) as { openapi: string; servers?: Array<{ url: string }> };

    assert.match(stdout, /OpenAPI document written to/);
    assert.equal(openApi.openapi, "3.1.0");
    assert.deepEqual(openApi.servers, [{ url: "https://quorum.example.test" }]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("serve package script forwards command-specific help flags", async () => {
  const { stdout } = await execFileAsync("npm", ["run", "--silent", "serve", "--", "--help"], {
    cwd: new URL("..", import.meta.url),
    maxBuffer: 1024 * 1024,
  });

  assert.match(stdout, /Usage:\s+quorum serve/);
  assert.match(stdout, /--port <port>/);
});
