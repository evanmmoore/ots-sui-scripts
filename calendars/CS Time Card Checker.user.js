// ==UserScript==
// @name         CS Time Card Checker
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  CS team time-off summary — background scraping with overlay, no page flash
// @author       Evan
// @match        https://otsystems.net/admin/utilities/schedule/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ─── Google Fonts ─────────────────────────────────────────────────────────────
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap';
    document.head.appendChild(fontLink);

    // ─── Styles ───────────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #cs-popup * { box-sizing: border-box; font-family: 'DM Sans', sans-serif; }

        #cs-popup {
            --bg: #0f1117;
            --surface: #1a1d27;
            --surface2: #21253a;
            --border: rgba(255,255,255,0.07);
            --accent: #4f8ef7;
            --accent2: #7c5cfc;
            --green: #34d399;
            --red: #f87171;
            --orange: #fb923c;
            --yellow: #facc15;
            --text: #e2e8f0;
            --text-muted: #64748b;
            --text-dim: #94a3b8;
            --radius: 14px;
            --shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        }

        /* ── Scraping Overlay ── */
        #cs-scrape-overlay {
            position: fixed;
            inset: 0;
            z-index: 999998;
            background: rgba(10, 11, 18, 0.92);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 20px;
            font-family: 'DM Sans', sans-serif;
        }
        #cs-scrape-overlay .overlay-card {
            background: #1a1d27;
            border: 1px solid rgba(251,146,60,0.2);
            border-radius: 16px;
            padding: 32px 40px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
            min-width: 320px;
        }
        #cs-scrape-overlay .overlay-title {
            font-size: 16px;
            font-weight: 700;
            color: #e2e8f0;
            letter-spacing: 0.3px;
        }
        #cs-scrape-overlay .overlay-sub {
            font-size: 13px;
            color: #64748b;
            text-align: center;
            line-height: 1.5;
        }
        #cs-scrape-overlay .overlay-progress-text {
            font-size: 12px;
            font-family: 'DM Mono', monospace;
            color: #fb923c;
            min-height: 18px;
        }
        #cs-scrape-overlay .overlay-bar-wrap {
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.06);
            border-radius: 99px;
            overflow: hidden;
        }
        #cs-scrape-overlay .overlay-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #fb923c, #f87171);
            border-radius: 99px;
            transition: width 0.3s ease;
            width: 0%;
        }
        .cs-overlay-ring {
            width: 40px; height: 40px;
            border: 3px solid rgba(251,146,60,0.15);
            border-top-color: #fb923c;
            border-radius: 50%;
            animation: cs-spin 0.8s linear infinite;
        }

        /* ── Top Bar ── */
        #cs-topbar {
            background: linear-gradient(135deg, #0f1117 0%, #1a1d27 100%);
            border-bottom: 1px solid var(--border);
            padding: 14px 18px 12px;
            cursor: grab;
            flex-shrink: 0;
        }
        #cs-topbar:active { cursor: grabbing; }

        #cs-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        #cs-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--text);
            letter-spacing: 0.3px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #cs-title::before {
            content: '';
            display: inline-block;
            width: 8px; height: 8px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--orange), var(--red));
            box-shadow: 0 0 8px var(--orange);
        }
        #cs-badge {
            font-size: 11px;
            font-weight: 600;
            color: var(--orange);
            background: rgba(251,146,60,0.12);
            border: 1px solid rgba(251,146,60,0.25);
            border-radius: 20px;
            padding: 2px 9px;
            font-family: 'DM Mono', monospace;
        }
        #cs-close {
            background: rgba(255,255,255,0.05);
            border: 1px solid var(--border);
            color: var(--text-muted);
            width: 28px; height: 28px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s ease;
        }
        #cs-close:hover { background: rgba(248,113,113,0.15); color: var(--red); border-color: rgba(248,113,113,0.3); }

        /* ── Filters ── */
        #cs-filters {
            display: flex;
            gap: 7px;
            align-items: center;
        }
        .cs-input {
            flex: 1;
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-size: 12px;
            padding: 7px 10px;
            outline: none;
            transition: border-color 0.15s;
            font-family: 'DM Mono', monospace;
        }
        .cs-input:focus { border-color: var(--orange); }
        .cs-input::placeholder { color: var(--text-muted); }
        .cs-input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }

        #cs-search-row { margin-top: 7px; display: flex; gap: 7px; }
        #cs-search {
            flex: 1;
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text);
            font-size: 13px;
            padding: 8px 12px 8px 34px;
            outline: none;
            transition: border-color 0.15s;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24'%3E%3Ccircle cx='11' cy='11' r='7' stroke='%2364748b' stroke-width='2'/%3E%3Cpath stroke='%2364748b' stroke-width='2' stroke-linecap='round' d='M20 20l-3-3'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: 11px center;
        }
        #cs-search:focus { border-color: var(--orange); }
        #cs-search::placeholder { color: var(--text-muted); }

        #cs-today-btn, #cs-clear-btn {
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 8px;
            color: var(--text-dim);
            font-size: 12px;
            font-weight: 600;
            padding: 0 11px;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
            font-family: 'DM Sans', sans-serif;
        }
        #cs-today-btn:hover { background: rgba(251,146,60,0.15); color: var(--orange); border-color: rgba(251,146,60,0.3); }
        #cs-clear-btn:hover { background: rgba(255,255,255,0.05); color: var(--text); }

        /* ── Type Filter Bar ── */
        #cs-type-filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 9px 16px;
            background: rgba(255,255,255,0.02);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            align-items: center;
        }
        #cs-type-filter-label {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-right: 2px;
            white-space: nowrap;
        }
        .cs-type-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 20px;
            padding: 3px 10px 3px 8px;
            cursor: pointer;
            transition: all 0.18s ease;
            user-select: none;
        }
        .cs-type-chip .chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .cs-type-chip .chip-count { font-family: 'DM Mono', monospace; font-size: 10px; opacity: 0.75; }
        .cs-type-chip.off { opacity: 0.3; filter: grayscale(0.7); }
        .cs-type-chip.off .chip-label { text-decoration: line-through; text-decoration-thickness: 1px; }

        /* ── Download Bar ── */
        #cs-download-row {
            padding: 8px 18px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        #cs-download {
            width: 100%;
            background: linear-gradient(135deg, rgba(52,211,153,0.15), rgba(79,142,247,0.1));
            border: 1px solid rgba(52,211,153,0.25);
            border-radius: 8px;
            color: var(--green);
            font-size: 13px;
            font-weight: 600;
            padding: 8px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            font-family: 'DM Sans', sans-serif;
        }
        #cs-download:hover {
            background: linear-gradient(135deg, rgba(52,211,153,0.25), rgba(79,142,247,0.18));
            border-color: rgba(52,211,153,0.45);
            box-shadow: 0 0 16px rgba(52,211,153,0.15);
        }

        /* ── Content ── */
        #cs-content {
            flex: 1;
            overflow-y: auto;
            padding: 14px 16px 24px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        #cs-content::-webkit-scrollbar { width: 5px; }
        #cs-content::-webkit-scrollbar-track { background: transparent; }
        #cs-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        #cs-content::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

        /* ── Empty State ── */
        #cs-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 0;
            color: var(--text-muted);
            font-size: 14px;
            gap: 10px;
        }
        #cs-empty svg { opacity: 0.3; }

        /* ── Employee Card ── */
        .cs-emp-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            transition: border-color 0.2s, box-shadow 0.2s;
            animation: cs-fadeIn 0.25s ease both;
        }
        .cs-emp-card:hover { border-color: rgba(251,146,60,0.3); box-shadow: 0 4px 20px rgba(251,146,60,0.08); }

        @keyframes cs-fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
        }

        .cs-emp-header {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            user-select: none;
        }

        .cs-avatar {
            width: 30px; height: 30px;
            border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700;
            flex-shrink: 0;
            letter-spacing: 0.5px;
        }
        .cs-emp-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
        .cs-emp-count {
            font-size: 10px; font-weight: 600;
            background: rgba(255,255,255,0.06);
            border: 1px solid var(--border);
            border-radius: 5px;
            padding: 1px 6px;
            color: var(--text-muted);
            font-family: 'DM Mono', monospace;
        }
        .cs-entries { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 5px; }

        .cs-entry {
            display: flex; flex-direction: column; gap: 2px;
            padding: 6px 8px;
            border-radius: 7px;
            background: rgba(255,255,255,0.025);
            border: 1px solid rgba(255,255,255,0.04);
            transition: background 0.15s;
        }
        .cs-entry:hover { background: rgba(255,255,255,0.04); }
        .cs-entry-main { display: flex; align-items: center; gap: 6px; }
        .cs-date { font-size: 11px; font-family: 'DM Mono', monospace; color: var(--text-dim); flex: 1; }
        .cs-pill { font-size: 10px; font-weight: 600; border-radius: 5px; padding: 2px 7px; white-space: nowrap; letter-spacing: 0.3px; }
        .cs-note { font-size: 11px; color: var(--orange); padding-left: 2px; font-style: italic; opacity: 0.85; }

        /* ── Launch Button ── */
        #cs-launch-btn {
            position: fixed;
            bottom: 68px; right: 24px;
            z-index: 99999;
            padding: 11px 20px;
            background: linear-gradient(135deg, #fb923c, #f87171);
            color: white;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            font-family: 'DM Sans', sans-serif;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 6px 24px rgba(251,146,60,0.4), 0 0 0 1px rgba(255,255,255,0.1);
            transition: all 0.2s;
            display: flex; align-items: center; gap: 8px;
            letter-spacing: 0.3px;
        }
        #cs-launch-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 32px rgba(251,146,60,0.5), 0 0 0 1px rgba(255,255,255,0.15);
        }
        #cs-launch-btn:active { transform: translateY(0); }
        #cs-launch-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
        #cs-launch-btn .spinner {
            width: 14px; height: 14px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: cs-spin 0.7s linear infinite;
        }

        @keyframes cs-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    // ─── Team ─────────────────────────────────────────────────────────────────────
    const employees = [
        'Tina T.', 'Chris W.', 'Evan M.', 'Pam I.',
        'Elizabeth S.', 'Katlin T.', 'Virginia M.', 'Joyce M.', 'Susan S.'
    ];

    // ─── Pill styles ──────────────────────────────────────────────────────────────
    function getPillStyle(eventType) {
        const t = (eventType || '').toLowerCase();
        if (t.includes('vacation') || t.includes('pto'))
            return 'background:rgba(79,142,247,0.15);color:#7db8ff;border:1px solid rgba(79,142,247,0.25)';
        if (t.includes('sick') || t.includes('illness'))
            return 'background:rgba(248,113,113,0.12);color:#fca5a5;border:1px solid rgba(248,113,113,0.22)';
        if (t.includes('holiday') || t.includes('observance'))
            return 'background:rgba(250,204,21,0.12);color:#fde68a;border:1px solid rgba(250,204,21,0.22)';
        if (t.includes('wfh') || t.includes('remote') || t.includes('work from'))
            return 'background:rgba(52,211,153,0.12);color:#6ee7b7;border:1px solid rgba(52,211,153,0.22)';
        if (t.includes('training') || t.includes('conference'))
            return 'background:rgba(124,92,252,0.15);color:#c4b5fd;border:1px solid rgba(124,92,252,0.25)';
        return 'background:rgba(255,255,255,0.06);color:#94a3b8;border:1px solid rgba(255,255,255,0.08)';
    }

    // ─── Avatars ─────────────────────────────────────────────────────────────────
    const AVATAR_COLORS = [
        ['rgba(251,146,60,0.2)', '#fdba74'],
        ['rgba(248,113,113,0.2)', '#fca5a5'],
        ['rgba(79,142,247,0.2)',  '#7db8ff'],
        ['rgba(124,92,252,0.2)', '#c4b5fd'],
        ['rgba(52,211,153,0.2)', '#6ee7b7'],
        ['rgba(250,204,21,0.2)', '#fde68a'],
    ];

    function getAvatarStyle(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
        const [bg, color] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
        return { bg, color };
    }

    function getInitials(name) {
        const parts = name.replace('.', '').trim().split(/\s+/);
        return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
    }

    // ─── Date helpers ─────────────────────────────────────────────────────────────
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
    }

    function parseDateFromRange(dateRange) {
        const first = dateRange.includes(' to ') ? dateRange.split(' to ')[0].trim() : dateRange.split('-')[0].trim();
        const parts = first.split('/');
        if (parts.length !== 3) return new Date(0);
        let [mm, dd, yy] = parts;
        yy = yy.length === 2 ? '20' + yy : yy;
        return new Date(`${yy}-${mm}-${dd}`);
    }

    function isInRange(dateRangeStr, startDate, endDate) {
        const raw = dateRangeStr.includes(' to ')
            ? dateRangeStr.split(' to ').map(p => new Date(p.trim()))
            : [new Date(dateRangeStr)];
        const s = raw[0], e = raw[1] || raw[0];
        return !(e < startDate || s > endDate);
    }

    // ─── Scraping Overlay ─────────────────────────────────────────────────────────
    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'cs-scrape-overlay';
        overlay.innerHTML = `
            <div class="overlay-card">
                <div class="cs-overlay-ring"></div>
                <div class="overlay-title">Loading Time Cards</div>
                <div class="overlay-sub">Reading calendar data in the background…<br>The page will be ready in a moment.</div>
                <div class="overlay-bar-wrap"><div class="overlay-bar-fill" id="cs-overlay-bar"></div></div>
                <div class="overlay-progress-text" id="cs-overlay-progress">Starting…</div>
            </div>
        `;
        document.body.appendChild(overlay);

        return {
            setProgress(text, pct) {
                const bar = document.getElementById('cs-overlay-bar');
                const prog = document.getElementById('cs-overlay-progress');
                if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
                if (prog) prog.textContent = text;
            },
            remove() {
                overlay.style.transition = 'opacity 0.3s ease';
                overlay.style.opacity = '0';
                setTimeout(() => overlay.remove(), 320);
            }
        };
    }

    // ─── Strategy 1: Extract from DOM attributes (no clicking) ───────────────────
    // Tries to read title/tooltip/aria attributes directly off the event element.
    function extractFromDOM(alertDiv, colIndex, colspan, skeletonDates) {
        // Try various attribute sources — different FullCalendar versions expose data differently
        const sources = [
            alertDiv.getAttribute('title'),
            alertDiv.getAttribute('data-title'),
            alertDiv.getAttribute('data-original-title'),
            alertDiv.getAttribute('aria-label'),
            alertDiv.closest('[title]')?.getAttribute('title'),
            alertDiv.closest('[data-original-title]')?.getAttribute('data-original-title'),
        ].filter(Boolean);

        let dateRange = null;
        let note = null;

        for (const src of sources) {
            // Look for a date pattern like MM/DD/YYYY or YYYY-MM-DD in the tooltip
            const dateMatch = src.match(/(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})/g);
            if (dateMatch && dateMatch.length >= 1) {
                if (dateMatch.length >= 2) {
                    dateRange = `${formatDate(dateMatch[0])} to ${formatDate(dateMatch[1])}`;
                } else {
                    dateRange = formatDate(dateMatch[0]);
                }
            }
            // Look for note-like text after "Note:" in the tooltip
            const noteMatch = src.match(/Note:\s*(.+)/i);
            if (noteMatch) note = noteMatch[1].trim();

            if (dateRange) break;
        }

        // Also check for AngularJS scope data attached to the element (ng-repeat data)
        const ngEl = alertDiv.closest('[ng-repeat]') || alertDiv;
        if (!dateRange && window.angular) {
            try {
                const scope = angular.element(ngEl).scope();
                if (scope) {
                    // Probe common AngularJS model property names for date/note
                    const probes = ['event', 'item', 'entry', 'shift', 'row', 'record', 'data'];
                    for (const p of probes) {
                        const obj = scope[p] || scope.$parent?.[p];
                        if (obj) {
                            const start = obj.startDate || obj.start_date || obj.StartDate || obj.start;
                            const end   = obj.endDate   || obj.end_date   || obj.EndDate   || obj.end;
                            if (start) {
                                dateRange = end && end !== start
                                    ? `${formatDate(start)} to ${formatDate(end)}`
                                    : formatDate(start);
                            }
                            note = note || obj.note || obj.Note || obj.notes || null;
                            if (dateRange) break;
                        }
                    }
                }
            } catch (_) { /* AngularJS scope probe failed silently */ }
        }

        return { dateRange, note };
    }

    // ─── Strategy 2: Modal click with overlay (hidden behind overlay) ─────────────
    function getEventDetailsFromModal(alertDiv) {
        return new Promise((resolve) => {
            alertDiv.click();
            let attempts = 0;
            const id = setInterval(() => {
                attempts++;
                const modal = document.querySelector('.modal-content');
                if (modal) {
                    const dateP = Array.from(modal.querySelectorAll('p.ng-binding'))
                        .find(p => p.textContent.includes('Date(s):'));
                    const noteP = Array.from(modal.querySelectorAll('p.ng-binding'))
                        .find(p => p.textContent.trim().startsWith('Note:'));
                    if (dateP) {
                        const match = dateP.textContent.trim().match(/Date\(s\):\s*(.+)/i);
                        const dateText = match ? match[1].trim() : null;
                        const noteText = noteP ? noteP.textContent.replace('Note:', '').trim() : null;
                        // Close modal programmatically
                        const closeBtn = modal.querySelector('button[ng-click="mecc.Close()"]')
                            || modal.querySelector('.modal-header .close')
                            || modal.querySelector('[data-dismiss="modal"]');
                        closeBtn?.click();
                        clearInterval(id);
                        resolve({ dateRange: dateText, note: noteText });
                        return;
                    }
                }
                if (attempts >= 50) { clearInterval(id); resolve({ dateRange: null, note: null }); }
            }, 100);
        });
    }

    function normalizeModalDate(dateRange) {
        if (!dateRange) return null;
        if (dateRange.includes('-')) {
            const p = dateRange.split('-').map(x => x.trim());
            if (p.length === 2) return `${formatDate(p[0])} to ${formatDate(p[1])}`;
        }
        if (dateRange.includes('to')) {
            const p = dateRange.split('to').map(x => x.trim());
            if (p.length === 2) return `${formatDate(p[0])} to ${formatDate(p[1])}`;
        }
        return formatDate(dateRange);
    }

    // ─── Main scraper ─────────────────────────────────────────────────────────────
    async function parseSchedule(overlay) {
        const dateCells = document.querySelectorAll('.fc-content-skeleton thead td[data-date]');
        const skeletonDates = Array.from(dateCells).map(td => td.getAttribute('data-date'));
        const rows = document.querySelectorAll('.fc-content-skeleton tbody tr');

        const scheduleByEmployee = {};
        employees.forEach(emp => scheduleByEmployee[emp] = []);

        // Collect all events into a flat list first
        const eventQueue = [];
        for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td.fc-event-container'));
            let colIndex = 0;
            for (const cell of cells) {
                const colspan = parseInt(cell.getAttribute('colspan')) || 1;
                const alertDiv = cell.querySelector('div.alert');
                if (alertDiv) {
                    const txt = alertDiv.textContent.trim();
                    const parts = txt.split(':');
                    if (parts.length >= 2) {
                        const eventType = parts[0].trim();
                        const empPart = parts[1].trim();
                        const foundEmp = employees.find(e => empPart.includes(e));
                        if (foundEmp) {
                            eventQueue.push({ alertDiv, eventType, foundEmp, colIndex, colspan });
                        }
                    }
                }
                colIndex += colspan;
            }
        }

        const total = eventQueue.length;
        let processed = 0;
        let modalFallbackCount = 0;

        overlay.setProgress(`Found ${total} event${total !== 1 ? 's' : ''} to scan…`, 5);
        await sleep(100);

        for (const item of eventQueue) {
            const { alertDiv, eventType, foundEmp, colIndex, colspan } = item;
            processed++;
            const pct = 5 + Math.round((processed / total) * 90);
            overlay.setProgress(
                `Scanning ${processed} of ${total}${modalFallbackCount > 0 ? ` (${modalFallbackCount} via modal)` : ''}…`,
                pct
            );

            let dateRange = null;
            let note = null;

            // ── Try DOM-first extraction (zero flashing) ──
            const domResult = extractFromDOM(alertDiv, colIndex, colspan, skeletonDates);
            if (domResult.dateRange) {
                dateRange = domResult.dateRange;
                note = domResult.note;
            }

            // ── Fall back to modal click (hidden behind overlay) ──
            if (!dateRange) {
                modalFallbackCount++;
                try {
                    const modalResult = await getEventDetailsFromModal(alertDiv);
                    if (modalResult.dateRange) {
                        dateRange = normalizeModalDate(modalResult.dateRange);
                        note = modalResult.note;
                    }
                } catch (_) { /* ignore */ }
            }

            // ── Final fallback: derive dates from calendar column position ──
            if (!dateRange) {
                const s = skeletonDates[colIndex];
                const e = skeletonDates[colIndex + colspan - 1] || s;
                dateRange = s === e ? formatDate(s) : `${formatDate(s)} to ${formatDate(e)}`;
            }

            // Deduplicate
            const dup = scheduleByEmployee[foundEmp].find(x =>
                x.dateRange === dateRange && x.eventType === eventType && x.note === note);
            if (!dup) scheduleByEmployee[foundEmp].push({ dateRange, eventType, note });

            // Yield to browser between events so overlay stays responsive
            await sleep(0);
        }

        // Sort each employee's entries by date
        for (const emp in scheduleByEmployee) {
            scheduleByEmployee[emp].sort((a, b) =>
                parseDateFromRange(a.dateRange) - parseDateFromRange(b.dateRange));
        }

        overlay.setProgress('Done!', 100);
        await sleep(350);

        return scheduleByEmployee;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Build popup ──────────────────────────────────────────────────────────────
    function createPopup() {
        document.getElementById('cs-popup')?.remove();

        const popup = document.createElement('div');
        popup.id = 'cs-popup';
        Object.assign(popup.style, {
            position: 'fixed', top: '20px', left: '70px',
            width: '600px',
            height: 'calc(100vh - 40px)',
            borderRadius: '16px',
            boxShadow: 'var(--shadow)',
            zIndex: 99999,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.07)',
            background: 'var(--bg)',
        });

        // ── Top bar ──
        const topBar = document.createElement('div');
        topBar.id = 'cs-topbar';

        const titleRow = document.createElement('div');
        titleRow.id = 'cs-title-row';

        const titleLeft = document.createElement('div');
        titleLeft.style.cssText = 'display:flex;align-items:center;gap:10px;';

        const title = document.createElement('span');
        title.id = 'cs-title';
        title.textContent = 'CS Summary';

        const badge = document.createElement('span');
        badge.id = 'cs-badge';
        badge.textContent = '0 employees';

        titleLeft.appendChild(title);
        titleLeft.appendChild(badge);

        const closeBtn = document.createElement('button');
        closeBtn.id = 'cs-close';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => popup.remove());

        titleRow.appendChild(titleLeft);
        titleRow.appendChild(closeBtn);
        topBar.appendChild(titleRow);

        // Date filters
        const filterRow = document.createElement('div');
        filterRow.id = 'cs-filters';

        const startInput = document.createElement('input');
        startInput.type = 'date'; startInput.className = 'cs-input';
        startInput.title = 'Start date';

        const endInput = document.createElement('input');
        endInput.type = 'date'; endInput.className = 'cs-input';
        endInput.title = 'End date';

        const todayBtn = document.createElement('button');
        todayBtn.id = 'cs-today-btn'; todayBtn.textContent = 'Today';

        const clearBtn = document.createElement('button');
        clearBtn.id = 'cs-clear-btn'; clearBtn.textContent = 'Clear';

        filterRow.appendChild(startInput);
        filterRow.appendChild(endInput);
        filterRow.appendChild(todayBtn);
        filterRow.appendChild(clearBtn);
        topBar.appendChild(filterRow);

        // Search
        const searchRow = document.createElement('div');
        searchRow.id = 'cs-search-row';

        const searchBox = document.createElement('input');
        searchBox.type = 'text'; searchBox.id = 'cs-search';
        searchBox.placeholder = 'Search employee or event type…';
        searchRow.appendChild(searchBox);
        topBar.appendChild(searchRow);
        popup.appendChild(topBar);

        // ── Type filter bar ──
        const typeFilterBar = document.createElement('div');
        typeFilterBar.id = 'cs-type-filter-bar';
        const typeFilterLabel = document.createElement('span');
        typeFilterLabel.id = 'cs-type-filter-label';
        typeFilterLabel.textContent = 'Show:';
        typeFilterBar.appendChild(typeFilterLabel);
        popup.appendChild(typeFilterBar);

        const activeTypes = new Set();

        // ── Download ──
        const dlRow = document.createElement('div');
        dlRow.id = 'cs-download-row';
        const dlBtn = document.createElement('button');
        dlBtn.id = 'cs-download';
        dlBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV`;
        dlRow.appendChild(dlBtn);
        popup.appendChild(dlRow);

        // ── Content ──
        const content = document.createElement('div');
        content.id = 'cs-content';
        popup.appendChild(content);

        // ─── Helpers ─────────────────────────────────────────────────────────────

        function buildTypeChips(scheduleByEmployee) {
            const typeCounts = {};
            for (const emp of employees) {
                (scheduleByEmployee[emp] || []).forEach(e => {
                    const key = e.eventType || 'Other';
                    typeCounts[key] = (typeCounts[key] || 0) + 1;
                });
            }

            activeTypes.clear();
            Object.keys(typeCounts).forEach(t => activeTypes.add(t));

            typeFilterBar.querySelectorAll('.cs-type-chip').forEach(c => c.remove());

            Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
                const pillStyle = getPillStyle(type);
                const colorMatch = pillStyle.match(/color:([^;]+)/);
                const bgMatch = pillStyle.match(/background:([^;]+)/);
                const chipColor = colorMatch ? colorMatch[1].trim() : '#94a3b8';
                const chipBg = bgMatch ? bgMatch[1].trim() : 'rgba(255,255,255,0.06)';

                const chip = document.createElement('div');
                chip.className = 'cs-type-chip';
                chip.dataset.type = type;
                chip.style.cssText = `background:${chipBg};color:${chipColor};border:1px solid ${chipColor}33;`;
                chip.innerHTML = `
                    <span class="chip-dot" style="background:${chipColor}"></span>
                    <span class="chip-label">${type}</span>
                    <span class="chip-count">${count}</span>
                `;

                chip.addEventListener('click', () => {
                    if (activeTypes.has(type)) {
                        activeTypes.delete(type);
                        chip.classList.add('off');
                    } else {
                        activeTypes.add(type);
                        chip.classList.remove('off');
                    }
                    generateBlocks(popup._schedule);
                });

                typeFilterBar.appendChild(chip);
            });
        }

        function updateBadge(scheduleByEmployee) {
            const fs = startInput.value ? new Date(startInput.value) : null;
            const fe = endInput.value ? new Date(endInput.value) : null;
            const count = employees.filter(emp =>
                (scheduleByEmployee[emp] || []).some(e => {
                    if (fs && fe && !isInRange(e.dateRange, fs, fe)) return false;
                    return activeTypes.has(e.eventType || 'Other');
                })
            ).length;
            badge.textContent = `${count} employee${count !== 1 ? 's' : ''}`;
        }

        function generateBlocks(scheduleByEmployee) {
            content.innerHTML = '';
            let visibleCount = 0;
            const fs = startInput.value ? new Date(startInput.value) : null;
            const fe = endInput.value ? new Date(endInput.value) : null;
            const q = searchBox.value.toLowerCase();

            for (const emp of employees) {
                let filtered = (scheduleByEmployee[emp] || [])
                    .filter(e => !(fs && fe && !isInRange(e.dateRange, fs, fe)))
                    .filter(e => activeTypes.has(e.eventType || 'Other'));

                if (filtered.length === 0) continue;

                if (q) {
                    const empMatch = emp.toLowerCase().includes(q);
                    const entryMatch = filtered.some(e =>
                        (e.eventType || '').toLowerCase().includes(q) ||
                        (e.note || '').toLowerCase().includes(q) ||
                        e.dateRange.toLowerCase().includes(q));
                    if (!empMatch && !entryMatch) continue;
                }

                visibleCount++;
                const { bg, color } = getAvatarStyle(emp);

                const card = document.createElement('div');
                card.className = 'cs-emp-card';
                card.style.animationDelay = `${visibleCount * 25}ms`;

                const header = document.createElement('div');
                header.className = 'cs-emp-header';

                const avatar = document.createElement('div');
                avatar.className = 'cs-avatar';
                avatar.textContent = getInitials(emp);
                avatar.style.cssText = `background:${bg};color:${color};`;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'cs-emp-name';
                nameSpan.textContent = emp;

                const countBadge = document.createElement('span');
                countBadge.className = 'cs-emp-count';
                countBadge.textContent = filtered.length;

                header.appendChild(avatar);
                header.appendChild(nameSpan);
                header.appendChild(countBadge);
                card.appendChild(header);

                const entriesDiv = document.createElement('div');
                entriesDiv.className = 'cs-entries';

                filtered.forEach(entry => {
                    const entryEl = document.createElement('div');
                    entryEl.className = 'cs-entry';

                    const mainRow = document.createElement('div');
                    mainRow.className = 'cs-entry-main';

                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'cs-date';
                    dateSpan.textContent = entry.dateRange;

                    const pill = document.createElement('span');
                    pill.className = 'cs-pill';
                    pill.style.cssText = getPillStyle(entry.eventType);
                    pill.textContent = entry.eventType || 'Event';

                    mainRow.appendChild(dateSpan);
                    mainRow.appendChild(pill);
                    entryEl.appendChild(mainRow);

                    if (entry.note) {
                        const noteEl = document.createElement('div');
                        noteEl.className = 'cs-note';
                        noteEl.textContent = `↳ ${entry.note}`;
                        entryEl.appendChild(noteEl);
                    }

                    entriesDiv.appendChild(entryEl);
                });

                card.appendChild(entriesDiv);
                content.appendChild(card);
            }

            if (visibleCount === 0) {
                content.innerHTML = `
                    <div id="cs-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        No results found
                    </div>`;
            }

            updateBadge(scheduleByEmployee);
        }

        // ── Events ──
        searchBox.addEventListener('input', () => generateBlocks(popup._schedule));
        startInput.addEventListener('change', () => generateBlocks(popup._schedule));
        endInput.addEventListener('change', () => generateBlocks(popup._schedule));

        todayBtn.addEventListener('click', () => {
            const today = new Date().toISOString().split('T')[0];
            startInput.value = today; endInput.value = today;
            generateBlocks(popup._schedule);
        });

        clearBtn.addEventListener('click', () => {
            startInput.value = ''; endInput.value = ''; searchBox.value = '';
            typeFilterBar.querySelectorAll('.cs-type-chip').forEach(c => {
                c.classList.remove('off');
                activeTypes.add(c.dataset.type);
            });
            generateBlocks(popup._schedule);
        });

        dlBtn.addEventListener('click', () => {
            let csv = 'Employee,Date Range,Event Type,Note\n';
            const fs = startInput.value ? new Date(startInput.value) : null;
            const fe = endInput.value ? new Date(endInput.value) : null;
            for (const emp of employees) {
                (popup._schedule[emp] || [])
                    .filter(e => {
                        if (fs && fe && !isInRange(e.dateRange, fs, fe)) return false;
                        return activeTypes.has(e.eventType || 'Other');
                    })
                    .forEach(e => { csv += `"${emp}","${e.dateRange}","${e.eventType}","${e.note || ''}"\n`; });
            }
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `cs_summary_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        });

        // ── Drag ──
        let dragging = false, ox = 0, oy = 0;
        topBar.addEventListener('mousedown', e => {
            if (e.target.closest('input, button')) return;
            dragging = true;
            const r = popup.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            popup.style.transition = 'none';
        });
        document.addEventListener('mousemove', e => {
            if (dragging) { popup.style.left = `${e.clientX - ox}px`; popup.style.top = `${e.clientY - oy}px`; }
        });
        document.addEventListener('mouseup', () => { dragging = false; popup.style.transition = ''; });

        return { popup, generateBlocks, buildTypeChips };
    }

    // ─── Show popup ───────────────────────────────────────────────────────────────
    function showPopup(scheduleByEmployee) {
        if (!scheduleByEmployee) return;
        const { popup, generateBlocks, buildTypeChips } = createPopup();
        popup._schedule = scheduleByEmployee;
        document.body.appendChild(popup);
        buildTypeChips(scheduleByEmployee);
        generateBlocks(scheduleByEmployee);
    }

    // ─── Launch button ────────────────────────────────────────────────────────────
    function createLaunchButton() {
        if (document.getElementById('cs-launch-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'cs-launch-btn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Time Card ✅`;

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = `<div class="spinner"></div> Loading…`;

            const overlay = createOverlay();

            try {
                const schedule = await parseSchedule(overlay);
                overlay.remove();
                showPopup(schedule);
            } catch (err) {
                console.error('CS Time Card Error:', err);
                overlay.remove();
            }

            btn.disabled = false;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Time Card ✅`;
        });

        document.body.appendChild(btn);
    }

    function waitForScheduleTable(retries = 25, interval = 100) {
        if (document.querySelector('.fc-content-skeleton tbody tr')) { createLaunchButton(); }
        else if (retries > 0) { setTimeout(() => waitForScheduleTable(retries - 1, interval), interval); }
        else { console.warn('CS Time Card: schedule table not found.'); }
    }

    window.addEventListener('load', () => setTimeout(() => waitForScheduleTable(), 500));
})();