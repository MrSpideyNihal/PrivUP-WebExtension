/* Read clauses out of the live DOM, and spot consent banners.
 *
 * A content script has something the Python pipeline never does: the real,
 * parsed, laid-out document. So this walks the DOM instead of serialising it
 * back to HTML and re-parsing. It reuses the ported segmenter for sentence
 * splitting, so a clause produced here is the same shape as a clause produced
 * anywhere else.
 *
 * It also lets us drop things no HTML parser can know about, like an element
 * that is present but not visible.
 */

import { looksLikeHeading, normalizeText, segment } from "./core/summarizer.js";

// Node.ELEMENT_NODE and Node.TEXT_NODE, spelled numerically. The `Node`
// global exists in a browser but not in Node.js, and depending on it made
// this module impossible to unit-test outside one.
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/* Fewer clauses than this from what is visible, and hidden content is read
 * too. Matches MIN_READABLE_CLAUSES in reader.js. */
const MIN_VISIBLE_CLAUSES = 5;

const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "IFRAME",
  "OBJECT", "EMBED", "SELECT", "BUTTON", "TEXTAREA", "INPUT", "HEAD",
]);

const CHROME_TAGS = new Set(["NAV", "FOOTER", "HEADER", "ASIDE", "MENU"]);

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

const BLOCK_TAGS = new Set([
  "P", "DIV", "LI", "TR", "SECTION", "ARTICLE", "BLOCKQUOTE", "DD", "DT",
  "FIGCAPTION", "PRE", "MAIN", "UL", "OL", "TABLE", "FORM", "SPAN", "A",
  "STRONG", "EM", "B", "I", "LABEL", "TD", "TH",
]);

const CELL_TAGS = new Set(["TD", "TH"]);
const CELL_SEPARATOR = " | ";

function isHidden(element) {
  if (element.hidden) return true;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;
  return style.display === "none" || style.visibility === "hidden" || style.opacity === "0";
}

/* Collect block-level text from a DOM subtree.
 *
 * `includeHidden` reads elements that are present but not displayed. Off by
 * default, because hidden text is usually a closed menu. It is the fallback
 * for policies that keep every section in a collapsed accordion, or fade the
 * whole page in from opacity 0, where reading only what is visible reads
 * nothing at all. */
export function blocksFromDom(root, { includeHidden = false } = {}) {
  const blocks = [];
  let buffer = [];
  let bufferIsHeading = false;

  const flush = () => {
    let text = normalizeText(buffer.join(""));
    buffer = [];
    while (text.includes("|")) {
      const next = text.replace(/(?:\s*\|\s*)+/g, CELL_SEPARATOR).replace(/^[\s|]+|[\s|]+$/g, "");
      if (next === text) break;
      text = next;
    }
    if (text) blocks.push({ text, isHeading: bufferIsHeading });
    bufferIsHeading = false;
  };

  const walk = (node) => {
    if (node.nodeType === TEXT_NODE) {
      buffer.push(node.nodeValue || "");
      return;
    }
    if (node.nodeType !== ELEMENT_NODE) return;

    const tag = node.tagName;
    if (DROP_TAGS.has(tag) || CHROME_TAGS.has(tag)) return;
    if (!includeHidden) {
      if (node.getAttribute("aria-hidden") === "true") return;
      if (isHidden(node)) return;
    }

    const isBlock = BLOCK_TAGS.has(tag) || HEADING_TAGS.has(tag);
    const isStructural = isBlock && !CELL_TAGS.has(tag)
      && !["SPAN", "A", "STRONG", "EM", "B", "I", "LABEL"].includes(tag);

    if (isStructural) {
      flush();
      if (HEADING_TAGS.has(tag)) bufferIsHeading = true;
    }

    // Web components render into a shadow root, which childNodes does not
    // include. Open roots are readable; closed ones are not, by design.
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.childNodes) walk(child);
    }
    for (const child of node.childNodes) walk(child);

    if (CELL_TAGS.has(tag)) buffer.push(CELL_SEPARATOR);
    else if (isStructural) flush();
  };

  walk(root);
  flush();

  // A heading detected structurally stays a heading; otherwise fall back to
  // the plain-text shape test, since plenty of pages style a <p><strong> as a
  // section title.
  return blocks.map((block) => ({
    text: block.text,
    isHeading: block.isHeading || looksLikeHeading(block.text),
  }));
}

