// ==UserScript==
// @name         Refresher Reminder ⚠️ Student Check
// @namespace    http://otsystems.net/
// @version      4.7
// @description  Checks 2025/2026 enrollments using hidden iframes (no popups). Filters by reminder page keywords. Includes Completed if after reminder date. Active in blue, Completed in green, Payment in red. Progress bar included.
// @match        https://otsystems.net/admin/utilities/refresherreminder/default2.asp
// @grant        none
// @run-at       document-idle
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/569518/Refresher%20Reminder%20%E2%9A%A0%EF%B8%8F%20Student%20Check.user.js
// @updateURL https://update.greasyfork.org/scripts/569518/Refresher%20Reminder%20%E2%9A%A0%EF%B8%8F%20Student%20Check.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const wait = ms => new Promise(res => setTimeout(res, ms));

    // ─── Progress Bar ─────────────────────────────────────────────────────────
    function createProgressBar() {
        const existing = document.getElementById('rr-progress-wrap');
        if (existing) existing.remove();

        const wrap = document.createElement('div');
        wrap.id = 'rr-progress-wrap';
        wrap.style.cssText = `
            position: fixed; bottom: 55px; left: 50%; transform: translateX(-50%);
            z-index: 10001; background: #1a1a1a; border: 2px solid #FF5B00;
            border-radius: 8px; padding: 10px 18px;
            display: flex; align-items: center; gap: 12px;
            font-family: Arial, sans-serif; font-size: 13px; color: #fff;
            box-shadow: 0 2px 12px rgba(255,91,0,0.3); min-width: 300px;
        `;

        const label = document.createElement('span');
        label.id = 'rr-progress-label';
        label.textContent = 'Starting...';
        label.style.whiteSpace = 'nowrap';

        const barWrap = document.createElement('div');
        barWrap.style.cssText = `flex:1; height:8px; background:#333; border-radius:4px; overflow:hidden;`;
        const fill = document.createElement('div');
        fill.id = 'rr-progress-fill';
        fill.style.cssText = `height:100%; width:0%; background:#FF5B00; border-radius:4px; transition:width 0.3s;`;
        barWrap.appendChild(fill);

        wrap.appendChild(label);
        wrap.appendChild(barWrap);
        document.body.appendChild(wrap);

        return {
            update(done, total) {
                const l = document.getElementById('rr-progress-label');
                const f = document.getElementById('rr-progress-fill');
                if (l) l.textContent = `Checking ${done} / ${total}`;
                if (f) f.style.width = `${Math.round((done / total) * 100)}%`;
            },
            remove() {
                const el = document.getElementById('rr-progress-wrap');
                if (el) el.remove();
            }
        };
    }

    // ─── Header & Cell Setup ──────────────────────────────────────────────────
    function replaceHeaderWithInternalBox() {
        const headerRow = document.querySelector(
            '#content > div > div.box-row > div > div > div > div > div > div > div > div.tab-pane.ng-scope.active > div > table > thead > tr'
        );
        if (!headerRow) return;
        const old = headerRow.querySelector('.col-2026-header');
        if (old) old.remove();
        const th = document.createElement('th');
        th.classList.add('col-2026-header');
        th.style.cssText = 'min-width:260px;font-weight:bold;background:#fff;padding:4px 6px;';
        th.textContent = 'Student Account Enrollments';
        if (headerRow.children.length >= 5) headerRow.insertBefore(th, headerRow.children[4]);
        else headerRow.appendChild(th);
    }

    function addCells() {
        const rows = document.querySelectorAll('tr[ng-repeat="reminder in rc.Reminders"]');
        rows.forEach(row => {
            if (!row.querySelector('.col-2026-cell')) {
                const td = document.createElement('td');
                td.classList.add('col-2026-cell');
                td.style.cssText = 'min-width:260px;font-weight:bold;font-size:12px;color:#333;';
                if (row.children.length >= 5) row.insertBefore(td, row.children[4]);
                else row.appendChild(td);
            }
        });
    }

    function parseEnrollmentYear(dateStr) {
        const m = dateStr.match(/Enrolled:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!m) return null;
        let year = m[3];
        if (year.length === 2) year = '20' + year;
        return parseInt(year, 10);
    }

    // ─── Load dashboard in a hidden iframe, inject script, get results ────────
    function loadInIframe(url) {
        return new Promise(resolve => {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = `
                position: fixed; top: -9999px; left: -9999px;
                width: 1px; height: 1px; opacity: 0; pointer-events: none;
                border: none;
            `;
            iframe.src = url;
            document.body.appendChild(iframe);

            const injectedScript = `
                (function() {
                    function send(data) {
                        window.parent.postMessage({ type: '2026-enrollment-data', data }, '*');
                    }
                    function parseEnrollmentYear(dateStr) {
                        const m = dateStr.match(/Enrolled:\\s*(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})/);
                        if (!m) return null;
                        let year = m[3];
                        if (year.length === 2) year = '20' + year;
                        return parseInt(year, 10);
                    }
                    function getCleanTitle(h4) {
                        const clone = h4.cloneNode(true);
                        clone.querySelectorAll('span').forEach(s => s.remove());
                        return clone.innerText.replace(/\\u00A0/g, ' ').replace(/\\s+/g, ' ').trim();
                    }
                    function switchToClassesTab() {
                        const tabs = [...document.querySelectorAll('li.uib-tab')];
                        const tab = tabs.find(t => t.textContent.includes('Classes'));
                        if (!tab) { send([]); return; }
                        const link = tab.querySelector('a.nav-link');
                        if (!link) { send([]); return; }
                        link.click();
                        waitForClassesContent();
                    }
                    function waitForClassesContent() {
                        let attempts = 0;
                        const interval = setInterval(() => {
                            attempts++;
                            const panels = document.querySelectorAll('div.panel-heading.clearfix');
                            if (panels.length > 0 || attempts > 20) {
                                clearInterval(interval);
                                checkEnrollments(panels);
                            }
                        }, 300);
                    }
                    function checkEnrollments(panels) {
                        const results = [];
                        panels.forEach(panel => {
                            const titleEl = panel.querySelector('h4.m-t-sm.ng-binding');
                            const dateEl = panel.querySelector('.panel-title.pull-right strong.m-sm.ng-binding');
                            const header = panel.closest('.panel')?.querySelector('.panel-heading');
                            let status = '';
                            if (header) {
                                const bg = getComputedStyle(header).backgroundColor;
                                if (bg.includes('92, 184, 92') || bg.includes('223, 240, 216')) status = 'Completed';
                                else if (bg.includes('51, 122, 183') || bg.includes('217, 237, 247')) status = 'Active';
                                else if (bg.includes('169, 68, 66') || bg.includes('242, 222, 222')) status = 'Payment';
                            }
                            if (titleEl && dateEl) {
                                const courseTitle = getCleanTitle(titleEl);
                                let dateText = '';
                                dateEl.childNodes.forEach(node => {
                                    if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('Enrolled:')) {
                                        dateText = node.textContent.trim();
                                    }
                                });
                                const year = parseEnrollmentYear(dateText);
                                if (year === 2025 || year === 2026) {
                                    results.push({ title: courseTitle, date: dateText, status });
                                }
                            }
                        });
                        send(results);
                    }
                    setTimeout(switchToClassesTab, 700);
                })();
            `;

            // Inject script once iframe is fully loaded
            iframe.addEventListener('load', () => {
                try {
                    const scriptEl = iframe.contentDocument.createElement('script');
                    scriptEl.textContent = injectedScript;
                    iframe.contentDocument.body.appendChild(scriptEl);
                } catch (e) {
                    // If injection fails (e.g. X-Frame-Options), fall back to null
                    resolve({ data: null, iframe });
                }
            });

            // Listen for postMessage back from iframe
            let finished = false;
            function messageHandler(e) {
                if (e.data?.type === '2026-enrollment-data') {
                    finished = true;
                    window.removeEventListener('message', messageHandler);
                    clearTimeout(timeoutId);
                    resolve({ data: e.data.data, iframe });
                }
            }
            window.addEventListener('message', messageHandler);

            const timeoutId = setTimeout(() => {
                if (!finished) {
                    window.removeEventListener('message', messageHandler);
                    resolve({ data: null, iframe });
                }
            }, 12000);
        });
    }

    // ─── Render results into cell ─────────────────────────────────────────────
    function renderCell(cell, filteredResults) {
        cell.innerHTML = '';
        if (!filteredResults.length) {
            cell.textContent = '❌ NO MATCHING ENROLLMENTS';
            cell.style.color = 'rgb(217, 83, 79)';
            return;
        }
        filteredResults.forEach(r => {
            const div = document.createElement('div');
            div.style.color = 'black';
            const span = document.createElement('span');
            const enrolledDate = r.date.replace(/^Enrolled:\s*/i, '');
            if (r.status === 'Completed') {
                span.textContent = `Enrolled: ${enrolledDate} - ${r.title} [Completed]`;
                span.style.color = 'green';
            } else if (r.status === 'Active') {
                span.textContent = `Enrolled: ${enrolledDate} - ${r.title} [Active]`;
                span.style.color = 'rgb(0, 98, 183)';
            } else if (r.status === 'Payment') {
                span.textContent = `Enrolled: ${enrolledDate} - ${r.title} [Payment]`;
                span.style.color = 'rgb(217, 83, 79)';
            } else {
                span.textContent = `Enrolled: ${enrolledDate} - ${r.title}${r.status ? ' [' + r.status + ']' : ''}`;
            }
            div.appendChild(span);
            cell.appendChild(div);
        });
    }

    // ─── Main Processing Loop ─────────────────────────────────────────────────
    async function processRows() {
        replaceHeaderWithInternalBox();
        addCells();

        const rows = Array.from(document.querySelectorAll('tr[ng-repeat="reminder in rc.Reminders"]'));
        const total = rows.length;
        const progress = createProgressBar();
        let firstRowResult = null; // track if iframe approach works

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const cell = row.querySelector('.col-2026-cell');
            if (!cell) continue;

            progress.update(i + 1, total);
            cell.textContent = 'Checking...';
            cell.style.color = 'gray';

            const dashboardLink = row.querySelector('a[href*="dashboard.asp"]')?.href;
            if (!dashboardLink) {
                cell.textContent = 'No dashboard link';
                cell.style.color = 'gray';
                continue;
            }

            const { data, iframe } = await loadInIframe(dashboardLink);

            // Clean up iframe immediately after getting data
            if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);

            // If first row returned null, iframes are blocked — warn user once
            if (i === 0 && data === null) {
                cell.textContent = '⚠️ Iframes blocked by site. Use v3.9 (popup version) instead.';
                cell.style.color = 'orange';
                progress.remove();
                return;
            }

            if (data === null) {
                cell.textContent = 'Timeout';
                cell.style.color = 'gray';
                continue;
            }

            const reminderTitle = row.querySelector('td:nth-child(3)')?.textContent?.trim() || '';
            const reminderDateEl = row.querySelector('td:nth-child(3) em.ng-binding');
            const reminderDate = reminderDateEl ? reminderDateEl.textContent.trim() : '';

            const keywords = reminderTitle
                .replace(/\b(online|osha|training|version)\b/gi, '')
                .split(/\s+/)
                .filter(w => w.length > 2)
                .map(w => w.toLowerCase());

            const filteredResults = data.filter(r => {
                const titleMatch = keywords.some(kw => r.title.toLowerCase().includes(kw));
                if (!titleMatch) return false;
                if (r.status === 'Completed') {
                    const reminderTime = reminderDate ? new Date(reminderDate) : null;
                    const courseDate = r.date.replace(/^Enrolled:\s*/i, '');
                    const courseTime = courseDate ? new Date(courseDate) : null;
                    if (!reminderTime || !courseTime) return false;
                    return courseTime >= reminderTime;
                }
                return true;
            });

            renderCell(cell, filteredResults);
            await wait(300);
        }

        progress.remove();
    }

    // ─── Button ───────────────────────────────────────────────────────────────
    function addButton() {
        if (document.getElementById('check-students-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'check-students-btn';
        btn.textContent = 'Check ⚠️ Students';
        btn.style.cssText = `
            position: fixed; bottom: 10px; left: 50%; transform: translateX(-50%);
            z-index: 10000; padding: 10px 18px; background: #FF5B00; color: white;
            border: none; border-radius: 5px; cursor: pointer;
            font-weight: bold; font-size: 15px;
        `;
        btn.title = 'Click to check all students for 2025/2026 enrollments (hidden iframes — no popups)';

        btn.onclick = () => {
            btn.disabled = true;
            btn.textContent = 'Checking... Please wait';
            processRows().then(() => {
                btn.textContent = 'Done! ✔️';
                setTimeout(() => {
                    btn.textContent = 'Check ⚠️ Students';
                    btn.disabled = false;
                }, 4000);
            });
        };

        document.body.appendChild(btn);
    }

    replaceHeaderWithInternalBox();
    addButton();
})();