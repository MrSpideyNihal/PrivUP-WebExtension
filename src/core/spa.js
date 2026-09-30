/* Recover policy text from JavaScript-rendered pages with zero dependencies.
 *
 * Several websites render their privacy policies as client-side SPAs
 * (React, Next.js, Nuxt, Vue, etc.). Plain fetch() calls only receive
 * an empty HTML shell (e.g. <div id="root"></div>) where content is
 * loaded by JavaScript after execution.
 *
 * This module detects empty SPA shells and recovers readable text using:
 *  1. Embedded framework data:
 *     - Next.js __NEXT_DATA__
 *     - Nuxt window.__NUXT__ and __NUXT_DATA__
 *     - JSON-LD application/ld+json
 *     - Preloaded state: __PRELOADED_STATE__, __INITIAL_STATE__, __APOLLO_STATE__
 *     - Inline JSON script payloads
 *  2. Wayback Machine snapshot fallback:
 *     - Queries the Internet Archive CDX API for pre-rendered snapshots.
 */

export const SPA_SHELL_WORD_THRESHOLD = 80;

const EMPTY_MOUNT_REGEX = /<div\s+id\s*=\s*["'](?:root|app|__next|__nuxt|main-app)["']\s*>\s*<\/div>/i;
const NOSCRIPT_JS_REGEX = /<noscript[^>]*>[^<]*(?:enable|activate|turn on)\s+javascript[^<]*<\/noscript>/i;
const HASHED_BUNDLE_REGEX = /<script[^>]+src=["'][^"']*[./][a-f0-9]{6,}\.js["']/gi;

const SKIP_KEYS = new Set([
  "id", "url", "slug", "hash", "href", "src", "color", "css", "image",
  "icon", "key", "type", "path", "route", "token", "signature", "nonce",
  "version", "buildId", "assetPrefix"
]);

/* Rough count of words visible after stripping scripts, styles, and tags. */
export function visibleWordCount(html) {
  if (!html) return 0;
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/* Returns true if the HTML appears to be an unrendered SPA shell. */
export function isSpaShell(html, wordThreshold = SPA_SHELL_WORD_THRESHOLD) {
  if (!html || typeof html !== "string") return false;
  if (visibleWordCount(html) >= wordThreshold) return false;

  if (EMPTY_MOUNT_REGEX.test(html)) return true;
  if (NOSCRIPT_JS_REGEX.test(html)) return true;

  const bundles = html.match(HASHED_BUNDLE_REGEX);
  if (bundles && bundles.length >= 3) return true;

  return false;
}

/* Recursively extract candidate prose strings from parsed JSON. */
export function walkStrings(obj, minLength = 60, minWords = 4) {
  const strings = [];
  const seen = new Set();

  function walk(node, keyName = "") {
    if (!node) return;

    if (typeof node === "string") {
      const trimmed = node.trim();
      if (trimmed.length >= minLength && !seen.has(trimmed)) {
        if (keyName && SKIP_KEYS.has(keyName.toLowerCase())) return;
        const words = trimmed.split(/\s+/).filter(Boolean);
        if (words.length >= minWords) {
          seen.add(trimmed);
          strings.push(trimmed);
        }
      }
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, keyName);
      }
      return;
    }

    if (typeof node === "object") {
      for (const [key, val] of Object.entries(node)) {
        walk(val, key);
      }
    }
  }

  walk(obj);
  return strings;
}

/* Extract text from Next.js __NEXT_DATA__ script tags. */
export function extractNextData(html) {
  const match = html.match(/<script[^>]*id\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return "";
  try {
    const data = JSON.parse(match[1]);
    const strings = walkStrings(data?.props || data);
    return strings.join("\n\n");
  } catch (_) {
    return "";
  }
}

/* Extract text from Nuxt.js window.__NUXT__ or __NUXT_DATA__. */
export function extractNuxtData(html) {
  // Nuxt 2: window.__NUXT__ = { ... }
  const nuxt2 = html.match(/window\.__NUXT__\s*=\s*(\{[\s\S]*?\})\s*;?\s*(?:<\/script>|$)/i);
  if (nuxt2) {
    try {
      const data = JSON.parse(nuxt2[1]);
      const strings = walkStrings(data);
      if (strings.length) return strings.join("\n\n");
    } catch (_) {
      // Ignore parse errors.
    }
  }

  // Nuxt 3: <script id="__NUXT_DATA__" ...>
  const nuxt3 = html.match(/<script[^>]*id\s*=\s*["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nuxt3) {
    try {
      const data = JSON.parse(nuxt3[1]);
      const strings = walkStrings(data);
      if (strings.length) return strings.join("\n\n");
    } catch (_) {
      // Ignore parse errors.
    }
  }

  return "";
}

/* Extract text from JSON-LD schema blocks. */
export function extractJsonLd(html) {
  const texts = [];
  const regex = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const candidates = [item.articleBody, item.text, item.description];
        for (const val of candidates) {
          if (typeof val === "string" && val.trim().length >= 60) {
            texts.push(val.trim());
          }
        }
        if (item["@graph"] && Array.isArray(item["@graph"])) {
          for (const sub of item["@graph"]) {
            if (!sub || typeof sub !== "object") continue;
            for (const key of ["articleBody", "text", "description"]) {
              const val = sub[key];
              if (typeof val === "string" && val.trim().length >= 60) {
                texts.push(val.trim());
              }
            }
          }
        }
      }
    } catch (_) {
      // Ignore invalid JSON-LD.
    }
  }
  return texts.join("\n\n");
}

