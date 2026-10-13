/* Get readable policy text from a linked policy URL.
 *
 * "No readable text" should mean the policy really could not be read, not
 * that the first thing tried did not work. Real sites fail a plain fetch in
 * several distinct ways, each found on a live site:
 *
 *   - markup so heavy the policy falls past the size cap (HDFC Bank: the
 *     policy starts 984k characters into 1.1 MB of markup)
 *   - a policy rendered by JavaScript on a page with enough menu text not to
 *     look like an empty shell (Myntra), or a plain shell (KreditBee)
 *   - a hub page listing several policies behind links (Navi)
 *   - a policy on another subdomain, which a content script cannot fetch
 *     because the page's CORS rules apply to it (Netflix, GitHub)
 *
 * So reading is a sequence of attempts, cheapest first, stopping as soon as
 * one yields a real document:
 *
 *   1. fetch, compact, clean
 *   2. text embedded in the page's framework data (no extra request)
 *   3. one hop to a policy sub-page, for hub pages
 *   4. render the page in a hidden same-origin frame and read the live DOM
 *   5. only when the user asked (toolbar click or "Analyze the full
 *      policy"): load the page in a minimized window and read what renders.
 *      For sites that refuse to be framed (Myntra) or render on another
 *      origin. Never done automatically, because it opens a window.
 *
 * Every request goes to the site the user is on, or to the policy it links
 * to, and never carries cookies except the same-origin frame, which is an
 * ordinary page view of the site already open.
 */

import { segment, cleanHtml, blocksFromText } from "./core/summarizer.js";
import { isSpaShell, recoverContent } from "./core/spa.js";
import { readableClausesFromDom } from "./dom.js";

/* After compaction. Compaction typically shrinks a page 3-10x, so this is a
 * guard against pathological pages, not a limit real policies reach. */
export const MAX_DOCUMENT_CHARS = 1_500_000;

/* Fewer clauses than this and the page is treated as not read: a policy is
 * never four sentences, but a hub page or a menu often is. */
export const MIN_READABLE_CLAUSES = 5;

const FRAME_TIMEOUT_MS = 10_000;
const FRAME_POLL_MS = 500;
// A menu renders before the policy does, so a short pause in growth right
// after load is not the end. KreditBee shows 25 words for 1.5 s, then 14,000.
const FRAME_MIN_WAIT_MS = 2_000;
const FRAME_STABLE_POLLS = 3;

/* ---------- compaction ---------- */

// The only attributes the cleaner reads. Everything else is weight.
const KEPT_ATTRIBUTES = new Set(["class", "id", "role", "aria-hidden"]);
const TAG = /<([a-zA-Z][\w-]*)(\s[^<>]*?)?(\/?)>/g;
const ATTRIBUTE = /([-\w:.]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g;

/* Strip what cannot be policy text before any size limit applies: scripts,
 * styles, comments, inline SVG, every attribute the cleaner does not read,
 * and runs of whitespace. Cutting first and stripping second is what lost
 * HDFC's policy. */
export function compactHtml(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(TAG, (whole, tag, attributes, selfClosing) => {
      if (!attributes) return whole;
      const kept = [];
      for (const match of attributes.matchAll(ATTRIBUTE)) {
        if (KEPT_ATTRIBUTES.has(match[1].toLowerCase())) kept.push(match[0]);
      }
      return `<${tag}${kept.length ? " " + kept.join(" ") : ""}${selfClosing}>`;
    })
    .replace(/\s{2,}/g, " ");
}

export function clausesFromHtml(html) {
  return segment(cleanHtml(compactHtml(html).slice(0, MAX_DOCUMENT_CHARS)));
}

/* Text recovered from framework data is prose or light markup. */
function clausesFromRecovered(text) {
  return /<[a-z][\s\S]*>/i.test(text) ? clausesFromHtml(text) : segment(blocksFromText(text));
}

/* ---------- hub pages ---------- */

const ANCHOR = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const PRIVACY_WORDS = /privacy|data[- ]protection|personal data/i;

/* A hub lists policies at paths under its own: /privacy-policy links to
 * /privacy-policy/general, /privacy-policy/mutual-fund and so on. Pick one,
 * preferring the general or main policy over a product-specific one. */
export function subPolicyLink(html, pageUrl) {
  let base;
  try { base = new URL(pageUrl); } catch { return null; }
  const prefix = base.pathname.replace(/\/+$/, "") + "/";

  const candidates = [];
  for (const [, href, label] of html.matchAll(ANCHOR)) {
    let url;
    try { url = new URL(href.replace(/&amp;/g, "&"), base); } catch { continue; }
    if (url.origin !== base.origin || !url.pathname.startsWith(prefix)) continue;
    if (url.pathname.replace(/\/+$/, "") + "/" === prefix) continue;

    const text = label.replace(/<[^>]+>/g, " ");
    let score = 0;
    if (/general|main|common|overall|group/i.test(url.pathname + " " + text)) score += 10;
    if (PRIVACY_WORDS.test(url.pathname + " " + text)) score += 5;
    candidates.push({ url: url.href, score, depth: url.pathname.split("/").length });
  }
  candidates.sort((a, b) => b.score - a.score || a.depth - b.depth);
  return candidates[0]?.url || null;
}

/* ---------- fetching ---------- */

/* Same-origin requests go from the page, as before. Anything else goes
 * through the service worker, which is not bound by the page's CORS rules.
 * Neither sends cookies. */
export async function fetchHtml(url) {
  if (new URL(url, location.href).origin === location.origin) {
    const response = await fetch(url, { credentials: "omit", redirect: "follow" });
    return {
      ok: response.ok,
      status: response.status,
      url: response.url || url,
      contentType: response.headers.get("content-type") || "",
      text: await response.text(),
    };
  }
  const reply = await chrome.runtime.sendMessage({ type: "privup:fetch", url });
  if (!reply || reply.error) throw new Error(reply?.error || "fetch failed");
  return reply;
}

/* ---------- rendering ---------- */

/* Load a same-origin page in an invisible frame and read what its scripts
 * render. The frame is laid out at a normal size, so the page renders as it
 * would for a reader, and positioned off-screen so it is never seen. */
export function renderInFrame(url, readClauses, { timeoutMs = FRAME_TIMEOUT_MS } = {}) {
  if (new URL(url, location.href).origin !== location.origin) return Promise.resolve([]);

  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;left:-20000px;top:0;width:1280px;height:900px;" +
      "border:0;opacity:0;pointer-events:none;";

    let best = [];
    let stableFor = 0;
    let timer = null;
    let loadedAt = 0;
    const started = Date.now();

    const finish = () => {
      clearInterval(timer);
      frame.remove();
      resolve(best);
    };

    const poll = () => {
      let clauses = [];
      try {
        const body = frame.contentDocument?.body;
        if (body) clauses = readClauses(body);
      } catch {
        // Not same-origin after redirects, or framing refused.
        return finish();
      }
      if (clauses.length > best.length) {
        best = clauses;
        stableFor = 0;
      } else {
        stableFor += 1;
      }
      // Done once the text has stopped growing for a while, or on timeout.
      const settled = best.length >= MIN_READABLE_CLAUSES
        && stableFor >= FRAME_STABLE_POLLS
        && Date.now() - loadedAt >= FRAME_MIN_WAIT_MS;
      if (settled || Date.now() - started > timeoutMs) finish();
    };

    frame.addEventListener("load", () => {
      loadedAt = Date.now();
      if (!timer) timer = setInterval(poll, FRAME_POLL_MS);
    });
    frame.src = url;
    document.documentElement.append(frame);
    // A frame that never fires load still gets cleaned up.
    setTimeout(() => { if (!timer) finish(); }, timeoutMs);
  });
}

