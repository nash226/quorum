import { execFileSync } from "node:child_process";

const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const [packageResult] = JSON.parse(output);
const files = new Set(packageResult?.files?.map(({ path }) => path) ?? []);
const requiredFiles = ["README.md", "dist/src/index.js", "dist/src/api-server.js", "dist/src/cli.js"];
const missingFiles = requiredFiles.filter((file) => !files.has(file));

if (missingFiles.length > 0) {
  throw new Error(`Package artifact is missing required files: ${missingFiles.join(", ")}`);
}

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
