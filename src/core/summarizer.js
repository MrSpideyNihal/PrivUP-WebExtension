/* HTML cleaning and clause segmentation.
 * Mirror of core/summarizer/{cleaner,segmenter}.py.
 *
 * One real difference from the Python, and it is a simplification rather than
 * a divergence: in a content script the DOM is already parsed, so cleanHtml
 * is only used for the parity harness and for text pasted into the popup.
 * The live path walks the real DOM instead, in dom.js, which is strictly
 * better information than re-parsing serialised HTML.
 */

import { clause } from "./models.js";

// Non-breaking, figure, thin, hair, zero-width and narrow spaces, plus the
// byte-order mark. Spelled as code points so the source stays ASCII.
const ODD_SPACES = [0x00a0, 0x2007, 0x2009, 0x200a, 0x200b, 0x202f, 0xfeff]
  .map((c) => String.fromCharCode(c))
  .join("");
const WHITESPACE = new RegExp(`[\\s${ODD_SPACES}]+`, "g");

export function normalizeText(text) {
  return text.replace(WHITESPACE, " ").trim();
}

const DROP_CONTENT = new Set([
  "script", "style", "noscript", "template", "svg", "canvas",
  "iframe", "object", "embed", "head", "select", "button", "textarea",
]);

const BOILERPLATE_TAGS = new Set(["nav", "footer", "header", "aside", "menu", "dialog"]);

// Never chrome, whatever their class says. A false positive here loses the
// whole document, which is how the first Python version deleted all of
// Signal's policy via <body class="index has-navbar-fixed-top">.
const NEVER_CHROME = new Set(["html", "body", "main", "article"]);

