import { run } from "../src/core/main.js";

async function test() {
  const url = 'https://www.mpokket.in/legal/terms-conditions';
  const res = await fetch(url);
  const html = await res.text();
  console.log("Terms & Conditions fetched length:", html.length);

  const verdict = run({ text: html, tagSet: "generic", origin: url, contentType: "text/html" });
  console.log("Verdict on terms-conditions:", verdict.decision, "clauses:", verdict.clausesAnalyzed, "findings:", verdict.findings.length, "score:", verdict.riskScore, "metadata:", verdict.metadata);
}

test();




