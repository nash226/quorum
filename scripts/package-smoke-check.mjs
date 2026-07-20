import { execFileSync } from "node:child_process";

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [packageResult] = JSON.parse(output);
const files = new Set(packageResult?.files?.map(({ path }) => path) ?? []);
const requiredFiles = ["README.md", "dist/src/index.js", "dist/src/api-server.js", "dist/src/cli.js"];
const missingFiles = requiredFiles.filter((file) => !files.has(file));

if (missingFiles.length > 0) {
  throw new Error(`Package artifact is missing required files: ${missingFiles.join(", ")}`);
}

const packageRoot = new URL("../", import.meta.url);
const libraryEntry = await import(new URL("dist/src/index.js", packageRoot));
const serverEntry = await import(new URL("dist/src/api-server.js", packageRoot));

if (typeof libraryEntry.verifyAnswer !== "function" || typeof libraryEntry.createApiServer !== "function") {
  throw new Error("Package artifact root entry point is missing required library exports.");
}

if (typeof serverEntry.createApiServer !== "function" || typeof serverEntry.startApiServer !== "function") {
  throw new Error("Package artifact server entry point is missing required server exports.");
}

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
