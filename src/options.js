/* Options page logic.
 *
 * Reads and writes settings through the shared settings module.
 * Every change is saved immediately — no submit button needed.
 */

import { getSettings, saveSettings, clearCache, getCacheStats, clearDismissedSites } from "./settings.js";
import { availableTagSets } from "./core/main.js";

const $ = (id) => document.getElementById(id);

let flashTimer = null;

function flash() {
  const el = $("saved");
  el.classList.add("visible");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("visible"), 1800);
}

async function save(partial) {
  await saveSettings(partial);
  flash();
}

async function refreshCacheCount() {
  const stats = await getCacheStats();
  $("cacheCount").textContent = String(stats.count);
}

async function refreshDismissedCount() {
  const settings = await getSettings();
  const count = Object.keys(settings.dismissedSites || {}).length;
  $("dismissedCount").textContent = String(count);
}

async function init() {
  const settings = await getSettings();

  // Auto-detect toggle
  $("autoDetect").checked = settings.autoDetect;
  $("autoDetect").addEventListener("change", (e) => {
    save({ autoDetect: e.target.checked });
  });

  // Popup style dropdown
  $("popupStyle").value = settings.popupStyle || "top-banner";
  $("popupStyle").addEventListener("change", (e) => {
    save({ popupStyle: e.target.value });
  });

  // Popup frequency dropdown
  $("popupFrequency").value = settings.popupFrequency || "first-visit";
  $("popupFrequency").addEventListener("change", (e) => {
    save({ popupFrequency: e.target.value });
  });

  // Auto-panel threshold dropdown
  $("autoPanel").value = settings.autoPanel;
  $("autoPanel").addEventListener("change", (e) => {
    save({ autoPanel: e.target.value });
  });

  // Tag set dropdown — populate from the core module
  const tagSetSelect = $("tagSet");
  for (const name of availableTagSets()) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name.replace(/_/g, " ");
    tagSetSelect.append(option);
  }
  tagSetSelect.value = settings.tagSet;
  tagSetSelect.addEventListener("change", (e) => {
    save({ tagSet: e.target.value });
  });

  // Cache TTL
  $("cacheTtlHours").value = String(settings.cacheTtlHours);
  $("cacheTtlHours").addEventListener("change", (e) => {
    save({ cacheTtlHours: Number(e.target.value) });
  });

  // Cache count + clear
  await refreshCacheCount();
  $("clearCache").addEventListener("click", async () => {
    await clearCache();
    await refreshCacheCount();
    flash();
  });

  // Dismissed sites count + clear
  await refreshDismissedCount();
  $("clearDismissed").addEventListener("click", async () => {
    await clearDismissedSites();
    await refreshDismissedCount();
    flash();
  });
}

init();
