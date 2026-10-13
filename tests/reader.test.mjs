/* Reading a policy page that a plain fetch-and-clean does not read.
 *
 * Each case is a failure seen on a live site, reduced to its shape:
 * HDFC Bank (policy past the size cap), Navi (hub of sub-policies),
 * Myntra and KreditBee (rendered by JavaScript), and pages that keep their
 * policy in shadow DOM or collapsed sections.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_READABLE_CLAUSES,
  clausesFromHtml,
  compactHtml,
  readPolicy,
  subPolicyLink,
} from "../src/reader.js";
import { clausesFromDom, readableClausesFromDom } from "../src/dom.js";

const SENTENCES = [
  "We collect your name, phone number and address when you apply for a loan.",
  "We share your information with our lending partners and credit bureaus.",
  "We retain your data for as long as necessary to provide our services.",
  "You may withdraw your consent at any time by writing to our grievance officer.",
  "We use cookies to understand how you use our website and to improve it.",
  "Your data may be transferred to servers located outside India.",
  "We do not sell your personal information to anyone.",
];
const POLICY_HTML = `<main><h1>Privacy Policy</h1>${SENTENCES.map((s) => `<p>${s}</p>`).join("")}</main>`;
const MENU_HTML = `<nav><a href="/">Home</a><a href="/loans">Loans</a></nav><div>Download the app</div>`;

const page = (text, url = "https://lender.example/privacy-policy") =>
  ({ ok: true, status: 200, url, contentType: "text/html", text });

const neverRender = async () => [];

/* ---------- compaction ---------- */

test("compaction keeps what the cleaner reads and drops the rest", () => {
  const html =
    '<div class="footer" id="f" role="contentinfo" aria-hidden="true" style="color:red" ' +
    'data-x="' + "y".repeat(500) + '" onclick="go()">text</div><script>var a = 1;</script><!-- note -->';
  const out = compactHtml(html);
  assert.ok(out.includes('class="footer"') && out.includes('id="f"'));
  assert.ok(out.includes('role="contentinfo"') && out.includes('aria-hidden="true"'));
  assert.ok(!out.includes("style=") && !out.includes("data-x") && !out.includes("onclick"));
  assert.ok(!out.includes("var a") && !out.includes("note"));
  assert.ok(out.includes("text"));
});

test("a policy after a megabyte of markup is still read (HDFC Bank)", () => {
  // Menus with heavy attributes, as on the real page, before the policy.
  const heavyMenu = Array.from({ length: 6000 }, (_, i) =>
    `<a class="mega-menu-link item-${i}" href="/products/category-${i}/sub" ` +
    `data-tracking='${JSON.stringify({ id: i, label: "x".repeat(80) })}'>Item ${i}</a>`
  ).join("\n        ");
  const html = `<html><body><div class="menu">${heavyMenu}</div>${POLICY_HTML}</body></html>`;
  assert.ok(html.length > 1_000_000, `fixture is ${html.length} chars`);
  const clauses = clausesFromHtml(html);
  assert.ok(clauses.some((c) => c.text.includes("withdraw your consent")));
});

/* ---------- hub pages ---------- */

test("a hub page's general policy is picked over product policies (Navi)", () => {
  const hub = `
    <h4>Navi AMC Limited Privacy Policy</h4><a href="/privacy-policy/mutual-fund">Open</a>
    <h4>Navi Privacy Policy</h4><a href="/privacy-policy/general">Open</a>
    <a href="/about">About</a><a href="https://other.example/privacy-policy/x">Elsewhere</a>`;
  assert.equal(subPolicyLink(hub, "https://navi.com/privacy-policy"), "https://navi.com/privacy-policy/general");
});

test("links that are not under the hub's path are ignored", () => {
  const html = `<a href="/privacy-policy">Self</a><a href="/terms">Terms</a><a href="/blog/privacy">Blog</a>`;
  assert.equal(subPolicyLink(html, "https://navi.com/privacy-policy/"), null);
});

/* ---------- the sequence ---------- */

test("a readable page is read directly", async () => {
  const result = await readPolicy("https://lender.example/privacy-policy", {
    fetchPage: async () => page(POLICY_HTML),
    render: neverRender,
  });
  assert.equal(result.method, "html");
  assert.ok(result.clauses.length >= MIN_READABLE_CLAUSES);
});

