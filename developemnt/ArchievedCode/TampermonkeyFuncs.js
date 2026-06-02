// ==UserScript==
// @name         RxTransparent - Load Event
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Fires 'inj:Data-Loaded' once the Shipment Information tables
//               are visible AND their rows are populated with real data.
//               Uses network interception + DOM verification so it does NOT
//               fire prematurely before async API calls complete.
// @match        https://app.rxtransparent.net/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // ------------------------------------------------------------------
    // WHY THE OLD APPROACH FIRED TOO EARLY
    // ------------------------------------------------------------------
    // The previous version watched for the "Save" button to become visible.
    // Vue mounts the component skeleton (including the button) synchronously
    // as part of the initial render. The button is visible almost immediately,
    // but the table data comes from async fetch/XHR API calls that haven't
    // finished yet. So the button visibility and data availability are
    // decoupled — button visible ≠ data in the table.
    //
    // THE FIX: two-layer detection
    //   Layer 1 — Network interception (at document-start, before any requests)
    //             Patches window.fetch and XMLHttpRequest so we can observe
    //             when in-flight data requests settle. After the network goes
    //             quiet for a short debounce window, we move to layer 2.
    //
    //   Layer 2 — DOM verification
    //             Confirm that the tables actually have rows with content.
    //             Only then dispatch 'inj:Data-Loaded'.
    //
    // This combination handles both fast and slow network conditions, and
    // works even if Vue re-fetches data on route changes.
    // ------------------------------------------------------------------


    // ------------------------------------------------------------------
    // Section 1 — Network activity tracker
    // ------------------------------------------------------------------
    // We intercept fetch() and XHR at document-start (before the app runs)
    // so we can count in-flight requests. When all requests settle AND the
    // DOM looks ready, we fire the event.
    //
    // `pendingRequests` counts requests that have started but not yet ended.
    // When it drops to 0 we schedule a DOM readiness check after SETTLE_MS.
    // If new requests start within that window the timeout is cancelled and
    // we wait again — this is a classic "debounce on idle" pattern.
    // ------------------------------------------------------------------

    const SETTLE_MS = 600;   // ms of network silence before we check the DOM
    const MAX_WAIT_MS = 15000; // absolute deadline — fire anyway after this long

    let pendingRequests = 0;
    let settleTimer = null;
    let fired = false;

    function onRequestStart() {
        pendingRequests++;
        if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
        }
    }

    function onRequestEnd() {
        if (pendingRequests > 0) pendingRequests--;
        scheduleCheck();
    }

    function scheduleCheck() {
        if (fired) return;
        if (pendingRequests > 0) return;   // still waiting for responses
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(checkAndFire, SETTLE_MS);
    }

    // --- Patch fetch() ---
    const _fetch = window.fetch;
    window.fetch = function (...args) {
        onRequestStart();
        return _fetch.apply(this, args).finally(onRequestEnd);
    };

    // --- Patch XMLHttpRequest ---
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._injTracked = true;
        return _open.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        if (this._injTracked) {
            onRequestStart();
            this.addEventListener('loadend', onRequestEnd, { once: true });
        }
        return _send.apply(this, args);
    };

    // Absolute deadline — if something goes wrong with the network tracker,
    // fall back to a DOM-only check after MAX_WAIT_MS.
    setTimeout(() => {
        if (!fired) {
            console.warn('[inj] MAX_WAIT_MS reached — attempting DOM check regardless of pending requests');
            checkAndFire();
        }
    }, MAX_WAIT_MS);


    // ------------------------------------------------------------------
    // Section 2 — DOM readiness check
    // ------------------------------------------------------------------
    // Called after the network has been quiet for SETTLE_MS ms.
    // Verifies that the Shipment Information section is visible AND that
    // at least one of its tables has populated rows.
    //
    // If the DOM isn't ready yet (e.g. Vue is still rendering) we set up
    // a MutationObserver to re-run the check when the DOM next changes.
    // ------------------------------------------------------------------

    let domObserver = null;

    function checkAndFire() {
        if (fired) return;

        const saveBtn = findShipmentSaveButton();
        if (!saveBtn || !isVisible(saveBtn)) {
            // The section isn't even rendered yet — wait for DOM changes.
            watchDomForReadiness();
            return;
        }

        if (!tablesHaveData()) {
            // Section is visible but rows are still empty — wait for DOM changes.
            watchDomForReadiness();
            return;
        }

        // Everything looks good — fire the event exactly once.
        fired = true;
        if (domObserver) { domObserver.disconnect(); domObserver = null; }

        document.dispatchEvent(new CustomEvent('inj:Data-Loaded', {
            detail: { button: saveBtn, timestamp: Date.now() }
        }));
    }

    // ------------------------------------------------------------------
    // findShipmentSaveButton()
    // ------------------------------------------------------------------
    // Walks every <header class="inm-headline">, finds the one titled
    // "Shipment Information", and returns the primary "Save" button inside
    // it. Returns null if not found.
    // ------------------------------------------------------------------
    function findShipmentSaveButton() {
        const headers = document.querySelectorAll('header.inm-headline');
        for (const header of headers) {
            const title = header.querySelector('h3.inm-headline__title');
            if (!title || title.textContent.trim() !== 'Shipment Information') continue;
            for (const btn of header.querySelectorAll('button.inm-button--action')) {
                if (btn.textContent.trim() === 'Save') return btn;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------
    // isVisible(element)
    // ------------------------------------------------------------------
    // Returns true only if the element is rendered and has non-zero size.
    // Vue frequently hides elements with display:none / visibility:hidden
    // rather than removing them from the DOM, so we must check both.
    // ------------------------------------------------------------------
    function isVisible(element) {
        if (!element || !element.isConnected) return false;
        if (element.offsetParent === null) return false;
        const cs = getComputedStyle(element);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        const r = element.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    // ------------------------------------------------------------------
    // tablesHaveData()
    // ------------------------------------------------------------------
    // The key guard: checks that at least one <tbody> inside the Shipment
    // Information section contains a <tr> with non-empty text content.
    //
    // This is what was missing before — Vue renders the table skeleton
    // (empty rows or loading spinners) before the API data arrives.
    // We need cells that have real text, not just empty <td> elements.
    //
    // Selector strategy:
    //   We look for table rows anywhere inside an element with the
    //   `inm-table` class (Inmar's standard table component), but only
    //   those that are descendants of a section that contains the visible
    //   Save button we already found. This keeps the check scoped to the
    //   right part of the page and avoids false-positives from other tables.
    //
    // NOTE: If your table uses a different class or structure, adjust the
    //       selector in the querySelectorAll call below.
    // ------------------------------------------------------------------
    function tablesHaveData() {
        // Find all visible <tr> elements in any inm-table on the page.
        // Extend or change this selector to match your specific table wrapper.
        const candidates = [
            'table tbody tr',             // plain <table>
            '.inm-table tbody tr',        // Inmar table component
            '[class*="inm-table"] tr',    // any element whose class contains inm-table
            '.p-datatable tbody tr',      // PrimeVue DataTable (also used on this site)
        ];

        for (const sel of candidates) {
            const rows = document.querySelectorAll(sel);
            for (const row of rows) {
                if (!isVisible(row)) continue;
                // A row is considered "data" if any of its cells has non-whitespace text
                // and the row itself is not a "no results" / loading placeholder.
                const text = row.textContent.trim();
                if (text.length > 0 && !isLoadingPlaceholder(row)) {
                    return true;
                }
            }
        }
        return false;
    }

    // ------------------------------------------------------------------
    // isLoadingPlaceholder(row)
    // ------------------------------------------------------------------
    // Returns true if the row looks like a loading spinner or "no data"
    // message rather than actual data. Add more patterns as needed.
    // ------------------------------------------------------------------
    function isLoadingPlaceholder(row) {
        const text = row.textContent.trim().toLowerCase();
        const placeholderTexts = ['loading', 'no data', 'no results', 'no records'];
        if (placeholderTexts.some(p => text === p)) return true;
        // Rows that contain a spinner element but no real text
        if (row.querySelector('.p-progress-spinner, .inm-spinner, [class*="loading"]')) {
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // watchDomForReadiness()
    // ------------------------------------------------------------------
    // Sets up (or reuses) a MutationObserver that re-runs checkAndFire()
    // whenever the DOM changes. This covers the case where the network
    // is idle but Vue hasn't finished rendering the data into the DOM yet.
    // ------------------------------------------------------------------
    function watchDomForReadiness() {
        if (domObserver || fired) return;
        domObserver = new MutationObserver(() => {
            // Debounce rapid mutations — Vue can fire hundreds in a row.
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(checkAndFire, 150);
        });
        domObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }


    // ------------------------------------------------------------------
    // Example listener — replace this with your actual data-scraping code.
    // ------------------------------------------------------------------
    document.addEventListener('inj:Data-Loaded', (e) => {
        console.log('[inj] Tables are loaded and populated with data!', e.detail);
        // e.detail.button — the Shipment Information Save <button>
        // e.detail.timestamp — Date.now() when the event fired
        //
        // From here you can safely query the DOM for table data, e.g.:
        //   const rows = document.querySelectorAll('.inm-table tbody tr');
    });

})();


