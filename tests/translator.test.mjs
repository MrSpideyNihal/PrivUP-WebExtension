import test from "node:test";
import assert from "node:assert/strict";
import { LOCALES } from "../src/core/locales.generated.js";
import { RULE_SETS } from "../src/core/rulesets.generated.js";
import { run } from "../src/core/main.js";
import { score } from "../src/core/scorer.js";
import {
  SOURCE_LANGUAGE,
  UnknownLanguageError,
  availableLanguages,
  message,
  translate,
} from "../src/core/translator.js";

const LENDER_TEXT =
  "We access your contact list and call logs to assess creditworthiness. " +
  "Daily charges of up to 0.2% of the overdue principal amount apply to your loan. " +
  "Rate of Interest Up to 36% p.a. for every borrower.";

const TRANSLATED = availableLanguages().filter((code) => code !== SOURCE_LANGUAGE);

const placeholders = (text) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

/* ---------- catalogs ---------- */

test("hindi and marathi ship", () => {
  for (const code of ["en", "hi", "mr"]) assert.ok(availableLanguages().includes(code));
});

for (const code of TRANSLATED) {
  test(`${code}: covers every message and every rule, with placeholders intact`, () => {
    const catalog = LOCALES[code];
    const source = LOCALES[SOURCE_LANGUAGE].messages;

    assert.deepEqual(Object.keys(catalog.messages).sort(), Object.keys(source).sort());
    for (const [key, text] of Object.entries(catalog.messages)) {
      assert.deepEqual(placeholders(text), placeholders(source[key]), `${code} ${key}`);
    }

    for (const ruleSet of Object.values(RULE_SETS)) {
      for (const rule of ruleSet.rules) {
        const entry = catalog.rules[rule.id];
        assert.ok(entry?.label, `${code} ${rule.id}.label`);
        assert.ok(entry?.reason, `${code} ${rule.id}.reason`);
        assert.deepEqual(placeholders(entry.reason), placeholders(rule.reason), `${code} ${rule.id}`);
        if (rule.hedge_reason) {
          assert.ok(entry.hedge_reason, `${code} ${rule.id}.hedge_reason`);
        }
      }
    }
  });
}

/* ---------- behaviour ---------- */

test("english is returned unchanged", () => {
  const verdict = run({ text: LENDER_TEXT, tagSet: "loan_app" });
  assert.equal(translate(verdict, "en"), verdict);
  assert.equal(verdict.language, "en");
});

test("an unknown language is refused", () => {
  const verdict = run({ text: LENDER_TEXT, tagSet: "loan_app" });
  assert.throws(() => translate(verdict, "xx"), UnknownLanguageError);
});

for (const code of TRANSLATED) {
  test(`${code}: never changes the decision or the policy's own words`, () => {
    const english = run({ text: LENDER_TEXT, tagSet: "loan_app" });
    const translated = run({ text: LENDER_TEXT, tagSet: "loan_app", language: code });

    assert.equal(translated.decision, english.decision);
    assert.equal(translated.riskScore, english.riskScore);
    assert.equal(translated.language, code);
    assert.equal(translated.findings.length, english.findings.length);
    translated.findings.forEach((after, i) => {
      const before = english.findings[i];
      assert.equal(after.ruleId, before.ruleId);
      assert.equal(after.severity, before.severity);
      assert.deepEqual(after.clause, before.clause);
      assert.equal(after.matchedText, before.matchedText);
      assert.equal(after.metadata.source_reason, before.reason);
      assert.notEqual(after.reason, before.reason);
    });
    assert.deepEqual(translated.metadata.translation, {
      language: code, reviewed: Boolean(LOCALES[code].reviewed), complete: true, fallback: [],
    });
  });

  test(`${code}: 0.2% a day is still 73% a year`, () => {
    const translated = run({ text: LENDER_TEXT, tagSet: "loan_app", language: code });
    const penal = translated.findings.find((f) => f.ruleId === "rbi.charges.penal_daily");
    assert.ok(penal.reason.includes("73%"), penal.reason);
    assert.ok(!penal.reason.includes("{"));
  });
}

test("a hedged finding uses the hedged wording", () => {
  const text = "We ideally restrain from accessing mobile phone resources like file and media, contact list, call logs.";
  const english = run({ text, tagSet: "loan_app" });
  const hedged = english.findings.filter((f) => f.metadata.reason_variant === "hedge_reason");
  assert.ok(hedged.length, "expected a hedged finding");

  const translated = translate(english, "mr");
  for (const before of hedged) {
    const after = translated.findings.find((f) => f.ruleId === before.ruleId && f.clause === before.clause);
    assert.equal(after.reason, LOCALES.mr.rules[before.ruleId].hedge_reason);
  }
});

test("a rule with no translation stays english and is reported", () => {
  const english = run({ text: LENDER_TEXT, tagSet: "loan_app" });
  const saved = LOCALES.mr.rules["rbi.permission.contacts"];
  delete LOCALES.mr.rules["rbi.permission.contacts"];
  let translated;
  try {
    translated = translate(english, "mr");
  } finally {
    LOCALES.mr.rules["rbi.permission.contacts"] = saved;
  }
  const before = english.findings.find((f) => f.ruleId === "rbi.permission.contacts");
  const after = translated.findings.find((f) => f.ruleId === "rbi.permission.contacts");
  assert.equal(after.reason, before.reason);
  assert.equal(translated.metadata.translation.complete, false);
  assert.ok(translated.metadata.translation.fallback.includes("rules.rbi.permission.contacts.reason"));
  assert.equal(translated.metadata.headline, english.metadata.headline);
});

test("empty document", () => {
  const english = score([], { ruleSet: "generic", origin: "x", clausesAnalyzed: 0 });
  assert.deepEqual(english.reasons, [message("en", "verdict.empty_document")]);
  const translated = translate(english, "hi");
  assert.equal(translated.decision, "warning");
  assert.deepEqual(translated.reasons, [message("hi", "verdict.empty_document")]);
  assert.equal(translated.metadata.headline, message("hi", "headline.empty_document"));
});

test("headline is built from translated labels in the language's own order", () => {
  const translated = run({ text: LENDER_TEXT, tagSet: "loan_app", language: "mr" });
  const first = LOCALES.mr.rules[translated.findings[0].ruleId].label;
  assert.ok(translated.metadata.headline.startsWith("आढळले: "));
  assert.ok(translated.metadata.headline.includes(first));
});

test("english catalog matches the strings the scorer writes", () => {
  const clean = score([], { ruleSet: "generic", origin: "x", clausesAnalyzed: 4 });
  assert.equal(clean.metadata.headline, message("en", "headline.clean"));
});

test("message falls back to english, then to the key", () => {
  assert.equal(message("mr", "ui.risk"), "धोका");
  assert.equal(message("xx", "ui.risk"), "Risk");
  assert.equal(message("mr", "no.such.key"), "no.such.key");
  assert.equal(message("en", "ui.findings.many", { n: 3 }), "3 findings");
});

test("every string on the options page has a catalog key in every language", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../options.html", import.meta.url), "utf8");
  const keys = [...html.matchAll(/data-i18n(?:-count)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 30, `found only ${keys.length} tagged strings`);
  for (const code of availableLanguages()) {
    for (const key of keys) {
      assert.ok(key in LOCALES[code].messages, `${code} is missing ${key}`);
    }
  }
  for (const key of keys.filter((k) => k.endsWith(".count"))) {
    for (const code of availableLanguages()) {
      assert.equal(LOCALES[code].messages[key].split("{n}").length, 2, `${code} ${key} needs exactly one {n}`);
    }
  }
});
