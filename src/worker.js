/* Service worker.
 *
 * Does almost nothing on purpose. The pipeline runs in the content script,
 * where the page text already is, so nothing needs to cross a process
 * boundary and no policy text is ever held outside the tab that is showing
 * it.
 *
 * This exists to:
 *  1. Turn a toolbar click into an analysis of the current page.
 *  2. Manage the toolbar badge (color + text) based on verdicts.
 *  3. Coordinate cache lookups so the content script knows whether to
 *     analyze or use a cached result.
 */

import { getSettings, getCachedVerdict, setCachedVerdict, dismissSite } from "./settings.js";

const REMEMBERED_TAG_SET = "tagSet";

// Largest policy page passed back to a content script, before compaction.
const MAX_FETCH_CHARS = 8_000_000;

/* ---- rendering a policy in a minimized window ---- */

const RENDER_LOAD_TIMEOUT_MS = 20_000;
const RENDER_SETTLE_MS = 10_000;

// Tabs this worker opened to read a policy. The content script runs in them
// too, and must not start its own scan or pop a panel in a window nobody sees.
const renderTabs = new Set();

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete") done(); }, done);
  });
}

/* Runs inside the policy page. Waits until its text stops growing, so a
 * policy fetched by the page's own scripts is there before it is read. */
async function readSettledText(maxWaitMs) {
  const count = () => (document.body?.innerText || "").split(/\s+/).filter(Boolean).length;
  const start = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - start < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 500));
    const now = count();
    if (now > 0 && now === last) {
      stable += 1;
      if (stable >= 3 && Date.now() - start >= 2000) break;
    } else {
      stable = 0;
      last = now;
    }
  }
  return document.body?.innerText || "";
}

/* Load `url` in a minimized, unfocused window, read its rendered text, and
 * close the window. The browser loads it exactly as it would for the user,
 * so this reads pages that refuse to be framed or that only render with
 * JavaScript. Only ever asked for after the user clicked. */
async function renderInWindow(url) {
  const win = await chrome.windows.create({ url, focused: false, state: "minimized" });
  const tabId = win.tabs?.[0]?.id;
  if (tabId !== undefined) renderTabs.add(tabId);
  try {
    if (tabId === undefined) throw new Error("no tab");
    await waitForLoad(tabId, RENDER_LOAD_TIMEOUT_MS);
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: readSettledText,
      args: [RENDER_SETTLE_MS],
    });
    return injection?.result || "";
  } finally {
    renderTabs.delete(tabId);
    chrome.windows.remove(win.id).catch(() => {});
  }
}

/* ---- badge rendering ---- */

const BADGE = {
  deny:    { text: "!",  color: "#E1573A" },
  warning: { text: "⚠",  color: "#C2761C" },
  allow:   { text: "✓",  color: "#2E8B62" },
};

async function setBadge(tabId, decision) {
  const info = BADGE[decision];
  if (!info || !tabId) return;
  try {
    await chrome.action.setBadgeText({ text: info.text, tabId });
    await chrome.action.setBadgeBackgroundColor({ color: info.color, tabId });
    await chrome.action.setTitle({
      title: `PrivUp: ${decision.charAt(0).toUpperCase() + decision.slice(1)}`,
      tabId,
    });
  } catch {
    // Tab may have closed between message and badge set.
  }
}

async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ text: "", tabId });
    await chrome.action.setTitle({ title: "Analyze this page with PrivUp", tabId });
  } catch {
    // Tab gone.
  }
}

/* ---- tag set memory ---- */

async function rememberedTagSet() {
  try {
    const settings = await getSettings();
    return settings.tagSet || "generic";
  } catch {
    return "generic";
  }
}

