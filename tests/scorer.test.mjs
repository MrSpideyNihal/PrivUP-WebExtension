import test from "node:test";
import assert from "node:assert/strict";
import { score } from "../src/core/scorer.js";
import { Severity } from "../src/core/models.js";

test("headline: clean document", () => {
  const v = score([], { ruleSet: "generic", origin: "test", clausesAnalyzed: 10 });
  assert.equal(v.metadata.headline, "No red flags detected in this policy.");
});

test("headline: unreadable document", () => {
  const v = score([], { ruleSet: "generic", origin: "test", clausesAnalyzed: 0 });
  assert.equal(v.metadata.headline, "No readable policy text found here.");
});

test("headline: single finding", () => {
  const f = [
    { ruleId: "gdpr.sharing.third_party", category: "third_party_sharing", severity: Severity.HIGH, reason: "test", clause: { index: 1 } },
  ];
  const v = score(f, { ruleSet: "generic", origin: "test", clausesAnalyzed: 10 });
  assert.equal(v.metadata.headline, "Third-party data sharing flagged.");
});

test("headline: multiple findings", () => {
  const f = [
    { ruleId: "gdpr.optout.absent", category: "consent", severity: Severity.HIGH, reason: "test", clause: { index: 1 } },
    { ruleId: "gdpr.sharing.third_party", category: "third_party_sharing", severity: Severity.MEDIUM, reason: "test", clause: { index: 2 } },
    { ruleId: "gdpr.change.unilateral", category: "unilateral_change", severity: Severity.MEDIUM, reason: "test", clause: { index: 3 } },
  ];
  const v = score(f, { ruleSet: "generic", origin: "test", clausesAnalyzed: 10 });
  assert.equal(
    v.metadata.headline,
    "No opt-out or deletion options, third-party data sharing, and terms changed without notice."
  );
});

test("headline: more than 3 findings includes counter", () => {
  const f = [
    { ruleId: "gdpr.optout.absent", category: "consent", severity: Severity.HIGH, reason: "test", clause: { index: 1 } },
    { ruleId: "gdpr.sharing.third_party", category: "third_party_sharing", severity: Severity.MEDIUM, reason: "test", clause: { index: 2 } },
    { ruleId: "gdpr.change.unilateral", category: "unilateral_change", severity: Severity.MEDIUM, reason: "test", clause: { index: 3 } },
    { ruleId: "gdpr.consent.bundled", category: "consent", severity: Severity.MEDIUM, reason: "test", clause: { index: 4 } },
  ];
  const v = score(f, { ruleSet: "generic", origin: "test", clausesAnalyzed: 10 });
  assert.equal(
    v.metadata.headline,
    "No opt-out or deletion options, third-party data sharing, and terms changed without notice (+1 more)."
  );
});
