// ==UserScript==
// @name         RxTransparent - Load Event
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Fires 'inj:Data-Loaded' once the main data table on any
//               supported RxTransparent page has fully rendered. Supports
//               multiple page types via a profile system so the same script
//               works on Shipment Transaction Details, Reconcile/Transactions,
//               Quarantined Products, and any future PrimeVue datatable page.
//               Re-fires on every SPA navigation (URL change).
// @match        https://app.rxtransparent.net/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

// Fair warning this script was made using AI almost exclusively

(function () {
    'use strict';

    // ------------------------------------------------------------------
    // OVERVIEW
    // ------------------------------------------------------------------
    // This script needs to work across several pages on the site that
    // all share the same SPA shell but render very different content:
    //
    //   • Shipment Transaction Details  — uses the custom inm-table
    //     component with Container/Subcontainer sections. Readiness is
    //     confirmed by matching rendered product rows against the
    //     "Product Count - N" labels in each section header.
    //
    //   • Reconcile (Transactions list) — uses PrimeVue's p-datatable.
    //     Readiness is confirmed once the paginator resolves its total
    //     count ("Showing X to Y of Z") and the tbody has rows.
    //
    //   • Quarantined Products          — also p-datatable, same signal.
    //
    //   • Unknown / future pages        — fall back to firing once the
    //     main content area exists and the DOM has been quiet.
    //
    // Rather than duplicating the script per page, a PAGE_PROFILES array
    // maps each page type to its own readiness check. The infrastructure
    // (network settling, SPA re-triggering, timers) is shared and
    // page-agnostic.
    //
    // STRATEGY
    //   Layer 1  Network interception
    //              fetch + XHR are patched ONCE at document-start so we
    //              can tell when the initial REST burst is over. We only
    //              count requests to app.rxtransparent.net so background
    //              chatter (analytics, Qualtrics, mPulse beacons) can't
    //              keep the counter pinned above zero forever.
    //
    //   Layer 2  DOM verification
    //              After the network settles we poll the DOM (driven by
    //              a MutationObserver) until:
    //                a) the active page profile's section gate passes,
    //                b) the profile's data-ready check passes, AND
    //                c) no DOM mutations have occurred for DOM_QUIET_MS.
    //
    //   Layer 3  SPA re-triggering
    //              history.pushState / replaceState are patched and the
    //              popstate event is observed. Any URL change tears down
    //              the current run (timers, observer) and starts fresh.
    //
    //   Plus a 30s hard deadline so we never hang forever.
    //
    // SIGNALR NOTE: the site uses an Azure SignalR Hub for keep-alive
    // pings. The actual data arrives via REST. If Inmar ever moves
    // payload delivery onto the WebSocket the fetch/XHR interceptor
    // will go blind, but the DOM check is authoritative regardless.
    // ------------------------------------------------------------------


    // ===================== Tunables ===================================
    const SETTLE_MS     = 400;    // network must be idle this long to "settle"
    const DOM_QUIET_MS  = 350;    // DOM must be mutation-free this long
    const POLL_MS       = 100;    // re-check interval after network settles
    const MAX_WAIT_MS   = 30000;  // hard deadline; fire whatever we have
    const NAV_DEBOUNCE  = 50;     // ms to debounce rapid pushState calls
    const HOST_RE       = /(^|\.)rxtransparent\.net$/i;  // requests we care about


    // ===================== Per-run state (reset on each navigation) ====
    // Wrapped in an object so resetState() can swap it atomically.
    let s = newState();

    function newState() {
        return {
            pendingRequests:    0,
            networkSettleTimer: null,
            networkSettled:     false,
            lastMutationAt:     0,
            domObserver:        null,
            pollTimer:          null,
            safetyTimer:        null,
            deadlineTimer:      null,
            fired:              false,
        };
    }

    /** Tear down all timers/observers from the current run. */
    function teardown() {
        if (s.domObserver)        { s.domObserver.disconnect(); s.domObserver = null; }
        if (s.pollTimer)          { clearTimeout(s.pollTimer);          s.pollTimer = null; }
        if (s.networkSettleTimer) { clearTimeout(s.networkSettleTimer); s.networkSettleTimer = null; }
        if (s.safetyTimer)        { clearTimeout(s.safetyTimer);        s.safetyTimer = null; }
        if (s.deadlineTimer)      { clearTimeout(s.deadlineTimer);      s.deadlineTimer = null; }
    }


    // ===================== Network interception ========================
    // Patches are applied ONCE. They always read/write the current `s`
    // so they automatically serve whichever run is active.

    function urlIsInteresting(u) {
        try {
            const host = new URL(u, location.href).hostname;
            return HOST_RE.test(host);
        } catch (_) {
            return false;
        }
    }

    function onRequestStart() {
        s.pendingRequests++;
        if (s.networkSettleTimer) {
            clearTimeout(s.networkSettleTimer);
            s.networkSettleTimer = null;
        }
    }

    function onRequestEnd(url) {
        if (s.pendingRequests > 0) s.pendingRequests--;
        if (s.pendingRequests === 0 && !s.networkSettled && !s.fired) {
            console.log('[inj] Network settled, starting DOM polling in', SETTLE_MS, 'ms');
            if (s.networkSettleTimer) clearTimeout(s.networkSettleTimer);
            s.networkSettleTimer = setTimeout(() => {
                s.networkSettled = true;
                startDomPolling();
            }, SETTLE_MS);
        }
    }

    // --- Patch fetch (once) ---
    const _fetch = window.fetch;
    window.fetch = function (input, init) {
        const url = (typeof input === 'string') ? input
                  : (input && input.url) || '';
        const tracked = urlIsInteresting(url);
        if (tracked) onRequestStart(url);
        return _fetch.apply(this, arguments).finally(() => {
            if (tracked) onRequestEnd(url);
        });
    };

    // --- Patch XMLHttpRequest (once) ---
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__injTracked = urlIsInteresting(url);
        this.__injTrackedUrl = url;
        return _open.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        if (this.__injTracked) {
            const url = this.__injTrackedUrl;
            onRequestStart(url);
            this.addEventListener('loadend', () => {
                onRequestEnd(url);

                // Check if this is the ManuallyReconcile endpoint
                if (url && url.includes('ManuallyReconcile') && this.status === 200) {
                    console.log('✅ ManuallyReconcile completed');
                    document.dispatchEvent(new CustomEvent('inj:ManuallyReconciled'));
                }
            }, { once: true });
        }
        return _send.apply(this, args);
    };


    // ===================== SPA navigation detection ===================
    // Vue Router (and most SPA routers) use history.pushState. We patch
    // it — along with replaceState and popstate — so any URL change
    // triggers a fresh run.

    let navDebounceTimer = null;

    function onUrlChange() {
        if (navDebounceTimer) clearTimeout(navDebounceTimer);
        navDebounceTimer = setTimeout(() => {
            console.log('[inj] URL changed →', location.href, '— restarting load detection');
            teardown();
            s = newState();
            startRun();
        }, NAV_DEBOUNCE);
    }

    const _pushState    = history.pushState.bind(history);
    const _replaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
        _pushState(...args);
        onUrlChange();
    };
    history.replaceState = function (...args) {
        _replaceState(...args);
        onUrlChange();
    };

    window.addEventListener('popstate', onUrlChange);


    // ===================== Per-run startup ============================
    function startRun() {
        // Safety net: if the network never settles, force DOM polling.
        s.safetyTimer = setTimeout(() => {
            if (!s.networkSettled && !s.fired) {
                console.warn('[inj] Network never settled (pending:', s.pendingRequests, ') — starting DOM polling anyway');
                s.networkSettled = true;
                startDomPolling();
            }
        }, 5000);

        // Hard deadline.
        s.deadlineTimer = setTimeout(() => {
            if (!s.fired) {
                console.warn('[inj] MAX_WAIT_MS reached — firing on deadline');
                fire(true);
            }
        }, MAX_WAIT_MS);
    }


    // ===================== DOM polling =================================
    function startDomPolling() {
        if (s.fired) return;
        if (!s.domObserver) {
            s.domObserver = new MutationObserver(() => {
                s.lastMutationAt = Date.now();
            });
            s.domObserver.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }
        s.lastMutationAt = Date.now();   // start the quiet window from now
        scheduleCheck();
    }

    function scheduleCheck() {
        if (s.fired) return;
        if (s.pollTimer) clearTimeout(s.pollTimer);
        s.pollTimer = setTimeout(runCheck, POLL_MS);
    }

    function runCheck() {
        if (s.fired) return;

        const sinceMutation = Date.now() - s.lastMutationAt;
        if (sinceMutation < DOM_QUIET_MS) {
            // Vue is still mutating the DOM — wait for it to quiet down.
            scheduleCheck();
            return;
        }

        // Detect which page type we're on and delegate all readiness
        // logic to that profile. Profiles are re-evaluated every check
        // cycle so that a late-painting section header is picked up
        // correctly after a navigation.
        const profile = detectProfile();

        // The section gate has to pass before data checks make sense.
        if (!profile.isSectionVisible()) {
            scheduleCheck();
            return;
        }

        // isReady() returns false to keep polling, or a truthy detail
        // object to fire. This keeps all page-specific knowledge inside
        // the profile definitions below.
        const readyDetail = profile.isReady();
        if (readyDetail !== false) {
            fire(false, { profile: profile.id, ...(readyDetail || {}) });
            return;
        }

        // Not ready yet — keep polling.
        scheduleCheck();
    }


    // ===================== Shared DOM utility ==========================
    function isVisible(element) {
        if (!element || !element.isConnected) return false;
        if (element.offsetParent === null) return false;
        const cs = getComputedStyle(element);
        if (cs.visibility === 'hidden' || cs.display === 'none') return false;
        const r = element.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }


    // ===================== Page profiles ===============================
    // Each profile describes how to recognise a page type and how to
    // tell when its data has finished rendering.
    //
    // Interface per profile:
    //   id              — string key included in the fired event detail
    //   detect()        — returns true if this profile matches the
    //                     current page; tested in array order, first
    //                     match wins
    //   isSectionVisible() — lightweight gate: returns true once the
    //                        page's main content area is on screen.
    //                        Checked before isReady() every poll cycle.
    //   isReady()       — returns false to keep polling, or a plain
    //                     object (may be empty {}) to fire. The object
    //                     is spread into the event's detail payload so
    //                     downstream handlers can inspect counts etc.
    // ------------------------------------------------------------------

    const PAGE_PROFILES = [

        // ── Shipment Transaction Details ─────────────────────────────
        // The original page: nested Container / Subcontainer sections
        // rendered with the custom inm-table component. Readiness is
        // confirmed by matching rendered product rows against the
        // "Product Count - N" label advertised in each section header.
        {
            id: 'shipment',

            detect() {
                // The "Shipment Information" h3 is unique to this page.
                return [...document.querySelectorAll(
                    'header.inm-headline h3.inm-headline__title'
                )].some(t => t.textContent.trim() === 'Shipment Information');
            },

            isSectionVisible() {
                const titles = document.querySelectorAll(
                    'header.inm-headline h3.inm-headline__title'
                );
                for (const t of titles) {
                    if (t.textContent.trim() === 'Shipment Information') {
                        return isVisible(t);
                    }
                }
                return false;
            },

            isReady() {
                const expected = _shipmentExpectedCount();
                const rendered = _shipmentRenderedCount();

                // The page advertises N products and we've rendered N+.
                if (expected > 0 && rendered >= expected) {
                    return { expected, rendered };
                }

                // No Container/Subcontainer headers at all: empty shipment.
                // The section is visible, DOM is quiet, nothing more to wait for.
                if (expected === 0 && !_shipmentHasAnyContainerHeader()) {
                    return { expected: 0, rendered: 0, empty: true };
                }

                return false;
            },
        },

        // ── PrimeVue DataTable pages ──────────────────────────────────
        // Covers the Reconcile/Transactions list, Quarantined Products,
        // and any other page that uses PrimeVue's p-datatable component.
        //
        // Readiness: the tbody has at least one data row AND the
        // paginator has resolved its total count. If there is no
        // paginator (e.g. a small unpaginated table) having any rows
        // is sufficient.
        {
            id: 'datatable',

            detect() {
                return !!document.querySelector('.p-datatable');
            },

            isSectionVisible() {
                const dt = document.querySelector('.p-datatable');
                return dt ? isVisible(dt) : false;
            },

            isReady() {
                const tbody = document.querySelector(
                    '.p-datatable-tbody'
                );
                if (!tbody) return false;

                // Only count real data rows, not filter/header rows.
                const rows = tbody.querySelectorAll('tr[role="row"]');
                if (rows.length === 0) return false;

                // If a paginator exists, wait for it to resolve its count.
                // The paginator shows "Showing X to Y of Z" once the API
                // response has arrived and Vue has finished rendering.
                const paginatorEl = document.querySelector(
                    '.p-paginator-current'
                );
                if (paginatorEl) {
                    const text = paginatorEl.textContent.trim();
                    const m = text.match(/of\s+([\d,]+)/i);
                    if (!m) return false;   // paginator exists but not resolved yet
                    const total = parseInt(m[1].replace(/,/g, ''), 10);
                    return { total, rendered: rows.length };
                }

                // No paginator — rows present is good enough.
                return { rendered: rows.length };
            },
        },

        // ── Unknown / fallback ────────────────────────────────────────
        // Fire once the main content wrapper is in the DOM and the DOM
        // has been quiet for DOM_QUIET_MS. Downstream handlers can check
        // e.detail.profile === 'unknown' and decide what to do.
        {
            id: 'unknown',

            detect() { return true; },

            isSectionVisible() {
                return !!document.querySelector('main.inm-layout-main');
            },

            isReady() { return {}; },
        },
    ];

    /** Return the first profile whose detect() returns true. */
    function detectProfile() {
        for (const p of PAGE_PROFILES) {
            if (p.detect()) return p;
        }
        // Should never reach here because the 'unknown' profile always matches.
        return PAGE_PROFILES[PAGE_PROFILES.length - 1];
    }


    // ===================== Shipment-profile helpers ====================
    // These are only called when the 'shipment' profile is active.

    /**
     * Returns true if any Container/Subcontainer header is present.
     * Used to distinguish an empty shipment (no headers = nothing to
     * wait for) from a still-loading one (headers not painted yet).
     */
    function _shipmentHasAnyContainerHeader() {
        const spans = document.querySelectorAll(
            'header.inm-headline h3.inm-headline__title > span'
        );
        for (const sp of spans) {
            const t = sp.textContent.trim();
            if (t === 'Container' || t === 'Subcontainer') return true;
        }
        return false;
    }

    /**
     * Read the page's "Product Count - N" labels and sum the total.
     * Container-level totals are authoritative; Subcontainer totals are
     * the fallback if no Container header has rendered yet.
     */
    function _shipmentExpectedCount() {
        const headers = document.querySelectorAll('header.inm-headline');
        let containerTotal    = 0;
        let subcontainerTotal = 0;

        for (const h of headers) {
            const title = h.querySelector('h3.inm-headline__title');
            if (!title) continue;
            const labelSpan = title.querySelector('span');
            if (!labelSpan) continue;
            const kind = labelSpan.textContent.trim();
            if (kind !== 'Container' && kind !== 'Subcontainer') continue;

            const actionsSpan = h.querySelector('.inm-headline__actions span');
            if (!actionsSpan) continue;
            const m = actionsSpan.textContent.match(/Product Count\s*-\s*(\d+)/i);
            if (!m) continue;

            const n = parseInt(m[1], 10);
            if (kind === 'Container')    containerTotal    += n;
            if (kind === 'Subcontainer') subcontainerTotal += n;
        }

        return containerTotal || subcontainerTotal;
    }

    /**
     * Count visible <tr>s that look like genuine product-data rows
     * inside the custom inm-table component.
     *
     * A product row:
     *   - lives in a tbody
     *   - has 8+ <td> cells
     *   - has a real checkbox in cell 0  (rejects the shipment-info row)
     *   - has an NDC-shaped number in cell 1 (8–12 digits, nothing else)
     */
    function _shipmentRenderedCount() {
        const rows = document.querySelectorAll('table.inm-table tbody tr');
        let count = 0;
        for (const row of rows) {
            if (!isVisible(row)) continue;
            const cells = row.children;
            if (cells.length < 8) continue;
            if (cells[0].hasAttribute('colspan')) continue;
            if (!cells[0].querySelector('label.inm-checkbox input[type="checkbox"]')) continue;
            const ndc = (cells[1].textContent || '').trim();
            if (!/^\d{8,12}$/.test(ndc)) continue;
            count++;
        }
        return count;
    }


    // ===================== Fire (exactly once per run) =================
    function fire(viaDeadline, detail) {
        if (s.fired) return;
        s.fired = true;

        if (s.domObserver)        { s.domObserver.disconnect(); s.domObserver = null; }
        if (s.pollTimer)          { clearTimeout(s.pollTimer);          s.pollTimer = null; }
        if (s.networkSettleTimer) { clearTimeout(s.networkSettleTimer); s.networkSettleTimer = null; }
        if (s.safetyTimer)        { clearTimeout(s.safetyTimer);        s.safetyTimer = null; }
        if (s.deadlineTimer)      { clearTimeout(s.deadlineTimer);      s.deadlineTimer = null; }

        document.dispatchEvent(new CustomEvent('inj:Data-Loaded', {
            detail: {
                timestamp: Date.now(),
                viaDeadline: !!viaDeadline,
                url: location.href,
                ...(detail || {}),
            },
        }));
    }


    // ===================== Example listener ============================
    // Replace with whatever your data-scraping code needs to do.
    // This fires on every navigation, not just the first page load.
    document.addEventListener('inj:Data-Loaded', (e) => {
        console.log('[inj] Tables loaded and populated', e.detail);
        // e.detail.profile      — which page type fired: 'shipment' |
        //                         'datatable' | 'unknown'
        // e.detail.viaDeadline  — true if fired by the 30s safety deadline
        // e.detail.timestamp    — Date.now() when the event fired
        // e.detail.url          — location.href at time of firing
        //
        // ── shipment profile extras ──────────────────────────────────
        // e.detail.expected     — total expected product rows (from headers)
        // e.detail.rendered     — total rendered product rows
        // e.detail.empty        — true if the shipment has zero products
        //
        // ── datatable profile extras ─────────────────────────────────
        // e.detail.total        — total rows reported by the paginator
        // e.detail.rendered     — rows visible on the current page
        //
        // Suggested scrape targets by profile:
        //   shipment  → document.querySelectorAll('table.inm-table tbody tr')
        //   datatable → document.querySelectorAll('.p-datatable-tbody tr[role="row"]')
    });


    // ===================== Kick off the first run =====================
    startRun();

})();