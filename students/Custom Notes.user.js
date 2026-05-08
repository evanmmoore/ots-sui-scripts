// ==UserScript==
// @name         Custom Notes
// @namespace    https://otsystems.net/
// @version      7.0
// @description  Structured note composer with contact type selector, action chips, closers, and saved personal notes.
// @match        https://otsystems.net/admin/students/dashboard/?student_number=*
// @match        https://otsystems.net/admin/corporate/manage_notes.asp*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ─── Storage keys ───────────────────────────────────────────────────────────
    const KEY_SAVED_NOTES      = 'ots_custom_notes_v4';    // personal saved notes (kept from v6)
    const KEY_ACTION_CHIPS     = 'ots_action_chips_v7';    // editable action chips
    const KEY_CLOSERS          = 'ots_closers_v7';         // editable situational closers
    const KEY_CUSTOM_CONTACTS  = 'ots_custom_contacts_v7'; // user-added contact types

    // ─── Contact type groups ────────────────────────────────────────────────────
    const CONTACT_GROUPS = [
        {
            id: 'student_initiated',
            label: 'Student Initiated Contact',
            group: true,
            children: [
                { id: 'called_in',  label: 'Called',   opener: 'Student called in - ',             closer: '' },
                { id: 'emailed_in', label: 'Emailed',  opener: 'Student emailed in - ',             closer: '' },
                { id: 'chat_in',    label: 'Chatted',     opener: 'Student chatted in - ',   closer: '' },
            ],
        },
        {
            id: 'admin_initiated',
            label: 'Admin Initiated Contact',
            group: true,
            children: [
                { id: 'we_called',   label: 'Called',   opener: 'Admin () called in - ',        closer: '' },
                { id: 'we_emailed',  label: 'Emailed',  opener: 'Admin () emailed in - ',       closer: '' },
                { id: 'chat_in',    label: 'Chatted',     opener: 'Admin () chatted in - ',   closer: '' },
            ],
        },
        { id: 'offline',    label: 'Offline Message',                  opener: 'Offline message from student - ',                    closer: 'Emailed CS letting everyone know this offline message was handled.' },
        { id: 'jules',      label: 'Jules Asked Us to Reach Out',      opener: 'Jules asked us to reach out to student - ',          closer: '' },
        { id: 'accounting', label: 'Accounting Asked Us to Reach Out', opener: 'Accounting asked us to reach out to student - ',     closer: '' },
    ];

    // Flat list of all leaf contact types (for closers, manage panel, etc.)
    const CONTACT_TYPES = CONTACT_GROUPS.flatMap(g => g.group ? g.children : [g]);

    // ─── Default action chips ───────────────────────────────────────────────────
    const DEFAULT_CHIPS = [
        'Resent UN/PW reset link',
        'Emailed student back',
        'Called student back',
        'Course set to active',
        'Transferred to advisor',
        'Processed refund',
    ];

    // ─── Storage helpers ────────────────────────────────────────────────────────
    function load(key, fallback) {
        try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : fallback; }
        catch { return fallback; }
    }
    function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

    function loadSavedNotes()         { return load(KEY_SAVED_NOTES,  []); }
    function loadChips()              { return load(KEY_ACTION_CHIPS,  DEFAULT_CHIPS); }
    function loadClosers()            { return load(KEY_CLOSERS, []); }
    function loadCustomContactTypes() { return load(KEY_CUSTOM_CONTACTS, []); }

    // ─── Wait for element ───────────────────────────────────────────────────────
    function waitFor(selector, cb, timeout = 10000) {
        const start = Date.now();
        const iv = setInterval(() => {
            const el = document.querySelector(selector);
            if (el) { clearInterval(iv); cb(el); }
            else if (Date.now() - start > timeout) { clearInterval(iv); }
        }, 300);
    }

    // ─── Styles injected once ───────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('ots-notes-style')) return;
        const s = document.createElement('style');
        s.id = 'ots-notes-style';
        s.textContent = `
            .ots-wrap * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }

            .ots-wrap {
                margin-top: 14px;
                border: 1px solid #d0d5dd;
                border-radius: 10px;
                background: #fff;
                overflow: hidden;
                box-shadow: 0 1px 4px rgba(0,0,0,0.07);
            }

            /* ── Tab bar ── */
            .ots-tabs {
                display: flex;
                border-bottom: 1px solid #d0d5dd;
                background: #f8f9fb;
            }
            .ots-tab {
                flex: 1;
                padding: 9px 0;
                font-size: 12px;
                font-weight: 600;
                text-align: center;
                cursor: pointer;
                color: #667085;
                border: none;
                background: none;
                border-bottom: 2px solid transparent;
                transition: color .15s, border-color .15s;
                letter-spacing: .3px;
            }
            .ots-tab:hover { color: #344054; }
            .ots-tab.active { color: #e04b00; border-bottom-color: #e04b00; background: #fff; }

            /* ── Panels ── */
            .ots-panel { display: none; padding: 12px; }
            .ots-panel.active { display: block; }

            /* ── Section label ── */
            .ots-label {
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: .6px;
                color: #98a2b3;
                margin: 10px 0 5px;
            }
            .ots-label:first-child { margin-top: 0; }

            /* ── Contact type grid ── */
            .ots-contact-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 5px;
                margin-bottom: 2px;
            }
            .ots-ct-btn {
                padding: 7px 8px;
                font-size: 11.5px;
                font-weight: 500;
                border: 1.5px solid #d0d5dd;
                border-radius: 7px;
                background: #fff;
                color: #344054;
                cursor: pointer;
                text-align: left;
                transition: all .15s;
                line-height: 1.3;
            }
            .ots-ct-btn:hover { border-color: #e04b00; color: #e04b00; background: #fff5f0; }
            .ots-ct-btn.selected { border-color: #e04b00; background: #fff5f0; color: #e04b00; font-weight: 600; }
            .ots-ct-btn.group-btn { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
            .ots-ct-btn.group-btn.open { border-color: #e04b00; background: #fff5f0; color: #e04b00; }

            /* ── Group dropdown ── */
            .ots-ct-wrapper { position: relative; }
            .ots-dropdown {
                display: none;
                position: absolute;
                top: calc(100% + 4px);
                left: 0;
                min-width: 160px;
                background: #fff;
                border: 1.5px solid #d0d5dd;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.13);
                z-index: 9999;
                overflow: hidden;
            }
            .ots-dropdown.open { display: block; }
            .ots-dropdown-item {
                display: block;
                width: 100%;
                padding: 8px 12px;
                font-size: 12px;
                font-weight: 500;
                text-align: left;
                background: none;
                border: none;
                color: #344054;
                cursor: pointer;
                transition: background .12s, color .12s;
            }
            .ots-dropdown-item:not(:last-child) { border-bottom: 1px solid #f2f4f7; }
            .ots-dropdown-item:hover { background: #fff5f0; color: #e04b00; }
            .ots-dropdown-item.selected { background: #fff5f0; color: #e04b00; font-weight: 600; }

            /* ── Textarea ── */
            .ots-textarea {
                width: 100%;
                border: 1.5px solid #d0d5dd;
                border-radius: 7px;
                padding: 8px 10px;
                font-size: 12.5px;
                color: #1d2939;
                resize: vertical;
                outline: none;
                transition: border-color .15s;
                line-height: 1.5;
            }
            .ots-textarea:focus { border-color: #e04b00; }

            /* ── Preview box ── */
            .ots-preview {
                background: #f8f9fb;
                border: 1.5px solid #e4e7ec;
                border-radius: 7px;
                padding: 9px 11px;
                font-size: 12px;
                color: #344054;
                line-height: 1.6;
                min-height: 48px;
                white-space: pre-wrap;
                word-break: break-word;
            }

            /* ── Chip row ── */
            .ots-chips {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-bottom: 4px;
            }
            .ots-chip {
                padding: 4px 10px;
                font-size: 11.5px;
                border: 1.5px solid #d0d5dd;
                border-radius: 20px;
                background: #fff;
                color: #344054;
                cursor: pointer;
                transition: all .15s;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .ots-chip:hover { border-color: #e04b00; background: #fff5f0; color: #e04b00; }
            .ots-chip .chip-del {
                font-size: 13px;
                color: #98a2b3;
                line-height: 1;
                cursor: pointer;
            }
            .ots-chip .chip-del:hover { color: #e04b00; }

            /* ── Closer chips ── */
            .ots-closer-chip {
                padding: 5px 10px;
                font-size: 11px;
                border: 1.5px solid #d0d5dd;
                border-radius: 7px;
                background: #fff;
                color: #344054;
                cursor: pointer;
                transition: all .15s;
                display: flex;
                align-items: flex-start;
                gap: 5px;
                text-align: left;
                line-height: 1.4;
            }
            .ots-closer-chip:hover { border-color: #e04b00; background: #fff5f0; }
            .ots-closer-chip.selected { border-color: #e04b00; background: #fff5f0; font-weight: 600; color: #b03300; }
            .ots-closer-chip .chip-del { color: #98a2b3; font-size: 13px; flex-shrink: 0; margin-top: 1px; }
            .ots-closer-chip .chip-del:hover { color: #e04b00; }

            /* ── Inline add row ── */
            .ots-add-row {
                display: flex;
                gap: 5px;
                margin-top: 5px;
            }
            .ots-add-row input {
                flex: 1;
                border: 1.5px solid #d0d5dd;
                border-radius: 7px;
                padding: 5px 9px;
                font-size: 12px;
                outline: none;
                transition: border-color .15s;
            }
            .ots-add-row input:focus { border-color: #e04b00; }
            .ots-add-row button {
                padding: 5px 12px;
                font-size: 12px;
                border: none;
                border-radius: 7px;
                background: #e04b00;
                color: #fff;
                cursor: pointer;
                font-weight: 600;
                transition: background .15s;
            }
            .ots-add-row button:hover { background: #c73f00; }

            /* ── Primary action buttons ── */
            .ots-btn-row {
                display: flex;
                gap: 6px;
                margin-top: 10px;
            }
            .ots-btn-primary {
                flex: 1;
                padding: 9px;
                font-size: 13px;
                font-weight: 700;
                border: none;
                border-radius: 8px;
                background: #e04b00;
                color: #fff;
                cursor: pointer;
                transition: background .15s;
                letter-spacing: .2px;
            }
            .ots-btn-primary:hover { background: #c73f00; }
            .ots-btn-secondary {
                padding: 9px 14px;
                font-size: 12px;
                font-weight: 600;
                border: 1.5px solid #d0d5dd;
                border-radius: 8px;
                background: #fff;
                color: #344054;
                cursor: pointer;
                transition: all .15s;
            }
            .ots-btn-secondary:hover { border-color: #98a2b3; background: #f8f9fb; }

            /* ── Saved notes search ── */
            .ots-search {
                width: 100%;
                border: 1.5px solid #d0d5dd;
                border-radius: 7px;
                padding: 7px 10px;
                font-size: 12px;
                outline: none;
                margin-bottom: 8px;
                transition: border-color .15s;
            }
            .ots-search:focus { border-color: #e04b00; }

            /* ── Saved note items ── */
            .ots-note-item {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 5px 7px;
                border: 1.5px solid #e4e7ec;
                border-radius: 7px;
                background: #fff;
                margin-bottom: 5px;
                transition: background .15s, border-color .15s;
            }
            .ots-note-item:hover { background: #f8f9fb; border-color: #c9d0da; }
            .ots-note-item .note-use-btn {
                flex: 1;
                text-align: left;
                font-size: 12px;
                font-weight: 500;
                color: #1d2939;
                background: none;
                border: none;
                cursor: pointer;
                padding: 0;
            }
            .ots-note-item .note-use-btn:hover { color: #e04b00; }
            .ots-note-item .note-icon {
                font-size: 14px;
                cursor: pointer;
                color: #98a2b3;
                padding: 0 2px;
                transition: color .15s;
            }
            .ots-note-item .note-icon:hover { color: #e04b00; }

            /* ── Divider ── */
            .ots-divider {
                border: none;
                border-top: 1px solid #e4e7ec;
                margin: 10px 0;
            }

            /* ── Empty state ── */
            .ots-empty {
                text-align: center;
                color: #98a2b3;
                font-size: 12px;
                padding: 10px 0;
            }
        `;
        document.head.appendChild(s);
    }

    // ─── Insert text into CKEditor iframe ──────────────────────────────────────
    // Uses CKEditor's own API when available to avoid extra blank paragraphs.
    function insertIntoEditor(iframe, text) {
        // Try CKEditor API first (cleanest, no stray <br> or blank <p>)
        try {
            const editorName = iframe.title && iframe.title.match(/editor\d+/)?.[0];
            const win = iframe.ownerDocument.defaultView || window;
            const CKEDITOR = win.CKEDITOR || window.CKEDITOR;
            if (CKEDITOR) {
                // Find the right editor instance
                let editor = null;
                if (editorName && CKEDITOR.instances[editorName]) {
                    editor = CKEDITOR.instances[editorName];
                } else {
                    // Fall back to any editor whose iframe matches
                    for (const name in CKEDITOR.instances) {
                        const inst = CKEDITOR.instances[name];
                        if (inst.container && inst.container.$.contains(iframe)) {
                            editor = inst; break;
                        }
                    }
                    // Last resort: first instance
                    if (!editor) {
                        const keys = Object.keys(CKEDITOR.instances);
                        if (keys.length) editor = CKEDITOR.instances[keys[0]];
                    }
                }
                if (editor && editor.setData) {
                    editor.setData(`<p>${text}</p>`);
                    editor.focus();
                    return;
                }
            }
        } catch(e) { /* fall through to direct DOM */ }

        // Direct DOM fallback — replace all content cleanly
        try {
            const editorBody = iframe.contentDocument.querySelector('body');
            if (editorBody) {
                editorBody.innerHTML = `<p>${text}</p>`;
                editorBody.focus();
                // Move caret to end
                const sel = iframe.contentWindow.getSelection();
                if (sel) {
                    const range = iframe.contentDocument.createRange();
                    range.selectNodeContents(editorBody);
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        } catch(e) { console.warn('[OTS Notes] Could not insert into editor:', e); }
    }

    // ─── Build & inject the UI ──────────────────────────────────────────────────
    function buildUI(modal, iframe) {
        if (modal.querySelector('.ots-wrap')) return;
        injectStyles();

        const wrap = document.createElement('div');
        wrap.className = 'ots-wrap';

        // ── Tab bar ─────────────────────────────────────────────────────────────
        const tabs = document.createElement('div');
        tabs.className = 'ots-tabs';

        const tabCompose = document.createElement('button');
        tabCompose.className = 'ots-tab active';
        tabCompose.textContent = '✏️ Compose Note';

        const tabSaved = document.createElement('button');
        tabSaved.className = 'ots-tab';
        tabSaved.textContent = '📋 Saved Notes';

        const tabManage = document.createElement('button');
        tabManage.className = 'ots-tab';
        tabManage.textContent = '⚙️ Manage';

        tabs.appendChild(tabCompose);
        tabs.appendChild(tabSaved);
        tabs.appendChild(tabManage);

        // ── Panel: Compose ───────────────────────────────────────────────────────
        const panelCompose = document.createElement('div');
        panelCompose.className = 'ots-panel active';

        // Contact type
        const ctLabel = document.createElement('div');
        ctLabel.className = 'ots-label';
        ctLabel.textContent = 'How did this contact happen?';

        const ctGrid = document.createElement('div');
        ctGrid.className = 'ots-contact-grid';

        let selectedContact = null;

        function closeAllDropdowns() {
            ctGrid.querySelectorAll('.ots-dropdown').forEach(d => d.classList.remove('open'));
            ctGrid.querySelectorAll('.ots-ct-btn.group-btn').forEach(b => b.classList.remove('open'));
        }

        function selectContactType(ct) {
            // Clear all selections
            ctGrid.querySelectorAll('.ots-ct-btn').forEach(b => b.classList.remove('selected'));
            ctGrid.querySelectorAll('.ots-dropdown-item').forEach(i => i.classList.remove('selected'));
            closeAllDropdowns();
            selectedContact = ct;
            // Show admin name input only when opener contains ()
            if (ct.opener && ct.opener.includes('()')) {
                adminNameWrap.style.display = '';
                adminNameInput.value = '';
                // Focus the name field for quick entry
                setTimeout(() => adminNameInput.focus(), 50);
            } else {
                adminNameWrap.style.display = 'none';
                adminNameInput.value = '';
            }
            // Auto-select matching closer
            closerList.querySelectorAll('.ots-closer-chip').forEach(c => c.classList.remove('selected'));
            if (ct.closer) {
                closerList.querySelectorAll('.ots-closer-chip').forEach(c => {
                    if (c.dataset.text === ct.closer) c.classList.add('selected');
                });
            }
            updatePreview();
        }

        function renderContactGrid() {
            ctGrid.innerHTML = '';
            // Close any open dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                if (!ctGrid.contains(e.target)) closeAllDropdowns();
            }, { capture: true });

            const allEntries = [...CONTACT_GROUPS, ...loadCustomContactTypes()];

            allEntries.forEach(entry => {
                if (entry.group) {
                    // ── Group button with dropdown ──
                    const wrapper = document.createElement('div');
                    wrapper.className = 'ots-ct-wrapper';

                    const groupBtn = document.createElement('button');
                    groupBtn.className = 'ots-ct-btn group-btn';
                    groupBtn.innerHTML = `<span>${entry.label}</span><span style="font-size:9px;opacity:.7;">▼</span>`;

                    const dropdown = document.createElement('div');
                    dropdown.className = 'ots-dropdown';

                    entry.children.forEach(child => {
                        const item = document.createElement('button');
                        item.className = 'ots-dropdown-item';
                        item.textContent = child.label;
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // Mark group btn as selected
                            ctGrid.querySelectorAll('.ots-ct-btn').forEach(b => b.classList.remove('selected'));
                            groupBtn.classList.add('selected');
                            // Mark item
                            dropdown.querySelectorAll('.ots-dropdown-item').forEach(i => i.classList.remove('selected'));
                            item.classList.add('selected');
                            selectContactType(child);
                        });
                        dropdown.appendChild(item);
                    });

                    groupBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isOpen = dropdown.classList.contains('open');
                        closeAllDropdowns();
                        if (!isOpen) {
                            dropdown.classList.add('open');
                            groupBtn.classList.add('open');
                        }
                    });

                    wrapper.appendChild(groupBtn);
                    wrapper.appendChild(dropdown);
                    ctGrid.appendChild(wrapper);
                } else {
                    // ── Direct button ──
                    const btn = document.createElement('button');
                    btn.className = 'ots-ct-btn';
                    btn.textContent = entry.label;
                    btn.dataset.id = entry.id;
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        ctGrid.querySelectorAll('.ots-ct-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                        selectContactType(entry);
                    });
                    ctGrid.appendChild(btn);
                }
            });
        }

        // Admin name input (shown only for admin-initiated contact types)
        const adminNameWrap = document.createElement('div');
        adminNameWrap.style.cssText = 'display:none;margin-bottom:2px;';

        const adminNameLabel = document.createElement('div');
        adminNameLabel.className = 'ots-label';
        adminNameLabel.textContent = 'Admin name';

        const adminNameInput = document.createElement('input');
        adminNameInput.className = 'ots-search';
        adminNameInput.placeholder = 'e.g. Alex';
        adminNameInput.style.marginBottom = '0';
        adminNameInput.addEventListener('input', updatePreview);

        adminNameWrap.appendChild(adminNameLabel);
        adminNameWrap.appendChild(adminNameInput);

        // Note body
        const bodyLabel = document.createElement('div');
        bodyLabel.className = 'ots-label';
        bodyLabel.textContent = 'Note body';

        const bodyInput = document.createElement('textarea');
        bodyInput.className = 'ots-textarea';
        bodyInput.rows = 4;
        bodyInput.placeholder = 'Type the details here — what the student said, what you did…';
        bodyInput.addEventListener('input', updatePreview);

        // Action chips
        const actionLabel = document.createElement('div');
        actionLabel.className = 'ots-label';
        actionLabel.textContent = 'Actions taken (click to append)';

        const actionChips = document.createElement('div');
        actionChips.className = 'ots-chips';

        function renderActionChips() {
            actionChips.innerHTML = '';
            loadChips().forEach((chip, idx) => {
                const c = document.createElement('div');
                c.className = 'ots-chip';

                const t = document.createElement('span');
                t.textContent = chip;
                t.style.cursor = 'pointer';
                t.addEventListener('click', () => {
                    const val = bodyInput.value.trim();
                    bodyInput.value = val ? val + ' ' + chip + '.' : chip + '.';
                    updatePreview();
                });

                const del = document.createElement('span');
                del.className = 'chip-del';
                del.textContent = '×';
                del.title = 'Remove chip';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const chips = loadChips();
                    chips.splice(idx, 1);
                    save(KEY_ACTION_CHIPS, chips);
                    renderActionChips();
                });

                c.appendChild(t);
                c.appendChild(del);
                actionChips.appendChild(c);
            });
        }

        // Situational closers
        const closerLabel = document.createElement('div');
        closerLabel.className = 'ots-label';
        closerLabel.textContent = 'Closer (optional — auto-selected by contact type)';

        const closerList = document.createElement('div');
        closerList.style.display = 'flex';
        closerList.style.flexDirection = 'column';
        closerList.style.gap = '5px';

        function renderClosers() {
            closerList.innerHTML = '';

            // Built-in closers from contact types
            const builtIn = CONTACT_TYPES.filter(ct => ct.closer).map(ct => ct.closer);
            // User-saved closers
            const userClosers = loadClosers();
            const allClosers = [...new Set([...builtIn, ...userClosers])];

            allClosers.forEach(text => {
                const c = document.createElement('div');
                c.className = 'ots-closer-chip';
                c.dataset.text = text;

                const t = document.createElement('span');
                t.textContent = text;
                t.style.flex = '1';
                t.style.cursor = 'pointer';
                t.addEventListener('click', () => {
                    const already = c.classList.contains('selected');
                    closerList.querySelectorAll('.ots-closer-chip').forEach(x => x.classList.remove('selected'));
                    if (!already) c.classList.add('selected');
                    updatePreview();
                });

                // Only user-saved closers get a delete button
                if (userClosers.includes(text)) {
                    const del = document.createElement('span');
                    del.className = 'chip-del';
                    del.textContent = '×';
                    del.title = 'Remove closer';
                    del.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const saved = loadClosers().filter(x => x !== text);
                        save(KEY_CLOSERS, saved);
                        renderClosers();
                        updatePreview();
                    });
                    c.appendChild(del);
                }

                c.insertBefore(t, c.firstChild);
                closerList.appendChild(c);
            });
        }

        // Preview
        const previewLabel = document.createElement('div');
        previewLabel.className = 'ots-label';
        previewLabel.textContent = 'Preview';

        const preview = document.createElement('div');
        preview.className = 'ots-preview';
        preview.textContent = 'Select a contact type to begin…';

        function updatePreview() {
            let opener = selectedContact ? selectedContact.opener : '';
            // If opener contains () and admin name is filled, inject the name
            if (opener.includes('()') && adminNameInput.value.trim()) {
                opener = opener.replace('()', '(' + adminNameInput.value.trim() + ')');
            }
            const body   = bodyInput.value.trim();
            const selectedCloserEl = closerList.querySelector('.ots-closer-chip.selected');
            const closer = selectedCloserEl ? selectedCloserEl.dataset.text : '';

            let parts = [];
            if (opener) parts.push(opener);
            if (body)   parts.push(body);
            if (closer) parts.push(closer);

            preview.textContent = parts.length
                ? parts.join(' ')
                : 'Select a contact type to begin…';
        }

        // Buttons
        const btnRow = document.createElement('div');
        btnRow.className = 'ots-btn-row';

        const insertBtn = document.createElement('button');
        insertBtn.className = 'ots-btn-primary';
        insertBtn.textContent = 'Insert Note into Field';
        insertBtn.addEventListener('click', () => {
            const text = preview.textContent;
            if (!text || text === 'Select a contact type to begin…') return;

            insertIntoEditor(iframe, text);

            // Reset
            ctGrid.querySelectorAll('.ots-ct-btn').forEach(b => b.classList.remove('selected'));
            ctGrid.querySelectorAll('.ots-dropdown-item').forEach(i => i.classList.remove('selected'));
            closeAllDropdowns();
            closerList.querySelectorAll('.ots-closer-chip').forEach(c => c.classList.remove('selected'));
            selectedContact = null;
            adminNameInput.value = '';
            adminNameWrap.style.display = 'none';
            bodyInput.value = '';
            updatePreview();
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'ots-btn-secondary';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            ctGrid.querySelectorAll('.ots-ct-btn').forEach(b => b.classList.remove('selected'));
            ctGrid.querySelectorAll('.ots-dropdown-item').forEach(i => i.classList.remove('selected'));
            closeAllDropdowns();
            closerList.querySelectorAll('.ots-closer-chip').forEach(c => c.classList.remove('selected'));
            selectedContact = null;
            adminNameInput.value = '';
            adminNameWrap.style.display = 'none';
            bodyInput.value = '';
            updatePreview();
        });

        btnRow.appendChild(insertBtn);
        btnRow.appendChild(clearBtn);

        panelCompose.appendChild(ctLabel);
        panelCompose.appendChild(ctGrid);
        panelCompose.appendChild(adminNameWrap);
        panelCompose.appendChild(bodyLabel);
        panelCompose.appendChild(bodyInput);
        panelCompose.appendChild(actionLabel);
        panelCompose.appendChild(actionChips);
        panelCompose.appendChild(closerLabel);
        panelCompose.appendChild(closerList);
        panelCompose.appendChild(previewLabel);
        panelCompose.appendChild(preview);
        panelCompose.appendChild(btnRow);

        // ── Panel: Saved Notes ───────────────────────────────────────────────────
        const panelSaved = document.createElement('div');
        panelSaved.className = 'ots-panel';

        const searchInput = document.createElement('input');
        searchInput.className = 'ots-search';
        searchInput.placeholder = 'Search saved notes…';

        const savedNotesList = document.createElement('div');

        function renderSavedNotes(filter = '') {
            savedNotesList.innerHTML = '';
            const notes = loadSavedNotes();
            const filtered = notes.filter(n =>
                !filter ||
                n.short.toLowerCase().includes(filter.toLowerCase()) ||
                n.long.toLowerCase().includes(filter.toLowerCase())
            );

            if (!filtered.length) {
                const empty = document.createElement('div');
                empty.className = 'ots-empty';
                empty.textContent = filter ? 'No notes match your search.' : 'No saved notes yet.';
                savedNotesList.appendChild(empty);
                return;
            }

            filtered.forEach((note, idx) => {
                const realIdx = notes.indexOf(note);
                const item = document.createElement('div');
                item.className = 'ots-note-item';

                const useBtn = document.createElement('button');
                useBtn.className = 'note-use-btn';
                useBtn.textContent = note.short;
                useBtn.title = note.long;
                useBtn.addEventListener('click', () => {
                    insertIntoEditor(iframe, note.long);
                });

                const editIcon = document.createElement('span');
                editIcon.className = 'note-icon';
                editIcon.textContent = '✎';
                editIcon.title = 'Edit';
                editIcon.addEventListener('click', () => openEditModal(note, realIdx, () => renderSavedNotes(searchInput.value)));

                const delIcon = document.createElement('span');
                delIcon.className = 'note-icon';
                delIcon.textContent = '×';
                delIcon.title = 'Delete';
                delIcon.style.color = '#f04438';
                delIcon.addEventListener('click', () => {
                    if (confirm(`Delete note:\n\n"${note.short}"?`)) {
                        const all = loadSavedNotes();
                        all.splice(realIdx, 1);
                        save(KEY_SAVED_NOTES, all);
                        renderSavedNotes(searchInput.value);
                    }
                });

                item.appendChild(useBtn);
                item.appendChild(editIcon);
                item.appendChild(delIcon);
                savedNotesList.appendChild(item);
            });
        }

        searchInput.addEventListener('input', () => renderSavedNotes(searchInput.value));

        // Add new saved note
        const hr = document.createElement('hr');
        hr.className = 'ots-divider';

        const newNoteLabel = document.createElement('div');
        newNoteLabel.className = 'ots-label';
        newNoteLabel.textContent = 'Save new note';

        const newShort = document.createElement('input');
        newShort.className = 'ots-search';
        newShort.placeholder = 'Button label (short title)';
        newShort.style.marginBottom = '5px';

        const newLong = document.createElement('textarea');
        newLong.className = 'ots-textarea';
        newLong.rows = 3;
        newLong.placeholder = 'Full note content…';

        const saveNoteRow = document.createElement('div');
        saveNoteRow.className = 'ots-add-row';
        saveNoteRow.style.marginTop = '6px';

        const saveNoteBtn = document.createElement('button');
        saveNoteBtn.textContent = 'Save Note';
        saveNoteBtn.addEventListener('click', () => {
            const s = newShort.value.trim();
            const l = newLong.value.trim();
            if (!s || !l) return alert('Both fields are required.');
            const notes = loadSavedNotes();
            notes.push({ short: s, long: l });
            save(KEY_SAVED_NOTES, notes);
            newShort.value = '';
            newLong.value = '';
            renderSavedNotes(searchInput.value);
        });
        saveNoteRow.appendChild(saveNoteBtn);

        panelSaved.appendChild(searchInput);
        panelSaved.appendChild(savedNotesList);
        panelSaved.appendChild(hr);
        panelSaved.appendChild(newNoteLabel);
        panelSaved.appendChild(newShort);
        panelSaved.appendChild(newLong);
        panelSaved.appendChild(saveNoteRow);

        // ── Panel: Manage ────────────────────────────────────────────────────────
        const panelManage = document.createElement('div');
        panelManage.className = 'ots-panel';

        // Action chips management
        const manageChipsLabel = document.createElement('div');
        manageChipsLabel.className = 'ots-label';
        manageChipsLabel.textContent = 'Action chips';

        const manageChips = document.createElement('div');
        manageChips.className = 'ots-chips';
        manageChips.id = 'ots-manage-chips';

        function renderManageChips() {
            manageChips.innerHTML = '';
            loadChips().forEach((chip, idx) => {
                const c = document.createElement('div');
                c.className = 'ots-chip';

                const t = document.createElement('span');
                t.textContent = chip;

                const del = document.createElement('span');
                del.className = 'chip-del';
                del.textContent = '×';
                del.addEventListener('click', () => {
                    const chips = loadChips();
                    chips.splice(idx, 1);
                    save(KEY_ACTION_CHIPS, chips);
                    renderManageChips();
                    renderActionChips();
                });

                c.appendChild(t);
                c.appendChild(del);
                manageChips.appendChild(c);
            });
        }

        const addChipRow = document.createElement('div');
        addChipRow.className = 'ots-add-row';

        const addChipInput = document.createElement('input');
        addChipInput.placeholder = 'New action chip…';

        const addChipBtn = document.createElement('button');
        addChipBtn.textContent = 'Add';
        addChipBtn.addEventListener('click', () => {
            const val = addChipInput.value.trim();
            if (!val) return;
            const chips = loadChips();
            chips.push(val);
            save(KEY_ACTION_CHIPS, chips);
            addChipInput.value = '';
            renderManageChips();
            renderActionChips();
        });
        addChipInput.addEventListener('keydown', e => { if (e.key === 'Enter') addChipBtn.click(); });

        addChipRow.appendChild(addChipInput);
        addChipRow.appendChild(addChipBtn);

        // Custom closers management
        const hr2 = document.createElement('hr');
        hr2.className = 'ots-divider';

        const manageClosersLabel = document.createElement('div');
        manageClosersLabel.className = 'ots-label';
        manageClosersLabel.textContent = 'Custom closers';

        const manageClosersList = document.createElement('div');
        manageClosersList.style.display = 'flex';
        manageClosersList.style.flexDirection = 'column';
        manageClosersList.style.gap = '5px';
        manageClosersList.style.marginBottom = '6px';

        function renderManageClosers() {
            manageClosersList.innerHTML = '';
            const userClosers = loadClosers();
            if (!userClosers.length) {
                const em = document.createElement('div');
                em.className = 'ots-empty';
                em.textContent = 'No custom closers saved yet.';
                manageClosersList.appendChild(em);
            }
            userClosers.forEach((text, idx) => {
                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '6px';
                row.style.fontSize = '12px';
                row.style.padding = '5px 7px';
                row.style.border = '1.5px solid #e4e7ec';
                row.style.borderRadius = '7px';

                const t = document.createElement('span');
                t.style.flex = '1';
                t.textContent = text;

                const del = document.createElement('span');
                del.className = 'chip-del';
                del.textContent = '×';
                del.style.fontSize = '15px';
                del.style.color = '#f04438';
                del.style.cursor = 'pointer';
                del.addEventListener('click', () => {
                    const saved = loadClosers().filter(x => x !== text);
                    save(KEY_CLOSERS, saved);
                    renderManageClosers();
                    renderClosers();
                });

                row.appendChild(t);
                row.appendChild(del);
                manageClosersList.appendChild(row);
            });
        }

        const addCloserRow = document.createElement('div');
        addCloserRow.className = 'ots-add-row';

        const addCloserInput = document.createElement('input');
        addCloserInput.placeholder = 'New closer text…';

        const addCloserBtn = document.createElement('button');
        addCloserBtn.textContent = 'Add';
        addCloserBtn.addEventListener('click', () => {
            const val = addCloserInput.value.trim();
            if (!val) return;
            const saved = loadClosers();
            saved.push(val);
            save(KEY_CLOSERS, saved);
            addCloserInput.value = '';
            renderManageClosers();
            renderClosers();
        });
        addCloserInput.addEventListener('keydown', e => { if (e.key === 'Enter') addCloserBtn.click(); });

        addCloserRow.appendChild(addCloserInput);
        addCloserRow.appendChild(addCloserBtn);

        panelManage.appendChild(manageChipsLabel);
        panelManage.appendChild(manageChips);
        panelManage.appendChild(addChipRow);
        panelManage.appendChild(hr2);
        panelManage.appendChild(manageClosersLabel);
        panelManage.appendChild(manageClosersList);
        panelManage.appendChild(addCloserRow);

        // ── Custom contact types management ──────────────────────────────────────
        const hr3 = document.createElement('hr');
        hr3.className = 'ots-divider';

        const manageCtLabel = document.createElement('div');
        manageCtLabel.className = 'ots-label';
        manageCtLabel.textContent = 'Custom contact types';

        const manageCtNote = document.createElement('div');
        manageCtNote.style.cssText = 'font-size:11px;color:#98a2b3;margin-bottom:7px;';
        manageCtNote.textContent = 'These appear alongside the built-in contact types in the Compose tab.';

        const manageCtList = document.createElement('div');
        manageCtList.style.display = 'flex';
        manageCtList.style.flexDirection = 'column';
        manageCtList.style.gap = '5px';
        manageCtList.style.marginBottom = '6px';

        function renderManageContactTypes() {
            manageCtList.innerHTML = '';
            const custom = loadCustomContactTypes();
            if (!custom.length) {
                const em = document.createElement('div');
                em.className = 'ots-empty';
                em.textContent = 'No custom contact types yet.';
                manageCtList.appendChild(em);
                return;
            }
            custom.forEach((ct, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:flex-start;gap:6px;font-size:12px;padding:6px 8px;border:1.5px solid #e4e7ec;border-radius:7px;';

                const info = document.createElement('div');
                info.style.flex = '1';

                const lbl = document.createElement('div');
                lbl.style.cssText = 'font-weight:600;color:#1d2939;margin-bottom:2px;';
                lbl.textContent = ct.label;

                const sub = document.createElement('div');
                sub.style.color = '#667085';
                sub.textContent = `Opener: "${ct.opener}"` + (ct.closer ? ` · Closer: "${ct.closer}"` : ' · No closer');

                info.appendChild(lbl);
                info.appendChild(sub);

                const editIcon = document.createElement('span');
                editIcon.textContent = '✎';
                editIcon.title = 'Edit';
                editIcon.style.cssText = 'cursor:pointer;color:#007bff;font-size:14px;flex-shrink:0;margin-top:1px;';
                editIcon.addEventListener('click', () => openContactTypeModal(ct, idx, () => {
                    renderManageContactTypes();
                    renderContactGrid();
                }));

                const delIcon = document.createElement('span');
                delIcon.textContent = '×';
                delIcon.title = 'Delete';
                delIcon.style.cssText = 'cursor:pointer;color:#f04438;font-size:16px;flex-shrink:0;line-height:1.2;';
                delIcon.addEventListener('click', () => {
                    if (confirm(`Delete contact type "${ct.label}"?`)) {
                        const all = loadCustomContactTypes();
                        all.splice(idx, 1);
                        save(KEY_CUSTOM_CONTACTS, all);
                        renderManageContactTypes();
                        renderContactGrid();
                    }
                });

                row.appendChild(info);
                row.appendChild(editIcon);
                row.appendChild(delIcon);
                manageCtList.appendChild(row);
            });
        }

        const addCtBtn = document.createElement('button');
        addCtBtn.className = 'ots-btn-primary';
        addCtBtn.textContent = '+ Add Contact Type';
        addCtBtn.style.marginTop = '4px';
        addCtBtn.addEventListener('click', () => {
            openContactTypeModal(null, null, () => {
                renderManageContactTypes();
                renderContactGrid();
            });
        });

        panelManage.appendChild(hr3);
        panelManage.appendChild(manageCtLabel);
        panelManage.appendChild(manageCtNote);
        panelManage.appendChild(manageCtList);
        panelManage.appendChild(addCtBtn);

        // ── Tab switching ────────────────────────────────────────────────────────
        function switchTab(activeTab, activePanel) {
            [tabCompose, tabSaved, tabManage].forEach(t => t.classList.remove('active'));
            [panelCompose, panelSaved, panelManage].forEach(p => p.classList.remove('active'));
            activeTab.classList.add('active');
            activePanel.classList.add('active');
        }

        tabCompose.addEventListener('click', () => switchTab(tabCompose, panelCompose));
        tabSaved.addEventListener('click', () => {
            switchTab(tabSaved, panelSaved);
            renderSavedNotes(searchInput.value);
        });
        tabManage.addEventListener('click', () => {
            switchTab(tabManage, panelManage);
            renderManageChips();
            renderManageClosers();
            renderManageContactTypes();
        });

        // ── Initial render ───────────────────────────────────────────────────────
        renderContactGrid();
        renderActionChips();
        renderClosers();
        renderSavedNotes();
        renderManageChips();
        renderManageClosers();
        renderManageContactTypes();

        wrap.appendChild(tabs);
        wrap.appendChild(panelCompose);
        wrap.appendChild(panelSaved);
        wrap.appendChild(panelManage);

        modal.querySelector('.modal-body')?.appendChild(wrap);
    }

    // ─── Edit modal (for saved notes) ──────────────────────────────────────────
    function openEditModal(note, idx, onSave) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10000;display:flex;align-items:center;justify-content:center;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:360px;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:Segoe UI,system-ui,sans-serif;';

        const title = document.createElement('div');
        title.textContent = 'Edit Saved Note';
        title.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:12px;color:#1d2939;';

        const shortEdit = document.createElement('input');
        shortEdit.value = note.short;
        shortEdit.style.cssText = 'width:100%;border:1.5px solid #d0d5dd;border-radius:7px;padding:7px 10px;font-size:12px;margin-bottom:8px;outline:none;box-sizing:border-box;';

        const longEdit = document.createElement('textarea');
        longEdit.value = note.long;
        longEdit.rows = 4;
        longEdit.style.cssText = 'width:100%;border:1.5px solid #d0d5dd;border-radius:7px;padding:7px 10px;font-size:12px;margin-bottom:12px;outline:none;resize:vertical;box-sizing:border-box;';

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.cssText = 'flex:1;padding:8px;background:#e04b00;color:#fff;border:none;border-radius:7px;font-weight:700;cursor:pointer;font-size:13px;';
        saveBtn.addEventListener('click', () => {
            const s = shortEdit.value.trim();
            const l = longEdit.value.trim();
            if (!s || !l) return alert('Both fields are required.');
            const notes = loadSavedNotes();
            notes[idx] = { short: s, long: l };
            save(KEY_SAVED_NOTES, notes);
            document.body.removeChild(overlay);
            onSave();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 16px;background:#f2f4f7;color:#344054;border:none;border-radius:7px;font-weight:600;cursor:pointer;font-size:13px;';
        cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);
        box.appendChild(title);
        box.appendChild(shortEdit);
        box.appendChild(longEdit);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });
        document.body.appendChild(overlay);
    }

    // ─── Add/Edit contact type modal ───────────────────────────────────────────
    function openContactTypeModal(existing, idx, onSave) {
        const isEdit = existing !== null && idx !== null;
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:10000;display:flex;align-items:center;justify-content:center;';

        const box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:380px;box-shadow:0 8px 32px rgba(0,0,0,.18);font-family:Segoe UI,system-ui,sans-serif;box-sizing:border-box;';

        const titleEl = document.createElement('div');
        titleEl.textContent = isEdit ? 'Edit Contact Type' : 'Add Contact Type';
        titleEl.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:14px;color:#1d2939;';

        const fieldStyle = 'width:100%;border:1.5px solid #d0d5dd;border-radius:7px;padding:7px 10px;font-size:12px;margin-bottom:8px;outline:none;box-sizing:border-box;';
        const labelStyle = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#98a2b3;margin-bottom:3px;display:block;';

        const labelLbl = document.createElement('span');
        labelLbl.style.cssText = labelStyle;
        labelLbl.textContent = 'Button label (e.g. "Student Texted In")';

        const labelInput = document.createElement('input');
        labelInput.value = isEdit ? existing.label : '';
        labelInput.placeholder = 'Student Texted In';
        labelInput.style.cssText = fieldStyle;

        const openerLbl = document.createElement('span');
        openerLbl.style.cssText = labelStyle;
        openerLbl.textContent = 'Opener (auto-fills start of note)';

        const openerInput = document.createElement('input');
        openerInput.value = isEdit ? existing.opener : '';
        openerInput.placeholder = 'Student texted in - ';
        openerInput.style.cssText = fieldStyle;

        const closerLbl = document.createElement('span');
        closerLbl.style.cssText = labelStyle;
        closerLbl.textContent = 'Closer (optional — auto-selects at end of note)';

        // Dropdown of existing closers + blank option
        const closerSelect = document.createElement('select');
        closerSelect.style.cssText = fieldStyle + 'background:#fff;cursor:pointer;';

        function populateCloserSelect() {
            closerSelect.innerHTML = '';
            const blankOpt = document.createElement('option');
            blankOpt.value = '';
            blankOpt.textContent = '— None —';
            closerSelect.appendChild(blankOpt);

            const builtIn = CONTACT_TYPES.filter(ct => ct.closer).map(ct => ct.closer);
            const userClosers = loadClosers();
            [...new Set([...builtIn, ...userClosers])].forEach(text => {
                const opt = document.createElement('option');
                opt.value = text;
                opt.textContent = text.length > 60 ? text.slice(0, 57) + '…' : text;
                closerSelect.appendChild(opt);
            });

            if (isEdit && existing.closer) closerSelect.value = existing.closer;
        }
        populateCloserSelect();

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:14px;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = isEdit ? 'Save Changes' : 'Add Contact Type';
        saveBtn.style.cssText = 'flex:1;padding:9px;background:#e04b00;color:#fff;border:none;border-radius:7px;font-weight:700;cursor:pointer;font-size:13px;';
        saveBtn.addEventListener('click', () => {
            const label  = labelInput.value.trim();
            const opener = openerInput.value.trim();
            const closer = closerSelect.value;
            if (!label || !opener) return alert('Label and opener are required.');

            const newCt = {
                id:     'custom_' + Date.now(),
                label,
                opener: opener.endsWith(' ') ? opener : opener + ' ',
                closer,
            };

            const all = loadCustomContactTypes();
            if (isEdit) {
                newCt.id = existing.id; // preserve id on edit
                all[idx] = newCt;
            } else {
                all.push(newCt);
            }
            save(KEY_CUSTOM_CONTACTS, all);
            document.body.removeChild(overlay);
            onSave();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:9px 16px;background:#f2f4f7;color:#344054;border:none;border-radius:7px;font-weight:600;cursor:pointer;font-size:13px;';
        cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));

        btnRow.appendChild(saveBtn);
        btnRow.appendChild(cancelBtn);

        box.appendChild(titleEl);
        box.appendChild(labelLbl);
        box.appendChild(labelInput);
        box.appendChild(openerLbl);
        box.appendChild(openerInput);
        box.appendChild(closerLbl);
        box.appendChild(closerSelect);
        box.appendChild(btnRow);

        overlay.appendChild(box);
        overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });
        document.body.appendChild(overlay);
    }

    // ─── Bootstrap ──────────────────────────────────────────────────────────────
    const onStudentDashboard  = location.href.includes('/admin/students/dashboard/');
    const onCorporateNotes    = location.href.includes('/admin/corporate/manage_notes.asp');

    if (onStudentDashboard) {
        // Original page: #addnotebutton → sizeModal40 modal → iframe
        waitFor('#addnotebutton button.btn-primary', (addBtn) => {
            addBtn.addEventListener('click', () => {
                waitFor('body > div.modal.sizeModal40.fade.in', (modal) => {
                    waitFor('div.modal iframe', (iframe) => {
                        buildUI(modal, iframe);
                    });
                });
            });
        });
    }

    if (onCorporateNotes) {
        // Corporate page: AngularJS ng-click="nc.ShowModal()" Add Note button
        // The modal and iframe may be injected dynamically by Angular, so we
        // watch for the Add Note button click then wait for any modal + iframe.
        waitFor('input[value="Add Note"]', (addBtn) => {
            addBtn.addEventListener('click', () => {
                // Try the same modal selector first; fall back to any visible modal
                waitFor('.modal.in, .modal.show, [role="dialog"]', (modal) => {
                    waitFor('.modal iframe, [role="dialog"] iframe', (iframe) => {
                        buildUI(modal, iframe);
                    });
                });
            });
        });
    }

})();