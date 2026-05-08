// ==UserScript==
// @name         Corporate Invoice Duplicate Checker (Dashboard)
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Scans all corporate invoices for duplicate student enrollments and shows a searchable dashboard
// @author       You
// @match        https://otsystems.net/admin/reports/corporateinvoice/
// @match        https://otsystems.net/admin/reports/CorporateInvoice/
// @match        https://otsystems.net/admin/reports/corporateinvoice/generate.asp*
// @match        https://otsystems.net/admin/reports/CorporateInvoice/generate.asp*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const KEY_QUEUE   = 'inv_queue';
    const KEY_RESULTS = 'inv_results';
    const KEY_RUNNING = 'inv_running';
    const KEY_TOTAL   = 'inv_total';

    const pathLower     = location.pathname.toLowerCase();
    const isMainPage    = pathLower === '/admin/reports/corporateinvoice/';
    const isInvoicePage = pathLower.startsWith('/admin/reports/corporateinvoice/generate.asp');

    GM_addStyle(`
        /* ── Loading screen (shown during scan on invoice pages) ── */
        #dup-loading-screen {
            position: fixed; inset: 0; z-index: 9999999;
            background: #0f172a;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #dup-loading-inner {
            text-align: center; width: min(90vw, 520px);
        }
        #dup-loading-logo {
            font-size: 36px; margin-bottom: 24px;
            animation: dup-pulse 1.8s ease-in-out infinite;
        }
        @keyframes dup-pulse {
            0%, 100% { transform: scale(1);   opacity: 1; }
            50%       { transform: scale(1.12); opacity: 0.75; }
        }
        #dup-loading-title {
            font-size: 18px; font-weight: 600;
            color: #f1f5f9; margin-bottom: 6px;
        }
        #dup-loading-company {
            font-size: 13px; color: #94a3b8;
            margin-bottom: 28px; min-height: 18px;
            white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis; max-width: 100%;
        }
        #dup-loading-track {
            background: #1e293b; border-radius: 8px;
            height: 8px; overflow: hidden; margin-bottom: 10px;
        }
        #dup-loading-bar {
            height: 8px; border-radius: 8px;
            background: linear-gradient(90deg, #6366f1, #818cf8);
            transition: width 0.25s ease;
        }
        #dup-loading-count {
            font-size: 12px; color: #64748b;
        }
        #dup-loading-dots span {
            display: inline-block; width: 6px; height: 6px;
            border-radius: 50%; background: #6366f1; margin: 0 3px;
        }
        #dup-loading-dots span:nth-child(1) { animation: dup-dot 1.2s 0s   infinite; }
        #dup-loading-dots span:nth-child(2) { animation: dup-dot 1.2s 0.2s infinite; }
        #dup-loading-dots span:nth-child(3) { animation: dup-dot 1.2s 0.4s infinite; }
        @keyframes dup-dot {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%           { transform: scale(1);   opacity: 1; }
        }

        /* ── Modal overlay (shown on main page) ── */
        #dup-overlay {
            position: fixed; inset: 0; z-index: 999998;
            background: rgba(0,0,0,0.55);
            display: flex; align-items: center; justify-content: center;
        }
        #dup-modal {
            background: #ffffff; border-radius: 14px;
            width: min(96vw, 900px); max-height: 90vh;
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden; box-shadow: 0 8px 48px rgba(0,0,0,0.28);
        }
        #dup-header {
            padding: 18px 22px 14px;
            border-bottom: 1px solid #e5e7eb;
            flex-shrink: 0;
        }
        #dup-header h1 {
            margin: 0 0 14px; font-size: 17px; font-weight: 600; color: #111827;
        }
        #dup-controls {
            display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
        }
        #dup-search {
            flex: 1; min-width: 180px;
            padding: 8px 12px; border-radius: 8px;
            border: 1px solid #d1d5db; font-size: 13px;
            outline: none; color: #111827;
        }
        #dup-search:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        #dup-filter {
            padding: 8px 12px; border-radius: 8px;
            border: 1px solid #d1d5db; font-size: 13px;
            background: #fff; color: #111827; cursor: pointer; outline: none;
        }
        .dup-btn {
            padding: 8px 16px; border-radius: 8px; border: none;
            font-size: 13px; font-weight: 500; cursor: pointer;
        }
        #dup-start-btn  { background: #6366f1; color: #fff; }
        #dup-start-btn:hover  { background: #4f46e5; }
        #dup-start-btn:disabled { background: #a5b4fc; cursor: not-allowed; }
        #dup-clear-btn  { background: #f3f4f6; color: #374151; }
        #dup-clear-btn:hover  { background: #e5e7eb; }
        #dup-close-btn {
            position: absolute; top: 14px; right: 18px;
            background: none; border: none; font-size: 20px;
            cursor: pointer; color: #9ca3af; line-height: 1;
        }
        #dup-close-btn:hover { color: #374151; }
        #dup-status-msg {
            font-size: 13px; color: #6b7280; margin-top: 8px;
        }
        #dup-stats-row {
            display: flex; gap: 12px; flex-wrap: wrap;
            padding: 12px 22px; border-bottom: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .dup-stat {
            background: #f9fafb; border-radius: 8px;
            padding: 10px 16px; text-align: center; min-width: 100px;
        }
        .dup-stat-num { font-size: 22px; font-weight: 600; color: #111827; }
        .dup-stat-lbl { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .dup-stat.warn .dup-stat-num { color: #dc2626; }
        #dup-body { overflow-y: auto; flex: 1; padding: 14px 22px 22px; }
        .dup-company-block {
            margin-bottom: 14px; border-radius: 10px;
            border: 1px solid #e5e7eb; overflow: hidden;
        }
        .dup-company-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; background: #f9fafb;
            cursor: pointer; user-select: none;
        }
        .dup-company-name { font-size: 14px; font-weight: 600; color: #111827; }
        .dup-company-ap   { font-size: 12px; color: #6b7280; margin-top: 1px; }
        .dup-company-meta { font-size: 12px; color: #9ca3af; margin-top: 2px; }
        .dup-badge {
            font-size: 11px; font-weight: 600; padding: 3px 10px;
            border-radius: 20px; flex-shrink: 0;
        }
        .dup-badge-ok   { background: #dcfce7; color: #15803d; }
        .dup-badge-warn { background: #fee2e2; color: #dc2626; }
        .dup-company-content {
            padding: 12px 16px 14px;
            border-top: 1px solid #f3f4f6;
        }
        .dup-no-dup { font-size: 13px; color: #9ca3af; }
        .dup-student-row {
            margin-bottom: 10px; padding: 12px 14px;
            background: #fff5f5; border-radius: 8px; border: 1px solid #fecaca;
        }
        .dup-student-name {
            font-size: 14px; font-weight: 600; color: #991b1b; margin-bottom: 6px;
        }
        .dup-enrollment {
            display: flex; align-items: baseline; gap: 8px;
            font-size: 12px; color: #374151; margin-top: 4px;
        }
        .dup-enrollment-course { flex: 1; }
        .dup-enrollment-date { color: #9ca3af; flex-shrink: 0; }
        .dup-profile-link { font-size: 11px; color: #6366f1; text-decoration: none; flex-shrink: 0; }
        .dup-profile-link:hover { text-decoration: underline; }
        .dup-invoice-link { font-size: 11px; color: #6366f1; text-decoration: none; }
        .dup-chevron { transition: transform 0.2s; font-size: 12px; color: #9ca3af; }
        .dup-company-block.collapsed .dup-company-content { display: none; }
        .dup-company-block.collapsed .dup-chevron { transform: rotate(-90deg); }
        #dup-empty { text-align: center; padding: 40px 0; color: #9ca3af; font-size: 14px; }
        #dup-trigger-btn {
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            z-index: 2147483647 !important;
            background: #6366f1 !important;
            color: #fff !important;
            border: none !important;
            border-radius: 50% !important;
            width: 56px !important;
            height: 56px !important;
            font-size: 24px !important;
            cursor: pointer !important;
            box-shadow: 0 4px 18px rgba(99,102,241,0.5) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            margin: 0 !important;
            line-height: 1 !important;
            text-decoration: none !important;
            outline: none !important;
        }
        #dup-trigger-btn:hover { background: #4f46e5 !important; }
    `);

    if (isMainPage) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMainPage);
        } else {
            initMainPage();
        }
    }
    if (isInvoicePage && GM_getValue(KEY_RUNNING, false)) showLoadingAndParse();

    // ══════════════════════════════════════════════════════════════
    //  INVOICE PAGE — loading screen + fast parse
    // ══════════════════════════════════════════════════════════════

    function showLoadingAndParse() {
        document.documentElement.style.visibility = 'hidden';

        const total = GM_getValue(KEY_TOTAL, 0);
        const queue = JSON.parse(GM_getValue(KEY_QUEUE, '[]'));
        const done  = total - queue.length + 1;
        const pct   = Math.round((done / total) * 100);

        const screen = document.createElement('div');
        screen.id = 'dup-loading-screen';
        screen.innerHTML = `
            <div id="dup-loading-inner">
                <div id="dup-loading-logo">🔍</div>
                <div id="dup-loading-title">Scanning invoices…</div>
                <div id="dup-loading-company">Loading…</div>
                <div id="dup-loading-track">
                    <div id="dup-loading-bar" style="width:${pct}%"></div>
                </div>
                <div id="dup-loading-count">${done} of ${total} invoices scanned</div>
                <div id="dup-loading-dots" style="margin-top:20px;">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
        document.documentElement.style.visibility = 'visible';
        document.documentElement.style.background = '#0f172a';
        document.body.style.background = '#0f172a';
        document.body.appendChild(screen);

        const parse = () => {
            const companyName     = extractCompanyName();
            const accountsPayable = extractAccountsPayable();
            const duplicates      = extractDuplicates();

            const el = document.getElementById('dup-loading-company');
            if (el) el.textContent = companyName;

            const results = JSON.parse(GM_getValue(KEY_RESULTS, '[]'));
            results.push({ companyName, accountsPayable, invoiceUrl: location.href, duplicates });
            GM_setValue(KEY_RESULTS, JSON.stringify(results));

            const q = JSON.parse(GM_getValue(KEY_QUEUE, '[]'));
            q.shift();
            GM_setValue(KEY_QUEUE, JSON.stringify(q));

            setTimeout(() => {
                if (q.length === 0) {
                    GM_setValue(KEY_RUNNING, false);
                    window.location.href = 'https://otsystems.net/admin/reports/corporateinvoice/';
                } else {
                    window.location.href = q[0];
                }
            }, 200);
        };

        if (document.querySelector('td strong.ng-binding') ||
            document.querySelector('a[href*="/admin/students/dashboard.asp"]')) {
            parse();
        } else {
            const deadline = Date.now() + 4000;
            const wait = () => {
                if (document.querySelector('strong.ng-binding') || Date.now() > deadline) {
                    parse();
                } else {
                    setTimeout(wait, 150);
                }
            };
            setTimeout(wait, 400);
        }
    }

    // ── Extraction helpers ─────────────────────────────────────────

    function getCustomerDivs() {
        // The customer block is .col-sm-8.col-xs-7 — grab all non-empty div text lines
        const block = document.querySelector('.col-sm-8.col-xs-7, .col-xs-7');
        if (!block) return [];
        return [...block.querySelectorAll('div')]
            .map(d => d.textContent.trim())
            .filter(t => t && t !== 'CUSTOMER' && t.length > 1);
    }

    function extractCompanyName() {
        // The company name is the first line that is NOT "Accounts Payable: …",
        // NOT a street address, NOT a city/state/zip line, and NOT a number.
        // Example block order:
        //   "Accounts Payable: Gisha Nettikadan"   ← skip
        //   "Haley & Aldrich, Inc."                ← this is the company name
        //   "70 Blanchard Rd."                     ← skip
        //   "Suite 204"                            ← skip
        //   "Burlington, MA 01803"                 ← skip
        const lines = getCustomerDivs();
        const company = lines.find(t =>
            !t.match(/^Accounts Payable/i) &&
            !t.match(/^\d/) &&
            !t.match(/,\s*[A-Z]{2}\s*\d/) &&
            !t.match(/^\s*(Street|Ave|Blvd|Dr|Rd|Suite|Ste|PO|P\.O|Box|\d)/i) &&
            t.length > 3
        );
        // Fallback: if somehow every line matched a skip rule, use AP line or first line
        return company || lines.find(t => t.match(/^Accounts Payable/i)) || lines[0] || 'Unknown Company';
    }

    function extractAccountsPayable() {
        return getCustomerDivs().find(t => t.match(/^Accounts Payable/i)) || '';
    }

    function extractDuplicates() {
        const studentMap = {};
        document.querySelectorAll('td').forEach(td => {
            const strong = td.querySelector('strong.ng-binding');
            if (!strong) return;
            const courseName = strong.textContent.trim().replace(/\([^)]+\)\s*/, '').trim();
            td.querySelectorAll('a[href*="/admin/students/dashboard.asp"]').forEach(link => {
                const rawText = link.textContent.replace(/\s+/g, ' ').trim();
                const name    = rawText.replace(/\(\d+\/\d+\/\d+\)\s*$/, '').trim();
                const dateM   = rawText.match(/\((\d+\/\d+\/\d+)\)/);
                const date    = dateM ? dateM[1] : '';
                if (!name) return;
                if (!studentMap[name]) studentMap[name] = [];
                studentMap[name].push({ course: courseName, studentUrl: link.href, date });
            });
        });
        return Object.entries(studentMap)
            .filter(([, e]) => e.length >= 2)
            .map(([name, enrollments]) => ({ name, count: enrollments.length, enrollments }));
    }

    // ══════════════════════════════════════════════════════════════
    //  MAIN PAGE
    // ══════════════════════════════════════════════════════════════

    function initMainPage() {
        buildModal();
        buildTriggerButton();

        const saved   = GM_getValue(KEY_RESULTS, null);
        const running = GM_getValue(KEY_RUNNING, false);

        if (saved && !running) {
            const parsed = JSON.parse(saved);
            if (parsed.length > 0) {
                setTimeout(() => {
                    renderDashboard(parsed);
                    document.getElementById('dup-clear-btn').style.display = 'inline-block';
                    document.getElementById('dup-start-btn').disabled = false;
                    setStatus('Previous scan results loaded — click Start to re-scan.', '#6b7280');
                }, 400);
            }
        }
    }

    // Auto-open results after scan completes
    if (isMainPage && !GM_getValue(KEY_RUNNING, false)) {
        const saved = GM_getValue(KEY_RESULTS, null);
        if (saved && JSON.parse(saved).length > 0) {
            setTimeout(() => {
                const parsed = JSON.parse(saved);
                document.getElementById('dup-overlay').style.display = 'flex';
                renderDashboard(parsed);
                document.getElementById('dup-clear-btn').style.display = 'inline-block';
                document.getElementById('dup-start-btn').disabled = false;
                setStatus(`Scan complete — ${parsed.length} invoices checked.`, '#15803d');
            }, 500);
        }
    }

    function buildTriggerButton() {
        const btn = document.createElement('button');
        btn.id = 'dup-trigger-btn';
        btn.title = 'Open Invoice Duplicate Checker';
        btn.textContent = '🔍';
        btn.addEventListener('click', () => {
            document.getElementById('dup-overlay').style.display = 'flex';
        });
        (document.body || document.documentElement).appendChild(btn);
    }

    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = 'dup-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div id="dup-modal" style="position:relative;">
                <button id="dup-close-btn" title="Close">&#x2715;</button>
                <div id="dup-header">
                    <h1>Invoice Duplicate Enrollment Checker</h1>
                    <div id="dup-controls">
                        <input id="dup-search" type="text" placeholder="Search student name, company, or course…" />
                        <select id="dup-filter">
                            <option value="all">All companies</option>
                            <option value="dups">Duplicates only</option>
                            <option value="clean">Clean only</option>
                        </select>
                        <button id="dup-start-btn" class="dup-btn">&#9654; Start Scan</button>
                        <button id="dup-clear-btn" class="dup-btn" style="display:none;">&#x21ba; Clear</button>
                    </div>
                    <div id="dup-status-msg">Ready. Click Start Scan to begin.</div>
                </div>
                <div id="dup-stats-row" style="display:none;">
                    <div class="dup-stat"><div class="dup-stat-num" id="stat-companies">0</div><div class="dup-stat-lbl">Companies</div></div>
                    <div class="dup-stat warn"><div class="dup-stat-num" id="stat-dups">0</div><div class="dup-stat-lbl">With duplicates</div></div>
                    <div class="dup-stat"><div class="dup-stat-num" id="stat-students">0</div><div class="dup-stat-lbl">Dup students</div></div>
                    <div class="dup-stat"><div class="dup-stat-num" id="stat-occurrences">0</div><div class="dup-stat-lbl">Total occurrences</div></div>
                </div>
                <div id="dup-body">
                    <div id="dup-empty" style="display:none;">No results match your search.</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('dup-close-btn').addEventListener('click', () => overlay.style.display = 'none');
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
        document.getElementById('dup-start-btn').addEventListener('click', startScan);
        document.getElementById('dup-clear-btn').addEventListener('click', clearAll);
        document.getElementById('dup-search').addEventListener('input', applyFilters);
        document.getElementById('dup-filter').addEventListener('change', applyFilters);
    }

    function startScan() {
        const generateLinks = [...document.querySelectorAll('a.btn.btn-primary')]
            .filter(a => a.href && a.href.includes('generate.asp'));

        if (!generateLinks.length) {
            setStatus('Waiting for page to load…', '#6b7280');
            setTimeout(() => {
                const links = [...document.querySelectorAll('a.btn.btn-primary')]
                    .filter(a => a.href && a.href.includes('generate.asp'));
                if (!links.length) {
                    setStatus('No Generate links found. Is the page fully loaded?', '#dc2626');
                    return;
                }
                doStartScan(links.map(a => a.href));
            }, 1500);
            return;
        }

        doStartScan(generateLinks.map(a => a.href));
    }

    function doStartScan(urls) {
        GM_setValue(KEY_QUEUE,   JSON.stringify(urls));
        GM_setValue(KEY_RESULTS, JSON.stringify([]));
        GM_setValue(KEY_RUNNING, true);
        GM_setValue(KEY_TOTAL,   urls.length);

        document.getElementById('dup-start-btn').disabled = true;
        document.getElementById('dup-clear-btn').style.display = 'none';
        document.getElementById('dup-stats-row').style.display = 'none';
        document.getElementById('dup-body').innerHTML = '<div id="dup-empty" style="display:none;"></div>';

        setStatus(`Starting scan of ${urls.length} invoices…`, '#6b7280');
        document.getElementById('dup-overlay').style.display = 'none';

        setTimeout(() => { window.location.href = urls[0]; }, 150);
    }

    function clearAll() {
        GM_deleteValue(KEY_QUEUE);
        GM_deleteValue(KEY_RESULTS);
        GM_deleteValue(KEY_RUNNING);
        GM_deleteValue(KEY_TOTAL);
        allResults = [];
        document.getElementById('dup-body').innerHTML = '<div id="dup-empty" style="display:none;"></div>';
        document.getElementById('dup-stats-row').style.display = 'none';
        document.getElementById('dup-clear-btn').style.display = 'none';
        document.getElementById('dup-start-btn').disabled = false;
        setStatus('Cleared. Ready for a new scan.', '#6b7280');
    }

    function setStatus(msg, color) {
        const el = document.getElementById('dup-status-msg');
        if (el) { el.textContent = msg; el.style.color = color || '#6b7280'; }
    }

    let allResults = [];

    function renderDashboard(results) {
        allResults = results;

        const totalDupCompanies = results.filter(r => r.duplicates.length > 0).length;
        const totalStudents     = results.reduce((a, r) => a + r.duplicates.length, 0);
        const totalOccurrences  = results.reduce((a, r) => a + r.duplicates.reduce((b, d) => b + d.count, 0), 0);

        document.getElementById('stat-companies').textContent   = results.length;
        document.getElementById('stat-dups').textContent        = totalDupCompanies;
        document.getElementById('stat-students').textContent    = totalStudents;
        document.getElementById('stat-occurrences').textContent = totalOccurrences;
        document.getElementById('dup-stats-row').style.display  = 'flex';

        applyFilters();
    }

    function applyFilters() {
        if (!allResults.length) return;

        const search    = (document.getElementById('dup-search')?.value || '').toLowerCase().trim();
        const filterVal = document.getElementById('dup-filter')?.value || 'all';

        let filtered = allResults.filter(company => {
            if (filterVal === 'dups'  && company.duplicates.length === 0) return false;
            if (filterVal === 'clean' && company.duplicates.length > 0)   return false;
            if (search) {
                const nameMatch    = company.companyName.toLowerCase().includes(search);
                const apMatch      = (company.accountsPayable || '').toLowerCase().includes(search);
                const studentMatch = company.duplicates.some(d => d.name.toLowerCase().includes(search));
                const courseMatch  = company.duplicates.some(d =>
                    d.enrollments.some(e => e.course.toLowerCase().includes(search))
                );
                if (!nameMatch && !apMatch && !studentMatch && !courseMatch) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            if (b.duplicates.length !== a.duplicates.length) return b.duplicates.length - a.duplicates.length;
            return a.companyName.localeCompare(b.companyName);
        });

        const body = document.getElementById('dup-body');
        body.innerHTML = '<div id="dup-empty" style="display:none;">No results match your search.</div>';

        if (!filtered.length) {
            document.getElementById('dup-empty').style.display = 'block';
            return;
        }

        filtered.forEach(company => {
            const hasDups = company.duplicates.length > 0;

            let dups = company.duplicates;
            if (search) {
                dups = dups.filter(d =>
                    d.name.toLowerCase().includes(search) ||
                    d.enrollments.some(e => e.course.toLowerCase().includes(search))
                );
            }

            const block = document.createElement('div');
            block.className = 'dup-company-block' + (hasDups ? '' : ' collapsed');

            const enrollTxt  = hasDups
                ? `${company.duplicates.length} duplicate student${company.duplicates.length > 1 ? 's' : ''}`
                : 'No duplicates';
            const badgeClass = hasDups ? 'dup-badge-warn' : 'dup-badge-ok';
            const badgeTxt   = hasDups
                ? `&#9888; ${company.duplicates.length} dup${company.duplicates.length > 1 ? 's' : ''}`
                : '&#10003; Clean';

            block.innerHTML = `
                <div class="dup-company-header">
                    <div>
                        <div class="dup-company-name">${escHtml(company.companyName)}</div>
                        ${company.accountsPayable
                            ? `<div class="dup-company-ap">${escHtml(company.accountsPayable)}</div>`
                            : ''}
                        <div class="dup-company-meta">
                            ${enrollTxt} &nbsp;&middot;&nbsp;
                            <a class="dup-invoice-link" href="${company.invoiceUrl}" target="_blank">View invoice &#8599;</a>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="dup-badge ${badgeClass}">${badgeTxt}</span>
                        <span class="dup-chevron">&#9660;</span>
                    </div>
                </div>
                <div class="dup-company-content">
                    ${dups.length === 0
                        ? '<p class="dup-no-dup">No duplicate enrollments found.</p>'
                        : dups.map(dup => `
                            <div class="dup-student-row">
                                <div class="dup-student-name">
                                    ${escHtml(dup.name)}
                                    <span style="font-weight:400;font-size:12px;color:#b91c1c;">
                                        &mdash; appears ${dup.count}&times;
                                    </span>
                                </div>
                                ${dup.enrollments.map(e => `
                                    <div class="dup-enrollment">
                                        <span class="dup-enrollment-course">${escHtml(e.course)}</span>
                                        <span class="dup-enrollment-date">${escHtml(e.date)}</span>
                                        <a class="dup-profile-link" href="${e.studentUrl}" target="_blank">Profile &#8599;</a>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('')
                    }
                </div>
            `;

            block.querySelector('.dup-company-header').addEventListener('click', () => {
                block.classList.toggle('collapsed');
            });

            body.appendChild(block);
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════════════════════

    function escHtml(s) {
        return String(s || '')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

})();
