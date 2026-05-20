// ==UserScript==
// @name         Enrollware - Student Importer
// @namespace    https://www.enrollware.com/*
// @version      1.0
// @description  Upload a roster (photo, PDF, CSV, Excel), verify fields, auto-fill and submit students one by one into Enrollware's Add Student form
// @match        https://www.enrollware.com/admin/ts-class-edit.aspx*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
    'use strict';

    // ── Only run when the CCC client profile is present ──
    function isCCCPage() {
        const el = document.getElementById('profile-links');
        if (!el) return false;
        return el.textContent.includes('California Conservation Corp') && el.textContent.includes('1228');
    }

    // ── Wait for DOM + profile block, then inject ──
    function tryInit() {
        if (!isCCCPage()) return;
        if (document.getElementById('esi-import-btn')) return;
        const addBtn = document.getElementById('mainContent_addButton');
        if (!addBtn) return;
        injectImportButton(addBtn);
    }

    window.addEventListener('load', () => {
        setTimeout(tryInit, 600);
        setTimeout(tryInit, 1500);
        setTimeout(tryInit, 3000);
    });
    new MutationObserver(() => tryInit()).observe(document.body, { childList: true, subtree: true });

    // ── Gemini API key ──
    let GEMINI_API_KEY = GM_getValue('esiGeminiKey', '');

    /**********************
     * STYLES
     **********************/
    const style = document.createElement('style');
    style.textContent = `
        #esi-import-btn {
            display: inline-block;
            margin-left: 8px;
            padding: 4px 12px;
            background: #1a3a5c;
            color: #fff;
            border: 1px solid #12284a;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            vertical-align: middle;
            transition: background .15s;
        }
        #esi-import-btn:hover { background: #12284a; }

        #esi-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,.45);
            display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity .18s;
        }
        #esi-overlay.open { opacity: 1; pointer-events: all; }

        #esi-panel {
            background: #fff; border: 1px solid #dee2e6;
            border-radius: 8px; width: min(1060px, 97vw); max-height: 92vh;
            overflow: hidden; display: flex; flex-direction: column;
            box-shadow: 0 8px 32px rgba(0,0,0,.18);
            transform: translateY(12px); transition: transform .18s;
            font-family: inherit; font-size: 13px;
        }
        #esi-overlay.open #esi-panel { transform: translateY(0); }

        #esi-header {
            padding: 12px 16px; border-bottom: 1px solid #dee2e6;
            display: flex; align-items: center; justify-content: space-between;
            flex-shrink: 0; background: #1a3a5c;
        }
        #esi-header h5 {
            margin: 0; font-size: 14px; font-weight: 600; color: #fff;
        }
        #esi-header-btns { display: flex; align-items: center; gap: 6px; }

        .esi-hbtn {
            background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.3);
            color: #fff; cursor: pointer; width: 22px; height: 22px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 700; flex-shrink: 0;
            transition: background .15s; line-height: 1;
        }
        .esi-hbtn:hover { background: rgba(255,255,255,.28); }
        #esi-close span {
            display: block; width: 10px; height: 2px;
            background: #fff; border-radius: 2px;
        }

        #esi-body { overflow-y: auto; flex: 1; padding: 16px; }

        /* Upload zone */
        #esi-upload-zone {
            border: 2px dashed #ced4da; border-radius: 6px;
            padding: 24px; text-align: center; cursor: pointer;
            transition: border-color .15s, background .15s;
            margin-bottom: 10px; background: #fff;
        }
        #esi-upload-zone:hover, #esi-upload-zone.dragover {
            border-color: #1a3a5c; background: #f0f4f8;
        }
        #esi-upload-zone p { margin: 0; color: #6c757d; font-size: 12px; }
        #esi-upload-zone p strong { color: #1a3a5c; }
        #esi-upload-status {
            font-size: 12px; margin-bottom: 10px; display: none; line-height: 1.6;
        }
        #esi-upload-status.error { color: #dc3545; }
        #esi-file-input { display: none; }

        /* Bulk fill */
        #esi-bulk-fill {
            background: #fff8e1; border: 1px solid #ffe082;
            border-radius: 7px; padding: 12px 14px; margin-bottom: 14px;
        }
        #esi-bulk-fill-header {
            display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
        }
        .esi-bf-icon { font-size: 16px; flex-shrink: 0; }
        .esi-bf-title { font-size: 12px; font-weight: 700; color: #795548; flex: 1; }
        .esi-bf-desc { font-size: 11px; color: #a07840; margin-top: 1px; }
        #esi-bulk-fill-fields { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
        .esi-bf-group { display: flex; flex-direction: column; gap: 3px; }
        .esi-bf-group label { font-size: 10px; font-weight: 700; color: #795548; text-transform: uppercase; letter-spacing: .4px; }
        .esi-bf-group input {
            padding: 5px 8px; border: 1px solid #f0c040; border-radius: 4px;
            font-size: 12px; color: #212529; font-family: inherit;
            background: #fffde7; box-sizing: border-box;
        }
        .esi-bf-group input:focus { outline: none; border-color: #f9a825; box-shadow: 0 0 0 2px rgba(249,168,37,.18); }
        .bf-addr1 input { width: 170px; }
        .bf-addr2 input { width: 110px; }
        .bf-city  input { width: 110px; }
        .bf-state input { width: 38px; text-align: center; text-transform: uppercase; }
        .bf-zip   input { width: 58px; }
        .bf-phone input { width: 100px; }
        #esi-bulk-apply-btn {
            padding: 6px 16px; background: #f9a825; border: 1px solid #f57f17;
            color: #fff; border-radius: 5px; font-size: 12px; font-weight: 700;
            cursor: pointer; font-family: inherit; transition: background .12s;
            align-self: flex-end; white-space: nowrap; flex-shrink: 0;
        }
        #esi-bulk-apply-btn:hover { background: #f57f17; }
        #esi-bulk-apply-confirm { display: none; font-size: 11px; color: #388e3c; font-weight: 600; margin-top: 6px; }

        /* Verify section */
        #esi-verify-section { display: none; margin-top: 4px; }
        .esi-verify-title { font-size: 13px; font-weight: 700; color: #212529; margin: 0 0 10px; }
        .esi-alert-info {
            background: #cfe2ff; border: 1px solid #b6d4fe; color: #084298;
            padding: 9px 12px; border-radius: 5px; font-size: 12px;
            line-height: 1.5; margin-bottom: 12px;
        }
        #esi-record-count { font-size: 11px; color: #6c757d; margin-bottom: 8px; }

        /* Table */
        .esi-table-wrap { overflow-x: auto; margin-bottom: 12px; }
        .esi-table { width: 100%; border-collapse: collapse; font-size: 11px; color: #212529; }
        .esi-table thead th {
            background: #1a3a5c; color: #fff;
            border: 1px solid #12284a; border-bottom: 2px solid #12284a;
            padding: 6px; font-size: 10px; font-weight: 700;
            text-transform: uppercase; letter-spacing: .4px;
            text-align: left; white-space: nowrap;
        }
        .esi-table tbody td { border: 1px solid #f0f0f0; padding: 3px 4px; vertical-align: middle; }
        .esi-table tbody tr:hover td { background: #f0f4f8; }
        .esi-table input {
            width: 100%; padding: 3px 5px; border: 1px solid #ced4da;
            border-radius: 3px; font-size: 11px; color: #212529;
            font-family: inherit; box-sizing: border-box;
        }
        .esi-table input:focus { outline: none; border-color: #1a3a5c; box-shadow: 0 0 0 2px rgba(26,58,92,.12); }
        .esi-table input.esi-invalid {
            border-color: #dc3545 !important;
            background: #fff5f5 !important;
            box-shadow: 0 0 0 2px rgba(220,53,69,.15) !important;
        }
        .esi-state-input { width: 34px !important; text-align: center; text-transform: uppercase; }
        .esi-zip-input   { width: 52px !important; }
        .esi-phone-input { width: 88px !important; }

        /* Row status badge */
        .esi-row-status {
            display: inline-block; font-size: 10px; font-weight: 700;
            padding: 2px 6px; border-radius: 3px; white-space: nowrap;
        }
        .esi-row-status.pending  { background: #e2e8f0; color: #4a5568; }
        .esi-row-status.success  { background: #d4edda; color: #155724; }
        .esi-row-status.error    { background: #f8d7da; color: #58151c; }
        .esi-row-status.importing { background: #cfe2ff; color: #084298; }

        .esi-del-btn {
            background: none; border: none; cursor: pointer;
            color: #dc3545; font-size: 15px; line-height: 1;
            padding: 2px 4px; border-radius: 3px; transition: background .12s;
        }
        .esi-del-btn:hover { background: #f8d7da; }

        #esi-add-row-btn {
            background: #fff; border: 1px dashed #1a3a5c; color: #1a3a5c;
            border-radius: 5px; padding: 6px 12px; font-size: 12px;
            font-weight: 600; cursor: pointer; width: 100%; margin-bottom: 10px;
            transition: background .12s;
        }
        #esi-add-row-btn:hover { background: #f0f4f8; }

        #esi-validation-msg {
            display: none; background: #f8d7da; border: 1px solid #f1aeb5;
            color: #58151c; padding: 9px 12px; border-radius: 5px;
            font-size: 12px; margin-bottom: 10px; font-weight: 600;
        }

        /* Import progress banner */
        #esi-progress-banner {
            display: none; background: #1a3a5c; color: #fff;
            border-radius: 7px; padding: 14px 16px; margin-bottom: 14px;
        }
        #esi-progress-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
        #esi-progress-bar-wrap {
            background: rgba(255,255,255,.2); border-radius: 4px;
            height: 8px; margin-bottom: 8px; overflow: hidden;
        }
        #esi-progress-bar {
            height: 100%; background: #7dffb3; border-radius: 4px;
            width: 0%; transition: width .3s;
        }
        #esi-progress-status { font-size: 12px; color: rgba(255,255,255,.8); }
        #esi-progress-stop {
            margin-top: 10px; padding: 5px 14px; background: rgba(255,255,255,.15);
            border: 1px solid rgba(255,255,255,.3); color: #fff;
            border-radius: 4px; font-size: 12px; cursor: pointer;
            font-family: inherit;
        }
        #esi-progress-stop:hover { background: rgba(255,255,255,.25); }

        /* Import complete banner */
        #esi-complete-banner {
            display: none; background: #d4edda; border: 1px solid #a3d9b1;
            border-radius: 7px; padding: 18px 20px; margin-bottom: 14px;
            text-align: center;
        }
        #esi-complete-banner .esi-complete-icon { font-size: 32px; margin-bottom: 8px; }
        #esi-complete-banner .esi-complete-title {
            font-size: 15px; font-weight: 700; color: #155724; margin-bottom: 4px;
        }
        #esi-complete-banner .esi-complete-sub {
            font-size: 12px; color: #1e7e34; margin-bottom: 14px;
        }
        #esi-complete-close-btn {
            padding: 8px 24px; background: #198754; color: #fff;
            border: none; border-radius: 5px; font-size: 13px; font-weight: 700;
            cursor: pointer; font-family: inherit; transition: background .12s;
        }
        #esi-complete-close-btn:hover { background: #146c43; }

        .esi-btn {
            padding: 7px 16px; border-radius: 5px; font-size: 13px;
            font-weight: 600; cursor: pointer; border: 1px solid transparent;
            font-family: inherit; transition: background .12s, color .12s;
            display: inline-flex; align-items: center; gap: 6px;
        }
        .esi-btn-secondary { background:#fff; color:#6c757d; border-color:#6c757d; }
        .esi-btn-secondary:hover { background:#6c757d; color:#fff; }
        .esi-btn-primary { background:#1a3a5c; color:#fff; border-color:#1a3a5c; width:100%; justify-content:center; }
        .esi-btn-primary:hover { background:#12284a; }
        .esi-btn-primary:disabled { opacity:.55; cursor:not-allowed; background:#6c757d; border-color:#6c757d; }
        .esi-btn-success { background:#198754; color:#fff; border-color:#198754; flex:1; justify-content:center; }
        .esi-btn-success:hover { background:#146c43; }
        .esi-actions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }

        .esi-alert-danger {
            background:#f8d7da; border:1px solid #f1aeb5; color:#58151c;
            padding:9px 12px; border-radius:5px; font-size:12px; margin-bottom:10px;
        }

        /* ── GUIDED TOUR ── */
        #esi-tour-spotlight {
            position: fixed; z-index: 1000000;
            box-shadow: 0 0 0 9999px rgba(0,0,0,.62);
            border-radius: 6px; pointer-events: none;
            transition: top .3s, left .3s, width .3s, height .3s;
        }
        #esi-tour-box {
            position: fixed; z-index: 1000001;
            background: #1a3a5c; color: #fff;
            border-radius: 10px; padding: 18px 20px 14px;
            width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,.35);
            font-family: inherit; font-size: 13px; line-height: 1.5;
        }
        #esi-tour-box h4 { margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #fff; }
        #esi-tour-box p  { margin: 0 0 14px; color: rgba(255,255,255,.88); font-size: 12px; }
        #esi-tour-footer {
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        #esi-tour-dot-row { display: flex; gap: 5px; align-items: center; }
        .esi-tour-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: rgba(255,255,255,.3); transition: background .2s;
        }
        .esi-tour-dot.active { background: #fff; }
        #esi-tour-btns { display: flex; gap: 6px; }
        .esi-tour-btn {
            padding: 5px 13px; border-radius: 5px; font-size: 12px;
            font-weight: 600; cursor: pointer; border: 1px solid transparent;
            font-family: inherit; transition: background .12s;
        }
        .esi-tour-btn-skip {
            background: transparent; color: rgba(255,255,255,.6);
            border-color: rgba(255,255,255,.25);
        }
        .esi-tour-btn-skip:hover { background: rgba(255,255,255,.1); color: #fff; }
        .esi-tour-btn-next { background: #fff; color: #1a3a5c; border-color: #fff; }
        .esi-tour-btn-next:hover { background: #e8eef5; }
    `;
    document.head.appendChild(style);

    /**********************
     * INJECT BUTTON
     **********************/
    function injectImportButton(addBtn) {
        const btn = document.createElement('button');
        btn.id = 'esi-import-btn';
        btn.type = 'button';
        btn.textContent = '⬆ Import Students';
        btn.addEventListener('click', openPanel);
        addBtn.parentNode.insertBefore(btn, addBtn.nextSibling);
        buildModal();
    }

    /**********************
     * BUILD MODAL
     **********************/
    function buildModal() {
        const overlay = document.createElement('div');
        overlay.id = 'esi-overlay';
        overlay.innerHTML = `
            <div id="esi-panel">
                <div id="esi-header">
                    <h5>⬆ Student Importer</h5>
                    <div id="esi-header-btns">
                        <button class="esi-hbtn" id="esi-key-btn" title="Update Gemini API Key">⚿</button>
                        <button class="esi-hbtn" id="esi-help-btn" title="Help / Tour">?</button>
                        <button class="esi-hbtn" id="esi-close" title="Close"><span></span></button>
                    </div>
                </div>
                <div id="esi-body">

                    <div id="esi-upload-zone">
                        <div style="font-size:28px;margin-bottom:6px">📋</div>
                        <p><strong>Click to browse</strong> or drag & drop</p>
                        <p style="margin-top:4px">CSV · Excel · PDF · JPG · PNG · WebP · HEIC</p>
                        <p style="margin-top:4px;font-size:11px">Multiple files supported — all records merged</p>
                    </div>
                    <div id="esi-upload-status"></div>
                    <input type="file" id="esi-file-input"
                        accept=".csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif" multiple>

                    <button id="esi-parse-btn" class="esi-btn esi-btn-primary" style="margin-bottom:12px">
                        Parse &amp; Verify Records
                    </button>

                    <div id="esi-verify-section">
                        <p class="esi-verify-title">Verify Records</p>
                        <div class="esi-alert-info">
                            <strong>📋 Review &amp; Edit</strong> — click any cell to modify. Use + to add rows, × to remove. Then click <em>Start Import</em> to auto-fill and submit each student.
                        </div>

                        <div id="esi-bulk-fill">
                            <div id="esi-bulk-fill-header">
                                <span class="esi-bf-icon">⚠️</span>
                                <div>
                                    <div class="esi-bf-title">Address &amp; contact info missing — fill all rows at once</div>
                                    <div class="esi-bf-desc">Enter shared values and click Apply. Only blank cells will be updated.</div>
                                </div>
                            </div>
                            <div id="esi-bulk-fill-fields">
                                <div class="esi-bf-group bf-addr1"><label>Address 1</label><input id="esi-bf-addr1" type="text" placeholder="123 Main St"></div>
                                <div class="esi-bf-group bf-addr2"><label>Address 2</label><input id="esi-bf-addr2" type="text" placeholder="Suite 100"></div>
                                <div class="esi-bf-group bf-city"><label>City</label><input id="esi-bf-city" type="text" placeholder="Sacramento"></div>
                                <div class="esi-bf-group bf-state"><label>State</label><input id="esi-bf-state" type="text" placeholder="CA" maxlength="2"></div>
                                <div class="esi-bf-group bf-zip"><label>Zip</label><input id="esi-bf-zip" type="text" placeholder="95814" maxlength="5"></div>
                                <div class="esi-bf-group bf-phone"><label>Phone</label><input id="esi-bf-phone" type="text" placeholder="9165551234"></div>
                                <button id="esi-bulk-apply-btn">Apply to All ↓</button>
                            </div>
                            <div id="esi-bulk-apply-confirm">✅ Applied to all blank cells.</div>
                        </div>

                        <!-- Progress banner -->
                        <div id="esi-progress-banner">
                            <div id="esi-progress-title">Importing students…</div>
                            <div id="esi-progress-bar-wrap"><div id="esi-progress-bar"></div></div>
                            <div id="esi-progress-status"></div>
                            <button id="esi-progress-stop">⏹ Stop Import</button>
                        </div>

                        <!-- Import complete banner -->
                        <div id="esi-complete-banner">
                            <div class="esi-complete-title">Import Complete!</div>
                            <div class="esi-complete-sub" id="esi-complete-sub"></div>
                            <button id="esi-complete-close-btn">Close Window</button>
                        </div>

                        <div id="esi-record-count"></div>
                        <div class="esi-table-wrap">
                            <table class="esi-table">
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
                                        <th style="width:68px">Status</th>
                                        <th style="width:28px"></th>
                                    </tr>
                                </thead>
                                <tbody id="esi-tbody"></tbody>
                            </table>
                        </div>
                        <button id="esi-add-row-btn">+ Add Row</button>
                        <div id="esi-validation-msg"></div>
                        <div class="esi-actions">
                            <button id="esi-edit-btn" class="esi-btn esi-btn-secondary">← Upload Again</button>
                            <button id="esi-import-start-btn" class="esi-btn esi-btn-success">⬆ Start Import</button>
                        </div>
                    </div>

                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        wireEvents(overlay);
    }

    /**********************
     * STATE
     **********************/
    let uploadedRecords = null;
    let parsedRecords   = [];
    let importStopped   = false;

    /**********************
     * WIRE EVENTS
     **********************/
    function wireEvents(overlay) {
        const uploadZone    = document.getElementById('esi-upload-zone');
        const fileInput     = document.getElementById('esi-file-input');
        const uploadStatus  = document.getElementById('esi-upload-status');
        const parseBtn      = document.getElementById('esi-parse-btn');
        const verifySection = document.getElementById('esi-verify-section');
        const tbody         = document.getElementById('esi-tbody');
        const editBtn       = document.getElementById('esi-edit-btn');
        const addRowBtn     = document.getElementById('esi-add-row-btn');
        const recordCount   = document.getElementById('esi-record-count');
        const bulkApplyBtn  = document.getElementById('esi-bulk-apply-btn');
        const bulkConfirm   = document.getElementById('esi-bulk-apply-confirm');
        const importStartBtn = document.getElementById('esi-import-start-btn');
        const progressBanner  = document.getElementById('esi-progress-banner');
        const progressBar     = document.getElementById('esi-progress-bar');
        const progressStatus  = document.getElementById('esi-progress-status');
        const progressStop    = document.getElementById('esi-progress-stop');
        const completeBanner  = document.getElementById('esi-complete-banner');
        const completeSub     = document.getElementById('esi-complete-sub');
        const completeCloseBtn = document.getElementById('esi-complete-close-btn');

        completeCloseBtn.addEventListener('click', closePanel);
        const validationMsg  = document.getElementById('esi-validation-msg');

        // Close
        document.getElementById('esi-close').addEventListener('click', closePanel);
        overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

        // Key button
        document.getElementById('esi-key-btn').addEventListener('click', () => {
            const newKey = prompt('Enter your Gemini API key:', GEMINI_API_KEY ? '••••••••••••••••' : '');
            if (newKey && newKey !== '••••••••••••••••') {
                GEMINI_API_KEY = newKey.trim();
                GM_setValue('esiGeminiKey', GEMINI_API_KEY);
                const btn = document.getElementById('esi-key-btn');
                const orig = btn.textContent;
                btn.textContent = '✓';
                btn.style.color = '#7dffb3';
                setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
            }
        });

        // Help tour
        document.getElementById('esi-help-btn').addEventListener('click', startTour);

        // Upload zone
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', e => {
            e.preventDefault(); uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files));
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handleFiles(Array.from(fileInput.files));
        });

        // Bulk fill
        document.getElementById('esi-bf-state').addEventListener('input', function () { this.value = this.value.toUpperCase(); });
        bulkApplyBtn.addEventListener('click', () => {
            const vals = {
                addr1: document.getElementById('esi-bf-addr1').value.trim(),
                addr2: document.getElementById('esi-bf-addr2').value.trim(),
                city:  document.getElementById('esi-bf-city').value.trim(),
                state: document.getElementById('esi-bf-state').value.trim().toUpperCase(),
                zip:   document.getElementById('esi-bf-zip').value.trim(),
                phone: document.getElementById('esi-bf-phone').value.trim(),
            };
            if (!Object.values(vals).some(v => v)) return;
            let applied = false;
            tbody.querySelectorAll('tr').forEach(tr => {
                const i = +tr.dataset.i;
                Object.entries(vals).forEach(([field, val]) => {
                    if (!val) return;
                    if (!(parsedRecords[i][field] || '').trim()) {
                        parsedRecords[i][field] = val;
                        const inp = tr.querySelector(`input[data-f="${field}"]`);
                        if (inp) inp.value = val;
                        applied = true;
                    }
                });
            });
            if (applied) {
                bulkConfirm.style.display = 'block';
                setTimeout(() => { bulkConfirm.style.display = 'none'; }, 3000);
            }
        });

        // Parse button
        parseBtn.addEventListener('click', () => {
            document.querySelectorAll('.esi-inline-error').forEach(e => e.remove());
            if (!uploadedRecords) {
                const d = document.createElement('div');
                d.className = 'esi-alert-danger esi-inline-error';
                d.textContent = '⚠️ Please upload a file first.';
                uploadZone.parentNode.insertBefore(d, uploadZone);
                return;
            }
            parsedRecords = uploadedRecords.map(r => ({ ...r }));
            renderTable(parsedRecords);
            verifySection.style.display = 'block';
            verifySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        // Table events
        tbody.addEventListener('input', e => {
            const inp = e.target.closest('.esi-f');
            if (!inp) return;
            const i = +inp.closest('tr').dataset.i;
            const field = inp.dataset.f;
            let v = inp.value;
            if (field === 'state') { v = v.toUpperCase(); inp.value = v; }
            parsedRecords[i][field] = v;
            if (inp.classList.contains('esi-invalid') && v.trim()) inp.classList.remove('esi-invalid');
        });
        tbody.addEventListener('click', e => {
            const btn = e.target.closest('.esi-del-btn');
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

        editBtn.addEventListener('click', () => {
            verifySection.style.display = 'none';
            uploadZone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        progressStop.addEventListener('click', () => { importStopped = true; });

        // Import start
        importStartBtn.addEventListener('click', async () => {
            validationMsg.style.display = 'none';
            const { emptyByField, totalEmpty } = validateRecords();
            if (totalEmpty > 0) {
                const fieldLabels = { last:'Last Name', first:'First Name', email:'Email', addr1:'Address 1', city:'City', state:'State', zip:'Zip', phone:'Phone' };
                const fieldList = Object.entries(emptyByField).map(([f,n]) => `${fieldLabels[f]} (${n})`).join(', ');
                validationMsg.textContent = `⚠️ ${totalEmpty} empty cell${totalEmpty !== 1 ? 's' : ''} must be filled before importing: ${fieldList}`;
                validationMsg.style.display = 'block';
                const firstInvalid = tbody.querySelector('input.esi-invalid');
                if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
            await runImport(parsedRecords, progressBanner, progressBar, progressStatus, completeBanner, completeSub);
        });

        function showStatus(msg, isError = false) {
            uploadStatus.innerHTML = msg;
            uploadStatus.className = isError ? 'error' : '';
            uploadStatus.style.display = 'block';
        }

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
                    const msg = err.message.length > 120 ? err.message.slice(0, 120) + '…' : err.message;
                    lines.push(`❌ "${file.name}" — ${msg}`);
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

        function renderTable(records) {
            tbody.innerHTML = '';
            records.forEach((r, i) => tbody.appendChild(renderRow(r, i)));
            updateCount();
        }

        function updateCount() {
            recordCount.textContent = `${parsedRecords.length} record${parsedRecords.length !== 1 ? 's' : ''}`;
        }

        function renumberRows() {
            tbody.querySelectorAll('tr').forEach((tr, i) => {
                tr.dataset.i = i;
                tr.querySelector('.esi-row-num').textContent = i + 1;
            });
            updateCount();
        }

        function validateRecords() {
            tbody.querySelectorAll('input.esi-invalid').forEach(i => i.classList.remove('esi-invalid'));
            const required = ['last','first','email','addr1','city','state','zip','phone'];
            const emptyByField = {};
            let totalEmpty = 0;
            parsedRecords.forEach((r, ri) => {
                required.forEach(f => {
                    if (!(r[f] || '').trim()) {
                        const tr = tbody.querySelector(`tr[data-i="${ri}"]`);
                        if (tr) {
                            const inp = tr.querySelector(`input[data-f="${f}"]`);
                            if (inp) inp.classList.add('esi-invalid');
                        }
                        emptyByField[f] = (emptyByField[f] || 0) + 1;
                        totalEmpty++;
                    }
                });
            });
            return { emptyByField, totalEmpty };
        }

        async function runImport(records, banner, bar, status, completeBanner, completeSub) {
            importStopped = false;
            banner.style.display = 'block';
            completeBanner.style.display = 'none';
            importStartBtn.disabled = true;
            editBtn.disabled = true;
            addRowBtn.disabled = true;

            let done = 0, errors = 0;
            const total = records.length;

            for (let i = 0; i < total; i++) {
                if (importStopped) {
                    status.textContent = `⏹ Stopped after ${done} of ${total} students.`;
                    break;
                }
                const r = records[i];
                const tr = tbody.querySelector(`tr[data-i="${i}"]`);
                setRowStatus(tr, 'importing', 'Submitting…');
                status.textContent = `Submitting ${i + 1} of ${total}: ${r.first} ${r.last}…`;

                try {
                    await submitStudent(r);
                    done++;
                    setRowStatus(tr, 'success', '✅ Done');
                } catch (err) {
                    errors++;
                    setRowStatus(tr, 'error', '❌ Failed');
                    console.warn('[ESI] Failed to submit', r, err);
                }

                bar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;

                if (i < total - 1 && !importStopped) {
                    await delay(1200);
                }
            }

            if (!importStopped) {
                status.textContent = `✅ Import complete — ${done} submitted, ${errors} failed.`;
                completeSub.textContent = `${done} student${done !== 1 ? 's' : ''} submitted successfully${errors ? `, ${errors} failed` : ''}.`;
                completeBanner.style.display = 'block';
                completeBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            importStartBtn.disabled = false;
            editBtn.disabled = false;
            addRowBtn.disabled = false;
        }

        function setRowStatus(tr, cls, label) {
            if (!tr) return;
            const cell = tr.querySelector('.esi-status-cell');
            if (cell) cell.innerHTML = `<span class="esi-row-status ${cls}">${label}</span>`;
        }
    }

    /**********************
     * FORM SUBMIT LOGIC
     * Fills the page's native Add Student form and clicks the button.
     * Uses the existing ASP.NET WebForms postback mechanism.
     **********************/
    async function submitStudent(r) {
        // Fill fields
        setField('mainContent_fname', r.first);
        setField('mainContent_lname', r.last);
        setField('mainContent_emailAddress', r.email);
        setField('mainContent_primaryPhone', r.phone);
        setField('mainContent_addr1', r.addr1);
        setField('mainContent_addr2', r.addr2);
        setField('mainContent_city', r.city);
        setField('mainContent_zip', r.zip);

        // State dropdown
        const stateEl = document.getElementById('mainContent_StateSelect');
        if (stateEl) {
            const opt = Array.from(stateEl.options).find(o => o.value === r.state.toUpperCase());
            if (opt) stateEl.value = opt.value;
        }

        // Status: leave as Pending (default)
        // Score: leave blank

        // Click Add Student button
        const addBtn = document.getElementById('mainContent_addButton');
        if (!addBtn) throw new Error('Add Student button not found');
        addBtn.click();

        // Wait for the postback to complete (page will refresh its content)
        await waitForPostback();
    }

    function setField(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value || '';
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function waitForPostback() {
        return new Promise(resolve => {
            // ASP.NET WebForms: Sys.WebForms.PageRequestManager fires pageLoaded after partial postback
            let resolved = false;
            function done() {
                if (resolved) return;
                resolved = true;
                resolve();
            }
            // Try to hook into the ScriptManager PageRequestManager if available
            if (window.Sys && Sys.WebForms && Sys.WebForms.PageRequestManager) {
                const mgr = Sys.WebForms.PageRequestManager.getInstance();
                const handler = () => { mgr.remove_pageLoaded(handler); done(); };
                mgr.add_pageLoaded(handler);
                // Fallback timeout in case hook fires before we register
                setTimeout(done, 4000);
            } else {
                // Non-partial postback fallback: wait for DOM to settle
                setTimeout(done, 2500);
            }
        });
    }

    /**********************
     * OPEN / CLOSE
     **********************/
    function openPanel() {
        if (!GEMINI_API_KEY) {
            GEMINI_API_KEY = prompt('Enter your Gemini API key to enable roster parsing:');
            if (GEMINI_API_KEY) GM_setValue('esiGeminiKey', GEMINI_API_KEY);
        }
        document.getElementById('esi-overlay').classList.add('open');
    }
    function closePanel() {
        document.getElementById('esi-overlay').classList.remove('open');
        endTour();
    }

    /**********************
     * GUIDED TOUR
     **********************/
    const TOUR_STEPS = [
        {
            title: '⬆ Student Importer',
            text: 'This tool lets you upload a roster document and automatically fill in the Add Student form for each person — one at a time. Let\'s walk through the workflow.',
            target: '#esi-panel',
            pos: 'center'
        },
        {
            title: '① Upload Your Roster',
            text: 'Click here (or drag & drop) to upload one or more files. Supported formats: CSV, Excel, PDF, or any image (JPG, PNG, WebP, HEIC). Multiple files are merged into one student list.',
            target: '#esi-upload-zone',
            pos: 'below'
        },
        {
            title: '② Parse & Verify',
            text: 'Click this button after uploading. Images and PDFs are sent to Gemini AI for field extraction. CSV and Excel files are parsed locally — no AI needed.',
            target: '#esi-parse-btn',
            pos: 'below'
        },
        {
            title: '③ Bulk Fill (when needed)',
            text: 'If the roster didn\'t include address or phone info, this yellow banner appears. Enter the shared info once and click "Apply to All" — only blank cells get filled so existing data is never overwritten.',
            target: '#esi-bulk-fill',
            pos: 'below'
        },
        {
            title: '④ Review & Edit the Table',
            text: 'Every extracted record appears here. Click any cell to edit it directly. Use × to remove a row, or "+ Add Row" to insert a blank one. Each row shows its import status after submission.',
            target: '.esi-table-wrap',
            pos: 'above'
        },
        {
            title: '⑤ Start Import',
            text: 'Click "Start Import" to begin. The script fills the Add Student form for each person, clicks the button, waits for the page to respond, then moves to the next. You can stop at any time.',
            target: '.esi-actions',
            pos: 'above'
        },
        {
            title: '⑥ Import Progress',
            text: 'A progress bar tracks each submission. Each row in the table shows ✅ Done or ❌ Failed so you know exactly what happened. Click Stop Import to pause at any time.',
            target: '#esi-progress-banner',
            pos: 'below'
        }
    ];

    let tourSpotlight = null, tourBox = null, tourStep = 0;

    function startTour() {
        endTour();
        tourStep = 0;
        tourSpotlight = document.createElement('div');
        tourSpotlight.id = 'esi-tour-spotlight';
        document.body.appendChild(tourSpotlight);
        tourBox = document.createElement('div');
        tourBox.id = 'esi-tour-box';
        document.body.appendChild(tourBox);
        renderTourStep();
    }

    function renderTourStep() {
        const step  = TOUR_STEPS[tourStep];
        const total = TOUR_STEPS.length;
        const targetEl = document.querySelector(step.target);

        if (!targetEl || step.pos === 'center') {
            tourSpotlight.style.cssText = 'position:fixed;top:50%;left:50%;width:0;height:0;box-shadow:0 0 0 9999px rgba(0,0,0,.62);border-radius:0';
        } else {
            const r = targetEl.getBoundingClientRect();
            const pad = 8;
            tourSpotlight.style.cssText = `position:fixed;top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad*2}px;height:${r.height + pad*2}px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);border-radius:6px;pointer-events:none;transition:top .3s,left .3s,width .3s,height .3s;`;
        }

        const dots = Array.from({ length: total }, (_, i) =>
            `<div class="esi-tour-dot ${i === tourStep ? 'active' : ''}"></div>`
        ).join('');
        const isLast = tourStep === total - 1;

        tourBox.innerHTML = `
            <h4>${step.title}</h4>
            <p>${step.text}</p>
            <div id="esi-tour-footer">
                <div id="esi-tour-dot-row">${dots}</div>
                <div id="esi-tour-btns">
                    <button class="esi-tour-btn esi-tour-btn-skip" id="esi-tour-skip">Skip</button>
                    <button class="esi-tour-btn esi-tour-btn-next" id="esi-tour-next">${isLast ? 'Done ✓' : 'Next →'}</button>
                </div>
            </div>
        `;

        positionTourBox(step, targetEl);
        document.getElementById('esi-tour-skip').onclick = endTour;
        document.getElementById('esi-tour-next').onclick = () => {
            if (tourStep < total - 1) { tourStep++; renderTourStep(); }
            else endTour();
        };
    }

    function positionTourBox(step, targetEl) {
        tourBox.style.top = '50%';
        tourBox.style.left = '50%';
        tourBox.style.transform = 'translate(-50%,-50%)';
        if (!targetEl || step.pos === 'center') return;
        requestAnimationFrame(() => {
            const r = targetEl.getBoundingClientRect();
            const bw = tourBox.offsetWidth || 300;
            const bh = tourBox.offsetHeight || 160;
            const vw = window.innerWidth, vh = window.innerHeight, gap = 16;
            tourBox.style.transform = 'none';
            let top, left;
            if (step.pos === 'below') {
                top  = r.bottom + gap;
                left = Math.min(Math.max(r.left + r.width / 2 - bw / 2, gap), vw - bw - gap);
            } else {
                top  = r.top - bh - gap;
                left = Math.min(Math.max(r.left + r.width / 2 - bw / 2, gap), vw - bw - gap);
            }
            top = Math.max(gap, Math.min(top, vh - bh - gap));
            tourBox.style.top  = top  + 'px';
            tourBox.style.left = left + 'px';
        });
    }

    function endTour() {
        if (tourSpotlight) { tourSpotlight.remove(); tourSpotlight = null; }
        if (tourBox)       { tourBox.remove();       tourBox = null; }
    }

    /**********************
     * TABLE HELPERS
     **********************/
    function emptyRecord() {
        return { last:'', first:'', email:'', addr1:'', addr2:'', city:'', state:'', zip:'', phone:'' };
    }

    function renderRow(r, i) {
        const tr = document.createElement('tr');
        tr.dataset.i = i;
        tr.innerHTML = `
            <td style="text-align:center;color:#6c757d;font-size:11px" class="esi-row-num">${i+1}</td>
            <td><input class="esi-f" data-f="last"  value="${esc(r.last)}"></td>
            <td><input class="esi-f" data-f="first" value="${esc(r.first)}"></td>
            <td><input class="esi-f" data-f="email" value="${esc(r.email)}"></td>
            <td><input class="esi-f" data-f="addr1" value="${esc(r.addr1)}"></td>
            <td><input class="esi-f" data-f="addr2" value="${esc(r.addr2)}"></td>
            <td><input class="esi-f" data-f="city"  value="${esc(r.city)}"></td>
            <td><input class="esi-f esi-state-input" data-f="state" value="${esc(r.state)}" maxlength="2"></td>
            <td><input class="esi-f esi-zip-input"   data-f="zip"   value="${esc(r.zip)}"   maxlength="5"></td>
            <td><input class="esi-f esi-phone-input" data-f="phone" value="${esc(r.phone)}"></td>
            <td class="esi-status-cell"><span class="esi-row-status pending">Pending</span></td>
            <td style="text-align:center"><button class="esi-del-btn" title="Remove row">×</button></td>
        `;
        return tr;
    }

    function esc(s) {
        return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
    }

    /**********************
     * FILE PARSERS
     **********************/
    const IMAGE_TYPES = { '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.heic':'image/jpeg' };

    async function processFile(file) {
        const fname = file.name.toLowerCase();
        const ext   = '.' + fname.split('.').pop();
        if (fname.endsWith('.csv'))                        return await parseCSV(file);
        if (fname.endsWith('.xlsx') || fname.endsWith('.xls')) return await parseExcel(file);
        if (fname.endsWith('.pdf'))                        return await parsePDF(file);
        if (IMAGE_TYPES[ext])                              return await parseVision(file, IMAGE_TYPES[ext]);
        throw new Error('Unsupported file type');
    }

    async function parseCSV(file) {
        const text    = await file.text();
        const lines   = text.trim().split(/\r?\n/);
        if (!lines.length) return [];
        const delim   = lines[0].includes('\t') ? '\t' : ',';
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
            addr1: get(row, 'address 1','addr1','address1','street'),
            addr2: get(row, 'address 2','addr2','address2'),
            city:  get(row, 'city'),
            state: get(row, 'state'),
            zip:   get(row, 'zip'),
            phone: get(row, 'phone'),
        })).filter(r => r.last || r.first || r.email);
    }

    function splitCSVRow(line, delim) {
        const cols = []; let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') inQ = !inQ;
            else if (ch === delim && !inQ) { cols.push(cur); cur = ''; }
            else cur += ch;
        }
        cols.push(cur);
        return cols.map(c => c.replace(/^"|"$/g,'').trim());
    }

    async function parseExcel(file) {
        if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
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
            addr1: get(row, 'address 1','addr1','address1','street'),
            addr2: get(row, 'address 2','addr2','address2'),
            city:  get(row, 'city'),
            state: get(row, 'state'),
            zip:   get(row, 'zip'),
            phone: get(row, 'phone'),
        })).filter(r => r.last || r.first || r.email);
    }

    async function parsePDF(file) {
        try {
            const recs = await parsePDFText(file);
            if (recs.length) return recs;
        } catch(e) {}
        const buf = await file.arrayBuffer();
        return await callGemini(arrayBufferToBase64(buf), 'application/pdf');
    }

    async function parsePDFText(file) {
        if (!window.pdfjsLib) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const buf  = await file.arrayBuffer();
        const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
        let text   = '';
        for (let p = 1; p <= pdf.numPages; p++) {
            const page    = await pdf.getPage(p);
            const content = await page.getTextContent();
            text += content.items.map(i => i.str).join(' ') + '\n';
        }
        const matches = [...text.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)];
        if (!matches.length) return [];
        return matches.map(m => ({ last:'', first:'', email: m[0], addr1:'', addr2:'', city:'', state:'', zip:'', phone:'' }));
    }

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
        if (!GEMINI_API_KEY) throw new Error('Gemini API key not set.');

        const prompt = `Extract every student/participant record from this document. The document may be a roster, sign-in sheet, class list, screenshot, PDF, or any format — handwritten or printed.

