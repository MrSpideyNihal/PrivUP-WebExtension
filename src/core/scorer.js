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

const RULE_LABELS = {
  "gdpr.retention.indefinite": "indefinite data retention",
  "gdpr.retention.vague": "vague retention limits",
  "gdpr.sharing.sale": "selling personal data",
  "gdpr.sharing.third_party": "third-party data sharing",
  "gdpr.tracking.profiling": "user profiling",
  "gdpr.tracking.cross_site": "cross-site tracking",
  "gdpr.tracking.targeted_ads": "targeted advertising",
  "ai.training_on_user_content": "AI training on user content",
  "gdpr.consent.bundled": "bundled agreement",
  "gdpr.change.unilateral": "terms changed without notice",
  "gdpr.transfer.cross_border": "overseas data transfer",
  "gdpr.security.disclaimed": "disclaimed security liability",
  "gdpr.optout.absent": "no opt-out or deletion options",
  "rbi.permission.contacts": "reads phone contacts",
  "rbi.permission.call_logs": "reads call logs",
  "rbi.permission.sms": "reads text messages",
  "rbi.permission.files_media": "accesses device files",
  "rbi.permission.installed_apps": "inspects installed apps",
  "rbi.permission.one_time_unqualified": "continuous device access",
  "rbi.charges.interest_high": "high interest rates",
  "rbi.charges.penal_daily": "daily penal interest",
  "rbi.charges.non_refundable_fee": "non-refundable fees",
  "rbi.charges.processing_fee": "processing fee deductions",
  "rbi.charges.cooling_off_charged": "cooling-off exit fee",
  "rbi.charges.foreclosure_penalty": "early repayment penalty",
  "rbi.charges.undisclosed": "undisclosed open charges",
  "rbi.recovery.third_party_agents": "third-party debt recovery",
  "rbi.consent.no_withdrawal": "no consent withdrawal",
  "rbi.disclosure.no_lender_named": "unnamed regulated lender",
  "rbi.consent.bundled": "bundled consent",
};

/* Build a short human-readable summary of all findings for the verdict heading.
 * Translates findings into concise topical labels, sorts by severity, and joins
 * them into an informative sentence replacing generic placeholder copy. */
export function generateHeadline(orderedFindings) {
  if (!orderedFindings || !orderedFindings.length) return null;

  const seen = new Set();
  const topics = [];
  for (const f of orderedFindings) {
    const label = RULE_LABELS[f.ruleId] || (f.category ? f.category.replace(/_/g, " ") : null);
    if (label && !seen.has(label)) {
      seen.add(label);
      topics.push(label);
    }
  }

  if (!topics.length) {
    const fallbackReason = orderedFindings[0]?.reason?.replace(/\.\s*$/, "");
    return fallbackReason || "Concerns detected in policy.";
  }

  if (topics.length === 1) {
    const t = topics[0];
    return t.charAt(0).toUpperCase() + t.slice(1) + " flagged.";
  }

  const displayed = topics.slice(0, 3);
  const remaining = topics.length - displayed.length;
  let text = "";
  if (displayed.length === 2) {
    text = `${displayed[0]} and ${displayed[1]}`;
  } else {
    text = `${displayed[0]}, ${displayed[1]}, and ${displayed[2]}`;
  }
  if (remaining > 0) {
    text += ` (+${remaining} more)`;
  }
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
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
        metadata: { empty_document: true, headline: "No readable policy text found here." },
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
      metadata: { severity_counts: {}, categories: [], headline: "No red flags detected in this policy." },
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
      headline: generateHeadline(ordered),
    },
  });
}
