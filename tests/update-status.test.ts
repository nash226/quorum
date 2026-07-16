import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// @ts-ignore Script module has no emitted TypeScript declarations.
import { branchNameFromHistoryRef, loadRecentShipments, renderStatusDocument, resolveStatusHistoryRef } from "../scripts/update-status.mjs";

test("resolveStatusHistoryRef prefers the remote default branch ref", () => {
  const historyRef = resolveStatusHistoryRef();

  assert.match(historyRef, /^(origin\/\w+|HEAD)$/);
  assert.notEqual(historyRef, "main");
});

test("branchNameFromHistoryRef returns the branch segment", () => {
  assert.equal(branchNameFromHistoryRef("origin/main"), "main");
  assert.equal(branchNameFromHistoryRef("HEAD"), "HEAD");
});

test("loadRecentShipments reads the supplied history ref", () => {
  const shipments = loadRecentShipments("HEAD");
  const latestShipmentShortCommit = execFileSync(
    "git",
    [
      "log",
      "--first-parent",
      "--date=short",
      "--grep=^docs: refresh status page$",
      "--invert-grep",
      "--pretty=format:%h",
      "-1",
      "HEAD",
    ],
    {
      encoding: "utf8",
    },
  ).trim();

  assert.ok(latestShipmentShortCommit);

  assert.ok(shipments.length > 0);
  assert.equal(shipments[0]?.shortCommit, latestShipmentShortCommit);
  assert.match(shipments[0]?.title ?? "", /\S/);
});

test("renderStatusDocument includes the supplied branch and shipment summary", () => {
  const document = renderStatusDocument({
    defaultBranch: "main",
    latestShipment: {
      shortCommit: "abc1234",
      date: "2026-07-01",
      title: "sample shipment",
    },
    readmeCapabilities: ["first capability"],
    recentShipments: [
      {
        date: "2026-07-01",
        prNumber: "99",
        shortCommit: "abc1234",
        title: "sample shipment",
      },
    ],
    repoUrl: "https://github.com/example/quorum",
    roadmapNow: ["now item"],
    roadmapNext: ["next item"],
  });

  assert.match(document, /Default branch: `main`/);
  assert.match(document, /Latest shipped change: `abc1234` on 2026-07-01, sample shipment/);
  assert.match(document, /\[#99\]\(https:\/\/github.com\/example\/quorum\/pull\/99\)/);
});

test("status refresh reads capabilities from the CLI guide", () => {
  execFileSync("npm", ["run", "status:refresh"], { encoding: "utf8" });

  const status = readFileSync("docs/status.md", "utf8");
  assert.match(status, /^- read Markdown, text, HTML, PDF, and DOCX answers and approved sources$/m);
  assert.doesNotMatch(status, /Missing section "What It Does"/);
});

test("README benchmark inventory matches checked-in evaluation fixtures", () => {
  function countFixtures(directory: string): number {
    return readdirSync(directory, { withFileTypes: true }).reduce(
      (count, entry) =>
        entry.isDirectory()
          ? count + countFixtures(join(directory, entry.name))
          : count + (entry.name.endsWith(".json") ? 1 : 0),
      0,
    );
  }

  const fixtureCount = countFixtures("examples/evaluations");
  const readme = readFileSync("README.md", "utf8");

  assert.match(
    readme,
    new RegExp(`The checked-in ${fixtureCount}-fixture benchmark`),
  );
});
