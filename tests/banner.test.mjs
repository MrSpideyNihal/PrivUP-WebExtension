/* Banner detection.
 *
 * Run with: node --test extension/tests/
 *
 * The verdict pipeline is covered by tests/test_js_parity.py, which holds the
 * JS to the Python's output field for field. What that cannot cover is the
 * DOM-only logic, because Python has no DOM. So this exercises it against a
 * small element stub that provides exactly what the detector reads.
 *
 * The false-positive cases here are the point. An earlier version treated any
 * element mentioning "Cookie Policy" as a banner, which meant the panel
 * appeared over every privacy policy a user deliberately opened, including
 * the whole <body>. That is worse than never appearing.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { looksLikeBanner } from "../src/dom.js";

// Minimal stand-in for the parts of an Element the detector touches.
function stub({
  tag = "DIV",
  text = "",
  id = "",
  className = "",
  role = null,
  ariaModal = null,
  position = "static",
  buttons = 1,
} = {}) {
  const attrs = { role, "aria-modal": ariaModal, "data-testid": "", "aria-label": "" };
  return {
    nodeType: 1,
    tagName: tag,
    id,
    className,
    textContent: text,
    getAttribute: (name) => attrs[name] ?? null,
    querySelector: () => (buttons > 0 ? { tagName: "BUTTON" } : null),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ position }) } },
  };
}

const BANNER_COPY =
  "We use cookies and similar technologies to personalise content and ads, to " +
  "provide social media features and to analyse our traffic.";

const POLICY_COPY =
  "We collect your personal data when you register with us. Read our Cookie Policy " +
  "and Privacy Policy for details on how we share information with third parties " +
  "and how long we retain it.";

test("a fixed-position cookie banner with a button is detected", () => {
  assert.equal(looksLikeBanner(stub({ text: BANNER_COPY, position: "fixed" })), true);
});

test("a sticky banner is detected", () => {
  assert.equal(looksLikeBanner(stub({ text: BANNER_COPY, position: "sticky" })), true);
});

test("a role=dialog consent modal is detected even when statically positioned", () => {
  assert.equal(
    looksLikeBanner(stub({
      text: "To process your loan application we request access to your contact list. I agree and consent",
      role: "dialog",
      position: "static",
    })),
    true
  );
});

test("a known consent platform container is detected", () => {
  assert.equal(
    looksLikeBanner(stub({
      id: "onetrust-banner-sdk",
      text: "This site asks for your consent to use your personal data.",
      position: "fixed",
    })),
    true
  );
});

test("an accept-all action is enough on its own", () => {
  assert.equal(
    looksLikeBanner(stub({
      text: "Manage preferences   Accept All Cookies",
      position: "fixed",
    })),
    true
  );
});

/* ---------- the false positives that made this necessary ---------- */

test("the document body is never a banner", () => {
  assert.equal(
    looksLikeBanner(stub({ tag: "BODY", text: POLICY_COPY, position: "static" })),
    false
  );
});

test("an article containing a policy is never a banner", () => {
  assert.equal(
    looksLikeBanner(stub({ tag: "ARTICLE", text: POLICY_COPY, position: "static" })),
    false
  );
});

test("mentioning a cookie policy in prose is not a banner", () => {
  // The bug: "Cookie Policy" is footer link text on every page of a site, and
  // matching it popped the panel over the policy itself.
  assert.equal(looksLikeBanner(stub({ text: POLICY_COPY, position: "static" })), false);
});

test("static prose is not a banner even with banner wording", () => {
  // A page explaining that it uses cookies is not a page asking about them.
  assert.equal(looksLikeBanner(stub({ text: BANNER_COPY, position: "static" })), false);
});

test("an overlay with nothing to click is not a banner", () => {
  assert.equal(
    looksLikeBanner(stub({ text: BANNER_COPY, position: "fixed", buttons: 0 })),
    false
  );
});

test("a whole page of text is not a banner", () => {
  assert.equal(
    looksLikeBanner(stub({ text: BANNER_COPY + " lorem ".repeat(600), position: "fixed" })),
    false
  );
});

test("a fragment too short to be a notice is not a banner", () => {
  assert.equal(looksLikeBanner(stub({ text: "Cookies", position: "fixed" })), false);
});

test("a script element is never a banner", () => {
  assert.equal(
    looksLikeBanner(stub({ tag: "SCRIPT", text: BANNER_COPY, position: "fixed" })),
    false
  );
});

test("non-elements are rejected without throwing", () => {
  assert.equal(looksLikeBanner(null), false);
  assert.equal(looksLikeBanner(undefined), false);
  assert.equal(looksLikeBanner({ nodeType: 3 }), false);
});
