/* The verdict has to tell a private service from an invasive one.
 *
 * Mirror of tests/test_calibration.py in the core repo. Run over 20 real
 * policies, the generic rule set used to return Warning for every one and a
 * risk score that mostly measured length. These tests pin the fix.
 *
 * Two kinds. The sentences are the exact real ones that misfired, so a rule
 * change that brings a false positive back fails by name. The fixtures are
 * real excerpts whose decision, risk score and rules are held to what the
 * Python pipeline produces for the same text, which also checks that the two
 * implementations still agree. The expected values below are Python's.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { run } from "../src/core/main.js";
import { score, SEVERITY_WEIGHTS } from "../src/core/scorer.js";
import { translate } from "../src/core/translator.js";
import { Severity } from "../src/core/models.js";

function fixture(name) {
  const raw = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  return raw.split("\n# ---\n").pop().replace(/^\n+|\n+$/g, "");
}

const rulesFired = (text, tagSet = "generic") =>
  Object.fromEntries(run({ text, tagSet }).findings.map((f) => [f.ruleId, f.severity]));

/* ---------- sentences that misfired on real policies ---------- */

test("a denial, or a heading phrased as a question, is not third-party sharing", () => {
  for (const sentence of [
    "No user data is ever shared with third parties in that process.",
    "This Privacy Policy does not apply to information that You provide to, or that is collected by, any third-party.",
    "DOES PAYTM SHARE PERSONAL DATA WITH THIRD PARTIES/ SUBSIDIARIES/AFFILIATES?",
  ]) {
    assert.ok(!("gdpr.sharing.third_party" in rulesFired(sentence)), sentence);
  }
});

test("not to sell is not a sale, and buying from brokers is not selling to them", () => {
  assert.ok(!("gdpr.sharing.sale" in rulesFired("Not to sell your Personal Data to any third party.")));
  assert.ok(!("gdpr.sharing.sale" in rulesFired(
    "Data brokers from which we purchase demographic data and contact information to supplement the data we collect."
  )));
});

test("a commitment not to profile is not targeted advertising", () => {
  const text = "Ad clicks are managed by Microsoft's ad network and Microsoft has committed to not " +
    "associate your ad-click behavior with a user profile and to not store or share that information.";
  assert.ok(!("gdpr.tracking.targeted_ads" in rulesFired(text)));
});

test("non-personal data kept indefinitely, and a bare right to update, are not findings", () => {
  assert.ok(!("gdpr.retention.indefinite" in rulesFired("Non-Personal Information may be retained indefinitely as appropriate.")));
  assert.ok(!("gdpr.change.unilateral" in rulesFired(
    "Within the limits of applicable law, the Company reserves the right to review and change this Privacy Policy at any time."
  )));
});

/* ---------- loosened rules still catch the real thing ---------- */

test("what should still fire still fires", () => {
  assert.equal(rulesFired("We sell your personal information to other companies.")["gdpr.sharing.sale"], "high");
  assert.ok("gdpr.sharing.sale" in rulesFired("We may sell your information to data brokers for marketing."));
  assert.equal(rulesFired("We may share your information with advertising partners.")["gdpr.tracking.targeted_ads"], "medium");
  assert.ok("gdpr.change.unilateral" in rulesFired("We may modify these terms at our sole discretion and without prior notice."));
  assert.ok("gdpr.retention.indefinite" in rulesFired("We keep your personal data forever, even after you close your account."));
  assert.equal(rulesFired("We may use your data to develop and train our AI models.")["ai.training_on_user_content"], "high");
  assert.equal(
    rulesFired("We may share your personal data with third parties for their own marketing purposes.")["gdpr.sharing.third_party"],
    "medium"
  );
});

test("sharing with processors acting for the service is only a note", () => {
  for (const sentence of [
    "We work with third parties to provide some of our Services.",
    "We rely on service providers to process payments on our behalf.",
    "For information voluntarily provided in surveys, we sometimes use additional vendors for processing.",
  ]) {
    assert.equal(rulesFired(sentence)["gdpr.sharing.third_party"], "low", sentence);
  }
});

/* ---------- whole documents: the JavaScript agrees with the Python ---------- */

const GOLDEN = {
  "generic_duckduckgo.txt": { decision: "allow", risk: 9 },
  "generic_proton.txt": { decision: "allow", risk: 17 },
  "generic_signal.txt": { decision: "allow", risk: 14 },
  "generic_microsoft.txt": { decision: "warning", risk: 48 },
  "generic_github.txt": { decision: "warning", risk: 50 },
  "generic_mozilla.txt": { decision: "warning", risk: 22 },
};

