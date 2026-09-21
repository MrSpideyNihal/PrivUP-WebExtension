/* Shared schemas. Mirror of core/models/schemas.py.
 *
 * Field names, defaults and serialisation match the Python exactly, because a
 * parity test compares the two implementations' Verdict objects field for
 * field. When they disagree, the Python is right and this file is wrong.
 */

export const Severity = Object.freeze({
  INFO: "info",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
});

// Load-bearing order: the scorer compares severities, and critical is what
// turns a Warning into a Deny.
const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"];

export function severityRank(value) {
  return SEVERITY_ORDER.indexOf(value);
}

export function worstSeverity(values) {
  let worst = null;
  for (const value of values) {
    if (worst === null || severityRank(value) > severityRank(worst)) worst = value;
  }
  return worst;
}

export const Decision = Object.freeze({
  ALLOW: "allow",
  WARNING: "warning",
  DENY: "deny",
});

export function utcNow() {
  return new Date().toISOString();
}

/* Raw policy text plus where it came from. The only object in the pipeline
 * that may have touched the network. In the extension nothing does: a content
 * script already has the page text. */
export function driverResult({
  rawText,
  origin,
  driver,
  contentType = "text/plain",
  fetchedAt = utcNow(),
  metadata = {},
}) {
  return { rawText, origin, driver, contentType, fetchedAt, metadata };
}

export function isEmpty(result) {
  return !result.rawText || result.rawText.trim() === "";
}

/* One sentence-level unit of policy text, with the heading it sat under. */
export function clause({ text, index, heading = null, charStart = -1, charEnd = -1 }) {
  return { text, index, heading, charStart, charEnd };
}

/* Mirrors Python's f"c{index:04d}". The negative case matters: an absence
 * finding uses index -1, and Python pads to four characters *including* the
 * sign to give "c-001", where a naive padStart gives "c00-1". Found by the
 * parity harness, which is the point of having one. */
export function clauseId(c) {
  const index = c.index;
  const digits = String(Math.abs(index));
  return `c${index < 0 ? "-" : ""}${digits.padStart(index < 0 ? 3 : 4, "0")}`;
}

export function clauseToDict(c) {
  return {
    clause_id: clauseId(c),
    text: c.text,
    index: c.index,
    heading: c.heading,
    char_start: c.charStart,
    char_end: c.charEnd,
  };
}

/* One clause matched by one rule, and why that matters. The clause is
 * embedded rather than referenced, so a finding is self-contained and the
 * popup can render the evidence without the clause list. */
export function finding({
  ruleId,
  ruleSet,
  category,
  severity,
  reason,
  clause: c,
  matchedText = "",
  confidence = 1.0,
  reference = null,
  metadata = {},
}) {
  return {
    ruleId,
    ruleSet,
    category,
    severity,
    reason,
    clause: c,
    matchedText,
    confidence,
    reference,
    metadata,
  };
}

export function findingToDict(f) {
  return {
    rule_id: f.ruleId,
    rule_set: f.ruleSet,
    category: f.category,
    severity: f.severity,
    reason: f.reason,
    clause: clauseToDict(f.clause),
    matched_text: f.matchedText,
    confidence: f.confidence,
    reference: f.reference,
    metadata: f.metadata,
  };
}

/* The answer PrivUp hands back. */
export function verdict({
  decision,
  ruleSet,
  origin,
  reasons = [],
  findings = [],
  riskScore = 0.0,
  clausesAnalyzed = 0,
  language = "en",
  analyzedAt = utcNow(),
  metadata = {},
}) {
  return {
    decision,
    ruleSet,
    origin,
    reasons,
    findings,
    riskScore,
    clausesAnalyzed,
    language,
    analyzedAt,
    metadata,
  };
}

export function isBlocking(v) {
  return v.decision === Decision.DENY;
}

export function verdictToDict(v) {
  return {
    decision: v.decision,
    rule_set: v.ruleSet,
    origin: v.origin,
    reasons: v.reasons,
    findings: v.findings.map(findingToDict),
    risk_score: v.riskScore,
    clauses_analyzed: v.clausesAnalyzed,
    language: v.language,
    analyzed_at: v.analyzedAt,
    metadata: v.metadata,
  };
}
