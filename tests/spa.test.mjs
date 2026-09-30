import test from "node:test";
import assert from "node:assert/strict";
import {
  visibleWordCount,
  isSpaShell,
  extractNextData,
  extractNuxtData,
  extractJsonLd,
  extractPreloadedState,
  tryEmbeddedExtraction,
  recoverContent,
  walkStrings,
} from "../src/core/spa.js";
import { run } from "../src/core/main.js";

test("visibleWordCount ignores scripts, styles, and tags", () => {
  const html = `
    <html>
      <head>
        <style>body { color: red; }</style>
        <script>console.log("ignore this script code");</script>
      </head>
      <body>
        <p>This is genuine privacy policy content for users.</p>
      </body>
    </html>
  `;
  const count = visibleWordCount(html);
  assert.equal(count, 8);
});

test("isSpaShell detects empty root mount point", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>App</title></head>
      <body>
        <div id="root"></div>
        <script src="/static/js/main.1a2b3c.js"></script>
      </body>
    </html>
  `;
  assert.equal(isSpaShell(html), true);
});

test("isSpaShell detects noscript activate javascript message", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="wrapper"></div>
      </body>
    </html>
  `;
  assert.equal(isSpaShell(html), true);
});

test("isSpaShell does not trigger on standard HTML policy documents", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Privacy Policy</title></head>
      <body>
        <h1>Privacy Policy</h1>
        <p>We respect your privacy and describe our data collection practices below.</p>
        <p>We do not collect personal contact lists, location data, or private messages without your prior consent.</p>
        <p>You may request deletion of your account and associated personal data at any time by contacting support.</p>
        <p>Third party analytics services may receive anonymized telemetry about general application usage patterns.</p>
        <p>Changes to this privacy policy will be announced thirty days before taking effect.</p>
      </body>
    </html>
  `;
  assert.equal(isSpaShell(html), false);
});

test("extractNextData extracts policy prose from __NEXT_DATA__", () => {
  const data = {
    props: {
      pageProps: {
        title: "Privacy Terms",
        policyText: "We collect user registration data including email and phone numbers for verification purposes only. We never share contacts or address books with unauthorized third parties. All stored data is encrypted at rest.",
      },
    },
  };
  const html = `
    <html>
      <body>
        <div id="__next"></div>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>
      </body>
    </html>
  `;
  const text = extractNextData(html);
  assert.ok(text.includes("verification purposes only"));
  assert.ok(text.includes("never share contacts"));
});

test("extractNuxtData extracts prose from window.__NUXT__", () => {
  const nuxtPayload = {
    data: [
      {
        content: "Our organization adheres to statutory privacy regulations. Personal information is gathered exclusively to deliver services and is never transferred without consent.",
      },
    ],
  };
  const html = `
    <html>
      <body>
        <div id="__nuxt"></div>
        <script>window.__NUXT__ = ${JSON.stringify(nuxtPayload)};</script>
      </body>
    </html>
  `;
  const text = extractNuxtData(html);
  assert.ok(text.includes("statutory privacy regulations"));
});

test("extractJsonLd extracts articleBody and description", () => {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Privacy Policy",
    articleBody: "We respect user privacy and do not sell personal information to commercial third parties. You have the right to inspect, correct, and delete your retained records.",
  };
  const html = `
    <html>
      <head>
        <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      </head>
      <body><div id="root"></div></body>
    </html>
  `;
  const text = extractJsonLd(html);
  assert.ok(text.includes("do not sell personal information"));
});

test("extractPreloadedState extracts prose from window.__PRELOADED_STATE__", () => {
  const state = {
    legal: {
      terms: "Users retain full ownership of their personal credentials. We do not inspect device contacts or file storage without explicit permission.",
    },
  };
  const html = `
    <html>
      <body>
        <div id="root"></div>
        <script>window.__PRELOADED_STATE__ = ${JSON.stringify(state)};</script>
      </body>
    </html>
  `;
  const text = extractPreloadedState(html);
  assert.ok(text.includes("Users retain full ownership"));
});

test("recoverContent returns recovered text and pipeline analyzes it", async () => {
  const policyProse = "We access your contact list and address book to determine creditworthiness. We may disclose your contact list to collection agents. This policy may be updated at any time without notice.";
  const payload = {
    props: {
      pageProps: {
        body: policyProse,
      },
    },
  };
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Loan Privacy</title></head>
      <body>
        <div id="root"></div>
        <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>
      </body>
    </html>
  `;

  assert.equal(isSpaShell(html), true);
  const result = await recoverContent(html);
  assert.equal(result.recovered, true);
  assert.equal(result.method, "next_data");

  const verdict = run({
    text: result.text,
    tagSet: "loan_app",
    origin: "https://example.com/privacy",
    contentType: "text/plain",
  });

  assert.equal(verdict.decision, "deny");
  assert.ok(verdict.findings.length >= 1);
});