const BOILERPLATE_HINTS = new Set([
  "navbar", "navigation", "menu", "megamenu", "footer", "breadcrumb",
  "cookiebar", "cookiebanner", "consentbanner", "social", "socials",
  "newsletter", "subscribe", "topbar", "skiplink", "backtotop",
  "languageswitcher", "langswitcher", "sitesearch",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const BLOCK_TAGS = new Set([
  ...HEADING_TAGS,
  "p", "div", "li", "tr", "section", "article", "blockquote",
  "dd", "dt", "figcaption", "pre", "main", "ul", "ol", "table", "form",
]);

// Table cells join into their row: split per cell a schedule of charges
// degrades into "Processing fees" and "Up to 7%" as unrelated fragments.
const CELL_TAGS = new Set(["td", "th"]);
const CELL_SEPARATOR = " | ";

const CONTENT_FLOOR = 0.5;
const NAME_SEPARATORS = /[\s_\-.:]+/;

function nameParts(value) {
  const parts = new Set();
  for (const token of value.toLowerCase().split(NAME_SEPARATORS)) {
    if (!token) continue;
    parts.add(token);
    const stripped = token.replace(/[0-9]+/g, "");
    if (stripped) parts.add(stripped);
  }
  return parts;
}

export function isBoilerplate(tag, attrs, useHints) {
  if (NEVER_CHROME.has(tag)) return false;
  if (BOILERPLATE_TAGS.has(tag)) return true;

  const role = attrs.role;
  if (role && ["navigation", "banner", "contentinfo", "search"].includes(role)) return true;
  if (attrs["aria-hidden"] === "true") return true;

  if (useHints) {
    for (const key of ["class", "id"]) {
      const value = attrs[key];
      if (!value) continue;
      for (const part of nameParts(value)) {
        if (BOILERPLATE_HINTS.has(part)) return true;
      }
    }
  }
  return false;
}

const TAG_RE = /<(\/?)([a-zA-Z][-a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\/?>/g;
const ATTR_RE = /([-a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

function parseAttrs(raw) {
  const attrs = {};
  if (!raw) return attrs;
  let match;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  mdash: "—", ndash: "–", hellip: "…",
};

function unescapeHtml(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function collapseSeparators(text) {
  let out = text;
  while (out.includes("|")) {
    const next = out.replace(/(?:\s*\|\s*)+/g, CELL_SEPARATOR).replace(/^[\s|]+|[\s|]+$/g, "");
    if (next === out) break;
    out = next;
  }
  return out;
}

// Python's html.parser routes these to handlers we do not implement, so they
// contribute nothing. A regex parser sees them as ordinary text unless told
// otherwise, and the parity harness caught it: the fixture's 145-character
// provenance comment leaked into the document and shifted every clause
// offset after it by exactly 145. Offsets are what a front end uses to
// highlight a clause, so that is not cosmetic.
const COMMENTS = /<!--[\s\S]*?-->/g;
const DECLARATIONS = /<![^>]*>/g;
const PROCESSING = /<\?[\s\S]*?\?>/g;

function stripNonContent(html) {
  return html.replace(COMMENTS, "").replace(PROCESSING, "").replace(DECLARATIONS, "");
}

function parseBlocks(rawHtml, useHints) {
  const html = stripNonContent(rawHtml);
  const blocks = [];
  const open = [];
  let skipDepth = 0;
  let buffer = [];
  let bufferIsHeading = false;

  const flush = () => {
    let text = normalizeText(buffer.join(""));
    buffer = [];
    text = collapseSeparators(text);
    if (text) blocks.push({ text, isHeading: bufferIsHeading });
    bufferIsHeading = false;
  };

  let cursor = 0;
  let match;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(html)) !== null) {
    if (match.index > cursor && skipDepth === 0) {
      buffer.push(unescapeHtml(html.slice(cursor, match.index)));
    }
    cursor = match.index + match[0].length;

    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();

    if (VOID_TAGS.has(tag)) {
      if (tag === "br" && skipDepth === 0) buffer.push(" ");
      continue;
    }

    if (!closing) {
      const skips = DROP_CONTENT.has(tag) || isBoilerplate(tag, parseAttrs(match[3]), useHints);
      if (skips) {
        flush();
        skipDepth += 1;
      }
      open.push([tag, skips]);

      if (skipDepth === 0 && BLOCK_TAGS.has(tag)) {
        flush();
        if (HEADING_TAGS.has(tag)) bufferIsHeading = true;
      }
      continue;
    }

    // Unwind to the matching open tag. Real policy pages leave tags unclosed,
    // and a depth counter gets stuck skipping the rest of the document.
    let position = -1;
    for (let i = open.length - 1; i >= 0; i -= 1) {
      if (open[i][0] === tag) { position = i; break; }
    }
    if (position === -1) continue;
    for (let i = position; i < open.length; i += 1) {
      if (open[i][1]) skipDepth -= 1;
    }
    open.length = position;

    if (skipDepth === 0) {
      if (CELL_TAGS.has(tag)) buffer.push(CELL_SEPARATOR);
      else if (BLOCK_TAGS.has(tag)) flush();
    }
  }

  if (cursor < html.length && skipDepth === 0) {
    buffer.push(unescapeHtml(html.slice(cursor)));
  }
  skipDepth = 0;
  flush();
  return blocks;
}

function wordCount(blocks) {
  return blocks.reduce((total, b) => total + b.text.split(/\s+/).filter(Boolean).length, 0);
}

/* Two passes. A class-name guess that deletes most of a policy is wrong, and
 * the right response is to keep the noise rather than confidently analyse an
 * almost-empty document. */
export function cleanHtml(html, { dropChrome = true } = {}) {
  const conservative = parseBlocks(html, false);
  if (!dropChrome) return conservative;
  const aggressive = parseBlocks(html, true);
  if (wordCount(aggressive) < CONTENT_FLOOR * wordCount(conservative)) return conservative;
  return aggressive;
}

/* ---------- segmentation ---------- */

const ABBREVIATIONS = new Set([
  "e.g.", "i.e.", "etc.", "viz.", "vs.", "cf.", "approx.", "incl.", "excl.",
  "resp.", "no.", "nos.", "art.", "arts.", "sec.", "secs.", "cl.", "para.",
  "paras.", "fig.", "ch.", "pp.", "vol.", "ed.", "al.",
  "inc.", "ltd.", "pvt.", "co.", "corp.", "llc.", "llp.", "plc.", "pte.",
  "mr.", "mrs.", "ms.", "dr.", "prof.", "sr.", "jr.", "st.",
  "u.s.", "u.k.", "u.a.e.", "a.m.", "p.m.",
  "rs.", "inr.", "usd.", "eur.",
]);

const BOUNDARY = /(?<=[.!?])["'’”)\]]*\s+/g;
const SENTENCE_START = /^["'‘“(\[]*[A-Z0-9]/;
const LAST_TOKEN = /(\S+)\s*$/;
const LIST_MARKER = /^\(?(?:\d+(?:\.\d+)*|[A-Za-z]|[ivxlcIVXLC]+)[.)]$/;
const DOTTED_ACRONYM = /^(?:[A-Za-z]\.)+$/;

function isAbbreviation(textBefore) {
  const match = LAST_TOKEN.exec(textBefore);
  if (!match) return false;
  const token = match[1];
  const lowered = token.toLowerCase();

  if (ABBREVIATIONS.has(lowered)) return true;
  if (LIST_MARKER.test(token)) return true;
  if (token.length === 2 && /[A-Za-z]/.test(token[0]) && token[1] === ".") return true;
  if (token.length > 2 && token.endsWith(".") && DOTTED_ACRONYM.test(token)) return true;
  return false;
}

export function splitSentences(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sentences = [];
  let start = 0;
  let match;
  BOUNDARY.lastIndex = 0;
  while ((match = BOUNDARY.exec(trimmed)) !== null) {
    const end = match.index;
    const after = match.index + match[0].length;
    if (isAbbreviation(trimmed.slice(start, end))) continue;
    if (!SENTENCE_START.test(trimmed.slice(after, after + 3))) continue;

    const segment = trimmed.slice(start, end);
    const piece = segment.trim();
    if (piece) sentences.push([start + segment.indexOf(piece[0]), piece]);
    start = after;
  }

  const tailSegment = trimmed.slice(start);
  const tail = tailSegment.trim();
  if (tail) sentences.push([start + tailSegment.indexOf(tail[0]), tail]);
  return sentences;
}

const MAX_HEADING_WORDS = 14;
const SECTION_NUMBER = /^\s*\(?(?:\d+(?:\.\d+)*|[A-Z]|[IVXLC]+)[.)]\s+\S/;
const MIN_CLAUSE_WORDS = 4;

// A short fragment carrying a figure survives the length filter:
// "Up to 36% p.a." is three words and it is the entire point.
const CARRIES_A_FIGURE =
  /\d\s*%|%\s*\d|(?:Rs\.?|INR|₹|\$|€|£)\s*[\d,]|\bp\.?a\.?\b|\bper annum\b/i;

function words(text) {
  return text.split(/\s+/).filter(Boolean);
}

function worthKeeping(sentence) {
  if (words(sentence).length >= MIN_CLAUSE_WORDS) return true;
  return CARRIES_A_FIGURE.test(sentence);
}

export function looksLikeHeading(line) {
  const parts = words(line);
  if (!parts.length || parts.length > MAX_HEADING_WORDS) return false;
  if (/[.!?,;]$/.test(line)) return false;
  if (line.endsWith(":")) return true;

  const stripped = line.replace(/:+$/, "").trim();
  if (!stripped) return false;

  const letters = [...stripped].filter((c) => /[a-z]/i.test(c));
  if (letters.length && letters.every((c) => c === c.toUpperCase())) return true;
  if (SECTION_NUMBER.test(stripped)) return true;
  return false;
}

export function blocksFromText(text) {
  const blocks = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = normalizeText(rawLine);
    if (line) blocks.push({ text: line, isHeading: looksLikeHeading(line) });
  }
  return blocks;
}

/* Flatten blocks into ordered clauses, each tagged with its heading. A single
 * sentence loses the context that makes it legible: "we retain this as long as
 * necessary" means one thing under Data Retention and another under Cookies. */
export function segment(blocks) {
  const clauses = [];
  let heading = null;
  let cursor = 0;
  let index = 0;

  for (const block of blocks) {
    if (block.isHeading) {
      heading = block.text;
      cursor += block.text.length + 1;
      continue;
    }
    for (const [offset, sentence] of splitSentences(block.text)) {
      if (worthKeeping(sentence)) {
        const start = cursor + offset;
        clauses.push(clause({
          text: sentence,
          index,
          heading,
          charStart: start,
          charEnd: start + sentence.length,
        }));
        index += 1;
      }
    }
    cursor += block.text.length + 1;
  }
  return clauses;
}

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

/* Strip markup when there is any, then split into sentence clauses. */
export function clean(result) {
  if (!result.rawText || !result.rawText.trim()) return [];
  const contentType = (result.contentType || "").split(";")[0].trim().toLowerCase();
  const blocks = HTML_TYPES.has(contentType)
    ? cleanHtml(result.rawText)
    : blocksFromText(result.rawText);
  return segment(blocks);
}
