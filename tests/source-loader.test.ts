import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSimplePdf } from "./pdf-test-helpers.js";
import { parseSource, sourceDocumentFromFile } from "../src/source-loader.js";

test("builds source documents from file names when metadata is absent", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0);

  assert.equal(source.id, "source_1");
  assert.equal(source.title, "hr-policy");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Employees get 12 weeks.");
});

test("extracts readable text from DOCX source content", async () => {
  const content = await readFile("node_modules/mammoth/test/test-data/single-paragraph.docx");
  const source = await sourceDocumentFromFile("docs/hr-policy.docx", content, 0);

  assert.equal(source.title, "hr-policy");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Walking on imported air");
});

test("preserves a caller-supplied source identifier for DOCX content", async () => {
  const content = await readFile("node_modules/mammoth/test/test-data/single-paragraph.docx");
  const source = await sourceDocumentFromFile("docs/hr-policy.docx", content, 0, {
    id: "people-ops/hr-policy@2026-05-31",
  });

  assert.equal(source.id, "people-ops/hr-policy@2026-05-31");
});

test("strips supported text extensions from fallback source titles", async () => {
  const markdownSource = await sourceDocumentFromFile(
    "docs/policies/leave-policy.markdown",
    "Employees get 12 weeks.",
    0,
  );
  const textSource = await sourceDocumentFromFile(
    "docs/policies/escalation-guide.txt",
    "Escalate incidents within one hour.",
    1,
  );

  assert.equal(markdownSource.title, "leave-policy");
  assert.equal(textSource.title, "escalation-guide");
});

test("applies the default trust override when metadata is absent", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0, {
    defaultTrustLevel: "high",
  });

  assert.equal(source.trustLevel, "high");
});

test("preserves a caller-supplied source identifier", async () => {
  const source = await sourceDocumentFromFile("docs/hr-policy.md", "Employees get 12 weeks.", 0, {
    id: "people-ops/hr-policy@2026-05-31",
  });

  assert.equal(source.id, "people-ops/hr-policy@2026-05-31");
});

test("parses supported frontmatter metadata and strips it from content", () => {
  const parsed = parseSource("docs/hr-policy.md", `---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
owner: People Ops
---
# HR Policy

Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.match(parsed.body, /^# HR Policy/);
  assert.doesNotMatch(parsed.body, /People Ops/);
});

test("parses toml-style source frontmatter delimited by plus signs", () => {
  const parsed = parseSource("docs/hr-policy.md", `+++
title = "HR Benefits Policy"
updated_at = "2026-05-31"
trust_level = "high"
+++
# HR Policy

Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.match(parsed.body, /^# HR Policy/);
});

test("parses source frontmatter when the file starts with a utf-8 byte order mark", () => {
  const parsed = parseSource("docs/hr-policy.md", `\uFEFF---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: high
---
Employees get 12 weeks.
`);

  assert.deepEqual(parsed.metadata, {
    title: "HR Benefits Policy",
    updatedAt: "2026-05-31",
    trustLevel: "high",
  });
  assert.equal(parsed.body, "Employees get 12 weeks.\n");
});

test("keeps frontmatter trust levels ahead of the default override", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.md",
    `---
title: HR Benefits Policy
trustLevel: low
---
Employees get 12 weeks.
`,
    0,
    { defaultTrustLevel: "high" },
  );

  assert.equal(source.trustLevel, "low");
});

test("rejects invalid source freshness metadata", async () => {
  await assert.rejects(
    sourceDocumentFromFile(
      "docs/hr-policy.md",
      `---
updatedAt: not-a-timestamp
---
Employees get 12 weeks.
`,
      0,
    ),
    /Invalid updatedAt timestamp for source: docs\/hr-policy\.md/,
  );
});

test("prefers explicit source metadata overrides over parsed metadata", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.md",
    `---
title: HR Benefits Policy
updatedAt: 2026-05-31
trustLevel: low
---
Employees get 12 weeks.
`,
    0,
    {
      title: "HR Handbook",
      updatedAt: "2026-06-15",
      trustLevel: "high",
      defaultTrustLevel: "medium",
    },
  );

  assert.equal(source.title, "HR Handbook");
  assert.equal(source.updatedAt, "2026-06-15");
  assert.equal(source.trustLevel, "high");
});

