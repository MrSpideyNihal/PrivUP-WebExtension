/* Content-script entry point.
 *
 * Manifest V3 content scripts are classic scripts, not modules, so they
 * cannot use static `import`. A dynamic import can, provided the target is
 * listed in `web_accessible_resources`, which is what the manifest does.
 *
 * This exists solely so the rest of the extension can be plain ES modules
 * with no bundler. The alternative is a build step, and a build step between
 * the source and what runs on a page is a place for the two to disagree.
 */

(async () => {
  try {
    await import(chrome.runtime.getURL("src/content.js"));
  } catch (error) {
    // A page whose CSP blocks the import, or a restricted URL. Failing quietly
    // is correct: PrivUp not appearing is a non-event, and a console error on
    // every page a user visits is not.
    if (chrome.runtime?.lastError) return;
  }
})();