export function clausesFromDom(root, options) {
  return segment(blocksFromDom(root, options));
}

/* Visible text first; hidden text too only when the visible text is not
 * enough to be a policy. */
export function readableClausesFromDom(root) {
  const visible = clausesFromDom(root);
  if (visible.length >= MIN_VISIBLE_CLAUSES) return visible;
  const everything = clausesFromDom(root, { includeHidden: true });
  return everything.length > visible.length ? everything : visible;
}

/* ---------- consent banner detection ---------- */

// Names used by the major consent management platforms.
const CMP_NAMES = [
  "onetrust", "ot-sdk", "optanon", "didomi", "quantcast", "trustarc",
  "cookiebot", "cybotcookiebot", "cookielaw", "usercentrics", "sourcepoint",
  "sp_message", "cmpbox", "borlabs", "termly", "iubenda", "osano", "klaro",
  "tarteaucitron", "cookieyes", "complianz",
];

// Generic names, weaker than a platform name: plenty of pages have a div
// classed "cookie-info" that is not a banner.
const GENERIC_NAMES = [
  "cookie-banner", "cookie-consent", "cookie-notice", "cookiebanner",
  "consent-banner", "consent-modal", "consent-notice", "gdpr-banner",
  "gdpr-notice", "privacy-banner", "cc-banner", "cookie-bar",
];

// What a consent banner asks you to *do*. This is the reliable signal:
// a policy page describes cookies, a banner asks you to accept them.
const ACTION_TEXT =
  /\b(?:accept all|accept cookies|accept & close|accept and close|allow all|allow cookies|agree and (?:continue|close)|i agree|agree and consent|reject all|decline all|deny all|manage (?:cookies|preferences|consent|options|choices))\b/i;

// Banner prose. Notably absent: "cookie policy". That is footer link text
// present on every page of a site, and it made a privacy-policy article test
// positive as a banner, so PrivUp popped a panel over the very document a
// user had deliberately opened to read.
const NOTICE_TEXT =
  /\b(?:we use cookies|this (?:site|website|page) uses cookies|uses cookies (?:and|to)|your privacy choices|we and our partners (?:store|use|process)|store and access (?:personal )?(?:data|information) on your device)\b/i;

const MIN_BANNER_TEXT = 20;

// A real consent banner is a small overlay. Real ones checked run a few
// hundred characters; the earlier 6000 limit let a whole page qualify.
const MAX_BANNER_TEXT = 2500;

// Never a banner, whatever they contain. A banner is an overlay, never the
// document root or its main content. Same principle as the cleaner's
// structural-root exemption, and it exists for the same reason: a false
// positive here is catastrophic rather than untidy.
const NEVER_BANNER = new Set(["HTML", "BODY", "MAIN", "ARTICLE"]);

function names(element) {
  return [
    element.id || "",
    typeof element.className === "string" ? element.className : "",
    element.getAttribute("data-testid") || "",
    element.getAttribute("aria-label") || "",
  ].join(" ").toLowerCase();
}

/* Does this element sit over the page rather than in it?
 *
 * A consent banner is positioned: fixed to the viewport, sticky, or an
 * absolutely placed modal. Ordinary prose is not. This is the cheap
 * structural signal that separates "a page about cookies" from "a page asking
 * about cookies", and it is only available because a content script has the
 * laid-out document rather than serialised HTML.
 */
function isOverlay(element) {
  const role = element.getAttribute("role");
  if (role === "dialog" || role === "alertdialog") return true;
  if (element.getAttribute("aria-modal") === "true") return true;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return false;
  return ["fixed", "sticky", "absolute"].includes(style.position);
}

function hasAnAction(element) {
  if (element.querySelector('button, [role="button"], input[type="button"], input[type="submit"]')) {
    return true;
  }
  return ACTION_TEXT.test(element.textContent || "");
}

/* Is this element a consent banner?
 *
 * Requires all three: banner-ish wording or a known platform name, an overlay
 * position, and something to click. A false positive pops a panel over a page
 * for no reason, which is the fastest way to get an extension uninstalled,
 * and the panel appearing on top of a privacy policy someone opened on
 * purpose is worse than it never appearing at all.
 */
