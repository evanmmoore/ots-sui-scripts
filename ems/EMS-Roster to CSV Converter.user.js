// ==UserScript==
// @name         EMS - Roster to CSV Converter
// @namespace    https://*.otsystems.net/*
// @version      1.2
// @description  Upload a roster (photo, PDF, CSV, Excel), verify fields, download formatted CSV for ticket system import
// @match        https://admin.otsystems.net/
// @match        https://admin.otsystems.net/*
// @match        https://*.otsystems.net/*
// @match        https://otsystems.net/*
// @match        https://admin2025.otsystems.net/*
// @match        https://www.safetyunlimited.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
    'use strict';

    // ── Gemini API key — loaded on demand when panel opens ──
    let GEMINI_API_KEY = GM_getValue('geminiKey', '');

    /**********************
     * STYLES
     **********************/
    const style = document.createElement('style');
    style.textContent = `
        #tsi-link {
            display: block;
            padding: 4px 0;
            color: inherit;
            text-decoration: none;
            font-size: inherit;
            cursor: pointer;
        }
        #tsi-link:hover { text-decoration: underline; }

        #tsi-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,.45);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity .18s;
        }
        #tsi-overlay.open { opacity: 1; pointer-events: all; }

        #tsi-panel {
            background: #fff; border: 1px solid #dee2e6;
            border-radius: 8px; width: min(1100px, 97vw); max-height: 92vh;
            overflow: hidden; display: flex; flex-direction: column;
            box-shadow: 0 8px 32px rgba(0,0,0,.18);
            transform: translateY(12px); transition: transform .18s;
            font-family: inherit; font-size: 13px;
        }
        #tsi-overlay.open #tsi-panel { transform: translateY(0); }

        #tsi-header {
            padding: 12px 16px; border-bottom: 1px solid #dee2e6;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0; background: #f8f9fa;
        }
        #tsi-header h5 {
            margin: 0; font-size: 14px; font-weight: 600; color: #212529;
        }
        #tsi-close {
            background: #dee2e6; border: none; cursor: pointer;
            width: 20px; height: 20px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; transition: background .15s;
        }
        #tsi-close:hover { background: #adb5bd; }
        #tsi-close span {
            display: block; width: 10px; height: 2px;
            background: #6c757d; border-radius: 2px;
        }

        #tsi-body {
            overflow-y: auto; flex: 1; padding: 16px;
        }

        /* Upload zone */
        #tsi-upload-zone {
            border: 2px dashed #ced4da; border-radius: 6px;
            padding: 24px; text-align: center; cursor: pointer;
            transition: border-color .15s, background .15s;
            margin-bottom: 10px; background: #fff;
        }
        #tsi-upload-zone:hover, #tsi-upload-zone.dragover {
            border-color: #0d6efd; background: #f0f5ff;
        }
        #tsi-upload-zone p { margin: 0; color: #6c757d; font-size: 12px; }
        #tsi-upload-zone p strong { color: #0d6efd; }
        #tsi-upload-status {
            font-size: 12px; margin-bottom: 10px; display: none; line-height: 1.6;
        }
        #tsi-upload-status.error { color: #dc3545; }
        #tsi-file-input { display: none; }

        /* Labels / inputs */
        .tsi-label {
            font-size: 11px; font-weight: 700; color: #6c757d;
            text-transform: uppercase; letter-spacing: .4px;
            margin-bottom: 4px; display: block;
        }

        /* Verify section */
        #tsi-verify-section { display: none; margin-top: 4px; }
        .tsi-verify-title {
            font-size: 13px; font-weight: 700; color: #212529; margin: 0 0 10px;
        }
        .tsi-alert-info {
            background: #cfe2ff; border: 1px solid #b6d4fe; color: #084298;
            padding: 9px 12px; border-radius: 5px; font-size: 12px;
            line-height: 1.5; margin-bottom: 12px;
        }

        /* Table */
        .tsi-table-wrap { overflow-x: auto; margin-bottom: 12px; }
        .tsi-table {
            width: 100%; border-collapse: collapse;
            font-size: 11px; color: #212529;
        }
        .tsi-table thead th {
            background: #f8f9fa; border: 1px solid #dee2e6;
            border-bottom: 2px solid #dee2e6; padding: 6px 6px;
            font-size: 10px; font-weight: 700; text-transform: uppercase;
            letter-spacing: .4px; color: #6c757d; text-align: left;
            white-space: nowrap;
        }
        .tsi-table tbody td {
            border: 1px solid #f0f0f0; padding: 3px 4px; vertical-align: middle;
        }
        .tsi-table tbody tr:hover td { background: #f8f9fa; }
        .tsi-table input {
            width: 100%; padding: 3px 5px; border: 1px solid #ced4da;
            border-radius: 3px; font-size: 11px; color: #212529;
            font-family: inherit; box-sizing: border-box;
        }
        .tsi-table input:focus {
            outline: none; border-color: #0d6efd;
            box-shadow: 0 0 0 2px rgba(13,110,253,.1);
        }
        .tsi-state-input { width: 34px !important; text-align: center; text-transform: uppercase; }
        .tsi-zip-input   { width: 52px !important; }
        .tsi-phone-input { width: 88px !important; }

        /* Delete row button */
        .tsi-del-btn {
            background: none; border: none; cursor: pointer;
            color: #dc3545; font-size: 15px; line-height: 1;
            padding: 2px 4px; border-radius: 3px; transition: background .12s;
        }
        .tsi-del-btn:hover { background: #f8d7da; }

        /* Add row button */
        #tsi-add-row-btn {
            background: #fff; border: 1px dashed #0d6efd; color: #0d6efd;
            border-radius: 5px; padding: 6px 12px; font-size: 12px;
            font-weight: 600; cursor: pointer; width: 100%; margin-bottom: 10px;
            transition: background .12s;
        }
        #tsi-add-row-btn:hover { background: #f0f5ff; }

        /* Record count badge */
        #tsi-record-count {
            font-size: 11px; color: #6c757d; margin-bottom: 8px;
        }

        /* Action row */
        .tsi-actions { display: flex; gap: 8px; margin-top: 4px; }
        .tsi-btn {
            padding: 7px 16px; border-radius: 5px; font-size: 13px;
            font-weight: 600; cursor: pointer; border: 1px solid transparent;
            font-family: inherit; transition: background .12s, color .12s;
            display: inline-flex; align-items: center; gap: 6px;
        }
        .tsi-btn-secondary { background:#fff; color:#6c757d; border-color:#6c757d; }
        .tsi-btn-secondary:hover { background:#6c757d; color:#fff; }
        .tsi-btn-success { background:#fff; color:#198754; border-color:#198754; }
        .tsi-btn-success:hover { background:#198754; color:#fff; }
        .tsi-btn-primary { background:#0d6efd; color:#fff; border-color:#0d6efd; width:100%; justify-content:center; }
        .tsi-btn-primary:hover { background:#0b5ed7; }
        .tsi-btn-primary:disabled { opacity:.55; cursor:not-allowed; background:#6c757d; border-color:#6c757d; }

        .tsi-alert-danger {
            background:#f8d7da; border:1px solid #f1aeb5; color:#58151c;
            padding:9px 12px; border-radius:5px; font-size:12px; margin-bottom:10px;
        }
    `;
    document.head.appendChild(style);

    /**********************
     * INJECT NAV LINK — mirrors EMS Support Tools pattern exactly
     **********************/
    function injectNavLink() {
        if (document.querySelector('#tsi-link')) return;

        const ticketLink = Array.from(document.querySelectorAll('a.mega-grandchild')).find(a =>
            (a.textContent || a.innerText || '').trim() === 'Ticket System'
        );

        if (!ticketLink) {
            console.log('[TSI] Ticket System link not found yet');
            return;
        }

        const link = document.createElement('a');
        link.id = 'tsi-link';
        link.className = 'mega-grandchild';
        link.href = '#';
        link.style.color = '#000000';
        link.style.fontWeight = 'bold';
        link.style.display = 'block';
        link.style.marginTop = '0';
        link.textContent = 'Roster Converter';
        link.onclick = e => { e.preventDefault(); openPanel(); };

        ticketLink.parentNode.insertBefore(link, ticketLink.nextSibling);
        console.log('[TSI] Roster Converter injected');
    }

    window.addEventListener('load', () => {
        setTimeout(injectNavLink, 500);
        setTimeout(injectNavLink, 1000);
        setTimeout(injectNavLink, 2000);
    });

    const navObserver = new MutationObserver(() => {
        if (document.querySelector('a.mega-grandchild')) {
            injectNavLink();
        }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });

    /**********************
     * BUILD MODAL
     **********************/
    const overlay = document.createElement('div');
    overlay.id = 'tsi-overlay';
    overlay.innerHTML = `
        <div id="tsi-panel">
            <div id="tsi-header">
                <h5>Ticket System Import</h5>
                <button id="tsi-close" title="Close"><span></span></button>
            </div>
            <div id="tsi-body">

                <div id="tsi-upload-zone">
                    <div style="font-size:28px;margin-bottom:6px">📋</div>
                    <p><strong>Click to browse</strong> or drag & drop</p>
                    <p style="margin-top:4px">CSV · Excel · PDF · JPG · PNG · WebP · HEIC</p>
                    <p style="margin-top:4px;font-size:11px">Multiple files supported — all records merged</p>
                </div>
                <div id="tsi-upload-status"></div>
                <input type="file" id="tsi-file-input"
                    accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif" multiple>

                <button id="tsi-parse-btn" class="tsi-btn tsi-btn-primary" style="margin-bottom:12px">
                    Parse &amp; Verify Records
                </button>

                <div id="tsi-verify-section">
                    <p class="tsi-verify-title">Verify Records</p>
                    <div class="tsi-alert-info">
                        <strong>📋 Review &amp; Edit</strong> — click any cell to modify. Use + to add rows, × to remove. Status is always <em>pending</em>.
                    </div>
                    <div id="tsi-record-count"></div>
                    <div class="tsi-table-wrap">
                        <table class="tsi-table">
                            <thead>
                                <tr>
                                    <th style="width:22px">#</th>
                                    <th>Last Name</th>
                                    <th>First Name</th>
                                    <th>Email</th>
                                    <th>Address 1</th>
                                    <th>Address 2</th>
                                    <th>City</th>
                                    <th style="width:38px">State</th>
                                    <th style="width:52px">Zip</th>
                                    <th style="width:92px">Phone</th>
                                    <th style="width:28px"></th>
                                </tr>
                            </thead>
                            <tbody id="tsi-tbody"></tbody>
                        </table>
                    </div>
                    <button id="tsi-add-row-btn">+ Add Row</button>
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;margin-top:4px">
                        <label style="font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap">File Name</label>
                        <div style="display:flex;align-items:center;flex:1;gap:4px">
                            <input id="tsi-filename" type="text" placeholder="ticket_import" style="flex:1;padding:6px 10px;border:1px solid #ced4da;border-radius:5px;font-size:13px;color:#212529;font-family:inherit;box-sizing:border-box;">
                            <span style="font-size:12px;color:#6c757d;white-space:nowrap">.csv</span>
                        </div>
                    </div>
                    <div class="tsi-actions">
                        <button id="tsi-edit-btn" class="tsi-btn tsi-btn-secondary">← Upload Again</button>
                        <button id="tsi-download-btn" class="tsi-btn tsi-btn-success">⬇ Download CSV</button>
                    </div>
                </div>

            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    /**********************
     * ELEMENT REFS
     **********************/
    const uploadZone    = document.getElementById('tsi-upload-zone');
    const fileInput     = document.getElementById('tsi-file-input');
    const uploadStatus  = document.getElementById('tsi-upload-status');
    const parseBtn      = document.getElementById('tsi-parse-btn');
    const verifySection = document.getElementById('tsi-verify-section');
    const tbody         = document.getElementById('tsi-tbody');
    const editBtn       = document.getElementById('tsi-edit-btn');
    const downloadBtn   = document.getElementById('tsi-download-btn');
    const addRowBtn     = document.getElementById('tsi-add-row-btn');
    const recordCount   = document.getElementById('tsi-record-count');
    const filenameInput = document.getElementById('tsi-filename');

    let uploadedRecords = null;
    let parsedRecords   = [];

    /**********************
     * OPEN / CLOSE
     **********************/
    function openPanel() {
        if (!GEMINI_API_KEY) {
            GEMINI_API_KEY = prompt('Enter your Gemini API key:');
            if (GEMINI_API_KEY) GM_setValue('geminiKey', GEMINI_API_KEY);
        }
        overlay.classList.add('open');
    }
    function closePanel() { overlay.classList.remove('open'); }

    document.getElementById('tsi-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

    /**********************
     * FILE UPLOAD
     **********************/
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', e => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFiles(Array.from(fileInput.files));
    });

    function showStatus(msg, isError = false) {
        uploadStatus.innerHTML = msg;
        uploadStatus.className = isError ? 'error' : '';
        uploadStatus.style.display = 'block';
    }

    const IMAGE_TYPES = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.heic':'image/jpeg' };

    async function handleFiles(files) {
        uploadedRecords = null;
        const all = [];
        const lines = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            showStatus(`Processing ${i + 1} of ${files.length}: "${file.name}"…`);
            try {
                const recs = await processFile(file);
                all.push(...recs);
                lines.push(`✅ "${file.name}" — ${recs.length} record(s)`);
            } catch (err) {
                lines.push(`❌ "${file.name}" — ${err.message}`);
            }
        }
        const summary = lines.map(l => `<div>${l}</div>`).join('');
        if (all.length) {
            uploadedRecords = all;
            showStatus(`${summary}<div style="margin-top:6px;font-weight:600;color:#198754">${all.length} record(s) ready — click "Parse & Verify Records"</div>`);
        } else {
            showStatus(`${summary}<div style="margin-top:6px;font-weight:600">No valid records found.</div>`, true);
        }
    }

    async function processFile(file) {
        const fname = file.name.toLowerCase();
        const ext = '.' + fname.split('.').pop();
        if (fname.endsWith('.csv'))               return await parseCSV(file);
        if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) return await parseExcel(file);
        if (fname.endsWith('.pdf'))               return await parsePDF(file);
        if (IMAGE_TYPES[ext])                     return await parseVision(file, IMAGE_TYPES[ext]);
        throw new Error('Unsupported file type');
    }

    /**********************
     * CSV PARSER
     **********************/
    async function parseCSV(file) {
        const text = await file.text();
        const lines = text.trim().split(/\r?\n/);
        if (!lines.length) return [];
        const delim = lines[0].includes('\t') ? '\t' : ',';
        const headers = splitCSVRow(lines[0], delim).map(h => h.toLowerCase().trim());
        const get = (row, ...keys) => {
            for (const k of keys) {
                const idx = headers.findIndex(h => h.includes(k));
                if (idx >= 0) return (row[idx] || '').trim();
            }
            return '';
        };
        return lines.slice(1).map(l => splitCSVRow(l, delim)).filter(r => r.some(c => c)).map(row => ({
            last:  get(row, 'last'),
            first: get(row, 'first'),
            email: get(row, 'email'),
            addr1: get(row, 'address 1', 'addr1', 'address1', 'street'),
            addr2: get(row, 'address 2', 'addr2', 'address2'),
            city:  get(row, 'city'),
            state: get(row, 'state'),
            zip:   get(row, 'zip'),
            phone: get(row, 'phone'),
        })).filter(r => r.last || r.first || r.email);
    }

    function splitCSVRow(line, delim) {
        const cols = []; let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === delim && !inQ) { cols.push(cur); cur = ''; }
            else cur += ch;
        }
        cols.push(cur);
        return cols.map(c => c.replace(/^"|"$/g,'').trim());
    }

    /**********************
     * EXCEL PARSER
     **********************/
    async function parseExcel(file) {
        if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!rows.length) return [];
        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        const get = (row, ...keys) => {
            for (const k of keys) {
                const idx = headers.findIndex(h => h.includes(k));
                if (idx >= 0) return String(row[idx] || '').trim();
            }
            return '';
        };
        return rows.slice(1).filter(r => r.some(c => c !== '')).map(row => ({
            last:  get(row, 'last'),
            first: get(row, 'first'),
            email: get(row, 'email'),
            addr1: get(row, 'address 1', 'addr1', 'address1', 'street'),
            addr2: get(row, 'address 2', 'addr2', 'address2'),
            city:  get(row, 'city'),
            state: get(row, 'state'),
            zip:   get(row, 'zip'),
            phone: get(row, 'phone'),
        })).filter(r => r.last || r.first || r.email);
    }

    /**********************
     * PDF PARSER (text layer → vision fallback)
     **********************/
    async function parsePDF(file) {
        try {
            const recs = await parsePDFText(file);
            if (recs.length) return recs;
        } catch(e) {}
        const buf = await file.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        return await callGemini(b64, 'application/pdf');
    }

    async function parsePDFText(file) {
        if (!window.pdfjsLib) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let text = '';
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            text += content.items.map(i => i.str).join(' ') + '\n';
        }
        const emailRe = /[\w.+-]+@[\w-]+\.[\w.]+/g;
        const matches = [...text.matchAll(emailRe)];
        if (!matches.length) return [];
        return matches.map(m => ({ last:'', first:'', email: m[0], addr1:'', addr2:'', city:'', state:'', zip:'', phone:'' }));
    }

    /**********************
     * IMAGE / VISION
     **********************/
    async function parseVision(file, mediaType) {
        const { base64, type } = await imageToJpeg(file);
        return await callGemini(base64, type);
    }

    function imageToJpeg(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const MAX = 1568;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > MAX || h > MAX) {
                    if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
                    else        { w = Math.round(w * MAX / h); h = MAX; }
                }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                resolve({ base64: c.toDataURL('image/jpeg', 0.85).split(',')[1], type: 'image/jpeg' });
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image.')); };
            img.src = url;
        });
    }

    /**********************
     * GEMINI CALL
     **********************/
    async function callGemini(base64, mediaType) {
        if (!GEMINI_API_KEY) {
            throw new Error('Gemini API key not set. Reload the page to enter your key.');
        }

        const prompt = `This is an AHA (American Heart Association) Course Participants roster sheet.
