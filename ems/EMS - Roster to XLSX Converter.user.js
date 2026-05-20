// ==UserScript==
// @name         EMS - Roster to XLSX Converter
// @namespace    https://*.otsystems.net/*
// @version      2.6
// @description  Upload a roster (photo, PDF, CSV, Excel), verify fields, download formatted XLSX for ticket system import
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
        #tsi-nav-item { list-style: none; }
        #tsi-link {
            display: block;
            padding: 4px 0;
            color: inherit;
            text-decoration: none;
            font-size: inherit;
            cursor: pointer;
            font-weight: bold;
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
            flex-shrink: 0; background: #1a3a5c;
        }
        #tsi-header h5 {
            margin: 0; font-size: 14px; font-weight: 600; color: #fff;
        }
        #tsi-header-btns {
            display: flex; align-items: center; gap: 6px;
        }
        #tsi-help-btn {
            background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.3);
            color: #fff; cursor: pointer; width: 22px; height: 22px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 700; flex-shrink: 0;
            transition: background .15s; line-height: 1;
        }
        #tsi-help-btn:hover { background: rgba(255,255,255,.28); }
        #tsi-key-btn {
            background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.3);
            color: #fff; cursor: pointer; width: 22px; height: 22px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 700; flex-shrink: 0; transition: background .15s; line-height: 1;
        }
        #tsi-key-btn:hover { background: rgba(255,255,255,.28); }
        #tsi-close {
            background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.3);
            cursor: pointer; width: 22px; height: 22px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; transition: background .15s;
        }
        #tsi-close:hover { background: rgba(255,255,255,.28); }
        #tsi-close span {
            display: block; width: 10px; height: 2px;
            background: #fff; border-radius: 2px;
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
            border-color: #1a3a5c; background: #f0f4f8;
        }
        #tsi-upload-zone p { margin: 0; color: #6c757d; font-size: 12px; }
        #tsi-upload-zone p strong { color: #1a3a5c; }
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

        /* ── BULK FILL BANNER ── */
        #tsi-bulk-fill {
            background: #fff8e1; border: 1px solid #ffe082;
            border-radius: 7px; padding: 12px 14px; margin-bottom: 14px;
            display: block;
        }
        #tsi-bulk-fill-header {
            display: flex; align-items: center; gap: 8px;
            margin-bottom: 10px;
        }
        #tsi-bulk-fill-header .tsi-bf-icon {
            font-size: 16px; flex-shrink: 0;
        }
        #tsi-bulk-fill-header .tsi-bf-title {
            font-size: 12px; font-weight: 700; color: #795548;
            flex: 1;
        }
        #tsi-bulk-fill-header .tsi-bf-desc {
            font-size: 11px; color: #a07840; margin-top: 1px;
        }
        #tsi-bulk-fill-fields {
            display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end;
        }
        .tsi-bf-group {
            display: flex; flex-direction: column; gap: 3px;
        }
        .tsi-bf-group label {
            font-size: 10px; font-weight: 700; color: #795548;
            text-transform: uppercase; letter-spacing: .4px;
        }
        .tsi-bf-group input {
            padding: 5px 8px; border: 1px solid #f0c040; border-radius: 4px;
            font-size: 12px; color: #212529; font-family: inherit;
            background: #fffde7; box-sizing: border-box;
        }
        .tsi-bf-group input:focus {
            outline: none; border-color: #f9a825;
            box-shadow: 0 0 0 2px rgba(249,168,37,.18);
        }
        .tsi-bf-group.bf-addr1 input { width: 180px; }
        .tsi-bf-group.bf-addr2 input { width: 120px; }
        .tsi-bf-group.bf-city  input { width: 120px; }
        .tsi-bf-group.bf-state input { width: 42px; text-align: center; text-transform: uppercase; }
        .tsi-bf-group.bf-zip   input { width: 62px; }
        .tsi-bf-group.bf-phone input { width: 100px; }
        #tsi-bulk-apply-btn {
            padding: 6px 16px; background: #f9a825; border: 1px solid #f57f17;
            color: #fff; border-radius: 5px; font-size: 12px; font-weight: 700;
            cursor: pointer; font-family: inherit; transition: background .12s;
            align-self: flex-end; white-space: nowrap; flex-shrink: 0;
        }
        #tsi-bulk-apply-btn:hover { background: #f57f17; }
        #tsi-bulk-apply-confirm {
            display: none; font-size: 11px; color: #388e3c;
            font-weight: 600; margin-top: 6px;
        }

        /* Table */
        .tsi-table-wrap { overflow-x: auto; margin-bottom: 12px; }
        .tsi-table {
            width: 100%; border-collapse: collapse;
            font-size: 11px; color: #212529;
        }
        .tsi-table thead th {
            background: #1a3a5c; color: #fff;
            border: 1px solid #12284a;
            border-bottom: 2px solid #12284a; padding: 6px 6px;
            font-size: 10px; font-weight: 700; text-transform: uppercase;
            letter-spacing: .4px; text-align: left; white-space: nowrap;
        }
        .tsi-table tbody td {
            border: 1px solid #f0f0f0; padding: 3px 4px; vertical-align: middle;
        }
        .tsi-table tbody tr:hover td { background: #f0f4f8; }
        .tsi-table input {
            width: 100%; padding: 3px 5px; border: 1px solid #ced4da;
            border-radius: 3px; font-size: 11px; color: #212529;
            font-family: inherit; box-sizing: border-box;
        }
        .tsi-table input:focus {
            outline: none; border-color: #1a3a5c;
            box-shadow: 0 0 0 2px rgba(26,58,92,.12);
        }
        .tsi-table input.tsi-invalid {
            border-color: #dc3545 !important;
            background: #fff5f5 !important;
            box-shadow: 0 0 0 2px rgba(220,53,69,.15) !important;
        }
        #tsi-validation-msg {
            display: none; background: #f8d7da; border: 1px solid #f1aeb5;
            color: #58151c; padding: 9px 12px; border-radius: 5px;
            font-size: 12px; margin-bottom: 10px; font-weight: 600;
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
            background: #fff; border: 1px dashed #1a3a5c; color: #1a3a5c;
            border-radius: 5px; padding: 6px 12px; font-size: 12px;
            font-weight: 600; cursor: pointer; width: 100%; margin-bottom: 10px;
            transition: background .12s;
        }
        #tsi-add-row-btn:hover { background: #f0f4f8; }

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
        .tsi-btn-xlsx { background:#1a3a5c; color:#fff; border-color:#1a3a5c; }
        .tsi-btn-xlsx:hover { background:#12284a; }
        .tsi-btn-primary { background:#1a3a5c; color:#fff; border-color:#1a3a5c; width:100%; justify-content:center; }
        .tsi-btn-primary:hover { background:#12284a; }
        .tsi-btn-primary:disabled { opacity:.55; cursor:not-allowed; background:#6c757d; border-color:#6c757d; }

        .tsi-alert-danger {
            background:#f8d7da; border:1px solid #f1aeb5; color:#58151c;
            padding:9px 12px; border-radius:5px; font-size:12px; margin-bottom:10px;
        }

        /* ── GUIDED TOUR ── */
        #tsi-tour-backdrop {
            position: fixed; inset: 0; z-index: 999999;
            pointer-events: none;
        }
        #tsi-tour-spotlight {
            position: fixed; z-index: 1000000;
            box-shadow: 0 0 0 9999px rgba(0,0,0,.62);
            border-radius: 6px; pointer-events: none;
            transition: top .3s, left .3s, width .3s, height .3s;
        }
        #tsi-tour-box {
            position: fixed; z-index: 1000001;
            background: #1a3a5c; color: #fff;
            border-radius: 10px; padding: 18px 20px 14px;
            width: 300px; box-shadow: 0 8px 32px rgba(0,0,0,.35);
            font-family: inherit; font-size: 13px; line-height: 1.5;
            transition: top .3s, left .3s;
        }
        #tsi-tour-box h4 {
            margin: 0 0 8px; font-size: 14px; font-weight: 700; color: #fff;
        }
        #tsi-tour-box p {
            margin: 0 0 14px; color: rgba(255,255,255,.88); font-size: 12px;
        }
        #tsi-tour-footer {
            display: flex; align-items: center; justify-content: space-between;
            gap: 8px;
        }
        #tsi-tour-progress {
            font-size: 11px; color: rgba(255,255,255,.6);
        }
        #tsi-tour-btns { display: flex; gap: 6px; }
        .tsi-tour-btn {
            padding: 5px 13px; border-radius: 5px; font-size: 12px;
            font-weight: 600; cursor: pointer; border: 1px solid transparent;
            font-family: inherit; transition: background .12s;
        }
        .tsi-tour-btn-skip {
            background: transparent; color: rgba(255,255,255,.6);
            border-color: rgba(255,255,255,.25);
        }
        .tsi-tour-btn-skip:hover { background: rgba(255,255,255,.1); color: #fff; }
        .tsi-tour-btn-next {
            background: #fff; color: #1a3a5c; border-color: #fff;
        }
        .tsi-tour-btn-next:hover { background: #e8eef5; }
        #tsi-tour-dot-row {
            display: flex; gap: 5px; align-items: center;
        }
        .tsi-tour-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: rgba(255,255,255,.3); transition: background .2s;
        }
        .tsi-tour-dot.active { background: #fff; }
    `;
    document.head.appendChild(style);

    /**********************
     * INJECT NAV LINK
     * Handles two different menu structures:
     *   Site A (admin2025 / safetyunlimited): .mega-menu-link anchors
     *   Site B (admin.otsystems.net/#/): AngularJS .mega-grandchild anchors
     **********************/

    // ── Shared link builder ──
    function makeRosterLink(className, wrapInLi) {
        const link = document.createElement('a');
        link.id = 'tsi-link';
        link.className = className;
        link.href = '#';
        link.style.fontWeight = 'bold';
        link.textContent = 'Roster Converter';
        link.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openPanel(); });

        if (wrapInLi) {
            const li = document.createElement('li');
            li.id = 'tsi-nav-item';
            li.appendChild(link);
            return { anchor: link, node: li };
        }
        // AngularJS site wraps in a div like its siblings
        const div = document.createElement('div');
        div.id = 'tsi-nav-item';
        div.className = 'ng-scope';
        div.appendChild(link);
        return { anchor: link, node: div };
    }

    // ── Site A: .mega-menu-link (admin2025 / safetyunlimited) ──
    function injectNavLinkSiteA() {
        if (document.querySelector('#tsi-nav-item')) return;

        const ticketLink = Array.from(document.querySelectorAll('a.mega-menu-link')).find(a =>
            (a.textContent || '').trim() === 'Ticket System'
        );
        if (!ticketLink) return;

        const { node } = makeRosterLink('mega-menu-link', true);
        const parentLi = ticketLink.closest('li');
        if (parentLi && parentLi.parentNode) {
            parentLi.parentNode.insertBefore(node, parentLi.nextSibling);
        } else {
            ticketLink.parentNode.insertBefore(node, ticketLink.nextSibling);
        }
        console.log('[TSI] Injected (Site A / mega-menu-link)');
    }

    // ── Site B: .mega-grandchild (admin.otsystems.net AngularJS) ──
    function injectNavLinkSiteB() {
        if (document.querySelector('#tsi-nav-item')) return;

        // Find the Ticket System link inside the External column
        const ticketLink = Array.from(document.querySelectorAll('a.mega-grandchild')).find(a =>
            (a.textContent || '').trim() === 'Ticket System'
        );
        if (!ticketLink) return;

        // Build the link — insert directly after Ticket System anchor inside the same column div
        const link = document.createElement('a');
        link.id = 'tsi-link';
        link.className = 'mega-grandchild';
        link.href = '#';
        link.style.fontWeight = 'bold';
        link.style.display = 'block';
        link.textContent = 'Roster Converter';
        link.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            // Close the dropdown before opening panel
            document.body.click();
            setTimeout(() => openPanel(), 50);
        });

        const wrapper = document.createElement('div');
        wrapper.id = 'tsi-nav-item';

        wrapper.appendChild(link);

        // Insert the wrapper right after the Ticket System anchor inside its parent column
        const col = ticketLink.closest('div.col-sm-6, div.col-md-4, div.col-xl-3') || ticketLink.parentNode;
        col.appendChild(wrapper);

        console.log('[TSI] Injected (Site B / mega-grandchild)');
    }

    function injectNavLink() {
        injectNavLinkSiteA();
        injectNavLinkSiteB();
    }

    window.addEventListener('load', () => {
        setTimeout(injectNavLink, 500);
        setTimeout(injectNavLink, 1000);
        setTimeout(injectNavLink, 2000);
        setTimeout(injectNavLink, 4000); // AngularJS can be slow to render
    });

    const navObserver = new MutationObserver(() => {
        if (!document.querySelector('#tsi-nav-item')) injectNavLink();
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
                <h5>📋 Ticket System Import</h5>
                <div id="tsi-header-btns">
                    <button id="tsi-key-btn" title="Update Gemini API Key">⚿</button>
                    <button id="tsi-help-btn" title="Help / Tour">?</button>
                    <button id="tsi-close" title="Close"><span></span></button>
                </div>
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

                    <!-- ── BULK FILL BANNER ── -->
                    <div id="tsi-bulk-fill">
                        <div id="tsi-bulk-fill-header">
                            <span class="tsi-bf-icon">⚠️</span>
                            <div>
                                <div class="tsi-bf-title">Address &amp; contact info is missing — fill all rows at once</div>
                                <div class="tsi-bf-desc">Enter shared values and click Apply. Only blank cells will be updated.</div>
                            </div>
                        </div>
                        <div id="tsi-bulk-fill-fields">
                            <div class="tsi-bf-group bf-addr1">
                                <label>Address 1</label>
                                <input id="bf-addr1" type="text" placeholder="123 Main St">
                            </div>
                            <div class="tsi-bf-group bf-addr2">
                                <label>Address 2</label>
                                <input id="bf-addr2" type="text" placeholder="Suite 100">
                            </div>
                            <div class="tsi-bf-group bf-city">
                                <label>City</label>
                                <input id="bf-city" type="text" placeholder="Oxnard">
                            </div>
                            <div class="tsi-bf-group bf-state">
                                <label>State</label>
                                <input id="bf-state" type="text" placeholder="CA" maxlength="2">
                            </div>
                            <div class="tsi-bf-group bf-zip">
                                <label>Zip</label>
                                <input id="bf-zip" type="text" placeholder="93030" maxlength="5">
                            </div>
                            <div class="tsi-bf-group bf-phone">
                                <label>Phone</label>
                                <input id="bf-phone" type="text" placeholder="8055551234">
                            </div>
                            <button id="tsi-bulk-apply-btn">Apply to All ↓</button>
                        </div>
                        <div id="tsi-bulk-apply-confirm">✅ Applied to all blank cells.</div>
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
                    <div id="tsi-validation-msg"></div>
                    <div class="tsi-actions">
                        <button id="tsi-edit-btn" class="tsi-btn tsi-btn-secondary">← Upload Again</button>
                        <button id="tsi-download-xlsx-btn" class="tsi-btn tsi-btn-xlsx">⬇ Download XLSX</button>
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
    const downloadXlsxBtn = document.getElementById('tsi-download-xlsx-btn');
    const addRowBtn     = document.getElementById('tsi-add-row-btn');
    const recordCount   = document.getElementById('tsi-record-count');
    const filenameInput = document.getElementById('tsi-filename');
    const bulkFill      = document.getElementById('tsi-bulk-fill');
    const bulkApplyBtn  = document.getElementById('tsi-bulk-apply-btn');
    const bulkConfirm   = document.getElementById('tsi-bulk-apply-confirm');

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
    function closePanel() {
        overlay.classList.remove('open');
        endTour();
    }

    document.getElementById('tsi-close').addEventListener('click', closePanel);
    overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

    /**********************
     * GUIDED TOUR
     **********************/
    const TOUR_STEPS = [
        {
            title: '📋 Roster Converter',
            text:  'This tool converts AHA roster sheets into a formatted CSV ready to import into the Ticket System. Let\'s walk through how it works.',
            target: '#tsi-panel',
            pos: 'center'
        },
        {
            title: '① Upload Your Roster',
            text:  'Click here (or drag & drop) to upload one or more files. Supported formats: CSV, Excel, PDF, or any image (JPG, PNG, WebP, HEIC). Multiple files are merged into one output.',
            target: '#tsi-upload-zone',
            pos: 'below'
        },
        {
            title: '② Parse & Verify',
            text:  'After uploading, click this button. Images and PDFs are sent to Gemini AI for field extraction. CSV/Excel files are parsed locally.',
            target: '#tsi-parse-btn',
            pos: 'below'
        },
        {
            title: '③ Bulk Fill (when needed)',
            text:  'If the document didn\'t contain address or phone info, this yellow banner appears. Enter the shared info once and click "Apply to All" — only blank cells get filled.',
            target: '#tsi-bulk-fill',
            pos: 'below'
        },
        {
            title: '④ Review the Table',
            text:  'Every extracted record appears here. Click any cell to edit it directly. Use the × button to remove a row, or "+ Add Row" to insert a blank one.',
            target: '#tsi-verify-section',
            pos: 'above'
        },
        {
            title: '⑤ Name Your File',
            text:  'Give your export a descriptive filename before downloading. The ".csv" extension is added automatically.',
            target: '#tsi-filename',
            pos: 'above'
        },
        {
            title: '⑥ Download XLSX',
            text:  'Click to download the finished XLSX file. All records get a "Pending" status automatically — ready to import into the Ticket System.',
            target: '.tsi-actions',
            pos: 'above'
        }
    ];

    let tourActive = false;
    let tourStep   = 0;
    let tourSpotlight, tourBox;

    function startTour() {
        endTour();
        tourActive = true;
        tourStep = 0;

        tourSpotlight = document.createElement('div');
        tourSpotlight.id = 'tsi-tour-spotlight';
        document.body.appendChild(tourSpotlight);

        tourBox = document.createElement('div');
        tourBox.id = 'tsi-tour-box';
        document.body.appendChild(tourBox);

        renderTourStep();
    }

    function renderTourStep() {
        const step = TOUR_STEPS[tourStep];
        const total = TOUR_STEPS.length;

        let targetEl = document.querySelector(step.target);
        if (!targetEl || step.pos === 'center') {
            tourSpotlight.style.cssText = 'position:fixed;top:50%;left:50%;width:0;height:0;box-shadow:0 0 0 9999px rgba(0,0,0,.62);border-radius:0';
        } else {
            const r = targetEl.getBoundingClientRect();
            const pad = 8;
            tourSpotlight.style.cssText = `
                position: fixed;
                top: ${r.top - pad}px;
                left: ${r.left - pad}px;
                width: ${r.width + pad * 2}px;
                height: ${r.height + pad * 2}px;
                box-shadow: 0 0 0 9999px rgba(0,0,0,.62);
                border-radius: 6px;
                pointer-events: none;
                transition: top .3s, left .3s, width .3s, height .3s;
            `;
        }

        const dots = Array.from({ length: total }, (_, i) =>
            `<div class="tsi-tour-dot ${i === tourStep ? 'active' : ''}"></div>`
        ).join('');

        const isLast = tourStep === total - 1;

        tourBox.innerHTML = `
            <h4>${step.title}</h4>
            <p>${step.text}</p>
            <div id="tsi-tour-footer">
                <div id="tsi-tour-dot-row">${dots}</div>
                <div id="tsi-tour-btns">
                    <button class="tsi-tour-btn tsi-tour-btn-skip" id="tsi-tour-skip">Skip</button>
                    <button class="tsi-tour-btn tsi-tour-btn-next" id="tsi-tour-next">
                        ${isLast ? 'Done ✓' : 'Next →'}
                    </button>
                </div>
            </div>
        `;

        positionTourBox(step, targetEl);

        document.getElementById('tsi-tour-skip').onclick = endTour;
        document.getElementById('tsi-tour-next').onclick = () => {
            if (tourStep < total - 1) { tourStep++; renderTourStep(); }
            else endTour();
        };
    }

    function positionTourBox(step, targetEl) {
        tourBox.style.top  = '50%';
        tourBox.style.left = '50%';
        tourBox.style.transform = 'translate(-50%, -50%)';

        if (!targetEl || step.pos === 'center') return;

        requestAnimationFrame(() => {
            const r  = targetEl.getBoundingClientRect();
            const bw = tourBox.offsetWidth  || 300;
            const bh = tourBox.offsetHeight || 160;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 16;

            let top, left;
            tourBox.style.transform = 'none';

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
        tourActive = false;
        if (tourSpotlight) { tourSpotlight.remove(); tourSpotlight = null; }
        if (tourBox)       { tourBox.remove();       tourBox = null; }
    }

    document.getElementById('tsi-help-btn').addEventListener('click', startTour);

    document.getElementById('tsi-key-btn').addEventListener('click', () => {
        const newKey = prompt('Enter your Gemini API key:', GEMINI_API_KEY ? '••••••••••••••••' : '');
        if (newKey && newKey !== '••••••••••••••••') {
            GEMINI_API_KEY = newKey.trim();
            GM_setValue('geminiKey', GEMINI_API_KEY);
            // Brief visual confirmation on the button
            const btn = document.getElementById('tsi-key-btn');
            const orig = btn.textContent;
            btn.textContent = '✓';
            btn.style.color = '#7dffb3';
            setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
        }
    });

    /**********************
     * BULK FILL LOGIC
     **********************/

    // Show the banner when most records are missing address/contact data
    function checkBulkFillNeeded(records) {
        // Always show the bulk fill banner — user can fill or ignore it
        bulkFill.style.display = 'block';
        bulkConfirm.style.display = 'none';
    }

    // Normalize state input to uppercase
    document.getElementById('bf-state').addEventListener('input', function() {
        this.value = this.value.toUpperCase();
    });

    // Apply bulk values to all blank cells
    bulkApplyBtn.addEventListener('click', () => {
        const vals = {
            addr1: document.getElementById('bf-addr1').value.trim(),
            addr2: document.getElementById('bf-addr2').value.trim(),
            city:  document.getElementById('bf-city').value.trim(),
            state: document.getElementById('bf-state').value.trim().toUpperCase(),
            zip:   document.getElementById('bf-zip').value.trim(),
            phone: document.getElementById('bf-phone').value.trim(),
        };

        // Nothing entered — do nothing
        if (!Object.values(vals).some(v => v)) return;

        let applied = false;

        tbody.querySelectorAll('tr').forEach(tr => {
            const i = +tr.dataset.i;
            Object.entries(vals).forEach(([field, val]) => {
                if (!val) return;
                const existing = (parsedRecords[i][field] || '').trim();
                if (!existing) {
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
                const errMsg = err.message.length > 120 ? err.message.slice(0, 120) + '…' : err.message;
                lines.push(`❌ "${file.name}" — ${errMsg}`);
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

        const prompt = `Extract every student/participant record from this document. The document may be a roster, sign-in sheet, class list, screenshot, PDF, or any format — handwritten or printed.

Layouts vary widely. Some documents have all fields, some have only names, some have names and emails, some use labeled fields like "Name:", "E-Mail:", "Work#:", "Phone:", "Cell:", some use numbered rows, some use tables, some use free-form lists. Extract whatever is present.

Return ONLY a raw JSON array with no markdown, no explanation, no code fences:
[{"last":"Doe","first":"Jane","email":"jane@example.com","addr1":"123 Main St","addr2":"","city":"Oxnard","state":"CA","zip":"93030","phone":"8056001234"},...]

Rules:
- Extract EVERY person listed — do not skip anyone even if some fields are missing
- Parse full names: first word = first name, last word = last name, any middle words = ignored (put only first and last)
- Recognize labeled fields in any format: "Name:", "E-Mail:", "Email:", "Work#:", "Work:", "Phone:", "Cell:", "Mobile:", "Address:", "Addr:", "City:", "State:", "Zip:", etc.
- If a field is not present for a student, use empty string ""
- email: look for @ symbol — fix obvious OCR/handwriting errors (spaces in email, 0 vs O, l vs 1, rn vs m)
- phone: digits only, no spaces, dashes, parentheses, or formatting. If labeled "Work#" or "Cell" or "Mobile", use it for the phone field
- state: 2-letter uppercase abbreviation only
- zip: 5 digits only
- addr2: unit, suite, apt number if present, otherwise ""
- Do NOT invent or guess data that is not visible in the document
- Do NOT skip records just because handwriting is unclear — make your best attempt
- If only names are present, return records with just first/last filled and all other fields as ""`;

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
                                // Try to extract Gemini's actual error message
                                let detail = '';
                                try { detail = JSON.parse(r.responseText)?.error?.message || ''; } catch(e) {}
                                const msg = r.status === 429 ? 'QUOTA' : `Gemini ${r.status}${detail ? ': ' + detail : ''}`;
                                reject(new Error(msg));
                            },
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
                // Try next model for any Gemini API error (400, 403, 429, 500, etc.)
                if (e.message.startsWith('Gemini') || e.message === 'QUOTA' || e.message === 'Timeout' || e.message === 'Network error') {
                    lastErr = e.message;
                    console.warn(`[TSI] ${model} failed: ${e.message} — trying next model`);
                    continue;
                }
                // Local JS errors (JSON parse, etc.) — rethrow
                throw e;
            }
        }
        throw new Error(lastErr || 'All Gemini models failed');
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
        checkBulkFillNeeded(parsedRecords);  // ← show banner if needed
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
        bulkConfirm.style.display = 'none';
        uploadZone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /**********************
     * DOWNLOAD HELPERS
     **********************/
    function getExportData() {
        const headers = ['Last Name','First Name','Email Address','Address1','Address2','City','State','Zip','Phone','Status'];
        const rows = parsedRecords.map(r => [
            r.last, r.first, r.email, r.addr1, r.addr2, r.city, r.state, r.zip, r.phone, 'Pending'
        ]);
        return { headers, rows };
    }

    function baseName() {
        const raw = filenameInput.value.trim().replace(/\.xlsx$/i, '');
        return raw || `ticket_import_${new Date().toISOString().slice(0,10)}`;
    }

    const REQUIRED_FIELDS = ['last','first','email','addr1','city','state','zip','phone'];
    const FIELD_LABELS = { last:'Last Name', first:'First Name', email:'Email', addr1:'Address 1', city:'City', state:'State', zip:'Zip', phone:'Phone' };

    function validateRecords() {
        // Clear previous highlights
        tbody.querySelectorAll('input.tsi-invalid').forEach(i => i.classList.remove('tsi-invalid'));

        const emptyByField = {};
        let totalEmpty = 0;

        parsedRecords.forEach((r, ri) => {
            REQUIRED_FIELDS.forEach(f => {
                if (!(r[f] || '').trim()) {
                    // Highlight the cell
                    const tr = tbody.querySelector(`tr[data-i="${ri}"]`);
                    if (tr) {
                        const inp = tr.querySelector(`input[data-f="${f}"]`);
                        if (inp) inp.classList.add('tsi-invalid');
                    }
                    emptyByField[f] = (emptyByField[f] || 0) + 1;
                    totalEmpty++;
                }
            });
        });

        return { emptyByField, totalEmpty };
    }

    downloadXlsxBtn.addEventListener('click', () => {
        if (!parsedRecords.length) return;

        const valMsg = document.getElementById('tsi-validation-msg');
        const { emptyByField, totalEmpty } = validateRecords();

        if (totalEmpty > 0) {
            const fieldList = Object.entries(emptyByField)
                .map(([f, n]) => `${FIELD_LABELS[f]} (${n})`)
                .join(', ');
            valMsg.textContent = `⚠️ ${totalEmpty} empty cell${totalEmpty !== 1 ? 's' : ''} must be filled before downloading: ${fieldList}`;
            valMsg.style.display = 'block';
            // Scroll to first invalid cell
            const firstInvalid = tbody.querySelector('input.tsi-invalid');
            if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        valMsg.style.display = 'none';
        const { headers, rows } = getExportData();
        const xlsxBlob = buildXlsx([headers, ...rows]);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(xlsxBlob);
        a.download = baseName() + '.xlsx';
        a.click();
        URL.revokeObjectURL(a.href);
    });

    // Clear validation highlight as user types
    tbody.addEventListener('input', e => {
        const inp = e.target.closest('input.tsi-invalid');
        if (inp && inp.value.trim()) inp.classList.remove('tsi-invalid');
    });

    /**********************
     * HAND-ROLLED XLSX WRITER (no eval, CSP-safe)
     * Builds a minimal .xlsx (Office Open XML) from a 2D array of strings.
     * An .xlsx is a ZIP containing XML files — we build the ZIP with raw bytes.
     **********************/
    function buildXlsx(data) {
        // Column widths matching our headers
        const colWidths = [14, 14, 28, 22, 14, 14, 8, 7, 12, 10];

        // ── 1. Build shared strings table (all cell values deduplicated) ──
        const sst = [];
        const sstMap = {};
        function sstIdx(val) {
            const s = val == null ? '' : String(val);
            if (!(s in sstMap)) { sstMap[s] = sst.length; sst.push(s); }
            return sstMap[s];
        }
        // Pre-populate SST
        data.forEach(row => row.forEach(cell => sstIdx(cell)));

        // XML-escape helper
        function xe(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        // Column letter(s) from 0-based index
        function colLetter(n) {
            let s = '';
            for (n++; n > 0; n = Math.floor((n - 1) / 26))
                s = String.fromCharCode(((n - 1) % 26) + 65) + s;
            return s;
        }

        // ── 2. sheet1.xml ──
        let sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        sheetXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
        // Column widths
        sheetXml += '<cols>';
        colWidths.forEach((w, i) => {
            sheetXml += `<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`;
        });
        sheetXml += '</cols>';
        sheetXml += '<sheetData>';
        data.forEach((row, ri) => {
            sheetXml += `<row r="${ri + 1}">`;
            row.forEach((cell, ci) => {
                const ref = colLetter(ci) + (ri + 1);
                const idx = sstIdx(cell);
                // Row 1 = header, use style 1 (bold); others use style 0
                const s = ri === 0 ? ' s="1"' : '';
                sheetXml += `<c r="${ref}" t="s"${s}><v>${idx}</v></c>`;
            });
            sheetXml += '</row>';
        });
        sheetXml += '</sheetData>';
        // Freeze top row
        sheetXml += '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
        sheetXml += '</worksheet>';

        // ── 3. sharedStrings.xml ──
        let sstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
        sstXml += `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sst.length}" uniqueCount="${sst.length}">`;
        sst.forEach(s => { sstXml += `<si><t xml:space="preserve">${xe(s)}</t></si>`; });
        sstXml += '</sst>';

        // ── 4. styles.xml — style 0 = normal, style 1 = bold header ──
        const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
            '<fonts count="2">' +
            '<font><sz val="11"/><name val="Calibri"/></font>' +
            '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
            '</fonts>' +
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="2">' +
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
            '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>' +
            '</cellXfs>' +
            '</styleSheet>';

        // ── 5. workbook.xml ──
        const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<sheets><sheet name="Students" sheetId="1" r:id="rId1"/></sheets>' +
            '</workbook>';

        // ── 6. Relationship files ──
        const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
            '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
            '</Relationships>';

        const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
            '</Relationships>';

        const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
            '</Types>';

        // ── 7. Build ZIP ──
        // Minimal ZIP builder — stores files uncompressed (method 0)
        function strToBytes(str) {
            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                if (code < 0x80) {
                    bytes.push(code);
                } else if (code < 0x800) {
                    bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
                } else {
                    bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
                }
            }
            return new Uint8Array(bytes);
        }

        function crc32(data) {
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < data.length; i++) {
                crc ^= data[i];
                for (let j = 0; j < 8; j++)
                    crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
            }
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }

        function u16le(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
        function u32le(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }

        const files = [
            ['[Content_Types].xml',              contentTypes],
            ['_rels/.rels',                       rootRels],
            ['xl/workbook.xml',                   workbookXml],
            ['xl/_rels/workbook.xml.rels',        workbookRels],
            ['xl/worksheets/sheet1.xml',          sheetXml],
            ['xl/sharedStrings.xml',              sstXml],
            ['xl/styles.xml',                     stylesXml],
        ];

        const localHeaders = [];
        const centralDirs  = [];
        let offset = 0;
        const parts = [];

        const now = new Date();
        const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);

        files.forEach(([name, xmlStr]) => {
            const nameBytes  = strToBytes(name);
            const dataBytes  = strToBytes(xmlStr);
            const crc        = crc32(dataBytes);
            const size       = dataBytes.length;

            // Local file header
            const lhArr = [
                0x50,0x4B,0x03,0x04,   // signature
                0x14,0x00,             // version needed: 20
                0x00,0x00,             // general purpose bit flag
                0x00,0x00,             // compression: stored
                ...u16le(dosTime),
                ...u16le(dosDate),
                ...u32le(crc),
                ...u32le(size),        // compressed size
                ...u32le(size),        // uncompressed size
                ...u16le(nameBytes.length),
                0x00,0x00,             // extra field length
            ];
            const lh = new Uint8Array(lhArr);

            // Central directory entry
            const cdArr = [
                0x50,0x4B,0x01,0x02,   // signature
                0x14,0x00,             // version made by
                0x14,0x00,             // version needed
                0x00,0x00,             // general purpose bit flag
                0x00,0x00,             // compression: stored
                ...u16le(dosTime),
                ...u16le(dosDate),
                ...u32le(crc),
                ...u32le(size),
                ...u32le(size),
                ...u16le(nameBytes.length),
                0x00,0x00,             // extra field length
                0x00,0x00,             // file comment length
                0x00,0x00,             // disk number start
                0x00,0x00,             // internal attributes
                0x00,0x00,0x00,0x00,   // external attributes
                ...u32le(offset),      // relative offset of local header
            ];
            const cd = new Uint8Array(cdArr);

            parts.push(lh, nameBytes, dataBytes);
            centralDirs.push(cd, nameBytes);

            offset += lh.length + nameBytes.length + size;
        });

        // End of central directory record
        const cdSize   = centralDirs.reduce((s, b) => s + b.length, 0);
        const eocdArr  = [
            0x50,0x4B,0x05,0x06,   // signature
            0x00,0x00,             // disk number
            0x00,0x00,             // disk with central dir
            ...u16le(files.length),
            ...u16le(files.length),
            ...u32le(cdSize),
            ...u32le(offset),
            0x00,0x00,             // comment length
        ];

        const allParts = [...parts, ...centralDirs, new Uint8Array(eocdArr)];
        const totalLen = allParts.reduce((s, b) => s + b.length, 0);
        const out = new Uint8Array(totalLen);
        let pos = 0;
        allParts.forEach(b => { out.set(b, pos); pos += b.length; });

        return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

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