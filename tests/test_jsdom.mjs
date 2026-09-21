import { findPolicyLink } from "../src/dom.js";
import { run } from "../src/core/main.js";
import { JSDOM } from "jsdom";

async function test() {
  const res = await fetch("https://www.mpokket.in");
  const html = await res.text();
  const dom = new JSDOM(html, { url: "https://www.mpokket.in" });
  const doc = dom.window.document;

  const link = findPolicyLink(doc.body, "https://www.mpokket.in");
  console.log("findPolicyLink result:", link);

  if (link) {
    console.log("Fetching linked policy:", link.url);
    const pRes = await fetch(link.url);
    const pHtml = await pRes.text();
    console.log("Policy HTML length:", pHtml.length);
    const v = run({ text: pHtml, tagSet: "generic", origin: link.url, contentType: "text/html" });
    console.log("Verdict on linked policy:", v.decision, "score:", v.riskScore, "empty_doc:", v.metadata?.empty_document, "clauses:", v.clausesAnalyzed);
  }
}

test();
