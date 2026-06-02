// ==UserScript==
// @name         EMT Initial Student Gradebook Score Reconciler
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Floating panel — paste assignment scores from Excel, instantly see matches, mismatches, and missing entries against the gradebook page.
// @author       Evan
// @match        https://cdn.otsystems.net/sharedAngular/enrollment-transcript/*/gradebook*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(fontLink);

    const PANEL_W = 860;
    const PANEL_H = 580;

    // ─── CSS ──────────────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        #gb-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99998;
            background: linear-gradient(135deg, #1d4ed8, #2563eb);
            color: #fff;
            border: none;
            border-radius: 10px;
            padding: 11px 20px;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(37,99,235,0.35), 0 1px 3px rgba(0,0,0,0.1);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #gb-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(37,99,235,0.45); }
        #gb-btn:active { transform: translateY(0); }
        #gb-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        #gb-btn .btn-ring {
            width: 13px; height: 13px;
            border: 2px solid rgba(255,255,255,0.4);
            border-top-color: white;
            border-radius: 50%;
            animation: gb-spin 0.7s linear infinite;
        }

        #gb-panel {
            position: fixed;
            z-index: 99999;
            width: ${PANEL_W}px;
            height: ${PANEL_H}px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            display: flex;
            flex-direction: column;
            font-family: 'IBM Plex Sans', sans-serif;
            box-shadow: 0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08);
            overflow: hidden;
            opacity: 0;
            transform: scale(0.96) translateY(8px);
            transition: opacity 0.22s ease, transform 0.22s ease, height 0.22s ease;
            pointer-events: none;
        }
        #gb-panel.open { opacity: 1; transform: scale(1) translateY(0); pointer-events: all; }
        #gb-panel.minimized { height: 46px !important; overflow: hidden; }
        #gb-panel.minimized #gb-body { display: none; }

        /* Resize handles */
        .gb-resizer {
            position: absolute; z-index: 10;
            background: transparent;
        }
        .gb-resizer-se {
            bottom: 0; right: 0;
            width: 18px; height: 18px;
            cursor: se-resize;
        }
        .gb-resizer-se::after {
            content: '';
            position: absolute; bottom: 4px; right: 4px;
            width: 8px; height: 8px;
            border-right: 2px solid #cbd5e1;
            border-bottom: 2px solid #cbd5e1;
            border-radius: 1px;
        }
        .gb-resizer-e  { top: 0; right: 0; width: 5px; height: 100%; cursor: e-resize; }
        .gb-resizer-s  { bottom: 0; left: 0; width: 100%; height: 5px; cursor: s-resize; }
        #gb-panel.minimized .gb-resizer { display: none; }

        /* Header */
        #gb-header {
            background: #fff;
            border-bottom: 1px solid #e2e8f0;
            padding: 12px 16px 11px;
            cursor: grab;
            flex-shrink: 0;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        #gb-header:active { cursor: grabbing; }
        #gb-header-left { display: flex; align-items: center; gap: 10px; }
        #gb-title {
            font-size: 13px; font-weight: 700; color: #0f172a;
            display: flex; align-items: center; gap: 7px;
        }
        #gb-title::before {
            content: ''; display: block; width: 7px; height: 7px;
            border-radius: 50%; background: #2563eb;
            box-shadow: 0 0 0 2px rgba(37,99,235,0.2); flex-shrink: 0;
        }
        #gb-student {
            font-size: 10.5px; font-family: 'IBM Plex Mono', monospace;
            color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px;
        }
        #gb-header-right { display: flex; align-items: center; gap: 6px; }
        #gb-rescrape {
            background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
            color: #475569; font-family: 'IBM Plex Sans', sans-serif;
            font-size: 11px; font-weight: 600; padding: 5px 11px;
            cursor: pointer; transition: all 0.15s; display: flex; align-items: center; gap: 5px;
        }
        #gb-rescrape:hover { background: #e2e8f0; color: #334155; }
        #gb-close, #gb-minimize {
            background: #f1f5f9; border: 1px solid #e2e8f0; color: #94a3b8;
            width: 26px; height: 26px; border-radius: 6px; cursor: pointer;
            font-size: 12px; display: flex; align-items: center; justify-content: center;
            transition: all 0.15s; flex-shrink: 0; line-height: 1;
        }
        #gb-close:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }
        #gb-minimize:hover { background: #e0f2fe; color: #0284c7; border-color: #bae6fd; }

        /* Stats bar */
        #gb-stats-bar {
            flex-shrink: 0; padding: 7px 14px;
            background: #f8fafc; border-bottom: 1px solid #e2e8f0;
            display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        }
        .gb-stat {
            font-size: 10px; font-weight: 700; padding: 4px 10px;
            border-radius: 99px; font-family: 'IBM Plex Mono', monospace;
        }
        .gb-stat.total   { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .gb-stat.ok      { background: #f0fdfa; color: #0d9488; border: 1px solid #ccfbf1; }
        .gb-stat.diff    { background: #fff7ed; color: #f97316; border: 1px solid #fed7aa; }
        .gb-stat.missing { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
        .gb-stat.extra   { background: #fdf4ff; color: #9333ea; border: 1px solid #e9d5ff; }
        .gb-stat.score   { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }

        /* Body layout */
        #gb-body {
            flex: 1; display: flex; overflow: hidden; min-height: 0;
        }

        /* Left input pane */
        #gb-left {
            width: 265px; flex-shrink: 0;
            border-right: 1px solid #e2e8f0;
            display: flex; flex-direction: column;
            padding: 12px 14px; gap: 8px; background: #fff;
        }
        .gb-lbl {
            font-size: 9px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 1.1px; color: #94a3b8;
        }
        .gb-col-hint { display: flex; gap: 5px; flex-wrap: wrap; }
        .gb-badge {
            font-size: 9px; font-weight: 700; padding: 2px 7px;
            border-radius: 4px; font-family: 'IBM Plex Mono', monospace;
        }
        .gb-badge.col-a { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .gb-badge.col-b { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .gb-badge.col-opt { opacity: 0.6; }
        .gb-hint { font-size: 10px; color: #94a3b8; line-height: 1.5; }
        #gb-textarea {
            flex: 1; background: #f8fafc; border: 1.5px solid #e2e8f0;
            border-radius: 7px; color: #0f172a;
            font-family: 'IBM Plex Mono', monospace; font-size: 11px;
            padding: 9px 10px; outline: none; resize: none;
            transition: border-color 0.15s, box-shadow 0.15s; line-height: 1.6;
        }
        #gb-textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); background: #fff; }
        #gb-textarea::placeholder { color: #cbd5e1; }
        #gb-run {
            background: linear-gradient(135deg, #1d4ed8, #2563eb);
            border: none; border-radius: 7px; color: #fff;
            font-family: 'IBM Plex Sans', sans-serif; font-size: 12px;
            font-weight: 700; padding: 9px 0; cursor: pointer;
            transition: all 0.15s; letter-spacing: 0.4px;
            box-shadow: 0 2px 8px rgba(37,99,235,0.3);
        }
        #gb-run:hover { filter: brightness(1.1); }
        #gb-clear {
            background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 7px;
            color: #94a3b8; font-family: 'IBM Plex Sans', sans-serif;
            font-size: 11px; font-weight: 600; padding: 6px 0;
            cursor: pointer; transition: all 0.15s;
        }
        #gb-clear:hover { background: #e2e8f0; color: #64748b; }
        #gb-export {
            background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 7px;
            color: #16a34a; font-family: 'IBM Plex Sans', sans-serif;
            font-size: 11px; font-weight: 600; padding: 6px 0;
            cursor: pointer; transition: all 0.15s;
        }
        #gb-export:hover { background: #dcfce7; border-color: #86efac; }
        #gb-export:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Right results pane */
        #gb-right {
            flex: 1; display: flex; flex-direction: column;
            overflow: hidden; min-width: 0; background: #fff;
        }
        #gb-col-header {
            flex-shrink: 0; border-bottom: 2px solid #e2e8f0; background: #f8fafc;
        }
        .gb-ch-row {
            display: grid;
            grid-template-columns: 22px 1fr 90px 90px 60px;
            align-items: center;
        }
        .gb-ch {
            font-size: 8px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.8px; padding: 6px 4px; color: #94a3b8;
        }
        .gb-ch.name-col { padding-left: 8px; color: #64748b; }
        .gb-ch.excel-col { text-align: right; color: #b45309; padding-right: 6px; }
        .gb-ch.page-col  { text-align: right; color: #0d9488; padding-right: 6px; }
        .gb-ch.flag-col  { text-align: center; }

        #gb-list {
            flex: 1; overflow-y: auto; overflow-x: hidden;
        }
        #gb-list::-webkit-scrollbar { width: 4px; }
        #gb-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }

        .gb-row {
            display: grid;
            grid-template-columns: 22px 1fr 90px 90px 60px;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
            min-height: 32px;
            transition: background 0.1s;
        }
        .gb-row:hover { background: #f8fafc; }
        .gb-row.ok-row      { background: #fff; }
        .gb-row.diff-row    { background: #fffbf5; border-left: 3px solid #fdba74; }
        .gb-row.missing-row { background: #fff5f5; border-left: 3px solid #fca5a5; }
        .gb-row.extra-row   { background: #fdf4ff; border-left: 3px solid #d8b4fe; }
        .gb-row.section-hdr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
        .gb-row.subtotal-row {
            background: #faf5ff; border-top: 1px solid #e9d5ff;
            border-bottom: 2px solid #d8b4fe; min-height: 26px;
        }
        .gb-row.clickable { cursor: pointer; }
        .gb-row.clickable:hover { background: #f0fdfa !important; }
        .gb-row.selected { background: #fef2f2 !important; outline: 1px solid #fca5a5; outline-offset: -1px; }

        .gb-dot-cell { display: flex; align-items: center; justify-content: center; }
        .gb-dot {
            width: 6px; height: 6px; border-radius: 50%;
        }
        .gb-dot.ok      { background: #0d9488; box-shadow: 0 0 0 2px rgba(13,148,136,0.2); }
        .gb-dot.diff    { background: #f97316; box-shadow: 0 0 0 2px rgba(249,115,22,0.2); }
        .gb-dot.missing { background: #dc2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.15); }
        .gb-dot.extra   { background: #9333ea; box-shadow: 0 0 0 2px rgba(147,51,234,0.2); }

        .gb-name {
            font-size: 11px; color: #334155;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            padding: 0 8px;
        }
        .gb-name.missing { color: #dc2626; }
        .gb-name.extra   { color: #9333ea; }
        .gb-type-badge {
            display: inline-block; font-size: 8px; font-weight: 700;
            padding: 1px 5px; border-radius: 3px; margin-right: 5px;
            text-transform: uppercase; letter-spacing: 0.3px;
            vertical-align: middle;
        }
        .gb-type-badge.quiz  { background: #eff6ff; color: #2563eb; }
        .gb-type-badge.test  { background: #fff1f2; color: #e11d48; }
        .gb-type-badge.hw    { background: #f0fdf4; color: #16a34a; }
        .gb-type-badge.ec    { background: #fffbeb; color: #b45309; }
        .gb-type-badge.other { background: #f1f5f9; color: #64748b; }

        .gb-score {
            font-family: 'IBM Plex Mono', monospace; font-size: 10.5px;
            font-weight: 600; text-align: right; padding-right: 6px; white-space: nowrap;
        }
        .gb-score.excel { color: #b45309; }
        .gb-score.page  { color: #0d9488; }
        .gb-score.diff  { color: #f97316; }
        .gb-score.dim   { color: #cbd5e1; }
        .gb-score.extra { color: #9333ea; }

        .gb-flag-cell { display: flex; align-items: center; justify-content: center; padding: 0 4px; }
        .gb-pill {
            font-size: 7px; font-weight: 800; padding: 2px 5px;
            border-radius: 3px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap;
        }
        .gb-pill.ok      { background: #f0fdfa; color: #0d9488; }
        .gb-pill.diff    { background: #fff7ed; color: #f97316; }
        .gb-pill.missing { background: #fee2e2; color: #dc2626; }
        .gb-pill.extra   { background: #fdf4ff; color: #9333ea; }
        .gb-pill.ec      { background: #fffbeb; color: #b45309; }

        .gb-sec-lbl {
            font-size: 8px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 1px; padding: 5px 8px; grid-column: 1 / -1;
        }
        .gb-sec-lbl.ok-lbl      { color: #0d9488; }
        .gb-sec-lbl.diff-lbl    { color: #f97316; }
        .gb-sec-lbl.missing-lbl { color: #dc2626; }
        .gb-sec-lbl.extra-lbl   { color: #9333ea; }

        .gb-empty {
            padding: 40px 14px; text-align: center;
            font-size: 12px; color: #94a3b8; line-height: 1.7;
        }

        /* Page highlight */
        @keyframes gb-flash-in {
            0%   { background-color: #bfdbfe; outline: 2px solid #2563eb; }
            60%  { background-color: #dbeafe; outline: 2px solid #2563eb; }
            100% { background-color: #eff6ff; outline: 2px solid #2563eb; }
        }
        .gb-highlighted {
            background-color: #eff6ff !important;
            outline: 2px solid #2563eb !important;
            outline-offset: -1px; border-radius: 2px;
            position: relative; z-index: 2;
            animation: gb-flash-in 0.5s ease forwards !important;
        }

        @keyframes gb-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    // ─── Utilities ────────────────────────────────────────────────────────────────
    function mk(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
    function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

    // Parse "9 / 10", "9/10", "93", "93/100" → { earned, possible }
    function parseScore(raw) {
        raw = String(raw || '').replace(/\u00a0/g, ' ').trim();
        const slashMatch = raw.match(/^([\d.]+)\s*\/\s*([\d.]+)$/);
        if (slashMatch) return { earned: parseFloat(slashMatch[1]), possible: parseFloat(slashMatch[2]) };
        const numMatch = raw.match(/^([\d.]+)$/);
        if (numMatch) return { earned: parseFloat(numMatch[1]), possible: null };
        return null;
    }

    function fmtScore(earned, possible) {
        if (possible !== null && possible !== undefined) return `${earned} / ${possible}`;
        return String(earned);
    }

    function typeBadge(typeText) {
        const t = norm(typeText);
        if (t.includes('quiz'))         return { cls: 'quiz',  label: 'Quiz' };
        if (t.includes('test') || t.includes('exam')) return { cls: 'test', label: 'Test' };
        if (t.includes('extra'))        return { cls: 'ec',    label: 'EC' };
        if (t.includes('homework') || t.includes('hw')) return { cls: 'hw', label: 'HW' };
        return { cls: 'other', label: typeText.trim() || 'Other' };
    }

    // ─── Scrape gradebook page ────────────────────────────────────────────────────
    function scrapeGradebook() {
        const rows = [];
        // Try the specific meta-value span first, then broader fallbacks
        const nameEl = document.querySelector('.transcript-student-meta .meta-value, .student-name, .enrollment-name');
        const studentName = nameEl ? nameEl.textContent.trim() : '';

        document.querySelectorAll('table tbody tr').forEach(tr => {
            const nameDivEl = tr.querySelector('.assignment-name');
            const typeEl    = tr.querySelector('.assignment-type');
            if (!nameDivEl) return;

            const name = nameDivEl.textContent.trim();
            if (!name) return;

            const type = typeEl ? typeEl.textContent.trim() : '';

            // Score: prefer td.text-end, fall back to last td
            // Get ALL tds and take the last one that has score-like content
            const tds = tr.querySelectorAll('td');
            let scoreTd = null;
            // Walk backwards through tds to find one with a score pattern
            for (let i = tds.length - 1; i >= 0; i--) {
                const txt = tds[i].textContent.trim();
                if (/\d+\s*\/\s*\d+/.test(txt) || /^\d+$/.test(txt)) {
                    scoreTd = tds[i]; break;
                }
            }
            const score = scoreTd ? parseScore(scoreTd.textContent) : null;

            console.log('[GB Scrape]', name, '→ score:', score, '| scoreTd text:', scoreTd?.textContent?.trim());
            rows.push({ name, type, score, tr });
        });

        console.log('[GB Scrape] Total rows found:', rows.length);
        return { rows, studentName };
    }

    // ─── Fuzzy name match ─────────────────────────────────────────────────────────
    // Normalizes and does substring + word-overlap matching
    // ─── Name normalization for matching ─────────────────────────────────────────
    // Reduces names to canonical keys so shorthands match full page names:
    //   "quiz 1"             → "quiz 1"
    //   "quiz - chapter 1"   → "quiz 1"      (strip "chapter", keep number)
    //   "block 1"            → "block 1"
    //   "block 1 exam"       → "block 1"     (strip trailing "exam"/"test")
    //   "is 100"             → "is 100"
    //   "is-100.c introduction to the incident..."  → "is 100"
    //   "is-1152: blue campaign..."                 → "is 1152"
    //   "is 700", "is 200", "is 800"               all match their full page titles
    function canonicalize(name) {
        let s = norm(name);
        // Normalize hyphens/colons/periods used as separators to space
        s = s.replace(/[-\u2013:]+/g, ' ').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
        // "quiz chapter N" or "quiz - chapter N" → "quiz N"
        s = s.replace(/\bquiz\s+(?:chapter\s+)?(\d+)\b.*/i, 'quiz $1');
        // "block N exam" / "block N test" → "block N"
        s = s.replace(/\b(block\s+\d+)\s+(?:exam|test)\b.*/i, '$1');
        // IS course codes: "is 100 c introduction to..." → "is 100"
        // keeps "is" + number, drops the letter suffix and everything after
        s = s.replace(/\b(is\s+\d+)(?:\s+[a-z]\b.*|\s+.*)?$/i, '$1');
        return s.replace(/\s+/g, ' ').trim();
    }

    function nameMatchScore(a, b) {
        const na = norm(a), nb = norm(b);
        if (na === nb) return 1.0;
        // Canonical form matching — catches all the quiz/chapter/IS shorthand cases
        const ca = canonicalize(a), cb = canonicalize(b);
        if (ca === cb && ca.length > 0) return 0.98;
        if (ca.includes(cb) || cb.includes(ca)) return 0.9;
        // Raw substring containment
        if (na.includes(nb) || nb.includes(na)) return 0.85;
        // Word overlap on canonical forms
        const wa = new Set(ca.split(' ')), wb = cb.split(' ').filter(w => w.length > 1);
        if (wb.length === 0) return 0;
        const overlap = wb.filter(w => wa.has(w)).length;
        return overlap / Math.max(wa.size, wb.length);
    }

    function findBestMatch(excelName, pageRows, usedIndices) {
        let best = null, bestScore = 0;
        pageRows.forEach((row, idx) => {
            if (usedIndices.has(idx)) return;
            const s = nameMatchScore(excelName, row.name);
            if (s > bestScore) { bestScore = s; best = { row, idx, score: s }; }
        });
        // 0.5 threshold catches short shorthands like "is 100" matching long page titles
        return bestScore >= 0.5 ? best : null;
    }

    // ─── Parse Excel paste ────────────────────────────────────────────────────────
    // Accepts: "Assignment Name\t9 / 10" or "Assignment Name\t9\t10" or "Assignment Name\t9/10"
    // Parse Excel paste — supports two layouts:
    //
    // HORIZONTAL (the main format):
    //   Row 0: "Student Name\tQuiz 1\tQuiz 2\t...\tBlock 1\tFinal"
    //   Row 1: "Faria, Julianna\t9\t10\t...\t93\t88"
    //   → skip col 0 (student name), pair each header with its score
    //   → also extracts student name from col 0, row 1 for display
    //
    // VERTICAL fallback:
    //   "Quiz - Chapter 1\t9 / 10"
    //   "Block 1 Exam\t93 / 100"
    //
    function parseExcelPaste(raw) {
        const lines = raw.split(/[\n\r]+/).map(l => l.trim()).filter(l => l);
        if (!lines.length) return [];
        const splitTabs = l => l.split('\t').map(p => p.trim());
        const firstCols = splitTabs(lines[0]);

        // Detect horizontal: first cell is "Student Name" or first row has many name-like headers
        const looksLikeNames = c => !/^[\d\s\/\.]+$/.test(c) && c.length > 0;
        const isHorizontal = firstCols.length >= 3 && firstCols.filter(looksLikeNames).length >= 3;

        if (isHorizontal) {
            const headers = firstCols;
            const scores  = lines.length >= 2 ? splitTabs(lines[1]) : [];
            // Extract student name: if col 0 header is "Student Name", col 0 of scores row is the name
            let studentNameFromExcel = null;
            const startCol = (headers[0].toLowerCase() === 'student name') ? 1 : 0;
            if (startCol === 1 && scores[0]) studentNameFromExcel = scores[0];

            const results = [];
            for (let i = startCol; i < headers.length; i++) {
                const name = headers[i];
                if (!name) continue;
                const scoreRaw = scores[i] || null;
                results.push({ name, excelScore: parseScore(scoreRaw), rawScore: scoreRaw });
            }
            results._studentName = studentNameFromExcel;
            return results;
        }

        // Vertical layout
        const results = [];
        for (const line of lines) {
            const parts = splitTabs(line);
            if (!parts.length || !parts[0]) continue;
            const name = parts[0];
            let scoreRaw = null;
            if (parts.length >= 2) {
                if (parts.length >= 3 && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
                    scoreRaw = `${parts[1]} / ${parts[2]}`;
                } else { scoreRaw = parts[1]; }
            }
            results.push({ name, excelScore: parseScore(scoreRaw), rawScore: scoreRaw });
        }
        return results;
    }


    // ─── Run comparison ───────────────────────────────────────────────────────────
    function runComparison(pasteRaw, pageData) {
        const excelRows = parseExcelPaste(pasteRaw);
        console.log('[GB Compare] excelRows:', excelRows.length, '| pageRows:', pageData?.rows?.length);
        if (!excelRows.length) return null;
        if (!pageData || !pageData.rows || !pageData.rows.length) {
            console.warn('[GB Compare] No page rows — table may not be rendered yet');
            return null;
        }

        const { rows: pageRows } = pageData;
        const usedPageIndices = new Set();

        const matched   = []; // score matches
        const diffRows  = []; // name found, score differs
        const missing   = []; // in excel, not found on page
        const extra     = []; // on page, not in excel

        excelRows.forEach(exRow => {
            const hit = findBestMatch(exRow.name, pageRows, usedPageIndices);
            if (!hit) {
                missing.push({ excelName: exRow.name, excelScore: exRow.excelScore });
                return;
            }
            usedPageIndices.add(hit.idx);
            const pageScore = hit.row.score;
            const excelScore = exRow.excelScore;

            // Compare: if excel has earned only (no possible), compare earned to page earned
            let isMatch = false;
            if (excelScore && pageScore) {
                const earnedMatch = Math.abs(excelScore.earned - pageScore.earned) < 0.01;
                const possibleMatch = excelScore.possible === null ||
                    pageScore.possible === null ||
                    Math.abs(excelScore.possible - pageScore.possible) < 0.01;
                isMatch = earnedMatch && possibleMatch;
            } else if (!excelScore) {
                isMatch = true; // no score in excel = just checking presence
            }

            const entry = {
                excelName: exRow.name,
                pageName: hit.row.name,
                type: hit.row.type,
                excelScore,
                pageScore,
                tr: hit.row.tr,
                fuzzy: hit.score < 1.0,
            };

            if (isMatch) matched.push(entry);
            else diffRows.push(entry);
        });

        // Anything on page not matched = extra
        pageRows.forEach((row, idx) => {
            if (!usedPageIndices.has(idx)) {
                extra.push({ pageName: row.name, type: row.type, pageScore: row.score, tr: row.tr });
            }
        });

        const hasScores = excelRows.some(r => r.excelScore !== null);

        return { matched, diffRows, missing, extra, total: excelRows.length, hasScores };
    }

    // ─── Highlight row on page ────────────────────────────────────────────────────
    let _currentHighlightedRows = [];
    function highlightPageRow(tr) {
        _currentHighlightedRows.forEach(el => el.classList.remove('gb-highlighted'));
        _currentHighlightedRows = [];
        if (!tr) return;
        tr.classList.add('gb-highlighted');
        _currentHighlightedRows = [tr];
        tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // ─── State ────────────────────────────────────────────────────────────────────
    const state = {
        pasteRaw: '',
        results: null,
        pageData: null,
    };

    // ─── Build a result row ───────────────────────────────────────────────────────
    function buildRow(item, rowType) {
        const clsMap = { ok: 'ok-row', diff: 'diff-row', missing: 'missing-row', extra: 'extra-row' };
        const isClickable = rowType !== 'missing' && item.tr;
        const row = mk('div', `gb-row ${clsMap[rowType] || ''} ${isClickable ? 'clickable' : ''}`);

        if (isClickable) {
            row.addEventListener('click', () => {
                document.querySelectorAll('.gb-row.selected').forEach(r => r.classList.remove('selected'));
                highlightPageRow(item.tr);
                row.classList.add('selected');
            });
        }

        // Dot
        const dotCell = mk('div', 'gb-dot-cell');
        const dot = mk('span', `gb-dot ${rowType}`);
        dot.title = rowType === 'ok' ? 'Score matches' : rowType === 'diff' ? 'Score differs' : rowType === 'missing' ? 'Not found on page' : 'On page, not in Excel';
        dotCell.appendChild(dot); row.appendChild(dotCell);

        // Name
        const name = mk('span', `gb-name ${rowType === 'missing' ? 'missing' : rowType === 'extra' ? 'extra' : ''}`);
        const displayName = rowType === 'extra' ? item.pageName : (rowType === 'missing' ? item.excelName : item.pageName);
        const typeInfo = item.type ? typeBadge(item.type) : null;
        if (typeInfo) {
            name.innerHTML = `<span class="gb-type-badge ${typeInfo.cls}">${typeInfo.label}</span>${displayName}`;
        } else {
            name.textContent = displayName;
        }
        name.title = displayName;
        if (item.fuzzy) name.title += ` (fuzzy match from: "${item.excelName}")`;
        row.appendChild(name);

        // Excel score
        const excelScoreEl = mk('span', 'gb-score excel');
        if (rowType === 'extra') {
            excelScoreEl.textContent = '—';
            excelScoreEl.classList.add('dim');
        } else if (item.excelScore) {
            excelScoreEl.textContent = fmtScore(item.excelScore.earned, item.excelScore.possible);
        } else {
            excelScoreEl.textContent = '—';
            excelScoreEl.classList.add('dim');
        }
        row.appendChild(excelScoreEl);

        // Page score
        const pageScoreEl = mk('span', `gb-score ${rowType === 'diff' ? 'diff' : rowType === 'extra' ? 'extra' : 'page'}`);
        if (rowType === 'missing') {
            pageScoreEl.textContent = '—';
            pageScoreEl.classList.add('dim');
        } else if (item.pageScore) {
            pageScoreEl.textContent = fmtScore(item.pageScore.earned, item.pageScore.possible);
        } else {
            pageScoreEl.textContent = '—';
            pageScoreEl.classList.add('dim');
        }
        row.appendChild(pageScoreEl);

        // Flag pill
        const flagCell = mk('div', 'gb-flag-cell');
        const pillMap = { ok: ['ok', '✓ Match'], diff: ['diff', 'Diff'], missing: ['missing', 'Not Found'], extra: ['extra', '+ Extra'] };
        // Special case: extra credit items with "/ 0" possible — flag as EC
        if (rowType === 'ok' && item.pageScore && item.pageScore.possible === 0) {
            const pill = mk('span', 'gb-pill ec'); pill.textContent = 'EC';
            flagCell.appendChild(pill);
        } else {
            const [cls, txt] = pillMap[rowType] || ['ok', ''];
            const pill = mk('span', `gb-pill ${cls}`); pill.textContent = txt;
            if (rowType === 'diff' && item.excelScore && item.pageScore) {
                const delta = item.excelScore.earned - item.pageScore.earned;
                pill.title = `Excel: ${fmtScore(item.excelScore.earned, item.excelScore.possible)} · Page: ${fmtScore(item.pageScore.earned, item.pageScore.possible)} · Δ ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
            }
            flagCell.appendChild(pill);
        }
        row.appendChild(flagCell);

        return row;
    }

    // ─── Render results ───────────────────────────────────────────────────────────
    function renderResults(list, results) {
        list.innerHTML = '';
        if (!results) {
            list.innerHTML = `<div class="gb-empty">Paste assignment scores from Excel on the left,<br>then click <strong style="color:#2563eb">Compare Scores</strong>.<br><br><span style="font-size:10px;color:#94a3b8">Format: Assignment Name [tab] Score<br>Score can be "9 / 10", "9/10", or just "9"</span></div>`;
            return;
        }
        const { matched, diffRows, missing, extra } = results;

        function addSection(items, type, icon, lblCls, lblText, subtotalFn) {
            if (!items.length) return;
            const hdr = mk('div', 'gb-row section-hdr');
            const lbl = mk('span', `gb-sec-lbl ${lblCls}`);
            lbl.textContent = `${icon}  ${lblText} (${items.length})`;
            hdr.appendChild(lbl); list.appendChild(hdr);
            items.forEach(item => list.appendChild(buildRow(item, type)));
            if (subtotalFn) {
                const tot = subtotalFn(items);
                if (tot !== null) {
                    const totRow = mk('div', 'gb-row subtotal-row');
                    totRow.style.gridTemplateColumns = '22px 1fr 90px 90px 60px';
                    totRow.innerHTML = `<span></span><span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9333ea;padding:0 8px;">Section Total</span><span class="gb-score dim" style="padding-right:6px;text-align:right;">${tot.excel}</span><span class="gb-score extra" style="padding-right:6px;text-align:right;">${tot.page}</span><span></span>`;
                    list.appendChild(totRow);
                }
            }
        }

        const extraSubtotal = items => {
            const pageSum = items.reduce((s, r) => s + (r.pageScore?.earned || 0), 0);
            const pageTotal = items.filter(r => r.pageScore?.possible > 0).reduce((s, r) => s + (r.pageScore?.possible || 0), 0);
            return { excel: '—', page: pageTotal > 0 ? `${pageSum} / ${pageTotal}` : String(pageSum) };
        };

        addSection(diffRows, 'diff',    '⚠', 'diff-lbl',    'Score differs');
        addSection(extra,    'extra',   '◉', 'extra-lbl',   'On page, not in Excel', extraSubtotal);
        addSection(matched,  'ok',      '✓', 'ok-lbl',      'Scores match');
        addSection(missing,  'missing', '✗', 'missing-lbl', 'Not found on page');

        if (!matched.length && !diffRows.length && !missing.length && !extra.length) {
            list.innerHTML = `<div class="gb-empty">No results.</div>`;
        }
    }

    // ─── Build & open panel ───────────────────────────────────────────────────────

    // ─── Export to XLSX ───────────────────────────────────────────────────────────
    function exportToXlsx(results, pageData) {
        const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

        function doExport() {
            const XLSX = window.XLSX;
            const wb   = XLSX.utils.book_new();
            const studentName = pageData?.studentName || '';
            const now  = new Date().toLocaleString();

            // results keys: matched, diffRows, missing, extra
            const matched  = results.matched  || [];
            const diffRows = results.diffRows || [];
            const missing  = results.missing  || [];
            const extra    = results.extra    || [];

            const fmtS = s => {
                if (!s) return '—';
                return (s.possible != null) ? `${s.earned} / ${s.possible}` : String(s.earned);
            };
            const fmtDelta = (ex, pg) => {
                if (!ex || !pg) return '';
                const d = pg.earned - ex.earned;
                return d === 0 ? '' : (d > 0 ? `+${d}` : String(d));
            };
            const typeLabel = t => {
                if (!t) return '';
                const tl = t.toLowerCase();
                if (tl.includes('quiz')) return 'QUIZ';
                if (tl.includes('test') || tl.includes('exam')) return 'TEST';
                if (tl.includes('extra')) return 'EC';
                if (tl.includes('homework') || tl.includes('hw')) return 'HW';
                return t.toUpperCase().slice(0, 6);
            };
            const sumSection = items => {
                let exE = 0, exP = 0, pgE = 0, pgP = 0, hasEx = false, hasPg = false;
                items.forEach(r => {
                    if (r.excelScore) { exE += r.excelScore.earned; if (r.excelScore.possible) exP += r.excelScore.possible; hasEx = true; }
                    if (r.pageScore)  { pgE += r.pageScore.earned;  if (r.pageScore.possible)  pgP += r.pageScore.possible;  hasPg = true; }
                });
                return { ex: hasEx ? `${exE} / ${exP}` : '—', pg: hasPg ? `${pgE} / ${pgP}` : '—' };
            };

            // Columns: TYPE | ASSIGNMENT | EXCEL SCORE | PAGE SCORE | STATUS | DELTA
            const R = [];

            R.push(['Gradebook Score Reconciler', '', '', '', '', '']);
            R.push(['Student:', studentName, '', '', '', '']);
            R.push(['Exported:', now, '', '', '', '']);
            R.push([]);
            R.push([
                `✓ Match: ${matched.length}`,
                `⚠ Differs: ${diffRows.length}`,
                `✗ Missing: ${missing.length}`,
                `◉ Extra: ${extra.length}`,
                '', ''
            ]);
            R.push([]);
            R.push(['TYPE', 'ASSIGNMENT', 'EXCEL SCORE', 'PAGE SCORE', 'STATUS', 'DELTA']);

            // ◉ Extra (on page, not in excel)
            if (extra.length) {
                R.push([`◉ ON PAGE, NOT IN EXCEL (${extra.length})`, '', '', '', '', '']);
                extra.forEach(r => {
                    R.push([typeLabel(r.type), r.pageName, '—', fmtS(r.pageScore), '+ EXTRA', '']);
                });
                const t = sumSection(extra.map(r => ({ excelScore: null, pageScore: r.pageScore })));
                R.push(['SECTION TOTAL', '', t.ex, t.pg, '', '']);
                R.push([]);
            }

            // ✓ Match
            if (matched.length) {
                R.push([`✓ SCORES MATCH (${matched.length})`, '', '', '', '', '']);
                matched.forEach(r => {
                    const isEC = r.pageScore && r.pageScore.possible === 0;
                    R.push([typeLabel(r.type), r.pageName || r.excelName, fmtS(r.excelScore), fmtS(r.pageScore), isEC ? 'EC' : '✓ MATCH', fmtDelta(r.excelScore, r.pageScore)]);
                });
                const t = sumSection(matched);
                R.push(['SECTION TOTAL', '', t.ex, t.pg, '', '']);
                R.push([]);
            }

            // ⚠ Differs
            if (diffRows.length) {
                R.push([`⚠ SCORE MISMATCH (${diffRows.length})`, '', '', '', '', '']);
                diffRows.forEach(r => {
                    R.push([typeLabel(r.type), r.pageName || r.excelName, fmtS(r.excelScore), fmtS(r.pageScore), '⚠ DIFFERS', fmtDelta(r.excelScore, r.pageScore)]);
                });
                const t = sumSection(diffRows);
                R.push(['SECTION TOTAL', '', t.ex, t.pg, '', '']);
                R.push([]);
            }

            // ✗ Missing
            if (missing.length) {
                R.push([`✗ NOT FOUND ON PAGE (${missing.length})`, '', '', '', '', '']);
                missing.forEach(r => {
                    R.push(['', r.excelName || r.name, fmtS(r.excelScore), '—', 'NOT FOUND', '']);
                });
                R.push([]);
            }

            const ws = XLSX.utils.aoa_to_sheet(R);
            ws['!cols'] = [
                { wch: 8  },
                { wch: 58 },
                { wch: 14 },
                { wch: 14 },
                { wch: 12 },
                { wch: 8  },
            ];

            XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation');
            const safeName = studentName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            const dateStr  = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `${safeName || 'gradebook'}_reconciliation_${dateStr}.xlsx`);
        }

        if (window.XLSX) {
            doExport();
        } else {
            const script = document.createElement('script');
            script.src = XLSX_URL;
            script.onload = doExport;
            script.onerror = () => alert('Could not load SheetJS. Check your connection.');
            document.head.appendChild(script);
        }
    }

    function buildPanel() {
        document.getElementById('gb-panel')?.remove();
        const { rows, studentName } = state.pageData;

        const startX = Math.max(20, window.innerWidth  - PANEL_W - 20);
        const startY = Math.max(20, (window.innerHeight - PANEL_H) / 4);

        const panel = mk('div', ''); panel.id = 'gb-panel';
        panel.style.left = Math.min(startX, window.innerWidth - PANEL_W - 8) + 'px';
        panel.style.top  = Math.max(8, Math.min(startY, window.innerHeight - PANEL_H - 8)) + 'px';

        panel.innerHTML = `
            <div class="gb-resizer gb-resizer-se"></div>
            <div class="gb-resizer gb-resizer-e"></div>
            <div class="gb-resizer gb-resizer-s"></div>
            <div id="gb-header">
                <div id="gb-header-left">
                    <div id="gb-title">Gradebook Reconciler</div>
                    ${studentName ? `<div id="gb-student">${studentName}</div>` : `<div id="gb-student">${rows.length} assignments</div>`}
                </div>
                <div id="gb-header-right">
                    <button id="gb-rescrape">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        Re-scrape
                    </button>
                    <button id="gb-minimize" title="Minimize">—</button>
                    <button id="gb-close" title="Close">✕</button>
                </div>
            </div>
            <div id="gb-stats-bar">
                <span style="font-size:10px;color:#94a3b8;font-family:'IBM Plex Sans',sans-serif;">
                    ${rows.length} assignments scraped from page · Paste Excel data and compare
                </span>
            </div>
            <div id="gb-body">
                <div id="gb-left">
                    <div class="gb-lbl">Paste from Excel</div>
                    <div class="gb-col-hint">
                        <span class="gb-badge col-a">Col A: Assignment</span>
                        <span class="gb-badge col-b col-opt">Col B: Score</span>
                    </div>
                    <div class="gb-hint">Supports two layouts:<br><strong>Horizontal:</strong> copy header row + score row from Excel (names across top, scores below).<br><strong>Vertical:</strong> one assignment per line with name in col A, score in col B.</div>
                    <textarea id="gb-textarea" placeholder="Quiz - Chapter 1&#10;Quiz - Chapter 2&#10;&#10;Or with scores:&#10;Quiz - Chapter 1&#9;9 / 10&#10;Quiz - Chapter 2&#9;10 / 10&#10;Block 1 Exam&#9;93 / 100"></textarea>
                    <button id="gb-run">⚖  Compare Scores</button>
                    <button id="gb-clear">Clear</button>
                    <button id="gb-export" disabled>⬇ Export .xlsx</button>
                </div>
                <div id="gb-right">
                    <div id="gb-col-header">
                        <div class="gb-ch-row">
                            <span class="gb-ch"></span>
                            <span class="gb-ch name-col">Assignment</span>
                            <span class="gb-ch excel-col">Excel Score</span>
                            <span class="gb-ch page-col">Page Score</span>
                            <span class="gb-ch flag-col">Status</span>
                        </div>
                    </div>
                    <div id="gb-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add('open'));

        const list = panel.querySelector('#gb-list');
        const statsBar = panel.querySelector('#gb-stats-bar');
        const ta = panel.querySelector('#gb-textarea');
        ta.value = state.pasteRaw;

        renderResults(list, state.results);

        // Run — always re-scrape first so we get fresh Angular-rendered data
        panel.querySelector('#gb-run').addEventListener('click', () => {
            state.pasteRaw = ta.value;
            state.pageData = scrapeGradebook();
            console.log('[GB] pageData rows:', state.pageData.rows.length, '| paste length:', state.pasteRaw.length);
            state.results  = runComparison(state.pasteRaw, state.pageData);
            console.log('[GB] results:', state.results);
            renderResults(list, state.results);
            updateStats(statsBar);
            panel.querySelector('#gb-export').disabled = !state.results;
        });

        // Clear
        panel.querySelector('#gb-clear').addEventListener('click', () => {
            ta.value = ''; state.pasteRaw = ''; state.results = null;
            renderResults(list, null);
            updateStats(statsBar);
            panel.querySelector('#gb-export').disabled = true;
        });

        // Export
        panel.querySelector('#gb-export').addEventListener('click', () => {
            if (state.results) exportToXlsx(state.results, state.pageData);
        });

        // Re-scrape
        panel.querySelector('#gb-rescrape').addEventListener('click', () => {
            state.pageData = scrapeGradebook();
            if (state.pasteRaw) {
                state.results = runComparison(state.pasteRaw, state.pageData);
                renderResults(list, state.results);
            }
            updateStats(statsBar);
        });

        // Close / minimize
        panel.querySelector('#gb-close').addEventListener('click', () => { panel.classList.remove('open'); setTimeout(() => panel.remove(), 250); });
        panel.querySelector('#gb-minimize').addEventListener('click', () => {
            const m = panel.classList.toggle('minimized');
            panel.querySelector('#gb-minimize').textContent = m ? '▲' : '—';
            panel.querySelector('#gb-minimize').title = m ? 'Restore' : 'Minimize';
        });

        // Drag
        const header = panel.querySelector('#gb-header');
        let dragging = false, ox = 0, oy = 0;
        header.addEventListener('mousedown', e => {
            if (e.target.closest('button')) return;
            dragging = true;
            const r = panel.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            panel.style.transition = 'none'; e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const pw = panel.offsetWidth, ph = panel.offsetHeight;
            panel.style.left = Math.max(0, Math.min(window.innerWidth  - pw, e.clientX - ox)) + 'px';
            panel.style.top  = Math.max(0, Math.min(window.innerHeight - ph, e.clientY - oy)) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (dragging) { dragging = false; panel.style.transition = ''; }
            if (resizing) { resizing = false; resizeDir = ''; panel.style.transition = ''; document.body.style.userSelect = ''; }
        });

        // Resize
        let resizing = false, resizeDir = '', rsX = 0, rsY = 0, rsW = 0, rsH = 0;
        const MIN_W = 520, MIN_H = 340;

        panel.querySelectorAll('.gb-resizer').forEach(handle => {
            handle.addEventListener('mousedown', e => {
                e.stopPropagation();
                resizing = true;
                resizeDir = handle.classList.contains('gb-resizer-se') ? 'se'
                          : handle.classList.contains('gb-resizer-e')  ? 'e'
                          : 's';
                rsX = e.clientX; rsY = e.clientY;
                rsW = panel.offsetWidth; rsH = panel.offsetHeight;
                panel.style.transition = 'none';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });
        });

        document.addEventListener('mousemove', e => {
            if (!resizing) return;
            const dx = e.clientX - rsX, dy = e.clientY - rsY;
            if (resizeDir === 'se' || resizeDir === 'e') {
                panel.style.width  = Math.max(MIN_W, rsW + dx) + 'px';
            }
            if (resizeDir === 'se' || resizeDir === 's') {
                panel.style.height = Math.max(MIN_H, rsH + dy) + 'px';
            }
        }, true);

        setTimeout(() => ta.focus(), 80);
    }

    function updateStats(statsBar) {
        if (!state.results) {
            statsBar.innerHTML = `<span style="font-size:10px;color:#94a3b8;font-family:'IBM Plex Sans',sans-serif;">${state.pageData?.rows?.length || 0} assignments on page · Paste Excel data and compare</span>`;
            return;
        }
        const { matched, diffRows, missing, extra, total, hasScores } = state.results;
        let html = `<span class="gb-stat total">${total} from Excel</span>`;
        if (diffRows.length)  html += `<span class="gb-stat diff">⚠ ${diffRows.length} differ</span>`;
        html += `<span class="gb-stat ok">✓ ${matched.length} match</span>`;
        if (missing.length)   html += `<span class="gb-stat missing">✗ ${missing.length} missing</span>`;
        if (extra.length) {
            const extraSum = extra.reduce((s, r) => s + (r.pageScore?.earned || 0), 0);
            html += `<span class="gb-stat extra">◉ ${extra.length} extra · ${extraSum} pts</span>`;
        }
        // Score accuracy summary
        if (hasScores && (matched.length + diffRows.length) > 0) {
            const totalPossible = [...matched, ...diffRows].filter(r => r.pageScore?.possible > 0).reduce((s, r) => s + r.pageScore.possible, 0);
            const totalEarned   = [...matched, ...diffRows].filter(r => r.pageScore?.possible > 0).reduce((s, r) => s + r.pageScore.earned, 0);
            if (totalPossible > 0) {
                const pct = ((totalEarned / totalPossible) * 100).toFixed(1);
                html += `<span class="gb-stat score">${totalEarned} / ${totalPossible} · ${pct}%</span>`;
            }
        }
        statsBar.innerHTML = html;
    }

    // ─── Launch button ────────────────────────────────────────────────────────────
    function createLaunchBtn() {
        if (document.getElementById('gb-btn')) return;
        const btn = mk('button', ''); btn.id = 'gb-btn';
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg> Grade Check`;
        btn.addEventListener('click', () => {
            const existing = document.getElementById('gb-panel');
            if (existing) { existing.classList.toggle('open'); return; }
            state.pageData = scrapeGradebook();
            buildPanel();
        });
        document.body.appendChild(btn);
    }

    function waitForTable(retries = 60) {
        if (document.querySelector('table tbody tr .assignment-name')) {
            createLaunchBtn();
        } else if (retries > 0) {
            setTimeout(() => waitForTable(retries - 1), 400);
        } else {
            createLaunchBtn(); // show btn anyway
        }
    }

    window.addEventListener('load', () => setTimeout(() => waitForTable(), 600));
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => waitForTable(), 800));

    // Also watch for Angular rendering the table dynamically
    const observer = new MutationObserver(() => {
        if (document.querySelector('table tbody tr .assignment-name') && !document.getElementById('gb-btn')) {
            createLaunchBtn();
            observer.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();