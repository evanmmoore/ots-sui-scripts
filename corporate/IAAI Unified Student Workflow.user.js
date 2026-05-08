// ==UserScript==
// @name         IAAI Unified Student Workflow
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Unified 4-step workflow: Pull Student Numbers → Bulk Enrollment → Email Injector → Fetch Emails CSV
// @author       You
// @match        https://otsystems.net/admin/corporate/manage_students.asp?id=*
// @match        https://www.otsystems.net/admin/corporate/manage_students.asp?id=*
// @match        https://otsystems.net/admin/corporate/org_master_edit.asp?id=5166
// @match        https://otsystems.net/admin/students/dashboard/?student_number=*
// @match        https://otsystems.net/admin/Marketing/previewtemplate.asp?id=*
// @grant        none
// ==/UserScript==

(async function () {
    'use strict';

    // ─── Page Detection ──────────────────────────────────────────────────────────
    const isManagePage  = /manage_students\.asp/i.test(location.pathname);
    const isOrgPage     = /org_master_edit\.asp/i.test(location.pathname);
    const isStudentPage = /admin\/students\/dashboard/i.test(location.pathname);
    const isEmailPage   = /Marketing\/previewtemplate\.asp/i.test(location.pathname);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // ─── State Keys ──────────────────────────────────────────────────────────────
    const KEYS = {
        SESSION:     'iaai_session',
        BULK_STATE:  'iaai_bulkEnroll',
        BULK_ACTIVE: 'iaai_bulkActive',
    };

    function getSession()      { try { return JSON.parse(localStorage.getItem(KEYS.SESSION)) || {}; } catch { return {}; } }
    function saveSession(data) { localStorage.setItem(KEYS.SESSION, JSON.stringify(data)); }
    function clearSession()    { [KEYS.SESSION, KEYS.BULK_STATE].forEach(k => localStorage.removeItem(k)); sessionStorage.removeItem(KEYS.BULK_ACTIVE); }

    // ─── Shared CSS ───────────────────────────────────────────────────────────────
    const css = document.createElement('style');
    css.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=DM+Sans:wght@400;500;600;700&display=swap');

        #iaai-launcher-btn {
            margin-left:10px; padding:7px 16px;
            font-family:'DM Sans',sans-serif; font-weight:600; font-size:13px;
            border:none; border-radius:7px;
            background:linear-gradient(135deg,#1d4ed8,#2563eb); color:#fff;
            cursor:pointer; box-shadow:0 2px 8px rgba(37,99,235,0.35);
            transition:transform .1s,box-shadow .1s;
        }
        #iaai-launcher-btn:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(37,99,235,0.4); }

        #iaai-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(8,15,30,0.65); backdrop-filter:blur(4px); z-index:9990;
        }

        #iaai-modal {
            display:none; position:fixed; top:50%; left:50%;
            transform:translate(-50%,-50%);
            width:640px; max-width:96vw; max-height:90vh;
            background:#0d1117; border:1px solid #1e2d45; border-radius:16px;
            box-shadow:0 32px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);
            z-index:9999; flex-direction:column; overflow:hidden;
            font-family:'DM Sans',sans-serif; color:#e2e8f0;
        }
        .m-header {
            padding:18px 22px 16px; border-bottom:1px solid #1a2540;
            background:#0a0f1a; flex-shrink:0;
        }
        .m-title-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
        .m-title { display:flex; align-items:center; gap:10px; font-size:15px; font-weight:700; color:#f0f6ff; letter-spacing:-.01em; }
        .m-icon { width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); display:flex; align-items:center; justify-content:center; }
        .m-close { width:28px; height:28px; border-radius:6px; border:none; background:#1e2d3d; color:#64748b; font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .15s,color .15s; }
        .m-close:hover { background:#2d3f54; color:#94a3b8; }

        .step-track { display:flex; align-items:center; }
        .step-item { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:#2d3f54; }
        .step-item.active { color:#60a5fa; }
        .step-item.done   { color:#34d399; }
        .step-num { width:20px; height:20px; border-radius:50%; border:1.5px solid #2d3f54; display:flex; align-items:center; justify-content:center; font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:600; color:#2d3f54; }
        .step-item.active .step-num { border-color:#3b82f6; color:#60a5fa; background:rgba(59,130,246,.1); }
        .step-item.done   .step-num { border-color:#10b981; color:#34d399; background:rgba(16,185,129,.1); }
        .step-connector { width:20px; height:1px; background:#1e2d3d; margin:0 4px; flex-shrink:0; }

        .m-body { flex:1; overflow-y:auto; padding:18px 22px; display:flex; flex-direction:column; gap:14px; min-height:0; }
        .m-footer { padding:12px 22px; border-top:1px solid #1a2540; background:#0a0f1a; flex-shrink:0; display:flex; gap:8px; justify-content:flex-end; align-items:center; }
        .m-status { font-size:11px; color:#475569; margin-right:auto; font-family:'IBM Plex Mono',monospace; }

        .iaai-btn { padding:7px 16px; border-radius:7px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; cursor:pointer; transition:opacity .15s,transform .1s; border:none; }
        .iaai-btn:hover { opacity:.88; transform:translateY(-1px); }
        .iaai-btn-ghost   { background:transparent; border:1px solid #1e2d45; color:#64748b; }
        .iaai-btn-ghost:hover { background:#111827; color:#94a3b8; }
        .iaai-btn-primary { background:linear-gradient(135deg,#1d4ed8,#2563eb); color:#fff; box-shadow:0 2px 8px rgba(37,99,235,.3); }
        .iaai-btn-success { background:linear-gradient(135deg,#059669,#10b981); color:#fff; }
        .iaai-btn-sky     { background:linear-gradient(135deg,#0284c7,#0ea5e9); color:#fff; }
        .iaai-btn-warning { background:linear-gradient(135deg,#b45309,#d97706); color:#fff; }

        .iaai-label { font-size:11px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:.07em; display:block; margin-bottom:6px; }
        .iaai-ta { width:100%; box-sizing:border-box; padding:10px 12px; background:#060c18; border:1px solid #1e2d45; border-radius:8px; font-size:13px; color:#c8d8ed; resize:vertical; outline:none; font-family:'IBM Plex Mono',monospace; line-height:1.6; transition:border-color .15s; }
        .iaai-ta:focus { border-color:#3b82f6; }
        .iaai-select { flex:1; padding:7px 10px; background:#060c18; border:1px solid #1e2d45; border-radius:7px; font-size:13px; color:#c8d8ed; font-family:'DM Sans',sans-serif; outline:none; cursor:pointer; }

        .iaai-results-wrap { border:1px solid #1a2540; border-radius:8px; overflow:hidden; max-height:260px; overflow-y:auto; }
        .iaai-results-wrap table { width:100%; border-collapse:collapse; font-size:13px; }
        .iaai-results-wrap thead th { padding:8px 14px; text-align:left; font-size:11px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:.06em; background:#0a0f1a; border-bottom:1px solid #1a2540; position:sticky; top:0; z-index:1; }
        .iaai-results-wrap tbody tr { border-bottom:1px solid #0f1a2c; }
        .iaai-results-wrap tbody tr:last-child { border-bottom:none; }
        .iaai-results-wrap tbody td { padding:8px 14px; color:#94a3b8; }

        .enroll-table { width:100%; border-collapse:collapse; font-size:13px; }
        .enroll-table th { padding:8px 12px; text-align:left; font-size:11px; font-weight:600; color:#475569; text-transform:uppercase; letter-spacing:.06em; background:#060c18; border-bottom:1px solid #1a2540; }
        .enroll-table td { padding:8px 12px; border-bottom:1px solid #0f1a2c; color:#94a3b8; }
        .enroll-table td input[type=checkbox] { accent-color:#3b82f6; width:15px; height:15px; cursor:pointer; }

        .iaai-badge { padding:2px 9px; border-radius:99px; font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; }
        .badge-green  { background:rgba(16,185,129,.15); color:#34d399; border:1px solid rgba(16,185,129,.2); }
        .badge-red    { background:rgba(239,68,68,.15);  color:#f87171; border:1px solid rgba(239,68,68,.2); }
        .badge-blue   { background:rgba(59,130,246,.15); color:#60a5fa; border:1px solid rgba(59,130,246,.2); }
        .dot { width:7px; height:7px; border-radius:50%; display:inline-block; flex-shrink:0; }
        .dot-green  { background:#22c55e; }
        .dot-red    { background:#ef4444; }
        .dot-yellow { background:#f59e0b; }

        #iaai-modal ::-webkit-scrollbar { width:5px; }
        #iaai-modal ::-webkit-scrollbar-track { background:transparent; }
        #iaai-modal ::-webkit-scrollbar-thumb { background:#1e2d45; border-radius:99px; }
    `;
    document.head.appendChild(css);

    // ════════════════════════════════════════════════════════════════════════════
    //  PAGE 1 — manage_students.asp  →  Pull Student Numbers
    // ════════════════════════════════════════════════════════════════════════════
    if (isManagePage) {
        window.addEventListener('load', () => {
            const associateBtn = document.querySelector("button[name='Button12']");
            if (!associateBtn) return;

            const launchBtn = document.createElement('button');
            launchBtn.id = 'iaai-launcher-btn';
            launchBtn.textContent = '⚡ IAAI Workflow';
            associateBtn.parentNode.insertBefore(launchBtn, associateBtn.nextSibling);

            const overlay = document.createElement('div');
            overlay.id = 'iaai-overlay';
            document.body.appendChild(overlay);

            const modal = document.createElement('div');
            modal.id = 'iaai-modal';
            modal.innerHTML = `
                <div class="m-header">
                    <div class="m-title-row">
                        <div class="m-title">
                            <div class="m-icon">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
                                </svg>
                            </div>
                            IAAI Student Workflow
                        </div>
                        <button class="m-close" id="iaai-close">✕</button>
                    </div>
                    <div class="step-track">
                        <div class="step-item active" data-step="1"><div class="step-num">1</div><span>Pull #s</span></div>
                        <div class="step-connector"></div>
                        <div class="step-item" data-step="2"><div class="step-num">2</div><span>Enroll</span></div>
                        <div class="step-connector"></div>
                        <div class="step-item" data-step="3"><div class="step-num">3</div><span>Inject</span></div>
                        <div class="step-connector"></div>
                        <div class="step-item" data-step="4"><div class="step-num">4</div><span>Emails</span></div>
                    </div>
                </div>
                <div class="m-body" id="iaai-body">
                    <div>
                        <label class="iaai-label">Input Mode</label>
                        <select id="inputMode" class="iaai-select">
                            <option value="typed-last-first">Typing — Last, First</option>
                            <option value="excel-last-first">Excel Paste — Last ⇥ First</option>
                            <option value="typed-first-last">Typing — First Last</option>
                            <option value="excel-first-last">Excel Paste — First ⇥ Last</option>
                        </select>
                    </div>
                    <div>
                        <label class="iaai-label">Student Names</label>
                        <textarea id="studentNames" class="iaai-ta" rows="7" placeholder="Paste or type names here, one per line…"></textarea>
                    </div>
                    <div id="pullResultsWrapper" style="display:none;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                            <label class="iaai-label" style="margin:0;">Results</label>
                            <div id="pullBadges" style="display:flex;gap:6px;"></div>
                        </div>
                        <div class="iaai-results-wrap">
                            <table>
                                <thead><tr><th style="width:55%;">Name Input</th><th>Student #</th></tr></thead>
                                <tbody id="pullResultsBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div id="enrollSetupWrapper" style="display:none;">
                        <label class="iaai-label">Step 2 — Select Courses Per Student</label>
                        <div class="iaai-results-wrap">
                            <table class="enroll-table">
                                <thead><tr><th>Student #</th><th>Name</th><th style="text-align:center;">HAZ Refresher</th><th style="text-align:center;">Asbestos</th></tr></thead>
                                <tbody id="enrollTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div class="m-footer">
                    <span class="m-status" id="iaai-status"></span>
                    <button class="iaai-btn iaai-btn-ghost" id="iaai-cancel">Cancel</button>
                    <button class="iaai-btn iaai-btn-sky" id="copyNumbersBtn" style="display:none;">⎘ Copy #s</button>
                    <button class="iaai-btn iaai-btn-primary" id="pullStudentsBtn">Pull Student #s</button>
                    <button class="iaai-btn iaai-btn-warning" id="startWorkflowBtn" style="display:none;">▶ Start Enrollment →</button>
                </div>
            `;
            document.body.appendChild(modal);

            function setSteps(active) {
                modal.querySelectorAll('.step-item').forEach(el => {
                    const n = +el.dataset.step;
                    el.className = 'step-item' + (n < active ? ' done' : n === active ? ' active' : '');
                });
            }
            function openModal() {
                overlay.style.display = 'block';
                modal.style.display = 'flex';
                document.getElementById('studentNames').value = '';
                document.getElementById('pullResultsWrapper').style.display = 'none';
                document.getElementById('enrollSetupWrapper').style.display = 'none';
                document.getElementById('pullResultsBody').innerHTML = '';
                document.getElementById('copyNumbersBtn').style.display = 'none';
                document.getElementById('startWorkflowBtn').style.display = 'none';
                document.getElementById('pullStudentsBtn').style.display = '';
                document.getElementById('iaai-status').textContent = '';
                document.getElementById('pullBadges').innerHTML = '';
                setSteps(1);
            }
            function closeModal() { overlay.style.display = 'none'; modal.style.display = 'none'; }

            launchBtn.addEventListener('click', openModal);
            overlay.addEventListener('click', closeModal);
            document.getElementById('iaai-close').addEventListener('click', closeModal);
            document.getElementById('iaai-cancel').addEventListener('click', closeModal);

            const ta = document.getElementById('studentNames');
            ta.addEventListener('focus', () => ta.style.borderColor = '#3b82f6');
            ta.addEventListener('blur',  () => ta.style.borderColor = '#1e2d45');

            document.getElementById('pullStudentsBtn').addEventListener('click', () => {
                const input = ta.value.trim();
                if (!input) { ta.style.borderColor = '#ef4444'; ta.focus(); return; }
                ta.style.borderColor = '#1e2d45';

                const inputMode = document.getElementById('inputMode').value;
                const nameLines = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                const rows = document.querySelectorAll('#studentsTable tbody tr');
                let studentNumbers = [], foundCount = 0, notFoundCount = 0;
                const tbody = document.getElementById('pullResultsBody');
                tbody.innerHTML = '';

                nameLines.forEach(line => {
                    let last = '', first = '';
                    if (inputMode === 'typed-last-first') {
                        const p = line.split(','); if (p.length < 2) { appendPullRow(tbody, line, 'Invalid format', 'invalid'); return; }
                        last = p[0].trim().toLowerCase(); first = p.slice(1).join(',').trim().toLowerCase();
                    } else if (inputMode === 'excel-last-first') {
                        const p = line.split('\t'); if (p.length < 2) { appendPullRow(tbody, line, 'Invalid format', 'invalid'); return; }
                        last = p[0].trim().toLowerCase(); first = p.slice(1).join(' ').trim().toLowerCase();
                    } else if (inputMode === 'typed-first-last') {
                        const p = line.split(' '); if (p.length < 2) { appendPullRow(tbody, line, 'Invalid format', 'invalid'); return; }
                        first = p[0].trim().toLowerCase(); last = p.slice(1).join(' ').trim().toLowerCase();
                    } else if (inputMode === 'excel-first-last') {
                        const p = line.split('\t'); if (p.length < 2) { appendPullRow(tbody, line, 'Invalid format', 'invalid'); return; }
                        first = p[0].trim().toLowerCase(); last = p.slice(1).join(' ').trim().toLowerCase();
                    }

                    const tokens = [first, last].join(' ').split(/\s+/).map(t => t.replace(/[^a-z]/g,'')).filter(Boolean);
                    let found = false;
                    rows.forEach(row => {
                        const nc = row.querySelectorAll('td')[2];
                        if (nc) {
                            const fn = nc.textContent.replace(/\s+/g,' ').replace(/,/g,'').trim().toLowerCase().replace(/[^a-z\s]/g,'');
                            if (tokens.every(t => fn.includes(t))) {
                                const numCell = row.querySelector('td:first-child a');
                                if (numCell) {
                                    appendPullRow(tbody, line, numCell.textContent, 'found');
                                    studentNumbers.push(numCell.textContent.trim());
                                    found = true; foundCount++;
                                }
                            }
                        }
                    });
                    if (!found) { appendPullRow(tbody, line, 'Not found', 'notfound'); notFoundCount++; }
                });

                document.getElementById('pullResultsWrapper').style.display = 'block';
                document.getElementById('pullBadges').innerHTML =
                    `<span class="iaai-badge badge-green">${foundCount} found</span>` +
                    (notFoundCount > 0 ? `<span class="iaai-badge badge-red">${notFoundCount} not found</span>` : '');
                document.getElementById('iaai-status').textContent = `${nameLines.length} names processed`;

                const copyBtn = document.getElementById('copyNumbersBtn');
                if (studentNumbers.length > 0) {
                    copyBtn.style.display = 'inline-flex';
                    copyBtn.dataset.numbers = studentNumbers.join('\n');
                    buildEnrollTable(studentNumbers);
                    document.getElementById('enrollSetupWrapper').style.display = 'block';
                    document.getElementById('startWorkflowBtn').style.display = '';
                    document.getElementById('pullStudentsBtn').style.display = 'none';
                    setSteps(2);
                }
            });

            function buildEnrollTable(numbers) {
                const tbody = document.getElementById('enrollTableBody');
                tbody.innerHTML = '';

                // Build lookup: student number → display name from the page's student table
                const nameMap = {};
                document.querySelectorAll('#studentsTable tbody tr').forEach(row => {
                    const numCell = row.querySelector('td:first-child a');
                    const nameCell = row.querySelectorAll('td')[2];
                    if (numCell && nameCell) {
                        nameMap[numCell.textContent.trim()] = nameCell.textContent.replace(/\s+/g, ' ').trim();
                    }
                });

                numbers.forEach(id => {
                    const name = nameMap[id] || '';
                    const tr = document.createElement('tr');
                    tr.dataset.student = id;
                    tr.innerHTML = `
                        <td style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:#60a5fa;">${id}</td>
                        <td style="font-size:12px;color:#94a3b8;">${name}</td>
                        <td style="text-align:center;"><input type="checkbox" class="haz"></td>
                        <td style="text-align:center;"><input type="checkbox" class="asb"></td>`;
                    tbody.appendChild(tr);
                });
            }

            document.getElementById('copyNumbersBtn').addEventListener('click', function () {
                navigator.clipboard.writeText(this.dataset.numbers).then(() => {
                    this.textContent = '✓ Copied!';
                    this.style.background = 'linear-gradient(135deg,#059669,#10b981)';
                    setTimeout(() => { this.innerHTML = '⎘ Copy #s'; this.style.background = ''; }, 1800);
                });
            });

            document.getElementById('startWorkflowBtn').addEventListener('click', () => {
                const rows = document.querySelectorAll('#enrollTableBody tr');
                const students = [];
                rows.forEach(row => {
                    const courses = [];
                    if (row.querySelector('.haz').checked) courses.push('haz');
                    if (row.querySelector('.asb').checked) courses.push('asb');
                    if (courses.length) students.push({ id: row.dataset.student, courses });
                });
                if (!students.length) { alert('Select at least one course for at least one student.'); return; }

                const allNums = [...document.querySelectorAll('#enrollTableBody tr')].map(r => r.dataset.student);
                saveSession({ students, allStudentNumbers: allNums, index: 0, fromWorkflow: true });
                localStorage.setItem(KEYS.BULK_STATE, JSON.stringify({ students, index: 0 }));
                sessionStorage.setItem(KEYS.BULK_ACTIVE, '1');
                location.href = 'https://otsystems.net/admin/corporate/org_master_edit.asp?id=5166';
            });

            function appendPullRow(tbody, name, value, type) {
                const cfg = {
                    found:    { dot:'dot-green',  color:'#34d399', weight:'600' },
                    notfound: { dot:'dot-red',    color:'#f87171', weight:'500' },
                    invalid:  { dot:'dot-yellow', color:'#fbbf24', weight:'500' },
                }[type];
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${name}</td><td><span style="display:inline-flex;align-items:center;gap:6px;color:${cfg.color};font-weight:${cfg.weight};"><span class="dot ${cfg.dot}"></span>${value}</span></td>`;
                tbody.appendChild(tr);
            }
        });
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  PAGE 2 — org_master_edit.asp  →  Redirect to first student dashboard
    // ════════════════════════════════════════════════════════════════════════════
    if (isOrgPage) {
        if (!sessionStorage.getItem(KEYS.BULK_ACTIVE)) return;
        const state = JSON.parse(localStorage.getItem(KEYS.BULK_STATE));
        if (!state?.students?.length) return;
        location.href = `/admin/students/dashboard/?student_number=${state.students[0].id}`;
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  PAGE 3 — students/dashboard  →  Bulk Enrollment Automation
    // ════════════════════════════════════════════════════════════════════════════
    if (isStudentPage) {
        if (!sessionStorage.getItem(KEYS.BULK_ACTIVE)) return;
        const state = JSON.parse(localStorage.getItem(KEYS.BULK_STATE));
        if (!state) { sessionStorage.removeItem(KEYS.BULK_ACTIVE); return; }

        const current = state.students[state.index];
        window.confirm = msg => { console.log('Auto-confirmed:', msg); return true; };

        const hud = document.createElement('div');
        hud.style.cssText = `position:fixed;bottom:20px;right:20px;background:#0d1117;color:#e2e8f0;border:1px solid #1e2d45;padding:14px 18px;border-radius:10px;font-size:13px;z-index:99999;font-family:'DM Sans',sans-serif;min-width:280px;line-height:1.7;box-shadow:0 8px 32px rgba(0,0,0,.5);`;
        document.body.appendChild(hud);

        function updateHUD(msg, isError = false) {
            const pct = Math.round((state.index / state.students.length) * 100);
            hud.innerHTML = `
                <div style="font-weight:700;margin-bottom:8px;color:#f0f6ff;font-size:13px;">⚡ Bulk Enrollment</div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#475569;margin-bottom:4px;">
                    Student ${state.index + 1} of ${state.students.length} · ID: ${current.id}
                </div>
                <div style="height:3px;background:#1a2540;border-radius:99px;margin-bottom:10px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#1d4ed8,#60a5fa);transition:width .4s;"></div>
                </div>
                <span style="color:${isError ? '#f87171' : '#34d399'};font-size:12px;">${msg}</span>`;
        }

        function waitFor(fn, timeout = 12000) {
            return new Promise(async resolve => {
                const end = Date.now() + timeout;
                while (Date.now() < end) {
                    const el = typeof fn === 'function' ? fn() : document.querySelector(fn);
                    if (el) return resolve(el);
                    await sleep(250);
                }
                resolve(null);
            });
        }
        function waitForGone(fn, timeout = 12000) {
            return new Promise(async resolve => {
                const end = Date.now() + timeout;
                while (Date.now() < end) {
                    const el = typeof fn === 'function' ? fn() : document.querySelector(fn);
                    if (!el) return resolve(true);
                    await sleep(250);
                }
                resolve(false);
            });
        }
        async function closeModalIfOpen() {
            const btn = document.querySelector('button[ng-click="emc.Cancel()"]');
            if (btn) { btn.click(); await waitForGone('button[ng-click="emc.Cancel()"]', 5000); await sleep(500); }
        }
        async function clickClassesTab() {
            updateHUD('Opening Classes tab…');
            const tab = await waitFor(() => [...document.querySelectorAll('a[ng-click="select($event)"]')].find(a => a.textContent.trim().startsWith('Classes')));
            if (tab) { tab.click(); await sleep(1500); }
        }
        async function enrollCourse(courseType) {
            const label = courseType === 'haz' ? 'HAZ Refresher' : 'Asbestos';
            updateHUD(`Starting ${label}…`);
            await closeModalIfOpen();

            const enrollBtn = await waitFor('button[ng-click="cc.EnrollStart()"]');
            if (!enrollBtn) { updateHUD('❌ Enroll button not found', true); return false; }
            enrollBtn.click(); await sleep(1000);

            if (!await waitFor('[ng-repeat="cat in emc.Catalog"]')) { updateHUD('❌ Catalog not loaded', true); await closeModalIfOpen(); return false; }
            await sleep(500);

            const courseRow = await waitFor(() => {
                for (const row of document.querySelectorAll('[ng-repeat="cc in cat.Classes | limitTo: emc.PageSize"]')) {
                    const name = row.querySelector('span[ng-bind-html="cc.display_name"]')?.textContent || '';
                    if (courseType === 'haz' && /HAZWOPER/i.test(name)) return row;
                    if (courseType === 'asb' && /Asbestos/i.test(name)) return row;
                }
                return null;
            });
            if (!courseRow) { updateHUD(`❌ ${label} not found in catalog`, true); await closeModalIfOpen(); return false; }

            const rowBtn = courseRow.querySelector('button[ng-click^="emc.PickVersion"],button[ng-click^="emc.SelectClass"]');
            if (!rowBtn) { updateHUD('❌ No action button', true); await closeModalIfOpen(); return false; }

            const needsVersion = rowBtn.getAttribute('ng-click').includes('PickVersion');
            rowBtn.click(); await sleep(1000);

            if (needsVersion) {
                const vBtn = await waitFor('button[ng-click^="vmc.PickVersion"]');
                if (!vBtn) { updateHUD('❌ Version picker missing', true); await closeModalIfOpen(); return false; }
                vBtn.click(); await sleep(1000);
            }

            const saveBtn = await waitFor('button[ng-click="emc.Save()"]');
            if (!saveBtn) { updateHUD('❌ Save button missing', true); await closeModalIfOpen(); return false; }
            saveBtn.click();
            await waitForGone('button[ng-click="emc.Save()"]', 10000);
            await sleep(2000);
            updateHUD(`${label} ✓`);
            return true;
        }

        await sleep(2000);
        await clickClassesTab();

        const results = [];
        for (const courseType of current.courses) {
            results.push({ courseType, ok: await enrollCourse(courseType) });
            await sleep(2000);
        }

        updateHUD(`Done — ${results.map(r => `${r.courseType === 'haz' ? 'HAZ' : 'ASB'}: ${r.ok ? '✓' : '✗'}`).join(' | ')}`);
        await sleep(2000);

        state.index++;
        if (state.index < state.students.length) {
            localStorage.setItem(KEYS.BULK_STATE, JSON.stringify(state));
            sessionStorage.setItem(KEYS.BULK_ACTIVE, '1');
            location.href = `/admin/students/dashboard/?student_number=${state.students[state.index].id}`;
        } else {
            localStorage.removeItem(KEYS.BULK_STATE);
            sessionStorage.removeItem(KEYS.BULK_ACTIVE);
            updateHUD('✅ All enrolled! Navigating to email step…');
            await sleep(2500);
            hud.remove();
            location.href = 'https://otsystems.net/admin/Marketing/previewtemplate.asp?id=7';
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  PAGE 4 — previewtemplate.asp  →  Step 3: Email Injector + Step 4: Fetch Emails
    // ════════════════════════════════════════════════════════════════════════════
    if (isEmailPage) {

        // ── Shared helpers ────────────────────────────────────────────────────
        function escapeHtml(str) {
            return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
        }
        function extractPlaceholders(html) {
            const re = /\[([a-zA-Z0-9_\-]+)\]/g, found = new Set(); let m;
            while ((m = re.exec(html)) !== null) found.add(m[1]);
            return Array.from(found);
        }
        function findTemplateEl() {
            return Array.from(document.querySelectorAll('body *')).find(el => el.innerHTML?.match(/\[[a-zA-Z0-9_\-]+\]/));
        }
        function normalizeAccount(s) {
            const d = s.replace(/\D/g,'');
            return d.length === 16 ? d.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, '$1-$2-$3-$4') : s.trim();
        }

        const phMap = {
            student_name:   ['student_name','studentname','student-name'],
            username:       ['username','user_name','user-name'],
            account_number: ['account_number','accountnumber','account-number','account#','a#','a_number'],
        };
        function toCanonical(alias) {
            alias = String(alias||'').toLowerCase();
            for (const [c,aliases] of Object.entries(phMap)) if (aliases.includes(alias)) return c;
            return alias;
        }

        async function fetchDashboard(sNum) {
            const r = await fetch(`/admin/students/dashboard/?student_number=${encodeURIComponent(sNum)}`, { credentials:'include' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
        }

        function parseDashboard(html, needed) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const result = {};

            if (needed.includes('account_number')) {
                const body = doc.body?.textContent || '';
                let acc = null;
                const m1 = body.match(/A[#\uFF03][:]?\s*([0-9][0-9\-\s]{6,})/i);
                if (m1) acc = m1[1];
                if (!acc) { const m2 = body.match(/\b(?:Account\s*#|A[#\s:]{1,3})\s*([0-9\-\s]{4,})/i); if (m2) acc = m2[1]; }
                result.account_number = acc ? normalizeAccount(acc.replace(/[^0-9]/g,'') || acc) : '(Account number not found)';
            }

            if (needed.includes('student_name')) {
                const h4 = doc.querySelector('.col-sm-8.col-md-8.col-lg-9 h4') || doc.querySelector('h4');
                result.student_name = h4 ? h4.textContent.replace(/\s+/g,' ').trim().split('•')[0].trim() : '';
            }

            for (const row of doc.querySelectorAll('table tr')) {
                const th = row.querySelector('th'), td = row.querySelector('td');
                if (!th || !td) continue;
                const key = th.textContent.trim(), val = td.textContent.trim();
                if (needed.includes('username')   && /Username:/i.test(key))   result.username   = val;
                if (needed.includes('first_name') && /First Name/i.test(key))  result.first_name = val;
                if (needed.includes('last_name')  && /Last Name/i.test(key))   result.last_name  = val;
            }

            if (needed.includes('student_name') && !result.student_name && result.first_name && result.last_name)
                result.student_name = `${result.first_name} ${result.last_name}`;

            return result;
        }

        function replacePlaceholders(templateHtml, placeholders, data, overrideControls) {
            let filled = templateHtml;
            placeholders.forEach(ph => {
                const canon = toCanonical(ph);
                let val;
                if (['student_name','username','account_number'].includes(canon)) {
                    val = data[canon] ?? `[${ph}]`;
                } else if (overrideControls[ph]) {
                    const ctrl = overrideControls[ph];
                    val = ctrl.checkboxEl?.checked ? (data[ph] ?? `[${ph}]`) : (ctrl.inputEl.value || `[${ph}]`);
                } else {
                    val = `[${ph}]`;
                }
                filled = filled.replace(new RegExp(`\\[${ph}\\]`, 'g'), escapeHtml(String(val)));
            });

            if (document.getElementById('iaai-fire-arson')?.checked) {
                filled = filled.replace(
                    /<p[^>]*>\s*As a corporate user,[\s\S]*?<\/p>/i,
                    `<p style="margin:0 0 1.6em 0;font-size:13px;color:#444444;font-family:Arial,Helvetica,sans-serif;">It is important that you access your <strong>Student Home Page</strong> as a <strong>Returning Student</strong> through your <strong>IAAI Member Benefit homepage</strong> whenever possible.&nbsp;<a href="https://www.safetyunlimited.com/firearson" style="color:#3568CE"><strong>www.safetyunlimited.com/firearson</strong></a></p>`
                );
                const iaaiMsg = `<p style="margin:0 0 15px 0;font-style:italic;color:#333;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;">The International Association of Arson Investigators is pleased to be working in partnership with Safety Unlimited to offer our members a 50% discount on Asbestos Awareness and HAZWOPER refresher courses provided through Safety Unlimited. These training offerings support IAAI's commitment to enhancing safety education for fire and explosion investigation professionals, ensuring you remain prepared to safely conduct investigations in hazardous environments.</p>`;
                const dirPattern = /<p style="margin:\s*0 0 1\.6em 0; font-size:13px;font-family:Arial, Helvetica, sans-serif;">As the Training Director[\s\S]*?<\/p>/;
                filled = dirPattern.test(filled) ? filled.replace(dirPattern, iaaiMsg + '$&') : iaaiMsg + filled;
                const sigHtml = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;"><tr><td valign="top" style="font-family:'Brush Script MT',cursive;font-size:22px;color:#000000;padding-right:10px;">Jules Griggs<div style="font-family:Arial,sans-serif;font-size:13px;color:#333333;margin-top:2px;">Training Director<br>Safety Unlimited, Inc.</div></td><td valign="bottom"><table cellpadding="0" cellspacing="0" border="0"><tr><td><img src="https://raw.githubusercontent.com/evanmmoore/IAAI-Email-Images/25c073549e09d44865aea9531d066f6101604732/signature.jpg" alt="IAAI President Signature" width="200" height="60" style="display:block;"></td><td width="10"></td><td><img src="https://raw.githubusercontent.com/evanmmoore/IAAI-Email-Images/25c073549e09d44865aea9531d066f6101604732/logo.jpg" alt="IAAI Logo" width="114" height="72" style="display:block;"></td></tr></table></td></tr></table>`;
                filled = filled.replace(/<p style="margin:0; font-size:13px; color:#333333;font-family:Arial, Helvetica, sans-serif;"><strong>Jules Griggs<br>Training Director<br>Safety Unlimited, Inc\.<\/strong><\/p>/, sigHtml);
            }
            return filled;
        }

        async function loadJSZip() {
            if (window.JSZip) return window.JSZip;
            return new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.5.0/jszip.min.js';
                s.onload = () => res(window.JSZip);
                s.onerror = () => rej(new Error('JSZip load failed'));
                document.head.appendChild(s);
            });
        }

        const session = getSession();
        const fromWorkflow = !!session.fromWorkflow;
        const workflowNumbers = session.allStudentNumbers || [];

        window.addEventListener('load', () => {

            // ── Floating step tracker ────────────────────────────────────────
            const stepBar = document.createElement('div');
            stepBar.style.cssText = `position:fixed;top:10px;right:10px;z-index:99998;display:flex;align-items:center;gap:0;background:#0a0f1a;border:1px solid #1e2d45;border-radius:10px;padding:8px 14px;font-family:'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4);`;
            stepBar.innerHTML = `
                <div class="step-item${fromWorkflow ? ' done' : ''}"  data-step="1"><div class="step-num">1</div><span>Pull #s</span></div>
                <div class="step-connector"></div>
                <div class="step-item${fromWorkflow ? ' done' : ''}"  data-step="2"><div class="step-num">2</div><span>Enroll</span></div>
                <div class="step-connector"></div>
                <div class="step-item active" data-step="3" id="sb-step3"><div class="step-num">3</div><span>Inject</span></div>
                <div class="step-connector"></div>
                <div class="step-item" data-step="4" id="sb-step4"><div class="step-num">4</div><span>Emails</span></div>
            `;
            document.body.appendChild(stepBar);

            // ── Open button ──────────────────────────────────────────────────
            const openBtn = document.createElement('button');
            openBtn.style.cssText = `position:fixed;top:54px;right:10px;z-index:99998;padding:8px 16px;border-radius:7px;border:none;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 10px rgba(37,99,235,.3);transition:opacity .15s;`;
            openBtn.textContent = '⚡ Email Tools';
            document.body.appendChild(openBtn);

            // ── Panel ────────────────────────────────────────────────────────
            const panel = document.createElement('div');
            panel.style.cssText = `position:fixed;top:96px;right:10px;width:460px;max-height:82vh;background:#0d1117;border:1px solid #1e2d45;border-radius:14px;z-index:99997;display:none;flex-direction:column;overflow:hidden;font-family:'DM Sans',sans-serif;color:#e2e8f0;box-shadow:0 16px 48px rgba(0,0,0,.6);`;

            panel.innerHTML = `
                <div style="padding:13px 16px 11px;border-bottom:1px solid #1a2540;background:#0a0f1a;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <div style="font-size:14px;font-weight:700;color:#f0f6ff;" id="panel-title">Step 3 — Email Injector</div>
                        <div style="font-size:11px;color:#475569;font-family:'IBM Plex Mono',monospace;margin-top:2px;" id="panel-subtitle">Generate &amp; inject personalized emails per student</div>
                    </div>
                    <button id="panel-close" style="background:#1e2d3d;border:none;color:#64748b;font-size:13px;cursor:pointer;border-radius:5px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
                </div>

                <div style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;min-height:0;" id="panel-body">

                    <!-- ── STEP 3: INJECTOR ── -->
                    <div id="injector-section">
                        <label class="iaai-label">Student Numbers</label>
                        <textarea id="inj-student-input" class="iaai-ta" rows="4" placeholder="One per line…"></textarea>

                        <div id="inj-ph-overrides" style="margin-top:10px;padding:10px 12px;background:#060c18;border:1px solid #1a2540;border-radius:8px;max-height:150px;overflow-y:auto;">
                            <em style="color:#475569;font-size:12px;">Loading placeholders…</em>
                        </div>

                        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" id="iaai-fire-arson" style="accent-color:#3b82f6;width:14px;height:14px;cursor:pointer;">
                            <label for="iaai-fire-arson" style="font-size:12px;color:#94a3b8;cursor:pointer;">Include Fire &amp; Arson IAAI notice</label>
                        </div>

                        <button class="iaai-btn iaai-btn-primary" id="inj-generate-btn" style="width:100%;margin-top:10px;">▶ Generate Emails</button>

                        <div id="inj-status" style="margin-top:8px;font-size:11px;color:#475569;font-family:'IBM Plex Mono',monospace;min-height:16px;"></div>
                        <div id="inj-prog-wrap" style="display:none;margin-top:2px;">
                            <div style="height:3px;background:#1a2540;border-radius:99px;overflow:hidden;">
                                <div id="inj-prog-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#1d4ed8,#60a5fa);transition:width .3s;"></div>
                            </div>
                        </div>

                        <div id="inj-results" style="margin-top:10px;display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;"></div>

                        <div id="inj-actions" style="display:none;margin-top:10px;gap:8px;">
                            <button class="iaai-btn iaai-btn-sky" id="inj-inject-btn" style="flex:1;">⎘ Inject Last</button>
                            <button class="iaai-btn iaai-btn-success" id="inj-download-btn" style="flex:1;">⬇ Download ZIP</button>
                        </div>
                    </div>

                    <!-- ── STEP 4: FETCH EMAILS (hidden until ZIP downloaded) ── -->
                    <div id="fetch-section" style="display:none;border-top:1px solid #1a2540;padding-top:14px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                            <span class="iaai-badge badge-green">Step 4</span>
                            <span style="font-size:13px;font-weight:600;color:#f0f6ff;">Fetch Student Emails</span>
                        </div>
                        <label class="iaai-label">Student Numbers</label>
                        <textarea id="fetch-input" class="iaai-ta" rows="3" placeholder="One per line…"></textarea>
                        <div style="display:flex;gap:8px;margin-top:8px;">
                            <button class="iaai-btn iaai-btn-primary" id="fetch-run-btn" style="flex:1;">▶ Fetch Emails</button>
                            <button class="iaai-btn iaai-btn-sky" id="fetch-export-btn" style="flex:1;display:none;">⬇ Export CSV</button>
                        </div>
                        <div id="fetch-status" style="margin-top:8px;font-size:11px;color:#475569;font-family:'IBM Plex Mono',monospace;min-height:16px;"></div>
                        <div id="fetch-prog-wrap" style="display:none;margin-top:2px;">
                            <div style="height:3px;background:#1a2540;border-radius:99px;overflow:hidden;">
                                <div id="fetch-prog-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#059669,#34d399);transition:width .3s;"></div>
                            </div>
                        </div>
                        <div id="fetch-results" style="margin-top:10px;max-height:200px;overflow-y:auto;"></div>
                    </div>

                </div>

                <div style="padding:8px 16px;border-top:1px solid #1a2540;background:#0a0f1a;flex-shrink:0;">
                    <span id="panel-footer-status" style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#475569;"></span>
                </div>
            `;
            document.body.appendChild(panel);

            // Scrollbars
            const ps = document.createElement('style');
            ps.textContent = `#panel-body::-webkit-scrollbar,#fetch-results::-webkit-scrollbar,#inj-results::-webkit-scrollbar{width:5px}#panel-body::-webkit-scrollbar-thumb,#fetch-results::-webkit-scrollbar-thumb,#inj-results::-webkit-scrollbar-thumb{background:#1e2d45;border-radius:99px}`;
            document.head.appendChild(ps);

            openBtn.addEventListener('click', () => { panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex'; });
            document.getElementById('panel-close').addEventListener('click', () => { panel.style.display = 'none'; });

            // ── Pre-populate from workflow ────────────────────────────────────
            if (fromWorkflow && workflowNumbers.length) {
                document.getElementById('inj-student-input').value = workflowNumbers.join('\n');
                document.getElementById('iaai-fire-arson').checked = true;
                panel.style.display = 'flex';
                document.getElementById('panel-footer-status').textContent = `${workflowNumbers.length} students loaded from workflow`;
            }

            // ── Load placeholder UI ──────────────────────────────────────────
            let overrideControls = {};
            function loadPlaceholderUI() {
                const templateEl = findTemplateEl();
                const overridesDiv = document.getElementById('inj-ph-overrides');
                if (!templateEl) { overridesDiv.innerHTML = '<em style="color:#475569;font-size:12px;">No template placeholders found.</em>'; return; }
                const placeholders = extractPlaceholders(templateEl.innerHTML);
                if (!placeholders.length) { overridesDiv.innerHTML = '<em style="color:#475569;font-size:12px;">No placeholders found.</em>'; return; }
                overridesDiv.innerHTML = '';
                overrideControls = {};
                placeholders.forEach(ph => {
                    const canon = toCanonical(ph);
                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;';
                    if (['student_name','username','account_number'].includes(canon)) {
                        const lbl = document.createElement('label');
                        lbl.style.cssText = 'font-size:11px;color:#3b82f6;font-family:"IBM Plex Mono",monospace;white-space:nowrap;';
                        lbl.textContent = `[${ph}] — auto`;
                        const inp = document.createElement('input');
                        inp.type = 'text'; inp.readOnly = true;
                        inp.style.cssText = 'flex:1;min-width:80px;padding:3px 6px;background:#060c18;border:1px solid #1e2d45;border-radius:5px;color:#60a5fa;font-family:"IBM Plex Mono",monospace;font-size:11px;';
                        row.append(lbl, inp);
                        overrideControls[ph] = { inputEl: inp, checkboxEl: null };
                    } else {
                        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.style.accentColor = '#3b82f6';
                        const lbl = document.createElement('label'); lbl.style.cssText = 'font-size:12px;color:#94a3b8;'; lbl.textContent = `[${ph}]`;
                        const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = `Override…`;
                        inp.style.cssText = 'flex:1;min-width:80px;padding:3px 6px;background:#060c18;border:1px solid #1e2d45;border-radius:5px;color:#c8d8ed;font-size:12px;';
                        row.append(cb, lbl, inp);
                        overrideControls[ph] = { checkboxEl: cb, inputEl: inp };
                    }
                    overridesDiv.appendChild(row);
                });
            }
            loadPlaceholderUI();

            // ── Generate ─────────────────────────────────────────────────────
            let generatedEmails = [];

            document.getElementById('inj-generate-btn').addEventListener('click', async () => {
                generatedEmails = [];
                const resultsDiv = document.getElementById('inj-results');
                resultsDiv.innerHTML = '';
                document.getElementById('inj-actions').style.display = 'none';
                document.getElementById('inj-status').textContent = '';

                const numbers = [...new Set(document.getElementById('inj-student-input').value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean))];
                if (!numbers.length) { document.getElementById('inj-status').textContent = 'Enter at least one student number.'; return; }

                const templateEl = findTemplateEl();
                if (!templateEl) { document.getElementById('inj-status').textContent = 'No template found on page.'; return; }
                const templateHtml = templateEl.innerHTML;
                const placeholders = extractPlaceholders(templateHtml);

                document.getElementById('inj-prog-wrap').style.display = 'block';
                const progFill = document.getElementById('inj-prog-fill');

                for (let i = 0; i < numbers.length; i++) {
                    const sNum = numbers[i];
                    progFill.style.width = `${Math.round((i / numbers.length) * 100)}%`;
                    document.getElementById('inj-status').textContent = `Fetching ${i + 1} / ${numbers.length}…`;

                    const card = document.createElement('div');
                    card.style.cssText = 'background:#060c18;border:1px solid #1a2540;border-radius:7px;padding:8px 10px;font-size:12px;';
                    card.innerHTML = `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#475569;">#${sNum} — fetching…</div>`;
                    resultsDiv.appendChild(card);
                    resultsDiv.scrollTop = resultsDiv.scrollHeight;

                    try {
                        const html = await fetchDashboard(sNum);
                        const needed = Array.from(new Set(placeholders.map(toCanonical)));
                        const data = parseDashboard(html, needed);
                        const filled = replacePlaceholders(templateHtml, placeholders, data, overrideControls);

                        placeholders.forEach(ph => {
                            const canon = toCanonical(ph);
                            const ctrl = overrideControls[ph];
                            if (ctrl?.inputEl && ['student_name','username','account_number'].includes(canon))
                                ctrl.inputEl.value = data[canon] ?? '';
                        });

                        templateEl.innerHTML = filled;
                        card.innerHTML = `
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                                <span class="dot dot-green"></span>
                                <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#34d399;font-weight:600;">#${sNum}</span>
                                <span style="font-size:11px;color:#475569;">${data.student_name || ''}</span>
                            </div>
                            <div style="font-size:11px;color:#475569;">acct: ${data.account_number||'—'} · user: ${data.username||'—'}</div>`;
                        generatedEmails.push({ studentNumber: sNum, html: filled });
                    } catch (err) {
                        card.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><span class="dot dot-red"></span><span style="font-size:12px;color:#f87171;">#${sNum} — ${err.message}</span></div>`;
                    }
                }

                progFill.style.width = '100%';
                document.getElementById('inj-status').textContent = `${generatedEmails.length} / ${numbers.length} emails generated`;
                if (generatedEmails.length) {
                    const actDiv = document.getElementById('inj-actions');
                    actDiv.style.display = 'flex';
                }
            });

            document.getElementById('inj-inject-btn').addEventListener('click', () => {
                if (!generatedEmails.length) return;
                const last = generatedEmails[generatedEmails.length - 1];
                const templateEl = findTemplateEl();
                if (templateEl) templateEl.innerHTML = last.html;
                document.getElementById('inj-status').textContent = `Injected #${last.studentNumber} into template.`;
            });

            // ── Download ZIP → reveal step 4 ─────────────────────────────────
            document.getElementById('inj-download-btn').addEventListener('click', async () => {
                if (!generatedEmails.length) return;
                const JSZip = await loadJSZip();
                const zip = new JSZip();
                generatedEmails.forEach(e => {
                    zip.file(`${e.studentNumber}.html`, `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${e.html}</body></html>`);
                });
                const blob = await zip.generateAsync({ type: 'blob' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'all_emails.zip';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);

                // Reveal step 4
                const fetchSection = document.getElementById('fetch-section');
                fetchSection.style.display = 'block';
                setTimeout(() => fetchSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);

                // Advance step tracker
                document.getElementById('sb-step3').className = 'step-item done';
                document.getElementById('sb-step4').className = 'step-item active';
                document.getElementById('panel-footer-status').textContent = 'ZIP downloaded ✓ — Step 4 ready';
                document.getElementById('panel-title').textContent = 'Step 4 — Fetch Emails';
                document.getElementById('panel-subtitle').textContent = 'Retrieve primary + secondary emails, export CSV';

                // Pre-fill step 4 with the same numbers
                const injNums = [...new Set(document.getElementById('inj-student-input').value.split(/[\s,]+/).map(s => s.trim()).filter(Boolean))];
                document.getElementById('fetch-input').value = injNums.join('\n');
            });

            // ── Step 4: Fetch Emails ─────────────────────────────────────────
            let fetchResults = [];

            async function fetchEmailForStudent(sNum) {
                const r = await fetch(`/admin/students/dashboard/?student_number=${encodeURIComponent(sNum)}`, { credentials: 'include' });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const html = await r.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                let primary = null, secondary = null;
                for (const row of doc.querySelectorAll('table tr')) {
                    const th = row.querySelector('th'), td = row.querySelector('td');
                    if (!th || !td) continue;
                    const key = th.textContent.trim().toLowerCase();
                    const mailto = td.querySelector('a[href^="mailto:"]');
                    const val = mailto ? mailto.getAttribute('href').replace(/^mailto:/i,'').trim() : td.textContent.trim();
                    if (key.includes('email:') && !key.includes('alt') && !primary) primary = val || null;
                    else if ((key.includes('alt email:') || key.includes('secondary email:') || key.includes('alt. email:')) && !secondary) secondary = val || null;
                }
                if (!secondary) {
                    const links = [...doc.querySelectorAll('a[href^="mailto:"]')];
                    if (links.length > 1) secondary = links[1].getAttribute('href').replace(/^mailto:/i,'').trim();
                }
                return { primary, secondary };
            }

            document.getElementById('fetch-run-btn').addEventListener('click', async () => {
                fetchResults = [];
                const resultsDiv = document.getElementById('fetch-results');
                resultsDiv.innerHTML = '';
                document.getElementById('fetch-export-btn').style.display = 'none';
                document.getElementById('fetch-status').textContent = '';

                const numbers = [...new Set(document.getElementById('fetch-input').value.split(/[\s,\n]+/).map(s => s.trim()).filter(Boolean))];
                if (!numbers.length) { document.getElementById('fetch-status').textContent = 'Enter student numbers.'; return; }

                document.getElementById('fetch-prog-wrap').style.display = 'block';
                const progFill = document.getElementById('fetch-prog-fill');

                for (let i = 0; i < numbers.length; i++) {
                    const sNum = numbers[i];
                    progFill.style.width = `${Math.round((i / numbers.length) * 100)}%`;
                    document.getElementById('fetch-status').textContent = `Fetching ${i + 1} / ${numbers.length}…`;

                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid #0f1a2c;font-size:12px;';
                    row.innerHTML = `<span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#475569;min-width:62px;padding-top:1px;">#${sNum}</span><span style="color:#475569;font-style:italic;">Fetching…</span>`;
                    resultsDiv.appendChild(row);
                    resultsDiv.scrollTop = resultsDiv.scrollHeight;

                    try {
                        const emails = await fetchEmailForStudent(sNum);
                        const valSpan = row.querySelector('span:last-child');
                        if (!emails.primary && !emails.secondary) {
                            valSpan.style.color = '#374151'; valSpan.textContent = 'No email found';
                        } else {
                            valSpan.style.cssText = 'color:#60a5fa;font-style:normal;';
                            valSpan.innerHTML = `${emails.primary ? `<div>✉ ${emails.primary}</div>` : ''}${emails.secondary ? `<div style="color:#475569;font-size:11px;">Alt: ${emails.secondary}</div>` : ''}`;
                            fetchResults.push({ id: sNum, primary: emails.primary||'', secondary: emails.secondary||'' });
                        }
                    } catch (err) {
                        row.querySelector('span:last-child').innerHTML = `<span style="color:#f87171;">Error: ${err.message}</span>`;
                    }
                }

                progFill.style.width = '100%';
                document.getElementById('fetch-status').textContent = `${fetchResults.length} of ${numbers.length} emails found`;
                if (fetchResults.length) document.getElementById('fetch-export-btn').style.display = '';
                clearSession();
            });

            document.getElementById('fetch-export-btn').addEventListener('click', () => {
                const csv = 'student_number,primary_email,secondary_email\n' +
                    fetchResults.map(r => `${r.id},${r.primary},${r.secondary}`).join('\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                a.download = 'student_emails.csv';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
            });

        }); // end load
    }

})();