test("extracts readable text and title from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
    <meta property="article:modified_time" content="2026-06-15" />
    <meta name="quorum-trust-level" content="high" />
    <style>.hidden { display: none; }</style>
  </head>
  <body>
    <main>
      <h1>Refund Policy</h1>
      <p>Customers can request refunds within 30 days.</p>
      <ul>
        <li>Annual plans require support approval.</li>
      </ul>
    </main>
    <script>window.analytics = true;</script>
  </body>
</html>`,
    1,
  );

  assert.equal(source.title, "Refund Policy");
  assert.equal(source.updatedAt, "2026-06-15");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /Refund Policy/);
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /- Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /analytics|display: none/);
});

test("prefers the page heading when html titles include help-center chrome", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Help Center | Refund Policy</title>
  </head>
  <body>
    <main>
      <h1>Refund Policy</h1>
      <p>Customers can request refunds within 30 days.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
});

test("normalizes one-column markdown tables in sources", () => {
  const parsed = parseSource(
    "docs/hr-policy.md",
    `| Policy |
| --- |
| Employees receive 12 weeks of paid parental leave. |
| Managers approve exceptions within five business days. |
`,
  );

  assert.equal(
    parsed.body,
    [
      "Employees receive 12 weeks of paid parental leave.",
      "Managers approve exceptions within five business days.",
      "",
    ].join("\n"),
  );
});

test("normalizes one-column html tables in sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th></tr>
      </thead>
      <tbody>
        <tr><td>Customers can request refunds within 30 days.</td></tr>
        <tr><td>Annual plans require support approval.</td></tr>
      </tbody>
    </table>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
});

test("ignores html navigation and control chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <nav>
      <a href="/kb">Knowledge base home</a>
      <a href="/refunds">Refund policy overview</a>
    </nav>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <button type="button">Copy answer</button>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Knowledge base home|Refund policy overview|Copy answer/);
});

test("ignores html header, footer, and aside chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <header>
      <p>Knowledge base home</p>
    </header>
    <aside>
      <p>Related articles</p>
    </aside>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
    <footer>
      <p>Contact support</p>
    </footer>
  </body>
</html>`,
    3,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Knowledge base home|Related articles|Contact support/);
});

test("ignores html dialog chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <dialog open>
      <p>Answer copied to clipboard.</p>
      <button type="button">Dismiss</button>
    </dialog>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    4,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Answer copied to clipboard|Dismiss/);
});

test("ignores hidden html chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <div hidden>
      <p>Knowledge base navigation</p>
    </div>
    <aside aria-hidden="true">
      <p>Cookie preferences</p>
    </aside>
    <section inert>
      <p>Copied to clipboard</p>
    </section>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    4,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Knowledge base navigation|Cookie preferences|Copied to clipboard/);
});

test("ignores inline css-hidden sections in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <div style="display: none;">
      <p>Draft policy change pending approval</p>
    </div>
    <section style="visibility:hidden">
      <p>Copied to clipboard</p>
    </section>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    5,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Draft policy change pending approval|Copied to clipboard/);
});

test("ignores common screen-reader-only sections in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <div class="sr-only">
      <p>Skip to main content</p>
    </div>
    <section class="visually-hidden announcement">
      <p>Dialog closed</p>
    </section>
    <aside class="screen-reader-text">
      <p>Knowledge base controls</p>
    </aside>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Skip to main content|Dialog closed|Knowledge base controls/);
});

test("ignores html comments in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <!-- internal note: route > legal before updating annual-plan exceptions -->
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /route|legal|annual-plan exceptions/);
});

test("preserves html details summaries as readable source section labels", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <details open>
        <summary>Refund exceptions</summary>
        <p>Customers can request refunds within 30 days.</p>
        <ul>
          <li>Annual plans require support approval.</li>
        </ul>
      </details>
    </main>
  </body>
</html>`,
    7,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Refund exceptions:/);
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /- Annual plans require support approval\./);
});

test("ignores collapsed html details body content in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <main>
      <details>
        <summary>Refund exceptions</summary>
        <p>Customers can request refunds within 30 days.</p>
      </details>
      <details open>
        <summary>Visible policy</summary>
        <p>Managers approve exceptions within two business days.</p>
      </details>
    </main>
  </body>
</html>`,
    8,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Refund exceptions:/);
  assert.doesNotMatch(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Visible policy:/);
  assert.match(source.content, /Managers approve exceptions within two business days\./);
});