/* Ask the service worker to load the page in a minimized window and return
 * its rendered text. Only ever called for an explicit user action. */
export async function renderInWindow(url) {
  const reply = await chrome.runtime.sendMessage({ type: "privup:render", url });
  if (!reply || reply.error) return [];
  return segment(blocksFromText(reply.text || ""));
}

/* ---------- the sequence ---------- */

/* Read the policy at `url`. Returns { clauses, url, method } on success, or
 * { unreadable } with "fetch_failed", "spa_shell" or "empty_document".
 *
 * `userAsked` allows the minimized-window step. `deps` exists for tests. */
export async function readPolicy(url, { userAsked = false, ...deps } = {}) {
  const {
    fetchPage = fetchHtml,
    render = (target) => renderInFrame(target, readableClausesFromDom),
    renderElsewhere = renderInWindow,
    log = () => {},
  } = deps;

  let page;
  try {
    page = await fetchPage(url);
  } catch (error) {
    log("fetch failed", error.message);
    page = null;
  }

  const attempts = [];
  const consider = (method, clauses, from = url) => {
    log(method, clauses.length);
    attempts.push({ method, clauses, url: from });
    return clauses.length >= MIN_READABLE_CLAUSES;
  };
  const best = () => attempts.reduce((a, b) => (b.clauses.length > a.clauses.length ? b : a));

  if (page?.ok) {
    const finalUrl = page.url || url;
    if (consider("html", clausesFromHtml(page.text), finalUrl)) return best();

    const recovered = await recoverContent(page.text, { url: finalUrl, enableWayback: false });
    if (recovered.recovered && recovered.text
        && consider(`recovered:${recovered.method}`, clausesFromRecovered(recovered.text), finalUrl)) {
      return best();
    }

    const sub = subPolicyLink(page.text, finalUrl);
    if (sub) {
      try {
        const subPage = await fetchPage(sub);
        if (subPage.ok && consider("sub_page", clausesFromHtml(subPage.text), subPage.url || sub)) {
          return best();
        }
      } catch (error) {
        log("sub-page fetch failed", error.message);
      }
    }
  }

  const rendered = await render(page?.url || url);
  if (consider("rendered", rendered, page?.url || url)) return best();

  if (userAsked) {
    let windowed = [];
    try {
      windowed = await renderElsewhere(page?.url || url);
    } catch (error) {
      log("window render failed", error.message);
    }
    if (consider("rendered_window", windowed, page?.url || url)) return best();
  }

  // A few sentences of menu text is not a policy, and analysing it would
  // report Allow for a page nobody managed to read. Say so instead.
  if (!page?.ok) return { unreadable: "fetch_failed" };
  return { unreadable: isSpaShell(page.text) ? "spa_shell" : "empty_document" };
}
