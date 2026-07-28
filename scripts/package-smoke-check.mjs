import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
const repoRoot = fileURLToPath(packageRoot);
const libraryEntry = await import(new URL("dist/src/index.js", packageRoot));
const serverEntry = await import(new URL("dist/src/api-server.js", packageRoot));
const cliPath = new URL("dist/src/cli.js", packageRoot);

const expectedSourceExtensions = [...libraryEntry.SOURCE_EXTENSIONS].sort();
const expectedAnswerExtensions = [...libraryEntry.ANSWER_EXTENSIONS].sort();
const formatExtensions = (extensions) => [...extensions].sort().join(", ");

const formatsOutput = execFileSync("node", [fileURLToPath(cliPath), "formats"], { encoding: "utf8" });
const sourceFormatLine = formatsOutput.match(/^Source files: (.+)$/m)?.[1] ?? "";
const answerFormatLine = formatsOutput.match(/^Answer files: (.+)$/m)?.[1] ?? "";
if (
  sourceFormatLine !== formatExtensions(expectedSourceExtensions) ||
  answerFormatLine !== formatExtensions(expectedAnswerExtensions)
) {
  throw new Error("Package artifact CLI formats output drifted from the library input contract.");
}

const formatsJsonOutput = execFileSync("node", [fileURLToPath(cliPath), "formats", "--json"], {
  encoding: "utf8",
});
const formatsJson = JSON.parse(formatsJsonOutput);
if (
  JSON.stringify(formatsJson.sources) !== JSON.stringify([...expectedSourceExtensions].sort()) ||
  JSON.stringify(formatsJson.answers) !== JSON.stringify([...expectedAnswerExtensions].sort())
) {
  throw new Error("Package artifact CLI JSON formats output drifted from the library input contract.");
}

for (const versionFlag of ["--version", "-v"]) {
  const versionOutput = execFileSync("node", [fileURLToPath(cliPath), versionFlag], { encoding: "utf8" }).trim();
  if (versionOutput !== `quorum ${packageJson.version}`) {
    throw new Error(`Package artifact did not preserve the ${versionFlag} version probe contract.`);
  }
}

if (
  typeof libraryEntry.verifyAnswer !== "function" ||
  typeof libraryEntry.verifyAnswerFileInputs !== "function" ||
  typeof libraryEntry.createApiServer !== "function" ||
  libraryEntry.API_VERSION !== packageJson.version
) {
  throw new Error("Package artifact root entry point is missing required library exports or version contract.");
}

const emptySourcePackageDir = mkdtempSync(join(tmpdir(), "quorum-package-empty-sources-"));
try {
  const answerPath = join(emptySourcePackageDir, "answer.md");
  const sourceDir = join(emptySourcePackageDir, "sources");
  mkdirSync(sourceDir);
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  await libraryEntry.verifyAnswerFileInputs({ answerPath, sourcePaths: [], sourceDirs: [sourceDir] });
  throw new Error("Package artifact accepted an empty approved source directory.");
} catch (error) {
  if (!String(error?.message ?? error).includes("No approved source files found in")) {
    throw error;
  }
} finally {
  rmSync(emptySourcePackageDir, { recursive: true, force: true });
}

const cliBatchPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-batch-"));
try {
  const answerDir = join(cliBatchPackageDir, "answers", "nested");
  const sourceDir = join(cliBatchPackageDir, "sources", "nested");
  mkdirSync(answerDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(answerDir, "answer.md"), "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(
    join(sourceDir, "policy.json"),
    JSON.stringify({ policy: "Employees receive 12 weeks of paid parental leave." }),
  );

  const batchOutput = execFileSync(
    "node",
    [
      fileURLToPath(cliPath),
      "verify-batch",
      "--answer-dir",
      join(cliBatchPackageDir, "answers"),
      "--source-dir",
      join(cliBatchPackageDir, "sources"),
      "--json",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const batchPayload = JSON.parse(batchOutput);
  if (
    batchPayload.summary?.answersWithClaims !== 1 ||
    batchPayload.summary?.answersWithoutClaims !== 0 ||
    batchPayload.answers?.[0]?.answerPath !== join(answerDir, "answer.md") ||
    batchPayload.answers?.[0]?.report?.sources?.[0]?.sourcePath !== join(sourceDir, "policy.json") ||
    batchPayload.answers?.[0]?.report?.sources?.[0]?.title !== "policy"
  ) {
    throw new Error("Package artifact did not preserve JSON source discovery in the packaged CLI contract.");
  }
} finally {
  rmSync(cliBatchPackageDir, { recursive: true, force: true });
}

const cliJsonlPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-jsonl-"));
try {
  const answerPath = join(cliJsonlPackageDir, "answer.jsonl");
  const sourcePath = join(cliJsonlPackageDir, "policy.jsonl");
  writeFileSync(answerPath, '{"claim":"Employees receive 12 weeks of paid parental leave."}\n');
  writeFileSync(sourcePath, '{"title":"Parental Leave Policy","claim":"Employees receive 12 weeks of paid parental leave."}\n');

  const jsonlOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const jsonlPayload = JSON.parse(jsonlOutput);
  if (
    jsonlPayload.summary?.verified !== 1 ||
    jsonlPayload.answerPath !== answerPath ||
    jsonlPayload.sources?.[0]?.title !== "Parental Leave Policy" ||
    jsonlPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected JSONL answer/source contract.");
  }
} finally {
  rmSync(cliJsonlPackageDir, { recursive: true, force: true });
}

const cliLogPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-log-"));
try {
  const answerPath = join(cliLogPackageDir, "answer.log");
  const sourcePath = join(cliLogPackageDir, "policy.log");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "Employees receive 12 weeks of paid parental leave.\n");

  const logOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const logPayload = JSON.parse(logOutput);
  if (
    logPayload.summary?.verified !== 1 ||
    logPayload.answerPath !== answerPath ||
    logPayload.sources?.[0]?.title !== "policy" ||
    logPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected log answer/source contract.");
  }
} finally {
  rmSync(cliLogPackageDir, { recursive: true, force: true });
}

const cliTextilePackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-textile-"));
try {
  const answerPath = join(cliTextilePackageDir, "answer.textile");
  const sourcePath = join(cliTextilePackageDir, "policy.textile");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "Employees receive 12 weeks of paid parental leave.\n");

  const textileOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const textilePayload = JSON.parse(textileOutput);
  if (
    textilePayload.summary?.verified !== 1 ||
    textilePayload.answerPath !== answerPath ||
    textilePayload.sources?.[0]?.title !== "policy" ||
    textilePayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected Textile answer/source contract.");
  }
} finally {
  rmSync(cliTextilePackageDir, { recursive: true, force: true });
}

const cliXhtmlPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-xhtml-"));
try {
  const answerPath = join(cliXhtmlPackageDir, "answer.xhtml");
  const sourcePath = join(cliXhtmlPackageDir, "policy.xhtml");
  writeFileSync(
    answerPath,
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Customers can request refunds within 30 days.</p></body></html>',
  );
  writeFileSync(
    sourcePath,
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Refund Policy</title></head><body><p>Customers can request refunds within 30 days.</p></body></html>',
  );

  const xhtmlOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const xhtmlPayload = JSON.parse(xhtmlOutput);
  if (
    xhtmlPayload.summary?.verified !== 1 ||
    xhtmlPayload.sources?.[0]?.title !== "Refund Policy" ||
    xhtmlPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected XHTML source contract.");
  }
} finally {
  rmSync(cliXhtmlPackageDir, { recursive: true, force: true });
}

const cliAsciiDocPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-asciidoc-"));
try {
  const answerPath = join(cliAsciiDocPackageDir, "answer.asciidoc");
  const sourcePath = join(cliAsciiDocPackageDir, "policy.adoc");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "= Parental Leave Policy\n\nEmployees receive 12 weeks of paid parental leave.\n");

  const asciidocOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const asciidocPayload = JSON.parse(asciidocOutput);
  if (
    asciidocPayload.summary?.verified !== 1 ||
    asciidocPayload.answerPath !== answerPath ||
    asciidocPayload.sources?.[0]?.title !== "policy" ||
    asciidocPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected AsciiDoc answer/source contract.");
  }
} finally {
  rmSync(cliAsciiDocPackageDir, { recursive: true, force: true });
}

const cliLatexPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-latex-"));
try {
  const answerPath = join(cliLatexPackageDir, "answer.tex");
  const sourcePath = join(cliLatexPackageDir, "policy.tex");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "\\section{Parental Leave Policy}\nEmployees receive 12 weeks of paid parental leave.\n");

  const latexOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const latexPayload = JSON.parse(latexOutput);
  if (
    latexPayload.summary?.verified !== 1 ||
    latexPayload.answerPath !== answerPath ||
    latexPayload.sources?.[0]?.title !== "policy" ||
    latexPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected LaTeX answer/source contract.");
  }
} finally {
  rmSync(cliLatexPackageDir, { recursive: true, force: true });
}

const cliXmlSourcePackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-xml-source-"));
try {
  const answerPath = join(cliXmlSourcePackageDir, "answer.md");
  const sourcePath = join(cliXmlSourcePackageDir, "policy.xml");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(
    sourcePath,
    '<?xml version="1.0"?><policy><title>Parental Leave Policy</title><rule>Employees receive 12 weeks of paid parental leave.</rule></policy>',
  );

  const xmlSourceOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const xmlSourcePayload = JSON.parse(xmlSourceOutput);
  if (
    xmlSourcePayload.summary?.verified !== 1 ||
    xmlSourcePayload.sources?.[0]?.title !== "Parental Leave Policy" ||
    xmlSourcePayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected XML source contract.");
  }
} finally {
  rmSync(cliXmlSourcePackageDir, { recursive: true, force: true });
}

const cliPropertiesPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-properties-"));
try {
  const answerPath = join(cliPropertiesPackageDir, "answer.properties");
  const sourcePath = join(cliPropertiesPackageDir, "policy.properties");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "Employees receive 12 weeks of paid parental leave.\n");

  const propertiesOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const propertiesPayload = JSON.parse(propertiesOutput);
  if (
    propertiesPayload.summary?.verified !== 1 ||
    propertiesPayload.answerPath !== answerPath ||
    propertiesPayload.sources?.[0]?.title !== "policy" ||
    propertiesPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected properties answer/source contract.");
  }
} finally {
  rmSync(cliPropertiesPackageDir, { recursive: true, force: true });
}

const cliCsvPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-csv-"));
try {
  const answerPath = join(cliCsvPackageDir, "answer.csv");
  const sourcePath = join(cliCsvPackageDir, "policy.csv");
  writeFileSync(answerPath, "claim\nEmployees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "policy\nEmployees receive 12 weeks of paid parental leave.\n");

  const csvOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const csvPayload = JSON.parse(csvOutput);
  if (
    csvPayload.summary?.verified !== 1 ||
    csvPayload.answerPath !== answerPath ||
    csvPayload.sources?.[0]?.title !== "policy" ||
    csvPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected CSV answer/source contract.");
  }
} finally {
  rmSync(cliCsvPackageDir, { recursive: true, force: true });
}

const cliTsvPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-tsv-"));
try {
  const answerPath = join(cliTsvPackageDir, "answer.tsv");
  const sourcePath = join(cliTsvPackageDir, "policy.tsv");
  writeFileSync(answerPath, "claim\tcontext\nEmployees receive 12 weeks of paid parental leave.\tHR\n");
  writeFileSync(sourcePath, "policy\towner\nEmployees receive 12 weeks of paid parental leave.\tPeople Ops\n");

  const tsvOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const tsvPayload = JSON.parse(tsvOutput);
  if (
    tsvPayload.summary?.verified !== 1 ||
    tsvPayload.answerPath !== answerPath ||
    tsvPayload.sources?.[0]?.title !== "policy" ||
    tsvPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected TSV answer/source contract.");
  }
} finally {
  rmSync(cliTsvPackageDir, { recursive: true, force: true });
}

const cliIniPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-ini-"));
try {
  const answerPath = join(cliIniPackageDir, "answer.ini");
  const sourcePath = join(cliIniPackageDir, "policy.ini");
  writeFileSync(answerPath, "claim=Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(sourcePath, "policy=Employees receive 12 weeks of paid parental leave.\n");

  const iniOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const iniPayload = JSON.parse(iniOutput);
  if (
    iniPayload.summary?.verified !== 1 ||
    iniPayload.answerPath !== answerPath ||
    iniPayload.sources?.[0]?.title !== "policy" ||
    iniPayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected INI answer/source contract.");
  }
} finally {
  rmSync(cliIniPackageDir, { recursive: true, force: true });
}

const cliTomlSourcePackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-toml-source-"));
try {
  const answerPath = join(cliTomlSourcePackageDir, "answer.md");
  const sourcePath = join(cliTomlSourcePackageDir, "policy.toml");
  writeFileSync(answerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(
    sourcePath,
    'title = "Parental Leave Policy"\n[policy]\nrule = "Employees receive 12 weeks of paid parental leave."\n',
  );

  const tomlSourceOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const tomlSourcePayload = JSON.parse(tomlSourceOutput);
  if (
    tomlSourcePayload.summary?.verified !== 1 ||
    tomlSourcePayload.sources?.[0]?.title !== "Parental Leave Policy" ||
    tomlSourcePayload.sources?.[0]?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not verify the expected TOML source contract.");
  }
} finally {
  rmSync(cliTomlSourcePackageDir, { recursive: true, force: true });
}

const cliFrontmatterPackageDir = mkdtempSync(join(tmpdir(), "quorum-package-cli-frontmatter-"));
try {
  const answerPath = join(cliFrontmatterPackageDir, "answer.md");
  const sourcePath = join(cliFrontmatterPackageDir, "policy.md");
  writeFileSync(
    answerPath,
    "---\ntitle: Agent answer\n---\n\nEmployees receive 12 weeks of paid parental leave.\n",
  );
  writeFileSync(
    sourcePath,
    "---\ntitle: Parental Leave Policy\nupdated_at: 2026-07-27\ntrust_level: high\n---\n\nEmployees receive 12 weeks of paid parental leave.\n",
  );

  const frontmatterOutput = execFileSync(
    "node",
    [fileURLToPath(cliPath), "verify", "--answer", answerPath, "--source", sourcePath, "--json"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const frontmatterPayload = JSON.parse(frontmatterOutput);
  const frontmatterSource = frontmatterPayload.sources?.[0];
  if (
    frontmatterPayload.summary?.verified !== 1 ||
    frontmatterPayload.answerPath !== answerPath ||
    frontmatterPayload.assessments?.[0]?.claim?.text !== "Employees receive 12 weeks of paid parental leave." ||
    frontmatterSource?.title !== "Parental Leave Policy" ||
    frontmatterSource?.updatedAt !== "2026-07-27" ||
    frontmatterSource?.trustLevel !== "high" ||
    frontmatterSource?.sourcePath !== sourcePath
  ) {
    throw new Error("Package artifact did not preserve the expected Markdown front matter contract.");
  }
} finally {
  rmSync(cliFrontmatterPackageDir, { recursive: true, force: true });
}

if (typeof serverEntry.createApiServer !== "function" || typeof serverEntry.startApiServer !== "function") {
  throw new Error("Package artifact server entry point is missing required server exports.");
}

const packagedServer = await serverEntry.startApiServer({ port: 0 });
try {
  const discoveryResponse = await fetch(packagedServer.url, {
    headers: { "X-Quorum-Request-Id": "packaged-discovery" },
  });
  const discoveryPayload = await discoveryResponse.json();
  if (
    discoveryResponse.status !== 200 ||
    discoveryPayload.requestId !== "packaged-discovery" ||
    discoveryResponse.headers.get("x-quorum-request-id") !== "packaged-discovery" ||
    discoveryPayload.service !== "quorum" ||
    discoveryPayload.openapiPath !== "/openapi.json" ||
    !Array.isArray(discoveryPayload.endpoints) ||
    !discoveryPayload.endpoints.some(({ method, path }) => method === "POST" && path === "/verify")
  ) {
    throw new Error("Package artifact server did not serve the expected discovery contract.");
  }

  const discoveryHeadResponse = await fetch(packagedServer.url, { method: "HEAD" });
  if (discoveryHeadResponse.status !== 200 || (await discoveryHeadResponse.text()) !== "") {
    throw new Error("Package artifact server did not preserve the bodyless discovery HEAD contract.");
  }

  for (const path of ["/", "/capabilities", "/version", "/openapi.json"]) {
    const headResponse = await fetch(`${packagedServer.url}${path}`, { method: "HEAD" });
    const etag = headResponse.headers.get("etag");
    if (headResponse.status !== 200 || !etag || (await headResponse.text()) !== "") {
      throw new Error(`Package artifact server did not expose a cacheable bodyless HEAD response for ${path}.`);
    }

    const revalidatedResponse = await fetch(`${packagedServer.url}${path}`, {
      method: "HEAD",
      headers: { "if-none-match": etag },
    });
    if (revalidatedResponse.status !== 304 || revalidatedResponse.headers.get("etag") !== etag || (await revalidatedResponse.text()) !== "") {
      throw new Error(`Package artifact server did not preserve conditional HEAD revalidation for ${path}.`);
    }
  }

  const versionResponse = await fetch(`${packagedServer.url}/version`);
  if (versionResponse.status !== 200 || (await versionResponse.json()).service !== "quorum") {
    throw new Error("Package artifact server did not serve the expected version contract.");
  }

  const openApiResponse = await fetch(`${packagedServer.url}/openapi.json`);
  const openApiDocument = await openApiResponse.json();
  if (openApiResponse.status !== 200 || openApiDocument.openapi !== "3.1.0" || !openApiDocument.paths?.["/verify"]) {
    throw new Error("Package artifact server did not serve the expected OpenAPI contract.");
  }

  const capabilitiesResponse = await fetch(`${packagedServer.url}/capabilities`);
  const capabilitiesPayload = await capabilitiesResponse.json();
  if (
    capabilitiesResponse.status !== 200 ||
    capabilitiesPayload.service !== "quorum" ||
    capabilitiesPayload.capabilities?.maxRequestBytes !== 1_048_576 ||
    capabilitiesPayload.capabilities?.requestTimeoutMs !== 30_000 ||
    JSON.stringify(capabilitiesPayload.capabilities?.sourceExtensions) !== JSON.stringify(expectedSourceExtensions) ||
    JSON.stringify(capabilitiesPayload.capabilities?.answerExtensions) !== JSON.stringify(expectedAnswerExtensions) ||
    JSON.stringify(capabilitiesPayload.capabilities?.trustLevels) !== JSON.stringify(["low", "medium", "high"]) ||
    !Array.isArray(capabilitiesPayload.capabilities?.reviewQueueStatuses) ||
    !capabilitiesPayload.capabilities.reviewQueueStatuses.includes("no_claims")
  ) {
    throw new Error("Package artifact server did not serve the expected capabilities contract.");
  }

  for (const path of ["/", "/capabilities", "/health", "/readyz", "/livez", "/version", "/openapi.json"]) {
    const preflightResponse = await fetch(`${packagedServer.url}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://browser.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-quorum-request-id, if-none-match",
      },
    });
    if (
      preflightResponse.status !== 204 ||
      preflightResponse.headers.get("access-control-allow-origin") !== "*" ||
      preflightResponse.headers.get("access-control-allow-methods") !== "GET, HEAD, OPTIONS" ||
      preflightResponse.headers.get("access-control-allow-headers") !== "Content-Type, X-Quorum-Request-Id, If-None-Match" ||
      preflightResponse.headers.get("access-control-expose-headers")?.includes("X-Quorum-Request-Id") !== true ||
      preflightResponse.headers.get("access-control-max-age") !== "600" ||
      (await preflightResponse.text()) !== ""
    ) {
      throw new Error(`Package artifact server did not preserve the ${path} discovery CORS preflight contract.`);
    }
  }

  const postPaths = ["/extract-claims", "/verify", "/verify-batch", "/import-review", "/review-queue", "/evaluate"];
  for (const path of postPaths) {
    const preflightResponse = await fetch(`${packagedServer.url}${path}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://browser.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-quorum-request-id, if-none-match",
      },
    });
    if (
      preflightResponse.status !== 204 ||
      preflightResponse.headers.get("access-control-allow-origin") !== "*" ||
      preflightResponse.headers.get("access-control-allow-methods") !== "POST, OPTIONS" ||
      preflightResponse.headers.get("access-control-allow-headers") !== "Content-Type, X-Quorum-Request-Id, If-None-Match" ||
      preflightResponse.headers.get("access-control-expose-headers")?.includes("X-Quorum-Request-Id") !== true ||
      preflightResponse.headers.get("access-control-max-age") !== "600" ||
      (await preflightResponse.text()) !== ""
    ) {
      throw new Error(`Package artifact server did not preserve the ${path} CORS preflight contract.`);
    }
  }

  for (const path of ["/health", "/readyz", "/livez"]) {
    const probeResponse = await fetch(`${packagedServer.url}${path}`);
    const probePayload = await probeResponse.json();
    if (probeResponse.status !== 200 || probePayload.service !== "quorum" || probePayload.ok !== true) {
      throw new Error(`Package artifact server did not serve the expected ${path} probe contract.`);
    }

    const headProbeResponse = await fetch(`${packagedServer.url}${path}`, { method: "HEAD" });
    if (headProbeResponse.status !== 200 || (await headProbeResponse.text()) !== "") {
      throw new Error(`Package artifact server did not preserve the bodyless ${path} HEAD contract.`);
    }
  }

  for (const [path, query] of [["/healthz", "probe=readiness"], ["/readyz", "probe=kubernetes"]]) {
    const aliasResponse = await fetch(`${packagedServer.url}${path}?${query}`);
    const aliasPayload = await aliasResponse.json();
    if (aliasResponse.status !== 200 || aliasPayload.service !== "quorum" || aliasPayload.ok !== true) {
      throw new Error(`Package artifact server did not preserve the ${path} query probe contract.`);
    }
  }

  const verifyResponse = await fetch(`${packagedServer.url}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerLabel: "Packaged verification packet",
      sources: [{
        id: "hr-policy@2026-07-15",
        sourcePath: "policies/hr-policy.md",
        updatedAt: "2026-07-15",
        title: "HR Policy",
        trustLevel: "high",
        content: "---\ntitle: HR Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
      }],
    }),
  });
  const verifyPayload = await verifyResponse.json();
  const packagedSource = verifyPayload.report?.sources?.[0];
  if (
    verifyResponse.status !== 200 ||
    verifyPayload.shouldFail !== false ||
    verifyPayload.report?.summary?.verified !== 1 ||
    packagedSource?.id !== "hr-policy@2026-07-15" ||
    packagedSource?.sourcePath !== "policies/hr-policy.md" ||
    packagedSource?.title !== "HR Policy" ||
    packagedSource?.updatedAt !== "2026-07-15" ||
    packagedSource?.trustLevel !== "high"
  ) {
    throw new Error("Package artifact server did not verify the expected answer contract.");
  }

  const verifyBatchResponse = await fetch(`${packagedServer.url}/verify-batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: [
        { answer: "Employees receive 12 weeks of paid parental leave.", answerLabel: "Batch answer" },
        { answer: "   ", answerLabel: "Empty draft" },
      ],
      sources: [{
        sourcePath: "policies/hr-policy.md",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      }],
    }),
  });
  const verifyBatchPayload = await verifyBatchResponse.json();
  if (
    verifyBatchResponse.status !== 200 ||
    verifyBatchPayload.shouldFail !== false ||
    verifyBatchPayload.report?.summary?.answersWithClaims !== 1 ||
    verifyBatchPayload.report?.summary?.answersWithoutClaims !== 1
  ) {
    throw new Error("Package artifact server did not serve the expected batch verification contract.");
  }

  const verifyBatchFailPolicyResponse = await fetch(`${packagedServer.url}/verify-batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answers: [{ answer: "Employees receive 18 weeks of paid parental leave.", answerLabel: "Risky batch answer" }],
      sources: [{
        sourcePath: "policies/hr-policy.md",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      }],
      failOn: ["contradicted"],
      failOnStatus: true,
    }),
  });
  const verifyBatchFailPolicyPayload = await verifyBatchFailPolicyResponse.json();
  if (
    verifyBatchFailPolicyResponse.status !== 409 ||
    verifyBatchFailPolicyPayload.shouldFail !== true ||
    verifyBatchFailPolicyPayload.failVerdicts?.join(",") !== "contradicted" ||
    verifyBatchFailPolicyPayload.report?.summary?.answersWithFailures !== 1
  ) {
    throw new Error("Package artifact server did not preserve the batch fail-policy conflict contract.");
  }

  const failPolicyResponse = await fetch(`${packagedServer.url}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "Employees receive 18 weeks of paid parental leave.",
      sources: [{
        sourcePath: "policies/hr-policy.md",
        content: "Employees receive 12 weeks of paid parental leave.\n",
      }],
      failOn: ["contradicted"],
      failOnStatus: true,
    }),
  });
  const failPolicyPayload = await failPolicyResponse.json();
  if (
    failPolicyResponse.status !== 409 ||
    failPolicyPayload.shouldFail !== true ||
    failPolicyPayload.failVerdicts?.join(",") !== "contradicted"
  ) {
    throw new Error("Package artifact server did not preserve the fail-policy conflict contract.");
  }

  const extractClaimsResponse = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ answer: "1. Employees receive 12 weeks of paid parental leave." }),
  });
  const extractClaimsPayload = await extractClaimsResponse.json();
  if (
    extractClaimsResponse.status !== 200 ||
    extractClaimsPayload.claims?.length !== 1 ||
    extractClaimsPayload.claims[0]?.id !== "claim_1" ||
    extractClaimsPayload.claims[0]?.text !== "Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact server did not serve the expected claim preview contract.");
  }

  const markdownTableClaimsResponse = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "| Policy | Details |\n| --- | --- |\n| Parental leave | Employees receive 12 weeks of paid parental leave. |",
      answerPath: "answers/hr-table.md",
    }),
  });
  const markdownTableClaimsPayload = await markdownTableClaimsResponse.json();
  if (
    markdownTableClaimsResponse.status !== 200 ||
    markdownTableClaimsPayload.answerPath !== "answers/hr-table.md" ||
    markdownTableClaimsPayload.claims?.length !== 1 ||
    markdownTableClaimsPayload.claims[0]?.text !==
      "Parental leave: Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact server did not preserve Markdown table claim extraction.");
  }

  const labeledExtractClaimsResponse = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: "Employees receive 12 weeks of paid parental leave.",
      answerPath: "answers/hr-answer.md",
      answerLabel: "HR reviewer packet",
    }),
  });
  const labeledExtractClaimsPayload = await labeledExtractClaimsResponse.json();
  if (
    labeledExtractClaimsResponse.status !== 200 ||
    labeledExtractClaimsPayload.answerPath !== "answers/hr-answer.md" ||
    labeledExtractClaimsPayload.answerLabel !== "HR reviewer packet" ||
    labeledExtractClaimsPayload.claims?.length !== 1
  ) {
    throw new Error("Package artifact server did not preserve claim preview answer provenance.");
  }

  const extractClaimsBase64Response = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answerBase64: Buffer.from("Employees receive 12 weeks of paid parental leave.").toString("base64"),
      answerPath: "answers/hr-answer.txt",
    }),
  });
  const extractClaimsBase64Payload = await extractClaimsBase64Response.json();
  if (
    extractClaimsBase64Response.status !== 200 ||
    extractClaimsBase64Payload.claims?.length !== 1 ||
    extractClaimsBase64Payload.claims[0]?.id !== "claim_1" ||
    extractClaimsBase64Payload.claims[0]?.text !== "Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact server did not preserve base64 claim preview input.");
  }

  const emptyExtractClaimsResponse = await fetch(`${packagedServer.url}/extract-claims`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Quorum-Request-Id": "packaged-empty-claim-preview-contract",
    },
    body: JSON.stringify({ answer: "Thanks!" }),
  });
  const emptyExtractClaimsPayload = await emptyExtractClaimsResponse.json();
  if (
    emptyExtractClaimsResponse.status !== 200 ||
    emptyExtractClaimsPayload.requestId !== "packaged-empty-claim-preview-contract" ||
    emptyExtractClaimsPayload.answerHasClaims !== false ||
    emptyExtractClaimsPayload.claims?.length !== 0
  ) {
    throw new Error("Package artifact server did not preserve claim-less preview routing.");
  }

  const importReviewResponse = await fetch(`${packagedServer.url}/import-review`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Quorum-Request-Id": "packaged-review-import",
    },
    body: JSON.stringify({
      reviewCsvContent: [
        "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
        "Packaged reviewer packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation",
        "",
      ].join("\n"),
      failOn: ["needs_review"],
      includeArtifacts: ["summary_csv"],
    }),
  });
  const importReviewPayload = await importReviewResponse.json();
  if (
    importReviewResponse.status !== 200 ||
    importReviewPayload.requestId !== "packaged-review-import" ||
    importReviewResponse.headers.get("x-quorum-request-id") !== "packaged-review-import" ||
    importReviewPayload.shouldFail !== true ||
    importReviewPayload.report?.queueSummary?.reviewedAnswers !== 1 ||
    importReviewPayload.report?.summary?.needs_review !== 1 ||
    importReviewPayload.artifacts?.summary_csv?.includes("Packaged reviewer packet") !== true
  ) {
    throw new Error("Package artifact server did not serve the expected reviewer import contract.");
  }

  const reviewQueueResponse = await fetch(`${packagedServer.url}/review-queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reviewCsvContent: [
        "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
        "Packaged queue packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,verified,Approved by HR",
        "",
      ].join("\n"),
      queueStatus: "reviewed",
      domains: ["hr"],
      fixtures: [{
        fixturePath: join(repoRoot, "examples", "evaluations", "hr-policy.json"),
        content: readFileSync(join(repoRoot, "examples", "evaluations", "hr-policy.json"), "utf8"),
      }],
    }),
  });
  const reviewQueuePayload = await reviewQueueResponse.json();
  if (
    reviewQueueResponse.status !== 200 ||
    reviewQueuePayload.review?.totalAnswers !== 1 ||
    reviewQueuePayload.review?.reviewedAnswers !== 1 ||
    reviewQueuePayload.review?.verdicts?.verified !== 1 ||
    reviewQueuePayload.queueStatus !== "reviewed" ||
    reviewQueuePayload.domains?.length !== 1 ||
    reviewQueuePayload.domains[0] !== "hr" ||
    reviewQueuePayload.evaluation?.fixtureCount !== 1
  ) {
    throw new Error("Package artifact server did not serve the expected reviewer queue contract.");
  }

  const noClaimsQueueResponse = await fetch(`${packagedServer.url}/review-queue`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      reviewCsvContent: [
        "answer_label,answer_has_claims,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
        "Packaged empty draft,false,,,,,,,,",
        "",
      ].join("\n"),
      queueStatus: "no_claims",
    }),
  });
  const noClaimsQueuePayload = await noClaimsQueueResponse.json();
  if (
    noClaimsQueueResponse.status !== 200 ||
    noClaimsQueuePayload.review?.totalAnswers !== 1 ||
    noClaimsQueuePayload.review?.noClaimsAnswers !== 1 ||
    noClaimsQueuePayload.review?.totalClaims !== 0 ||
    noClaimsQueuePayload.queueStatus !== "no_claims"
  ) {
    throw new Error("Package artifact server did not preserve no-claims reviewer queue routing.");
  }

  const evaluationFixturePath = join(repoRoot, "examples", "evaluations", "hr-policy.json");
  const evaluationResponse = await fetch(`${packagedServer.url}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fixtures: [{
        fixturePath: evaluationFixturePath,
        content: readFileSync(evaluationFixturePath, "utf8"),
      }],
      domains: ["hr"],
      generatedAt: "2026-07-15T12:00:00.000Z",
    }),
  });
  const evaluationPayload = await evaluationResponse.json();
  if (
    evaluationResponse.status !== 200 ||
    evaluationPayload.scorecards?.length !== 1 ||
    evaluationPayload.scorecards[0]?.domain !== "hr" ||
    evaluationPayload.scorecards[0]?.score !== 1 ||
    evaluationPayload.summary?.fixtureCount !== 1 ||
    evaluationPayload.summary?.mismatchCount !== 0 ||
    evaluationPayload.scorecards[0]?.report?.generatedAt !== "2026-07-15T12:00:00.000Z"
  ) {
    throw new Error("Package artifact server did not preserve the expected evaluation contract.");
  }

  const mismatchedFixture = JSON.parse(readFileSync(evaluationFixturePath, "utf8"));
  mismatchedFixture.expectedClaimVerdicts = ["verified", "verified", "unsupported"];
  mismatchedFixture.expectedSummary = { verified: 2, contradicted: 0, unsupported: 1, needs_review: 0 };
  const evaluationFailureResponse = await fetch(`${packagedServer.url}/evaluate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fixtures: [{ fixturePath: evaluationFixturePath, content: JSON.stringify(mismatchedFixture) }],
      failOnStatus: true,
    }),
  });
  const evaluationFailurePayload = await evaluationFailureResponse.json();
  if (
    evaluationFailureResponse.status !== 409 ||
    evaluationFailurePayload.shouldFail !== true ||
    evaluationFailurePayload.failureReasons?.join(",") !== "mismatch" ||
    evaluationFailurePayload.mismatchCount !== 1 ||
    evaluationFailurePayload.summary?.mismatchCount !== 1
  ) {
    throw new Error("Package artifact server did not preserve the evaluation mismatch gate contract.");
  }
} finally {
  await packagedServer.close();
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

const topLevelHelpAlias = execFileSync(process.execPath, [fileURLToPath(cliPath), "help", "--help"], { encoding: "utf8" });
if (topLevelHelpAlias !== cliHelp) {
  throw new Error("Package artifact CLI did not preserve the top-level help alias contract.");
}

for (const command of [
  "verify",
  "verify-batch",
  "extract-claims",
  "import-review",
  "review-queue",
  "evaluate",
  "serve",
  "openapi",
  "version",
]) {
  for (const helpFlag of ["--help", "-h"]) {
    const commandHelp = execFileSync(process.execPath, [fileURLToPath(cliPath), command, helpFlag], { encoding: "utf8" });
    if (!commandHelp.startsWith(`Quorum ${command}\n\nUsage:`) || !commandHelp.includes(`quorum ${command}`)) {
      throw new Error(`Package artifact CLI did not preserve the ${command} ${helpFlag} contract.`);
    }
  }
}

for (const command of [
  "verify",
  "verify-batch",
  "extract-claims",
  "import-review",
  "review-queue",
  "evaluate",
  "serve",
  "openapi",
  "version",
]) {
  const topicHelp = execFileSync(process.execPath, [fileURLToPath(cliPath), "help", command], { encoding: "utf8" });
  if (!topicHelp.startsWith(`Quorum ${command}\n\nUsage:`) || !topicHelp.includes(`quorum ${command}`)) {
    throw new Error(`Package artifact CLI did not preserve the help ${command} topic contract.`);
  }
}

const extractClaimsTempDir = mkdtempSync(join(tmpdir(), "quorum-package-extract-claims-"));
try {
  const extractClaimsAnswerPath = join(extractClaimsTempDir, "answer.md");
  const extractClaimsResultPath = join(extractClaimsTempDir, "claims-result.json");
  writeFileSync(extractClaimsAnswerPath, "1. Employees receive 12 weeks of paid parental leave.\n");
  const extractClaimsResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "extract-claims",
    "--answer",
    extractClaimsAnswerPath,
    "--answer-label",
    "Packaged claim preview",
    "--result-json-out",
    extractClaimsResultPath,
    "--result-json",
  ], { encoding: "utf8" }));
  const extractClaimsResultFile = JSON.parse(readFileSync(extractClaimsResultPath, "utf8"));
  if (
    extractClaimsResult.answerHasClaims !== true ||
    extractClaimsResult.answerPath !== extractClaimsAnswerPath ||
    extractClaimsResult.answerLabel !== "Packaged claim preview" ||
    extractClaimsResult.claims?.length !== 1 ||
    extractClaimsResult.claims[0]?.id !== "claim_1" ||
    extractClaimsResult.claims[0]?.text !== "Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact CLI did not preserve the expected claim extraction contract.");
  }
  if (
    extractClaimsResultFile.answerPath !== extractClaimsAnswerPath ||
    extractClaimsResultFile.answerLabel !== "Packaged claim preview" ||
    extractClaimsResultFile.claims?.[0]?.id !== "claim_1"
  ) {
    throw new Error("Package artifact CLI did not preserve claim preview provenance in the result file.");
  }
} finally {
  rmSync(extractClaimsTempDir, { recursive: true, force: true });
}

const batchTempDir = mkdtempSync(join(tmpdir(), "quorum-package-batch-"));
try {
  const answerDir = join(batchTempDir, "answers");
  const aggregateSummaryCsvPath = join(batchTempDir, "batch-aggregate-summary.csv");
  const sourcePath = fileURLToPath(new URL("examples/sources/hr-policy.md", packageRoot));
  mkdirSync(answerDir);
  writeFileSync(join(answerDir, "verified.md"), "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(join(answerDir, "empty.md"), "Thanks!\n");
  const batchResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify-batch",
    "--answer-dir",
    answerDir,
    "--source",
    sourcePath,
    "--source-id",
    "people-ops/hr-policy@2026-07-24",
    "--aggregate-summary-csv-out",
    aggregateSummaryCsvPath,
    "--result-json",
  ], { encoding: "utf8" }));
  if (
    batchResult.shouldFail !== false ||
    batchResult.report?.summary?.answersWithClaims !== 1 ||
    batchResult.report?.summary?.answersWithoutClaims !== 1 ||
    batchResult.report?.summary?.verified !== 1 ||
    batchResult.report?.sources?.[0]?.id !== "people-ops/hr-policy@2026-07-24"
  ) {
    throw new Error("Package artifact CLI did not preserve the expected batch verification contract.");
  }
  const aggregateSummaryCsv = readFileSync(aggregateSummaryCsvPath, "utf8");
  if (!/^generated_at,answer_count,answers_with_claims,answers_without_claims,answers_with_failures,total_claims,verified,contradicted,unsupported,needs_review,source_count,source_titles,source_trust_levels,source_updated_at,source_paths,source_ids\n[^\n]+,2,1,1,0,1,1,0,0,0,1,[^\n]*people-ops\/hr-policy@2026-07-24/.test(aggregateSummaryCsv)) {
    throw new Error("Package artifact CLI did not preserve the batch aggregate summary CSV contract.");
  }
} finally {
  rmSync(batchTempDir, { recursive: true, force: true });
}

const openApiTempDir = mkdtempSync(join(tmpdir(), "quorum-package-openapi-"));
try {
  const openApiPath = join(openApiTempDir, "openapi.json");
  execFileSync(process.execPath, [fileURLToPath(cliPath), "openapi", "--out", openApiPath], { encoding: "utf8" });
  const openApiDocument = JSON.parse(readFileSync(openApiPath, "utf8"));
  if (openApiDocument.openapi !== "3.1.0" || openApiDocument.info?.title !== "Quorum Local API" || !openApiDocument.paths?.["/verify"]) {
    throw new Error("Package artifact CLI did not write the expected OpenAPI contract.");
  }

  const deployedOpenApi = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "openapi", "--server-url", "https://quorum.example.internal",
  ], { encoding: "utf8" }));
  if (deployedOpenApi.servers?.[0]?.url !== "https://quorum.example.internal" || !deployedOpenApi.paths?.["/verify"]) {
    throw new Error("Package artifact CLI did not preserve the OpenAPI server URL contract.");
  }
} finally {
  rmSync(openApiTempDir, { recursive: true, force: true });
}

const reviewerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-review-"));
try {
  const reviewCsvPath = join(reviewerTempDir, "review.csv");
  writeFileSync(reviewCsvPath, [
    "answer_label,answer_path,claim_id,claim_text,model_verdict,model_reason,evidence_titles,evidence_quotes,reviewer_verdict,reviewer_notes",
    "Packaged CLI packet,answers/hr.md,claim_1,Employees receive 12 weeks of paid parental leave.,verified,Matched approved policy,HR Policy,Employees receive 12 weeks of paid parental leave.,needs_review,Need HR confirmation",
    "",
  ].join("\n"));
  let importReviewOutput;
  try {
    execFileSync(process.execPath, [
      fileURLToPath(cliPath),
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--result-json",
      "--fail-on",
      "needs_review",
    ], { encoding: "utf8" });
  } catch (error) {
    if (error.status !== 2) {
      throw error;
    }
    importReviewOutput = error.stdout;
  }
  const importReviewResult = JSON.parse(importReviewOutput ?? "null");
  if (
    importReviewResult.shouldFail !== true ||
    importReviewResult.report?.queueSummary?.reviewedAnswers !== 1 ||
    importReviewResult.report?.summary?.needs_review !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve the expected reviewer import contract.");
  }
  const reviewQueueOutput = execFileSync(process.execPath, [
    fileURLToPath(cliPath), "review-queue", "--review-csv", "-", "--json",
  ], { encoding: "utf8", input: readFileSync(reviewCsvPath) });
  const reviewQueueResult = JSON.parse(reviewQueueOutput);
  if (
    reviewQueueResult.review?.totalAnswers !== 1 ||
    reviewQueueResult.review?.reviewedAnswers !== 1 ||
    reviewQueueResult.review?.verdicts?.needs_review !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve reviewer queue stdin routing.");
  }

  const queueSummaryCsvPath = join(reviewerTempDir, "queue-summary.csv");
  let queueSummaryOutput;
  try {
    execFileSync(process.execPath, [
      fileURLToPath(cliPath),
      "import-review",
      "--review-csv",
      reviewCsvPath,
      "--queue-summary-csv-out",
      queueSummaryCsvPath,
      "--fail-on",
      "needs_review",
    ], { encoding: "utf8" });
  } catch (error) {
    if (error.status !== 2) {
      throw error;
    }
    queueSummaryOutput = error.stdout;
  }
  if (!queueSummaryOutput?.includes(`Reviewer queue summary CSV written to ${queueSummaryCsvPath}`)) {
    throw new Error("Package artifact CLI did not report the reviewer queue summary CSV output.");
  }
  const queueSummaryCsv = readFileSync(queueSummaryCsvPath, "utf8");
  if (
    !queueSummaryCsv.startsWith("generated_at,total_answers,pending_answers,reviewed_answers") ||
    !queueSummaryCsv.includes(",1,0,1,0,1,1,0,1,0,0,0,1,matched,needs_review")
  ) {
    throw new Error("Package artifact CLI did not preserve the reviewer queue summary CSV contract.");
  }

  let importReviewStdinOutput;
  try {
    execFileSync(process.execPath, [
      fileURLToPath(cliPath), "import-review", "--review-csv", "-", "--result-json", "--fail-on", "needs_review",
    ], { encoding: "utf8", input: readFileSync(reviewCsvPath) });
  } catch (error) {
    if (error.status !== 2) {
      throw error;
    }
    importReviewStdinOutput = error.stdout;
  }
  const importReviewStdinResult = JSON.parse(importReviewStdinOutput ?? "null");
  if (
    importReviewStdinResult.shouldFail !== true ||
    importReviewStdinResult.failVerdicts?.join(",") !== "needs_review" ||
    importReviewStdinResult.report?.queueSummary?.reviewedAnswers !== 1 ||
    importReviewStdinResult.report?.summary?.needs_review !== 1
  ) {
    throw new Error("Package artifact CLI did not preserve reviewer import stdin routing.");
  }
} finally {
  rmSync(reviewerTempDir, { recursive: true, force: true });
}

const evaluationResult = JSON.parse(execFileSync(process.execPath, [
  fileURLToPath(cliPath),
  "evaluate",
  "--fixture",
  fileURLToPath(new URL("examples/evaluations/hr-policy.json", packageRoot)),
  "--json",
  "--fail-on-mismatch",
], { encoding: "utf8" }));
if (evaluationResult.fixtureName !== "HR policy example" || evaluationResult.summaryMatches !== true || evaluationResult.score !== 1) {
  throw new Error("Package artifact CLI did not evaluate the expected fixture contract.");
}

const evaluationGateResult = JSON.parse(execFileSync(process.execPath, [
  fileURLToPath(cliPath),
  "evaluate",
  "--fixture",
  fileURLToPath(new URL("examples/evaluations/hr-policy.json", packageRoot)),
  "--result-json",
  "--fail-on-mismatch",
], { encoding: "utf8" }));
if (
  evaluationGateResult.shouldFail !== false ||
  evaluationGateResult.mismatchCount !== 0 ||
  evaluationGateResult.summary?.score !== 1 ||
  evaluationGateResult.summary?.scoreLabel !== "100%"
) {
  throw new Error("Package artifact CLI did not preserve the evaluation result-json gate contract.");
}

const evaluationReportDir = mkdtempSync(join(tmpdir(), "quorum-package-evaluation-reports-"));
try {
  const markdownPath = join(evaluationReportDir, "evaluation.md");
  const htmlPath = join(evaluationReportDir, "evaluation.html");
  const summaryCsvPath = join(evaluationReportDir, "evaluation-summary.csv");
  const domainSummaryCsvPath = join(evaluationReportDir, "evaluation-domain-summary.csv");
  const aggregateSummaryCsvPath = join(evaluationReportDir, "evaluation-aggregate-summary.csv");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "evaluate",
    "--fixture",
    fileURLToPath(new URL("examples/evaluations/hr-policy.json", packageRoot)),
    "--markdown-out",
    markdownPath,
    "--html-out",
    htmlPath,
    "--summary-csv-out",
    summaryCsvPath,
    "--domain-summary-csv-out",
    domainSummaryCsvPath,
    "--aggregate-summary-csv-out",
    aggregateSummaryCsvPath,
  ], { encoding: "utf8" });
  const reportChecks = [
    [markdownPath, "# Quorum Evaluation Report", "Markdown"],
    [htmlPath, "<html", "HTML"],
    [summaryCsvPath, "generated_at,fixture_name,", "summary CSV"],
    [domainSummaryCsvPath, "generated_at,domain,", "domain summary CSV"],
    [aggregateSummaryCsvPath, "generated_at,fixture_count,", "aggregate summary CSV"],
  ];
  for (const [reportPath, marker, reportLabel] of reportChecks) {
    if (!readFileSync(reportPath, "utf8").toLowerCase().includes(marker.toLowerCase())) {
      throw new Error(`Package artifact did not write the expected evaluation ${reportLabel} contract.`);
    }
  }
} finally {
  rmSync(evaluationReportDir, { recursive: true, force: true });
}

const pdfTempDir = mkdtempSync(join(tmpdir(), "quorum-package-pdf-"));
try {
  const pdfAnswerPath = join(pdfTempDir, "answer.md");
  const pdfReportPath = join(pdfTempDir, "report.json");
  writeFileSync(pdfAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify",
    "--answer",
    pdfAnswerPath,
    "--source",
    fileURLToPath(new URL("examples/sources/hr-policy.pdf", packageRoot)),
    "--out",
    pdfReportPath,
  ], { encoding: "utf8" });
  const pdfReport = JSON.parse(readFileSync(pdfReportPath, "utf8"));
  if (pdfReport.summary?.verified !== 1 || pdfReport.sources?.[0]?.title !== "HR Benefits Policy PDF") {
    throw new Error("Package artifact CLI did not verify the expected PDF source contract.");
  }
} finally {
  rmSync(pdfTempDir, { recursive: true, force: true });
}

const docxTempDir = mkdtempSync(join(tmpdir(), "quorum-package-docx-"));
try {
  const docxSourceAnswerPath = join(docxTempDir, "answer.md");
  const docxSourcePath = join(docxTempDir, "hr-policy.docx");
  const docxSourceReportPath = join(docxTempDir, "source-report.json");
  const docxFixture = readFileSync(new URL("../node_modules/mammoth/test/test-data/single-paragraph.docx", import.meta.url));
  writeFileSync(docxSourceAnswerPath, "Walking on imported air\n");
  writeFileSync(docxSourcePath, docxFixture);
  execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify",
    "--answer",
    docxSourceAnswerPath,
    "--source",
    docxSourcePath,
    "--out",
    docxSourceReportPath,
  ], { encoding: "utf8" });
  const docxSourceReport = JSON.parse(readFileSync(docxSourceReportPath, "utf8"));
  if (docxSourceReport.summary?.verified !== 1 || docxSourceReport.sources?.[0]?.title !== "hr-policy") {
    throw new Error("Package artifact CLI did not verify the expected DOCX policy source contract.");
  }

  const docxAnswerPath = join(docxTempDir, "answer.docx");
  const docxReportPath = join(docxTempDir, "report.json");
  writeFileSync(docxAnswerPath, docxFixture);
  execFileSync(process.execPath, [
    fileURLToPath(cliPath),
    "verify",
    "--answer",
    docxAnswerPath,
    "--source",
    docxAnswerPath,
    "--out",
    docxReportPath,
  ], { encoding: "utf8" });
  const docxReport = JSON.parse(readFileSync(docxReportPath, "utf8"));
  if (docxReport.summary?.verified !== 1 || docxReport.sources?.[0]?.sourcePath !== docxAnswerPath) {
    throw new Error("Package artifact CLI did not verify the expected DOCX source contract.");
  }
} finally {
  rmSync(docxTempDir, { recursive: true, force: true });
}

const stdinSourceTempDir = mkdtempSync(join(tmpdir(), "quorum-package-stdin-source-"));
try {
  const stdinAnswerPath = join(stdinSourceTempDir, "answer.md");
  writeFileSync(stdinAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  const stdinSourceResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", stdinAnswerPath, "--source", "-", "--json",
  ], {
    encoding: "utf8",
    input: "---\ntitle: Streamed HR Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
  }));
  if (stdinSourceResult.summary?.verified !== 1 || stdinSourceResult.sources?.[0]?.title !== "Streamed HR Policy") {
    throw new Error("Package artifact CLI did not verify the expected streamed source contract.");
  }
} finally {
  rmSync(stdinSourceTempDir, { recursive: true, force: true });
}

const stdinAnswerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-stdin-answer-"));
try {
  const stdinAnswerSourceDir = join(stdinAnswerTempDir, "sources");
  mkdirSync(stdinAnswerSourceDir);
  writeFileSync(
    join(stdinAnswerSourceDir, "policy.md"),
    "---\ntitle: Streamed Answer Policy\ntrustLevel: high\n---\nEmployees receive 12 weeks of paid parental leave.\n",
  );
  const stdinAnswerResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source-dir", stdinAnswerSourceDir, "--json",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  }));
  if (stdinAnswerResult.summary?.verified !== 1 || stdinAnswerResult.answerPath !== "<stdin>") {
    throw new Error("Package artifact CLI did not preserve the expected streamed answer contract.");
  }
} finally {
  rmSync(stdinAnswerTempDir, { recursive: true, force: true });
}

const jsonlAnswerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-jsonl-answer-"));
try {
  const jsonlAnswerPath = join(jsonlAnswerTempDir, "answer.jsonl");
  const jsonlSourcePath = join(jsonlAnswerTempDir, "policy.md");
  writeFileSync(jsonlAnswerPath, '{"response":"Employees receive 12 weeks of paid parental leave."}\n');
  writeFileSync(jsonlSourcePath, "Employees receive 12 weeks of paid parental leave.\n");
  const jsonlAnswerResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", jsonlAnswerPath, "--source", jsonlSourcePath, "--json",
  ], { encoding: "utf8" }));
  if (
    jsonlAnswerResult.summary?.verified !== 1 ||
    jsonlAnswerResult.answerPath !== jsonlAnswerPath ||
    jsonlAnswerResult.assessments?.[0]?.claim?.text !==
      "response: Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact CLI did not preserve the direct JSONL answer contract.");
  }
} finally {
  rmSync(jsonlAnswerTempDir, { recursive: true, force: true });
}

const jsonlSourceTempDir = mkdtempSync(join(tmpdir(), "quorum-package-jsonl-source-"));
try {
  const jsonlAnswerPath = join(jsonlSourceTempDir, "answer.md");
  const jsonlSourcePath = join(jsonlSourceTempDir, "policy.jsonl");
  writeFileSync(jsonlAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(jsonlSourcePath, '{"policy":"Employees receive 12 weeks of paid parental leave."}\n');
  const jsonlSourceResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", jsonlAnswerPath, "--source", jsonlSourcePath, "--json",
  ], { encoding: "utf8" }));
  if (
    jsonlSourceResult.summary?.verified !== 1 ||
    jsonlSourceResult.sources?.[0]?.sourcePath !== jsonlSourcePath ||
    jsonlSourceResult.sources?.[0]?.title !== "policy"
  ) {
    throw new Error("Package artifact CLI did not preserve the direct JSONL source contract.");
  }
} finally {
  rmSync(jsonlSourceTempDir, { recursive: true, force: true });
}

const ndjsonAnswerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-ndjson-answer-"));
try {
  const ndjsonAnswerPath = join(ndjsonAnswerTempDir, "answer.ndjson");
  const ndjsonSourcePath = join(ndjsonAnswerTempDir, "policy.md");
  writeFileSync(ndjsonAnswerPath, '{"response":"Employees receive 12 weeks of paid parental leave."}\n');
  writeFileSync(ndjsonSourcePath, "Employees receive 12 weeks of paid parental leave.\n");
  const ndjsonAnswerResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", ndjsonAnswerPath, "--source", ndjsonSourcePath, "--json",
  ], { encoding: "utf8" }));
  if (
    ndjsonAnswerResult.summary?.verified !== 1 ||
    ndjsonAnswerResult.answerPath !== ndjsonAnswerPath ||
    ndjsonAnswerResult.assessments?.[0]?.claim?.text !==
      "response: Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact CLI did not preserve the direct NDJSON answer contract.");
  }
} finally {
  rmSync(ndjsonAnswerTempDir, { recursive: true, force: true });
}

const ndjsonSourceTempDir = mkdtempSync(join(tmpdir(), "quorum-package-ndjson-source-"));
try {
  const ndjsonAnswerPath = join(ndjsonSourceTempDir, "answer.md");
  const ndjsonSourcePath = join(ndjsonSourceTempDir, "policy.ndjson");
  writeFileSync(ndjsonAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(ndjsonSourcePath, '{"policy":"Employees receive 12 weeks of paid parental leave."}\n');
  const ndjsonSourceResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", ndjsonAnswerPath, "--source", ndjsonSourcePath, "--json",
  ], { encoding: "utf8" }));
  if (
    ndjsonSourceResult.summary?.verified !== 1 ||
    ndjsonSourceResult.sources?.[0]?.sourcePath !== ndjsonSourcePath ||
    ndjsonSourceResult.sources?.[0]?.title !== "policy"
  ) {
    throw new Error("Package artifact CLI did not preserve the direct NDJSON source contract.");
  }
} finally {
  rmSync(ndjsonSourceTempDir, { recursive: true, force: true });
}

const yamlAnswerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-yaml-answer-"));
try {
  const yamlAnswerPath = join(yamlAnswerTempDir, "answer.yaml");
  const yamlSourcePath = join(yamlAnswerTempDir, "policy.md");
  writeFileSync(yamlAnswerPath, "response: Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(yamlSourcePath, "Employees receive 12 weeks of paid parental leave.\n");
  const yamlAnswerResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", yamlAnswerPath, "--source", yamlSourcePath, "--json",
  ], { encoding: "utf8" }));
  if (
    yamlAnswerResult.summary?.verified !== 1 ||
    yamlAnswerResult.answerPath !== yamlAnswerPath ||
    yamlAnswerResult.assessments?.[0]?.claim?.text !==
      "response: Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact CLI did not preserve the direct YAML answer contract.");
  }
} finally {
  rmSync(yamlAnswerTempDir, { recursive: true, force: true });
}

const jsonAnswerTempDir = mkdtempSync(join(tmpdir(), "quorum-package-json-answer-"));
try {
  const jsonAnswerPath = join(jsonAnswerTempDir, "answer.json");
  const jsonSourcePath = join(jsonAnswerTempDir, "policy.md");
  writeFileSync(jsonAnswerPath, '{"response":"Employees receive 12 weeks of paid parental leave."}\n');
  writeFileSync(jsonSourcePath, "Employees receive 12 weeks of paid parental leave.\n");
  const jsonAnswerResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", jsonAnswerPath, "--source", jsonSourcePath, "--json",
  ], { encoding: "utf8" }));
  if (
    jsonAnswerResult.summary?.verified !== 1 ||
    jsonAnswerResult.answerPath !== jsonAnswerPath ||
    jsonAnswerResult.assessments?.[0]?.claim?.text !==
      "response: Employees receive 12 weeks of paid parental leave."
  ) {
    throw new Error("Package artifact CLI did not preserve the direct JSON answer contract.");
  }
} finally {
  rmSync(jsonAnswerTempDir, { recursive: true, force: true });
}

const generatedAtTempDir = mkdtempSync(join(tmpdir(), "quorum-package-generated-at-"));
try {
  const generatedAtSourceDir = join(generatedAtTempDir, "sources");
  mkdirSync(generatedAtSourceDir);
  writeFileSync(join(generatedAtSourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n");
  const generatedAtResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source-dir", generatedAtSourceDir,
    "--generated-at", "2026-07-24T00:00:00.000Z", "--json",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  }));
  if (
    generatedAtResult.summary?.verified !== 1 ||
    generatedAtResult.generatedAt !== "2026-07-24T00:00:00.000Z"
  ) {
    throw new Error("Package artifact CLI did not preserve the single-answer generated-at contract.");
  }
} finally {
  rmSync(generatedAtTempDir, { recursive: true, force: true });
}

const singleSummaryTempDir = mkdtempSync(join(tmpdir(), "quorum-package-single-summary-"));
try {
  const singleSummarySourceDir = join(singleSummaryTempDir, "sources");
  const singleSummaryPath = join(singleSummaryTempDir, "summary.csv");
  mkdirSync(singleSummarySourceDir);
  writeFileSync(join(singleSummarySourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\n");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source-dir", singleSummarySourceDir,
    "--summary-csv-out", singleSummaryPath, "--fail-on", "contradicted",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  });
  const singleSummary = readFileSync(singleSummaryPath, "utf8");
  if (!singleSummary.includes("answer_path") || !singleSummary.includes("<stdin>") || !singleSummary.includes(",verified,")) {
    throw new Error("Package artifact CLI did not preserve the single-answer summary CSV contract.");
  }
} finally {
  rmSync(singleSummaryTempDir, { recursive: true, force: true });
}

const batchStdinTempDir = mkdtempSync(join(tmpdir(), "quorum-package-batch-stdin-answer-"));
try {
  const batchSourceDir = join(batchStdinTempDir, "sources");
  const batchFileAnswerPath = join(batchStdinTempDir, "support-answer.md");
  mkdirSync(batchSourceDir);
  writeFileSync(batchFileAnswerPath, "Refunds are available within 30 days of purchase.\n");
  writeFileSync(join(batchSourceDir, "hr-policy.md"), "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(join(batchSourceDir, "support-playbook.md"), "Refunds are available within 30 days of purchase.\n");

  const batchStdinResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify-batch", "--answer", "-", "--answer", batchFileAnswerPath,
    "--source-dir", batchSourceDir, "--generated-at", "2026-07-22T00:00:00.000Z", "--json",
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  }));
  if (
    batchStdinResult.answerCount !== 2 ||
    batchStdinResult.answers?.[0]?.answerPath !== "<stdin>" ||
    batchStdinResult.answers?.[1]?.answerPath !== batchFileAnswerPath ||
    batchStdinResult.summary?.verified !== 2 ||
    batchStdinResult.generatedAt !== "2026-07-22T00:00:00.000Z" ||
    batchStdinResult.answers?.some(({ report }) => report?.generatedAt !== "2026-07-22T00:00:00.000Z")
  ) {
    throw new Error("Package artifact CLI did not preserve the batch stdin or generated-at contract.");
  }
} finally {
  rmSync(batchStdinTempDir, { recursive: true, force: true });
}

const batchLabelTempDir = mkdtempSync(join(tmpdir(), "quorum-package-batch-labels-"));
try {
  const batchSourceDir = join(batchLabelTempDir, "sources");
  const firstAnswerPath = join(batchLabelTempDir, "first.md");
  const secondAnswerPath = join(batchLabelTempDir, "second.md");
  mkdirSync(batchSourceDir);
  writeFileSync(firstAnswerPath, "Employees receive 12 weeks of paid parental leave.\n");
  writeFileSync(secondAnswerPath, "Refunds are available within 30 days of purchase.\n");
  writeFileSync(join(batchSourceDir, "policy.md"), "Employees receive 12 weeks of paid parental leave.\nRefunds are available within 30 days of purchase.\n");

  const batchLabelResult = JSON.parse(execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify-batch",
    "--answer", firstAnswerPath, "--answer-label", "HR packet",
    "--answer", secondAnswerPath, "--answer-label", "Support packet",
    "--source-dir", batchSourceDir, "--json",
  ], { encoding: "utf8" }));
  if (
    batchLabelResult.answerCount !== 2 ||
    JSON.stringify(batchLabelResult.answers?.map(({ answerPath, answerLabel }) => ({ answerPath, answerLabel }))) !==
      JSON.stringify([
        { answerPath: firstAnswerPath, answerLabel: "HR packet" },
        { answerPath: secondAnswerPath, answerLabel: "Support packet" },
      ]) ||
    batchLabelResult.answers?.some(({ report }) => report?.answerLabel === undefined)
  ) {
    throw new Error("Package artifact CLI did not preserve explicit batch answer labels and order.");
  }
} finally {
  rmSync(batchLabelTempDir, { recursive: true, force: true });
}

const reviewQueueTempDir = mkdtempSync(join(tmpdir(), "quorum-package-review-queue-"));
try {
  const reviewCsvPath = join(reviewQueueTempDir, "review.csv");
  const queueJsonPath = join(reviewQueueTempDir, "queue.json");
  const pendingQueueJsonPath = join(reviewQueueTempDir, "pending-queue.json");
  const queueCsvPath = join(reviewQueueTempDir, "queue.csv");
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "verify", "--answer", "-", "--source",
    fileURLToPath(new URL("examples/sources/hr-policy.md", packageRoot)),
    "--review-csv-out", reviewCsvPath,
  ], {
    encoding: "utf8",
    input: "Employees receive 12 weeks of paid parental leave.\n",
  });
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "review-queue", "--review-csv", reviewCsvPath,
    "--generated-at", "2026-07-24T00:00:00.000Z", "--json", "--out", queueJsonPath,
    "--csv-out", queueCsvPath,
  ], { encoding: "utf8" });
  execFileSync(process.execPath, [
    fileURLToPath(cliPath), "review-queue", "--review-csv", reviewCsvPath,
    "--queue-status", "pending", "--generated-at", "2026-07-24T00:00:00.000Z",
    "--json", "--out", pendingQueueJsonPath,
  ], { encoding: "utf8" });
  const queueJson = JSON.parse(readFileSync(queueJsonPath, "utf8"));
  const pendingQueueJson = JSON.parse(readFileSync(pendingQueueJsonPath, "utf8"));
  const queueCsv = readFileSync(queueCsvPath, "utf8");
  if (
    queueJson.generatedAt !== "2026-07-24T00:00:00.000Z" ||
    queueJson.review?.totalAnswers !== 1 ||
    queueJson.review?.pendingAnswers !== 1 ||
    queueJson.review?.totalClaims !== 1 ||
    pendingQueueJson.queueStatus !== "pending" ||
    pendingQueueJson.review?.totalAnswers !== 1 ||
    pendingQueueJson.review?.pendingAnswers !== 1 ||
    !queueCsv.startsWith('"generated_at","queue_status","domains","total_answers",') ||
    !queueCsv.includes('"1","1","0","0","1","1","0","1","0","0","0"')
  ) {
    throw new Error("Package artifact CLI did not preserve the reviewer queue overview contract.");
  }
} finally {
  rmSync(reviewQueueTempDir, { recursive: true, force: true });
}

console.log(`Package smoke check passed: ${packageResult.filename} contains ${files.size} files.`);
