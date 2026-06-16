// ==UserScript==
// @name         SUI.COM/CORP Bulk Student Doc Upload
// @namespace    https://www.safetyunlimited.com/
// @version      20.0
// @description  Bulk student loader with document upload, in-panel API key button, minimize toggle, auto-detecting MI, name verification table, and required phone
// @match        https://www.safetyunlimited.com/corporate2/multiple_student_add.asp
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
    'use strict';

    /**********************
     * STYLES — matches eCard Scraper aesthetic
     **********************/
    const style = document.createElement('style');
    style.textContent = `
        /* ── Panel shell ── */
        #bsu-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 520px;
            z-index: 99999;
            background: #fff;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,.18);
            font-family: inherit;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            max-height: 90vh;
            transition: width .2s;
            user-select: none;
        }
        #bsu-panel.minimized {
            width: 260px;
            max-height: none;
        }

        /* ── Header ── */
        #bsu-header {
            padding: 12px 16px;
            background: #f8f9fa;
            border-bottom: 1px solid #dee2e6;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: move;
            user-select: none;
            flex-shrink: 0;
        }
        #bsu-header h5 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: #212529;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #bsu-header h5 .material-symbols-outlined { font-size: 18px; color: #6c757d; }
        #bsu-header-btns {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0;
        }
        #bsu-key-btn {
            background: #dee2e6;
            border: none;
            cursor: pointer;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            font-size: 12px;
            line-height: 1;
            color: #6c757d;
            transition: background .15s;
        }
        #bsu-key-btn:hover { background: #adb5bd; }
        #bsu-minimize-icon {
            font-size: 18px;
            color: #6c757d;
            transition: transform .2s;
        }
        #bsu-panel.minimized #bsu-minimize-icon { transform: rotate(180deg); }
        #bsu-panel.minimized #bsu-header { border-bottom-color: transparent; border-radius: 0; }

        /* ── Body ── */
        #bsu-body {
            overflow-y: auto;
            flex: 1;
            padding: 16px;
            transition: padding .2s;
        }
        #bsu-panel.minimized #bsu-body {
            display: none;
        }

        /* ── Form elements ── */
        .bsu-label {
            font-size: 12px;
            font-weight: 600;
            color: #495057;
            margin-bottom: 4px;
            display: block;
            text-transform: uppercase;
            letter-spacing: .4px;
        }
        .bsu-input,
        .bsu-select,
        .bsu-textarea {
            width: 100%;
            padding: 7px 10px;
            border: 1px solid #ced4da;
            border-radius: 5px;
            font-size: 13px;
            color: #212529;
            background: #fff;
            box-sizing: border-box;
            margin-bottom: 10px;
            transition: border-color .15s, box-shadow .15s;
            font-family: inherit;
        }
        .bsu-input:focus,
        .bsu-select:focus,
        .bsu-textarea:focus {
            outline: none;
            border-color: #0d6efd;
            box-shadow: 0 0 0 3px rgba(13,110,253,.12);
        }
        .bsu-input:disabled,
        .bsu-select:disabled,
        .bsu-textarea:disabled {
            background: #f8f9fa;
            color: #adb5bd;
            cursor: not-allowed;
        }
        .bsu-help {
            font-size: 11px;
            color: #6c757d;
            margin-top: -7px;
            margin-bottom: 10px;
        }

        /* ── Checkbox row ── */
        .bsu-check-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 6px;
        }
        .bsu-check-row input[type="checkbox"] {
            width: 14px;
            height: 14px;
            accent-color: #0d6efd;
            cursor: pointer;
            margin: 0;
        }
        .bsu-check-row label {
            font-size: 12px;
            color: #495057;
            cursor: pointer;
            margin: 0;
        }

        /* ── Section divider ── */
        .bsu-section {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 10px 12px;
            margin-bottom: 12px;
        }
        .bsu-section-title {
            font-size: 11px;
            font-weight: 700;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: .6px;
            margin: 0 0 8px;
        }

        /* ── Radio options ── */
        .bsu-radio-option {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 5px 6px;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 4px;
        }
        .bsu-radio-option:hover { background: #e9ecef; }
        .bsu-radio-option input[type="radio"] {
            width: 14px;
            height: 14px;
            accent-color: #0d6efd;
            cursor: pointer;
            margin: 0;
        }
        .bsu-radio-option label {
            font-size: 13px;
            color: #212529;
            cursor: pointer;
            margin: 0;
        }
        .bsu-radio-example {
            font-size: 11px;
            color: #6c757d;
            margin-left: 22px;
            margin-bottom: 6px;
        }

        /* ── Upload drop zone ── */
        #bsu-upload-zone {
            border: 2px dashed #ced4da;
            border-radius: 6px;
            padding: 18px;
            text-align: center;
            cursor: pointer;
            transition: border-color .15s, background .15s;
            margin-bottom: 10px;
            background: #fff;
        }
        #bsu-upload-zone:hover,
        #bsu-upload-zone.dragover {
            border-color: #0d6efd;
            background: #f0f5ff;
        }
        #bsu-upload-zone .upload-icon {
            font-size: 28px;
            color: #6c757d;
            margin-bottom: 6px;
        }
        #bsu-upload-zone p {
            margin: 0;
            font-size: 12px;
            color: #6c757d;
        }
        #bsu-upload-zone p strong { color: #0d6efd; }
        #bsu-upload-status {
            font-size: 12px;
            color: #198754;
            margin-top: 6px;
            display: none;
        }
        #bsu-upload-status.error { color: #dc3545; }

        /* ── Column order subsection ── */
        #bsu-column-order-section {
            margin-top: 8px;
            display: none;
        }
        #bsu-column-order-section.active { display: block; }

        /* ── Buttons ── */
        .bsu-btn {
            padding: 7px 16px;
            border-radius: 5px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid transparent;
            font-family: inherit;
            transition: background .12s, color .12s, border-color .12s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .bsu-btn-primary {
            background: #0d6efd;
            color: #fff;
            border-color: #0d6efd;
            width: 100%;
            justify-content: center;
            margin-top: 4px;
        }
        .bsu-btn-primary:hover { background: #0b5ed7; border-color: #0b5ed7; }
        .bsu-btn-primary:disabled {
            opacity: .55;
            cursor: not-allowed;
            background: #6c757d;
            border-color: #6c757d;
        }
        .bsu-btn-secondary {
            background: #fff;
            color: #6c757d;
            border-color: #6c757d;
        }
        .bsu-btn-secondary:hover { background: #6c757d; color: #fff; }
        .bsu-btn-success {
            background: #fff;
            color: #198754;
            border-color: #198754;
        }
        .bsu-btn-success:hover { background: #198754; color: #fff; }

        /* ── Error / Info boxes ── */
        .bsu-alert {
            padding: 9px 12px;
            border-radius: 5px;
            font-size: 12px;
            line-height: 1.5;
            margin-bottom: 10px;
        }
        .bsu-alert-danger { background: #f8d7da; border: 1px solid #f1aeb5; color: #58151c; }
        .bsu-alert-info   { background: #cfe2ff; border: 1px solid #b6d4fe; color: #084298; }

        /* ── Verify section ── */
        #bsu-verify-section {
            margin-top: 14px;
            padding-top: 14px;
            border-top: 1px solid #dee2e6;
            display: none;
        }
        .bsu-verify-title {
            font-size: 13px;
            font-weight: 700;
            color: #212529;
            margin: 0 0 10px;
        }

        /* ── Verify table ── */
        .bsu-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            color: #212529;
            margin-bottom: 10px;
        }
        .bsu-table thead th {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-bottom: 2px solid #dee2e6;
            padding: 6px 8px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .5px;
            color: #6c757d;
            text-align: left;
        }
        .bsu-table tbody td {
            border: 1px solid #f0f0f0;
            padding: 4px 6px;
            vertical-align: middle;
        }
        .bsu-table tbody tr:hover td { background: #f8f9fa; }
        .bsu-table input {
            width: 100%;
            padding: 3px 6px;
            border: 1px solid #ced4da;
            border-radius: 4px;
            font-size: 12px;
            color: #212529;
            font-family: inherit;
            box-sizing: border-box;
        }
        .bsu-table input:focus {
            outline: none;
            border-color: #0d6efd;
            box-shadow: 0 0 0 2px rgba(13,110,253,.1);
        }
        .bsu-mi-input { width: 32px !important; text-align: center; text-transform: uppercase; }
        .bsu-email-input { font-size: 11px !important; }

        .bsu-verify-actions {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }
        .bsu-verify-actions button { flex: 1; justify-content: center; }

        /* ── Hidden file input ── */
        #bsu-file-input { display: none; }
    `;
    document.head.appendChild(style);

    /**********************
     * HTML
     **********************/
    const panel = document.createElement('div');
    panel.id = 'bsu-panel';
    panel.innerHTML = `
        <div id="bsu-header">
            <h5>Bulk Student Upload</h5>
            <div id="bsu-header-btns">
                <button id="bsu-key-btn" title="Update Gemini API Key">⚿</button>
                <button id="bsu-minimize-btn" title="Minimize" style="background:#dee2e6;border:none;cursor:pointer;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .15s;">
                    <span style="display:block;width:10px;height:2px;background:#6c757d;border-radius:2px;"></span>
                </button>
            </div>
        </div>
        <div id="bsu-body">

            <!-- Settings -->
            <div class="bsu-section">
                <p class="bsu-section-title">Settings</p>

                <label class="bsu-label">Password <span style="font-weight:400;color:#6c757d">(all students)</span></label>
                <input id="bsu-password" type="text" value="safe1234" class="bsu-input">

                <label class="bsu-label">Phone Number <span style="color:#dc3545">*</span></label>
                <input id="bsu-phone" type="text" placeholder="800 680 3789" class="bsu-input" required>
                <div class="bsu-help">10 digits — area code + number</div>
            </div>

            <!-- Input Source -->
            <div class="bsu-section">
                <p class="bsu-section-title">Input Source</p>

                <div class="bsu-radio-option">
                    <input type="radio" name="bsu-source" id="bsu-source-paste" value="paste" checked>
                    <label for="bsu-source-paste">Paste / Type Data</label>
                </div>
                <div class="bsu-radio-option">
                    <input type="radio" name="bsu-source" id="bsu-source-upload" value="upload">
                    <label for="bsu-source-upload">Upload File <span style="font-size:11px;color:#6c757d">(CSV, Excel, PDF, Photo)</span></label>
                </div>
            </div>

            <!-- Upload Zone (hidden by default) -->
            <div id="bsu-upload-wrap" style="display:none">
                <div id="bsu-upload-zone">
                    <div class="upload-icon">📸</div>
                    <p><strong>Click to browse</strong> or drag & drop</p>
                    <p style="margin-top:4px">CSV · Excel · PDF · JPG · PNG · WebP · HEIC</p>
                    <p style="margin-top:4px;font-size:11px;color:#6c757d">Multiple files supported — all students merged into one list</p>
                </div>
                <div id="bsu-upload-status"></div>
                <input type="file" id="bsu-file-input" accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif" multiple>
            </div>

            <!-- Paste / Format section -->
            <div id="bsu-paste-wrap">
                <div class="bsu-section">
                    <p class="bsu-section-title">Input Format</p>

                    <div class="bsu-radio-option">
                        <input type="radio" name="bsu-format" id="bsu-fmt-columns" value="columns" checked>
                        <label for="bsu-fmt-columns">Excel Columns (Tab-Separated)</label>
                    </div>
                    <div class="bsu-radio-example">📋 Paste directly from Excel</div>

                    <div id="bsu-column-order-section" class="active">
                        <label class="bsu-label">Column Order</label>
                        <select id="bsu-column-order" class="bsu-select">
                            <option value="first_last_email">First | (MI) | Last | Email</option>
                            <option value="last_first_email">Last | First | (MI) | Email</option>
                        </select>
                        <div class="bsu-help">ℹ️ Auto-detects 3 or 4 columns. MI optional.</div>
                    </div>

                    <div class="bsu-radio-option">
                        <input type="radio" name="bsu-format" id="bsu-fmt-singleline" value="singleline">
                        <label for="bsu-fmt-singleline">Single Line (Full Name + Email)</label>
                    </div>
                    <div class="bsu-radio-example">✏️ e.g. Sarah Ann Budro sbudro@email.com</div>
                </div>

                <label class="bsu-label">Student Data</label>
                <div class="bsu-help" id="bsu-paste-help"></div>
                <textarea id="bsu-data" rows="7" class="bsu-textarea" placeholder="Paste student data here…"></textarea>
            </div>

            <button id="bsu-parse-btn" class="bsu-btn bsu-btn-primary">
                Parse &amp; Verify Names
            </button>

            <!-- Verify section -->
            <div id="bsu-verify-section">
                <p class="bsu-verify-title">Verify Student Names</p>
                <div class="bsu-alert bsu-alert-info">
                    <strong>📋 Review &amp; Edit</strong> — click any cell to modify. Middle Initial (MI) is optional.
                </div>
                <div id="bsu-verify-table-container"></div>
                <div class="bsu-verify-actions">
                    <button id="bsu-edit-btn" class="bsu-btn bsu-btn-secondary">← Edit Input</button>
                    <button id="bsu-confirm-btn" class="bsu-btn bsu-btn-success">Confirm &amp; Add to Form →</button>
                </div>
            </div>

        </div>
    `;
    document.body.appendChild(panel);

    /**********************
     * MINIMIZE
     **********************/
    const minimizeBtn = document.getElementById('bsu-minimize-btn');
    minimizeBtn.addEventListener('click', e => {
        e.stopPropagation();
        panel.classList.toggle('minimized');
    });
    minimizeBtn.addEventListener('mouseenter', () => minimizeBtn.style.background = '#adb5bd');
    minimizeBtn.addEventListener('mouseleave', () => minimizeBtn.style.background = '#dee2e6');

    /**********************
     * API KEY BUTTON
     **********************/
    const keyBtn = document.getElementById('bsu-key-btn');
    keyBtn.addEventListener('click', e => {
        e.stopPropagation();
        const newKey = prompt('Enter your Gemini API key:', GEMINI_API_KEY ? '••••••••••••••••' : '');
        if (newKey && newKey !== '••••••••••••••••') {
            GEMINI_API_KEY = newKey.trim();
            GM_setValue('geminiKey', GEMINI_API_KEY);
            // Brief visual confirmation on the button
            const orig = keyBtn.textContent;
            keyBtn.textContent = '✓';
            keyBtn.style.color = '#198754';
            setTimeout(() => { keyBtn.textContent = orig; keyBtn.style.color = ''; }, 1500);
        }
    });

    /**********************
     * DRAG TO MOVE — click and hold anywhere on header
     **********************/
    (function () {
        const header = document.getElementById('bsu-header');
        let dragging = false, startX, startY, origLeft, origTop;

        header.addEventListener('mousedown', e => {
            // Don't drag if clicking the header buttons
            if (e.target.closest('#bsu-header-btns')) return;
            e.preventDefault();
            dragging = true;
            const rect = panel.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            origLeft = rect.left;
            origTop  = rect.top;
            // Switch from right-anchored to left-anchored positioning
            panel.style.right = 'auto';
            panel.style.left  = origLeft + 'px';
            panel.style.top   = origTop  + 'px';
            header.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = Math.max(0, origLeft + dx) + 'px';
            panel.style.top  = Math.max(0, origTop  + dy) + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (dragging) {
                dragging = false;
                header.style.cursor = 'move';
            }
        });
    })();    /**********************
     * ELEMENT REFS
     **********************/
    const pasteHelp         = document.getElementById('bsu-paste-help');
    const stuData           = document.getElementById('bsu-data');
    const stuPhone          = document.getElementById('bsu-phone');
    const parseBtn          = document.getElementById('bsu-parse-btn');
    const verifySection     = document.getElementById('bsu-verify-section');
    const verifyContainer   = document.getElementById('bsu-verify-table-container');
    const editBtn           = document.getElementById('bsu-edit-btn');
    const confirmBtn        = document.getElementById('bsu-confirm-btn');
    const fmtColumns        = document.getElementById('bsu-fmt-columns');
    const fmtSingleLine     = document.getElementById('bsu-fmt-singleline');
    const columnOrderSel    = document.getElementById('bsu-column-order');
    const columnOrderSec    = document.getElementById('bsu-column-order-section');
    const sourcePaste       = document.getElementById('bsu-source-paste');
    const sourceUpload      = document.getElementById('bsu-source-upload');
    const pasteWrap         = document.getElementById('bsu-paste-wrap');
    const uploadWrap        = document.getElementById('bsu-upload-wrap');
    const uploadZone        = document.getElementById('bsu-upload-zone');
    const fileInput         = document.getElementById('bsu-file-input');
    const uploadStatus      = document.getElementById('bsu-upload-status');
    const stuPassword       = document.getElementById('bsu-password');

    // ── Gemini API key — loaded from storage, set via ⚿ button in header ──
    let GEMINI_API_KEY = GM_getValue('geminiKey', '');

    let parsedStudents = [];
    let uploadedStudents = null;

    /**********************
     * UI STATE
     **********************/
    function updateHelpText() {
        const isColumns = fmtColumns.checked;
        const order = columnOrderSel.value;
        if (isColumns) {
            const map = {
                'first_last_email': 'First | (MI) | Last | Email — auto-detects 3 or 4 cols',
                'last_first_email': 'Last | First | (MI) | Email — auto-detects 3 or 4 cols'
            };
            pasteHelp.textContent = `Excel paste: ${map[order]}`;
        } else {
            pasteHelp.textContent = 'One per line: John A. Doe john@email.com';
        }
    }

    function toggleColumnOrder() {
        columnOrderSec.classList.toggle('active', fmtColumns.checked);
    }

    fmtColumns.addEventListener('change',    () => { toggleColumnOrder(); updateHelpText(); });
    fmtSingleLine.addEventListener('change', () => { toggleColumnOrder(); updateHelpText(); });
    columnOrderSel.addEventListener('change', updateHelpText);

    // Source toggle
    sourcePaste.addEventListener('change', () => {
        pasteWrap.style.display = '';
        uploadWrap.style.display = 'none';
        uploadedStudents = null;
        uploadStatus.style.display = 'none';
    });
    sourceUpload.addEventListener('change', () => {
        pasteWrap.style.display = 'none';
        uploadWrap.style.display = '';
    });

    updateHelpText();

    /**********************
     * FILE UPLOAD — CSV / XLSX / PDF / Image (multiple files)
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

    function showUploadStatus(msg, isError = false) {
        uploadStatus.innerHTML = msg;
        uploadStatus.className = isError ? 'error' : '';
        uploadStatus.style.display = 'block';
    }

    const IMAGE_TYPES = {
        '.jpg':  'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png':  'image/png',
        '.webp': 'image/webp',
        '.gif':  'image/gif',
        '.heic': 'image/jpeg',
    };

    async function handleFiles(files) {
        uploadedStudents = null;
        const total = files.length;
        const allStudents = [];
        const lines = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            showUploadStatus(`Processing file ${i + 1} of ${total}: "${file.name}"…`);
            try {
                const students = await handleFile(file);
                if (students && students.length) {
                    allStudents.push(...students);
                    lines.push(`✅ "${file.name}" — ${students.length} student(s)`);
                } else {
                    lines.push(`⚠️ "${file.name}" — no students found`);
                }
            } catch (err) {
                console.error('[BSU] File parse error:', err);
                lines.push(`❌ "${file.name}" — ${err.message}`);
            }
        }

        const summary = lines.map(l => `<div style="margin-bottom:3px">${l}</div>`).join('');
        if (allStudents.length) {
            uploadedStudents = allStudents;
            showUploadStatus(`${summary}<div style="margin-top:6px;font-weight:600;color:#198754">Total: ${allStudents.length} student(s) ready — click "Parse & Verify Names" to review</div>`);
        } else {
            showUploadStatus(`${summary}<div style="margin-top:6px;font-weight:600;">No valid students found in any file.</div>`, true);
        }
    }

    async function handleFile(file) {
        const fname = file.name.toLowerCase();
        const ext   = '.' + fname.split('.').pop();

        if (fname.endsWith('.csv')) {
            return await parseCSVFile(file);
        } else if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) {
            return await parseExcelFile(file);
        } else if (fname.endsWith('.pdf')) {
            return await parsePDFFile(file);
        } else if (IMAGE_TYPES[ext]) {
            const mediaType = (file.type && file.type.startsWith('image/')) ? file.type : IMAGE_TYPES[ext];
            return await parseWithClaudeVision(file, mediaType);
        } else {
            throw new Error('Unsupported file type');
        }
    }

    // ── CSV Parser ──
    async function parseCSVFile(file) {
        const text = await file.text();
        const lines = text.trim().split(/\r?\n/);
        if (!lines.length) return [];

        // Detect header row
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('first') || firstLine.includes('last') || firstLine.includes('email') || firstLine.includes('name');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        // Detect delimiter
        const delim = firstLine.includes('\t') ? '\t' : ',';

        // Try to map column indices from header
        let firstIdx = 0, lastIdx = 1, emailIdx = 2, miIdx = -1;
        if (hasHeader) {
            const headers = lines[0].split(delim).map(h => h.replace(/"/g,'').trim().toLowerCase());
            firstIdx = headers.findIndex(h => h.includes('first'));
            lastIdx  = headers.findIndex(h => h.includes('last'));
            emailIdx = headers.findIndex(h => h.includes('email') || h.includes('e-mail'));
            miIdx    = headers.findIndex(h => h === 'mi' || h === 'm.i.' || h.includes('middle'));
            if (firstIdx === -1) firstIdx = 0;
            if (lastIdx  === -1) lastIdx  = 1;
            if (emailIdx === -1) emailIdx = 2;
        }

        return dataLines
            .map(line => parseCSVRow(line, delim))
            .filter(cols => cols.length >= 2)
            .map(cols => ({
                first:  (cols[firstIdx] || '').trim(),
                middle: miIdx >= 0 ? (cols[miIdx] || '').replace('.','').toUpperCase().trim() : '',
                last:   (cols[lastIdx]  || '').trim(),
                email:  emailIdx >= 0 ? (cols[emailIdx] || '').trim() : ''
            }))
            .filter(s => s.first || s.last);
    }

    function parseCSVRow(line, delim) {
        const cols = [];
        let cur = '', inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQuote = !inQuote;
            } else if (ch === delim && !inQuote) {
                cols.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        cols.push(cur);
        return cols;
    }

    // ── Excel Parser (SheetJS via CDN) ──
    async function parseExcelFile(file) {
        // Dynamically load SheetJS if not already present
        if (!window.XLSX) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        }

        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (!rows.length) return [];

        // Detect header
        const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
        const hasHeader = firstRow.some(c => c.includes('first') || c.includes('last') || c.includes('email'));

        let firstIdx = 0, lastIdx = 1, emailIdx = 2, miIdx = -1;
        const dataRows = hasHeader ? rows.slice(1) : rows;

        if (hasHeader) {
            firstIdx = firstRow.findIndex(h => h.includes('first'));
            lastIdx  = firstRow.findIndex(h => h.includes('last'));
            emailIdx = firstRow.findIndex(h => h.includes('email') || h.includes('e-mail'));
            miIdx    = firstRow.findIndex(h => h === 'mi' || h === 'm.i.' || h.includes('middle'));
            if (firstIdx === -1) firstIdx = 0;
            if (lastIdx  === -1) lastIdx  = 1;
            if (emailIdx === -1) emailIdx = 2;
        }

        return dataRows
            .filter(row => row.some(c => c !== ''))
            .map(row => ({
                first:  String(row[firstIdx] || '').trim(),
                middle: miIdx >= 0 ? String(row[miIdx] || '').replace('.','').toUpperCase().trim() : '',
                last:   String(row[lastIdx]  || '').trim(),
                email:  emailIdx >= 0 ? String(row[emailIdx] || '').trim() : ''
            }))
            .filter(s => s.first || s.last);
    }

    // ── PDF / Image Parser — uses Claude vision API for scanned/photo documents ──
    async function parsePDFFile(file) {
        // First try pdf.js for text-based PDFs
        showUploadStatus('Checking if PDF has selectable text…');
        let textStudents = [];
        try {
            textStudents = await parsePDFTextLayer(file);
        } catch (e) {
            // pdf.js failed, fall through to vision
        }
        if (textStudents.length > 0) return textStudents;

        // No text layer found — treat as scanned image, use Claude vision
        showUploadStatus('Scanned document detected — running AI recognition…');
        return await parseWithClaudeVision(file, 'application/pdf');
    }

    async function parsePDFTextLayer(file) {
        if (!window.pdfjsLib) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        let allText = '';

        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            const items = content.items.slice().sort((a, b) =>
                Math.round(b.transform[5] / 5) * 5 - Math.round(a.transform[5] / 5) * 5 ||
                a.transform[4] - b.transform[4]
            );
            const lines = [];
            let lastY = null, currentLine = [];
            items.forEach(item => {
                const y = Math.round(item.transform[5] / 5) * 5;
                if (lastY !== null && Math.abs(y - lastY) > 3) {
                    if (currentLine.length) lines.push(currentLine.join('\t'));
                    currentLine = [];
                }
                currentLine.push(item.str.trim());
                lastY = y;
            });
            if (currentLine.length) lines.push(currentLine.join('\t'));
            allText += lines.join('\n') + '\n';
        }

        const students = [];
        const lines = allText.split('\n').filter(l => l.trim());
        const headerIdx = lines.findIndex(l => {
            const ll = l.toLowerCase();
            return (ll.includes('first') || ll.includes('last')) && ll.includes('email');
        });

        if (headerIdx >= 0) {
            const headers = lines[headerIdx].split('\t').map(h => h.toLowerCase().trim());
            const firstIdx = headers.findIndex(h => h.includes('first'));
            const lastIdx  = headers.findIndex(h => h.includes('last'));
            const emailIdx = headers.findIndex(h => h.includes('email'));
            const miIdx    = headers.findIndex(h => h === 'mi' || h.includes('middle'));
            for (let i = headerIdx + 1; i < lines.length; i++) {
                const cols = lines[i].split('\t');
                if (cols.length < 2) continue;
                const s = {
                    first:  (cols[firstIdx >= 0 ? firstIdx : 0] || '').trim(),
                    middle: miIdx >= 0 ? (cols[miIdx] || '').replace('.','').toUpperCase().trim() : '',
                    last:   (cols[lastIdx  >= 0 ? lastIdx  : 1] || '').trim(),
                    email:  emailIdx >= 0 ? (cols[emailIdx] || '').trim() : ''
                };
                if (s.first || s.last) students.push(s);
            }
        } else {
            const emailRe = /[\w.+-]+@[\w-]+\.[\w.]+/;
            lines.forEach(line => {
                const emailMatch = line.match(emailRe);
                if (!emailMatch) return;
                const email = emailMatch[0];
                const rest = line.replace(email, '').replace(/\t+/g, ' ').trim();
                const parts = rest.split(/\s+/).filter(Boolean);
                const nameData = parseSingleLineName(parts);
                if (nameData && (nameData.first || nameData.last)) {
                    students.push({ ...nameData, email });
                }
            });
        }

        return students;
    }

    // ── Gemini Vision OCR — free tier, no billing required ──
    async function parseWithClaudeVision(file, mediaType) {
        if (!GEMINI_API_KEY) {
            throw new Error('Gemini API key not set. Click the ⚿ button in the top-right of the panel to enter your key. Get a free key at aistudio.google.com');
        }

        let base64, finalMediaType;
        if (mediaType === 'application/pdf') {
            const buffer = await file.arrayBuffer();
            base64 = arrayBufferToBase64(buffer);
            finalMediaType = 'application/pdf';
        } else {
            const result = await imageFileToBase64PNG(file);
            base64 = result.base64;
            finalMediaType = result.mediaType;
        }

        const prompt = `This is a course participant roster or student sign-in sheet.
Extract ALL student entries. Each student typically has their name on one line and email on the next (or same) line.

Return ONLY a raw JSON array, no markdown, no explanation:
[{"first":"Jane","middle":"A","last":"Doe","email":"jane@example.com"},...]

Rules:
- "middle" = single letter initial or ""
- Include every numbered student row that has a name
- If no email visible, use ""
- Do NOT include the instructor or header rows
- Fix obvious handwriting errors in emails (spaces, 0 vs O, l vs 1)`;

        const requestBody = JSON.stringify({
            contents: [{
                parts: [
                    { inline_data: { mime_type: finalMediaType, data: base64 } },
                    { text: prompt }
                ]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 2048 }
        });

        // Try models in order, falling back on 429 quota errors
        const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
        let responseText = null;
        let lastError = null;

        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            try {
                responseText = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url,
                        headers: { 'Content-Type': 'application/json' },
                        data: requestBody,
                        onload: r => {
                            if (r.status >= 200 && r.status < 300) {
                                resolve(r.responseText);
                            } else if (r.status === 429) {
                                reject(new Error('QUOTA'));
                            } else {
                                reject(new Error(`Gemini API error ${r.status}: ${r.responseText.slice(0, 300)}`));
                            }
                        },
                        onerror: () => reject(new Error('Network error contacting Gemini API.')),
                        ontimeout: () => reject(new Error('Request timed out.')),
                        timeout: 60000
                    });
                });
                break; // success — stop trying models
            } catch (e) {
                if (e.message === 'QUOTA') {
                    lastError = `All Gemini models hit quota limits. Try again in a minute.`;
                    continue; // try next model
                }
                throw e; // real error — rethrow immediately
            }
        }

        if (!responseText) throw new Error(lastError);

        const data = JSON.parse(responseText);
        const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const clean = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(clean);
        } catch (e) {
            // Response may have been truncated — try to repair it
            const repaired = repairTruncatedJSON(clean);
            try {
                parsed = JSON.parse(repaired);
            } catch (e2) {
                throw new Error('Could not parse AI response. Raw: ' + clean.slice(0, 200));
            }
        }

        if (!Array.isArray(parsed)) throw new Error('Unexpected AI response format.');

        return parsed
            .filter(s => s && (s.first || s.last))
            .map(s => ({
                first:  (s.first  || '').trim(),
                middle: (s.middle || '').replace('.', '').toUpperCase().trim().slice(0, 1),
                last:   (s.last   || '').trim(),
                email:  (s.email  || '').trim()
            }));
    }

    // Attempt to close a truncated JSON array so partial results aren't lost
    function repairTruncatedJSON(str) {
        let s = str.trim();
        // Remove trailing comma or incomplete field
        s = s.replace(/,\s*$/, '');
        // If we're mid-string value, close the string
        const quoteCount = (s.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) s += '"';
        // Count open braces/brackets
        const openBraces   = (s.match(/{/g) || []).length - (s.match(/}/g) || []).length;
        const openBrackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
        for (let i = 0; i < openBraces;   i++) s += '}';
        for (let i = 0; i < openBrackets; i++) s += ']';
        return s;
    }
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        // Process in chunks to avoid stack overflow on large files
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    // Render any image file (including HEIC) to canvas, resize to ≤1568px, export as JPEG
    function imageFileToBase64PNG(file) {
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
                const canvas = document.createElement('canvas');
                canvas.width  = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                // Use JPEG at 0.85 quality — much smaller than PNG, plenty for OCR
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not decode image. Try saving it as JPG or PNG first.'));
            };
            img.src = url;
        });
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
        });
    }

    /**********************
     * EXCEL COLUMN PASTE PARSER
     **********************/
    function parseExcelColumns(parts, order) {
        const c = parts.map(p => p.trim());
        let r = { first: '', middle: '', last: '', email: '' };
        if (order === 'first_last_email') {
            if (c.length === 4) { r.first=c[0]; r.middle=c[1].replace('.','').toUpperCase(); r.last=c[2]; r.email=c[3]; }
            else if (c.length === 3) { r.first=c[0]; r.last=c[1]; r.email=c[2]; }
            else return null;
        } else {
            if (c.length === 4) { r.last=c[0]; r.first=c[1]; r.middle=c[2].replace('.','').toUpperCase(); r.email=c[3]; }
            else if (c.length === 3) { r.last=c[0]; r.first=c[1]; r.email=c[2]; }
            else return null;
        }
        return r;
    }

    /**********************
     * SINGLE LINE PARSER
     **********************/
    function parseSingleLineName(parts) {
        if (!parts.length) return null;
        let first='', middle='', last='';
        if (parts.length === 1) { first=parts[0]; }
        else if (parts.length === 2) { first=parts[0]; last=parts[1]; }
        else {
            const secondToLast = parts[parts.length - 2];
            if (secondToLast.replace('.','').length === 1) {
                middle = secondToLast.replace('.','').toUpperCase();
                first  = parts.slice(0, -2).join(' ');
                last   = parts[parts.length - 1];
            } else {
                first = parts.slice(0,-1).join(' ');
                last  = parts[parts.length - 1];
            }
        }
        return { first, middle, last };
    }

    /**********************
     * VALIDATION
     **********************/
    function validatePhone(phone) {
        return phone.replace(/\D/g,'').length === 10;
    }

    function showError(msg, refEl) {
        // Remove previous
        const prev = document.querySelector('.bsu-inline-error');
        if (prev) prev.remove();
        const d = document.createElement('div');
        d.className = 'bsu-alert bsu-alert-danger bsu-inline-error';
        d.textContent = msg;
        refEl.parentNode.insertBefore(d, refEl.nextSibling);
    }

    /**********************
     * VERIFICATION TABLE
     **********************/
    function renderVerificationTable(students) {
        let html = `<table class="bsu-table"><thead><tr>
            <th style="width:28px">#</th>
            <th>First Name</th>
            <th style="width:36px">MI</th>
            <th>Last Name</th>
            <th>Email</th>
        </tr></thead><tbody>`;

        students.forEach((s, i) => {
            html += `<tr>
                <td style="text-align:center;color:#6c757d">${i+1}</td>
                <td><input type="text" class="bsu-vf" data-i="${i}" value="${escHtml(s.first)}"></td>
                <td><input type="text" class="bsu-vm bsu-mi-input" data-i="${i}" value="${escHtml(s.middle)}" maxlength="1" placeholder="—"></td>
                <td><input type="text" class="bsu-vl" data-i="${i}" value="${escHtml(s.last)}"></td>
                <td><input type="text" class="bsu-ve bsu-email-input" data-i="${i}" value="${escHtml(s.email||'')}"></td>
            </tr>`;
        });
        html += '</tbody></table>';
        verifyContainer.innerHTML = html;

        verifyContainer.querySelectorAll('.bsu-vf').forEach(el => el.addEventListener('input', e => { parsedStudents[+e.target.dataset.i].first = e.target.value; }));
        verifyContainer.querySelectorAll('.bsu-vm').forEach(el => el.addEventListener('input', e => { const v=e.target.value.toUpperCase(); parsedStudents[+e.target.dataset.i].middle=v; e.target.value=v; }));
        verifyContainer.querySelectorAll('.bsu-vl').forEach(el => el.addEventListener('input', e => { parsedStudents[+e.target.dataset.i].last = e.target.value; }));
        verifyContainer.querySelectorAll('.bsu-ve').forEach(el => el.addEventListener('input', e => { parsedStudents[+e.target.dataset.i].email = e.target.value; }));
    }

    function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

    /**********************
     * PARSE BUTTON
     **********************/
    parseBtn.addEventListener('click', async () => {
        document.querySelectorAll('.bsu-inline-error').forEach(e => e.remove());

        if (!validatePhone(stuPhone.value)) {
            showError('⚠️ Please enter a valid 10-digit phone number.', stuPhone);
            stuPhone.focus();
            return;
        }

        let students = [];

        if (sourceUpload.checked) {
            // Use uploaded file data
            if (!uploadedStudents) {
                showError('⚠️ No file uploaded or no valid students found. Please upload a file first.', uploadZone);
                return;
            }
            students = uploadedStudents;
        } else {
            // Parse paste data
            const lines = stuData.value.trim().split('\n');
            const isColumnFmt = fmtColumns.checked;
            const order = columnOrderSel.value;

            lines.forEach((line, li) => {
                const trimmed = line.trim();
                if (!trimmed) return;

                if (isColumnFmt) {
                    const parts = trimmed.split('\t');
                    const parsed = parseExcelColumns(parts, order);
                    if (parsed && (!parsed.email || parsed.email.includes('@'))) {
                        students.push(parsed);
                    }
                } else {
                    const parts = trimmed.split(/\s+/);
                    if (parts.length < 2) return;
                    const email = parts[parts.length - 1];
                    if (!email.includes('@')) return;
                    const nameData = parseSingleLineName(parts.slice(0, -1));
                    if (nameData) students.push({ ...nameData, email });
                }
            });
        }

        if (!students.length) {
            showError('⚠️ No valid student data found. Check format and try again.', sourceUpload.checked ? uploadZone : stuData);
            return;
        }

        parsedStudents = students;
        renderVerificationTable(students);
        verifySection.style.display = 'block';
        verifySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /**********************
     * EDIT BUTTON
     **********************/
    editBtn.addEventListener('click', () => {
        verifySection.style.display = 'none';
        if (sourcePaste.checked) stuData.focus();
    });

    /**********************
     * HELPERS
     **********************/
    function waitForElement(id, timeout=3000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const t = setInterval(() => {
                const el = document.getElementById(id);
                if (el) { clearInterval(t); resolve(el); }
                if (Date.now()-start > timeout) { clearInterval(t); reject(); }
            }, 50);
        });
    }

    async function ensureRows(count) {
        const btn = document.getElementById('Add_Another');
        let current = document.querySelectorAll('[id^="stud_fn"]').length;
        while (current < count) {
            btn.click();
            await waitForElement(`stud_fn${current+1}`);
            current++;
        }
    }

    function populate(students, password, phone) {
        const digits = phone.replace(/\D/g,'');
        const ac = digits.slice(0,3), p1 = digits.slice(3,6), p2 = digits.slice(6,10);

        students.forEach((s, idx) => {
            const i = idx + 1;
            const email = s.email || '';
            [
                [`stud_fn${i}`,        s.first],
                [`stud_mi${i}`,        s.middle],
                [`stud_ln${i}`,        s.last],
                [`stud_email${i}`,     email],
                [`phone_areacode${i}`, ac],
                [`phone_first3${i}`,   p1],
                [`phone_last4${i}`,    p2],
                [`stud_username${i}`,  email],
                [`stud_password${i}`,  password],
                [`stud_verify${i}`,    password]
            ].forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val || '';
            });
        });
    }

    /**********************
     * CONFIRM BUTTON
     **********************/
    confirmBtn.addEventListener('click', async () => {
        if (!parsedStudents.length) { alert('No students to add.'); return; }

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:15px">sync</span> Adding…`;

        try {
            await ensureRows(parsedStudents.length);
            populate(parsedStudents, stuPassword.value, stuPhone.value);
            alert(`✅ Successfully populated ${parsedStudents.length} student(s) into the form!`);
            verifySection.style.display = 'none';
            stuData.value = '';
            uploadedStudents = null;
            uploadStatus.style.display = 'none';
            fileInput.value = '';
            parsedStudents = [];
        } catch (err) {
            alert('Error adding students. Please try again.');
            console.error(err);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Confirm &amp; Add to Form →';
        }
    });

})();