test("ignores html iframe chrome in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/refunds.html",
    `<!doctype html>
<html>
  <head>
    <title>Refund Policy</title>
  </head>
  <body>
    <iframe src="https://example.com/widget">
      <p>Copied to clipboard.</p>
      <p>Open the full article in a new tab.</p>
    </iframe>
    <main>
      <p>Customers can request refunds within 30 days.</p>
      <p>Annual plans require support approval.</p>
    </main>
  </body>
</html>`,
    9,
  );

  assert.equal(source.title, "Refund Policy");
  assert.match(source.content, /Customers can request refunds within 30 days\./);
  assert.match(source.content, /Annual plans require support approval\./);
  assert.doesNotMatch(source.content, /Copied to clipboard|Open the full article in a new tab/);
});

test("preserves html figure and table captions in exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/support.html",
    `<!doctype html>
<html>
  <head>
    <title>Support Policies</title>
  </head>
  <body>
    <main>
      <figure>
        <img src="/queue.png" alt="Queue targets" />
        <figcaption>Enterprise queues receive a first response within four business hours.</figcaption>
      </figure>
      <table>
        <caption>Support response targets.</caption>
        <tbody>
          <tr><td>Priority</td><td>Escalate incidents immediately.</td></tr>
        </tbody>
      </table>
    </main>
  </body>
</html>`,
    8,
  );

  assert.equal(source.title, "Support Policies");
  assert.match(
    source.content,
    /Enterprise queues receive a first response within four business hours\./,
  );
  assert.match(source.content, /Support response targets\./);
  assert.match(source.content, /Priority: Escalate incidents immediately\./);
});

test("falls back to html metadata when the page title is absent", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.html",
    `<!doctype html>
<html>
  <head>
    <meta property="og:title" content="Escalations Overview" />
    <meta name="last-modified" content="2026-06-20" />
  </head>
  <body>
    <main>
      <p>Escalate priority incidents immediately.</p>
    </main>
  </body>
</html>`,
    2,
  );

  assert.equal(source.title, "Escalations Overview");
  assert.equal(source.updatedAt, "2026-06-20");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("reads html title and updated date metadata from name attributes when exports omit property", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.html",
    `<!doctype html>
<html>
  <head>
    <meta name="og:title" content="Escalations Overview" />
    <meta name="article:modified_time" content="2026-06-21T08:15:00Z" />
  </head>
  <body>
    <main>
      <p>Escalate priority incidents immediately.</p>
    </main>
  </body>
</html>`,
    3,
  );

  assert.equal(source.title, "Escalations Overview");
  assert.equal(source.updatedAt, "2026-06-21T08:15:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("reads html title metadata from dublin core name attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <meta name="dcterms.title" content="Benefits Policy Handbook" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    5,
  );

  assert.equal(source.title, "Benefits Policy Handbook");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Employees receive medical coverage after 30 days.");
});

test("reads html title metadata from itemprop attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <meta itemprop="headline" content="Benefits Policy Handbook" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Benefits Policy Handbook");
  assert.equal(source.updatedAt, undefined);
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Employees receive medical coverage after 30 days.");
});

test("reads html updated dates from dublin core name attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
    <meta name="DC.date.modified" content="2026-06-22T11:30:00Z" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    5,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-22T11:30:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("reads html updated dates from itemprop attributes", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
    <meta itemprop="dateModified" content="2026-06-23T09:45:00Z" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    6,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-23T09:45:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("falls back to the first html heading when title metadata is absent", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/vacation-policy.html",
    `<!doctype html>
<html>
  <body>
    <main>
      <h1>Vacation Policy</h1>
      <p>Full-time employees receive 20 days of paid vacation each calendar year.</p>
    </main>
  </body>
</html>`,
    7,
  );

  assert.equal(source.title, "Vacation Policy");
  assert.equal(source.trustLevel, "medium");
  assert.match(
    source.content,
    /Full-time employees receive 20 days of paid vacation each calendar year\./,
  );
});

test("falls back to a time datetime attribute when html update metadata is absent", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
  </head>
  <body>
    <main>
      <p><time datetime="2026-06-18T14:30:00Z">Updated June 18, 2026</time></p>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    8,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-18T14:30:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Updated June 18, 2026/);
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("extracts readable text from html table sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
  </head>
  <body>
    <table>
      <thead>
        <tr><th>Policy</th><th>Details</th></tr>
      </thead>
      <tbody>
        <tr><td>Parental leave</td><td>Employees receive 12 weeks of paid parental leave.</td></tr>
        <tr><td>Healthcare</td><td>Coverage begins after 30 days of employment.</td></tr>
      </tbody>
    </table>
  </body>
</html>`,
    9,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.match(source.content, /Benefits Policy/);
  assert.match(
    source.content,
    /Parental leave: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(source.content, /Healthcare: Coverage begins after 30 days of employment\./);
});

test("extracts readable text from html description list sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
  </head>
  <body>
    <dl>
      <dt>Parental leave</dt>
      <dd>Employees receive 12 weeks of paid parental leave.</dd>
      <dt>Healthcare</dt>
      <dd>Coverage begins after 30 days of employment.</dd>
      <dd>Part-time staff receive prorated coverage.</dd>
    </dl>
  </body>
</html>`,
    10,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.match(source.content, /Benefits Policy/);
  assert.match(
    source.content,
    /Parental leave: Employees receive 12 weeks of paid parental leave\./,
  );
  assert.match(source.content, /Healthcare: Coverage begins after 30 days of employment\./);
  assert.match(source.content, /Healthcare: Part-time staff receive prorated coverage\./);
});

