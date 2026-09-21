/* Service worker.
 *
 * Does almost nothing on purpose. The pipeline runs in the content script,
 * where the page text already is, so nothing needs to cross a process
 * boundary and no policy text is ever held outside the tab that is showing
 * it.
 *
 * This exists to turn a toolbar click into an analysis of the current page,
 * for the case where there is no consent banner: a policy page a user opened
 * deliberately, or a loan agreement they want checked.
 */

const REMEMBERED_TAG_SET = "tagSet";

async function rememberedTagSet() {
  try {
    const stored = await chrome.storage.local.get(REMEMBERED_TAG_SET);
    return stored[REMEMBERED_TAG_SET] || "generic";
  } catch {
    return "generic";
  }
}

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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "privup:remember-tag-set" && message.tagSet) {
    chrome.storage.local.set({ [REMEMBERED_TAG_SET]: message.tagSet });
  }
  return undefined;
});