/* ---- toolbar click ---- */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  const tagSet = await rememberedTagSet();
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "privup:analyze", tagSet });
  } catch {
    // The content script is not present: a restricted page, or one loaded
    // before the extension was installed. Inject the loader and retry once.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/loader.js"],
      });
      await chrome.tabs.sendMessage(tab.id, { type: "privup:analyze", tagSet });
    } catch {
      // Nothing more to try. Chrome will not run a content script on its own
      // settings pages or the extension gallery, and that is not a bug.
    }
  }
});

/* ---- message handlers ---- */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return undefined;

  if (message.type === "privup:remember-tag-set" && message.tagSet) {
    chrome.storage.local.set({ [REMEMBERED_TAG_SET]: message.tagSet });
    return undefined;
  }

  if (message.type === "privup:dismiss-site" && message.origin) {
    (async () => {
      await dismissSite(message.origin);
    })();
    return undefined;
  }

  // Content script found a policy link — check cache and tell it what to do.
  if (message.type === "privup:policy-detected") {
    const tabId = sender.tab?.id;
    if (renderTabs.has(tabId)) {
      sendResponse({ action: "skip" });
      return undefined;
    }
    (async () => {
      const settings = await getSettings();
      if (!settings.autoDetect) {
        sendResponse({ action: "skip" });
        return;
      }

      // If user muted this site, set badge if cached, but do not popup
      if (settings.dismissedSites?.[message.origin]) {
        const cached = await getCachedVerdict(message.origin);
        if (cached) await setBadge(tabId, cached.decision);
        sendResponse({ action: "dismissed", settings });
        return;
      }

      const cached = await getCachedVerdict(message.origin);
      if (cached) {
        await setBadge(tabId, cached.decision);
        // If popupFrequency is first-visit, site was already seen; do not auto-popup
        if (settings.popupFrequency === "first-visit") {
          sendResponse({ action: "first-visit-cached", summary: cached, settings });
          return;
        }
        sendResponse({ action: "cached", summary: cached, settings });
        return;
      }

      sendResponse({ action: "analyze", settings });
    })();
    return true;  // keep the message channel open for async response
  }

  // Content script finished analyzing — cache the result and set the badge.
  if (message.type === "privup:verdict-ready") {
    const tabId = sender.tab?.id;
    (async () => {
      await setCachedVerdict(message.origin, message.summary);
      await setBadge(tabId, message.summary.decision);
    })();
    return undefined;
  }

  // Content script asking for a policy on another origin. A content script's
  // own fetch is bound by the page's CORS rules, so help.netflix.com cannot
  // be read from www.netflix.com; the worker is not. GET only, no cookies,
  // http(s) only, and only for a content script of this extension.
  if (message.type === "privup:fetch" && sender.tab && sender.id === chrome.runtime.id) {
    (async () => {
      try {
        const url = new URL(message.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("only http and https are fetched");
        }
        const response = await fetch(url.href, { credentials: "omit", redirect: "follow" });
        const text = await response.text();
        sendResponse({
          ok: response.ok,
          status: response.status,
          url: response.url || url.href,
          contentType: response.headers.get("content-type") || "",
          text: text.slice(0, MAX_FETCH_CHARS),
        });
      } catch (error) {
        sendResponse({ error: String(error?.message || error) });
      }
    })();
    return true;
  }

  // Content script asking for a policy page to be rendered and read, after
  // the user clicked. See renderInWindow.
  if (message.type === "privup:render" && sender.tab && sender.id === chrome.runtime.id) {
    (async () => {
      try {
        const url = new URL(message.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("only http and https are rendered");
        }
        sendResponse({ text: await renderInWindow(url.href) });
      } catch (error) {
        sendResponse({ error: String(error?.message || error) });
      }
    })();
    return true;
  }

  // Content script reporting a banner verdict — set the badge.
  if (message.type === "privup:banner-verdict") {
    const tabId = sender.tab?.id;
    (async () => {
      await setBadge(tabId, message.decision);
    })();
    return undefined;
  }

  return undefined;
});

/* ---- clear badge on navigation ---- */

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    clearBadge(tabId);
  }
});