/* Extract text from preloaded state variables. */
export function extractPreloadedState(html) {
  const stateVars = [
    "__PRELOADED_STATE__",
    "__INITIAL_STATE__",
    "__INITIAL_PROPS__",
    "__APOLLO_STATE__"
  ];
  for (const varName of stateVars) {
    const re = new RegExp(`window\\.${varName}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;?\\s*(?:<\\/script>|$)`, "i");
    const match = html.match(re);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        const strings = walkStrings(data);
        if (strings.length) return strings.join("\n\n");
      } catch (_) {
        // Continue to next state var.
      }
    }
  }
  return "";
}

/* Extract long strings from inline JSON script payloads. */
export function extractInlineJsonScripts(html) {
  const texts = [];
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const content = (match[1] || "").trim();
    if (!content.startsWith("{") && !content.startsWith("[")) continue;
    try {
      const data = JSON.parse(content);
      const strings = walkStrings(data);
      texts.push(...strings);
    } catch (_) {
      // Not JSON.
    }
  }
  return texts.join("\n\n");
}

/* Try all embedded data extractors in priority order. */
export function tryEmbeddedExtraction(html) {
  const extractors = [
    { name: "next_data", fn: extractNextData },
    { name: "nuxt_data", fn: extractNuxtData },
    { name: "json_ld", fn: extractJsonLd },
    { name: "preloaded_state", fn: extractPreloadedState },
    { name: "inline_json", fn: extractInlineJsonScripts }
  ];

  for (const { name, fn } of extractors) {
    const text = fn(html);
    if (text) {
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 30) {
        return { text, method: name };
      }
    }
  }
  return null;
}

/* Minimal HTML text extractor that drops script, style, and Wayback toolbar. */
function stripWaybackHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<div\b[^>]*id=["']wm-ipp[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export let WAYBACK_CDX_URL = "https://web.archive.org/cdx/search/cdx";
export let WAYBACK_WEB_URL = "https://web.archive.org/web";

/* Query the Wayback Machine for the most recent 200 OK snapshot. */
export async function tryWayback(url, timeoutMs = 8000) {
  if (!url || typeof url !== "string") return "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const cdxParams = new URLSearchParams({
      url,
      output: "json",
      limit: "1",
      fl: "timestamp,original,statuscode",
      filter: "statuscode:200",
      sort: "reverse"
    });
    const cdxUrl = `${WAYBACK_CDX_URL}?${cdxParams.toString()}`;
    const cdxRes = await fetch(cdxUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!cdxRes.ok) return "";

    const cdxData = await cdxRes.json();
    if (!Array.isArray(cdxData) || cdxData.length < 2) return "";

    const [timestamp, original] = cdxData[1];
    if (!timestamp || !original) return "";

    const snapshotUrl = `${WAYBACK_WEB_URL}/${timestamp}id_/${original}`;
    const snapRes = await fetch(snapshotUrl, { signal: controller.signal });
    if (!snapRes.ok) return "";

    const snapHtml = await snapRes.text();
    const visible = stripWaybackHtml(snapHtml);
    const wordCount = visible.split(/\s+/).filter(Boolean).length;
    return wordCount >= 30 ? visible : "";
  } catch (_) {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Recover content from an SPA shell using embedded data or Wayback fallback. */
export async function recoverContent(html, options = {}) {
  const { url = null, enableWayback = false, timeoutMs = 8000 } = options;

  // Strategy 1: Embedded framework data (zero network requests).
  const embedded = tryEmbeddedExtraction(html);
  if (embedded) {
    return {
      recovered: true,
      text: embedded.text,
      method: embedded.method
    };
  }

  // Strategy 2: Wayback Machine snapshot (if enabled and URL provided).
  if (enableWayback && url) {
    const waybackText = await tryWayback(url, timeoutMs);
    if (waybackText) {
      return {
        recovered: true,
        text: waybackText,
        method: "wayback"
      };
    }
  }

  return {
    recovered: false,
    text: "",
    method: null
  };
}
