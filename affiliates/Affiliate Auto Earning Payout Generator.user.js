// ==UserScript==
// @name         Affiliate Auto Earning Payout Generator
// @namespace    otsystems-affiliate
// @version      6.0
// @description  Navigate from summary page → portal list → fuzzy match → view → login → earnings report
// @match        https://otsystems.net/admin/reports/affiliate/*
// @match        https://admin.otsystems.net/*
// @match        https://*.otsystems.net/admin/default.asp
// @match        https://*.otsystems.net/admin/earnings/affiliate_payout_start.asp
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /********************
     * Utilities
     ********************/

    function waitForElement(selector, cb, timeout = 20000, interval = 200) {
        const start = Date.now();
        const timer = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) { clearInterval(timer); cb(el); }
            else if (Date.now() - start > timeout) {
                clearInterval(timer);
                console.warn('Timeout waiting for:', selector);
            }
        }, interval);
    }

    // Flag key: only auto-run once per button click session
    const RUN_FLAG = 'affiliate_auto_run';
    const PORTAL_KEY = 'affiliate_partner_id';

    /********************
     * SUMMARY PAGE
     * Extract partner ID from URL, add button → set flag → navigate to portal list
     ********************/
    if (location.href.includes('/admin/reports/affiliate/')) {

        // Clear any leftover flags from previous runs
        sessionStorage.removeItem(RUN_FLAG);
        sessionStorage.removeItem(PORTAL_KEY);

        // Extract partner ID directly from the URL query string
        const partnerMatch = location.search.match(/[?&]partner=(\d+)/i);
        const partnerId = partnerMatch ? partnerMatch[1] : null;
        console.log('[Affiliate] Partner ID from URL:', partnerId);

        waitForElement('a.btn.btn-primary[href*="Affiliate_Payout_Generate"]', (printBtn) => {
            if (document.getElementById('autoPortalBtn')) return;

            const btn = document.createElement('a');
            btn.id = 'autoPortalBtn';
            btn.textContent = 'Portal Admin Earning Report';
            btn.className = 'btn btn-success';
            btn.style.marginLeft = '10px';

            btn.onclick = (e) => {
                e.preventDefault();
                if (!partnerId) {
                    alert('Could not detect partner ID in the page URL.');
                    return;
                }
                sessionStorage.setItem(PORTAL_KEY, partnerId);
                sessionStorage.setItem(RUN_FLAG, '1');
                console.log('[Affiliate] Button clicked. Partner ID:', partnerId, '— navigating to portal list...');
                window.location.href = 'https://admin.otsystems.net/#/portal/list';
            };

            printBtn.parentNode.insertBefore(btn, printBtn.nextSibling);
        });
    }

    /********************
     * ADMIN SPA (admin.otsystems.net)
     * Since this is a hash-router SPA, the script only runs once on page load.
     * We listen for hashchange events to react to navigation within the app.
     ********************/
    if (location.hostname === 'admin.otsystems.net') {

        let listHandled = false;   // prevent firing the list handler twice
        let viewHandled = false;   // prevent firing the view handler twice

        function handleHash() {
            const hash = location.hash;

            // --- PORTAL LIST ---
            if (hash.includes('/portal/list')) {
                if (listHandled) return;
                if (sessionStorage.getItem(RUN_FLAG) !== '1') return;

                const partnerId = sessionStorage.getItem(PORTAL_KEY);
                if (!partnerId) return;

                listHandled = true;
                console.log('[Affiliate] On portal list. Looking for partner ID:', partnerId);

                let findAttempts = 0;
                const findAndClick = setInterval(() => {
                    findAttempts++;

                    const rows = document.querySelectorAll('#DataTables_Table_0 tbody tr');
                    if (!rows.length) {
                        if (findAttempts > 100) {
                            clearInterval(findAndClick);
                            console.warn('[Affiliate] Timed out waiting for portal table rows.');
                            sessionStorage.removeItem(RUN_FLAG);
                            sessionStorage.removeItem(PORTAL_KEY);
                        }
                        return;
                    }

                    clearInterval(findAndClick);

                    let matchedViewBtn = null;

                    rows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (!cells.length) return;
                        // First td is the numeric partner ID
                        const cellId = cells[0].innerText.trim();
                        if (cellId === partnerId) {
                            console.log('[Affiliate] Exact match found for ID:', partnerId);
                            matchedViewBtn = row.querySelector('td.actions a.btn-success');
                        }
                    });

                    if (matchedViewBtn) {
                        console.log('[Affiliate] Clicking View for partner ID:', partnerId);
                        matchedViewBtn.click();
                    } else {
                        console.warn('[Affiliate] No row found with partner ID:', partnerId);
                        sessionStorage.removeItem(RUN_FLAG);
                        sessionStorage.removeItem(PORTAL_KEY);
                    }

                }, 300);
            }

            // --- PORTAL VIEW PAGE ---
            // Matches #/portal/<name>/... but NOT /portal/list
            if (hash.includes('/portal/') && !hash.includes('/portal/list')) {
                if (viewHandled) return;
                if (sessionStorage.getItem(RUN_FLAG) !== '1') return;

                viewHandled = true;
                console.log('[Affiliate] On portal view page. Looking for login button...');

                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;

                    const loginBtn = document.querySelector('a.btn-info[href*="login.asp"]');

                    if (loginBtn) {
                        clearInterval(interval);
                        console.log('[Affiliate] Clicking login:', loginBtn.href);

                        sessionStorage.removeItem(RUN_FLAG);
                        sessionStorage.removeItem(PORTAL_KEY);

                        loginBtn.removeAttribute('target');
                        loginBtn.click();
                    }

                    if (attempts >= 40) {
                        console.warn('[Affiliate] Login button not found after max retries.');
                        clearInterval(interval);
                        sessionStorage.removeItem(RUN_FLAG);
                        sessionStorage.removeItem(PORTAL_KEY);
                    }

                }, 500);
            }
        }

        // Run once for the current hash (e.g. if page loaded directly on /portal/list)
        handleHash();

        // Run on every subsequent hash change (SPA navigation)
        window.addEventListener('hashchange', () => {
            // Reset per-navigation guards when the hash changes
            listHandled = false;
            viewHandled = false;
            handleHash();
        });
    }

    /********************
     * POST-LOGIN REDIRECT (default.asp)
     * No flag check here — this runs normally after login redirect.
     * Navigates to the earnings payout report and stops.
     ********************/
    if (location.pathname.endsWith('/default.asp')) {

        const interval = setInterval(() => {
            const earningsToggle = document.querySelector('a[data-target="#earningsMenu"]');
            const payoutLink = document.querySelector('#earningsMenu a[href*="affiliate_payout_start.asp"]');

            if (earningsToggle && payoutLink) {
                clearInterval(interval);

                if (!document.querySelector('#earningsMenu').classList.contains('in')) {
                    earningsToggle.click();
                }

                setTimeout(() => payoutLink.click(), 300);
                // Script stops here — no further automation on the payout page
            }
        }, 300);
    }

})();