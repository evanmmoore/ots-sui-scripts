// ==UserScript==
// @name         Pull Student Numbers with Excel/Typing Mode
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Pull student numbers from table; supports typed input or Excel paste; copy all numbers easily
// @author       You
// @match        https://otsystems.net/admin/corporate/manage_students.asp?id=*
// @match        https://www.otsystems.net/admin/corporate/manage_students.asp?id=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.addEventListener('load', function() {

        const associateBtn = document.querySelector("button[name='Button12']");
        if (!associateBtn) return;

        // ── Trigger Button ──────────────────────────────────────────────
        const pullBtn = document.createElement('button');
        pullBtn.textContent = "Pull Student #s";
        pullBtn.className = "btn btn-success";
        pullBtn.style.marginLeft = "10px";
        associateBtn.parentNode.insertBefore(pullBtn, associateBtn.nextSibling);

        // ── Overlay ─────────────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(15,23,42,0.55);
            backdrop-filter: blur(3px);
            z-index: 9998;
        `;
        document.body.appendChild(overlay);

        // ── Modal ───────────────────────────────────────────────────────
        const modal = document.createElement('div');
        modal.style.cssText = `
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 560px;
            max-width: 95vw;
            max-height: 88vh;
            background: #fff;
            border-radius: 14px;
            box-shadow: 0 24px 60px rgba(15,23,42,0.18), 0 4px 12px rgba(15,23,42,0.08);
            z-index: 9999;
            flex-direction: column;
            overflow: hidden;
            font-family: 'Segoe UI', system-ui, sans-serif;
        `;

        modal.innerHTML = `
            <!-- HEADER -->
            <div style="
                padding: 18px 22px 14px;
                border-bottom: 1px solid #e2e8f0;
                background: #f8fafc;
                border-radius: 14px 14px 0 0;
                flex-shrink: 0;
            ">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="
                            width:30px; height:30px; border-radius:8px;
                            background:#2563eb; display:flex; align-items:center; justify-content:center;
                        ">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2.2">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/>
                            </svg>
                        </div>
                        <span style="font-size:16px; font-weight:700; color:#0f172a; letter-spacing:-0.01em;">Find Student Numbers</span>
                    </div>
                    <button id="closeModalBtn" style="
                        width:28px; height:28px; border-radius:6px; border:none;
                        background:#e2e8f0; cursor:pointer; display:flex;
                        align-items:center; justify-content:center; font-size:16px; color:#64748b;
                        line-height:1;
                    ">✕</button>
                </div>

                <!-- Mode Select -->
                <div style="display:flex; gap:8px; align-items:center;">
                    <label style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; white-space:nowrap;">Input Mode</label>
                    <select id="inputMode" style="
                        flex:1; padding:6px 10px; border:1px solid #cbd5e1;
                        border-radius:7px; font-size:13px; color:#1e293b;
                        background:#fff; cursor:pointer; outline:none;
                    ">
                        <option value="typed-last-first">Typing — Last, First</option>
                        <option value="excel-last-first">Excel Paste — Last ⇥ First</option>
                        <option value="typed-first-last">Typing — First Last</option>
                        <option value="excel-first-last">Excel Paste — First ⇥ Last</option>
                    </select>
                </div>
            </div>

            <!-- BODY (scrollable) -->
            <div style="flex:1; overflow-y:auto; padding:16px 22px; display:flex; flex-direction:column; gap:12px; min-height:0;">
                <div>
                    <label style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; display:block; margin-bottom:6px;">Student Names</label>
                    <textarea id="studentNames" rows="7" style="
                        width:100%; box-sizing:border-box;
                        padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px;
                        font-size:13px; color:#1e293b; resize:vertical; outline:none;
                        font-family:inherit; line-height:1.5;
                        transition: border-color 0.15s;
                    " placeholder="Paste or type names here, one per line…"></textarea>
                </div>

                <!-- Results -->
                <div id="resultsWrapper" style="display:none;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                        <label style="font-size:12px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.06em;">Results</label>
                        <div id="resultsBadges" style="display:flex; gap:6px;"></div>
                    </div>
                    <div style="
                        border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;
                        max-height:320px; overflow-y:auto;
                    ">
                        <table id="resultsTable" style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f1f5f9; position:sticky; top:0; z-index:1;">
                                    <th style="padding:9px 14px; text-align:left; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0; width:55%;">Student Name</th>
                                    <th style="padding:9px 14px; text-align:left; font-weight:600; color:#475569; border-bottom:1px solid #e2e8f0;">Student #</th>
                                </tr>
                            </thead>
                            <tbody id="resultsBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- FOOTER (sticky) -->
            <div style="
                padding:14px 22px;
                border-top:1px solid #e2e8f0;
                background:#f8fafc;
                border-radius:0 0 14px 14px;
                flex-shrink:0;
                display:flex; gap:8px; justify-content:flex-end; align-items:center;
            ">
                <span id="statusText" style="font-size:12px; color:#94a3b8; margin-right:auto;"></span>
                <button id="cancelBtn" style="
                    padding:7px 16px; border-radius:7px; border:1px solid #cbd5e1;
                    background:#fff; color:#475569; font-size:13px; font-weight:600;
                    cursor:pointer;
                ">Cancel</button>
                <button id="copyNumbersBtn" style="
                    padding:7px 16px; border-radius:7px; border:none;
                    background:#0ea5e9; color:#fff; font-size:13px; font-weight:600;
                    cursor:pointer; display:none; align-items:center; gap:5px;
                ">⎘ Copy Numbers</button>
                <button id="pullStudentsBtn" style="
                    padding:7px 16px; border-radius:7px; border:none;
                    background:#2563eb; color:#fff; font-size:13px; font-weight:600;
                    cursor:pointer;
                ">Pull Student #s</button>
            </div>
        `;

        document.body.appendChild(modal);

        // ── Helpers ──────────────────────────────────────────────────────
        function openModal() {
            overlay.style.display = 'block';
            modal.style.display = 'flex';
            document.getElementById('studentNames').value = '';
            document.getElementById('resultsWrapper').style.display = 'none';
            document.getElementById('resultsBody').innerHTML = '';
            document.getElementById('copyNumbersBtn').style.display = 'none';
            document.getElementById('statusText').textContent = '';
            document.getElementById('resultsBadges').innerHTML = '';
        }

        function closeModal() {
            overlay.style.display = 'none';
            modal.style.display = 'none';
        }

        // ── Events ───────────────────────────────────────────────────────
        pullBtn.addEventListener('click', openModal);
        overlay.addEventListener('click', closeModal);
        document.getElementById('closeModalBtn').addEventListener('click', closeModal);
        document.getElementById('cancelBtn').addEventListener('click', closeModal);

        // Textarea focus style
        const ta = document.getElementById('studentNames');
        ta.addEventListener('focus', () => ta.style.borderColor = '#2563eb');
        ta.addEventListener('blur',  () => ta.style.borderColor = '#cbd5e1');

        // ── Pull ─────────────────────────────────────────────────────────
        document.getElementById('pullStudentsBtn').addEventListener('click', () => {
            const input = ta.value.trim();
            if (!input) { ta.style.borderColor = '#ef4444'; ta.focus(); return; }
            ta.style.borderColor = '#cbd5e1';

            const inputMode = document.getElementById('inputMode').value;
            const nameLines = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
            const rows = document.querySelectorAll("#studentsTable tbody tr");

            let studentNumbers = [];
            let foundCount = 0;
            let notFoundCount = 0;
            const tbody = document.getElementById('resultsBody');
            tbody.innerHTML = '';

            nameLines.forEach(line => {
                let last = '', first = '';

                if (inputMode === 'typed-last-first') {
                    const parts = line.split(',');
                    if (parts.length < 2) { appendRow(tbody, line, 'Invalid format', 'invalid'); return; }
                    last  = parts[0].trim().toLowerCase();
                    first = parts.slice(1).join(',').trim().toLowerCase();
                } else if (inputMode === 'excel-last-first') {
                    const parts = line.split('\t');
                    if (parts.length < 2) { appendRow(tbody, line, 'Invalid format', 'invalid'); return; }
                    last  = parts[0].trim().toLowerCase();
                    first = parts.slice(1).join(' ').trim().toLowerCase();
                } else if (inputMode === 'typed-first-last') {
                    const parts = line.split(' ');
                    if (parts.length < 2) { appendRow(tbody, line, 'Invalid format', 'invalid'); return; }
                    first = parts[0].trim().toLowerCase();
                    last  = parts.slice(1).join(' ').trim().toLowerCase();
                } else if (inputMode === 'excel-first-last') {
                    const parts = line.split('\t');
                    if (parts.length < 2) { appendRow(tbody, line, 'Invalid format', 'invalid'); return; }
                    first = parts[0].trim().toLowerCase();
                    last  = parts.slice(1).join(' ').trim().toLowerCase();
                }

                // Token-based matching — handles multi-part names regardless of order
                const allTokens = [first, last]
                    .join(' ')
                    .split(/\s+/)
                    .map(t => t.replace(/[^a-z]/g, ''))
                    .filter(Boolean);

                let found = false;
                rows.forEach(row => {
                    const nameCell = row.querySelectorAll("td")[2];
                    if (nameCell) {
                        const fullName = nameCell.textContent
                            .replace(/\s+/g, ' ').replace(/,/g, '')
                            .trim().toLowerCase().replace(/[^a-z\s]/g, '');
                        if (allTokens.every(token => fullName.includes(token))) {
                            const numCell = row.querySelector("td:first-child a");
                            if (numCell) {
                                appendRow(tbody, line, numCell.textContent, 'found');
                                studentNumbers.push(numCell.textContent);
                                found = true;
                                foundCount++;
                            }
                        }
                    }
                });

                if (!found) {
                    appendRow(tbody, line, 'Not found', 'notfound');
                    notFoundCount++;
                }
            });

            // Show results
            document.getElementById('resultsWrapper').style.display = 'block';
            document.getElementById('resultsBadges').innerHTML = `
                <span style="padding:2px 9px; border-radius:99px; background:#dcfce7; color:#15803d; font-size:11px; font-weight:700;">${foundCount} found</span>
                ${notFoundCount > 0 ? `<span style="padding:2px 9px; border-radius:99px; background:#fee2e2; color:#dc2626; font-size:11px; font-weight:700;">${notFoundCount} not found</span>` : ''}
            `;
            document.getElementById('statusText').textContent = `${nameLines.length} names processed`;

            const copyBtn = document.getElementById('copyNumbersBtn');
            if (studentNumbers.length > 0) {
                copyBtn.style.display = 'inline-flex';
                copyBtn.dataset.numbers = studentNumbers.join("\n");
            } else {
                copyBtn.style.display = 'none';
            }
        });

        // ── Copy ─────────────────────────────────────────────────────────
        document.getElementById('copyNumbersBtn').addEventListener('click', function() {
            navigator.clipboard.writeText(this.dataset.numbers).then(() => {
                this.textContent = '✓ Copied!';
                this.style.background = '#16a34a';
                setTimeout(() => {
                    this.innerHTML = '⎘ Copy Numbers';
                    this.style.background = '#0ea5e9';
                }, 1800);
            }).catch(err => alert("Failed to copy: " + err));
        });

        // ── Row builder ──────────────────────────────────────────────────
        function appendRow(tbody, name, value, type) {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f1f5f9';
            const c = {
                found:    { bg: 'transparent', text: '#15803d', dot: '#22c55e' },
                notfound: { bg: '#fff7f7',      text: '#dc2626', dot: '#ef4444' },
                invalid:  { bg: '#fffbeb',      text: '#d97706', dot: '#f59e0b' },
            }[type];
            tr.style.background = c.bg;
            tr.innerHTML = `
                <td style="padding:8px 14px; color:#1e293b; font-size:13px;">${name}</td>
                <td style="padding:8px 14px; font-size:13px;">
                    <span style="display:inline-flex; align-items:center; gap:5px; color:${c.text}; font-weight:${type==='found'?'600':'500'};">
                        <span style="width:6px;height:6px;border-radius:50%;background:${c.dot};flex-shrink:0;display:inline-block;"></span>
                        ${value}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        }

    });

})();