There are numbered rows (1, 2, 3, etc.). Each row has TWO lines:
- Line 1: the student's full name (handwritten, may include first, middle, last)
- Line 2: the student's email address (handwritten below the name)

The right side of the sheet has address and phone number for each student.

Extract ALL numbered student entries. Return ONLY a raw JSON array, no markdown, no explanation:
[{"last":"Doe","first":"Jane","email":"jane@example.com","addr1":"123 Main St","addr2":"","city":"Oxnard","state":"CA","zip":"93030","phone":"8056001234"},...]

Rules:
- There are 8 or more students on this sheet — find ALL of them
- Each numbered row (1 through 10) is a separate student
- Parse the full name: first word = first name, last word = last name, middle word = middle if 3+ words
- Email is on the line directly below the name
- Address and phone are in the middle column
- Use empty string "" for any missing fields
- state: 2-letter abbreviation
- zip: 5 digits only
- phone: digits only, no formatting
- Fix obvious handwriting errors in emails (spaces between characters, 0 vs O, l vs 1)
- Do NOT skip any numbered rows even if handwriting is hard to read — make your best guess`;

        const body = JSON.stringify({
            contents: [{ parts: [
                { inline_data: { mime_type: mediaType, data: base64 } },
                { text: prompt }
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 }
        });

        const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
        let lastErr = null;

        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            try {
                const text = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST', url,
                        headers: { 'Content-Type': 'application/json' },
                        data: body, timeout: 60000,
                        onload: r => r.status >= 200 && r.status < 300 ? resolve(r.responseText) : r.status === 429 ? reject(new Error('QUOTA')) : reject(new Error(`Gemini ${r.status}`)),
                        onerror: () => reject(new Error('Network error')),
                        ontimeout: () => reject(new Error('Timeout'))
                    });
                });

                const data = JSON.parse(text);
                const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const clean = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

                let parsed;
                try { parsed = JSON.parse(clean); }
                catch (e) { parsed = JSON.parse(repairJSON(clean)); }

                if (!Array.isArray(parsed)) throw new Error('Unexpected response format');
                return parsed.filter(r => r && (r.last || r.first || r.email)).map(r => ({
                    last:  (r.last  || '').trim(),
                    first: (r.first || '').trim(),
                    email: (r.email || '').trim(),
                    addr1: (r.addr1 || '').trim(),
                    addr2: (r.addr2 || '').trim(),
                    city:  (r.city  || '').trim(),
                    state: (r.state || '').toUpperCase().trim().slice(0,2),
                    zip:   (r.zip   || '').replace(/\D/g,'').slice(0,5),
                    phone: (r.phone || '').replace(/\D/g,''),
                }));

            } catch (e) {
                if (e.message === 'QUOTA') { lastErr = 'All Gemini models hit quota. Try again in a minute.'; continue; }
                throw e;
            }
        }
        throw new Error(lastErr);
    }

    function repairJSON(s) {
        s = s.replace(/,\s*$/, '');
        if ((s.match(/"/g)||[]).length % 2 !== 0) s += '"';
        const ob = (s.match(/{/g)||[]).length - (s.match(/}/g)||[]).length;
        const ob2 = (s.match(/\[/g)||[]).length - (s.match(/\]/g)||[]).length;
        for (let i=0;i<ob;i++) s+='}';
        for (let i=0;i<ob2;i++) s+=']';
        return s;
    }

    /**********************
     * PARSE BUTTON
     **********************/
    parseBtn.addEventListener('click', () => {
        document.querySelectorAll('.tsi-inline-error').forEach(e => e.remove());

        if (!uploadedRecords) {
            const d = document.createElement('div');
            d.className = 'tsi-alert-danger tsi-inline-error';
            d.textContent = '⚠️ Please upload a file first.';
            uploadZone.parentNode.insertBefore(d, uploadZone);
            return;
        }

        parsedRecords = uploadedRecords.map(r => ({ ...r }));
        renderTable(parsedRecords);
        if (!filenameInput.value.trim()) {
            filenameInput.value = `ticket_import_${new Date().toISOString().slice(0,10)}`;
        }
        verifySection.style.display = 'block';
        verifySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /**********************
     * RENDER TABLE
     **********************/
    function emptyRecord() {
        return { last:'', first:'', email:'', addr1:'', addr2:'', city:'', state:'', zip:'', phone:'' };
    }

    function updateCount() {
        recordCount.textContent = `${parsedRecords.length} record${parsedRecords.length !== 1 ? 's' : ''}`;
    }

    function renderRow(r, i) {
        const tr = document.createElement('tr');
        tr.dataset.i = i;
        tr.innerHTML = `
            <td style="text-align:center;color:#6c757d;font-size:11px" class="tsi-row-num">${i+1}</td>
            <td><input class="tsi-f" data-f="last"  value="${esc(r.last)}"></td>
            <td><input class="tsi-f" data-f="first" value="${esc(r.first)}"></td>
            <td><input class="tsi-f" data-f="email" value="${esc(r.email)}"></td>
            <td><input class="tsi-f" data-f="addr1" value="${esc(r.addr1)}"></td>
            <td><input class="tsi-f" data-f="addr2" value="${esc(r.addr2)}"></td>
            <td><input class="tsi-f" data-f="city"  value="${esc(r.city)}"></td>
            <td><input class="tsi-f tsi-state-input" data-f="state" value="${esc(r.state)}" maxlength="2"></td>
            <td><input class="tsi-f tsi-zip-input"   data-f="zip"   value="${esc(r.zip)}"   maxlength="5"></td>
            <td><input class="tsi-f tsi-phone-input" data-f="phone" value="${esc(r.phone)}"></td>
            <td style="text-align:center"><button class="tsi-del-btn" title="Remove row">×</button></td>
        `;
        return tr;
    }

    function renderTable(records) {
        tbody.innerHTML = '';
        records.forEach((r, i) => tbody.appendChild(renderRow(r, i)));
        updateCount();
    }

    function renumberRows() {
        tbody.querySelectorAll('tr').forEach((tr, i) => {
            tr.dataset.i = i;
            tr.querySelector('.tsi-row-num').textContent = i + 1;
            tr.querySelectorAll('.tsi-f').forEach(inp => inp.dataset.i = i);
        });
        updateCount();
    }

    tbody.addEventListener('input', e => {
        const inp = e.target.closest('.tsi-f');
        if (!inp) return;
        const i = +inp.closest('tr').dataset.i;
        const field = inp.dataset.f;
        let v = inp.value;
        if (field === 'state') { v = v.toUpperCase(); inp.value = v; }
        parsedRecords[i][field] = v;
    });

    tbody.addEventListener('click', e => {
        const btn = e.target.closest('.tsi-del-btn');
        if (!btn) return;
        const tr = btn.closest('tr');
        const i = +tr.dataset.i;
        parsedRecords.splice(i, 1);
        tr.remove();
        renumberRows();
    });

    addRowBtn.addEventListener('click', () => {
        const r = emptyRecord();
        parsedRecords.push(r);
        const i = parsedRecords.length - 1;
        const tr = renderRow(r, i);
        tbody.appendChild(tr);
        updateCount();
        tr.querySelector('input').focus();
        tr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

    /**********************
     * EDIT BUTTON
     **********************/
    editBtn.addEventListener('click', () => {
        verifySection.style.display = 'none';
        uploadZone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /**********************
     * DOWNLOAD CSV
     **********************/
    downloadBtn.addEventListener('click', () => {
        if (!parsedRecords.length) return;

        const rawName = filenameInput.value.trim().replace(/\.csv$/i, '');
        const filename = (rawName || `ticket_import_${new Date().toISOString().slice(0,10)}`) + '.csv';

        const headers = ['Last Name','First Name','Email Address','Address 1','Address 2','City','State','Zip','Phone','status'];
        const rows = [headers, ...parsedRecords.map(r => [
            r.last, r.first, r.email, r.addr1, r.addr2, r.city, r.state, r.zip, r.phone, 'pending'
        ])];

        const csv = rows.map(row => row.map(cell => `"${(cell||'').replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    });

    /**********************
     * HELPERS
     **********************/
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let bin = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
        return btoa(bin);
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
        });
    }

})();