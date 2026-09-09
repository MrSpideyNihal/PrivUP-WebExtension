/* Pipeline orchestration. Mirror of core/main.py.
 *
 *   text -> summarizer.clean() -> analyzer.classify() -> scorer.score()
 *
 * There is no driver stage here. A content script already has the page, and
 * the extension makes no network request of its own: that is the whole
 * privacy claim, and adding a fetch here would break it.
 */

import { checkRelevance, getTagSet, relevanceToDict } from "./tags.js";
import { classify } from "./analyzer.js";
import { clean } from "./summarizer.js";
import { driverResult } from "./models.js";
import { score } from "./scorer.js";

export { availableTagSets, describeTagSets } from "./tags.js";
export { verdictToDict } from "./models.js";

/* Analyze text against a rule set.
 *
 * `contentType` decides whether markup is stripped, exactly as in Python:
 * "text/html" for a serialised page, "text/plain" for prose. */
export function run({ text, tagSet, origin = "page", contentType = "text/plain" }) {
  const ruleSet = getTagSet(tagSet);
  const result = driverResult({ rawText: text, origin, driver: "page", contentType });

  const clauses = clean(result);
  const findings = classify(clauses, ruleSet, origin);
  const verdict = score(findings, {
    ruleSet: ruleSet.name,
    origin,
    clausesAnalyzed: clauses.length,
  });

  // Advisory, never a veto. Attached here rather than in the scorer so
  // scoring stays purely a function of the findings.
  const relevance = checkRelevance(clauses, ruleSet);
  if (!relevance.applies) {
    verdict.metadata = { ...verdict.metadata, relevance: relevanceToDict(relevance) };
  }

  return verdict;
}

/* Analyze already-segmented clauses. Used by the live DOM path, which walks
 * the real document rather than re-parsing serialised HTML. */
export function runOnClauses({ clauses, tagSet, origin = "page" }) {
  const ruleSet = getTagSet(tagSet);
  const findings = classify(clauses, ruleSet, origin);
  const verdict = score(findings, {
    ruleSet: ruleSet.name,
    origin,
    clausesAnalyzed: clauses.length,
  });

  const relevance = checkRelevance(clauses, ruleSet);
  if (!relevance.applies) {
    verdict.metadata = { ...verdict.metadata, relevance: relevanceToDict(relevance) };
  }
  return verdict;
}