export function looksLikeBanner(element) {
  if (!element || element.nodeType !== ELEMENT_NODE) return false;
  if (DROP_TAGS.has(element.tagName) || NEVER_BANNER.has(element.tagName)) return false;

  const text = (element.textContent || "").trim();
  if (text.length < MIN_BANNER_TEXT || text.length > MAX_BANNER_TEXT) return false;

  const haystack = names(element);
  const platform = CMP_NAMES.some((name) => haystack.includes(name));
  const generic = GENERIC_NAMES.some((name) => haystack.includes(name));
  const wording = ACTION_TEXT.test(text) || NOTICE_TEXT.test(text);

  // A recognised platform container is evidence on its own; it still has to
  // be an overlay, which rules out that platform's inline settings page.
  if (!(platform || generic || wording)) return false;
  if (!isOverlay(element)) return false;
  if (!hasAnAction(element)) return false;

  return true;
}

/* Find a policy link inside a banner, or on the page. Returned for the user
 * to act on; nothing is fetched without a click.
 *
 * Scored mostly on the link text, because that is what the site wrote for a
 * person: real footers say "Privacy and Cookies" and point at a redirector
 * like go.microsoft.com/fwlink/?linkid=521839, whose path says nothing. The
 * path is supporting evidence, and pages that are about privacy without
 * being the policy (California opt-out forms, cookie settings) are pushed
 * down hard, since they hold no policy text at all. */
const PRIVACY_LABEL =
  /privacy (?:policy|notice|statement|and cookies|& cookies|cent(?:er|re))|data (?:protection|privacy) (?:policy|notice)/i;
const BARE_PRIVACY_LABEL = /\bprivacy\b/i;
const COOKIE_LABEL = /cookie (?:policy|notice)/i;
const TERMS_LABEL = /terms|conditions|\beula\b|legal/i;

const PRIVACY_PATH = /privacy|privacystatement/i;
const SUPPORTING_PATH = /data-protection|cookie-?policy|legal|terms|eula/i;

// Pages about privacy that are not a policy.
const NOT_A_POLICY = /choices|do[- ]?not[- ]?sell|opt[- ]?out|preferences|settings|california|ccpa|manage|request|dashboard|consent[- ]?form/i;

// Same site, not same origin: www.minecraft.net and minecraft.net are one
// site, and so are help.netflix.com and www.netflix.com.
function siteOf(hostname) {
  const parts = hostname.replace(/^www\./, "").split(".");
  // co.in, gov.in, com.au and the like: keep three labels.
  const keep = parts.length > 2 && parts[parts.length - 2].length <= 3 ? 3 : 2;
  return parts.slice(-keep).join(".");
}

export function scorePolicyLink(url, label, pageOrigin) {
  let score = 0;
  if (PRIVACY_LABEL.test(label)) score += 60;
  else if (BARE_PRIVACY_LABEL.test(label)) score += 40;
  else if (COOKIE_LABEL.test(label)) score += 35;
  else if (TERMS_LABEL.test(label)) score += 25;

  if (PRIVACY_PATH.test(url.pathname)) score += 40;
  else if (SUPPORTING_PATH.test(url.pathname)) score += 10;

  if (NOT_A_POLICY.test(label) || NOT_A_POLICY.test(url.pathname)) score -= 80;

  let pageHost = "";
  try { pageHost = new URL(pageOrigin).hostname; } catch { /* keep empty */ }
  if (siteOf(url.hostname) !== siteOf(pageHost)) score -= 20;
  return score;
}

export function findPolicyLink(root, pageOrigin) {
  const anchors = [...root.querySelectorAll("a[href]")];
  const scored = [];

  for (const anchor of anchors) {
    let url;
    try {
      url = new URL(anchor.href, pageOrigin);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;

    const label = (anchor.textContent || "").trim();
    const score = scorePolicyLink(url, label, pageOrigin);
    if (score > 0) scored.push({ url: url.href, label: label || url.href, score });
  }

  scored.sort((a, b) => b.score - a.score || a.url.length - b.url.length);
  return scored[0] || null;
}
