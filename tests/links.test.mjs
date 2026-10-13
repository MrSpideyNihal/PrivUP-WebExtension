/* Choosing which link on a page is the privacy policy.
 *
 * The cases are real footers. Minecraft's is the one that broke: its policy
 * link reads "Privacy and Cookies" and points at a Microsoft redirector, and
 * the old scoring preferred a California opt-out form whose URL happened to
 * contain "privacy". That form has no policy text, so the panel reported the
 * policy could not be read.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { findPolicyLink, scorePolicyLink } from "../src/dom.js";

// The two things findPolicyLink reads from a root: anchors with href and text.
function footer(origin, links) {
  const anchors = links.map(([label, href]) => ({ href: new URL(href, origin).href, textContent: label }));
  return { querySelectorAll: () => anchors };
}

const pick = (origin, links) => findPolicyLink(footer(origin, links), origin)?.url ?? null;

test("Minecraft: the privacy statement, not the opt-out form", () => {
  const origin = "https://www.minecraft.net";
  assert.equal(pick(origin, [
    ["Privacy and Cookies", "https://go.microsoft.com/fwlink/?linkid=521839"],
    ["Consumer Health Privacy", "https://go.microsoft.com/fwlink/?linkid=2259814"],
    ["Terms of use", "https://minecraft.net/eula"],
    ["Your Privacy Choices", "https://aka.ms/YourCaliforniaPrivacyChoices"],
  ]), "https://go.microsoft.com/fwlink/?linkid=521839");
});

test("a same-site privacy policy beats terms", () => {
  assert.equal(pick("https://www.mpokket.in", [
    ["Terms & Conditions", "/legal/terms-conditions"],
    ["Privacy Policy", "/legal/privacy-policy"],
  ]), "https://www.mpokket.in/legal/privacy-policy");
});

test("terms are still used when there is no privacy link", () => {
  assert.equal(pick("https://shop.example", [
    ["About", "/about"],
    ["Terms of Service", "/terms"],
  ]), "https://shop.example/terms");
});

test("opt-out and settings pages are never chosen over the policy", () => {
  assert.equal(pick("https://site.example", [
    ["Do Not Sell or Share My Personal Information", "/privacy/do-not-sell"],
    ["Cookie Settings", "/privacy/cookie-settings"],
    ["Privacy", "/legal/privacy"],
  ]), "https://site.example/legal/privacy");
});

test("www and subdomains of the same site are not treated as another site", () => {
  const sameSite = scorePolicyLink(new URL("https://help.netflix.com/legal/privacy"), "Privacy", "https://www.netflix.com");
  const otherSite = scorePolicyLink(new URL("https://elsewhere.example/legal/privacy"), "Privacy", "https://www.netflix.com");
  assert.ok(sameSite > otherSite);
  const indian = scorePolicyLink(new URL("https://www.hdfc.bank.in/privacy-policy"), "Privacy Policy", "https://netbanking.hdfc.bank.in");
  assert.equal(indian, scorePolicyLink(new URL("https://netbanking.hdfc.bank.in/privacy-policy"), "Privacy Policy", "https://netbanking.hdfc.bank.in"));
});

test("an unrelated page is not a policy", () => {
  assert.equal(pick("https://site.example", [["Home", "/"], ["Careers", "/careers"]]), null);
});
