/* Rule-set loading and relevance.
 * Mirror of core/tags/{rules,registry,relevance}.py.
 *
 * The rule sets themselves are NOT defined here. They are generated from
 * core/tags/rulesets/*.json by tools/sync_rulesets.py into
 * rulesets.generated.js, and a test fails if the two drift. A contributor
 * adding a rule still adds one JSON file and it takes effect on both
 * platforms.
 */

import { RULE_SETS } from "./rulesets.generated.js";

export const SCOPE_CLAUSE = "clause";
export const SCOPE_DOCUMENT_ABSENT = "document_absent";

const NUMERIC_KINDS = new Set([
  "percent_annual", "percent_daily", "percent_monthly", "percent_any",
]);
const OPERATORS = new Set([">=", ">", "<=", "<"]);

export class RuleSetError extends Error {}

function compileAll(patterns, where, field) {
  return (patterns || []).map((pattern) => {
    try {
      return new RegExp(pattern, "gi");
    } catch (error) {
      throw new RuleSetError(`${where}: bad regex in ${field}: ${pattern} (${error.message})`);
    }
  });
}

function parseNumeric(raw, where) {
  if (!raw) return null;
  if (!NUMERIC_KINDS.has(raw.kind)) {
    throw new RuleSetError(`${where}: numeric.kind must be one of ${[...NUMERIC_KINDS]}`);
  }
  const operator = raw.operator || ">=";
  if (!OPERATORS.has(operator)) {
    throw new RuleSetError(`${where}: numeric.operator must be one of ${[...OPERATORS]}`);
  }
  if (raw.threshold === undefined) {
    throw new RuleSetError(`${where}: numeric.threshold is required`);
  }
  return { kind: raw.kind, operator, threshold: Number(raw.threshold) };
}

function parseRule(raw, source) {
  const id = (raw.id || "").trim();
  if (!id) throw new RuleSetError(`${source}: every rule needs a non-empty id`);
  const where = `${source}:${id}`;

  for (const required of ["category", "severity", "reason"]) {
    if (!raw[required]) throw new RuleSetError(`${where}: ${required} is required`);
  }

  const scope = raw.scope || SCOPE_CLAUSE;
  if (scope !== SCOPE_CLAUSE && scope !== SCOPE_DOCUMENT_ABSENT) {
    throw new RuleSetError(`${where}: unknown scope ${scope}`);
  }
  if (!raw.patterns || !raw.patterns.length) {
    throw new RuleSetError(`${where}: at least one pattern is required`);
  }

  const hedges = compileAll(raw.hedges, where, "hedges");
  if (hedges.length && !(raw.hedge_severity && raw.hedge_reason)) {
    throw new RuleSetError(`${where}: hedges require hedge_severity and hedge_reason`);
  }

  return {
    id,
    category: raw.category,
    severity: raw.severity,
    reason: raw.reason,
    patterns: compileAll(raw.patterns, where, "patterns"),
    requires: compileAll(raw.requires, where, "requires"),
    negations: compileAll(raw.negations, where, "negations"),
    hedges,
    hedgeSeverity: hedges.length ? raw.hedge_severity : null,
    hedgeReason: hedges.length ? raw.hedge_reason : null,
    numeric: parseNumeric(raw.numeric, where),
    scope,
    reference: raw.reference ?? null,
    note: raw.note || "",
    confidence: raw.confidence === undefined ? 1.0 : Number(raw.confidence),
    metadata: raw.metadata || {},
  };
}

export function parseRuleSet(data, source) {
  const name = (data.name || "").trim();
  if (!name) throw new RuleSetError(`${source}: rule set needs a non-empty name`);
  if (!Array.isArray(data.rules) || !data.rules.length) {
    throw new RuleSetError(`${source}: rule set needs a non-empty rules list`);
  }

  const rules = [];
  const seen = new Set();
  for (const entry of data.rules) {
    const rule = parseRule(entry, source);
    if (seen.has(rule.id)) throw new RuleSetError(`${source}: duplicate rule id ${rule.id}`);
    seen.add(rule.id);
    rules.push(rule);
  }

  return {
    name,
    description: data.description || "",
    reference: data.reference ?? null,
    metadata: data.metadata || {},
    rules,
    clauseRules: rules.filter((r) => r.scope === SCOPE_CLAUSE),
    absenceRules: rules.filter((r) => r.scope === SCOPE_DOCUMENT_ABSENT),
    categories: [...new Set(rules.map((r) => r.category))],
  };
}

const CACHE = new Map();

export function getTagSet(name) {
  if (CACHE.has(name)) return CACHE.get(name);
  const raw = RULE_SETS[name];
  if (!raw) {
    throw new RuleSetError(
      `unknown rule set ${name}; available rule sets: ${availableTagSets().join(", ")}`
    );
  }
  const parsed = parseRuleSet(raw, `${name}.json`);
  CACHE.set(name, parsed);
  return parsed;
}

export function availableTagSets() {
  return Object.keys(RULE_SETS).sort();
}

export function describeTagSets() {
  return availableTagSets().map((name) => {
    const set = getTagSet(name);
    return { name, description: set.description, rules: set.rules.length };
  });
}

/* ---------- relevance ---------- */

const DEFAULT_MIN_WORDS = 120;

/* Advisory, never a veto. Running a rule set against something it was not
 * written for stays allowed, but a user who picked the wrong option should be
 * told the fit looks wrong rather than handed a confident verdict on the
 * wrong grounds. */
export function checkRelevance(clauses, ruleSet) {
  const applies = { applies: true, notice: null, matched: [], required: 0 };
  const declared = ruleSet.metadata && ruleSet.metadata.relevance;
  if (!declared) return applies;

  const signals = (declared.signals || []).map((s) => String(s).toLowerCase()).filter(Boolean);
  if (!signals.length) return applies;

  const minimum = declared.min_signals === undefined ? 3 : Number(declared.min_signals);
  const minWords = declared.min_words === undefined ? DEFAULT_MIN_WORDS : Number(declared.min_words);
  const notice = declared.notice || "This document may not be the kind these rules were written for.";

  const haystack = clauses.map((c) => c.text).join("\n").toLowerCase();
  if (!haystack.trim()) return applies;
  // Too little text to draw a conclusion from. A false notice trains people
  // to ignore the real ones.
  if (haystack.split(/\s+/).filter(Boolean).length < minWords) return applies;

  const matched = [...new Set(signals.filter((s) => haystack.includes(s)))].sort();
  if (matched.length >= minimum) {
    return { applies: true, notice: null, matched, required: minimum };
  }
  return { applies: false, notice, matched, required: minimum };
}

export function relevanceToDict(result) {
  return {
    applies: result.applies,
    notice: result.notice,
    matched_signals: result.matched,
    required_signals: result.required,
  };
}
