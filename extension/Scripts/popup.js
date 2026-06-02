// popup.js — runs when the popup is open

document.getElementById('runBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = 'Running...';

  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we can inject scripts on this page
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
      statusEl.textContent = 'Error: Cannot run on system pages';
      return;
    }

    // Try to inject the content script if it's not already there
    try {
      console.log("popup");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['./Scripts/content.js', './Scripts/InmarDev.js']
      });
    } catch (err) {
      // Script might already be injected, that's okay
      console.log('Script injection attempt:', err.message);
    }

    // Send a message to the content script on that tab
    chrome.tabs.sendMessage(tab.id, { action: 'run' }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
      } else {
        statusEl.textContent = response?.status ?? 'Done!';
      }
    });
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});
