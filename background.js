// =========================================================
// InmarAutomation – Background Service Worker
// Event-driven service worker (Manifest V3).
// Note: service workers are NOT persistent – Chrome may
// terminate them when idle and restart them on demand.
// =========================================================

// ── Installation / update lifecycle ─────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    console.log("[InmarAutomation] Extension installed.");
    // TODO: perform first-run setup (e.g. set default storage values).
    chrome.storage.local.set({ isActive: false });
  } else if (reason === chrome.runtime.OnInstalledReason.UPDATE) {
    console.log("[InmarAutomation] Extension updated.");
    // TODO: handle migration logic between versions if needed.
  }
});

// ── Message handling ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[InmarAutomation] Background received message:", message, "from:", sender);

  switch (message.action) {
    case "getStatus": {
      chrome.storage.local.get(["isActive"], (result) => {
        sendResponse({ isActive: result.isActive ?? false });
      });
      // Return true to indicate async sendResponse.
      return true;
    }

    case "setActive": {
      chrome.storage.local.set({ isActive: message.value }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    // TODO: add more message cases as your automation grows.
    default:
      console.warn("[InmarAutomation] Unknown action:", message.action);
      sendResponse({ error: "Unknown action" });
  }
});

// ── Tab event hooks (optional) ───────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    // TODO: react to page loads on specific URLs if needed.
    // Example: if (tab.url.includes("inmar.com")) { ... }
  }
});

// ── Alarm / scheduled tasks (optional) ──────────────────

// chrome.alarms.create("periodicCheck", { periodInMinutes: 5 });
// chrome.alarms.onAlarm.addListener((alarm) => {
//   if (alarm.name === "periodicCheck") {
//     // TODO: perform periodic background task.
//   }
// });
