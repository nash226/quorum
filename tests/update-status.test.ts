import assert from "node:assert/strict";
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
  const shipments = loadRecentShipments("origin/main");

  assert.ok(shipments.length > 0);
  assert.equal(shipments[0]?.title, "feat: read pdf source metadata");
  assert.equal(shipments[0]?.prNumber, "72");
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
