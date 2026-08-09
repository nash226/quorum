import assert from "node:assert/strict";
import test from "node:test";
import {
  overlapScore,
  renderAnswerLabels,
  renderAnswerPreview,
  splitIntoSentences,
  tokenize,
} from "../src/text.js";

test("tokenizes non-Latin letters for localized evidence matching", () => {
  assert.deepEqual(tokenize("Сотрудники получают 12 недель отпуска."), [
    "сотрудники",
    "получают",
    "12",
    "недель",
    "отпуска",
  ]);
  assert.equal(
    overlapScore("Сотрудники получают 12 недель отпуска.", "Сотрудники получают 12 недель отпуска."),
    1,
  );
});

test("does not split common abbreviations into separate claims", () => {
  assert.deepEqual(
    splitIntoSentences("Dr. Rivera approved the policy. E.g. the leave rule applies to contractors."),
    ["Dr. Rivera approved the policy.", "E.g. the leave rule applies to contractors."],
  );
});

test("does not split a claim at etc.", () => {
  assert.deepEqual(
    splitIntoSentences("Approved sources include policies, playbooks, etc. for verification."),
    ["Approved sources include policies, playbooks, etc. for verification."],
  );
});

test("does not split a claim at a.m. or p.m.", () => {
  assert.deepEqual(
    splitIntoSentences("Support is available from 9 a.m. to 5 p.m. on weekdays."),
    ["Support is available from 9 a.m. to 5 p.m. on weekdays."],
  );
});

test("keeps decimal values inside one sentence", () => {
  assert.deepEqual(
    splitIntoSentences("The policy applies to 95.5% of eligible employees. Review exceptions separately."),
    [
      "The policy applies to 95.5% of eligible employees.",
      "Review exceptions separately.",
    ],
  );
});

test("keeps dotted URLs inside one claim while splitting the surrounding sentences", () => {
  assert.deepEqual(
    splitIntoSentences("Read https://support.example.com/reset. Contact support if the link fails."),
    [
      "Read https://support.example.com/reset.",
      "Contact support if the link fails.",
    ],
  );
});

test("splits concatenated Latin sentences from compact exports", () => {
  assert.deepEqual(
    splitIntoSentences("The policy applies.Employees need manager approval!Support responds within four hours."),
    [
      "The policy applies.",
      "Employees need manager approval!",
      "Support responds within four hours.",
    ],
  );
});

test("splits sentences across Unicode line and paragraph separators", () => {
  assert.deepEqual(
    splitIntoSentences("Employees receive leave.\u2028Managers approve exceptions.\u2029Support responds within four hours."),
    [
      "Employees receive leave.",
      "Managers approve exceptions.",
      "Support responds within four hours.",
    ],
  );
});

test("keeps simple basenames when answer filenames are already unique", () => {
  assert.deepEqual(
    renderAnswerLabels([
      "examples/answers/hr-answer.md",
      "examples/answers/support-answer.md",
    ]),
    ["hr-answer", "support-answer"],
  );
});

test("disambiguates duplicate answer filenames with parent directories", () => {
  assert.deepEqual(
    renderAnswerLabels([
      "/tmp/quorum/hr/answer.md",
      "/tmp/quorum/support/answer.md",
    ]),
    ["hr/answer", "support/answer"],
  );
});

test("keeps expanding duplicate answer labels until they become unique", () => {
  assert.deepEqual(
    renderAnswerLabels([
      "/tmp/quorum/emea/hr/answer.md",
      "/tmp/quorum/us/hr/answer.md",
      "/tmp/quorum/us/support/answer.md",
    ]),
    ["emea/hr/answer", "us/hr/answer", "support/answer"],
  );
});

test("strips inline list markers when splitting sentences", () => {
  assert.deepEqual(
    splitIntoSentences(
      "1) Employees receive 12 weeks. 2) Managers approve travel. • Finance reviews international trips. (a) Legal approves exceptions. iv) Support handles billing.",
    ),
    [
      "Employees receive 12 weeks.",
      "Managers approve travel.",
      "Finance reviews international trips.",
      "Legal approves exceptions.",
      "Support handles billing.",
    ],
  );
});

test("strips Markdown blockquote markers when splitting quoted policy claims", () => {
  assert.deepEqual(
    splitIntoSentences(
      "> Employees receive 12 weeks of paid leave.\n> Managers approve exceptions.",
    ),
    [
      "Employees receive 12 weeks of paid leave.",
      "Managers approve exceptions.",
    ],
  );
});

test("strips inline numeric-colon list markers when splitting sentences", () => {
  assert.deepEqual(
    splitIntoSentences(
      "1: Employees receive 12 weeks. 2: Managers approve travel within five business days.",
    ),
    [
      "Employees receive 12 weeks.",
      "Managers approve travel within five business days.",
    ],
  );
});

test("splits inline CJK and fullwidth sentences", () => {
  assert.deepEqual(
    splitIntoSentences("休暇申請は承認制。지원 신청은 필수！Employees need approval？"),
    ["休暇申請は承認制。", "지원 신청은 필수！", "Employees need approval？"],
  );
});

test("splits Arabic and Indic sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("هل تمت الموافقة؟ نعم تمت الموافقة। The policy applies॥"),
    ["هل تمت الموافقة؟", "نعم تمت الموافقة।", "The policy applies॥"],
  );
});

test("splits Arabic-script full stop sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("یہ پالیسی لاگو ہے۔ مینیجر استثنا منظور کرتا ہے۔ Next policy applies."),
    [
      "یہ پالیسی لاگو ہے۔",
      "مینیجر استثنا منظور کرتا ہے۔",
      "Next policy applies.",
    ],
  );
});

