// ==UserScript==
// @name         Bulk Enrollment Deleter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Paste student numbers, specify a course name, and auto-delete that enrollment from each student
// @author       You
// @match        https://otsystems.net/admin/students/dashboard/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const KEY_QUEUE   = 'del_queue';
    const KEY_COURSE  = 'del_course';
    const KEY_DATE    = 'del_date';
    const KEY_LOG     = 'del_log';
    const KEY_RUNNING = 'del_running';

    GM_addStyle(`
        #del-panel {
            position: fixed !important;
            top: 80px !important;
            right: 24px !important;
            z-index: 2147483647 !important;
            width: 300px !important;
            background: #1e293b !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0,0,0,0.45) !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
            overflow: hidden !important;
            color: #f1f5f9 !important;
        }
        #del-panel * { box-sizing: border-box !important; }
        #del-header {
            background: #0f172a !important;
            padding: 12px 16px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            cursor: move !important;
            user-select: none !important;
        }
        #del-header-title {
            font-size: 13px !important;
            font-weight: 600 !important;
            color: #f1f5f9 !important;
            display: flex !important;
            align-items: center !important;
            gap: 7px !important;
        }
        #del-toggle-btn {
            background: none !important;
            border: none !important;
            color: #64748b !important;
            cursor: pointer !important;
            font-size: 16px !important;
            line-height: 1 !important;
            padding: 0 !important;
        }
        #del-toggle-btn:hover { color: #94a3b8 !important; }
        #del-body { padding: 14px 16px 16px !important; }
        #del-body.collapsed { display: none !important; }
        .del-label {
            font-size: 11px !important;
            font-weight: 600 !important;
            color: #64748b !important;
            text-transform: uppercase !important;
            letter-spacing: 0.05em !important;
            margin-bottom: 5px !important;
            display: block !important;
        }
        #del-course-input {
            width: 100% !important;
            padding: 7px 10px !important;
            background: #0f172a !important;
            border: 1px solid #334155 !important;
            border-radius: 7px !important;
            color: #f1f5f9 !important;
            font-size: 12px !important;
            outline: none !important;
            margin-bottom: 10px !important;
        }
        #del-course-input:focus { border-color: #6366f1 !important; }
        #del-course-input::placeholder { color: #475569 !important; }
        #del-date-input {
            width: 100% !important;
            padding: 7px 10px !important;
            background: #0f172a !important;
            border: 1px solid #334155 !important;
            border-radius: 7px !important;
            color: #f1f5f9 !important;
            font-size: 12px !important;
            outline: none !important;
            margin-bottom: 10px !important;
        }
        #del-date-input:focus { border-color: #6366f1 !important; }
        #del-date-input::placeholder { color: #475569 !important; }
        #del-students-input {
            width: 100% !important;
            height: 90px !important;
            padding: 7px 10px !important;
            background: #0f172a !important;
            border: 1px solid #334155 !important;
            border-radius: 7px !important;
            color: #f1f5f9 !important;
            font-size: 12px !important;
            font-family: monospace !important;
            outline: none !important;
            resize: vertical !important;
            margin-bottom: 10px !important;
        }
        #del-students-input:focus { border-color: #6366f1 !important; }
        #del-students-input::placeholder { color: #475569 !important; }
        #del-start-btn {
            width: 100% !important;
            padding: 9px !important;
            background: #6366f1 !important;
            color: #fff !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: background 0.15s !important;
            margin-bottom: 10px !important;
        }
        #del-start-btn:hover    { background: #4f46e5 !important; }
        #del-start-btn:disabled { background: #3730a3 !important; cursor: not-allowed !important; opacity: 0.6 !important; }
        #del-stop-btn {
            width: 100% !important;
            padding: 9px !important;
            background: #7f1d1d !important;
            color: #fca5a5 !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            display: none !important;
            margin-bottom: 10px !important;
        }
        #del-stop-btn:hover { background: #991b1b !important; }
        #del-progress {
            display: none !important;
            margin-bottom: 10px !important;
        }
        #del-progress-track {
            background: #0f172a !important;
            border-radius: 6px !important;
            height: 6px !important;
            overflow: hidden !important;
            margin-bottom: 5px !important;
        }
        #del-progress-bar {
            height: 6px !important;
            background: #6366f1 !important;
            width: 0% !important;
            transition: width 0.3s !important;
            border-radius: 6px !important;
        }
        #del-progress-label {
            font-size: 11px !important;
            color: #64748b !important;
        }
        #del-status {
            font-size: 12px !important;
            color: #94a3b8 !important;
            min-height: 16px !important;
            margin-bottom: 8px !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        #del-log {
            max-height: 130px !important;
            overflow-y: auto !important;
            background: #0f172a !important;
            border-radius: 7px !important;
            padding: 8px 10px !important;
            font-size: 11px !important;
            font-family: monospace !important;
            display: none !important;
        }
        .del-log-entry {
            padding: 2px 0 !important;
            border-bottom: 1px solid #1e293b !important;
            display: flex !important;
            gap: 6px !important;
            align-items: flex-start !important;
        }
        .del-log-entry:last-child { border-bottom: none !important; }
        .del-log-sn  { color: #7dd3fc !important; flex-shrink: 0 !important; }
        .del-log-ok  { color: #4ade80 !important; }
        .del-log-err { color: #f87171 !important; }
        .del-log-skip { color: #fbbf24 !important; }
        #del-clear-log {
            font-size: 11px !important;
            color: #475569 !important;
            background: none !important;
            border: none !important;
            cursor: pointer !important;
            padding: 0 !important;
            margin-top: 6px !important;
            display: none !important;
        }
        #del-clear-log:hover { color: #94a3b8 !important; }
    `);

    // ── Build the panel ────────────────────────────────────────────

    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'del-panel';
        panel.innerHTML = `
            <div id="del-header">
                <div id="del-header-title">🗑 Bulk Enrollment Deleter</div>
                <button id="del-toggle-btn" title="Collapse">−</button>
            </div>
            <div id="del-body">
                <label class="del-label">Course name to delete (partial match)</label>
                <input id="del-course-input" type="text" placeholder="e.g. DOT General Awareness" />
                <label class="del-label">Enrolled date/time (partial match)</label>
                <input id="del-date-input" type="text" placeholder="e.g. 3/20/26 10:20 AM" />
                <label class="del-label">Student numbers (one per line)</label>
                <textarea id="del-students-input" placeholder="331818&#10;204512&#10;119843"></textarea>
                <button id="del-start-btn">▶ Start</button>
                <button id="del-stop-btn">■ Stop</button>
                <div id="del-progress">
                    <div id="del-progress-track"><div id="del-progress-bar"></div></div>
                    <div id="del-progress-label"></div>
                </div>
                <div id="del-status"></div>
                <div id="del-log"></div>
                <button id="del-clear-log">Clear log</button>
            </div>
        `;
        document.body.appendChild(panel);

        // Collapse toggle
        let collapsed = false;
        document.getElementById('del-toggle-btn').addEventListener('click', () => {
            collapsed = !collapsed;
            document.getElementById('del-body').classList.toggle('collapsed', collapsed);
            document.getElementById('del-toggle-btn').textContent = collapsed ? '+' : '−';
        });

        // Drag to reposition
        makeDraggable(panel, document.getElementById('del-header'));

        document.getElementById('del-start-btn').addEventListener('click', startRun);
        document.getElementById('del-stop-btn').addEventListener('click', stopRun);
        document.getElementById('del-clear-log').addEventListener('click', clearLog);

        // Restore log from previous session
        const savedLog = GM_getValue(KEY_LOG, null);
        if (savedLog) {
            const entries = JSON.parse(savedLog);
            if (entries.length) {
                entries.forEach(e => appendLogEntry(e.sn, e.type, e.msg));
                document.getElementById('del-log').style.display = 'block';
                document.getElementById('del-clear-log').style.display = 'inline';
            }
        }
    }

    function makeDraggable(el, handle) {
        let ox = 0, oy = 0, sx = 0, sy = 0;
        handle.addEventListener('mousedown', e => {
            e.preventDefault();
            sx = e.clientX; sy = e.clientY;
            const r = el.getBoundingClientRect();
            ox = r.left; oy = r.top;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        function onMove(e) {
            const nx = ox + e.clientX - sx;
            const ny = oy + e.clientY - sy;
            el.style.setProperty('right', 'auto', 'important');
            el.style.setProperty('left', nx + 'px', 'important');
            el.style.setProperty('top',  ny + 'px', 'important');
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
    }

    // ── Run logic ──────────────────────────────────────────────────

    let stopRequested = false;

    async function startRun() {
        const courseFilter = document.getElementById('del-course-input').value.trim();
        const dateFilter   = document.getElementById('del-date-input').value.trim();
        const raw = document.getElementById('del-students-input').value.trim();
        if (!raw) { setStatus('Paste student numbers first.', true); return; }

        const students = raw.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
        if (!students.length) { setStatus('No valid student numbers found.', true); return; }

        stopRequested = false;
        document.getElementById('del-start-btn').style.display = 'none';
        document.getElementById('del-stop-btn').style.display  = 'block';
        document.getElementById('del-progress').style.display  = 'block';
        document.getElementById('del-log').style.display       = 'block';
        document.getElementById('del-clear-log').style.display = 'inline';

        // Save state so we can resume if the page navigates away mid-run
        GM_setValue(KEY_QUEUE,   JSON.stringify(students));
        GM_setValue(KEY_COURSE,  courseFilter);
        GM_setValue(KEY_DATE,    dateFilter);
        GM_setValue(KEY_RUNNING, true);

        await processQueue(students, courseFilter, dateFilter);
    }

    function stopRun() {
        stopRequested = true;
        GM_setValue(KEY_RUNNING, false);
        document.getElementById('del-start-btn').style.display = 'block';
        document.getElementById('del-stop-btn').style.display  = 'none';
        setStatus('Stopped.');
    }

    async function processQueue(students, courseFilter, dateFilter) {
        const total = students.length;
        for (let i = 0; i < students.length; i++) {
            if (stopRequested) break;
            const sn = students[i];
            updateProgress(i + 1, total, sn);
            setStatus(`Processing S# ${sn}…`);
            await processStudent(sn, courseFilter, dateFilter);
            // Small pause between students to avoid hammering the server
            await sleep(600);
        }

        if (!stopRequested) {
            GM_setValue(KEY_RUNNING, false);
            document.getElementById('del-start-btn').style.display = 'block';
            document.getElementById('del-stop-btn').style.display  = 'none';
            setStatus(`Done — ${total} student${total > 1 ? 's' : ''} processed.`);
        }
    }

    async function processStudent(sn, courseFilter, dateFilter) {
        try {
            // 1. Navigate to the student dashboard
            await navigateTo(`https://otsystems.net/admin/students/dashboard/?student_number=${sn}`);

            // 2. Click the Classes tab
            const tabClicked = await waitAndDo(
                () => findClassesTab(),
                tab => tab.click(),
                8000,
                'Classes tab'
            );
            if (!tabClicked) {
                logEntry(sn, 'err', 'Classes tab not found');
                return;
            }

            // 3. Wait for enrollment panels to render
            await sleep(1200);

            // 4. Find matching deletable enrollment(s)
            const deleted = await deleteMatchingEnrollment(sn, courseFilter, dateFilter);
            if (deleted === 0) {
                const filterDesc = [courseFilter, dateFilter].filter(Boolean).join(' / ');
                logEntry(sn, 'skip', filterDesc ? `No deletable match for "${filterDesc}"` : 'No deletable enrollments');
            }

        } catch (err) {
            logEntry(sn, 'err', err.message || String(err));
        }
    }

    function findClassesTab() {
        // The Classes tab is an <a> containing a <uib-tab-heading> with "Classes" text
        const links = [...document.querySelectorAll('a[uib-tab-heading-transclude]')];
        return links.find(a => a.textContent.trim().toLowerCase().startsWith('classes')) || null;
    }

    async function deleteMatchingEnrollment(sn, courseFilter, dateFilter) {
        // Find all panel-title blocks that have a deletable (trash) button
        const allDeleteBtns = [...document.querySelectorAll('a.text-danger[ng-click*="DeleteEnrollment"]')];
        if (!allDeleteBtns.length) {
            logEntry(sn, 'skip', 'No deletable enrollments on this account');
            return 0;
        }

        // Filter by course name and/or enrolled date
        let targets = allDeleteBtns.filter(btn => {
            // The delete button lives inside .panel-heading — walk up to it
            const heading = btn.closest('.panel-heading');
            if (!heading) return false;

            // Course name is in the h4 inside .panel-title.pull-left
            if (courseFilter) {
                const h4 = heading.querySelector('.panel-title.pull-left h4, h4');
                const courseText = h4 ? h4.textContent.replace(/\s+/g, ' ').trim() : '';
                if (!courseText.toLowerCase().includes(courseFilter.toLowerCase())) return false;
            }

            // Enrolled date is in .panel-title.pull-right — text like "Enrolled: 3/20/26 10:20 AM"
            if (dateFilter) {
                const dateEl = heading.querySelector('.panel-title.pull-right');
                const dateText = dateEl ? dateEl.textContent.replace(/\s+/g, ' ').trim() : '';
                if (!dateText.toLowerCase().includes(dateFilter.toLowerCase())) return false;
            }

            return true;
        });

        if (!targets.length) return 0;

        let deletedCount = 0;
        for (const btn of targets) {
            if (stopRequested) break;

            // Build a label for the log from course name + enrolled date
            const heading    = btn.closest('.panel-heading');
            const h4         = heading ? heading.querySelector('.panel-title.pull-left h4, h4') : null;
            const dateEl     = heading ? heading.querySelector('.panel-title.pull-right') : null;
            const courseName = h4     ? h4.textContent.replace(/\s+/g, ' ').trim().slice(0, 55) : 'Unknown course';
            const enrollDate = dateEl ? dateEl.textContent.replace(/\s+/g, ' ').trim() : '';
            const logLabel   = enrollDate ? `${courseName} (${enrollDate})` : courseName;

            // Open the dropdown first (the delete button is inside a dropdown menu)
            const dropdownToggle = btn.closest('.btn-group')?.querySelector('[data-toggle="dropdown"]');
            if (dropdownToggle) {
                dropdownToggle.click();
                await sleep(300);
            }

            // Click the delete button
            btn.click();
            await sleep(400);

            // Confirm the modal
            const confirmed = await confirmDeleteModal(sn, logLabel);
            if (confirmed) {
                deletedCount++;
                logEntry(sn, 'ok', `Deleted: ${logLabel}`);
            } else {
                logEntry(sn, 'err', `Could not confirm delete for: ${logLabel}`);
            }

            await sleep(800);
        }

        return deletedCount;
    }

    async function confirmDeleteModal(sn, courseName) {
        // Wait for a confirm button to appear — could be "Yes", "Delete", "OK", "Confirm"
        const confirmBtn = await waitFor(
            () => {
                // Look for modal confirm buttons
                const candidates = [
                    ...document.querySelectorAll('.modal button, .modal-footer button, .swal-button')
                ];
                return candidates.find(b => {
                    const t = b.textContent.trim().toLowerCase();
                    return t === 'yes' || t === 'delete' || t === 'ok' ||
                           t === 'confirm' || t.includes('yes') || t.includes('delete');
                }) || null;
            },
            3000
        );

        if (!confirmBtn) {
            // Some sites use window.confirm() — check if it was auto-accepted
            // Try clicking any visible "OK" or primary button in a dialog
            const fallback = document.querySelector(
                '[class*="confirm"] button, [class*="modal"] .btn-danger, [class*="modal"] .btn-primary'
            );
            if (fallback) {
                fallback.click();
                await sleep(500);
                return true;
            }
            return false;
        }

        confirmBtn.click();
        await sleep(600);
        return true;
    }

    // ── Navigation helper — loads a URL and waits for the page to settle ──

    function navigateTo(url) {
        return new Promise(resolve => {
            // If already on this page, just resolve
            if (location.href === url) { resolve(); return; }

            // Store resolve callback; the page reload will re-run the script
            // For same-domain SPA navigation (AngularJS), use history pushState
            // OT Systems dashboard is a full page load per student
            window.location.href = url;

            // The promise won't resolve because the page navigates away —
            // execution continues in the new page context via GM_getValue/KEY_RUNNING
            // We handle this by re-reading the queue on page load below.
        });
    }

    // ── Page-load continuation (resume after navigation) ──────────

    async function resumeIfRunning() {
        if (!GM_getValue(KEY_RUNNING, false)) return;

        const queue        = JSON.parse(GM_getValue(KEY_QUEUE,  '[]'));
        const courseFilter = GM_getValue(KEY_COURSE, '');
        const dateFilter   = GM_getValue(KEY_DATE,   '');
        if (!queue.length) {
            GM_setValue(KEY_RUNNING, false);
            return;
        }

        // Wait for panel to exist then run
        await waitFor(() => document.getElementById('del-panel'), 5000);

        const sn = queue[0];
        const currentSN = extractSNFromURL();

        if (!currentSN || currentSN !== sn) {
            // Not on the right student page yet — navigate there
            window.location.href = `https://otsystems.net/admin/students/dashboard/?student_number=${sn}`;
            return;
        }

        // We're on the right page — process this student
        updateProgressFromQueue(queue);
        setStatus(`Processing S# ${sn}…`);

        // Click the Classes tab
        const tabClicked = await waitAndDo(
            () => findClassesTab(),
            tab => tab.click(),
            10000,
            'Classes tab'
        );

        if (!tabClicked) {
            logEntry(sn, 'err', 'Classes tab not found');
        } else {
            await sleep(1400);
            const deleted = await deleteMatchingEnrollment(sn, courseFilter, dateFilter);
            if (deleted === 0) {
                const filterDesc = [courseFilter, dateFilter].filter(Boolean).join(' / ');
                logEntry(sn, 'skip', filterDesc ? `No deletable match for "${filterDesc}"` : 'No deletable enrollments');
            }
        }

        // Advance queue
        queue.shift();
        GM_setValue(KEY_QUEUE, JSON.stringify(queue));

        await sleep(500);

        if (queue.length === 0) {
            GM_setValue(KEY_RUNNING, false);
            document.getElementById('del-start-btn').style.display = 'block';
            document.getElementById('del-stop-btn').style.display  = 'none';
            document.getElementById('del-progress').style.display  = 'none';
            setStatus(`Done — all students processed.`);
        } else {
            // Navigate to next student
            window.location.href = `https://otsystems.net/admin/students/dashboard/?student_number=${queue[0]}`;
        }
    }

    function extractSNFromURL() {
        const m = location.search.match(/student_number=(\d+)/i) ||
                  location.href.match(/student_number=(\d+)/i);
        return m ? m[1] : null;
    }

    function updateProgressFromQueue(queue) {
        const saved = GM_getValue(KEY_QUEUE, '[]');
        // We don't have total easily here — derive from log length + remaining
        const log = JSON.parse(GM_getValue(KEY_LOG, '[]'));
        const done = log.length;
        const total = done + queue.length;
        updateProgress(done + 1, total, queue[0]);
    }

    // ── UI helpers ─────────────────────────────────────────────────

    function setStatus(msg, isError = false) {
        const el = document.getElementById('del-status');
        if (!el) return;
        el.textContent = msg;
        el.style.color = isError ? '#f87171' : '#94a3b8';
    }

    function updateProgress(done, total, sn) {
        const bar   = document.getElementById('del-progress-bar');
        const label = document.getElementById('del-progress-label');
        if (bar)   bar.style.width = Math.round((done / total) * 100) + '%';
        if (label) label.textContent = `${done} of ${total}  (S# ${sn})`;
    }

    const logBuffer = [];

    function logEntry(sn, type, msg) {
        const entry = { sn, type, msg };
        logBuffer.push(entry);

        // Persist
        const saved = JSON.parse(GM_getValue(KEY_LOG, '[]'));
        saved.push(entry);
        GM_setValue(KEY_LOG, JSON.stringify(saved.slice(-200))); // keep last 200

        appendLogEntry(sn, type, msg);
    }

    function appendLogEntry(sn, type, msg) {
        const log = document.getElementById('del-log');
        if (!log) return;
        const row = document.createElement('div');
        row.className = 'del-log-entry';
        const icon = type === 'ok' ? '✓' : type === 'skip' ? '⚠' : '✗';
        row.innerHTML = `
            <span class="del-log-sn">${sn}</span>
            <span class="del-log-${type}">${icon} ${escHtml(msg)}</span>
        `;
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
    }

    function clearLog() {
        GM_deleteValue(KEY_LOG);
        const log = document.getElementById('del-log');
        if (log) log.innerHTML = '';
    }

    // ── Async utilities ────────────────────────────────────────────

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // Poll until selector returns truthy or timeout
    function waitFor(fn, timeout = 8000) {
        return new Promise(resolve => {
            const start = Date.now();
            const tick = () => {
                const result = fn();
                if (result) { resolve(result); return; }
                if (Date.now() - start > timeout) { resolve(null); return; }
                setTimeout(tick, 200);
            };
            tick();
        });
    }

    // Wait for element then call action on it; returns true on success
    async function waitAndDo(finder, action, timeout, label) {
        const el = await waitFor(finder, timeout);
        if (!el) return false;
        action(el);
        return true;
    }

    function escHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Boot ───────────────────────────────────────────────────────

    // Only run on the student dashboard
    if (!location.pathname.toLowerCase().includes('/students/dashboard')) return;

    const ready = () => {
        buildPanel();
        resumeIfRunning();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ready);
    } else {
        ready();
    }

})();