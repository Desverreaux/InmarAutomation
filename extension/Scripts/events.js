function initEvents() {
  initManuallyReconcileEvent();
  extensionButtonHookEvent();
  hotkeys();
}

function initManuallyReconcileEvent() {
  document.addEventListener('inj:ManuallyReconciled', () => {
    console.log('✅ Manual reconciliation detected');
    clickBackButton();
  });
}

function extensionButtonHookEvent() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'run') {
      try {
        runManualFunction();
        sendResponse({ status: 'Butten Event Fired!' });
      } catch (err) {
        sendResponse({ status: 'Failed: ' + err.message });
      }
    }

    // Return true to allow async sendResponse if needed later
    return true;
  });
}

function hotkeys() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'r') {
      if (pageContext.pageType === 'detailed') {
        toggleReconcileBoxs();
      }
      if (pageContext.pageType === 'quarantined') {
        console.log('debug')
        toggleEmptyQuarantinedEntries();
      }
    }
  });
}

function initDataLoadEvent() {
  document.addEventListener('inj:Data-Loaded', (e) => {
        console.log('[inj] Tables are loaded and populated with data!', e.detail);
        main();
        testingMutationObservation();

      // e.detail.button — the Shipment Information Save <button>
      // e.detail.timestamp — Date.now() when the event fired
      //
      // From here you can safely query the DOM for table data, e.g.:
      //   const rows = document.querySelectorAll('.inm-table tbody tr');
  });
}

function testingMutationObservation() {
  const observerConfig = { childList: true, subtree: true };

  const observer = new MutationObserver((mutations, obs) => {
    obs.disconnect();                          // stop watching while main() runs
    console.log("mutation observed — re-running main()");
    main();
    obs.observe(pageContext.tableElement, observerConfig);  // resume watching after
  });

  observer.observe(pageContext.tableElement, observerConfig);
}

initDataLoadEvent();