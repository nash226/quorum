import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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
  assert.equal(scripts.verify, "npm run dev -- verify");
  assert.equal(scripts["verify-batch"], "npm run dev -- verify-batch");
  assert.equal(scripts.formats, "npm run dev -- formats");
  assert.equal(scripts.evaluate, "npm run dev -- evaluate");
  assert.equal(scripts["import-review"], "npm run dev -- import-review");
  assert.equal(scripts.smoke, "node scripts/smoke-check.mjs");
  assert.equal(scripts.openapi, "npm run dev -- openapi");
  assert.equal(scripts["review-queue"], "npm run dev -- review-queue");
  assert.equal(scripts["package:smoke"], "node scripts/package-smoke-check.mjs");
  assert.equal(scripts["evaluate:ci"], "npm run dev -- evaluate --fixture-dir examples/evaluations --min-score 0.95 --fail-on-mismatch");
  assert.equal(scripts.serve, "npm run dev -- serve");
  assert.equal(scripts["status:refresh"], "node scripts/update-status.mjs");
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
