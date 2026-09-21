/* Content script: notice a consent banner, analyze it, show the verdict.
 *
 * The trigger is a MutationObserver, because consent banners are almost never
 * in the initial HTML. They are injected by a consent platform milliseconds
 * to seconds after load, which is exactly the moment PrivUp needs to speak:
 * before the user taps Accept.
 *
 * Everything runs here, in the page's own process. No network request is made
 * without a click, and none is ever made to anywhere but the site the user is
 * already on.
 */

import { availableTagSets, run, runOnClauses } from "./core/main.js";
import { clausesFromDom, findPolicyLink, looksLikeBanner } from "./dom.js";
import { removePanel, renderPanel } from "./panel.js";

const DEFAULT_TAG_SET = "generic";
const SETTLE_MS = 350;
const MAX_DOCUMENT_CHARS = 400_000;

const state = {
  tagSet: DEFAULT_TAG_SET,
  banner: null,
  policyLink: null,
  source: "banner",
  shown: false,
};

/* ---------- analysis ---------- */

function analyzeBanner() {
  const clauses = clausesFromDom(state.banner);
  return runOnClauses({ clauses, tagSet: state.tagSet, origin: location.href });
}

function analyzeWholePage() {
  const clauses = clausesFromDom(document.body);
  return runOnClauses({ clauses, tagSet: state.tagSet, origin: location.href });
}

function analyzeText(text) {
  return run({
    text,
    tagSet: state.tagSet,
    origin: state.policyLink ? state.policyLink.url : location.href,
    contentType: "text/html",
  });
}

/* Fetch the linked policy and analyze it. Only on a click, only same-origin,
 * and it sends nothing: it is a plain GET for a public document on the site
 * the user is already reading. */
async function deepen(button) {
  const link = state.policyLink;
  if (!link) return;

  button.disabled = true;
  button.textContent = "Reading the policy";
  try {
    const response = await fetch(link.url, { credentials: "omit", redirect: "follow" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = (await response.text()).slice(0, MAX_DOCUMENT_CHARS);
    state.source = "policy";
    show(analyzeText(html));
  } catch (error) {
    button.disabled = false;
    button.textContent = "Could not read it. Try again";
  }
}

/* ---------- rendering ---------- */

function currentVerdict() {
  if (state.source === "page") return analyzeWholePage();
  return analyzeBanner();
}

function show(verdict) {
  state.shown = true;
  renderPanel({
    verdict,
    tagSet: state.tagSet,
    tagSets: availableTagSets(),
    onTagSet: switchTagSet,
    onDeepen: state.policyLink && state.source !== "policy" ? deepen : null,
    deepenLabel: state.policyLink ? "Analyze the full privacy policy" : null,
  });
}

/* Changing the rule set re-runs the pipeline rather than filtering the
 * result. A rule set is not a view over one answer, it is a different
 * question being asked.
 *
 * If the current answer came from a fetched policy, that text is no longer
 * held, and refetching silently would be a network call the user did not ask
 * for. So it falls back to what is on the page and offers the button again. */
function switchTagSet(name) {
  state.tagSet = name;
  if (state.source === "policy") state.source = "banner";
  show(currentVerdict());
}

/* ---------- trigger ---------- */

function considerElement(element) {
  if (state.shown || !looksLikeBanner(element)) return false;

  state.banner = element;
  state.policyLink =
    findPolicyLink(element, location.origin) || findPolicyLink(document.body, location.origin);
  state.source = "banner";

  let verdict = analyzeBanner();
  // A banner is usually a sentence and a button. If it yields nothing worth
  // reporting, the page itself may be the policy, which is common when a
  // consent notice appears on a legal page.
  if (!verdict.findings.length) {
    const fromPage = analyzeWholePage();
    if (fromPage.findings.length) {
      state.source = "page";
      verdict = fromPage;
    }
  }

  show(verdict);
  return true;
}

function scan(root) {
  if (state.shown) return;
  if (considerElement(root)) return;
  if (!root.querySelectorAll) return;
  for (const candidate of root.querySelectorAll("div,section,aside,dialog,form")) {
    if (considerElement(candidate)) return;
  }
}

let settleTimer = null;

const observer = new MutationObserver((records) => {
  if (state.shown) return;
  const added = [];
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === 1) added.push(node); // ELEMENT_NODE
    }
  }
  if (!added.length) return;

  // Consent platforms build their banner in several mutations. Waiting for
  // the DOM to settle means reading a finished banner rather than a half-built
  // one, and it collapses a burst of mutations into one analysis.
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    for (const node of added) {
      if (state.shown) return;
      scan(node);
    }
  }, SETTLE_MS);
});

function start() {
  scan(document.body);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });

/* Toolbar click: analyze whatever is on the page right now, even with no
 * banner. Wired from the service worker. */
chrome.runtime?.onMessage?.addListener((message, _sender, respond) => {
  if (message?.type !== "privup:analyze") return undefined;

  state.shown = false;
  state.tagSet = message.tagSet || state.tagSet;
  state.banner = document.body;
  state.source = "page";
  state.policyLink = findPolicyLink(document.body, location.origin);

  removePanel();
  const verdict = analyzeWholePage();
  show(verdict);
  respond?.({ decision: verdict.decision, findings: verdict.findings.length });
  return true;
});

/* Dev-harness hook, present only when this is not running as an extension.
 * extension/dev/harness.html uses it to re-arm the trigger between banner
 * injections. Guarded so it never appears on a real page. */
if (!globalThis.chrome?.runtime?.id) {
  globalThis.__privupReset = () => {
    state.shown = false;
    removePanel();
  };
}
