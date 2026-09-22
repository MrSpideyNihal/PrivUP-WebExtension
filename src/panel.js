/* The verdict panel injected next to a consent banner.
 *
 * Reuses the visual pattern from ui/ in Part 2 rather than redesigning it:
 * verdict badge, risk dial, severity tiles, and one expandable row per
 * finding whose collapsed state is the reason and whose expanded state is the
 * clause that triggered it.
 *
 * Rendered into a shadow root. A content script shares a page with whatever
 * CSS that page ships, and a consent banner is exactly the kind of element
 * that comes with aggressive `!important` rules. The shadow boundary means the
 * page cannot restyle the verdict, and PrivUp cannot restyle the page.
 */

const HOST_ID = "privup-panel-host";

const TONES = {
  critical: "#E1573A",
  high: "#D2691E",
  medium: "#C2761C",
  low: "#7A7F88",
  info: "#9A9EA6",
};

const DECISION = {
  allow: { tone: "#2E8B62", kicker: "Allow", line: "Nothing here matched a red flag." },
  warning: { tone: "#C2761C", kicker: "Warning", line: "Read these before you agree." },
  deny: { tone: "#E1573A", kicker: "Deny", line: "Do not agree to this without reading it in full." },
};

/* Special shape for cases where we simply couldn't read the policy.
 * Visually distinct from Warning (orange) so users understand "we don't know"
 * rather than "we found something bad". */
const UNREADABLE = {
  spa_shell:   { tone: "#7A7F88", kicker: "?", line: "This page loads dynamically \u2014 PrivUp couldn\u2019t read the policy." },
  fetch_failed: { tone: "#7A7F88", kicker: "?", line: "Couldn\u2019t load the privacy policy page." },
  empty_document: { tone: "#7A7F88", kicker: "?", line: "No readable text found. This is not an all-clear." },
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  position: fixed; z-index: 2147483647;
  font-family: "Inter Tight", "Segoe UI Variable Display", "Segoe UI", Inter,
               system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px; line-height: 1.5; color: #16181C;
  background: #ECECEA; border-radius: 20px;
  box-shadow: 0 16px 40px -12px rgba(22,24,28,.32), 0 0 0 1px rgba(0,0,0,.08);
  overflow: hidden;
  transition: max-height .22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow .2s ease;
}
.wrap.pos-bottom-right {
  right: 16px; bottom: 16px; width: min(392px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 32px));
  display: flex; flex-direction: column;
}
.wrap.pos-top-center {
  top: 16px; left: 50%; transform: translateX(-50%);
  width: min(420px, calc(100vw - 32px));
  max-height: min(580px, calc(100vh - 32px));
  display: flex; flex-direction: column;
}
.wrap.pos-top-banner {
  top: 14px; left: 50%; transform: translateX(-50%);
  width: min(660px, calc(100vw - 28px));
  max-height: min(580px, calc(100vh - 28px));
  display: flex; flex-direction: column;
}