for (const [name, want] of Object.entries(GOLDEN)) {
  test(`${name} is ${want.decision} at risk ${want.risk}, as in Python`, () => {
    const v = run({ text: fixture(name), tagSet: "generic" });
    assert.equal(v.decision, want.decision);
    assert.equal(v.riskScore, want.risk);
  });
}

test("a lender is still denied under the lending rules, at the Python score", () => {
  const v = run({ text: fixture("loan_permissive_truebalance.txt"), tagSet: "loan_app" });
  assert.equal(v.decision, "deny");
  assert.equal(v.riskScore, 94);
});

test("the risk score orders private services below invasive ones", () => {
  const risk = (n) => run({ text: fixture(n), tagSet: "generic" }).riskScore;
  assert.ok(Math.max(risk("generic_duckduckgo.txt"), risk("generic_proton.txt"), risk("generic_signal.txt"))
    < Math.min(risk("generic_microsoft.txt"), risk("generic_github.txt")));
});

test("an allow keeps its notes and says there are no red flags", () => {
  const v = run({ text: fixture("generic_proton.txt"), tagSet: "generic" });
  assert.equal(v.decision, "allow");
  assert.ok(v.findings.length > 0);
  assert.equal(v.metadata.notes_only, true);
  assert.equal(v.metadata.headline, "No red flags detected in this policy.");
});

test("an allow with notes is translated as no red flags, never as flagged", () => {
  const v = run({ text: fixture("generic_proton.txt"), tagSet: "generic", language: "mr" });
  assert.equal(v.decision, "allow");
  assert.equal(v.metadata.headline, "या धोरणात धोक्याचा कोणताही संकेत आढळला नाही.");
});

/* ---------- scorer rules ---------- */

const finding = (severity, ruleId, index = 0) => ({
  ruleId, category: "testing", severity, reason: `r-${ruleId}-${index}`, clause: { index }, confidence: 1,
});
const scoreOf = (findings) => score(findings, { ruleSet: "generic", origin: "t", clausesAnalyzed: 10 });

test("minor findings alone are an allow with notes", () => {
  for (const severity of [Severity.INFO, Severity.LOW, Severity.MEDIUM]) {
    const v = scoreOf([finding(severity, "a")]);
    assert.equal(v.decision, "allow");
    assert.equal(v.findings.length, 1);
    assert.equal(v.metadata.notes_only, true);
  }
});

test("a high finding is a warning", () => {
  const v = scoreOf([finding(Severity.HIGH, "a")]);
  assert.equal(v.decision, "warning");
  assert.equal(v.metadata.notes_only, undefined);
});

test("one medium rule is a note, two different medium rules are a warning", () => {
  assert.equal(scoreOf([finding(Severity.MEDIUM, "a")]).decision, "allow");
  assert.equal(scoreOf([finding(Severity.MEDIUM, "a"), finding(Severity.MEDIUM, "b")]).decision, "warning");
});

test("the same medium rule fifty times is still one rule", () => {
  const many = Array.from({ length: 50 }, (_, i) => finding(Severity.MEDIUM, "same", i));
  assert.equal(scoreOf(many).decision, "allow");
});

test("a pile of mild findings does not become a warning by count", () => {
  const mild = Array.from({ length: 12 }, (_, i) => finding(Severity.LOW, `r${i}`, i));
  assert.equal(scoreOf(mild).decision, "allow");
});

test("a critical finding still denies, even among mild ones", () => {
  assert.equal(scoreOf([finding(Severity.LOW, "a"), finding(Severity.CRITICAL, "b")]).decision, "deny");
});

test("a rule counts once, at its worst match", () => {
  const once = scoreOf([finding(Severity.MEDIUM, "r")]).riskScore;
  const many = scoreOf(Array.from({ length: 60 }, (_, i) => finding(Severity.MEDIUM, "r", i))).riskScore;
  assert.equal(once, SEVERITY_WEIGHTS[Severity.MEDIUM]);
  assert.equal(many, once);
  assert.equal(scoreOf([finding(Severity.LOW, "r", 0), finding(Severity.HIGH, "r", 1)]).riskScore, SEVERITY_WEIGHTS[Severity.HIGH]);
});

test("different rules add up, capped at 100", () => {
  assert.equal(scoreOf([finding(Severity.MEDIUM, "a"), finding(Severity.MEDIUM, "b")]).riskScore, 2 * SEVERITY_WEIGHTS[Severity.MEDIUM]);
  const lots = Array.from({ length: 10 }, (_, i) => finding(Severity.CRITICAL, `r${i}`, i));
  assert.equal(scoreOf(lots).riskScore, 100);
});

test("translate leaves an untranslated allow alone when the language is the same", () => {
  const v = run({ text: fixture("generic_proton.txt"), tagSet: "generic" });
  assert.equal(translate(v, "en"), v);
});
