import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
const cliPath = new URL("dist/src/cli.js", packageRoot);

if (typeof libraryEntry.verifyAnswer !== "function" || typeof libraryEntry.createApiServer !== "function") {
  throw new Error("Package artifact root entry point is missing required library exports.");
}

if (typeof serverEntry.createApiServer !== "function" || typeof serverEntry.startApiServer !== "function") {
  throw new Error("Package artifact server entry point is missing required server exports.");
}

const cliVersion = JSON.parse(execFileSync(process.execPath, [fileURLToPath(cliPath), "version", "--json"], { encoding: "utf8" }));
if (cliVersion.service !== "quorum" || cliVersion.version !== packageJson.version) {
  throw new Error("Package artifact CLI did not return the expected version contract.");
}

for (const versionFlag of ["--version", "-v"]) {
  const versionOutput = execFileSync(process.execPath, [fileURLToPath(cliPath), versionFlag], { encoding: "utf8" });
  if (versionOutput !== `quorum ${packageJson.version}\n`) {
    throw new Error(`Package artifact CLI did not preserve the ${versionFlag} version alias.`);
  }
}

const cliHelp = execFileSync(process.execPath, [fileURLToPath(cliPath), "--help"], { encoding: "utf8" });
if (!cliHelp.startsWith("Quorum\n\nUsage:") || !cliHelp.includes("quorum verify") || !cliHelp.includes("quorum serve")) {
  throw new Error("Package artifact CLI did not return the expected help contract.");
}

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
