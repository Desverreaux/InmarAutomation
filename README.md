# InmarAutomation

A Chrome extension to automate repetitive pharmacy tech tasks on Inmar web pages.

---

## Project structure

```
InmarAutomation/
├── manifest.json      # Extension manifest (Manifest V3)
├── background.js      # Service worker – runs in the background
├── content.js         # Content script – injected into matching pages
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## How to load the extension in Chrome (developer mode)

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the root folder of this repository (`InmarAutomation/`).
5. The extension icon will appear in your toolbar.

---

## Development workflow

| File | Purpose |
|------|---------|
| `manifest.json` | Declares permissions, scripts, and icons. Update `host_permissions` to restrict the extension to specific URLs. |
| `background.js` | Long-running tasks, alarms, and cross-tab coordination. |
| `content.js` | Reads/modifies the DOM of the active page. Add your automation steps here. |
| `popup.js` | Handles the UI in the popup; sends messages to `content.js`. |

### Adding a new automation step

1. Write an `async function` in `content.js` under *Automation steps*.
2. Call it from `startAutomation()` in the same file.
3. Use `logToPopup("message", "info")` to surface status updates in the popup log.

### Reloading after changes

After editing any file, go to `chrome://extensions` and click the **↺ reload** button on the InmarAutomation card, then refresh the target tab.

---

## Permissions used

| Permission | Reason |
|-----------|--------|
| `activeTab` | Access the currently active tab when the user clicks the extension icon. |
| `scripting` | Programmatically inject scripts if needed. |
| `storage` | Persist settings and state across sessions. |
