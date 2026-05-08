// ==UserScript==
// @name         Corp Account Admin Email and SUI/Portal Scraper
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Scrape org name, state, portal, subdomain, and admin emails
// @author       You
// @match        https://otsystems.net/admin/corporate/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      otsystems.net
// ==/UserScript==

(function () {
    'use strict';

    const URLS = [
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=267",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=468",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=501",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=542",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=1441",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=1625",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=1657",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=1685",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=1734",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=1962",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2158",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2232",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2299",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2465",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2541",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2624",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2635",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2654",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2737",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2741",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2822",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2849",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=2983",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=3191",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=3212",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=3611",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=3723",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=3729",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=3867",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4348",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4493",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4518",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4558",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4593",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4616",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4651",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4793",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4814",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4957",
        "https://otsystems.net/admin/corporate/org_master_edit.asp?id=4983"
    ];

    const PORTAL_NAMES = { 'safetyunlimited.com': 'Safety Unlimited' };

    let allResults = [];
    let sortCol = null;
    let sortDir = 1;
    // Track which individual emails are selected: Set of "orgId::email"
    let selectedEmails = new Set();

    // ── Parse org page ─────────────────────────────────────────────────────
    function parsePage(html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        let name = 'N/A';
        const h4 = doc.querySelector('.col-sm-7 h4');
        if (h4) {
            const clone = h4.cloneNode(true);
            const small = clone.querySelector('small');
            if (small) small.remove();
            name = clone.textContent.trim();
        }

        let state = 'N/A';
        const stateInput = doc.querySelector('#POC_state');
        if (stateInput) state = stateInput.value.trim();

        let portal = 'N/A', subdomain = 'N/A';
        const portalLink = doc.querySelector('.col-sm-7 h4 small a');
        if (portalLink) {
            try {
                const href = portalLink.getAttribute('href');
                const url = new URL(href);
                const hostname = url.hostname.replace(/^www\./, '');
                portal = PORTAL_NAMES[hostname] || hostname;
                if (portal !== 'Safety Unlimited') {
                    const subMatch = url.hostname.match(/^(?:www\.)?([^.]+)\.otsystems\.net$/);
                    subdomain = subMatch ? subMatch[1] : (url.pathname.replace(/^\//, '').split('/')[0] || 'N/A');
                }
            } catch (e) { portal = portalLink.textContent.trim(); }
        }

        return { name, state, portal, subdomain };
    }

    // ── Fetch emails via hidden iframe (handles Angular) ───────────────────
    function fetchAdminEmails(orgId) {
        return new Promise((resolve) => {
            const url = `https://otsystems.net/admin/corporate/manage_administrators.asp?id=${orgId}`;
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1200px;height:800px;opacity:0;pointer-events:none;';
            iframe.src = url;
            document.body.appendChild(iframe);

            let attempts = 0;
            const poll = setInterval(() => {
                attempts++;
                try {
                    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const rows = iDoc.querySelectorAll('tbody tr.ng-scope');
                    if (rows.length > 0) {
                        clearInterval(poll);
                        const emails = [];
                        rows.forEach(row => {
                            const tds = row.querySelectorAll('td.ng-binding');
                            if (tds.length >= 4) {
                                const email = tds[3].textContent.trim();
                                if (email && email.includes('@')) emails.push(email);
                            }
                        });
                        document.body.removeChild(iframe);
                        resolve([...new Set(emails)]);
                    } else if (attempts >= 30) {
                        clearInterval(poll);
                        document.body.removeChild(iframe);
                        resolve([]);
                    }
                } catch (e) {
                    clearInterval(poll);
                    try { document.body.removeChild(iframe); } catch (_) {}
                    resolve([]);
                }
            }, 500);
        });
    }

    // ── Build panel ────────────────────────────────────────────────────────
    function buildPanel() {
        if (document.getElementById('scraper-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'scraper-panel';
        Object.assign(panel.style, {
            position: 'fixed', top: '60px', right: '10px',
            width: '860px', maxHeight: '85vh',
            background: '#fff', border: '2px solid #337ab7',
            borderRadius: '6px', zIndex: 99999,
            boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'Arial, sans-serif', fontSize: '13px'
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            background: '#337ab7', color: '#fff', padding: '8px 12px',
            fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        });
        header.innerHTML = '<span>Org Scraper Results</span>';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        Object.assign(closeBtn.style, { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '16px' });
        closeBtn.onclick = () => panel.remove();
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // Progress
        const progWrap = document.createElement('div');
        Object.assign(progWrap.style, { padding: '6px 12px', borderBottom: '1px solid #ddd' });
        const progLabel = document.createElement('div');
        progLabel.id = 'scraper-prog-label';
        progLabel.textContent = 'Ready';
        const progBar = document.createElement('progress');
        progBar.id = 'scraper-progress';
        progBar.style.width = '100%';
        progBar.value = 0; progBar.max = URLS.length;
        progWrap.appendChild(progLabel);
        progWrap.appendChild(progBar);
        panel.appendChild(progWrap);

        // Toolbar
        const toolbar = document.createElement('div');
        Object.assign(toolbar.style, {
            padding: '6px 12px', borderBottom: '1px solid #ddd',
            display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center'
        });

        const copyCSVBtn = document.createElement('button');
        copyCSVBtn.textContent = '📋 Copy CSV';
        styleBtn(copyCSVBtn, '#5cb85c');
        copyCSVBtn.onclick = copyCSV;

        const copyAllBtn = document.createElement('button');
        copyAllBtn.textContent = '📧 Copy ALL Emails';
        styleBtn(copyAllBtn, '#337ab7');
        copyAllBtn.onclick = copyAllEmails;

        const copySelBtn = document.createElement('button');
        copySelBtn.id = 'copy-selected-btn';
        copySelBtn.textContent = '✅ Copy Selected (0)';
        styleBtn(copySelBtn, '#8e44ad');
        copySelBtn.onclick = copySelectedEmails;

        const selectAllBtn = document.createElement('button');
        selectAllBtn.textContent = '☑ Select All';
        styleBtn(selectAllBtn, '#16a085');
        selectAllBtn.onclick = () => { selectAllEmailsAction(true); };

        const deselectAllBtn = document.createElement('button');
        deselectAllBtn.textContent = '☐ Deselect All';
        styleBtn(deselectAllBtn, '#7f8c8d');
        deselectAllBtn.onclick = () => { selectAllEmailsAction(false); };

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '🗑 Clear';
        styleBtn(clearBtn, '#d9534f');
        clearBtn.onclick = () => { allResults = []; selectedEmails.clear(); renderTable(); updateSelectedCount(); };

        toolbar.appendChild(copyCSVBtn);
        toolbar.appendChild(copyAllBtn);
        toolbar.appendChild(copySelBtn);
        toolbar.appendChild(selectAllBtn);
        toolbar.appendChild(deselectAllBtn);
        toolbar.appendChild(clearBtn);
        panel.appendChild(toolbar);

        // Email output box
        const emailBox = document.createElement('div');
        emailBox.id = 'scraper-email-box';
        Object.assign(emailBox.style, {
            display: 'none', padding: '6px 12px',
            borderBottom: '1px solid #ddd', background: '#f0f7ff'
        });
        const emailTopRow = document.createElement('div');
        Object.assign(emailTopRow.style, {
            fontWeight: 'bold', marginBottom: '4px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        });
        emailTopRow.innerHTML = '<span id="scraper-email-box-title">Emails</span>';
        const emailBtns = document.createElement('div');
        emailBtns.style.cssText = 'display:flex;gap:6px;';
        const outlookBtn = document.createElement('button');
        outlookBtn.textContent = '📋 Copy for Outlook';
        styleBtn(outlookBtn, '#337ab7');
        outlookBtn.style.fontSize = '11px';
        outlookBtn.onclick = () => {
            navigator.clipboard.writeText(document.getElementById('scraper-email-ta').value)
                .then(() => alert('Copied! Paste into Outlook To: field.'));
        };
        const closeBoxBtn = document.createElement('button');
        closeBoxBtn.textContent = '✕';
        styleBtn(closeBoxBtn, '#999');
        closeBoxBtn.style.fontSize = '11px';
        closeBoxBtn.onclick = () => { emailBox.style.display = 'none'; };
        emailBtns.appendChild(outlookBtn);
        emailBtns.appendChild(closeBoxBtn);
        emailTopRow.appendChild(emailBtns);
        const emailTa = document.createElement('textarea');
        emailTa.id = 'scraper-email-ta';
        Object.assign(emailTa.style, {
            width: '100%', height: '55px', fontSize: '12px',
            fontFamily: 'Arial, sans-serif', resize: 'vertical',
            boxSizing: 'border-box', padding: '4px', marginTop: '4px'
        });
        emailBox.appendChild(emailTopRow);
        emailBox.appendChild(emailTa);
        panel.appendChild(emailBox);

        // Table
        const tableWrap = document.createElement('div');
        Object.assign(tableWrap.style, { overflowY: 'auto', flex: '1' });
        tableWrap.innerHTML = `
          <table style="width:100%;border-collapse:collapse;">
            <thead style="position:sticky;top:0;background:#f0f4f8;z-index:1;">
              <tr>
                <th style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;white-space:nowrap;">
                  <input type="checkbox" id="select-all-chk" title="Select/deselect all emails">
                </th>
                <th class="sortable" data-col="id" style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;cursor:pointer;white-space:nowrap;">ID ↕</th>
                <th class="sortable" data-col="name" style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;cursor:pointer;">Name ↕</th>
                <th class="sortable" data-col="state" style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;cursor:pointer;white-space:nowrap;">State ↕</th>
                <th class="sortable" data-col="portal" style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;cursor:pointer;white-space:nowrap;">Portal ↕</th>
                <th class="sortable" data-col="subdomain" style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;cursor:pointer;white-space:nowrap;">Subdomain ↕</th>
                <th style="padding:5px 8px;border-bottom:2px solid #ddd;text-align:left;">Admin Emails</th>
              </tr>
            </thead>
            <tbody id="scraper-tbody"></tbody>
          </table>`;
        panel.appendChild(tableWrap);
        document.body.appendChild(panel);

        // Header checkbox — select/deselect all
        panel.querySelector('#select-all-chk').addEventListener('change', (e) => {
            selectAllEmailsAction(e.target.checked);
        });

        panel.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (sortCol === col) sortDir *= -1;
                else { sortCol = col; sortDir = 1; }
                renderTable();
            });
        });
    }

    function styleBtn(btn, bg) {
        Object.assign(btn.style, {
            padding: '3px 10px', cursor: 'pointer', background: bg,
            color: '#fff', border: 'none', borderRadius: '3px', fontSize: '12px'
        });
    }

    // ── Select / deselect all loaded emails ────────────────────────────────
    function selectAllEmailsAction(select) {
        selectedEmails.clear();
        if (select) {
            allResults.forEach(r => {
                if (r.emails && r.emails.length > 0) {
                    r.emails.forEach(e => selectedEmails.add(`${r.id}::${e}`));
                }
            });
        }
        updateSelectedCount();
        renderTable();
    }

    function updateSelectedCount() {
        const btn = document.getElementById('copy-selected-btn');
        if (btn) btn.textContent = `✅ Copy Selected (${selectedEmails.size})`;
        const chk = document.getElementById('select-all-chk');
        if (chk) {
            const totalLoaded = allResults.reduce((n, r) => n + (r.emails ? r.emails.length : 0), 0);
            chk.checked = totalLoaded > 0 && selectedEmails.size === totalLoaded;
            chk.indeterminate = selectedEmails.size > 0 && selectedEmails.size < totalLoaded;
        }
    }

    // ── Render table ───────────────────────────────────────────────────────
    function renderTable() {
        const tbody = document.querySelector('#scraper-tbody');
        if (!tbody) return;

        let sorted = [...allResults];
        if (sortCol) {
            sorted.sort((a, b) => {
                let av = (a[sortCol] || '').toString().toLowerCase();
                let bv = (b[sortCol] || '').toString().toLowerCase();
                if (sortCol === 'id') { av = parseInt(av) || 0; bv = parseInt(bv) || 0; }
                return av < bv ? -1 * sortDir : av > bv ? sortDir : 0;
            });
        }

        tbody.innerHTML = '';
        sorted.forEach((r, i) => {
            const isHighlighted = ['NJ', 'NY'].includes((r.state || '').toUpperCase());
            const isSafetyUnlimited = r.portal === 'Safety Unlimited';

            // Portal badge
            let portalBadge = r.portal === 'N/A'
                ? `<span style="color:#999;font-style:italic;">N/A</span>`
                : isSafetyUnlimited
                    ? `<span style="background:#dff0d8;color:#3c763d;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:bold;">✔ Safety Unlimited</span>`
                    : `<span style="background:#fcf8e3;color:#8a6d3b;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:bold;">⚠ ${r.portal}</span>`;

            const subdomainCell = (isSafetyUnlimited || r.subdomain === 'N/A')
                ? `<span style="color:#ccc;">—</span>`
                : `<span style="background:#e8f0fe;color:#1a56b0;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:bold;">${r.subdomain}</span>`;

            // Emails cell — individual checkboxes per email
            let emailsCell;
            if (r.emails === undefined) {
                emailsCell = `<span style="color:#999;font-style:italic;font-size:11px;">⏳ Loading...</span>`;
            } else if (r.emails.length === 0) {
                emailsCell = `<span style="color:#999;font-style:italic;font-size:11px;">No admins found</span>`;
            } else {
                const checkboxes = r.emails.map(email => {
                    const key = `${r.id}::${email}`;
                    const checked = selectedEmails.has(key) ? 'checked' : '';
                    return `<label style="display:block;font-size:11px;margin:1px 0;cursor:pointer;white-space:nowrap;">
                        <input type="checkbox" class="email-chk" data-key="${key}" data-email="${email}" ${checked}
                            style="margin-right:4px;cursor:pointer;">
                        ${email}
                    </label>`;
                }).join('');
                emailsCell = `<div>${checkboxes}</div>`;
            }

            const rowBg = r.error ? '#fff3f3' : isHighlighted ? '#f2dede' : (i % 2 === 0 ? '#fff' : '#f9f9f9');
            const rowColor = isHighlighted && !r.error ? '#a94442' : '';
            const rowWeight = isHighlighted && !r.error ? 'bold' : '';

            const tr = document.createElement('tr');
            tr.style.cssText = `background:${rowBg};color:${rowColor};font-weight:${rowWeight};`;
            tr.innerHTML = `
              <td style="padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top;">
                ${r.emails && r.emails.length > 0
                    ? `<input type="checkbox" class="org-chk" data-id="${r.id}" title="Select all emails for this org"
                        ${r.emails.every(e => selectedEmails.has(`${r.id}::${e}`)) ? 'checked' : ''}
                        style="cursor:pointer;">`
                    : ''}
              </td>
              <td style="padding:3px 8px;border-bottom:1px solid #eee;white-space:nowrap;vertical-align:top;">${r.id}</td>
              <td style="padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top;">${r.name}</td>
              <td style="padding:3px 8px;border-bottom:1px solid #eee;white-space:nowrap;vertical-align:top;">${r.state}</td>
              <td style="padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top;">${portalBadge}</td>
              <td style="padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top;">${subdomainCell}</td>
              <td style="padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top;">${emailsCell}</td>`;

            tbody.appendChild(tr);
        });

        // Org-level checkbox — toggles all emails for that org
        tbody.querySelectorAll('.org-chk').forEach(chk => {
            chk.addEventListener('change', () => {
                const id = chk.dataset.id;
                const rec = allResults.find(r => r.id === id);
                if (!rec || !rec.emails) return;
                if (chk.checked) {
                    rec.emails.forEach(e => selectedEmails.add(`${id}::${e}`));
                } else {
                    rec.emails.forEach(e => selectedEmails.delete(`${id}::${e}`));
                }
                updateSelectedCount();
                renderTable();
            });
        });

        // Individual email checkboxes
        tbody.querySelectorAll('.email-chk').forEach(chk => {
            chk.addEventListener('change', () => {
                if (chk.checked) selectedEmails.add(chk.dataset.key);
                else selectedEmails.delete(chk.dataset.key);
                updateSelectedCount();
                // Re-render just the org checkbox state without full re-render
                const orgChk = chk.closest('tr').querySelector('.org-chk');
                if (orgChk) {
                    const id = orgChk.dataset.id;
                    const rec = allResults.find(r => r.id === id);
                    if (rec && rec.emails) {
                        orgChk.checked = rec.emails.every(e => selectedEmails.has(`${id}::${e}`));
                        orgChk.indeterminate = !orgChk.checked && rec.emails.some(e => selectedEmails.has(`${id}::${e}`));
                    }
                }
            });
        });

        updateSelectedCount();
    }

    // ── Show email output box ──────────────────────────────────────────────
    function showEmailBox(title, emails) {
        const box = document.getElementById('scraper-email-box');
        const ta = document.getElementById('scraper-email-ta');
        const titleEl = document.getElementById('scraper-email-box-title');
        if (!box || !ta) return;
        titleEl.textContent = title;
        ta.value = emails.length > 0 ? emails.join('; ') : '(no emails)';
        box.style.display = 'block';
    }

    // ── Copy actions ───────────────────────────────────────────────────────
    function copyAllEmails() {
        const all = [];
        allResults.forEach(r => { if (r.emails) all.push(...r.emails); });
        const unique = [...new Set(all)];
        if (unique.length === 0) { alert('No emails loaded yet.'); return; }
        navigator.clipboard.writeText(unique.join('; '))
            .then(() => {
                showEmailBox(`All Emails (${unique.length})`, unique);
                alert(`${unique.length} email(s) copied for Outlook!`);
            });
    }

    function copySelectedEmails() {
        if (selectedEmails.size === 0) { alert('No emails selected. Check the boxes next to the emails you want.'); return; }
        const emails = [...new Set([...selectedEmails].map(k => k.split('::')[1]))];
        navigator.clipboard.writeText(emails.join('; '))
            .then(() => {
                showEmailBox(`Selected Emails (${emails.length})`, emails);
                alert(`${emails.length} selected email(s) copied for Outlook!`);
            });
    }

    function copyCSV() {
        const csv = 'ID,Name,State,Portal,Subdomain,Emails\n' + allResults.map(r =>
            [r.id, r.name, r.state, r.portal, r.subdomain, (r.emails || []).join(', ')]
                .map(v => `"${(v || '').replace(/"/g, '""')}"`)
                .join(',')
        ).join('\n');
        navigator.clipboard.writeText(csv).then(() => alert('CSV copied!'));
    }

    // ── Fetch one org URL ──────────────────────────────────────────────────
    function fetchOne(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET', url,
                onload(resp) {
                    const id = new URL(url).searchParams.get('id');
                    if (resp.status === 200) {
                        const { name, state, portal, subdomain } = parsePage(resp.responseText);
                        resolve({ id, name, state, portal, subdomain, error: false });
                    } else {
                        resolve({ id, name: `HTTP ${resp.status}`, state: '?', portal: 'N/A', subdomain: 'N/A', error: true });
                    }
                },
                onerror() {
                    const id = new URL(url).searchParams.get('id');
                    resolve({ id, name: 'Request failed', state: '?', portal: 'N/A', subdomain: 'N/A', error: true });
                }
            });
        });
    }

    // ── Main scrape + auto-load emails ────────────────────────────────────
    async function runScrape() {
        const btn = document.getElementById('scraper-start-btn');
        if (btn) btn.disabled = true;
        allResults = [];
        selectedEmails.clear();
        buildPanel();

        // Phase 1: scrape all org pages
        const label = document.querySelector('#scraper-prog-label');
        const prog = document.querySelector('#scraper-progress');
        const CONCURRENCY = 4;
        let idx = 0, done = 0;
        const total = URLS.length;

        if (prog) prog.max = total;

        async function scrapeWorker() {
            while (idx < total) {
                const i = idx++;
                const result = await fetchOne(URLS[i]);
                done++;
                allResults.push(result);
                renderTable();
                if (prog) prog.value = done;
                if (label) label.textContent = `Phase 1/2 — Scraping orgs: ${done} / ${total}`;
            }
        }
        await Promise.all(Array.from({ length: CONCURRENCY }, scrapeWorker));

        // Phase 2: load emails for all orgs one at a time (iframes can't run concurrently well)
        if (label) label.textContent = `Phase 2/2 — Loading admin emails...`;
        if (prog) { prog.value = 0; prog.max = allResults.length; }

        let emailsDone = 0;
        for (const rec of allResults) {
            if (label) label.textContent = `Phase 2/2 — Loading emails: ${emailsDone} / ${allResults.length} — ${rec.name}`;
            rec.emails = await fetchAdminEmails(rec.id);
            emailsDone++;
            if (prog) prog.value = emailsDone;
            renderTable();
        }

        if (label) label.textContent = `✅ Done — ${total} orgs, ${allResults.reduce((n, r) => n + (r.emails ? r.emails.length : 0), 0)} admin emails loaded`;
        if (btn) btn.disabled = false;
        updateSelectedCount();
    }

    // ── Inject start button ────────────────────────────────────────────────
    function injectButton() {
        const col = document.querySelector('.col-sm-7');
        if (!col || document.getElementById('scraper-start-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'scraper-start-btn';
        btn.textContent = '🔍 Scrape All Orgs';
        Object.assign(btn.style, {
            marginLeft: '12px', padding: '4px 12px',
            background: '#337ab7', color: '#fff',
            border: 'none', borderRadius: '4px',
            cursor: 'pointer', fontSize: '13px', verticalAlign: 'middle'
        });
        btn.onclick = runScrape;
        col.parentNode.insertBefore(btn, col.nextSibling);
    }

    injectButton();
})();