/* Banner bar for pos-top-banner */
.banner-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 14px; background: #fff; flex: none;
}
.banner-left {
  display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1;
}
.banner-badge {
  font-size: 10.5px; font-weight: 700; color: #fff; padding: 3px 8px; border-radius: 999px;
  text-transform: uppercase; letter-spacing: 0.03em; flex: none;
}
.banner-line {
  font-size: 12.5px; font-weight: 650; color: #16181C; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;
}
.banner-score {
  font-size: 11px; color: #61656E; background: #F4F4F2; padding: 2px 7px;
  border-radius: 6px; flex: none; white-space: nowrap;
}
.banner-score strong { color: #16181C; font-weight: 700; }
.banner-right {
  display: flex; align-items: center; gap: 6px; flex: none;
}
.btn-action {
  border: 0; border-radius: 999px; cursor: pointer; font: inherit; font-size: 11.5px;
  font-weight: 600; padding: 6px 12px; transition: opacity .15s ease, background .15s ease;
}
.btn-primary {
  background: #16181C; color: #fff;
}
.btn-primary:hover { opacity: .88; }
.btn-subtle {
  background: transparent; color: #61656E; padding: 6px 8px;
}
.btn-subtle:hover { color: #E1573A; background: #FEF0EE; }

.head {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; background: #fff; flex: none;
}
.mark { width: 22px; height: 22px; border-radius: 50%; background: #16181C; position: relative; flex: none; }
.mark::after {
  content: ""; position: absolute; inset: 0; border-radius: 50%;
  background: conic-gradient(#E1573A 0 25%, transparent 25% 100%);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 44%, #000 45%);
  mask: radial-gradient(circle at 50% 50%, transparent 44%, #000 45%);
}
.title { font-weight: 650; letter-spacing: -0.01em; flex: 1; font-size: 13px; }
.picker {
  display: flex; gap: 2px; padding: 2px; background: #F4F4F2; border-radius: 999px;
}
.picker button {
  border: 0; background: transparent; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 550; color: #61656E; padding: 4px 9px;
}
.picker button[aria-pressed="true"] { background: #fff; color: #16181C; box-shadow: 0 2px 6px -3px rgba(0,0,0,.3); }
.close {
  border: 0; background: #F4F4F2; border-radius: 999px; width: 26px; height: 26px;
  cursor: pointer; color: #61656E; font: inherit; font-size: 15px; line-height: 1; flex: none;
}
.close:hover { background: #E6E6E3; color: #16181C; }
.body {
  overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;
  flex: 1 1 auto; min-height: 0;
}
.pos-top-banner .body:not(.is-open) {
  display: none;
}
.body > * { flex-shrink: 0; }
.body::-webkit-scrollbar { width: 6px; }
.body::-webkit-scrollbar-track { background: transparent; }
.body::-webkit-scrollbar-thumb { background: rgba(0,0,0,.15); border-radius: 999px; }
.body::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,.25); }
.verdict {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border-radius: 18px; padding: 14px 16px; color: #fff;
}
.kicker { font-size: 11px; font-weight: 600; opacity: .85; margin: 0 0 2px; }
.line { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.dial { position: relative; width: 54px; height: 54px; flex: none; }
.dial svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.dial circle { fill: none; stroke-width: 7; stroke-linecap: round; }
.dial .track { stroke: rgba(255,255,255,.3); }
.dial .value { stroke: #fff; }
.dial .read {
  position: absolute; inset: 0; display: grid; place-content: center;
  text-align: center; line-height: 1; font-size: 15px; font-weight: 700;
}
.notice {
  margin: 0; padding: 9px 12px; background: #fff; border-left: 3px solid #C2761C;
  border-radius: 12px; font-size: 12.5px; color: #61656E;
}
.tiles { display: flex; gap: 6px; }
.tile { flex: 1; background: #fff; border-radius: 13px; padding: 8px 10px; }
.tile span { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #61656E; }
.tile i { width: 6px; height: 6px; border-radius: 50%; background: var(--tone); }
.tile strong { display: block; font-size: 18px; letter-spacing: -0.02em; margin-top: 1px; }
details.finding {
  background: #fff; border-radius: 13px; border-left: 4px solid var(--tone); overflow: hidden;
  flex-shrink: 0;
}
details.finding summary {
  display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; cursor: pointer; list-style: none;
  font-size: 13px;
}
details.finding summary::-webkit-details-marker { display: none; }
details.finding summary:hover { background: #F7F7F5; }
.sev { flex: none; font-size: 10.5px; font-weight: 650; color: var(--tone); width: 46px; padding-top: 2px; }
.reason { flex: 1; }
.chev {
  flex: none; width: 6px; height: 6px; margin-top: 5px;
  border-right: 2px solid #9A9EA6; border-bottom: 2px solid #9A9EA6;
  transform: rotate(45deg); transition: transform .18s ease;
}
details[open] .chev { transform: rotate(-135deg); }
.evidence { padding: 0 12px 12px; border-top: 1px solid #EEEEEB; padding-top: 10px; }
.where { margin: 0 0 5px; font-size: 11.5px; color: #9A9EA6; }
.clause {
  margin: 0; padding: 9px 11px; background: #F4F4F2; border-radius: 10px;
  font-size: 12.5px; line-height: 1.55;
}
.clause mark { background: color-mix(in srgb, var(--tone) 24%, transparent); color: inherit; border-radius: 3px; }
.cite { margin: 6px 0 0; font-size: 11px; color: #9A9EA6; }
.foot { padding: 8px 12px 12px; flex: none; display: flex; flex-direction: column; gap: 6px; }
.foot button.deepen {
  width: 100%; border: 0; border-radius: 999px; background: #16181C; color: #fff;
  font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px; cursor: pointer;
}
.foot button.deepen:hover { opacity: .88; }
.foot button[disabled] { opacity: .45; cursor: progress; }
.foot .mute-link {
  border: 0; background: transparent; color: #9A9EA6; font: inherit; font-size: 11.5px;
  cursor: pointer; text-align: center; padding: 4px; border-radius: 6px;
}
.foot .mute-link:hover { color: #E1573A; text-decoration: underline; }
.status { margin: 0; padding: 8px 12px; font-size: 12px; color: #61656E; }
.source-bar {
  display: flex; align-items: center; gap: 5px; padding: 7px 12px;
  background: #F4F4F2; border-top: 1px solid #EBEBEA; flex-shrink: 0;
}
.source-label {
  font-size: 10.5px; color: #9A9EA6; white-space: nowrap; flex: none;
}
.source-link {
  font-size: 10.5px; color: #61656E; text-decoration: none; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; min-width: 0;
  border-radius: 4px; padding: 1px 0;
}
.source-link:hover { color: #16181C; text-decoration: underline; }
.banner-source {
  font-size: 10px; color: #9A9EA6; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 220px; display: none;
}
@media (min-width: 500px) { .banner-source { display: inline; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* Highlight the matched phrase without ever building HTML from policy text. */
function quoteClause(text, matched) {
  const paragraph = element("p", "clause");
  const at = matched ? text.toLowerCase().indexOf(matched.toLowerCase()) : -1;
  if (at < 0) {
    paragraph.textContent = text;
    return paragraph;
  }
  const mark = document.createElement("mark");
  mark.textContent = text.slice(at, at + matched.length);
  paragraph.append(
    document.createTextNode(text.slice(0, at)),
    mark,
    document.createTextNode(text.slice(at + matched.length))
  );
  return paragraph;
}

function renderFinding(f) {
  const details = element("details", "finding");
  details.style.setProperty("--tone", TONES[f.severity] || TONES.info);

  const summary = document.createElement("summary");
  summary.append(
    element("span", "sev", f.severity),
    element("span", "reason", f.reason),
    element("i", "chev")
  );

  const evidence = element("div", "evidence");
  if (f.clause.index < 0) {
    evidence.append(element(
      "p", "clause",
      "Nothing anywhere in this document covers this. The finding is the absence."
    ));
  } else {
    if (f.clause.heading) {
      evidence.append(element("p", "where", `Under "${f.clause.heading}"`));
    }
    evidence.append(quoteClause(f.clause.text, f.matchedText));
  }
  evidence.append(element(
    "p", "cite",
    f.reference ? `${f.reference} · ${f.ruleId}` : f.ruleId
  ));

  details.append(summary, evidence);
  return details;
}

export function removePanel() {
  document.getElementById(HOST_ID)?.remove();
}

/* Render (or re-render) the panel. Returns handles the caller wires up. */
export function renderPanel({
  verdict,
  tagSet,
  tagSets = [],
  onTagSet,
  onDeepen,
  deepenLabel,
  popupStyle = "top-banner",
  onDismissSite,
  sourceUrl,
}) {
  removePanel();

  const host = element("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLE;

  const wrap = element("div", "wrap");

  // Unreadable states get a distinct grey shape overriding the decision colour.
  const meta = verdict.metadata || {};
  const unreadableKey = meta.spa_shell ? "spa_shell"
    : meta.fetch_failed ? "fetch_failed"
    : meta.empty_document ? "empty_document"
    : null;
  const shape = (unreadableKey ? UNREADABLE[unreadableKey] : null)
    || DECISION[verdict.decision] || DECISION.warning;
  const score = Math.min(Number(verdict.riskScore) || 0, 100);

  const isBanner = popupStyle === "top-banner";
  if (isBanner) {
    wrap.classList.add("pos-top-banner");
  } else if (popupStyle === "top-center") {
    wrap.classList.add("pos-top-center");
  } else {
    wrap.classList.add("pos-bottom-right");
  }

  // Common body
  const body = element("div", "body");

  if (isBanner) {
    // Top banner horizontal bar
    const bar = element("div", "banner-bar");

    const left = element("div", "banner-left");
    left.append(element("div", "mark"));

    const badge = element("span", "banner-badge", shape.kicker);
    badge.style.background = shape.tone;
    left.append(badge);

    // shape.line already carries the right message for unreadable states.
    left.append(element("span", "banner-line", shape.line));

    if (sourceUrl) {
      let displayHost = sourceUrl;
      try { displayHost = new URL(sourceUrl).pathname; } catch (_) {}
      const src = element("span", "banner-source");
      src.title = sourceUrl;
      src.textContent = displayHost;
      left.append(src);
    }

    const scorePill = element("span", "banner-score");
    scorePill.innerHTML = `Risk <strong>${Math.round(score)}</strong>`;
    left.append(scorePill);

    const right = element("div", "banner-right");

    // Build a severity summary pill: "1 high · 3 medium" is more informative
    // than "Review findings (4)" — user sees the severity tier at a glance.
    let toggleLabel;
    if (verdict.findings.length) {
      const counts = verdict.metadata?.severity_counts || {};
      const parts = ["critical", "high", "medium", "low"]
        .filter((s) => counts[s])
        .map((s) => `${counts[s]} ${s}`);
      toggleLabel = parts.length ? parts.join(" \u00b7 ") : `${verdict.findings.length} finding${verdict.findings.length > 1 ? "s" : ""}`;
    } else if (unreadableKey) {
      toggleLabel = "View details";
    } else {
      toggleLabel = "View details";
    }
    const btnToggle = element("button", "btn-action btn-primary", toggleLabel);
    btnToggle.type = "button";
    btnToggle.addEventListener("click", () => {
      const open = body.classList.toggle("is-open");
      btnToggle.textContent = open ? "Hide details" : toggleLabel;
    });
    right.append(btnToggle);

    if (onDismissSite) {
      const btnMute = element("button", "btn-action btn-subtle", "Don't show again");
      btnMute.type = "button";
      btnMute.title = "Don't pop up again on this site";
      btnMute.addEventListener("click", () => {
        onDismissSite();
        removePanel();
      });
      right.append(btnMute);
    }

    const close = element("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close PrivUp");
    close.addEventListener("click", removePanel);
    right.append(close);

    bar.append(left, right);
    wrap.append(bar);

    // If banner, include tag picker row at the top of the body
    if (tagSets.length > 1) {
      const pickerRow = element("div", "head");
      pickerRow.style.padding = "6px 8px";
      pickerRow.style.background = "transparent";
      const pickerTitle = element("div", "title", "Rule set:");
      pickerTitle.style.fontSize = "12px";
      pickerTitle.style.color = "#61656E";
      const picker = element("div", "picker");
      for (const name of tagSets) {
        const button = element("button", null, name.replace(/_/g, " "));
        button.type = "button";
        button.setAttribute("aria-pressed", String(name === tagSet));
        button.addEventListener("click", () => onTagSet(name));
        picker.append(button);
      }
      pickerRow.append(pickerTitle, picker);
      body.append(pickerRow);
    }
  } else {
    // Full panel header
    const head = element("div", "head");
    head.append(element("div", "mark"), element("div", "title", "PrivUp"));

    const picker = element("div", "picker");
    for (const name of tagSets) {
      const button = element("button", null, name.replace(/_/g, " "));
      button.type = "button";
      button.setAttribute("aria-pressed", String(name === tagSet));
      button.addEventListener("click", () => onTagSet(name));
      picker.append(button);
    }
    head.append(picker);

    const close = element("button", "close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close PrivUp");
    close.addEventListener("click", removePanel);
    head.append(close);

    wrap.append(head);
  }

  // Verdict card
  const card = element("div", "verdict");
  card.style.background = shape.tone;

  const copy = element("div");
  copy.append(
    element("p", "kicker", shape.kicker),
    element("p", "line", shape.line)
  );

  const dial = element("div", "dial");
  const circumference = 2 * Math.PI * 22;
  dial.innerHTML =
    `<svg viewBox="0 0 54 54" aria-hidden="true">` +
    `<circle class="track" cx="27" cy="27" r="22"></circle>` +
    `<circle class="value" cx="27" cy="27" r="22" stroke-dasharray="${circumference}" ` +
    `stroke-dashoffset="${circumference - (circumference * score) / 100}"></circle></svg>` +
    `<div class="read">${Math.round(score)}</div>`;

  card.append(copy, dial);
  body.append(card);

  // Source URL bar — shows which policy document was actually analyzed
  if (sourceUrl) {
    const srcBar = element("div", "source-bar");
    srcBar.append(element("span", "source-label", "Analyzed:"));
    const srcLink = document.createElement("a");
    srcLink.className = "source-link";
    srcLink.href = sourceUrl;
    srcLink.target = "_blank";
    srcLink.rel = "noopener noreferrer";
    srcLink.title = sourceUrl;
    let displayUrl = sourceUrl;
    try {
      const u = new URL(sourceUrl);
      displayUrl = u.host + u.pathname.replace(/\/+$/, "");
    } catch (_) {}
    srcLink.textContent = displayUrl;
    srcBar.append(srcLink);
    body.append(srcBar);
  }

  const notice = verdict.metadata?.relevance?.notice;
  if (notice) body.append(element("p", "notice", notice));

  const counts = verdict.metadata?.severity_counts || {};
  const present = SEVERITY_ORDER.filter((name) => counts[name]);
  if (present.length) {
    const tiles = element("div", "tiles");
    for (const name of present) {
      const tile = element("div", "tile");
      tile.style.setProperty("--tone", TONES[name]);
      const label = element("span");
      label.append(element("i"), document.createTextNode(name));
      tile.append(label, element("strong", null, String(counts[name])));
      tiles.append(tile);
    }
    body.append(tiles);
  }

  for (const f of verdict.findings) body.append(renderFinding(f));

  if (!verdict.findings.length && !verdict.metadata?.empty_document) {
    body.append(element("p", "status", "Nothing in this text matched a red flag."));
  }

  // Footer
  const foot = element("div", "foot");
  if (onDeepen) {
    const button = element("button", "deepen", deepenLabel || "Analyze the full policy");
    button.type = "button";
    button.addEventListener("click", () => onDeepen(button));
    foot.append(button);
  }

  if (onDismissSite) {
    const muteLink = element("button", "mute-link", "Don't show again on this site");
    muteLink.type = "button";
    muteLink.addEventListener("click", () => {
      onDismissSite();
      removePanel();
    });
    foot.append(muteLink);
  }

  if (foot.hasChildNodes()) {
    body.append(foot);
  }

  wrap.append(body);

  shadow.append(style, wrap);
  document.documentElement.append(host);
  return { host, shadow };
}

