// =========================================================
// InmarAutomation – Content Script
// Injected into matching web pages (see manifest.json).
// Has direct access to the page's DOM and JavaScript.
// =========================================================

(function () {
  "use strict";

  // Guard against the script being injected more than once.
  if (window.__inmarAutomationLoaded) return;
  window.__inmarAutomationLoaded = true;

  console.log("[InmarAutomation] Content script loaded on:", location.href);

  // ── State ──────────────────────────────────────────────
  let isRunning = false;

  // ── DOM helpers ────────────────────────────────────────

  /**
   * Wait for a CSS selector to appear in the DOM.
   * @param {string} selector
   * @param {number} [timeout=10000] ms before rejecting
   * @returns {Promise<Element>}
   */
  function waitForElement(selector, timeout = 10_000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for selector: ${selector}`));
      }, timeout);
    });
  }

  /**
   * Small delay utility.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Forward a log message back to the popup.
   * @param {string} text
   * @param {"info"|"success"|"warn"|"error"} level
   */
  function logToPopup(text, level = "info") {
    chrome.runtime.sendMessage({ type: "LOG", text, level });
  }

  // ── Automation steps ────────────────────────────────────
  // Add your automation functions here.  Each step should be
  // a focused async function that does one thing.

  /**
   * Example step – replace with your real automation logic.
   */
  async function exampleStep() {
    logToPopup("Running example step…", "info");
    // TODO: implement – e.g. click a button, fill a form, scrape data.
    await sleep(500);
    logToPopup("Example step complete.", "success");
  }

  /**
   * Main automation routine.
   * Called when the popup sends { action: "startAutomation" }.
   */
  async function startAutomation() {
    if (isRunning) {
      logToPopup("Automation already running.", "warn");
      return;
    }
    isRunning = true;
    logToPopup("Content script: automation started.", "info");

    try {
      await exampleStep();
      // TODO: add more steps in sequence.
    } catch (err) {
      logToPopup(`Content script error: ${err.message}`, "error");
      console.error("[InmarAutomation]", err);
    } finally {
      isRunning = false;
    }
  }

  /** Stop the current automation run. */
  function stopAutomation() {
    isRunning = false;
    logToPopup("Content script: automation stopped.", "warn");
  }

  // ── Message listener ────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.action) {
      case "startAutomation":
        startAutomation();
        sendResponse({ status: "started" });
        break;

      case "stopAutomation":
        stopAutomation();
        sendResponse({ status: "stopped" });
        break;

      default:
        sendResponse({ error: "Unknown action" });
    }
  });
})();
