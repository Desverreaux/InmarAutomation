// =========================================================
// InmarAutomation – Popup Script
// =========================================================

// ── DOM references ──────────────────────────────────────
const statusDot  = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const btnRun     = document.getElementById("btn-run");
const btnStop    = document.getElementById("btn-stop");
const logBox     = document.getElementById("log");
const btnClear   = document.getElementById("btn-clear-log");

// ── Helpers ─────────────────────────────────────────────

/**
 * Append a timestamped entry to the log box.
 * @param {string} message
 * @param {"info"|"success"|"warn"|"error"} level
 */
function log(message, level = "info") {
  const time = new Date().toLocaleTimeString();
  const entry = document.createElement("div");
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${time}] ${message}`;
  logBox.appendChild(entry);
  logBox.scrollTop = logBox.scrollHeight;
}

/**
 * Update the status indicator.
 * @param {"inactive"|"active"|"running"|"error"} state
 */
function setStatus(state) {
  const labels = {
    inactive: "Inactive",
    active:   "Ready",
    running:  "Running…",
    error:    "Error",
  };
  statusDot.className = `dot ${state}`;
  statusText.textContent = labels[state] ?? state;
}

// ── Storage helpers ──────────────────────────────────────

/** Persist a key/value pair to chrome.storage.local. */
function saveToStorage(key, value) {
  chrome.storage.local.set({ [key]: value });
}

/** Read a value from chrome.storage.local (returns a Promise). */
function loadFromStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => resolve(result[key]));
  });
}

// ── Messaging helpers ────────────────────────────────────

/**
 * Send a message to the active tab's content script.
 * @param {object} message
 * @returns {Promise<any>} response from content script
 */
async function sendMessageToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    log("No active tab found.", "error");
    return null;
  }
  return chrome.tabs.sendMessage(tab.id, message);
}

/**
 * Send a message to the background service worker.
 * @param {object} message
 * @returns {Promise<any>} response from background
 */
function sendMessageToBackground(message) {
  return chrome.runtime.sendMessage(message);
}

// ── Core automation ──────────────────────────────────────

/**
 * Entry point – triggered when "Run Automation" is clicked.
 * Replace / extend this function with your specific automation logic.
 */
async function runAutomation() {
  setStatus("running");
  btnRun.disabled  = true;
  btnStop.disabled = false;
  log("Starting automation…", "info");

  try {
    // TODO: implement your automation steps here.
    // Example: ask the content script to perform an action on the page.
    const response = await sendMessageToActiveTab({ action: "startAutomation" });
    log(`Content script responded: ${JSON.stringify(response)}`, "info");

    // TODO: add more steps / logic as needed.

    log("Automation complete.", "success");
    setStatus("active");
  } catch (err) {
    log(`Error: ${err.message}`, "error");
    setStatus("error");
  } finally {
    btnRun.disabled  = false;
    btnStop.disabled = true;
  }
}

/** Stop / cancel the current automation run. */
function stopAutomation() {
  log("Stopping automation…", "warn");
  sendMessageToActiveTab({ action: "stopAutomation" }).catch(() => {});
  setStatus("inactive");
  btnRun.disabled  = false;
  btnStop.disabled = true;
}

// ── Event listeners ──────────────────────────────────────

btnRun.addEventListener("click", runAutomation);
btnStop.addEventListener("click", stopAutomation);
btnClear.addEventListener("click", () => { logBox.innerHTML = ""; });

// Listen for log messages forwarded from the content script / background.
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "LOG") {
    log(message.text, message.level ?? "info");
  }
});

// ── Initialisation ───────────────────────────────────────

(async function init() {
  setStatus("active");
  log("Extension loaded.", "success");
  // TODO: load any persisted settings from storage on startup.
  // const savedSetting = await loadFromStorage("mySetting");
})();
