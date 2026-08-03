import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("README documentation links resolve to files in the repository", async () => {
  const readmePath = resolve("README.md");
  const readme = await readFile(readmePath, "utf8");
  const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => target && !target.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(target));

  assert.ok(links.length > 0, "README should contain local documentation links");

  for (const target of links) {
    const fileTarget = target.split("#", 1)[0];
    await access(resolve(readmePath, "..", fileTarget));
  }
});
