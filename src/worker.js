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

import { getSettings, getCachedVerdict, setCachedVerdict } from "./settings.js";

const REMEMBERED_TAG_SET = "tagSet";

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

  // Content script found a policy link — check cache and tell it what to do.
  if (message.type === "privup:policy-detected") {
    const tabId = sender.tab?.id;
    (async () => {
      const settings = await getSettings();
      if (!settings.autoDetect) {
        sendResponse({ action: "skip" });
        return;
      }

      const cached = await getCachedVerdict(message.origin);
      if (cached) {
        await setBadge(tabId, cached.decision);
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
