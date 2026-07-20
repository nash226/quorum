import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [packageResult] = JSON.parse(output);
const files = new Set(packageResult?.files?.map(({ path }) => path) ?? []);
const binFiles = typeof packageJson.bin === "string" ? [packageJson.bin] : Object.values(packageJson.bin ?? {});
const declaredFiles = [packageJson.main, packageJson.types, ...Object.values(packageJson.exports ?? {}).flatMap((entry) =>
  typeof entry === "string" ? [entry] : Object.values(entry),
), ...binFiles];
const requiredFiles = ["README.md", ...declaredFiles.map((file) => file.replace(/^\.\//, ""))];
const missingFiles = requiredFiles.filter((file) => !files.has(file));

if (missingFiles.length > 0) {
  throw new Error(`Package artifact is missing declared files: ${missingFiles.join(", ")}`);
}

const packageRoot = new URL("../", import.meta.url);
const libraryEntry = await import(new URL("dist/src/index.js", packageRoot));
const serverEntry = await import(new URL("dist/src/api-server.js", packageRoot));

const requiredLibraryFunctions = [
  "verifyAnswer",
  "extractClaims",
  "verifyAnswerContentsResult",
  "verifyAnswersResult",
  "evaluateFixturesResult",
  "importReviewerDecisionsResult",
  "renderTextReport",
  "renderSummaryCsv",
  "parseSource",
];
const missingLibraryFunctions = requiredLibraryFunctions.filter((name) => typeof libraryEntry[name] !== "function");

if (missingLibraryFunctions.length > 0 || typeof libraryEntry.createApiServer !== "function") {
  throw new Error(
    `Package artifact root entry point is missing required library exports: ${[
      ...missingLibraryFunctions,
      ...(typeof libraryEntry.createApiServer === "function" ? [] : ["createApiServer"]),
    ].join(", ")}`,
  );
}

if (typeof serverEntry.createApiServer !== "function" || typeof serverEntry.startApiServer !== "function") {
  throw new Error("Package artifact server entry point is missing required server exports.");
}

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
