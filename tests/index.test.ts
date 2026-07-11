import assert from "node:assert/strict";
import test from "node:test";
import { extractClaims } from "../src/index.js";

test("public package entrypoint exports the claim extractor", () => {
  assert.deepEqual(
    extractClaims(`# Policy\n\n- Employees receive 12 weeks of paid parental leave.`),
    [{ id: "claim_1", text: "Employees receive 12 weeks of paid parental leave." }],
  );
});