Return ONLY a raw JSON array with no markdown, no explanation, no code fences:
[{"last":"Doe","first":"Jane","email":"jane@example.com","addr1":"123 Main St","addr2":"","city":"Sacramento","state":"CA","zip":"95814","phone":"9165551234"},...]

Rules:
- Extract EVERY person listed — do not skip anyone even if some fields are missing
- Parse full names: first word = first name, last word = last name
- Recognize labeled fields in any format: Name, E-Mail, Email, Work#, Phone, Cell, Mobile, Address, Addr, City, State, Zip, etc.
- If a field is not present, use empty string ""
- email: look for @ symbol — fix obvious OCR errors
- phone: digits only, no formatting
- state: 2-letter uppercase abbreviation only
- zip: 5 digits only
- Do NOT invent or guess data that is not visible in the document`;

        const body = JSON.stringify({
            contents: [{ parts: [
                { inline_data: { mime_type: mediaType, data: base64 } },
                { text: prompt }
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 }
        });

        const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];
        let lastErr = null;

        for (const model of models) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            try {
                const text = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'POST', url,
                        headers: { 'Content-Type': 'application/json' },
                        data: body, timeout: 60000,
                        onload: r => {
                            if (r.status >= 200 && r.status < 300) { resolve(r.responseText); return; }
                            let detail = '';
                            try { detail = JSON.parse(r.responseText)?.error?.message || ''; } catch(e) {}
                            reject(new Error(`Gemini ${r.status}${detail ? ': '+detail : ''}`));
                        },
                        onerror:   () => reject(new Error('Network error')),
                        ontimeout: () => reject(new Error('Timeout'))
                    });
                });

                const data  = JSON.parse(text);
                const raw   = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
                if (e.message.startsWith('Gemini') || e.message === 'Timeout' || e.message === 'Network error') {
                    lastErr = e.message;
                    console.warn(`[ESI] ${model} failed: ${e.message} — trying next model`);
                    continue;
                }
                throw e;
            }
        }
        throw new Error(lastErr || 'All Gemini models failed');
    }

    function repairJSON(s) {
        s = s.replace(/,\s*$/, '');
        if ((s.match(/"/g)||[]).length % 2 !== 0) s += '"';
        for (let i = 0; i < ((s.match(/{/g)||[]).length - (s.match(/}/g)||[]).length); i++) s += '}';
        for (let i = 0; i < ((s.match(/\[/g)||[]).length - (s.match(/\]/g)||[]).length); i++) s += ']';
        return s;
    }

    /**********************
     * HELPERS
     **********************/
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let bin = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk)
            bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
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

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

})();