test("extracts readable text from markdown table sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/policies/benefits.md",
    `| Policy | Details |
| --- | --- |
| Parental leave | Employees receive 12 weeks of paid parental leave. |
| Healthcare | Coverage begins after 30 days of employment.<br>Part-time staff receive prorated coverage. |
| Support tiers | Enterprise support covers billing \\| technical issues. |
`,
    11,
  );

  assert.equal(source.title, "benefits");
  assert.equal(
    source.content,
    [
      "Parental leave: Employees receive 12 weeks of paid parental leave.",
      "Healthcare: Coverage begins after 30 days of employment. Part-time staff receive prorated coverage.",
      "Support tiers: Enterprise support covers billing | technical issues.",
      "",
    ].join("\n"),
  );
});

test("reads html updated dates from http-equiv metadata", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits Policy</title>
    <meta http-equiv="last-modified" content="2026-06-19T09:45:00Z" />
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days.</p>
    </main>
  </body>
</html>`,
    11,
  );

  assert.equal(source.title, "Benefits Policy");
  assert.equal(source.updatedAt, "2026-06-19T09:45:00Z");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
});

test("decodes numeric html entities from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/benefits.html",
    `<!doctype html>
<html>
  <head>
    <title>Benefits &#8212; US</title>
  </head>
  <body>
    <main>
      <p>Employees receive medical coverage after 30 days&#46;</p>
      <p>People Ops&#x2019; policy applies to full-time staff.</p>
    </main>
  </body>
</html>`,
    12,
  );

  assert.equal(source.title, "Benefits — US");
  assert.match(source.content, /Employees receive medical coverage after 30 days\./);
  assert.match(source.content, /People Ops’ policy applies to full-time staff\./);
});

test("decodes common named html entities from exported html sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.html",
    `<!doctype html>
<html>
  <head>
    <title>Support &amp; Escalations &mdash; North America</title>
  </head>
  <body>
    <main>
      <p>Customers&rsquo; refund requests require manager review after 30 days.</p>
      <p>Priority incidents need a response within four hours &ndash; including weekends.</p>
    </main>
  </body>
</html>`,
    13,
  );

  assert.equal(source.title, "Support & Escalations — North America");
  assert.match(
    source.content,
    /Customers’ refund requests require manager review after 30 days\./,
  );
  assert.match(
    source.content,
    /Priority incidents need a response within four hours – including weekends\./,
  );
});

test("falls back to the html file name when the page has no title", async () => {
  const source = await sourceDocumentFromFile(
    "docs/help-center/escalations.htm",
    "<html><body><p>Escalate priority incidents immediately.</p></body></html>",
    14,
  );

  assert.equal(source.title, "escalations");
  assert.equal(source.trustLevel, "medium");
  assert.equal(source.content, "Escalate priority incidents immediately.");
});

test("extracts readable text from pdf sources", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.pdf",
    createSimplePdf("Employees receive 12 weeks of paid parental leave."),
    0,
    { defaultTrustLevel: "high" },
  );

  assert.equal(source.title, "hr-policy");
  assert.equal(source.trustLevel, "high");
  assert.match(source.content, /Employees receive 12 weeks of paid parental leave\./);
});

test("extracts embedded pdf title and modification metadata when present", async () => {
  const source = await sourceDocumentFromFile(
    "docs/hr-policy.pdf",
    createSimplePdf("Employees receive 12 weeks of paid parental leave.", {
      title: "HR Benefits Policy PDF",
      modDate: "D:20260615093000-04'00'",
    }),
    1,
  );

  assert.equal(source.title, "HR Benefits Policy PDF");
  assert.equal(source.updatedAt, "2026-06-15T09:30:00-04:00");
  assert.equal(source.trustLevel, "medium");
  assert.match(source.content, /Employees receive 12 weeks of paid parental leave\./);
});