test("a hub page is followed one level down", async () => {
  const hub = `${MENU_HTML}<h4>Privacy Policy</h4><a href="/privacy-policy/general">Open</a>`;
  const fetched = [];
  const result = await readPolicy("https://navi.com/privacy-policy", {
    fetchPage: async (url) => {
      fetched.push(url);
      return url.endsWith("/general") ? page(POLICY_HTML, url) : page(hub, url);
    },
    render: neverRender,
  });
  assert.equal(result.method, "sub_page");
  assert.equal(result.url, "https://navi.com/privacy-policy/general");
  assert.deepEqual(fetched, ["https://navi.com/privacy-policy", "https://navi.com/privacy-policy/general"]);
});

test("a page rendered by JavaScript is read from a rendered copy (KreditBee)", async () => {
  const shell = `<div id="root"></div>`;
  const rendered = clausesFromHtml(POLICY_HTML);
  const result = await readPolicy("https://lender.example/privacy-policy", {
    fetchPage: async () => page(shell),
    render: async () => rendered,
  });
  assert.equal(result.method, "rendered");
  assert.equal(result.clauses.length, rendered.length);
});

test("the window render runs only when the user asked (Myntra)", async () => {
  const rendered = clausesFromHtml(POLICY_HTML);
  let windows = 0;
  const deps = {
    fetchPage: async () => page(MENU_HTML),
    render: neverRender,
    renderElsewhere: async () => { windows += 1; return rendered; },
  };

  const automatic = await readPolicy("https://shop.example/privacypolicy", deps);
  assert.equal(windows, 0, "an automatic scan must never open a window");
  assert.equal(automatic.unreadable, "empty_document");

  const clicked = await readPolicy("https://shop.example/privacypolicy", { ...deps, userAsked: true });
  assert.equal(windows, 1);
  assert.equal(clicked.method, "rendered_window");
});

test("unreadable says why", async () => {
  const failing = await readPolicy("https://lender.example/p", {
    fetchPage: async () => { throw new Error("network"); },
    render: neverRender,
  });
  assert.deepEqual(failing, { unreadable: "fetch_failed" });

  const notFound = await readPolicy("https://lender.example/p", {
    fetchPage: async () => ({ ...page(""), ok: false, status: 404 }),
    render: neverRender,
  });
  assert.deepEqual(notFound, { unreadable: "fetch_failed" });

  const shell = await readPolicy("https://lender.example/p", {
    fetchPage: async () => page('<html><body><div id="root"></div></body></html>'),
    render: neverRender,
  });
  assert.deepEqual(shell, { unreadable: "spa_shell" });
});

test("a few sentences of menu text is not read as a policy", async () => {
  // Analysing it would report Allow for a page nobody managed to read.
  const result = await readPolicy("https://lender.example/p", {
    fetchPage: async () => page(`${MENU_HTML}<p>${SENTENCES[0]}</p><p>${SENTENCES[1]}</p>`),
    render: async () => clausesFromHtml(`<p>${SENTENCES[2]}</p>`),
  });
  assert.deepEqual(result, { unreadable: "empty_document" });
});

/* ---------- live DOM ---------- */

// Just enough of a DOM for blocksFromDom: elements, text, optional shadow
// roots, and a computed style per element.
function el(tag, children = [], { hidden = false, shadow = null } = {}) {
  const node = {
    nodeType: 1,
    tagName: tag,
    hidden: false,
    childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, nodeValue: c } : c)),
    shadowRoot: shadow ? { childNodes: shadow } : null,
    getAttribute: () => null,
    ownerDocument: {
      defaultView: { getComputedStyle: () => ({ display: hidden ? "none" : "block", visibility: "visible", opacity: "1" }) },
    },
  };
  return node;
}
const paragraphs = () => SENTENCES.map((s) => el("P", [s]));

test("text inside an open shadow root is read", () => {
  const host = el("PRIVACY-POLICY", [], { shadow: paragraphs() });
  const clauses = clausesFromDom(el("BODY", [host]));
  assert.equal(clauses.length, SENTENCES.length);
});

test("a policy in collapsed sections is read when nothing visible is enough", () => {
  const collapsed = el("DIV", paragraphs(), { hidden: true });
  const body = el("BODY", [el("H1", ["Privacy Policy"]), collapsed]);
  assert.equal(clausesFromDom(body).length, 0);
  assert.equal(readableClausesFromDom(body).length, SENTENCES.length);
});

test("hidden text is not read when the visible text is already a policy", () => {
  const menu = el("DIV", [el("P", ["Loans and credit cards for every need you have."])], { hidden: true });
  const body = el("BODY", [...paragraphs(), menu]);
  assert.equal(readableClausesFromDom(body).length, SENTENCES.length);
});
