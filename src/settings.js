/* Settings and per-site verdict cache.
 *
 * All state lives in chrome.storage.local. This module is the only place
 * that knows the shape of that storage, so changing the schema means
 * changing one file.
 *
 * Imported by the content script, service worker, and options page.
 */

const SETTINGS_KEY = "privup:settings";
const CACHE_KEY = "privup:site-cache";

/* Bump this whenever the analysis pipeline changes in a way that makes
 * old cached verdicts unreliable. Old entries without this version are
 * automatically treated as stale and re-analyzed. */
const CACHE_VERSION = 2;

export const DEFAULTS = Object.freeze({
  autoDetect: true,              // scan every page for a privacy-policy link
  autoPanel: "deny",             // auto-show the panel: "never" | "deny" | "warning" | "always"
  popupStyle: "top-banner",      // "top-banner" | "bottom-right" | "top-center"
  popupFrequency: "first-visit", // "first-visit" (once per site) | "every-visit"
  cacheTtlHours: 24,             // re-analyze a site after this many hours
  tagSet: "generic",             // remembered default rule set
  dismissedSites: {},            // { [origin]: timestamp } sites where user chose "don't show again"
});

/* ---- settings ---- */

export async function getSettings() {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULTS, ...(stored[SETTINGS_KEY] || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: merged });
  return merged;
}

/* ---- per-site verdict cache ---- */

/* Cache entries are lightweight summaries, not full verdicts:
 *   { decision, riskScore, findingCount, tagSet, timestamp }
 * Keyed by origin (e.g. "https://www.mpokket.in"). */

async function readCache() {
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    return stored[CACHE_KEY] || {};
  } catch {
    return {};
  }
}

async function writeCache(cache) {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function getCachedVerdict(origin) {
  const cache = await readCache();
  const entry = cache[origin];
  if (!entry) return null;

  // Invalidate entries from older cache versions (e.g. before fetchPolicyOrPage).
  if ((entry.v || 1) < CACHE_VERSION) return null;

  const settings = await getSettings();
  const ageMs = Date.now() - (entry.timestamp || 0);
  const ttlMs = (settings.cacheTtlHours || 24) * 60 * 60 * 1000;
  if (ageMs > ttlMs) return null;  // stale

  return entry;
}

export async function setCachedVerdict(origin, summary) {
  const cache = await readCache();
  cache[origin] = { ...summary, v: CACHE_VERSION, timestamp: Date.now() };
  await writeCache(cache);
}

export async function clearCache() {
  await chrome.storage.local.remove(CACHE_KEY);
}

export async function getCacheStats() {
  const cache = await readCache();
  return { count: Object.keys(cache).length };
}

/* ---- dismissed sites (don't show again) ---- */

export async function dismissSite(origin) {
  const settings = await getSettings();
  const dismissed = { ...(settings.dismissedSites || {}) };
  dismissed[origin] = Date.now();
  await saveSettings({ dismissedSites: dismissed });
}

export async function undismissSite(origin) {
  const settings = await getSettings();
  const dismissed = { ...(settings.dismissedSites || {}) };
  delete dismissed[origin];
  await saveSettings({ dismissedSites: dismissed });
}

export async function clearDismissedSites() {
  await saveSettings({ dismissedSites: {} });
}

export async function isSiteDismissed(origin) {
  const settings = await getSettings();
  return Boolean(settings.dismissedSites?.[origin]);
}