test("splits Unicode ellipsis sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("The review is pending… Managers approve exceptions."),
    ["The review is pending…", "Managers approve exceptions."],
  );
});

test("splits Armenian, Ethiopic, and Mongolian sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("Կանոնը գործում է։ Նոր կանոնը սկսվում է։ ሕጉ ይሠራል። ᠳᠦᠷᠢᠮ ᠬᠦᠴᠦᠨ ᠲᠡᠢ᠃ Next policy applies."),
    [
      "Կանոնը գործում է։",
      "Նոր կանոնը սկսվում է։",
      "ሕጉ ይሠራል።",
      "ᠳᠦᠷᠢᠮ ᠬᠦᠴᠦᠨ ᠲᠡᠢ᠃",
      "Next policy applies.",
    ],
  );
});

test("splits Armenian and Ethiopic question and paragraph terminators", () => {
  assert.deepEqual(
    splitIntoSentences("Կանոնը գործում է՞ Նոր կանոնը սկսվում է։ ሕጉ ይሠራል፧ ተጨማሪ መረጃ እዚህ አለ፨ Next policy applies."),
    [
      "Կանոնը գործում է՞",
      "Նոր կանոնը սկսվում է։",
      "ሕጉ ይሠራል፧",
      "ተጨማሪ መረጃ እዚህ አለ፨",
      "Next policy applies.",
    ],
  );
});

test("splits Tibetan shad sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("གཏན་འབེབས་འདི་ལག་ལེན་བྱེད། སྲིད་བྱུས་གསར་པ་འགོ་འཛུགས། Next policy applies."),
    [
      "གཏན་འབེབས་འདི་ལག་ལེན་བྱེད།",
      "སྲིད་བྱུས་གསར་པ་འགོ་འཛུགས།",
      "Next policy applies.",
    ],
  );
});

test("splits Thai sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("นโยบายนี้มีผลใช้บังคับ๚ ผู้จัดการอนุมัติข้อยกเว้น๛ Next policy applies."),
    [
      "นโยบายนี้มีผลใช้บังคับ๚",
      "ผู้จัดการอนุมัติข้อยกเว้น๛",
      "Next policy applies.",
    ],
  );
});

test("splits Khmer sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("គោលការណ៍នេះមានប្រសិទ្ធភាព។ អ្នកគ្រប់គ្រងត្រូវអនុម័ត។ Next policy applies."),
    [
      "គោលការណ៍នេះមានប្រសិទ្ធភាព។",
      "អ្នកគ្រប់គ្រងត្រូវអនុម័ត។",
      "Next policy applies.",
    ],
  );
});

test("splits alternate Khmer sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("គោលការណ៍នេះមានប្រសិទ្ធភាព៕ អ្នកគ្រប់គ្រងត្រូវអនុម័ត៚ Next policy applies."),
    ["គោលការណ៍នេះមានប្រសិទ្ធភាព៕", "អ្នកគ្រប់គ្រងត្រូវអនុម័ត៚", "Next policy applies."],
  );
});

test("splits Myanmar sentence terminators", () => {
  assert.deepEqual(
    splitIntoSentences("ဤမူဝါဒသည် အကျုံးဝင်သည်။ မန်နေဂျာသည် ခြွင်းချက်ကို အတည်ပြုသည်။ Next policy applies."),
    [
      "ဤမူဝါဒသည် အကျုံးဝင်သည်။",
      "မန်နေဂျာသည် ခြွင်းချက်ကို အတည်ပြုသည်။",
      "Next policy applies.",
    ],
  );
});

test("renders readable previews from exported html answers", () => {
  assert.equal(
    renderAnswerPreview(`<!doctype html>
<html>
  <head>
    <title>Ignored</title>
    <style>.hidden { display: none; }</style>
  </head>
  <body>
    <main>
      <h1>Support Queue</h1>
      <p>Refunds are available within 30 days of purchase.</p>
    </main>
  </body>
</html>`),
    "Support Queue Refunds are available within 30 days of purchase.",
  );
});

test("decodes common html entities in previews", () => {
  assert.equal(
    renderAnswerPreview("<p>Managers approve travel &amp; lodging within 5 days &lt;when policy applies&gt;.</p>"),
    "Managers approve travel & lodging within 5 days <when policy applies>.",
  );
});

test("ignores screen-reader-only html sections in previews", () => {
  assert.equal(
    renderAnswerPreview(`<!doctype html>
<html>
  <body>
    <div class="sr-only">
      <p>Skip to main content</p>
    </div>
    <section class="visually-hidden announcement">
      <p>Dialog closed</p>
    </section>
    <main>
      <p>Refunds are available within 30 days of purchase.</p>
    </main>
  </body>
</html>`),
    "Refunds are available within 30 days of purchase.",
  );
});

test("ignores common html page chrome in previews", () => {
  assert.equal(
    renderAnswerPreview(`<!doctype html>
<html>
  <body>
    <nav>
      <a href="/kb">Knowledge base home</a>
    </nav>
    <dialog open>
      <p>Copied to clipboard.</p>
    </dialog>
    <iframe src="https://example.com/widget">
      <p>Open in a new tab.</p>
    </iframe>
    <main>
      <p>Refunds are available within 30 days of purchase.</p>
    </main>
    <footer>
      <p>Contact support</p>
    </footer>
  </body>
</html>`),
    "Refunds are available within 30 days of purchase.",
  );
});
