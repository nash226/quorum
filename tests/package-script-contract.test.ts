import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package scripts keep the documented repository check gate intact", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const scripts = packageJson.scripts ?? {};

  assert.equal(scripts.check, "npm test && npm run build && npm run smoke && npm run package:smoke && npm run evaluate:ci");
  assert.equal(scripts.smoke, "node scripts/smoke-check.mjs");
  assert.equal(scripts["package:smoke"], "node scripts/package-smoke-check.mjs");
  assert.equal(scripts["evaluate:ci"], "npm run dev -- evaluate --fixture-dir examples/evaluations --min-score 0.95 --fail-on-mismatch");
});
