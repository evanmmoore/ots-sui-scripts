// ==UserScript==
// @name         Corporate Invoice Duplicate Checker (Dashboard)
// @namespace    http://tampermonkey.net/
// @version      10.1
// @description  Fast parallel scan for duplicate enrollments in the SAME course family, with corporate hyperlink + billing contact, manual overrides, target-month comparison, Payment filtering, resolve/unmatch, and LIVE per-course status (Active/Completed/Payment/Pending/Refunded) pulled from each student's account
// @author       You
// @match        https://otsystems.net/admin/reports/corporateinvoice/
// @match        https://otsystems.net/admin/reports/CorporateInvoice/
// @match        https://otsystems.net/admin/reports/corporateinvoice/generate.asp*
// @match        https://otsystems.net/admin/reports/CorporateInvoice/generate.asp*
// @match        https://otsystems.net/admin/students/dashboard/*
// @match        https://otsystems.net/admin/students/dashboard*
// @include      /^https:\/\/otsystems\.net\/admin\/reports\/corporateinvoice\//i
// @include      /^https:\/\/otsystems\.net\/admin\/students\/dashboard/i
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      safetyunlimited.com
// @connect      www.safetyunlimited.com
// ==/UserScript==

(function () {
    'use strict';

    // ── Module-level mutable state (declared up top so on-load code can't hit
    //    a temporal-dead-zone error referencing these before initialization) ──
    let allResults = [];
    let scan = null;        // active turbo scan: { queue, total, results, failed, active, stopped, frames, startedAt }
    let tourIdx = 0;
    let tourActive = false;

    // Manual overrides, loaded from storage on init. Operate on normalized roots.
    //   excluded:    [root, ...]                       — never count this course as a dup
    //   splits:      [[rootA, rootB], ...]             — never group these two together
    //   merges:      [[rootA, rootB], ...]             — always treat these two as the same
    // raw[] keeps an example original course string per root so the panel is readable.
    //   dismissed:   [key, ...]                        — specific student+course groups dismissed
    //   resolved:    [key, ...]                        — specific student+course groups marked Resolved
    let overrides = { excluded: [], splits: [], merges: [], dismissed: [], resolved: [], raw: {} };

    // Course families: if the cleaned name contains any keyword, it collapses to
    // the family root. Add new families here as you spot them — order matters only
    // in that the first matching family wins. Keep the most specific keywords first.
    const COURSE_ALIASES = [
        { root: 'osha outreach', match: [/\bosha\s*10\b/, /\b10\s*hour\s*osha\b/, /\bosha\s*30\b/, /\b30\s*hour\s*osha\b/] },
        { root: 'hazwoper supervisor', match: [/hazwoper\s*supervisor/, /supervisor.*hazwoper/] },
        { root: 'hazwoper', match: [/hazwoper/] },
        { root: 'h2s',      match: [/\bh2s\b/, /hydrogen\s*sulfide/] },
        { root: 'first aid cpr', match: [/first\s*aid/, /\bcpr\b/, /\baed\b/] },
        { root: 'confined space', match: [/confined\s*space/] },
        { root: 'fall protection', match: [/fall\s*protection/] },
        { root: 'forklift', match: [/forklift|powered\s*industrial\s*truck|\bpit\b/] },
        { root: 'respiratory', match: [/respirator|respiratory/] },
        { root: 'lockout tagout', match: [/lockout|tagout|loto/] },
    ];

    const KEY_QUEUE   = 'inv_queue';        // legacy navigation scan only
    const KEY_RESULTS = 'inv_results_v2';
    const KEY_RUNNING = 'inv_running';      // legacy navigation scan only
    const KEY_TOTAL   = 'inv_total';        // legacy navigation scan only
    const KEY_RUN_TS  = 'inv_run_ts';       // legacy scan start time (staleness guard)
    const KEY_OVERRIDES = 'inv_overrides';  // manual match/exclude overrides
    const KEY_CORPMAP = 'inv_corpmap';      // org_id -> {corpName, corpEditUrl}, for legacy scan
    const KEY_CLASSAPI = 'inv_classapi';    // captured JSON_Classes.asp request template {bodyTemplate, token}
    const KEY_INVAPI = 'inv_invapi';        // captured JSON_CorporateInvoice.asp request template
    const STATUS_ENDPOINT = 'https://otsystems.net/admin/students/dashboard/classes/api/JSON_Classes.asp';
    const INVOICE_ENDPOINT = 'https://otsystems.net/admin/reports/corporateinvoice/JSON_CorporateInvoice.asp';
    const CERT_ENDPOINT = 'https://www.safetyunlimited.com/cdn/projects/certificate/print.asp';
    const CERT_CONCURRENCY = 5;             // parallel certificate checks
    const STATUS_CONCURRENCY = 5;           // parallel student-status fetches
    const INV_ORG_PLACEHOLDER = '__ORG_ID__';
    const INV_START_PLACEHOLDER = '__START_DATE__';
    const INV_END_PLACEHOLDER = '__END_DATE__';

    const LEGACY_STALE_MS = 5 * 60 * 1000;  // a legacy scan older than this is treated as dead

    // True only if a legacy navigation scan is genuinely in progress: flag set,
    // queue non-empty, and started recently. A stuck flag with no queue won't trigger.
    function legacyScanActive() {
        if (!GM_getValue(KEY_RUNNING, false)) return false;
        const queue = JSON.parse(GM_getValue(KEY_QUEUE, '[]'));
        if (!queue.length) return false;
        const ts = GM_getValue(KEY_RUN_TS, 0);
        if (!ts || (Date.now() - ts) > LEGACY_STALE_MS) return false;
        return true;
    }

    function clearLegacyScanState() {
        GM_deleteValue(KEY_QUEUE);
        GM_deleteValue(KEY_RUNNING);
        GM_deleteValue(KEY_TOTAL);
        GM_deleteValue(KEY_RUN_TS);
        GM_deleteValue(KEY_CORPMAP);
    }

    const FUZZY_THRESHOLD  = 0.80;   // course-name similarity (0–1) to count as the "same" course
    const SCAN_CONCURRENCY = 4;      // how many invoices load at once (raise to 6 if your connection/server handles it)
    const SCAN_TIMEOUT_MS  = 15000;  // per-invoice deadline before retry/fail
    const STABLE_MS        = 400;    // enrollment count must hold steady this long before parsing (accuracy guard)
    const EMPTY_GRACE_MS   = 2000;   // how long to wait for enrollments on an apparently-empty invoice

    // ── Guided tour steps (edit freely) ───────────────────────────
    const TOUR_STEPS = [
        { el: '#dup-start-btn',     title: 'Start Scan',
          text: 'Scans every invoice on this page by loading them in hidden background frames, several at a time — the page no longer navigates away, and you can hit Stop mid-scan to keep partial results.' },
        { el: '#dup-month',         title: 'Target month',
          text: 'Set your date range wide when generating invoices, then pick the billing month here. The dashboard will only flag students who have an enrollment IN this month plus a matching earlier enrollment in the same course. Leave it blank to see every same-course duplicate.' },
        { el: '#dup-payment-wrap',  title: 'Hide Payment',
          text: 'Enrollments showing the red Payment badge on the invoice are excluded from both the display and the duplicate detection while this is checked.' },
        { el: '#dup-search',        title: 'Search',
          text: 'Filter the results live by student name, company, accounts payable contact, or course name.' },
        { el: '#dup-filter',        title: 'Company filter',
          text: 'Show all companies, only those with duplicates, or only the clean ones.' },
        { el: '#dup-stats-row',     title: 'Totals',
          text: 'Live counts for companies scanned, companies with duplicates, duplicate students, and total duplicate enrollments. These update as you change the month, Payment, and search filters.' },
        { el: '#dup-gear-btn',      title: 'Match overrides',
          text: 'Opens the overrides panel: force two differently-named courses to match, review pairs you split apart, see excluded courses, and review duplicates you unmatched or marked Resolved. On any result row you can click ✕ to exclude a course, "Not a match" to split a wrongly-grouped pair, "Resolve" to mark a duplicate handled (it stays visible with a strike-through and survives re-scans — use "Hide resolved" to tuck them away), or "Unmatch" to dismiss it (with an instant Undo). Everything here is reversible.' },
        { el: '#dup-body',          title: 'Results',
          text: 'Click a company header to expand or collapse it. Duplicate enrollments are grouped per student per course (fuzzy matched). Rows highlighted in yellow fall inside your target month. Use the Profile and View invoice links to jump straight to the source.' }
    ];

    const pathLower     = location.pathname.toLowerCase();
    const isMainPage    = pathLower === '/admin/reports/corporateinvoice/';
    const isInvoicePage = pathLower.startsWith('/admin/reports/corporateinvoice/generate.asp');
    const isDashboardPage = pathLower.startsWith('/admin/students/dashboard');

    GM_addStyle(`
        /* ── Loading screen (legacy navigation scan on invoice pages) ── */
        #dup-loading-screen {
            position: fixed; inset: 0; z-index: 9999999;
            background: #0f172a;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #dup-loading-inner { text-align: center; width: min(90vw, 520px); }
        #dup-loading-logo {
            font-size: 36px; margin-bottom: 24px;
            animation: dup-pulse 1.8s ease-in-out infinite;
        }
        @keyframes dup-pulse {
            0%, 100% { transform: scale(1);   opacity: 1; }
            50%       { transform: scale(1.12); opacity: 0.75; }
        }
        #dup-loading-title { font-size: 18px; font-weight: 600; color: #f1f5f9; margin-bottom: 6px; }
        #dup-loading-company {
            font-size: 13px; color: #94a3b8; margin-bottom: 28px; min-height: 18px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
        }
        #dup-loading-track { background: #1e293b; border-radius: 8px; height: 8px; overflow: hidden; margin-bottom: 10px; }
        #dup-loading-bar {
            height: 8px; border-radius: 8px;
            background: linear-gradient(90deg, #6366f1, #818cf8);
            transition: width 0.25s ease;
        }
        #dup-loading-count { font-size: 12px; color: #64748b; }
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

        /* ── Modal overlay (main page) ── */
        #dup-overlay {
            position: fixed; inset: 0; z-index: 999998;
            background: rgba(0,0,0,0.55);
            display: flex; align-items: center; justify-content: center;
        }
        #dup-modal {
            background: #ffffff; border-radius: 14px;
            width: min(96vw, 940px); max-height: 90vh;
            display: flex; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden; box-shadow: 0 8px 48px rgba(0,0,0,0.28);
        }
        #dup-header { padding: 18px 22px 14px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0; }
        #dup-header h1 { margin: 0 0 14px; font-size: 17px; font-weight: 600; color: #111827; }
        #dup-controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        #dup-search {
            flex: 1; min-width: 160px;
            padding: 8px 12px; border-radius: 8px;
            border: 1px solid #d1d5db; font-size: 13px;
            outline: none; color: #111827;
        }
        #dup-search:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        #dup-filter, #dup-month {
            padding: 8px 12px; border-radius: 8px;
            border: 1px solid #d1d5db; font-size: 13px;
            background: #fff; color: #111827; cursor: pointer; outline: none;
        }
        #dup-month:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        #dup-payment-wrap {
            display: flex; align-items: center; gap: 6px;
            font-size: 13px; color: #374151; cursor: pointer; user-select: none;
            padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff;
        }
        #dup-payment-wrap input { cursor: pointer; margin: 0; }
        .dup-btn {
            padding: 8px 16px; border-radius: 8px; border: none;
            font-size: 13px; font-weight: 500; cursor: pointer;
        }
        #dup-start-btn  { background: #6366f1; color: #fff; }
        #dup-start-btn:hover  { background: #4f46e5; }
        #dup-start-btn.scanning { background: #dc2626; }
        #dup-start-btn.scanning:hover { background: #b91c1c; }
        #dup-clear-btn  { background: #f3f4f6; color: #374151; }
        #dup-clear-btn:hover  { background: #e5e7eb; }
        #dup-clear-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        #dup-close-btn {
            position: absolute; top: 14px; right: 18px;
            background: none; border: none; font-size: 20px;
            cursor: pointer; color: #9ca3af; line-height: 1;
        }
        #dup-close-btn:hover { color: #374151; }
        #dup-help-btn {
            position: absolute; top: 13px; right: 50px;
            width: 24px; height: 24px; border-radius: 50%;
            background: #1a3a5c; color: #fff; border: none;
            font-size: 13px; font-weight: 700; cursor: pointer;
            line-height: 24px; padding: 0; text-align: center;
        }
        #dup-help-btn:hover { background: #2d5a8c; }
        #dup-gear-btn {
            position: absolute; top: 13px; right: 82px;
            width: 24px; height: 24px; border-radius: 50%;
            background: #1a3a5c; color: #fff; border: none;
            font-size: 14px; cursor: pointer;
            line-height: 24px; padding: 0; text-align: center;
        }
        #dup-gear-btn:hover { background: #2d5a8c; }
        #dup-status-msg { font-size: 13px; color: #6b7280; margin-top: 8px; }

        /* ── Inline row actions (exclude ✕, split) ── */
        .dup-row-action {
            border: none; cursor: pointer; border-radius: 5px;
            font-size: 11px; line-height: 1; padding: 3px 7px; flex-shrink: 0;
        }
        .dup-excl-btn { background: #f3f4f6; color: #9ca3af; padding: 3px 6px; font-weight: 700; }
        .dup-excl-btn:hover { background: #fee2e2; color: #dc2626; }
        .dup-split-btn {
            background: #eef2ff; color: #4f46e5; font-weight: 600;
            margin-left: 8px; vertical-align: middle;
        }
        .dup-split-btn:hover { background: #e0e7ff; }
        .dup-unmatch-btn {
            background: #fef3c7; color: #b45309; font-weight: 600;
            margin-left: 6px; vertical-align: middle;
        }
        .dup-unmatch-btn:hover { background: #fde68a; }
        .dup-resolve-btn {
            background: #dcfce7; color: #15803d; font-weight: 600;
            margin-left: 6px; vertical-align: middle;
        }
        .dup-resolve-btn:hover { background: #bbf7d0; }
        .dup-unresolve-btn {
            background: #f3f4f6; color: #6b7280; font-weight: 600;
            margin-left: 8px; vertical-align: middle;
        }
        .dup-unresolve-btn:hover { background: #e5e7eb; }
        .dup-resolved-badge {
            display: inline-block; margin-left: 8px; vertical-align: middle;
            font-size: 10px; font-weight: 700; letter-spacing: .03em;
            color: #15803d; background: #dcfce7; padding: 2px 7px; border-radius: 999px;
        }
        /* A resolved duplicate stays visible but is clearly struck through + faded */
        .dup-student-row.dup-resolved { opacity: 0.62; }
        .dup-student-row.dup-resolved .dup-student-name { text-decoration: line-through; text-decoration-color: #9ca3af; }
        .dup-student-row.dup-resolved .dup-resolved-badge { text-decoration: none; }
        .dup-student-row.dup-resolved .dup-enrollment { text-decoration: line-through; text-decoration-color: #d1d5db; }
        .dup-unmatched-notice {
            margin-bottom: 10px; padding: 10px 14px;
            background: #f9fafb; border: 1px dashed #d1d5db; border-radius: 8px;
            font-size: 13px; color: #6b7280;
            display: flex; align-items: center; gap: 10px;
        }
        .dup-undo-btn {
            background: #1a3a5c; color: #fff; border: none; border-radius: 6px;
            font-size: 12px; font-weight: 600; padding: 4px 12px; cursor: pointer;
        }
        .dup-undo-btn:hover { background: #2d5a8c; }

        /* ── Overrides panel ── */
        #dup-ovr-panel {
            position: absolute; inset: 0; z-index: 5;
            background: #fff; border-radius: 14px;
            display: none; flex-direction: column;
        }
        #dup-ovr-head {
            display: flex; justify-content: space-between; align-items: center;
            padding: 18px 22px 14px; border-bottom: 1px solid #e5e7eb;
            font-size: 17px; font-weight: 600; color: #111827; flex-shrink: 0;
        }
        #dup-ovr-close {
            background: none; border: none; font-size: 20px; line-height: 1;
            color: #9ca3af; cursor: pointer;
        }
        #dup-ovr-close:hover { color: #374151; }
        #dup-ovr-body { overflow-y: auto; flex: 1; padding: 14px 22px 22px; }
        .dup-ovr-sect { margin-bottom: 22px; }
        .dup-ovr-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 3px; }
        .dup-ovr-hint { font-size: 12px; color: #9ca3af; margin-bottom: 10px; }
        .dup-ovr-merge-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
        .dup-ovr-merge-row select {
            flex: 1; min-width: 160px; padding: 7px 10px;
            border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px;
            color: #111827; background: #fff; outline: none;
        }
        .dup-ovr-eq { font-weight: 700; color: #6b7280; }
        .dup-ovr-btn {
            background: #1a3a5c; color: #fff; border: none; border-radius: 8px;
            font-size: 13px; font-weight: 500; padding: 7px 16px; cursor: pointer;
        }
        .dup-ovr-btn:hover { background: #2d5a8c; }
        .dup-ovr-list { display: flex; flex-direction: column; gap: 6px; }
        .dup-ovr-item {
            display: flex; justify-content: space-between; align-items: center;
            gap: 10px; padding: 8px 12px; background: #f9fafb;
            border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px; color: #374151;
        }
        .dup-ovr-item b { color: #111827; }
        .dup-ovr-rm {
            background: none; border: none; color: #dc2626; cursor: pointer;
            font-size: 12px; font-weight: 600; flex-shrink: 0;
        }
        .dup-ovr-rm:hover { text-decoration: underline; }
        .dup-ovr-empty { font-size: 12px; color: #cbd5e1; font-style: italic; }

        /* ── In-modal scan progress ── */
        #dup-progress { display: none; margin-top: 10px; }
        #dup-progress-track {
            background: #eef2ff; border-radius: 8px; height: 8px; overflow: hidden;
        }
        #dup-progress-bar {
            height: 8px; width: 0%; border-radius: 8px;
            background: linear-gradient(90deg, #6366f1, #818cf8);
            transition: width 0.2s ease;
        }
        #dup-progress-text {
            font-size: 12px; color: #6b7280; margin-top: 5px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        #dup-stats-row {
            display: flex; gap: 12px; flex-wrap: wrap;
            padding: 12px 22px; border-bottom: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .dup-stat { background: #f9fafb; border-radius: 8px; padding: 10px 16px; text-align: center; min-width: 100px; }
        .dup-stat-num { font-size: 22px; font-weight: 600; color: #111827; }
        .dup-stat-lbl { font-size: 11px; color: #9ca3af; margin-top: 2px; }
        .dup-stat.warn .dup-stat-num { color: #dc2626; }
        #dup-body { overflow-y: auto; flex: 1; padding: 14px 22px 22px; }
        .dup-company-block { margin-bottom: 14px; border-radius: 10px; border: 1px solid #e5e7eb; overflow: hidden; }
        .dup-company-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 16px; background: #f9fafb; cursor: pointer; user-select: none;
        }
        .dup-company-name { font-size: 14px; font-weight: 600; color: #111827; }
        .dup-company-headleft { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .dup-corp-name {
            font-size: 14px; font-weight: 700; color: #1a3a5c;
            text-decoration: none; display: inline-block;
        }
        .dup-corp-name:hover { text-decoration: underline; }
        .dup-corp-name-missing { color: #6b7280; font-weight: 700; }
        .dup-billing { display: flex; align-items: baseline; gap: 6px; margin-top: 1px; }
        .dup-billing-label {
            font-size: 9px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
            color: #fff; background: #1a3a5c; padding: 1px 6px; border-radius: 4px; flex-shrink: 0;
        }
        .dup-billing-name { font-size: 12px; color: #374151; }
        .dup-company-ap   { font-size: 12px; color: #6b7280; margin-top: 1px; }
        .dup-company-meta { font-size: 12px; color: #9ca3af; margin-top: 2px; }
        .dup-badge { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; flex-shrink: 0; }
        .dup-badge-ok   { background: #dcfce7; color: #15803d; }
        .dup-badge-warn { background: #fee2e2; color: #dc2626; }
        .dup-company-content { padding: 12px 16px 14px; border-top: 1px solid #f3f4f6; }
        .dup-no-dup { font-size: 13px; color: #9ca3af; }
        .dup-student-row {
            margin-bottom: 10px; padding: 12px 14px;
            background: #fff5f5; border-radius: 8px; border: 1px solid #fecaca;
        }
        .dup-student-name { font-size: 14px; font-weight: 600; color: #991b1b; margin-bottom: 6px; }
        .dup-course-label { font-weight: 400; font-size: 12px; color: #b91c1c; }
        .dup-enrollment {
            display: flex; align-items: baseline; gap: 8px;
            font-size: 12px; color: #374151; margin-top: 4px;
            padding: 3px 6px; border-radius: 6px;
        }
        .dup-enrollment.dup-in-month { background: #fef9c3; border-left: 3px solid #eab308; }
        .dup-enrollment-course { flex: 1; }
        .dup-enrollment-date { color: #9ca3af; flex-shrink: 0; }
        .dup-pay-badge {
            flex-shrink: 0; font-size: 10px; font-weight: 700;
            background: #dc2626; color: #fff; border-radius: 4px; padding: 1px 6px;
        }
        .dup-profile-link { font-size: 11px; color: #6366f1; text-decoration: none; flex-shrink: 0; }
        .dup-profile-link:hover { text-decoration: underline; }
        /* Live course-status badges (colors mirror the account's legend) */
        .dup-status-badge {
            flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .02em;
            border-radius: 4px; padding: 1px 6px; color: #fff;
        }
        .dup-st-active    { background: #2563eb; }  /* Active   — blue  */
        .dup-st-completed { background: #16a34a; }  /* Completed— green */
        .dup-st-payment   { background: #dc2626; }  /* Payment  — red   */
        .dup-st-pending   { background: #d97706; }  /* Pending  — amber */
        .dup-st-refunded  { background: #0891b2; }  /* Refunded — info  */
        .dup-st-failed    { background: #7c3aed; }  /* Failed/DNC */
        .dup-st-deleted   { background: #9ca3af; }  /* Deleted  */
        .dup-st-other     { background: #6b7280; }
        .dup-st-checking  { background: #e5e7eb; color: #9ca3af; }
        .dup-aid {
            flex-shrink: 0; font-size: 10px; font-weight: 600;
            color: #6b7280; background: #f3f4f6; border: 1px solid #e5e7eb;
            border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, monospace;
        }
        .dup-invoice-link { font-size: 11px; color: #6366f1; text-decoration: none; }
        .dup-chevron { transition: transform 0.2s; font-size: 12px; color: #9ca3af; }
        .dup-company-block.collapsed .dup-company-content { display: none; }
        .dup-company-block.collapsed .dup-chevron { transform: rotate(-90deg); }
        #dup-empty { text-align: center; padding: 40px 0; color: #9ca3af; font-size: 14px; }
        #dup-trigger-btn {
            position: fixed !important; bottom: 24px !important; right: 24px !important;
            z-index: 2147483647 !important;
            background: #6366f1 !important; color: #fff !important;
            border: none !important; border-radius: 50% !important;
            width: 56px !important; height: 56px !important;
            font-size: 24px !important; cursor: pointer !important;
            box-shadow: 0 4px 18px rgba(99,102,241,0.5) !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            padding: 0 !important; margin: 0 !important; line-height: 1 !important;
            text-decoration: none !important; outline: none !important;
        }
        #dup-trigger-btn:hover { background: #4f46e5 !important; }
        /* Inline variant: purple like the fixed button, but positioned in the page
           toolbar. Box metrics (padding/font/height) are copied from the refresh
           button as inline styles at placement time, so they win over this rule. */
        #dup-trigger-btn.dup-inline {
            position: static !important; inset: auto !important;
            bottom: auto !important; right: auto !important; top: auto !important; left: auto !important;
            float: none !important; clear: none !important;
            display: inline-flex !important; align-items: center !important; justify-content: center !important;
            vertical-align: middle !important;
            width: auto !important; height: auto !important;
            margin: 0 0 0 6px !important;
            box-shadow: none !important;
        }
        #dup-trigger-btn.dup-inline:hover { background: #4f46e5 !important; }
        .dup-scan-frame {
            position: fixed !important; left: -99999px !important; top: 0 !important;
            width: 1024px !important; height: 768px !important;
            visibility: hidden !important; border: 0 !important;
        }

        /* ── Guided tour (dark blue #1a3a5c) ── */
        #dup-tour-spot {
            position: fixed; z-index: 1000004;
            border-radius: 10px; pointer-events: none;
            box-shadow: 0 0 0 99999px rgba(10, 22, 36, 0.72), 0 0 0 3px #1a3a5c;
            transition: all 0.25s ease;
        }
        #dup-tour-tip {
            position: fixed; z-index: 1000005;
            width: min(86vw, 320px);
            background: #ffffff; border-radius: 10px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.35);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            overflow: hidden;
        }
        #dup-tour-tip-head {
            background: #1a3a5c; color: #fff;
            padding: 10px 14px; font-size: 13px; font-weight: 600;
            display: flex; justify-content: space-between; align-items: center;
        }
        #dup-tour-step-count { font-size: 11px; font-weight: 400; color: #a8c4e0; }
        #dup-tour-tip-body { padding: 12px 14px; font-size: 12.5px; color: #374151; line-height: 1.5; }
        #dup-tour-tip-foot {
            display: flex; justify-content: space-between; align-items: center;
            padding: 0 14px 12px;
        }
        .dup-tour-btn {
            border: none; border-radius: 6px; cursor: pointer;
            font-size: 12px; font-weight: 600; padding: 6px 14px;
        }
        #dup-tour-next { background: #1a3a5c; color: #fff; }
        #dup-tour-next:hover { background: #2d5a8c; }
        #dup-tour-back { background: #e8eef4; color: #1a3a5c; }
        #dup-tour-back:hover { background: #d3dfeb; }
        #dup-tour-back:disabled { opacity: 0.4; cursor: not-allowed; }
        #dup-tour-skip {
            background: none; border: none; color: #cbd5e1;
            font-size: 16px; cursor: pointer; line-height: 1; padding: 0 0 0 10px;
        }
        #dup-tour-skip:hover { color: #fff; }
    `);

    // Don't run UI/scan logic inside our own hidden scan iframes
    const inScanFrame = window.top !== window.self;

    if (isMainPage && !inScanFrame) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMainPage);
        } else {
            initMainPage();
        }
    }
    // Legacy navigation scan (fallback path) still works exactly as before
    if (isInvoicePage && !inScanFrame && legacyScanActive()) showLoadingAndParse();

    // Silently capture the JSON request bodies the site itself sends, so the report
    // can replay them: JSON_Classes.asp on dashboard pages, JSON_CorporateInvoice.asp
    // on invoice (generate.asp) pages — including inside our hidden scan iframes,
    // which is where the invoice request naturally fires during a scan.
    if (isDashboardPage || isInvoicePage) installClassApiCapture();

    // ══════════════════════════════════════════════════════════════
    //  LEGACY INVOICE-PAGE SCAN (fallback if iframe scanning is blocked)
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
                <div id="dup-loading-logo">&#128269;</div>
                <div id="dup-loading-title">Scanning invoices&hellip;</div>
                <div id="dup-loading-company">Loading&hellip;</div>
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
            const companyName     = extractCompanyName(document);
            const accountsPayable = extractAccountsPayable(document);
            const enrollments     = extractEnrollments(document);

            const el = document.getElementById('dup-loading-company');
            if (el) el.textContent = companyName;

            const results = JSON.parse(GM_getValue(KEY_RESULTS, '[]'));
            let corpMap = {};
            try { corpMap = JSON.parse(GM_getValue(KEY_CORPMAP, '{}')); } catch (e) { corpMap = {}; }
            const result = { companyName, accountsPayable, invoiceUrl: location.href, enrollments };
            attachCorp(result, corpMap);
            results.push(result);
            GM_setValue(KEY_RESULTS, JSON.stringify(results));

            const q = JSON.parse(GM_getValue(KEY_QUEUE, '[]'));
            q.shift();
            GM_setValue(KEY_QUEUE, JSON.stringify(q));

            setTimeout(() => {
                if (q.length === 0) {
                    GM_setValue(KEY_RUNNING, false);
                    GM_deleteValue(KEY_RUN_TS);
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

    // ══════════════════════════════════════════════════════════════
    //  CORPORATE-NAME MAP (built from the MAIN report page)
    //  Each table row pairs a Generate button (generate.asp?org_id=N)
    //  with the corporate link (org_master_edit.asp?ID=M) + name.
    //  We key strictly off org_id from the Generate link, since org_id
    //  and the corporate edit ID do not always match.
    // ══════════════════════════════════════════════════════════════

    function parseOrgId(url) {
        if (!url) return null;
        const m = url.match(/[?&]org_id=(\d+)/i);
        return m ? m[1] : null;
    }

    function buildCorpMap() {
        const map = {};
        const rows = document.querySelectorAll('tr');
        rows.forEach(tr => {
            const gen = tr.querySelector('a[href*="generate.asp"]');
            if (!gen) return;
            const orgId = parseOrgId(gen.getAttribute('href') || gen.href);
            if (!orgId) return;
            const corpLink = tr.querySelector('a[href*="org_master_edit.asp"]');
            if (!corpLink) return;
            const nameEl = corpLink.querySelector('strong') || corpLink;
            const corpName = (nameEl.textContent || '').trim();
            // Normalize the edit URL to an absolute path on otsystems.net
            let editHref = corpLink.getAttribute('href') || corpLink.href || '';
            if (editHref.startsWith('/')) editHref = 'https://otsystems.net' + editHref;
            if (corpName) map[orgId] = { corpName, corpEditUrl: editHref };
        });
        return map;
    }

    // Decorate a freshly-parsed result with corporate name/link from the map.
    function attachCorp(result, corpMap) {
        if (!result || !corpMap) return result;
        const orgId = parseOrgId(result.invoiceUrl);
        const hit = orgId && corpMap[orgId];
        if (hit) {
            result.corpName    = hit.corpName;
            result.corpEditUrl = hit.corpEditUrl;
        }
        return result;
    }

    // ══════════════════════════════════════════════════════════════
    //  LIVE COURSE STATUS  (from each student's JSON_Classes.asp endpoint)
    // ══════════════════════════════════════════════════════════════
    //
    //  We can't hard-code the request body (it varies / carries a token), so on
    //  any student dashboard page we passively capture the real POST the page
    //  makes, store its body as a template (student number swapped for a token),
    //  plus the security-token header. The report later replays that template for
    //  every unique student number to read per-course Status.

    const STATUS_TOKEN_PLACEHOLDER = '__STUDENT_NUMBER__';

    function getSecurityTokenFromCookie() {
        const m = document.cookie.match(/(?:^|;\s*)security-token=([^;]+)/);
        return m ? m[1] : '';
    }

    // Turn a captured body string into a template by replacing the student number.
    function makeBodyTemplate(bodyStr, studentNumber) {
        if (!bodyStr) return null;
        const sn = String(studentNumber);
        // Replace the student number wherever it appears (as a JSON value).
        // Be conservative: only swap standalone occurrences of the number.
        const re = new RegExp('([":\\s])' + sn + '([",}\\s])', 'g');
        return bodyStr.replace(re, '$1' + STATUS_TOKEN_PLACEHOLDER + '$2');
    }

    function saveClassApiTemplate(bodyStr) {
        // Derive the student number this page is for, from the URL.
        const sn = (location.search.match(/student_number=(\d+)/) ||
                    location.pathname.match(/student_number=(\d+)/) || [])[1];
        let template = bodyStr;
        if (sn && bodyStr && bodyStr.includes(sn)) {
            template = makeBodyTemplate(bodyStr, sn);
        }
        const token = getSecurityTokenFromCookie();
        GM_setValue(KEY_CLASSAPI, JSON.stringify({ bodyTemplate: template, token, capturedAt: Date.now() }));
        console.log('[dup] captured JSON_Classes template:', template);
    }

    // Build an invoice-body template from a captured request by replacing the
    // org_id and dates (read from the page's hidden inputs) with placeholders.
    function saveInvoiceApiTemplate(bodyStr) {
        if (!bodyStr) return;
        const org = (document.getElementById('hidOrgId') || {}).value ||
                    (location.search.match(/org_id=(\d+)/i) || [])[1] || '';
        const start = (document.getElementById('hidStartDate') || {}).value ||
                      (location.search.match(/startdate=([^&]+)/i) ? decodeURIComponent(RegExp.$1) : '');
        const end = (document.getElementById('hidEndDate') || {}).value ||
                    (location.search.match(/enddate=([^&]+)/i) ? decodeURIComponent(RegExp.$1) : '');
        let tmpl = bodyStr;
        if (org)   tmpl = tmpl.split(org).join(INV_ORG_PLACEHOLDER);
        if (start) tmpl = tmpl.split(start).join(INV_START_PLACEHOLDER);
        if (end)   tmpl = tmpl.split(end).join(INV_END_PLACEHOLDER);
        const token = getSecurityTokenFromCookie();
        GM_setValue(KEY_INVAPI, JSON.stringify({ bodyTemplate: tmpl, token, capturedAt: Date.now() }));
        console.log('[dup] captured invoice JSON body template:', tmpl);
    }

    function getInvoiceApiTemplate() {
        try {
            const raw = GM_getValue(KEY_INVAPI, null);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !o.bodyTemplate) return null;
            return o;
        } catch (e) { return null; }
    }

    function installClassApiCapture() {
        const isClassUrl = (u) => typeof u === 'string' && u.indexOf('JSON_Classes.asp') !== -1;
        const isInvUrl   = (u) => typeof u === 'string' && u.indexOf('JSON_CorporateInvoice.asp') !== -1;
        const route = (url, body) => {
            if (typeof body !== 'string' || !body) return;
            if (isClassUrl(url)) saveClassApiTemplate(body);
            else if (isInvUrl(url)) saveInvoiceApiTemplate(body);
        };
        // Stash the parsed invoice response (which carries enrollment IDs + status)
        // on this window so the scan can read it from the iframe's contentWindow.
        const captureInvResponse = (text) => {
            try {
                const data = JSON.parse(text);
                if (data && Array.isArray(data.InvoiceData)) {
                    window.__dupInvoiceData = data.InvoiceData;
                    console.log('[dup] captured invoice response in frame:', data.InvoiceData.length, 'rows');
                }
            } catch (e) {}
        };

        // Wrap fetch
        try {
            const origFetch = window.fetch;
            if (origFetch && !origFetch.__dupWrapped) {
                window.fetch = function (input, init) {
                    let url;
                    try {
                        url = (typeof input === 'string') ? input : (input && input.url);
                        if (init && init.body) route(url, init.body);
                    } catch (e) {}
                    const p = origFetch.apply(this, arguments);
                    if (isInvUrl(url)) {
                        try {
                            return p.then(resp => {
                                resp.clone().text().then(captureInvResponse).catch(() => {});
                                return resp;
                            });
                        } catch (e) { return p; }
                    }
                    return p;
                };
                window.fetch.__dupWrapped = true;
            }
        } catch (e) {}

        // Wrap XMLHttpRequest
        try {
            const XHR = window.XMLHttpRequest;
            if (XHR && !XHR.prototype.__dupWrapped) {
                const origOpen = XHR.prototype.open;
                const origSend = XHR.prototype.send;
                XHR.prototype.open = function (method, url) {
                    this.__dupUrl = url;
                    return origOpen.apply(this, arguments);
                };
                XHR.prototype.send = function (body) {
                    try { route(this.__dupUrl, body); } catch (e) {}
                    if (isInvUrl(this.__dupUrl)) {
                        this.addEventListener('load', function () {
                            try { captureInvResponse(this.responseText); } catch (e) {}
                        });
                    }
                    return origSend.apply(this, arguments);
                };
                XHR.prototype.__dupWrapped = true;
            }
        } catch (e) {}
    }

    function getClassApiTemplate() {
        try {
            const raw = GM_getValue(KEY_CLASSAPI, null);
            if (!raw) return null;
            const o = JSON.parse(raw);
            if (!o || !o.bodyTemplate) return null;
            return o;
        } catch (e) { return null; }
    }

    // Fetch one student's class list. Returns array of {course, statusRaw, status, dateKey}.
    async function fetchStudentClasses(studentNumber, tmpl) {
        let body = tmpl.bodyTemplate;
        if (body.includes(STATUS_TOKEN_PLACEHOLDER)) {
            body = body.split(STATUS_TOKEN_PLACEHOLDER).join(String(studentNumber));
        }
        const headers = { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json' };
        const token = tmpl.token || getSecurityTokenFromCookie();
        if (token) headers['security-token'] = token;

        const resp = await fetch(STATUS_ENDPOINT, {
            method: 'POST', credentials: 'include', headers, body
        });
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch (e) {
            console.warn('[dup] status fetch: non-JSON response for student', studentNumber,
                         '(HTTP', resp.status + ')', text.slice(0, 200));
            throw new Error('bad json');
        }
        const list = data && data.returnObj && Array.isArray(data.returnObj.enrollments)
            ? data.returnObj.enrollments : [];
        console.log('[dup] status fetch: student', studentNumber, '→', list.length, 'classes');
        return list.map(en => ({
            course: en.Course_Name || '',
            statusRaw: en.Status || '',
            dateKey: dateToKey(en.signup_date)
        }));
    }

    // m/d/y (any time portion) -> "y-m-d" canonical key for matching.
    function dateToKey(str) {
        const m = String(str || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!m) return '';
        let mo = Number(m[1]), d = Number(m[2]), y = Number(m[3]);
        if (y < 100) y += 2000;
        return y + '-' + mo + '-' + d;
    }

    // Map the site's status text to one of our buckets (+ a CSS class).
    // Focus statuses: active, completed, payment, pending, refunded.
    function statusBucket(raw) {
        const t = String(raw || '').toLowerCase();
        // Check failure first: "Did Not Complete" contains "complete".
        if (t.includes('fail') || t.includes('did not')) return 'failed';
        if (t.includes('complete')) return 'completed';
        if (t.includes('refund'))   return 'refunded';
        if (t.includes('payment'))  return 'payment';
        if (t.includes('pending'))  return 'pending';
        if (t.includes('active'))   return 'active';
        if (t.includes('delete'))   return 'deleted';
        return t ? 'other' : '';
    }

    // GM_xmlhttpRequest promise wrapper (works cross-origin, unlike fetch).
    function gmXhr() {
        if (typeof GM_xmlhttpRequest !== 'undefined') return GM_xmlhttpRequest;
        if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') return GM.xmlHttpRequest;
        return null;
    }
    function gmRequest(opts) {
        return new Promise((resolve, reject) => {
            const xhr = gmXhr();
            if (!xhr) { reject(new Error('no GM_xmlhttpRequest')); return; }
            try {
                xhr({
                    method: opts.method || 'GET',
                    url: opts.url,
                    timeout: opts.timeout || 15000,
                    onload: res => resolve(res),
                    onerror: err => reject(err),
                    ontimeout: () => reject(new Error('timeout'))
                });
            } catch (e) { reject(e); }
        });
    }

    // A completed course returns a PDF certificate (large, starts with %PDF);
    // an incomplete one returns a short HTML page saying "you have not completed
    // an evaluation for this course". Detect on those concrete signals.
    function certIndicatesCompleted(html, status, contentType) {
        const t = String(html || '');
        const lower = t.toLowerCase();
        // Explicit "not completed" page → Active.
        if (lower.includes('have not completed') || lower.includes('not completed an evaluation')) return false;
        // PDF certificate → Completed. (%PDF may sit a few chars in, after a meta tag.)
        if (t.indexOf('%PDF') !== -1) return true;
        if (/application\/pdf/i.test(contentType || '')) return true;
        // A real certificate response is large; the "not completed" page is ~99 bytes.
        if (t.length > 2000) return true;
        // Otherwise treat as not completed (safer default: Active).
        return false;
    }

    async function checkCertificate(enrollmentId) {
        const res = await gmRequest({ url: CERT_ENDPOINT + '?id=' + encodeURIComponent(enrollmentId) });
        const html = res && res.responseText ? res.responseText : '';
        const ct = res && res.responseHeaders ? (res.responseHeaders.match(/content-type:\s*([^\r\n]+)/i) || [])[1] : '';
        return {
            completed: certIndicatesCompleted(html, res && res.status, ct),
            status: res && res.status,
            finalUrl: res && res.finalUrl,
            len: html.length,
            snippet: html.replace(/\s+/g, ' ').slice(0, 140)
        };
    }

    // For every DUPLICATE enrollment, check its certificate to mark it Completed
    // (cert exists) or Active (no cert). Only these two statuses are surfaced.
    async function fetchAllStatuses(onProgress) {
        if (!gmXhr()) {
            console.warn('[dup] GM_xmlhttpRequest not granted — cannot check certificates cross-origin.');
            return { ok: false, reason: 'no-gm-xhr' };
        }

        // Identify enrollments that belong to a duplicate group.
        const dupPairs = new Set();   // "sn||root"
        allResults.forEach(co => {
            const groups = computeCompanyDups(co, false, null, false, '');
            groups.forEach(g => g.enrollments.forEach(e => {
                const sn = accountNumber(e.studentUrl);
                if (sn && sn !== '?') dupPairs.add(sn + '||' + normCourse(e.course));
            }));
        });

        // Gather the actual duplicate enrollment objects that have an ID to check.
        const targets = [];
        let dupTotal = 0, dupNoId = 0;
        allResults.forEach(co => (co.enrollments || []).forEach(e => {
            const sn = accountNumber(e.studentUrl);
            if (!sn || sn === '?') return;
            if (!dupPairs.has(sn + '||' + normCourse(e.course))) return;
            dupTotal++;
            if (e.invoiceBucket === 'payment') return;  // Payment status shown as-is; no cert check
            if (!e.enrollmentId) { dupNoId++; return; }
            e.certChecking = true;
            targets.push(e);
        }));

        const total = targets.length;
        console.log('[dup] certificate check: duplicate enrollments =', dupTotal,
                    '| with an ID =', total, '| missing ID =', dupNoId);
        if (dupTotal > 0 && total === 0) {
            console.warn('[dup] no enrollment IDs available — these invoices were read via the iframe ' +
                         'fallback (no ID), not the JSON endpoint. The certificate check needs the JSON path. ' +
                         'Check the console for "[dup] invoice JSON" lines during the scan.');
            return { ok: false, reason: 'no-ids' };
        }
        if (!total) return { ok: true, fetched: 0, total: 0, matched: 0 };

        // Cache by enrollmentId so identical IDs aren't re-checked.
        const certCache = {};
        let done = 0, failed = 0, matched = 0, logged = 0;
        let idx = 0;
        async function worker() {
            while (idx < targets.length) {
                const e = targets[idx++];
                const id = e.enrollmentId;
                try {
                    let completed = certCache[id];
                    if (completed === undefined) {
                        const r = await checkCertificate(id);
                        completed = r.completed;
                        certCache[id] = completed;
                        if (logged < 3) {
                            logged++;
                            console.log('[dup] cert id', id, '→', completed ? 'COMPLETED' : 'ACTIVE',
                                        '| HTTP', r.status, '| len', r.len, '| finalUrl', r.finalUrl,
                                        '| snippet:', r.snippet);
                        }
                    }
                    e.liveStatus = completed ? 'Completed' : 'Active';
                    e.liveBucket = completed ? 'completed' : 'active';
                    e.certChecking = false;
                    matched++;
                } catch (err) {
                    e.certChecking = false;
                    failed++;
                    console.warn('[dup] certificate check failed for id', id, err && (err.message || err.error || err));
                }
                done++;
                if (onProgress) onProgress(done, total, failed);
            }
        }
        const workers = [];
        for (let i = 0; i < Math.min(CERT_CONCURRENCY, targets.length); i++) workers.push(worker());
        await Promise.all(workers);

        console.log('[dup] certificate check done: checked', done, '/', total, '| failed', failed, '| marked', matched);
        GM_setValue(KEY_RESULTS, JSON.stringify(allResults));
        return { ok: true, fetched: done - failed, total, failed, matched };
    }

    // ══════════════════════════════════════════════════════════════
    //  EXTRACTION (now takes any document — main page or iframe)
    // ══════════════════════════════════════════════════════════════

    function getCustomerDivs(doc) {
        const block = doc.querySelector('.col-sm-8.col-xs-7, .col-xs-7');
        if (!block) return [];
        return [...block.querySelectorAll('div')]
            .map(d => d.textContent.trim())
            .filter(t => t && t !== 'CUSTOMER' && t.length > 1);
    }

    function extractCompanyName(doc) {
        const lines = getCustomerDivs(doc);
        const company = lines.find(t =>
            !t.match(/^Accounts Payable/i) &&
            !t.match(/^\d/) &&
            !t.match(/,\s*[A-Z]{2}\s*\d/) &&
            !t.match(/^\s*(Street|Ave|Blvd|Dr|Rd|Suite|Ste|PO|P\.O|Box|\d)/i) &&
            t.length > 3
        );
        return company || lines.find(t => t.match(/^Accounts Payable/i)) || lines[0] || 'Unknown Company';
    }

    function extractAccountsPayable(doc) {
        return getCustomerDivs(doc).find(t => t.match(/^Accounts Payable/i)) || '';
    }

    function extractEnrollments(doc) {
        // Flat list of every enrollment on the invoice:
        // { course, name, date, status ('Payment' | 'Pending' | ''), studentUrl }
        //
        // Real invoice DOM: each line item is one <tr>/<td> whose course name is
        // in a <strong>, prefixed by an item-number link like "(0077-1246) Course".
        // Each enrollment is its own <div ng-repeat="en in cl.Enrollments">
        // containing exactly ONE student link, with text "First Last (m/d/yy)".
        // We read enrollments per-div so the name, date and student URL stay paired
        // (the old code grabbed all links under a td at once, which could scramble
        //  associations when the DOM differed).
        const out = [];
        const seen = new Set();

        const parseLink = (link, courseName) => {
            if (!link) return;
            const badge  = link.querySelector('span.badge');
            const status = badge ? badge.textContent.trim() : '';

            const clone = link.cloneNode(true);
            clone.querySelectorAll('span.badge').forEach(b => b.remove());
            const rawText = clone.textContent.replace(/\s+/g, ' ').trim();

            const dateM = rawText.match(/\((\d+\/\d+\/\d+)\)/);
            const date  = dateM ? dateM[1] : '';
            const name  = rawText.replace(/\(\d+\/\d+\/\d+\)\s*$/, '').trim();
            if (!name) return;

            // Dedupe identical (course+name+date+studentUrl) rows that can occur
            // when both the primary and fallback selectors hit the same node.
            const key = courseName + '|' + name + '|' + date + '|' + (link.href || '');
            if (seen.has(key)) return;
            seen.add(key);

            out.push({ course: courseName, name, date, status, studentUrl: link.href });
        };

        const courseFromStrong = (strong) => {
            // Strip a leading "(item-number)" prefix, e.g. "(0077-1246) 40 Hour HAZWOPER Online".
            // Some courses legitimately contain parentheses later (e.g. "(H2S)"), so only
            // remove the FIRST parenthetical when it sits at the very start.
            let txt = strong.textContent.replace(/\s+/g, ' ').trim();
            txt = txt.replace(/^\(\s*[^)]*\)\s*/, '').trim();
            return txt;
        };

        // Primary path: course rows that contain enrollment divs.
        const strongs = [...doc.querySelectorAll('strong.ng-binding, td strong')];
        strongs.forEach(strong => {
            const courseName = courseFromStrong(strong);
            if (!courseName) return;

            // The enrollment divs are siblings within the same containing <td>.
            const td = strong.closest('td');
            if (!td) return;

            // Each enrollment is a div holding a single student link.
            const enrollDivs = [...td.querySelectorAll('div[ng-repeat*="Enrollments"]')];
            if (enrollDivs.length) {
                enrollDivs.forEach(div => {
                    parseLink(div.querySelector('a[href*="/admin/students/dashboard.asp"]'), courseName);
                });
            } else {
                // Fallback for any layout without ng-repeat markers: take every
                // student link under this td (older DOM).
                td.querySelectorAll('a[href*="/admin/students/dashboard.asp"]')
                  .forEach(link => parseLink(link, courseName));
            }
        });

        return out;
    }

    // ══════════════════════════════════════════════════════════════
    //  FUZZY COURSE MATCHING + DUPLICATE LOGIC
    // ══════════════════════════════════════════════════════════════

    function normCourse(s) {
        let t = String(s || '').toLowerCase();

        // Drop trailing grade like "(90%)" and any other parenthetical EXCEPT (h2s)
        t = t.replace(/\(\s*\d+\s*%\s*\)/g, ' ');
        t = t.replace(/\((?![^)]*h2s)[^)]*\)/g, ' ');

        // Strip decorating boilerplate (suffixes that don't change the course identity)
        t = t
            .replace(/w\/\s*wallet\s*id(\s*card)?/g, ' ')   // "w/Wallet ID Card" / "w/Wallet ID"
            .replace(/\bwallet\b/g, ' ')
            .replace(/\bid\s*card\b/g, ' ')
            .replace(/\b\d+\s*[- ]?\s*(hour|hr|hrs)\b/g, ' ') // "8 Hour", "40-hr"  (hour counts = noise)
            .replace(/\b(refresher|initial|annual|recert|recertification|awareness|certification|certificate)\b/g, ' ')
            .replace(/\b(online|webinar|course|class|training|the|and|w|with)\b/g, ' ');

        // Collapse to a known family root if one matches. Test against both the
        // cleaned text and the raw lowercased name — some patterns (e.g. "30 hour
        // osha") rely on tokens like the hour count that cleaning strips out.
        const raw = String(s || '').toLowerCase();
        const cleaned = t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
        for (const fam of COURSE_ALIASES) {
            if (fam.match.some(re => re.test(cleaned) || re.test(raw))) return fam.root;
        }

        return cleaned;
    }

    function bigrams(s) {
        const g = [];
        const t = s.replace(/\s+/g, '');
        for (let i = 0; i < t.length - 1; i++) g.push(t.slice(i, i + 2));
        return g;
    }

    function diceSimilarity(a, b) {
        if (a === b) return 1;
        if (!a || !b) return 0;
        if (a.includes(b) || b.includes(a)) return 1;
        const A = bigrams(a), B = bigrams(b);
        if (!A.length || !B.length) return 0;
        const counts = new Map();
        A.forEach(x => counts.set(x, (counts.get(x) || 0) + 1));
        let inter = 0;
        B.forEach(x => {
            const c = counts.get(x);
            if (c) { inter++; counts.set(x, c - 1); }
        });
        return (2 * inter) / (A.length + B.length);
    }

    // ── Override helpers ───────────────────────────────────────────

    function loadOverrides() {
        try {
            const raw = GM_getValue(KEY_OVERRIDES, null);
            if (raw) {
                const o = JSON.parse(raw);
                overrides = {
                    excluded: Array.isArray(o.excluded) ? o.excluded : [],
                    splits:   Array.isArray(o.splits)   ? o.splits   : [],
                    merges:   Array.isArray(o.merges)   ? o.merges   : [],
                    dismissed:Array.isArray(o.dismissed)? o.dismissed: [],
                    resolved: Array.isArray(o.resolved) ? o.resolved : [],
                    raw:      (o.raw && typeof o.raw === 'object') ? o.raw : {}
                };
            }
        } catch (e) {
            overrides = { excluded: [], splits: [], merges: [], dismissed: [], resolved: [], raw: {} };
        }
    }

    function saveOverrides() {
        GM_setValue(KEY_OVERRIDES, JSON.stringify(overrides));
    }

    function pairKey(a, b) { return [a, b].sort().join('::'); }

    function rememberRaw(course) {
        const root = normCourse(course);
        if (root && !overrides.raw[root]) overrides.raw[root] = course;
        return root;
    }

    function isExcluded(root) { return overrides.excluded.includes(root); }
    function isSplit(a, b)    { return overrides.splits.some(p => pairKey(p[0], p[1]) === pairKey(a, b)); }

    // Merges form equivalence classes; resolve a root to its merge-group leader.
    function mergeLeader(root) {
        const seen = new Set([root]);
        let changed = true, cur = root;
        while (changed) {
            changed = false;
            for (const [a, b] of overrides.merges) {
                if (a === cur && !seen.has(b)) { cur = [cur, b].sort()[0]; seen.add(b); changed = true; }
                else if (b === cur && !seen.has(a)) { cur = [cur, a].sort()[0]; seen.add(a); changed = true; }
            }
        }
        // pick the alphabetically-smallest member of the connected component as stable leader
        return [...seen].sort()[0];
    }

    function addExclude(course)      { const r = rememberRaw(course); if (!isExcluded(r)) { overrides.excluded.push(r); saveOverrides(); } }
    function removeExclude(root)     { overrides.excluded = overrides.excluded.filter(x => x !== root); saveOverrides(); }
    function addSplit(cA, cB)        { const a = rememberRaw(cA), b = rememberRaw(cB); if (a !== b && !isSplit(a, b)) { overrides.splits.push([a, b]); saveOverrides(); } }
    function removeSplit(a, b)       { overrides.splits = overrides.splits.filter(p => pairKey(p[0], p[1]) !== pairKey(a, b)); saveOverrides(); }
    function addMerge(cA, cB)        { const a = rememberRaw(cA), b = rememberRaw(cB); if (a !== b && !overrides.merges.some(p => pairKey(p[0],p[1])===pairKey(a,b))) { overrides.merges.push([a, b]); saveOverrides(); } }
    function removeMerge(a, b)       { overrides.merges = overrides.merges.filter(p => pairKey(p[0], p[1]) !== pairKey(a, b)); saveOverrides(); }

    // A dismissed group is identified by company invoice + student name + course root,
    // so the same student's same-course dup stays dismissed across re-scans.
    function groupKey(invoiceUrl, name, root) {
        return [invoiceUrl || '', (name || '').toLowerCase(), root || ''].join('||');
    }
    function isDismissed(key)  { return overrides.dismissed.includes(key); }
    function addDismiss(key)   { if (!isDismissed(key)) { overrides.dismissed.push(key); saveOverrides(); } }
    function removeDismiss(key){ overrides.dismissed = overrides.dismissed.filter(k => k !== key); saveOverrides(); }

    // A resolved group uses the same key shape as dismissed (invoice||name||root),
    // so a student's resolved duplicate stays resolved across re-scrapes.
    function isResolved(key)   { return overrides.resolved.includes(key); }
    function addResolved(key)  { if (!isResolved(key)) { overrides.resolved.push(key); saveOverrides(); } }
    function removeResolved(key){ overrides.resolved = overrides.resolved.filter(k => k !== key); saveOverrides(); }

    function buildCourseClusterer() {
        const reps = [];           // [{ root, id }]
        const cache = new Map();
        return function clusterOf(course) {
            if (cache.has(course)) return cache.get(course);
            // The cluster identity is the normalized root, collapsed through any merges.
            const root = mergeLeader(normCourse(course));
            for (const r of reps) {
                // Same merge-leader = definitely same cluster.
                if (r.root === root) { cache.set(course, r.id); return r.id; }
                // Otherwise fall back to fuzzy similarity, UNLESS the user split them apart.
                if (!isSplit(root, r.root) &&
                    diceSimilarity(root, r.root) >= FUZZY_THRESHOLD) {
                    cache.set(course, r.id);
                    return r.id;
                }
            }
            const id = reps.length;
            reps.push({ root, id });
            cache.set(course, id);
            return id;
        };
    }

    function parseEnrollDate(str) {
        const m = String(str || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!m) return { ts: 0, monthKey: null };
        let mo = Number(m[1]), d = Number(m[2]), y = Number(m[3]);
        if (y < 100) y += 2000;
        return { ts: new Date(y, mo - 1, d).getTime(), monthKey: y * 12 + (mo - 1) };
    }

    function monthInputToKey(val) {
        const m = String(val || '').match(/^(\d{4})-(\d{2})$/);
        if (!m) return null;
        return Number(m[1]) * 12 + (Number(m[2]) - 1);
    }

    function computeCompanyDups(company, hidePayment, monthKey, hideResolved, statusFilter) {
        let enr = company.enrollments || [];
        if (hidePayment) enr = enr.filter(e => (e.status || '') !== 'Payment');
        // Drop enrollments whose course family is excluded entirely.
        enr = enr.filter(e => !isExcluded(mergeLeader(normCourse(e.course))));

        const clusterOf = buildCourseClusterer();
        const map = {};
        enr.forEach(e => {
            const d   = parseEnrollDate(e.date);
            const cid = clusterOf(e.course);
            const key = cid + '||' + e.name.toLowerCase();
            if (!map[key]) map[key] = { name: e.name, root: mergeLeader(normCourse(e.course)), enrollments: [] };
            map[key].enrollments.push({ ...e, ts: d.ts, monthKey: d.monthKey });
        });

        let groups = Object.values(map).filter(g => g.enrollments.length >= 2);

        if (monthKey != null) {
            groups = groups.filter(g =>
                g.enrollments.some(e => e.monthKey === monthKey) &&
                g.enrollments.some(e => e.monthKey != null && e.monthKey < monthKey)
            );
        }

        groups.forEach(g => {
            g.enrollments.sort((a, b) => a.ts - b.ts);
            g.count = g.enrollments.length;
            g.courseLabel = g.enrollments[0].course;
            g.gkey = groupKey(company.invoiceUrl, g.name, g.root);
        });
        // Drop groups the user has manually dismissed ("unmatched").
        groups = groups.filter(g => !isDismissed(g.gkey));
        // Flag resolved groups; hide them when the toggle is on (default).
        groups.forEach(g => { g.resolved = isResolved(g.gkey); });
        if (hideResolved) groups = groups.filter(g => !g.resolved);
        // Status filter: keep only groups containing an enrollment with that live status.
        if (statusFilter) {
            // A row's effective status is Payment (from the invoice, never cert-checked)
            // or its cert-derived liveBucket (Active/Completed).
            const effBucket = (e) => (e.invoiceBucket === 'payment') ? 'payment' : (e.liveBucket || '');
            groups = groups.filter(g => g.enrollments.some(e => effBucket(e) === statusFilter));
        }
        groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
        return groups;
    }

    // Collect every distinct (root → example raw name) seen across all results,
    // for populating the Overrides panel dropdowns.
    function collectCourseRoots() {
        const map = {};
        allResults.forEach(c => (c.enrollments || []).forEach(e => {
            const root = normCourse(e.course);
            if (root && !map[root]) map[root] = e.course;
        }));
        // include any roots we have remembered raw names for (e.g. from prior overrides)
        Object.entries(overrides.raw).forEach(([root, raw]) => { if (!map[root]) map[root] = raw; });
        return map;
    }

    // ══════════════════════════════════════════════════════════════
    //  MAIN PAGE
    // ══════════════════════════════════════════════════════════════

    function initMainPage() {
        loadOverrides();
        buildModal();
        buildTriggerButton();

        // Defensive: if a legacy scan flag is stuck (e.g. an old run died mid-scan),
        // clear it so opening invoices doesn't keep re-triggering the scanner.
        if (GM_getValue(KEY_RUNNING, false) && !legacyScanActive()) {
            clearLegacyScanState();
        }

        let parsed = [];
        try {
            const saved = GM_getValue(KEY_RESULTS, null);
            if (saved) parsed = JSON.parse(saved);
        } catch (e) {
            // Corrupted/truncated results blob — discard rather than crash init
            GM_deleteValue(KEY_RESULTS);
            parsed = [];
        }

        if (parsed.length > 0 && !legacyScanActive()) {
            allResults = parsed;
            document.getElementById('dup-overlay').style.display = 'flex';
            document.getElementById('dup-clear-btn').style.display = 'inline-block';
            applyFilters();
            setStatus(`Loaded scan of ${parsed.length} invoices. Click Start Scan to re-scan.`, '#15803d');
            // Saved results carry invoice status; fetch the true account status for
            // duplicates if it isn't already present (quietly — it's a background top-up).
            const hasAccountStatus = parsed.some(c => (c.enrollments || []).some(e => e.liveStatus));
            if (!hasAccountStatus) runStatusFetch(true);
        }
    }

    function buildTriggerButton() {
        const btn = document.createElement('button');
        btn.id = 'dup-trigger-btn';
        btn.type = 'button';
        btn.title = 'Open Invoice Duplicate Checker';
        btn.textContent = '\u{1F50D}';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('dup-overlay').style.display = 'flex';
        });

        // The page's refresh button is rendered by Angular and may not exist yet,
        // and Angular can re-render the toolbar (dropping our button). So we keep
        // trying to anchor it to the right of the refresh button, and fall back to
        // a fixed bottom-right launcher if the toolbar can't be found in time.
        const REFRESH_SEL = 'button.btn-brown[ng-click*="RunReport"]';
        const start = Date.now();

        const placeInline = (refreshBtn) => {
            // Keep our own (purple) styling via the dup-inline class, but match the
            // page button's box metrics by copying its computed padding/font/height.
            btn.className = '';
            btn.id = 'dup-trigger-btn';
            btn.classList.add('dup-inline');
            try {
                const cs = getComputedStyle(refreshBtn);
                const imp = (prop, val) => btn.style.setProperty(prop, val, 'important');
                // Fixed dimensions to match the page's refresh button (38x34),
                // with the emoji glyph sized to ~12x14.
                imp('width',         '38px');
                imp('height',        '34px');
                imp('padding',       '0');
                imp('font-size',     '14px');
                imp('line-height',   '1');
                imp('border-radius', cs.borderRadius);
                imp('border-width',  cs.borderWidth);
                imp('border-style',  'solid');
                imp('border-color',  'transparent');
            } catch (e) { /* computed style unavailable — dup-inline defaults apply */ }
            // Insert directly after the refresh button.
            if (refreshBtn.nextSibling) {
                refreshBtn.parentNode.insertBefore(btn, refreshBtn.nextSibling);
            } else {
                refreshBtn.parentNode.appendChild(btn);
            }
        };
        const placeFixed = () => {
            btn.className = '';
            btn.id = 'dup-trigger-btn';
            btn.removeAttribute('style'); // drop copied inline metrics; fixed CSS applies
            (document.body || document.documentElement).appendChild(btn);
        };

        const ensurePlacement = () => {
            const refreshBtn = document.querySelector(REFRESH_SEL);
            if (refreshBtn) {
                // (Re)anchor only if our button isn't already the refresh button's
                // immediate next sibling (handles Angular re-renders).
                if (refreshBtn.nextElementSibling !== btn) placeInline(refreshBtn);
                return true;
            }
            return false;
        };

        if (!ensurePlacement()) {
            placeFixed(); // visible immediately; will move inline once toolbar appears
            const poll = setInterval(() => {
                if (ensurePlacement() || Date.now() - start > 8000) clearInterval(poll);
            }, 300);
        }

        // Keep it anchored if Angular re-renders the toolbar later.
        try {
            const mo = new MutationObserver(() => {
                if (!document.getElementById('dup-trigger-btn')) {
                    // Our button was removed by a re-render — re-add it.
                    if (!ensurePlacement()) placeFixed();
                } else {
                    ensurePlacement();
                }
            });
            mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
        } catch (e) { /* MutationObserver unavailable — inline poll above still covers it */ }
    }

    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = 'dup-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div id="dup-modal" style="position:relative;">
                <button id="dup-help-btn" title="Guided tour">?</button>
                <button id="dup-gear-btn" title="Match overrides">&#9881;</button>
                <button id="dup-close-btn" title="Close">&#x2715;</button>
                <div id="dup-header">
                    <h1>Invoice Duplicate Enrollment Checker</h1>
                    <div id="dup-controls">
                        <input id="dup-search" type="text" placeholder="Search student, company, or course&hellip;" />
                        <select id="dup-filter">
                            <option value="all">All companies</option>
                            <option value="dups" selected>Duplicates only</option>
                            <option value="clean">Clean only</option>
                        </select>
                        <input id="dup-month" type="month" title="Target month — flag students billed this month with an earlier matching enrollment" />
                        <select id="dup-status-filter" title="Show only duplicates with this status">
                            <option value="">Any status</option>
                            <option value="active">Active (no certificate)</option>
                            <option value="completed">Completed (certificate)</option>
                            <option value="payment">Payment</option>
                        </select>
                        <label id="dup-payment-wrap" title="Exclude Payment-status enrollments from display and duplicate detection">
                            <input type="checkbox" id="dup-hide-payment" /> Hide Payment
                        </label>
                        <label id="dup-resolved-wrap" title="Hide duplicates you've marked Resolved. Uncheck to review them.">
                            <input type="checkbox" id="dup-hide-resolved" /> Hide resolved
                        </label>
                        <button id="dup-start-btn" class="dup-btn">&#9654; Start Scan</button>
                        <button id="dup-refresh-resolved-btn" class="dup-btn" title="Re-scrape only the invoices with resolved duplicates (e.g. after deleting a course in a student's account) and update the report">&#x21bb; Refresh resolved</button>
                        <button id="dup-clear-btn" class="dup-btn" style="display:none;">&#x21ba; Clear</button>
                    </div>
                    <div id="dup-status-msg">Ready. Click Start Scan to begin.</div>
                    <div id="dup-progress">
                        <div id="dup-progress-track"><div id="dup-progress-bar"></div></div>
                        <div id="dup-progress-text"></div>
                    </div>
                </div>
                <div id="dup-stats-row" style="display:none;">
                    <div class="dup-stat"><div class="dup-stat-num" id="stat-companies">0</div><div class="dup-stat-lbl">Companies</div></div>
                    <div class="dup-stat warn"><div class="dup-stat-num" id="stat-dups">0</div><div class="dup-stat-lbl">With duplicates</div></div>
                    <div class="dup-stat"><div class="dup-stat-num" id="stat-students">0</div><div class="dup-stat-lbl">Dup students</div></div>
                    <div class="dup-stat"><div class="dup-stat-num" id="stat-occurrences">0</div><div class="dup-stat-lbl">Total occurrences</div></div>
                </div>
                <div id="dup-body">
                    <div id="dup-empty" style="display:none;">No results match your filters.</div>
                </div>

                <!-- Overrides panel (slides over the body) -->
                <div id="dup-ovr-panel" style="display:none;">
                    <div id="dup-ovr-head">
                        <span>Match Overrides</span>
                        <button id="dup-ovr-close" title="Back to results">&#x2715;</button>
                    </div>
                    <div id="dup-ovr-body">
                        <div class="dup-ovr-sect">
                            <div class="dup-ovr-title">Force two courses to match</div>
                            <div class="dup-ovr-hint">Use this when the same course is written two ways and isn't grouping.</div>
                            <div class="dup-ovr-merge-row">
                                <select id="dup-ovr-merge-a"></select>
                                <span class="dup-ovr-eq">=</span>
                                <select id="dup-ovr-merge-b"></select>
                                <button id="dup-ovr-merge-add" class="dup-ovr-btn">Add</button>
                            </div>
                            <div id="dup-ovr-merge-list" class="dup-ovr-list"></div>
                        </div>
                        <div class="dup-ovr-sect">
                            <div class="dup-ovr-title">Keep two courses separate</div>
                            <div class="dup-ovr-hint">Pairs you've split apart so they never group as a duplicate.</div>
                            <div id="dup-ovr-split-list" class="dup-ovr-list"></div>
                        </div>
                        <div class="dup-ovr-sect">
                            <div class="dup-ovr-title">Excluded courses</div>
                            <div class="dup-ovr-hint">Course families that never count toward duplicates.</div>
                            <div id="dup-ovr-excl-list" class="dup-ovr-list"></div>
                        </div>
                        <div class="dup-ovr-sect">
                            <div class="dup-ovr-title">Unmatched duplicates</div>
                            <div class="dup-ovr-hint">Specific student duplicates you've dismissed. Remove to bring one back.</div>
                            <div id="dup-ovr-dismiss-list" class="dup-ovr-list"></div>
                        </div>
                        <div class="dup-ovr-sect">
                            <div class="dup-ovr-title">Resolved duplicates</div>
                            <div class="dup-ovr-hint">Student duplicates you've marked Resolved. These persist across re-scrapes. Remove to un-resolve.</div>
                            <div id="dup-ovr-resolved-list" class="dup-ovr-list"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('dup-close-btn').addEventListener('click', () => overlay.style.display = 'none');
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
        document.getElementById('dup-start-btn').addEventListener('click', onStartStopClick);
        document.getElementById('dup-clear-btn').addEventListener('click', clearAll);
        document.getElementById('dup-refresh-resolved-btn').addEventListener('click', refreshResolved);
        document.getElementById('dup-help-btn').addEventListener('click', startTour);
        document.getElementById('dup-gear-btn').addEventListener('click', openOverridesPanel);
        document.getElementById('dup-ovr-close').addEventListener('click', closeOverridesPanel);
        document.getElementById('dup-ovr-merge-add').addEventListener('click', () => {
            const a = document.getElementById('dup-ovr-merge-a').value;
            const b = document.getElementById('dup-ovr-merge-b').value;
            if (a && b && a !== b) { addMerge(a, b); renderOverridesPanel(); applyFilters(); }
        });
        document.getElementById('dup-search').addEventListener('input', applyFilters);
        document.getElementById('dup-filter').addEventListener('change', applyFilters);
        document.getElementById('dup-month').addEventListener('change', applyFilters);
        document.getElementById('dup-hide-payment').addEventListener('change', applyFilters);
        document.getElementById('dup-hide-resolved').addEventListener('change', applyFilters);
        document.getElementById('dup-status-filter').addEventListener('change', applyFilters);
    }

    // ── Overrides panel ────────────────────────────────────────────

    function openOverridesPanel() {
        renderOverridesPanel();
        document.getElementById('dup-ovr-panel').style.display = 'flex';
    }
    function closeOverridesPanel() {
        document.getElementById('dup-ovr-panel').style.display = 'none';
    }

    function rootLabel(root) {
        const raw = overrides.raw[root];
        return raw ? `${root}  (e.g. ${raw})` : root;
    }

    function renderOverridesPanel() {
        const roots = collectCourseRoots();
        const entries = Object.entries(roots).sort((a, b) => a[0].localeCompare(b[0]));

        // Populate the two merge dropdowns
        const optionsHtml = '<option value="">— pick a course —</option>' +
            entries.map(([root, raw]) =>
                `<option value="${escHtml(root)}">${escHtml(raw)}</option>`).join('');
        const selA = document.getElementById('dup-ovr-merge-a');
        const selB = document.getElementById('dup-ovr-merge-b');
        const keepA = selA.value, keepB = selB.value;
        selA.innerHTML = optionsHtml; selB.innerHTML = optionsHtml;
        selA.value = keepA; selB.value = keepB;

        // Merge list
        const mList = document.getElementById('dup-ovr-merge-list');
        mList.innerHTML = overrides.merges.length
            ? overrides.merges.map(([a, b]) => `
                <div class="dup-ovr-item">
                    <span>${escHtml(rootLabel(a))} <b>=</b> ${escHtml(rootLabel(b))}</span>
                    <button class="dup-ovr-rm" data-kind="merge" data-a="${escHtml(a)}" data-b="${escHtml(b)}">Remove</button>
                </div>`).join('')
            : '<div class="dup-ovr-empty">None yet.</div>';

        // Split list
        const sList = document.getElementById('dup-ovr-split-list');
        sList.innerHTML = overrides.splits.length
            ? overrides.splits.map(([a, b]) => `
                <div class="dup-ovr-item">
                    <span>${escHtml(rootLabel(a))} <b>&ne;</b> ${escHtml(rootLabel(b))}</span>
                    <button class="dup-ovr-rm" data-kind="split" data-a="${escHtml(a)}" data-b="${escHtml(b)}">Remove</button>
                </div>`).join('')
            : '<div class="dup-ovr-empty">None yet.</div>';

        // Exclude list
        const eList = document.getElementById('dup-ovr-excl-list');
        eList.innerHTML = overrides.excluded.length
            ? overrides.excluded.map(root => `
                <div class="dup-ovr-item">
                    <span>${escHtml(rootLabel(root))}</span>
                    <button class="dup-ovr-rm" data-kind="excl" data-a="${escHtml(root)}">Remove</button>
                </div>`).join('')
            : '<div class="dup-ovr-empty">None yet.</div>';

        // Dismissed (unmatched) duplicates list. Key = invoiceUrl||name||root.
        const dList = document.getElementById('dup-ovr-dismiss-list');
        dList.innerHTML = overrides.dismissed.length
            ? overrides.dismissed.map(key => {
                const [, name, root] = key.split('||');
                const label = `${name ? name.replace(/\b\w/g, c => c.toUpperCase()) : '(student)'} — ${root || '(course)'}`;
                return `
                <div class="dup-ovr-item">
                    <span>${escHtml(label)}</span>
                    <button class="dup-ovr-rm" data-kind="dismiss" data-a="${escHtml(key)}">Remove</button>
                </div>`; }).join('')
            : '<div class="dup-ovr-empty">None yet.</div>';

        // Resolved duplicates list. Same key shape as dismissed.
        const rList = document.getElementById('dup-ovr-resolved-list');
        rList.innerHTML = overrides.resolved.length
            ? overrides.resolved.map(key => {
                const [, name, root] = key.split('||');
                const label = `${name ? name.replace(/\b\w/g, c => c.toUpperCase()) : '(student)'} — ${root || '(course)'}`;
                return `
                <div class="dup-ovr-item">
                    <span>${escHtml(label)}</span>
                    <button class="dup-ovr-rm" data-kind="resolved" data-a="${escHtml(key)}">Remove</button>
                </div>`; }).join('')
            : '<div class="dup-ovr-empty">None yet.</div>';

        document.querySelectorAll('#dup-ovr-panel .dup-ovr-rm').forEach(btn => {
            btn.addEventListener('click', () => {
                const k = btn.dataset.kind, a = btn.dataset.a, b = btn.dataset.b;
                if (k === 'merge') removeMerge(a, b);
                else if (k === 'split') removeSplit(a, b);
                else if (k === 'excl') removeExclude(a);
                else if (k === 'dismiss') removeDismiss(a);
                else if (k === 'resolved') removeResolved(a);
                renderOverridesPanel();
                applyFilters();
            });
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  TURBO SCAN — parallel hidden iframes, no page navigation
    // ══════════════════════════════════════════════════════════════

    function onStartStopClick() {
        if (scan && !scan.stopped) { stopScan(); return; }
        startScan();
    }

    // Some report pages list two Generate links for the same org (e.g. a plain one
    // and a "&type=local" variant). They return the same invoice, so dedupe by
    // org_id to avoid scanning — and displaying — the same account twice.
    function dedupeLinksByOrg(urls) {
        const seen = new Set();
        const out = [];
        urls.forEach(u => {
            const org = (String(u).match(/org_id=(\d+)/i) || [])[1] || u;
            if (seen.has(org)) return;
            seen.add(org);
            out.push(u);
        });
        return out;
    }

    function startScan() {
        const collect = () => dedupeLinksByOrg(
            [...document.querySelectorAll('a.btn.btn-primary')]
                .filter(a => a.href && a.href.includes('generate.asp'))
                .map(a => a.href)
        );
        const links = collect();

        if (!links.length) {
            setStatus('Waiting for page to load…', '#6b7280');
            setTimeout(() => {
                const retry = collect();
                if (!retry.length) {
                    setStatus('No Generate links found. Is the page fully loaded?', '#dc2626');
                    return;
                }
                doTurboScan(retry);
            }, 1500);
            return;
        }

        doTurboScan(links);
    }

    // ── JSON invoice fetch (fast path) ─────────────────────────────
    // The generate.asp URL carries org_id + date range; the report's own
    // JSON endpoint returns structured InvoiceData[] with Status included,
    // so we can skip rendering the page in an iframe entirely.

    function parseInvoiceParams(url) {
        const u = String(url || '');
        const org = (u.match(/org_id=(\d+)/i) || [])[1];
        const start = (u.match(/startdate=([^&]+)/i) || [])[1];
        const end = (u.match(/enddate=([^&]+)/i) || [])[1];
        return {
            orgId: org || '',
            startDate: start ? decodeURIComponent(start) : '',
            endDate: end ? decodeURIComponent(end) : ''
        };
    }

    // Read invoice enrollment rows (incl. enrollment ID + Status) straight from the
    // iframe page's Angular scope. Confirmed shape: ic.ClassData[].Enrollments[] each
    // with ID, Status, Student_Number, signup_date, Course_Name. Also handles the
    // location-grouped layout (ic.LocationData[].Classes[].enrollments[]).
    function readInvoiceDataFromScope(win, doc) {
        try {
            const ng = win && win.angular;
            if (!ng) return null;
            const root = (doc || win.document).querySelector('.container-fluid, [ng-controller], [ng-app]');
            if (!root) return null;
            const scope = ng.element(root).scope();
            const ic = scope && (scope.ic || scope);
            if (!ic) return null;

            const rows = [];
            const pushEnr = (en, courseName) => {
                if (!en) return;
                rows.push({
                    ID: en.ID != null ? en.ID : null,
                    Status: en.Status || '',
                    Student_Number: en.Student_Number,
                    First_Name: en.First_Name, Middle_Initial: en.Middle_Initial,
                    Last_Name: en.Last_Name, Name_Suffix: en.Name_Suffix,
                    signup_date: en.signup_date,
                    Course_Name: en.Course_Name || courseName || '',
                    amount: en.amount
                });
            };

            if (Array.isArray(ic.ClassData)) {
                ic.ClassData.forEach(cl => (cl.Enrollments || []).forEach(en => pushEnr(en, cl.Course_Name)));
            }
            if (Array.isArray(ic.LocationData)) {
                ic.LocationData.forEach(loc => (loc.Classes || []).forEach(cl =>
                    (cl.enrollments || []).forEach(en => pushEnr(en, cl.className || cl.Course_Name))));
            }
            return rows.length ? rows : null;
        } catch (e) { return null; }
    }

    function invoiceDataToEnrollments(invoiceData) {
        // Each row is one enrollment. NOTE: the Status here is the *invoice* status
        // (billing state) and can be stale. The real Active-vs-Completed signal is
        // whether a completion certificate exists for this enrollment's ID, which we
        // check (for duplicates) against the certificate endpoint after scanning.
        return (invoiceData || []).map(r => {
            const sn = r.Student_Number;
            const name = [r.First_Name, r.Middle_Initial, r.Last_Name, r.Name_Suffix]
                .filter(x => x && String(x).trim()).join(' ').trim();
            const statusRaw = r.Status || '';
            return {
                course: r.Course_Name || '',
                name,
                date: shortDate(r.signup_date),
                status: (statusRaw === 'Payment' || statusRaw === 'Pending') ? statusRaw : '',
                invoiceStatus: statusRaw,             // invoice/billing status (may be stale)
                invoiceBucket: statusBucket(statusRaw),
                enrollmentId: r.ID || null,           // used for the certificate (completed) check
                // liveBucket is filled later from the certificate check and takes
                // precedence on the badge when present.
                studentUrl: sn ? `https://otsystems.net/admin/students/dashboard.asp?student_number=${sn}` : '',
                amount: r.amount
            };
        });
    }

    // Format the JSON's "6/2/2026 5:37:46 AM" to "6/2/26" to match the rest of the UI.
    function shortDate(str) {
        const m = String(str || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!m) return '';
        let y = m[3]; if (y.length === 4) y = y.slice(2);
        return `${Number(m[1])}/${Number(m[2])}/${y}`;
    }

    async function fetchInvoiceJson(url) {
        const p = parseInvoiceParams(url);
        if (!p.orgId || !p.startDate || !p.endDate) {
            console.warn('[dup] invoice JSON: missing params in URL — org:', p.orgId,
                         'start:', p.startDate, 'end:', p.endDate, '| url:', url,
                         '→ falling back to iframe scrape (no enrollment IDs).');
            return null;
        }

        const headers = { 'Content-Type': 'application/json; charset=UTF-8', 'Accept': 'application/json' };
        const token = getSecurityTokenFromCookie();
        if (token) headers['security-token'] = token;

        // Prefer the real captured body template (exact field names) if we have one.
        const orgNum = Number(p.orgId);
        const invTmpl = getInvoiceApiTemplate();
        const fromTemplate = invTmpl ? () => invTmpl.bodyTemplate
            .split(INV_ORG_PLACEHOLDER).join(String(orgNum))
            .split(INV_START_PLACEHOLDER).join(p.startDate)
            .split(INV_END_PLACEHOLDER).join(p.endDate) : null;

        // Each candidate is {label, body}. The winning builder is cached on `scan`
        // so the rest of the run skips probing.
        const builders = [];
        if (fromTemplate) builders.push({ label: 'captured', build: () => fromTemplate() });
        builders.push(
            { label: 'orgId/startDate/endDate',   build: () => JSON.stringify({ orgId: orgNum, startDate: p.startDate, endDate: p.endDate }) },
            { label: 'OrgId/StartDate/EndDate',   build: () => JSON.stringify({ OrgId: orgNum, StartDate: p.startDate, EndDate: p.endDate }) },
            { label: 'org_id/startdate/enddate',  build: () => JSON.stringify({ org_id: orgNum, startdate: p.startDate, enddate: p.endDate }) },
            { label: 'org_id/start_date/end_date',build: () => JSON.stringify({ org_id: orgNum, start_date: p.startDate, end_date: p.endDate }) },
            { label: 'orgId(str)',                build: () => JSON.stringify({ orgId: String(orgNum), startDate: p.startDate, endDate: p.endDate }) }
        );

        const list = (scan && scan.invBodyLabel)
            ? builders.filter(b => b.label === scan.invBodyLabel)
            : builders;
        // If a previously-winning label isn't available this call (e.g. captured
        // template missing), fall back to trying all builders.
        const tryList = list.length ? list : builders;

        for (let i = 0; i < tryList.length; i++) {
            const body = tryList[i].build();
            let resp, text;
            try {
                resp = await fetch(INVOICE_ENDPOINT, { method: 'POST', credentials: 'include', headers, body });
                text = await resp.text();
            } catch (e) {
                console.warn('[dup] invoice JSON: fetch threw for org', p.orgId, e && e.message);
                continue;
            }
            let data;
            try { data = JSON.parse(text); }
            catch (e) {
                if (i === tryList.length - 1)
                    console.warn('[dup] invoice JSON: non-JSON for org', p.orgId, '(HTTP', resp.status + ')', text.slice(0, 160));
                continue;
            }
            if (data && Array.isArray(data.InvoiceData)) {
                if (scan && !scan.invBodyLabel) {
                    scan.invBodyLabel = tryList[i].label;
                    console.log('[dup] invoice JSON: body shape "' + tryList[i].label + '" works:', body);
                }
                const enrollments = invoiceDataToEnrollments(data.InvoiceData);
                console.log('[dup] invoice JSON: org', p.orgId, '→', enrollments.length, 'enrollments');
                return enrollments;
            }
            if (i === tryList.length - 1)
                console.warn('[dup] invoice JSON: no InvoiceData for org', p.orgId, '| keys:', Object.keys(data || {}), '| sample:', text.slice(0, 160));
        }
        return null;
    }

    function doTurboScan(urls) {
        scan = {
            queue: [...urls], total: urls.length,
            results: [], failed: [], active: 0,
            stopped: false, frames: new Set(),
            startedAt: Date.now(),
            corpMap: buildCorpMap()
        };

        const startBtn = document.getElementById('dup-start-btn');
        startBtn.classList.add('scanning');
        startBtn.innerHTML = '&#9632; Stop';
        document.getElementById('dup-clear-btn').disabled = true;
        document.getElementById('dup-stats-row').style.display = 'none';
        document.getElementById('dup-body').innerHTML = '<div id="dup-empty" style="display:none;"></div>';
        document.getElementById('dup-progress').style.display = 'block';

        setStatus(`Scanning ${urls.length} invoices (${SCAN_CONCURRENCY} at a time)…`, '#6b7280');
        updateProgress('');

        const starters = Math.min(SCAN_CONCURRENCY, urls.length);
        for (let i = 0; i < starters; i++) pump();
    }

    function pump() {
        if (!scan || scan.stopped) return;
        const url = scan.queue.shift();
        if (!url) {
            if (scan.active === 0) finishScan();
            return;
        }
        scan.active++;
        scanOne(url, 1).then(res => {
            if (!scan) return;
            if (res) { attachCorp(res, scan.corpMap); scan.results.push(res); }
            else if (!scan.stopped) scan.failed.push(url);
            scan.active--;
            updateProgress(res ? res.companyName : '');
            if (!scan.stopped) pump();
            else if (scan.active === 0) finishScan();
        });
    }

    function scanOne(url, attempt) {
        // Fast path: fetch the invoice JSON directly (status included, no render).
        // Falls back to the iframe scrape if the endpoint fails or returns nothing.
        return fetchInvoiceJson(url).then(enrollments => {
            if (enrollments && enrollments.length) {
                const corp = scan && scan.corpMap ? scan.corpMap[parseInvoiceParams(url).orgId] : null;
                return {
                    companyName: corp ? corp.corpName : '',  // billing-contact name unavailable via JSON; corpName drives the header
                    accountsPayable: '',
                    invoiceUrl: url,
                    enrollments
                };
            }
            // JSON returned nothing usable → fall back to iframe scrape.
            return scanOneIframe(url, 1);
        }).catch(() => scanOneIframe(url, 1));
    }

    function scanOneIframe(url, attempt) {
        return new Promise(resolve => {
            const iframe = document.createElement('iframe');
            iframe.className = 'dup-scan-frame';
            scan.frames.add(iframe);

            let settled = false;
            let poll = null;
            const cleanup = () => {
                if (poll) clearInterval(poll);
                clearTimeout(killer);
                scan && scan.frames.delete(iframe);
                try { iframe.remove(); } catch (e) {}
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                cleanup();
                if (attempt < 2 && scan && !scan.stopped) resolve(scanOneIframe(url, attempt + 1));
                else resolve(null);
            };
            const succeed = (doc) => {
                if (settled) return;
                settled = true;
                // Best source: the iframe's Angular scope holds the invoice data
                // with enrollment IDs (ic.ClassData[].Enrollments[]). Tested reliable.
                // Fall back to the captured network JSON, then to DOM scraping.
                let enrollments = null;
                try {
                    const rows = readInvoiceDataFromScope(iframe.contentWindow, doc);
                    if (rows && rows.length) {
                        enrollments = invoiceDataToEnrollments(rows);
                        console.log('[dup] scan: used Angular scope for', url, '→', enrollments.length, 'enrollments (with IDs)');
                    }
                } catch (e) {}
                if (!enrollments) {
                    try {
                        const win = iframe.contentWindow;
                        if (win && Array.isArray(win.__dupInvoiceData) && win.__dupInvoiceData.length) {
                            enrollments = invoiceDataToEnrollments(win.__dupInvoiceData);
                            console.log('[dup] scan: used captured invoice JSON for', url, '→', enrollments.length, 'enrollments (with IDs)');
                        }
                    } catch (e) {}
                }
                if (!enrollments) {
                    enrollments = extractEnrollments(doc);
                    console.log('[dup] scan: used DOM scrape for', url, '→', enrollments.length, 'enrollments (no IDs)');
                }
                const result = {
                    companyName: extractCompanyName(doc),
                    accountsPayable: extractAccountsPayable(doc),
                    invoiceUrl: url,
                    enrollments
                };
                cleanup();
                resolve(result);
            };

            const killer = setTimeout(fail, SCAN_TIMEOUT_MS);

            iframe.addEventListener('load', () => {
                if (settled) return;
                let lastCount = -1;
                let stableSince = Date.now();
                let customerSeen = 0;

                poll = setInterval(() => {
                    if (settled) { clearInterval(poll); return; }
                    if (scan && scan.stopped) { fail(); return; }

                    let doc;
                    try { doc = iframe.contentDocument; } catch (e) { fail(); return; }
                    if (!doc) { fail(); return; }

                    // Accuracy guard: only parse once the enrollment-link count has been
                    // stable for STABLE_MS, so a mid-render ng-repeat is never captured.
                    const count = doc.querySelectorAll('a[href*="/admin/students/dashboard.asp"]').length;
                    if (count !== lastCount) { lastCount = count; stableSince = Date.now(); }

                    if (!customerSeen && doc.querySelector('.col-sm-8.col-xs-7, .col-xs-7')) {
                        customerSeen = Date.now();
                    }

                    const hasStableEnrollments = count > 0 && (Date.now() - stableSince >= STABLE_MS);
                    const emptyButSettled = customerSeen && count === 0 &&
                                            (Date.now() - customerSeen >= EMPTY_GRACE_MS);

                    if (hasStableEnrollments || emptyButSettled) succeed(doc);
                }, 120);
            });

            iframe.src = url;
            document.body.appendChild(iframe);
        });
    }

    function stopScan() {
        if (!scan) return;
        scan.stopped = true;
        scan.queue = [];
        setStatus('Stopping… keeping invoices scanned so far.', '#d97706');
        if (scan.active === 0) finishScan();
    }

    function updateProgress(lastCompany) {
        if (!scan) return;
        const done = scan.results.length + scan.failed.length;
        const pct  = scan.total ? Math.round((done / scan.total) * 100) : 0;
        const bar  = document.getElementById('dup-progress-bar');
        const txt  = document.getElementById('dup-progress-text');
        if (bar) bar.style.width = pct + '%';
        if (txt) txt.textContent = `${done} of ${scan.total} invoices` + (lastCompany ? ` — ${lastCompany}` : '');
    }

    function finishScan() {
        const s = scan;
        scan = null;

        // Clean up any straggler frames
        s.frames.forEach(f => { try { f.remove(); } catch (e) {} });

        const startBtn = document.getElementById('dup-start-btn');
        startBtn.classList.remove('scanning');
        startBtn.innerHTML = '&#9654; Start Scan';
        document.getElementById('dup-clear-btn').disabled = false;
        document.getElementById('dup-progress').style.display = 'none';

        const withEnr = s.results.filter(r => r.enrollments && r.enrollments.length).length;
        console.log('[dup] finishScan:', {
            total: s.total,
            collected: s.results.length,
            withEnrollments: withEnr,
            failed: s.failed.length,
            stopped: s.stopped,
            sample: s.results.slice(0, 3).map(r => ({ company: r.companyName, enr: r.enrollments?.length }))
        });

        // If literally nothing came back, the site likely blocks embedded pages —
        // fall back to the legacy page-by-page navigation scan automatically.
        if (!s.results.length && s.failed.length && !s.stopped) {
            setStatus('Fast scan was blocked — falling back to the page-by-page scan…', '#dc2626');
            setTimeout(() => doLegacyScan(s.failed), 1200);
            return;
        }

        // Frames loaded but every invoice came back empty → Angular likely didn't
        // render inside the hidden iframe. Fall back to the legacy scan.
        if (s.results.length && withEnr === 0 && !s.stopped) {
            setStatus('Invoices loaded but no enrollment data was read — switching to page-by-page scan…', '#dc2626');
            setTimeout(() => doLegacyScan(s.results.map(r => r.invoiceUrl)), 1200);
            return;
        }

        GM_setValue(KEY_RESULTS, JSON.stringify(s.results));
        allResults = s.results;
        document.getElementById('dup-clear-btn').style.display = 'inline-block';
        applyFilters();

        const secs = ((Date.now() - s.startedAt) / 1000).toFixed(1);
        let msg = s.stopped
            ? `Stopped — kept ${s.results.length} of ${s.total} invoices.`
            : `Scan complete — ${s.results.length} invoices in ${secs}s.`;
        if (s.failed.length && (s.results.length || s.stopped)) {
            msg += ` ${s.failed.length} failed to load (re-run to retry).`;
        }
        setStatus(msg, s.failed.length ? '#d97706' : '#15803d');

        // The invoice JSON only carries the *invoice* status (e.g. Active/Payment),
        // which can be stale — a since-Completed course still reads "Active" there.
        // So always fetch the true current status from each duplicate student's
        // account (the fetch is already limited to duplicates only) and let it
        // override the invoice status on the badge.
        runStatusFetch(true);
    }

    // Kick off (or re-run) the certificate-based Completed/Active check for
    // duplicate enrollments. `quiet` = auto run after a scan (suppress hard errors).
    function runStatusFetch(quiet) {
        hideStatusBanner();
        fetchAllStatuses((done, total, failed) => {
            setStatus(`Checking completion certificates… ${done}/${total}${failed ? ` (${failed} failed)` : ''}`, '#6b7280');
        }).then(res => {
            if (res && res.ok && res.total) {
                applyFilters();
                setStatus(`Completion checked — ${res.matched} duplicate enrollments marked${res.failed ? `, ${res.failed} failed` : ''}.`, '#15803d');
            } else if (res && res.ok) {
                // No duplicates to check; leave the existing message.
            } else if (res && res.reason === 'no-gm-xhr') {
                if (!quiet) {
                    showStatusBanner('Certificate checks need the GM_xmlhttpRequest permission. After updating the script, Tampermonkey will prompt to allow access to safetyunlimited.com — click Always allow.');
                    setStatus('Grant the safetyunlimited.com permission in Tampermonkey to enable Completed/Active status.', '#d97706');
                }
            } else if (res && res.reason === 'no-ids') {
                if (!quiet) {
                    showStatusBanner('Couldn\'t get completion status: this scan didn\'t capture enrollment IDs (it used the iframe fallback). Re-scan — if it persists, the invoice JSON endpoint isn\'t returning data (check the console for "[dup] invoice JSON" lines).');
                    setStatus('No enrollment IDs from this scan — re-scan to enable certificate status.', '#d97706');
                }
            }
        }).catch((err) => {
            console.warn('[dup] certificate check error:', err);
            if (!quiet) setStatus('Could not check completion certificates (the request may have been blocked).', '#dc2626');
        });
    }

    function showStatusBanner(msg) {
        let b = document.getElementById('dup-status-banner');
        if (!b) {
            b = document.createElement('div');
            b.id = 'dup-status-banner';
            const controls = document.getElementById('dup-controls');
            controls?.parentNode.insertBefore(b, controls.nextSibling);
        }
        b.textContent = msg;
        b.style.display = 'block';
    }
    function hideStatusBanner() {
        const b = document.getElementById('dup-status-banner');
        if (b) b.style.display = 'none';
    }

    // Legacy navigation scan (kept as automatic fallback)
    function doLegacyScan(urls) {
        GM_setValue(KEY_QUEUE,   JSON.stringify(urls));
        GM_setValue(KEY_RESULTS, JSON.stringify([]));
        GM_setValue(KEY_CORPMAP, JSON.stringify(buildCorpMap()));
        GM_setValue(KEY_RUNNING, true);
        GM_setValue(KEY_TOTAL,   urls.length);
        GM_setValue(KEY_RUN_TS,  Date.now());
        document.getElementById('dup-overlay').style.display = 'none';
        setTimeout(() => { window.location.href = urls[0]; }, 150);
    }

    // Re-scrape only the invoices that contain resolved duplicates. Used after you
    // delete a duplicate course in a student's account: this refreshes just those
    // invoices (not all of them), updates their company data, and drops any resolved
    // entry whose duplicate no longer exists on the freshly-scraped invoice.
    function refreshResolved() {
        if (scan) { setStatus('A scan is already running — let it finish first.', '#d97706'); return; }
        if (!overrides.resolved.length) { setStatus('Nothing marked resolved to refresh.', '#6b7280'); return; }

        // Unique invoice URLs that have at least one resolved duplicate.
        const urls = [...new Set(overrides.resolved.map(k => (k.split('||')[0] || '')).filter(Boolean))];
        if (!urls.length) { setStatus('No invoices to refresh.', '#6b7280'); return; }

        // Minimal scan context so scanOne / iframe fallback have what they need.
        scan = { stopped: false, frames: new Set(), corpMap: buildCorpMap() };

        const btn = document.getElementById('dup-refresh-resolved-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Refreshing…'; }
        setStatus(`Refreshing ${urls.length} resolved invoice${urls.length > 1 ? 's' : ''}…`, '#6b7280');

        Promise.all(urls.map(u => scanOne(u, 1).then(
            res => { if (res) attachCorp(res, scan.corpMap); return res; },
            ()  => null
        ))).then(freshList => {
            const fresh = freshList.filter(Boolean);

            // Replace each refreshed company in allResults (match by org_id).
            fresh.forEach(f => {
                const fOrg = parseOrgId(f.invoiceUrl);
                const idx = allResults.findIndex(c => parseOrgId(c.invoiceUrl) === fOrg);
                if (idx >= 0) allResults[idx] = f; else allResults.push(f);
            });

            // Drop resolved flags whose duplicate is no longer present on the
            // freshly-scraped invoice (course deleted → duplicate gone).
            const stillPresent = (key) => {
                const [invoiceUrl, name, root] = key.split('||');
                const org = parseOrgId(invoiceUrl);
                const co = fresh.find(f => parseOrgId(f.invoiceUrl) === org);
                if (!co) return true; // invoice wasn't refreshed; leave it alone
                // Count this student's enrollments in that course family.
                const n = (co.enrollments || []).filter(e =>
                    (e.name || '').toLowerCase() === name &&
                    normCourse(e.course) === root
                ).length;
                return n >= 2; // still a duplicate only if 2+ remain
            };
            const before = overrides.resolved.length;
            overrides.resolved = overrides.resolved.filter(stillPresent);
            const cleared = before - overrides.resolved.length;
            saveOverrides();

            GM_setValue(KEY_RESULTS, JSON.stringify(allResults));
            scan = null;
            if (btn) { btn.disabled = false; btn.textContent = '\u21bb Refresh resolved'; }

            applyFilters();
            runStatusFetch(true);
            setStatus(`Refreshed ${fresh.length} invoice${fresh.length > 1 ? 's' : ''}` +
                      (cleared ? ` — ${cleared} resolved duplicate${cleared > 1 ? 's' : ''} cleared (no longer on the invoice).` : ' — no duplicates were removed.'),
                      '#15803d');
        }).catch(err => {
            console.warn('[dup] refreshResolved error:', err);
            scan = null;
            if (btn) { btn.disabled = false; btn.textContent = '\u21bb Refresh resolved'; }
            setStatus('Could not refresh resolved invoices — try again.', '#dc2626');
        });
    }

    function clearAll() {
        clearLegacyScanState();
        GM_deleteValue(KEY_RESULTS);
        allResults = [];
        document.getElementById('dup-body').innerHTML = '<div id="dup-empty" style="display:none;"></div>';
        document.getElementById('dup-stats-row').style.display = 'none';
        document.getElementById('dup-clear-btn').style.display = 'none';
        setStatus('Cleared. Ready for a new scan.', '#6b7280');
    }

    function setStatus(msg, color) {
        const el = document.getElementById('dup-status-msg');
        if (el) { el.textContent = msg; el.style.color = color || '#6b7280'; }
    }

    // ══════════════════════════════════════════════════════════════
    //  DASHBOARD RENDERING
    // ══════════════════════════════════════════════════════════════

    function accountNumber(url) {
        const m = String(url || '').match(/student_number=(\d+)/i);
        return m ? m[1] : '?';
    }

    // Recompute the four stat numbers. Pass a precomputed array, or omit to
    // recompute from current filter settings (used after an inline unmatch).
    function refreshStats(computed) {
        if (!computed) {
            const monthKey    = monthInputToKey(document.getElementById('dup-month')?.value);
            const hidePayment = !!document.getElementById('dup-hide-payment')?.checked;
            const hideResolved = !!document.getElementById('dup-hide-resolved')?.checked;
            const statusFilter = document.getElementById('dup-status-filter')?.value || '';
            computed = allResults.map(c => ({ ...c, groups: computeCompanyDups(c, hidePayment, monthKey, hideResolved, statusFilter) }));
        }
        const withDups    = computed.filter(c => c.groups.length > 0).length;
        const dupStudents = computed.reduce((a, c) => a + c.groups.length, 0);
        const occurrences = computed.reduce((a, c) => a + c.groups.reduce((b, g) => b + g.count, 0), 0);
        document.getElementById('stat-companies').textContent   = computed.length;
        document.getElementById('stat-dups').textContent        = withDups;
        document.getElementById('stat-students').textContent    = dupStudents;
        document.getElementById('stat-occurrences').textContent = occurrences;
    }

    function applyFilters() {
        const body = document.getElementById('dup-body');
        if (!allResults.length) {
            // Don't go silently blank — tell the user the scan returned nothing.
            document.getElementById('dup-stats-row').style.display = 'none';
            if (body) body.innerHTML =
                '<div id="dup-empty" style="display:block;">No invoice data was collected. ' +
                'Check the browser console (F12) for [dup] logs, or try re-scanning.</div>';
            return;
        }

        const search      = (document.getElementById('dup-search')?.value || '').toLowerCase().trim();
        const filterVal   = document.getElementById('dup-filter')?.value || 'all';
        const monthKey    = monthInputToKey(document.getElementById('dup-month')?.value);
        const hidePayment = !!document.getElementById('dup-hide-payment')?.checked;
        const hideResolved = !!document.getElementById('dup-hide-resolved')?.checked;
        const statusFilter = document.getElementById('dup-status-filter')?.value || '';

        // Safety net: collapse any duplicate company blocks for the same org_id
        // (e.g. from an older scan that included a "&type=local" variant link).
        const byOrg = new Map();
        allResults.forEach(c => {
            const org = parseOrgId(c.invoiceUrl) || c.invoiceUrl || Math.random();
            if (!byOrg.has(org)) byOrg.set(org, c);
        });
        const uniqueResults = [...byOrg.values()];

        const computed = uniqueResults.map(c => ({
            ...c,
            groups: computeCompanyDups(c, hidePayment, monthKey, hideResolved, statusFilter)
        }));

        refreshStats(computed);
        document.getElementById('dup-stats-row').style.display  = 'flex';

        let filtered = computed.filter(company => {
            if (filterVal === 'dups'  && company.groups.length === 0) return false;
            if (filterVal === 'clean' && company.groups.length > 0)   return false;
            if (search) {
                const corpMatch    = (company.corpName || '').toLowerCase().includes(search);
                const nameMatch    = company.companyName.toLowerCase().includes(search);
                const apMatch      = (company.accountsPayable || '').toLowerCase().includes(search);
                const studentMatch = company.groups.some(g => g.name.toLowerCase().includes(search));
                const courseMatch  = company.groups.some(g =>
                    g.enrollments.some(e => e.course.toLowerCase().includes(search))
                );
                if (!corpMatch && !nameMatch && !apMatch && !studentMatch && !courseMatch) return false;
            }
            return true;
        });

        filtered.sort((a, b) => {
            if (b.groups.length !== a.groups.length) return b.groups.length - a.groups.length;
            return (a.corpName || a.companyName).localeCompare(b.corpName || b.companyName);
        });

        body.innerHTML = '<div id="dup-empty" style="display:none;">No results match your filters.</div>';

        if (!filtered.length) {
            document.getElementById('dup-empty').style.display = 'block';
            return;
        }

        filtered.forEach(company => {
            const hasDups = company.groups.length > 0;

            let groups = company.groups;
            if (search && !(company.corpName || '').toLowerCase().includes(search) &&
                !company.companyName.toLowerCase().includes(search) &&
                !(company.accountsPayable || '').toLowerCase().includes(search)) {
                groups = groups.filter(g =>
                    g.name.toLowerCase().includes(search) ||
                    g.enrollments.some(e => e.course.toLowerCase().includes(search))
                );
            }

            const block = document.createElement('div');
            block.className = 'dup-company-block' + (hasDups ? '' : ' collapsed');

            const enrollTxt  = hasDups
                ? `${company.groups.length} duplicate student${company.groups.length > 1 ? 's' : ''}`
                : 'No duplicates';
            const badgeClass = hasDups ? 'dup-badge-warn' : 'dup-badge-ok';
            const badgeTxt   = hasDups
                ? `&#9888; ${company.groups.length} dup${company.groups.length > 1 ? 's' : ''}`
                : '&#10003; Clean';

            block.innerHTML = `
                <div class="dup-company-header">
                    <div class="dup-company-headleft">
                        ${company.corpName
                            ? `<a class="dup-corp-name" href="${escHtml(company.corpEditUrl || '#')}" target="_blank" rel="noopener" title="Open corporate account">${escHtml(company.corpName)} &#8599;</a>`
                            : `<div class="dup-corp-name dup-corp-name-missing">${escHtml(company.companyName || 'Unknown Company')}</div>`}
                        ${company.companyName
                            ? `<div class="dup-billing">
                                   <span class="dup-billing-label">Billing contact</span>
                                   <span class="dup-billing-name">${escHtml(company.companyName)}</span>
                               </div>`
                            : ''}
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
                    ${groups.length === 0
                        ? '<p class="dup-no-dup">No duplicate enrollments found.</p>'
                        : groups.map((g, gi) => {
                            const distinctRoots = [...new Set(g.enrollments.map(e => normCourse(e.course)))];
                            const canSplit = distinctRoots.length >= 2;
                            return `
                            <div class="dup-student-row${g.resolved ? ' dup-resolved' : ''}" data-gkey="${escHtml(g.gkey)}">
                                <div class="dup-student-name">
                                    ${escHtml(g.name)}
                                    <span class="dup-course-label">
                                        &mdash; ${escHtml(g.courseLabel)} &times;${g.count}
                                    </span>
                                    ${g.resolved ? '<span class="dup-resolved-badge">&#10003; RESOLVED</span>' : ''}
                                    ${canSplit ? `<button class="dup-row-action dup-split-btn"
                                        data-roots="${escHtml(distinctRoots.join('|'))}"
                                        title="These are not the same course — keep them separate">Not a match</button>` : ''}
                                    ${g.resolved
                                        ? `<button class="dup-row-action dup-unresolve-btn"
                                            data-gkey="${escHtml(g.gkey)}"
                                            title="Remove the Resolved mark">Undo resolve</button>`
                                        : `<button class="dup-row-action dup-resolve-btn"
                                            data-gkey="${escHtml(g.gkey)}"
                                            title="Mark this duplicate as resolved — stays marked across re-scans">Resolve</button>
                                           <button class="dup-row-action dup-unmatch-btn"
                                            data-gkey="${escHtml(g.gkey)}"
                                            title="Dismiss this duplicate — hide it from the list">Unmatch</button>`}
                                </div>
                                ${g.enrollments.map(e => {
                                    // Payment enrollments show the invoice's Payment status and are
                                    // never certificate-checked. Otherwise the cert check decides
                                    // Completed vs Active; while pending it shows a "checking…" chip.
                                    const isPayment = e.invoiceBucket === 'payment';
                                    const bucket = e.liveBucket || '';
                                    let liveBadge;
                                    if (isPayment) {
                                        liveBadge = '<span class="dup-status-badge dup-st-payment" title="Payment status from invoice">PAYMENT</span>';
                                    } else if (bucket) {
                                        liveBadge = `<span class="dup-status-badge dup-st-${bucket}" title="${bucket === 'completed' ? 'Completion certificate found' : 'No completion certificate'}">${escHtml((e.liveStatus || bucket).toUpperCase())}</span>`;
                                    } else if (e.certChecking) {
                                        liveBadge = '<span class="dup-status-badge dup-st-checking" title="Checking completion certificate…">…</span>';
                                    } else if (e.invoiceBucket) {
                                        liveBadge = `<span class="dup-status-badge dup-st-${e.invoiceBucket}" title="Status from invoice">${escHtml((e.invoiceStatus || e.invoiceBucket).toUpperCase())}</span>`;
                                    } else {
                                        liveBadge = '';
                                    }
                                    const aid = e.enrollmentId
                                        ? `<span class="dup-aid" title="Enrollment ID">AID:${escHtml(String(e.enrollmentId))}</span>`
                                        : '';
                                    const sn = accountNumber(e.studentUrl);
                                    return `
                                    <div class="dup-enrollment${monthKey != null && e.monthKey === monthKey ? ' dup-in-month' : ''}">
                                        <span class="dup-enrollment-course">${escHtml(e.course)}</span>
                                        ${liveBadge}
                                        ${aid}
                                        <span class="dup-enrollment-date">${escHtml(e.date)}</span>
                                        <a class="dup-profile-link" href="${e.studentUrl}" target="_blank" title="Open student profile">S#${escHtml(sn)} &#8599;</a>
                                        <button class="dup-row-action dup-excl-btn"
                                            data-course="${escHtml(e.course)}"
                                            title="Never count this course toward duplicates">&#x2715;</button>
                                    </div>
                                `; }).join('')}
                            </div>
                        `; }).join('')
                    }
                </div>
            `;

            block.querySelector('.dup-company-header').addEventListener('click', () => {
                block.classList.toggle('collapsed');
            });

            block.querySelectorAll('.dup-excl-btn').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    addExclude(btn.dataset.course);
                    applyFilters();
                });
            });
            block.querySelectorAll('.dup-split-btn').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const roots = (btn.dataset.roots || '').split('|').filter(Boolean);
                    // Split every distinct pair so the merged group breaks apart
                    for (let i = 0; i < roots.length; i++)
                        for (let j = i + 1; j < roots.length; j++)
                            addSplit(roots[i], roots[j]);
                    applyFilters();
                });
            });
            block.querySelectorAll('.dup-resolve-btn').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    addResolved(btn.dataset.gkey);
                    applyFilters();
                });
            });
            block.querySelectorAll('.dup-unresolve-btn').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    removeResolved(btn.dataset.gkey);
                    applyFilters();
                });
            });
            block.querySelectorAll('.dup-unmatch-btn').forEach(btn => {
                btn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const gkey = btn.dataset.gkey;
                    addDismiss(gkey);
                    // Replace the row in place with an inline "Unmatched — Undo" notice,
                    // so a misclick is reversible without reopening anything.
                    const row = btn.closest('.dup-student-row');
                    if (row) {
                        const notice = document.createElement('div');
                        notice.className = 'dup-unmatched-notice';
                        notice.innerHTML = `Unmatched. <button class="dup-undo-btn">Undo</button>`;
                        notice.querySelector('.dup-undo-btn').addEventListener('click', (e2) => {
                            e2.stopPropagation();
                            removeDismiss(gkey);
                            applyFilters();
                        });
                        row.replaceWith(notice);
                    } else {
                        applyFilters();
                    }
                    // Refresh the stat counts to reflect the dismissal
                    refreshStats();
                });
            });

            body.appendChild(block);
        });
    }

    // ══════════════════════════════════════════════════════════════
    //  GUIDED TOUR (? button) — spotlight walkthrough
    // ══════════════════════════════════════════════════════════════

    function tourVisibleSteps() {
        return TOUR_STEPS.filter(s => {
            const el = document.querySelector(s.el);
            return el && el.offsetParent !== null;
        });
    }

    function startTour() {
        tourIdx = 0;
        tourActive = true;
        renderTourStep();
        document.addEventListener('keydown', tourKeyHandler);
    }

    function tourKeyHandler(e) {
        if (!tourActive) return;
        if (e.key === 'Escape') endTour();
        if (e.key === 'ArrowRight' || e.key === 'Enter') tourNext();
        if (e.key === 'ArrowLeft') tourBack();
    }

    function endTour() {
        tourActive = false;
        document.getElementById('dup-tour-spot')?.remove();
        document.getElementById('dup-tour-tip')?.remove();
        document.removeEventListener('keydown', tourKeyHandler);
    }

    function tourNext() {
        const steps = tourVisibleSteps();
        if (tourIdx >= steps.length - 1) { endTour(); return; }
        tourIdx++;
        renderTourStep();
    }

    function tourBack() {
        if (tourIdx === 0) return;
        tourIdx--;
        renderTourStep();
    }

    function renderTourStep() {
        const steps = tourVisibleSteps();
        if (!steps.length) { endTour(); return; }
        if (tourIdx >= steps.length) tourIdx = steps.length - 1;

        const step = steps[tourIdx];
        const target = document.querySelector(step.el);
        target.scrollIntoView({ block: 'nearest' });
        const r = target.getBoundingClientRect();
        const pad = 6;

        let spot = document.getElementById('dup-tour-spot');
        if (!spot) {
            spot = document.createElement('div');
            spot.id = 'dup-tour-spot';
            document.body.appendChild(spot);
        }
        spot.style.left   = (r.left - pad) + 'px';
        spot.style.top    = (r.top - pad) + 'px';
        spot.style.width  = (r.width + pad * 2) + 'px';
        spot.style.height = (r.height + pad * 2) + 'px';

        let tip = document.getElementById('dup-tour-tip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'dup-tour-tip';
            document.body.appendChild(tip);
        }
        const isLast = tourIdx === steps.length - 1;
        tip.innerHTML = `
            <div id="dup-tour-tip-head">
                <span>${escHtml(step.title)}
                    <span id="dup-tour-step-count">&nbsp;${tourIdx + 1} / ${steps.length}</span>
                </span>
                <button id="dup-tour-skip" title="End tour">&#x2715;</button>
            </div>
            <div id="dup-tour-tip-body">${escHtml(step.text)}</div>
            <div id="dup-tour-tip-foot">
                <button id="dup-tour-back" class="dup-tour-btn" ${tourIdx === 0 ? 'disabled' : ''}>&#8592; Back</button>
                <button id="dup-tour-next" class="dup-tour-btn">${isLast ? 'Done &#10003;' : 'Next &#8594;'}</button>
            </div>
        `;

        const tipW = Math.min(window.innerWidth * 0.86, 320);
        let left = r.left + r.width / 2 - tipW / 2;
        left = Math.max(10, Math.min(left, window.innerWidth - tipW - 10));
        tip.style.left = left + 'px';
        tip.style.top  = '0px';
        const tipH = tip.offsetHeight || 160;
        let top = r.bottom + pad + 12;
        if (top + tipH > window.innerHeight - 10) top = r.top - pad - tipH - 12;
        if (top < 10) top = Math.max(10, (window.innerHeight - tipH) / 2);
        tip.style.top = top + 'px';

        document.getElementById('dup-tour-skip').addEventListener('click', endTour);
        document.getElementById('dup-tour-next').addEventListener('click', tourNext);
        document.getElementById('dup-tour-back').addEventListener('click', tourBack);
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