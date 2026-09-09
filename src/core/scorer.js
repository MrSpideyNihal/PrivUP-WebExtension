/* Verdict generation. Mirror of core/scorer/scorer.py.
 *
 *   no findings          -> Allow
 *   any critical finding -> Deny
 *   anything else        -> Warning
 *
 * Nothing accumulates into a Deny. Severities are set by rule authors, and
 * escalating on volume would let a rule set with many weak rules out-vote one
 * with few precise ones.
 */

import { Decision, Severity, severityRank, verdict, worstSeverity } from "./models.js";

export const SEVERITY_WEIGHTS = {
  [Severity.INFO]: 1.0,
  [Severity.LOW]: 3.0,
  [Severity.MEDIUM]: 8.0,
  [Severity.HIGH]: 18.0,
  [Severity.CRITICAL]: 40.0,
};

export const DENY_AT = Severity.CRITICAL;

// Worst first, then document order, so the reason a user reads first is the
// reason that matters most.
function compareFindings(a, b) {
  const bySeverity = severityRank(b.severity) - severityRank(a.severity);
  if (bySeverity !== 0) return bySeverity;
  return a.clause.index - b.clause.index;
}

function riskScore(findings) {
  const total = findings.reduce(
    (sum, f) => sum + SEVERITY_WEIGHTS[f.severity] * f.confidence,
    0
  );
  return Math.round(Math.min(100.0, total) * 10) / 10;
}

export function score(findings, { ruleSet, origin, clausesAnalyzed = 0 }) {
  const ordered = [...findings].sort(compareFindings);

  if (!ordered.length) {
    // A document that produced no clauses produced no findings either, and
    // reporting Allow for it would be the worst bug this project could ship:
    // a confident green light for a page nobody managed to read.
    if (clausesAnalyzed === 0) {
      return verdict({
        decision: Decision.WARNING,
        ruleSet,
        origin,
        reasons: [
          "No readable policy text was found here, so nothing could be checked. " +
          "This is not an all-clear.",
        ],
        findings: [],
        riskScore: 0.0,
        clausesAnalyzed: 0,
        metadata: { empty_document: true },
      });
    }
    return verdict({
      decision: Decision.ALLOW,
      ruleSet,
      origin,
      reasons: [],
      findings: [],
      riskScore: 0.0,
      clausesAnalyzed,
      metadata: { severity_counts: {}, categories: [] },
    });
  }

  const worst = worstSeverity(ordered.map((f) => f.severity));
  const decision = severityRank(worst) >= severityRank(DENY_AT) ? Decision.DENY : Decision.WARNING;

  // Two rules can reach the same conclusion. The user does not need telling
  // twice, but the findings behind both are kept so the evidence remains.
  const reasons = [];
  const seen = new Set();
  for (const f of ordered) {
    if (!seen.has(f.reason)) {
      seen.add(f.reason);
      reasons.push(f.reason);
    }
  }

  const counts = {};
  for (const f of ordered) counts[f.severity] = (counts[f.severity] || 0) + 1;

  return verdict({
    decision,
    ruleSet,
    origin,
    reasons,
    findings: ordered,
    riskScore: riskScore(ordered),
    clausesAnalyzed,
    metadata: {
      severity_counts: counts,
      worst_severity: worst,
      categories: [...new Set(ordered.map((f) => f.category))].sort(),
    },
  });
}
