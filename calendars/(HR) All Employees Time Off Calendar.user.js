// ==UserScript==
// @name         (HR) All Employees Time Off Calendar
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  Show filtered schedule with precise date mapping per employee, draggable UI with close button, sortable, sticky top bar, CSV download, duplicates removed
// @author       Evan
// @match        https://otsystems.net/admin/utilities/schedule*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ─── Google Fonts ────────────────────────────────────────────────────────────
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap';
    document.head.appendChild(fontLink);

    // ─── Global Styles ───────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #toc-popup * { box-sizing: border-box; font-family: 'DM Sans', sans-serif; }

        #toc-popup {
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

        #toc-popup::-webkit-scrollbar { display: none; }

        /* ── Top Bar ── */
        #toc-topbar {
            background: linear-gradient(135deg, #0f1117 0%, #1a1d27 100%);
            border-bottom: 1px solid var(--border);
            padding: 14px 18px 12px;
            cursor: grab;
            flex-shrink: 0;
        }
        #toc-topbar:active { cursor: grabbing; }

        #toc-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        #toc-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--text);
            letter-spacing: 0.3px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #toc-title::before {
            content: '';
            display: inline-block;
            width: 8px; height: 8px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--accent), var(--accent2));
            box-shadow: 0 0 8px var(--accent);
        }
        #toc-badge {
            font-size: 11px;
            font-weight: 600;
            color: var(--accent);
            background: rgba(79,142,247,0.12);
            border: 1px solid rgba(79,142,247,0.25);
            border-radius: 20px;
            padding: 2px 9px;
            font-family: 'DM Mono', monospace;
        }
        #toc-close {
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
        #toc-close:hover { background: rgba(248,113,113,0.15); color: var(--red); border-color: rgba(248,113,113,0.3); }

        /* ── Filters ── */
        #toc-filters {
            display: flex;
            gap: 7px;
            align-items: center;
        }
        .toc-input {
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
        .toc-input:focus { border-color: var(--accent); }
        .toc-input::placeholder { color: var(--text-muted); }
        .toc-input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.4); cursor: pointer; }

        #toc-search-row { margin-top: 7px; display: flex; gap: 7px; }
        #toc-search {
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
        #toc-search:focus { border-color: var(--accent); }
        #toc-search::placeholder { color: var(--text-muted); }

        #toc-today-btn, #toc-clear-btn {
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
        #toc-today-btn:hover { background: rgba(79,142,247,0.15); color: var(--accent); border-color: rgba(79,142,247,0.3); }
        #toc-clear-btn:hover { background: rgba(255,255,255,0.05); color: var(--text); }

        /* ── Type Filter Bar ── */
        #toc-type-filter-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            padding: 9px 16px;
            background: rgba(255,255,255,0.02);
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
            align-items: center;
        }
        #toc-type-filter-label {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin-right: 2px;
            white-space: nowrap;
        }
        .toc-type-chip {
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
        .toc-type-chip .chip-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .toc-type-chip .chip-count {
            font-family: 'DM Mono', monospace;
            font-size: 10px;
            opacity: 0.75;
        }
        .toc-type-chip.off {
            opacity: 0.3;
            filter: grayscale(0.7);
        }
        .toc-type-chip.off .chip-label {
            text-decoration: line-through;
            text-decoration-thickness: 1px;
        }

        /* ── Download Bar ── */
        #toc-download-row {
            padding: 8px 18px;
            border-bottom: 1px solid var(--border);
            flex-shrink: 0;
        }
        #toc-download {
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
        #toc-download:hover {
            background: linear-gradient(135deg, rgba(52,211,153,0.25), rgba(79,142,247,0.18));
            border-color: rgba(52,211,153,0.45);
            box-shadow: 0 0 16px rgba(52,211,153,0.15);
        }

        /* ── Content Area ── */
        #toc-content {
            flex: 1;
            overflow-y: auto;
            padding: 14px 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            align-content: start;
        }
        #toc-content::-webkit-scrollbar { width: 5px; }
        #toc-content::-webkit-scrollbar-track { background: transparent; }
        #toc-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        #toc-content::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

        /* ── Empty State ── */
        #toc-empty {
            grid-column: 1 / -1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 0;
            color: var(--text-muted);
            font-size: 14px;
            gap: 10px;
        }
        #toc-empty svg { opacity: 0.3; }

        /* ── Employee Card ── */
        .toc-emp-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            overflow: hidden;
            transition: border-color 0.2s, box-shadow 0.2s;
            animation: toc-fadeIn 0.25s ease both;
        }
        .toc-emp-card:hover { border-color: rgba(79,142,247,0.3); box-shadow: 0 4px 20px rgba(79,142,247,0.08); }

        @keyframes toc-fadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .toc-emp-header {
            display: flex;
            align-items: center;
            gap: 9px;
            padding: 10px 12px;
            cursor: pointer;
            border-bottom: 1px solid var(--border);
            user-select: none;
        }
        .toc-emp-header:hover { background: rgba(255,255,255,0.02); }

        .toc-avatar {
            width: 30px; height: 30px;
            border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 700;
            flex-shrink: 0;
            letter-spacing: 0.5px;
        }

        .toc-emp-name {
            font-size: 13px;
            font-weight: 600;
            color: var(--text);
            flex: 1;
        }
        .toc-emp-count {
            font-size: 10px;
            font-weight: 600;
            background: rgba(255,255,255,0.06);
            border: 1px solid var(--border);
            border-radius: 5px;
            padding: 1px 6px;
            color: var(--text-muted);
            font-family: 'DM Mono', monospace;
        }
        .toc-chevron {
            color: var(--text-muted);
            font-size: 10px;
            transition: transform 0.2s;
        }
        .toc-emp-card.collapsed .toc-chevron { transform: rotate(-90deg); }
        .toc-emp-card.collapsed .toc-entries { display: none; }

        .toc-entries { padding: 8px 12px 10px; display: flex; flex-direction: column; gap: 5px; }

        .toc-entry {
            display: flex;
            flex-direction: column;
            gap: 2px;
            padding: 6px 8px;
            border-radius: 7px;
            background: rgba(255,255,255,0.025);
            border: 1px solid rgba(255,255,255,0.04);
            transition: background 0.15s;
        }
        .toc-entry:hover { background: rgba(255,255,255,0.04); }

        .toc-entry-main {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .toc-date {
            font-size: 11px;
            font-family: 'DM Mono', monospace;
            color: var(--text-dim);
            flex: 1;
        }
        .toc-pill {
            font-size: 10px;
            font-weight: 600;
            border-radius: 5px;
            padding: 2px 7px;
            white-space: nowrap;
            letter-spacing: 0.3px;
        }
        .toc-note {
            font-size: 11px;
            color: var(--orange);
            padding-left: 2px;
            font-style: italic;
            opacity: 0.85;
        }

        /* ── Launch Button ── */
        #toc-launch-btn {
            position: fixed;
            bottom: 24px; right: 24px;
            z-index: 99999;
            padding: 11px 20px;
            background: linear-gradient(135deg, #4f8ef7, #7c5cfc);
            color: white;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            font-family: 'DM Sans', sans-serif;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 6px 24px rgba(79,142,247,0.4), 0 0 0 1px rgba(255,255,255,0.1);
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
            letter-spacing: 0.3px;
        }
        #toc-launch-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 32px rgba(79,142,247,0.5), 0 0 0 1px rgba(255,255,255,0.15);
        }
        #toc-launch-btn:active { transform: translateY(0); }
        #toc-launch-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        #toc-launch-btn .spinner {
            width: 14px; height: 14px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: toc-spin 0.7s linear infinite;
        }
        @keyframes toc-spin { to { transform: rotate(360deg); } }

        /* ── Loading overlay ── */
        #toc-loading {
            grid-column: 1 / -1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            padding: 48px 0;
            color: var(--text-muted);
            font-size: 13px;
        }
        .toc-loading-ring {
            width: 36px; height: 36px;
            border: 3px solid rgba(79,142,247,0.15);
            border-top-color: var(--accent);
            border-radius: 50%;
            animation: toc-spin 0.8s linear infinite;
        }
    `;
    document.head.appendChild(style);

    // ─── Employees ────────────────────────────────────────────────────────────────
    const employees = [
        'Eric A.', 'Jim B.', 'Ryan B.', 'David B.', 'Renee B.', 'Alexandra B.',
        'Michael C.', 'Jon C.', 'Sean D.', 'Zianya F.', 'Bo F.', 'Abbey F.',
        'Joey G.', 'Jules G.', 'Lori G.', 'Brittany H.', 'Richard H.', 'Isaiah H.',
        'Pam I.', 'Darlene J.', 'Adam J.', 'Joseph K.', 'Mark K.', 'Steve K.',
        'Larry L.', 'Brock L.', 'Ana L.', 'Joyce M.', 'Laura M.', 'Evan M.',
        'Virginia M.', 'Angie O.', 'Ryan P.', 'Bill R.', 'Rob R.', 'Dianna S.',
        'Elizabeth S.', 'Rick S.', 'Jacob S.', 'Melissa S.', 'Mike S.', 'Susan S.',
        'Tina T.', 'Katlin T.', 'Bob W.', 'OTSAdmin W.', 'David W.', 'Jason W.',
        'Justin W.', 'Wendy W.', 'Shannon W.', 'Chris W.',
    ];

    // ─── Event type → pill style ──────────────────────────────────────────────────
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

    // ─── Avatar color palette ─────────────────────────────────────────────────────
    const AVATAR_COLORS = [
        ['rgba(79,142,247,0.2)', '#7db8ff'],
        ['rgba(124,92,252,0.2)', '#c4b5fd'],
        ['rgba(52,211,153,0.2)', '#6ee7b7'],
        ['rgba(251,146,60,0.2)', '#fdba74'],
        ['rgba(248,113,113,0.2)', '#fca5a5'],
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
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        const mm = d.getMonth() + 1;
        const dd = d.getDate();
        const yy = d.getFullYear().toString().slice(-2);
        return `${mm}/${dd}/${yy}`;
    }

    function parseDateFromRange(dateRange) {
        let firstDatePart = dateRange.includes(' to ')
            ? dateRange.split(' to ')[0].trim()
            : dateRange.split('-')[0].trim();
        const parts = firstDatePart.split('/');
        if (parts.length !== 3) return new Date(0);
        let [mm, dd, yy] = parts;
        yy = yy.length === 2 ? '20' + yy : yy;
        return new Date(`${yy}-${mm}-${dd}`);
    }

    function isInRange(dateRangeStr, startDate, endDate) {
        const rawParts = dateRangeStr.includes(' to ')
            ? dateRangeStr.split(' to ').map(p => new Date(p.trim()))
            : [new Date(dateRangeStr)];
        const start = rawParts[0], end = rawParts[1] || rawParts[0];
        return !(end < startDate || start > endDate);
    }

    // ─── Modal scraper ────────────────────────────────────────────────────────────
    function getEventDetailsFromModal(alertDiv) {
        return new Promise((resolve) => {
            alertDiv.click();
            let attempts = 0;
            const intervalId = setInterval(() => {
                attempts++;
                const modal = document.querySelector('.modal-content');
                if (modal) {
                    const dateP = Array.from(modal.querySelectorAll('p.ng-binding'))
                        .find(p => p.textContent.includes('Date(s):'));
                    const noteP = Array.from(modal.querySelectorAll('p.ng-binding'))
                        .find(p => p.textContent.trim().startsWith('Note:'));
                    if (dateP) {
                        const text = dateP.textContent.trim();
                        const match = text.match(/Date\(s\):\s*(.+)/i);
                        const dateText = match ? match[1].trim() : null;
                        let noteText = noteP ? noteP.textContent.replace('Note:', '').trim() : null;
                        const closeBtn = modal.querySelector('button[ng-click="mecc.Close()"]');
                        if (closeBtn) closeBtn.click();
                        clearInterval(intervalId);
                        resolve({ dateRange: dateText, note: noteText });
                        return;
                    }
                }
                if (attempts >= 50) { clearInterval(intervalId); resolve({ dateRange: null, note: null }); }
            }, 100);
        });
    }

    // ─── Parse schedule ───────────────────────────────────────────────────────────
    async function parseSchedule() {
        const dateCells = document.querySelectorAll('.fc-content-skeleton thead td[data-date]');
        const skeletonDates = Array.from(dateCells).map(td => td.getAttribute('data-date'));
        const rows = document.querySelectorAll('.fc-content-skeleton tbody tr');

        const scheduleByEmployee = {};
        employees.forEach(emp => scheduleByEmployee[emp] = []);

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
                            let dateRange = null, note = null;
                            try {
                                const details = await getEventDetailsFromModal(alertDiv);
                                dateRange = details.dateRange; note = details.note;
                            } catch { /* ignore */ }

                            if (!dateRange) {
                                const startDate = skeletonDates[colIndex];
                                const endDate = skeletonDates[colIndex + colspan - 1] || startDate;
                                dateRange = (startDate === endDate) ? formatDate(startDate)
                                    : `${formatDate(startDate)} to ${formatDate(endDate)}`;
                            } else {
                                if (dateRange.includes('-')) {
                                    const p = dateRange.split('-').map(s => s.trim());
                                    if (p.length === 2) dateRange = `${formatDate(p[0])} to ${formatDate(p[1])}`;
                                } else if (dateRange.includes('to')) {
                                    const p = dateRange.split('to').map(s => s.trim());
                                    if (p.length === 2) dateRange = `${formatDate(p[0])} to ${formatDate(p[1])}`;
                                } else { dateRange = formatDate(dateRange); }
                            }

                            const dup = scheduleByEmployee[foundEmp].find(e =>
                                e.dateRange === dateRange && e.eventType === eventType && e.note === note);
                            if (!dup) scheduleByEmployee[foundEmp].push({ dateRange, eventType, note });
                        }
                    }
                }
                colIndex += colspan;
            }
        }

        for (const emp in scheduleByEmployee) {
            scheduleByEmployee[emp].sort((a, b) => parseDateFromRange(a.dateRange) - parseDateFromRange(b.dateRange));
        }

        return scheduleByEmployee;
    }

    // ─── Build popup ──────────────────────────────────────────────────────────────
    function createPopup() {
        document.getElementById('toc-popup')?.remove();

        const popup = document.createElement('div');
        popup.id = 'toc-popup';
        Object.assign(popup.style, {
            position: 'fixed', top: '70px', left: '70px',
            width: '640px', maxHeight: '680px',
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
        topBar.id = 'toc-topbar';

        const titleRow = document.createElement('div');
        titleRow.id = 'toc-title-row';

        const titleLeft = document.createElement('div');
        titleLeft.style.cssText = 'display:flex;align-items:center;gap:10px;';

        const title = document.createElement('span');
        title.id = 'toc-title';
        title.textContent = 'Time-off Calendar';

        const badge = document.createElement('span');
        badge.id = 'toc-badge';
        badge.textContent = '0 employees';

        titleLeft.appendChild(title);
        titleLeft.appendChild(badge);

        const closeBtn = document.createElement('button');
        closeBtn.id = 'toc-close';
        closeBtn.innerHTML = '✕';
        closeBtn.addEventListener('click', () => popup.remove());

        titleRow.appendChild(titleLeft);
        titleRow.appendChild(closeBtn);
        topBar.appendChild(titleRow);

        // Date range filters
        const filterRow = document.createElement('div');
        filterRow.id = 'toc-filters';

        const startInput = document.createElement('input');
        startInput.type = 'date'; startInput.className = 'toc-input';
        startInput.title = 'Start date filter';

        const endInput = document.createElement('input');
        endInput.type = 'date'; endInput.className = 'toc-input';
        endInput.title = 'End date filter';

        const todayBtn = document.createElement('button');
        todayBtn.id = 'toc-today-btn'; todayBtn.textContent = 'Today';

        const clearBtn = document.createElement('button');
        clearBtn.id = 'toc-clear-btn'; clearBtn.textContent = 'Clear';

        filterRow.appendChild(startInput);
        filterRow.appendChild(endInput);
        filterRow.appendChild(todayBtn);
        filterRow.appendChild(clearBtn);
        topBar.appendChild(filterRow);

        // Search
        const searchRow = document.createElement('div');
        searchRow.id = 'toc-search-row';

        const searchBox = document.createElement('input');
        searchBox.type = 'text'; searchBox.id = 'toc-search';
        searchBox.placeholder = 'Search employee or event type…';
        searchRow.appendChild(searchBox);
        topBar.appendChild(searchRow);

        popup.appendChild(topBar);

        // ── Type filter bar ──
        const typeFilterBar = document.createElement('div');
        typeFilterBar.id = 'toc-type-filter-bar';
        const typeFilterLabel = document.createElement('span');
        typeFilterLabel.id = 'toc-type-filter-label';
        typeFilterLabel.textContent = 'Show:';
        typeFilterBar.appendChild(typeFilterLabel);
        popup.appendChild(typeFilterBar);

        // activeTypes: Set of event type strings currently ON (all on by default after data loads)
        const activeTypes = new Set();

        // ── Download row ──
        const dlRow = document.createElement('div');
        dlRow.id = 'toc-download-row';

        const dlBtn = document.createElement('button');
        dlBtn.id = 'toc-download';
        dlBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Export CSV`;
        dlRow.appendChild(dlBtn);
        popup.appendChild(dlRow);

        // ── Content ──
        const content = document.createElement('div');
        content.id = 'toc-content';
        popup.appendChild(content);

        // ── Build type filter chips (called once after data loads) ──
        function buildTypeChips(scheduleByEmployee) {
            // Collect all unique types + counts
            const typeCounts = {};
            for (const emp of employees) {
                (scheduleByEmployee[emp] || []).forEach(e => {
                    const key = e.eventType || 'Other';
                    typeCounts[key] = (typeCounts[key] || 0) + 1;
                });
            }

            // Seed activeTypes with everything (all ON by default)
            activeTypes.clear();
            Object.keys(typeCounts).forEach(t => activeTypes.add(t));

            // Remove old chips (keep label)
            typeFilterBar.querySelectorAll('.toc-type-chip').forEach(c => c.remove());

            Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
                const pillStyle = getPillStyle(type);
                const colorMatch = pillStyle.match(/color:([^;]+)/);
                const bgMatch = pillStyle.match(/background:([^;]+)/);
                const chipColor = colorMatch ? colorMatch[1].trim() : '#94a3b8';
                const chipBg = bgMatch ? bgMatch[1].trim() : 'rgba(255,255,255,0.06)';
                const borderMatch = pillStyle.match(/border:[^;]*?([#\w(),.% ]+)\s*(?:;|$)/);

                const chip = document.createElement('div');
                chip.className = 'toc-type-chip';
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
            let totalEmp = 0;
            const fs = startInput.value ? new Date(startInput.value) : null;
            const fe = endInput.value ? new Date(endInput.value) : null;
            for (const emp of employees) {
                const entries = (scheduleByEmployee[emp] || []).filter(e => {
                    if (fs && fe && !isInRange(e.dateRange, fs, fe)) return false;
                    if (!activeTypes.has(e.eventType || 'Other')) return false;
                    return true;
                });
                if (entries.length) totalEmp++;
            }
            badge.textContent = `${totalEmp} employee${totalEmp !== 1 ? 's' : ''}`;
        }

        function generateBlocks(scheduleByEmployee) {
            content.innerHTML = '';
            let visibleCount = 0;
            const filterStart = startInput.value ? new Date(startInput.value) : null;
            const filterEnd = endInput.value ? new Date(endInput.value) : null;
            const q = searchBox.value.toLowerCase();

            for (const emp of employees) {
                const entries = (scheduleByEmployee[emp] || []);

                // Apply date filter
                let filtered = entries.filter(e =>
                    !(filterStart && filterEnd && !isInRange(e.dateRange, filterStart, filterEnd)));

                // Apply type toggle filter
                filtered = filtered.filter(e => activeTypes.has(e.eventType || 'Other'));

                if (filtered.length === 0) continue;

                // Apply search filter
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
                const initials = getInitials(emp);

                const card = document.createElement('div');
                card.className = 'toc-emp-card';
                card.style.animationDelay = `${visibleCount * 20}ms`;

                const header = document.createElement('div');
                header.className = 'toc-emp-header';

                const avatar = document.createElement('div');
                avatar.className = 'toc-avatar';
                avatar.textContent = initials;
                avatar.style.cssText = `background:${bg};color:${color};`;

                const nameSpan = document.createElement('span');
                nameSpan.className = 'toc-emp-name';
                nameSpan.textContent = emp;

                const countBadge = document.createElement('span');
                countBadge.className = 'toc-emp-count';
                countBadge.textContent = filtered.length;

                const chevron = document.createElement('span');
                chevron.className = 'toc-chevron';
                chevron.textContent = '▾';

                header.appendChild(avatar);
                header.appendChild(nameSpan);
                header.appendChild(countBadge);
                header.appendChild(chevron);
                header.addEventListener('click', () => card.classList.toggle('collapsed'));
                card.appendChild(header);

                const entriesDiv = document.createElement('div');
                entriesDiv.className = 'toc-entries';

                filtered.forEach(entry => {
                    const entryEl = document.createElement('div');
                    entryEl.className = 'toc-entry';

                    const mainRow = document.createElement('div');
                    mainRow.className = 'toc-entry-main';

                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'toc-date';
                    dateSpan.textContent = entry.dateRange;

                    const pill = document.createElement('span');
                    pill.className = 'toc-pill';
                    pill.style.cssText = getPillStyle(entry.eventType);
                    pill.textContent = entry.eventType || 'Event';

                    mainRow.appendChild(dateSpan);
                    mainRow.appendChild(pill);
                    entryEl.appendChild(mainRow);

                    if (entry.note) {
                        const noteEl = document.createElement('div');
                        noteEl.className = 'toc-note';
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
                    <div id="toc-empty">
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
            startInput.value = ''; endInput.value = '';
            searchBox.value = '';
            // Re-enable all type chips
            typeFilterBar.querySelectorAll('.toc-type-chip').forEach(c => {
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
                const entries = (popup._schedule[emp] || []).filter(e => {
                    if (fs && fe && !isInRange(e.dateRange, fs, fe)) return false;
                    if (!activeTypes.has(e.eventType || 'Other')) return false;
                    return true;
                });
                entries.forEach(e => {
                    csv += `"${emp}","${e.dateRange}","${e.eventType}","${e.note || ''}"\n`;
                });
            }
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url;
            a.download = `time_off_${new Date().toISOString().split('T')[0]}.csv`;
            a.click(); URL.revokeObjectURL(url);
        });

        // ── Drag ──
        let isDragging = false, ox = 0, oy = 0;
        topBar.addEventListener('mousedown', e => {
            if (e.target.closest('input, button')) return;
            isDragging = true;
            const r = popup.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            popup.style.transition = 'none';
        });
        document.addEventListener('mousemove', e => {
            if (isDragging) {
                popup.style.left = `${e.clientX - ox}px`;
                popup.style.top = `${e.clientY - oy}px`;
            }
        });
        document.addEventListener('mouseup', () => { isDragging = false; popup.style.transition = ''; });

        return { popup, generateBlocks, buildTypeChips };
    }

    // ─── Show popup ────────────────────────────────────────────────────────────────
    async function showPopup(scheduleByEmployee) {
        if (!scheduleByEmployee) return;
        const { popup, generateBlocks, buildTypeChips } = createPopup();
        popup._schedule = scheduleByEmployee;
        document.body.appendChild(popup);

        // Show loading indicator first
        const content = popup.querySelector('#toc-content');
        content.innerHTML = `<div id="toc-loading"><div class="toc-loading-ring"></div>Rendering schedule…</div>`;

        requestAnimationFrame(() => {
            buildTypeChips(scheduleByEmployee);
            generateBlocks(scheduleByEmployee);
        });
    }

    // ─── Launch button ────────────────────────────────────────────────────────────
    function createLaunchButton() {
        if (document.getElementById('toc-launch-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'toc-launch-btn';
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> All Schedules`;

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = `<div class="spinner"></div> Loading…`;
            try {
                const schedule = await parseSchedule();
                await showPopup(schedule);
            } catch (err) {
                console.error('TOC Error:', err);
            }
            btn.disabled = false;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> All Schedules`;
        });

        document.body.appendChild(btn);
    }

    function waitForScheduleTable(retries = 25, interval = 100) {
        const table = document.querySelector('.fc-content-skeleton tbody tr');
        if (table) { createLaunchButton(); }
        else if (retries > 0) { setTimeout(() => waitForScheduleTable(retries - 1, interval), interval); }
        else { console.warn('TOC: Schedule table not found.'); }
    }

    window.addEventListener('load', () => waitForScheduleTable());
})();