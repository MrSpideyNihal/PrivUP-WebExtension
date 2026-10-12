/* Show a verdict in the user's language. Mirror of core/translator.
 *
 * Everything PrivUp says is written in advance, so translating a verdict is
 * a lookup in locales.generated.js, keyed by rule id. No model and no
 * request: nothing about the page or the policy leaves the browser.
 *
 * Runs after scoring, so it cannot change a decision. It rewrites what the
 * user reads (reasons, per-finding reasons, the headline, the relevance
 * notice) and leaves the policy's own words alone: clause text, matched
 * text, headings and citations stay in the language the policy was written
 * in. A wrong translation of a reason is a bad explanation; a wrong
 * translation of a clause would change what the user thinks the policy says.
 */

import { LOCALES } from "./locales.generated.js";

export const SOURCE_LANGUAGE = "en";

const PLACEHOLDER = /\{(\w+)\}/g;
const HEADLINE_TOPICS = 3;

export class UnknownLanguageError extends Error {}

/* Same formatting as analyzer.js, so a translated reason quotes exactly the
 * figure the English one does. */
function fill(template, values) {
  return template.replace(PLACEHOLDER, (whole, key) => {
    if (!(key in values)) return whole;
    const value = values[key];
    if (typeof value === "number" && !Number.isInteger(value)) {
      return String(parseFloat(value.toPrecision(6)));
    }
    return String(value);
  });
}

export function availableLanguages() {
  return Object.keys(LOCALES).sort();
}

export function describeLanguages() {
  return availableLanguages().map((code) => {
    const c = LOCALES[code];
    return { code, name: c.name, nativeName: c.native_name, reviewed: Boolean(c.reviewed) };
  });
}

export function isLanguage(code) {
  return Object.prototype.hasOwnProperty.call(LOCALES, code);
}

/* One UI message in `language`, falling back to English, then to the key. */
export function message(language, key, values = {}) {
  for (const code of [language, SOURCE_LANGUAGE]) {
    const template = LOCALES[code]?.messages?.[key];
    if (template !== undefined) return fill(template, values);
  }
  return key;
}

function ruleText(catalog, ruleId, variant) {
  return catalog.rules?.[ruleId]?.[variant] ?? null;
}

/* Return `verdict` with everything the user reads in `language`. Anything the
 * catalog does not cover stays in English and is listed under
 * metadata.translation.fallback. */
export function translate(verdict, language) {
  const from = verdict.language || SOURCE_LANGUAGE;
  if (language === from) return verdict;
  if (from !== SOURCE_LANGUAGE) {
    throw new Error(`can only translate from ${SOURCE_LANGUAGE}, this verdict is in ${from}`);
  }
  if (!isLanguage(language)) {
    throw new UnknownLanguageError(
      `unknown language ${language}; available languages: ${availableLanguages().join(", ")}`
    );
  }

  const catalog = LOCALES[language];
  const missing = new Set();
  const msg = (key, values) => {
    if (!(key in (catalog.messages || {}))) missing.add(`messages.${key}`);
    return message(language, key, values);
  };

  const findings = (verdict.findings || []).map((f) => {
    const variant = f.metadata?.reason_variant || "reason";
    const template = ruleText(catalog, f.ruleId, variant);
    if (template === null) {
      missing.add(`rules.${f.ruleId}.${variant}`);
      return f;
    }
    return {
      ...f,
      reason: fill(template, f.metadata?.reason_values || {}),
      metadata: { ...f.metadata, source_reason: f.reason },
    };
  });

  const meta = verdict.metadata || {};

  // Same rule as the scorer: one line per distinct reason, worst first.
  let reasons;
  if (meta.empty_document) {
    reasons = [msg("verdict.empty_document")];
  } else if (!findings.length) {
    reasons = [...(verdict.reasons || [])];
  } else {
    reasons = [...new Set(findings.map((f) => f.reason))];
  }

  const metadata = { ...meta };
  const headline = buildHeadline(meta, findings, catalog, msg, missing);
  if (headline !== null) metadata.headline = headline;

  if (meta.relevance?.notice) {
    const notice = catalog.rule_sets?.[verdict.ruleSet]?.relevance_notice;
    if (notice) metadata.relevance = { ...meta.relevance, notice };
    else missing.add(`rule_sets.${verdict.ruleSet}.relevance_notice`);
  }

  metadata.translation = {
    language,
    reviewed: Boolean(catalog.reviewed),
    complete: missing.size === 0,
    fallback: [...missing].sort(),
  };

  return { ...verdict, reasons, findings, language, metadata };
}

/* Rebuilt from per-language templates, because word order differs and
 * "X, Y, and Z flagged." does not survive being translated in pieces. */
function buildHeadline(meta, findings, catalog, msg, missing) {
  if (meta.headline === undefined || meta.headline === null) return null;
  if (meta.empty_document) return msg("headline.empty_document");
  if (!findings.length) return msg("headline.clean");

  const topics = [];
  for (const f of findings) {
    const label = ruleText(catalog, f.ruleId, "label");
    if (label === null) {
      // A headline mixing two languages reads worse than one in English.
      missing.add(`rules.${f.ruleId}.label`);
      return meta.headline;
    }
    if (!topics.includes(label)) topics.push(label);
  }

  const shown = topics.slice(0, HEADLINE_TOPICS);
  const remaining = topics.length - shown.length;
  const more = remaining ? msg("headline.more", { n: remaining }) : "";

  let text;
  if (shown.length === 1) text = msg("headline.one", { a: shown[0] });
  else if (shown.length === 2) text = msg("headline.two", { a: shown[0], b: shown[1], more });
  else text = msg("headline.three", { a: shown[0], b: shown[1], c: shown[2], more });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
