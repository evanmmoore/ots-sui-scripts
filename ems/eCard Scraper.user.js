// ==UserScript==
// @name         eCard Scraper
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Fetches eCard numbers for enrolled students, then submits them to AHA ecards.heart.org
// @author       Claude
// @match        https://admin2025.otsystems.net/training/classroom/session/*/students*
// @match        https://admin2025.otsystems.net/*
// @match        https://otsystems.net/admin/students/dashboard/*
// @match        https://ecards.heart.org/student/myecards*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// ==/UserScript==

(function () {
  'use strict';

  const HOST = location.hostname;
  const IS_OT_WORKER  = HOST === 'otsystems.net';
  const IS_AHA_WORKER = HOST === 'ecards.heart.org';

  /* ══════════════════════════════════════════════════════════════
     WORKER A — otsystems.net: fetch notes, write results to GM
  ══════════════════════════════════════════════════════════════ */
  if (IS_OT_WORKER) {
    async function runWorker() {
      const raw = await GM_getValue('ec_job', null);
      if (!raw) return;
      let job;
      try { job = JSON.parse(raw); } catch (e) { return; }
      if (job.status !== 'pending') return;

      job.status = 'running';
      await GM_setValue('ec_job', JSON.stringify(job));

      const API = 'https://otsystems.net/admin/students/dashboard/notes/API/JSON_NotesEvents.asp';

      for (let i = 0; i < job.students.length; i++) {
        const s = job.students[i];
        try {
          const res = await fetch(API, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ StudentNumber: parseInt(s.number), FormAction: 'getnotes' })
          });
          const data = await res.json();
          const notes = (data && data.returnObj && data.returnObj.Notes) || [];
          const text = notes.map(n => n.Body || '').join('\n');
          job.results[s.number] = parseEcard(text) || null;
        } catch (e) {
          job.results[s.number] = null;
        }
        job.progress = i + 1;
        await GM_setValue('ec_job', JSON.stringify(job));
        await sleep(150);
      }

      job.status = 'done';
      await GM_setValue('ec_job', JSON.stringify(job));
      setTimeout(() => window.close(), 800);
    }

    runWorker();
    return;
  }

  /* ══════════════════════════════════════════════════════════════
     WORKER B — ecards.heart.org: fill textarea and click Verify
  ══════════════════════════════════════════════════════════════ */
  if (IS_AHA_WORKER) {
    async function runAhaWorker() {
      const raw = await GM_getValue('ec_aha_job', null);
      if (!raw) return;
      let job;
      try { job = JSON.parse(raw); } catch (e) { return; }
      if (job.status !== 'pending') return;

      job.status = 'running';
      await GM_setValue('ec_aha_job', JSON.stringify(job));

      // Wait for the page to fully load
      await waitForEl('#ecardcodeemp', 10000).catch(() => null);

      // Click the Employer tab
      const empTab = document.querySelector('a[href="#emp"]');
      if (empTab) {
        empTab.click();
        await sleep(600);
      }

      // Wait for textarea to be visible/active
      const textarea = await waitForEl('#ecardcodeemp', 5000).catch(() => null);
      if (!textarea) {
        job.status = 'error';
        job.error = 'Could not find ecard textarea';
        await GM_setValue('ec_aha_job', JSON.stringify(job));
        return;
      }

      // Fill in ecard numbers one per line
      textarea.value = job.ecards.join('\n');
      // Trigger Angular/React change events
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      await sleep(400);

      // Click Verify button
      const verifyBtn = document.querySelector('button[data-url="/Student/MyeCards/VerifyECards"]');
      if (verifyBtn) {
        verifyBtn.click();
        job.status = 'done';
      } else {
        job.status = 'error';
        job.error = 'Could not find Verify button';
      }

      await GM_setValue('ec_aha_job', JSON.stringify(job));
    }

    runAhaWorker();
    return;
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN SIDE — admin2025.otsystems.net
  ══════════════════════════════════════════════════════════════ */

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function parseEcard(text) {
    const n = text.replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
    const m = n.match(/\be[-\s]?card[\s:]+(\d{8,20})/i);
    return m ? m[1] : null;
  }

  function waitForEl(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error('Timeout'));
        setTimeout(check, 300);
      };
      check();
    });
  }

  GM_addStyle(`
    #ec-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 14px; margin-left: 8px;
      background: #fff; border: 1px solid #0d6efd; border-radius: 6px;
      color: #0d6efd; font-size: 13px; font-weight: 500; cursor: pointer;
      transition: background .15s, color .15s;
      font-family: inherit; vertical-align: middle;
    }
    #ec-btn:hover { background: #0d6efd; color: #fff; }
    #ec-btn:disabled { opacity: .55; cursor: not-allowed; }
    #ec-btn .ec-spinner {
      width: 12px; height: 12px;
      border: 2px solid currentColor; border-top-color: transparent;
      border-radius: 50%; animation: ec-spin .65s linear infinite; display: none;
    }
    #ec-btn.loading .ec-spinner { display: inline-block; }
    #ec-btn.loading .ec-icon { display: none; }
    @keyframes ec-spin { to { transform: rotate(360deg); } }

    #ec-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity .18s;
    }
    #ec-overlay.open { opacity: 1; pointer-events: all; }

    #ec-panel {
      background: #fff; border: 1px solid #dee2e6;
      border-radius: 8px; width: min(860px, 95vw); max-height: 90vh;
      overflow: hidden; display: flex; flex-direction: column;
      box-shadow: 0 8px 32px rgba(0,0,0,.18);
      transform: translateY(12px); transition: transform .18s;
      font-family: inherit;
    }
    #ec-overlay.open #ec-panel { transform: translateY(0); }

    #ec-header {
      padding: 14px 20px; border-bottom: 1px solid #dee2e6;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0; background: #f8f9fa;
    }
    #ec-header h5 {
      margin: 0; font-size: 15px; font-weight: 600; color: #212529;
      display: flex; align-items: center; gap: 8px;
    }
    #ec-header h5 .material-symbols-outlined { font-size: 20px; color: #6c757d; }
    #ec-count {
      font-size: 11px; font-weight: 500; padding: 2px 8px;
      background: #0d6efd; color: #fff; border-radius: 20px;
    }
    #ec-close {
      background: none; border: none; color: #6c757d;
      font-size: 18px; cursor: pointer; padding: 2px 6px;
      border-radius: 4px; line-height: 1; transition: background .12s, color .12s;
    }
    #ec-close:hover { background: #e9ecef; color: #212529; }

    #ec-progress-wrap {
      padding: 10px 20px; border-bottom: 1px solid #dee2e6;
      flex-shrink: 0; display: none; background: #fff;
    }
    #ec-progress-wrap.visible { display: block; }
    #ec-progress-label { font-size: 12px; color: #6c757d; margin-bottom: 5px; }
    #ec-progress-track { height: 5px; background: #e9ecef; border-radius: 4px; overflow: hidden; }
    #ec-progress-fill { height: 100%; width: 0%; background: #0d6efd; border-radius: 4px; transition: width .25s; }

    #ec-body { overflow-y: auto; flex: 1; }

    #ec-table { width: 100%; border-collapse: collapse; font-size: 13px; color: #212529; }
    #ec-table thead th {
      padding: 8px 14px; font-size: 11px; font-weight: 600;
      color: #6c757d; text-transform: uppercase; letter-spacing: .6px;
      background: #f8f9fa; border-bottom: 2px solid #dee2e6;
      border-right: 1px solid #dee2e6; text-align: left;
    }
    #ec-table thead th:last-child { border-right: none; }
    #ec-table tbody tr { border-bottom: 1px solid #f0f0f0; transition: background .08s; }
    #ec-table tbody tr:hover { background: #f8f9fa; }
    #ec-table td { padding: 9px 14px; vertical-align: middle; border-right: 1px solid #f0f0f0; }
    #ec-table td:last-child { border-right: none; }
    #ec-table td.mono { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 12px; }

    .ec-name-link { color: #0d6efd; text-decoration: none; font-weight: 500; }
    .ec-name-link:hover { text-decoration: underline; }
    .ec-student-num { font-size: 11px; color: #6c757d; }

    .ec-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 500; padding: 3px 8px; border-radius: 4px;
    }
    .ec-badge.pending   { background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; }
    .ec-badge.loading   { background: #cfe2ff; color: #084298; border: 1px solid #b6d4fe; }
    .ec-badge.found     { background: #d1e7dd; color: #0a3622; border: 1px solid #a3cfbb; }
    .ec-badge.not-found { background: #f8d7da; color: #58151c; border: 1px solid #f1aeb5; }
    .ec-badge .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
    .ec-badge.loading .dot { animation: ec-pulse .9s ease-in-out infinite; }
    @keyframes ec-pulse { 0%,100%{opacity:.3} 50%{opacity:1} }

    #ec-footer {
      padding: 10px 20px; border-top: 1px solid #dee2e6;
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0; background: #f8f9fa; gap: 8px;
    }
    #ec-footer-info { font-size: 12px; color: #6c757d; flex: 1; }
    #ec-footer-btns { display: flex; gap: 8px; }

    .ec-footer-btn {
      padding: 5px 14px; background: #fff; border-radius: 5px;
      font-size: 12px; font-weight: 500; cursor: pointer;
      transition: background .12s, color .12s; font-family: inherit;
      display: inline-flex; align-items: center; gap: 5px;
    }
    #ec-copy-btn { border: 1px solid #6c757d; color: #6c757d; }
    #ec-copy-btn:hover { background: #6c757d; color: #fff; }
    #ec-aha-btn { border: 1px solid #dc3545; color: #dc3545; display: none; }
    #ec-aha-btn:hover { background: #dc3545; color: #fff; }
    #ec-aha-btn.visible { display: inline-flex; }
    #ec-aha-btn.loading-aha { opacity: .6; cursor: not-allowed; }

    #ec-notice {
      margin: 12px 20px; padding: 10px 14px;
      background: #cfe2ff; border: 1px solid #b6d4fe; border-radius: 6px;
      font-size: 12px; color: #084298; line-height: 1.5;
    }
  `);

  /* ── Wait for element ── */
  function waitFor(fn, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = fn();
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(new Error('Timeout'));
        setTimeout(check, 300);
      };
      check();
    });
  }

  /* ── Inject button ── */
  async function injectButton() {
    try {
      const printBtn = await waitFor(() => document.querySelector('.print-student-list-btn'));
      if (document.getElementById('ec-btn')) return;
      const btn = document.createElement('button');
      btn.id = 'ec-btn';
      btn.innerHTML = `
        <span class="ec-spinner"></span>
        <span class="ec-icon">
          <span class="material-symbols-outlined" style="font-size:16px;line-height:1;">badge</span>
        </span>
        Fetch eCards
      `;
      btn.title = 'Fetch eCard numbers for all enrolled students';
      printBtn.insertAdjacentElement('afterend', btn);
      btn.addEventListener('click', runScraper);
    } catch (e) { console.warn('[eCard] inject failed:', e); }
  }

  /* ── Collect students ── */
  function collectStudents() {
    const links = document.querySelectorAll('.student-name a[href*="student_number="]');
    const students = [];
    links.forEach(a => {
      const url = new URL(a.href);
      const num = url.searchParams.get('student_number');
      const name = a.textContent.trim();
      if (num && name) students.push({ name, number: num, href: a.href });
    });
    return students;
  }

  /* ── Build / reset panel ── */
  function buildPanel(students) {
    if (!document.getElementById('ec-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'ec-overlay';
      overlay.innerHTML = `
        <div id="ec-panel">
          <div id="ec-header">
            <h5>
              <span class="material-symbols-outlined">badge</span>
              eCard Numbers
              <span id="ec-count">—</span>
            </h5>
            <button id="ec-close" title="Close">✕</button>
          </div>
          <div id="ec-progress-wrap">
            <div id="ec-progress-label">Opening worker tab…</div>
            <div id="ec-progress-track"><div id="ec-progress-fill"></div></div>
          </div>
          <div id="ec-body">
            <div id="ec-notice">
              ℹ️ A background window will open briefly on otsystems.net to fetch notes — it closes automatically when done.
              If your browser blocks it, allow popups for this site.
            </div>
            <table id="ec-table">
              <thead>
                <tr>
                  <th style="width:36px">#</th>
                  <th>Student</th>
                  <th>eCard Number</th>
                  <th style="width:110px">Status</th>
                </tr>
              </thead>
              <tbody id="ec-tbody"></tbody>
            </table>
          </div>
          <div id="ec-footer">
            <span id="ec-footer-info">—</span>
            <div id="ec-footer-btns">
              <button id="ec-copy-btn" class="ec-footer-btn">
                <span class="material-symbols-outlined" style="font-size:13px">content_copy</span>
                Copy CSV
              </button>
              <button id="ec-aha-btn" class="ec-footer-btn">
                <span class="material-symbols-outlined" style="font-size:13px">verified</span>
                Submit to AHA
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.getElementById('ec-close').addEventListener('click', () => overlay.classList.remove('open'));
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
      document.getElementById('ec-copy-btn').addEventListener('click', copyCSV);
      document.getElementById('ec-aha-btn').addEventListener('click', submitToAHA);
    }

    // Reset
    document.getElementById('ec-tbody').innerHTML = '';
    document.getElementById('ec-count').textContent = `${students.length}`;
    document.getElementById('ec-footer-info').textContent = '—';
    document.getElementById('ec-progress-fill').style.width = '0%';
    document.getElementById('ec-progress-label').textContent = 'Opening worker tab…';
    document.getElementById('ec-progress-wrap').classList.add('visible');
    document.getElementById('ec-aha-btn').classList.remove('visible');
    document.getElementById('ec-notice').style.display = '';

    students.forEach((s, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="text-center" style="color:#6c757d">${i + 1}</td>
        <td>
          <a class="ec-name-link" href="${s.href}" target="_blank" rel="noopener noreferrer">${s.name}</a>
          <div class="ec-student-num">S#: ${s.number}</div>
        </td>
        <td class="mono" id="ec-ecard-${s.number}">—</td>
        <td id="ec-status-${s.number}"><span class="ec-badge pending"><span class="dot"></span>Pending</span></td>
      `;
      document.getElementById('ec-tbody').appendChild(tr);
    });

    document.getElementById('ec-overlay').classList.add('open');
  }

  function setRowResult(num, ecard) {
    const ecardEl = document.getElementById(`ec-ecard-${num}`);
    const statusEl = document.getElementById(`ec-status-${num}`);
    if (!ecardEl || !statusEl) return;
    ecardEl.textContent = ecard || '—';
    statusEl.innerHTML = ecard
      ? `<span class="ec-badge found"><span class="dot"></span>Found</span>`
      : `<span class="ec-badge not-found"><span class="dot"></span>Not found</span>`;
  }

  /* ── Copy CSV ── */
  function copyCSV() {
    const rows = [['#', 'Name', 'eCard Number']];
    document.querySelectorAll('#ec-tbody tr').forEach(tr => {
      const cells = tr.querySelectorAll('td');
      rows.push([
        cells[0].textContent.trim(),
        cells[1].querySelector('.ec-name-link').textContent.trim(),
        cells[2].textContent.trim(),
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    navigator.clipboard.writeText(csv).then(() => {
      const btn = document.getElementById('ec-copy-btn');
      btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px">check</span> Copied!`;
      setTimeout(() => {
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px">content_copy</span> Copy CSV`;
      }, 2000);
    });
  }

  /* ── Submit to AHA ── */
  async function submitToAHA() {
    const ahaBtn = document.getElementById('ec-aha-btn');
    if (ahaBtn.classList.contains('loading-aha')) return;

    // Collect found ecard numbers from the table
    const ecards = [];
    document.querySelectorAll('#ec-tbody tr').forEach(tr => {
      const ecardCell = tr.querySelector('td.mono');
      const val = ecardCell ? ecardCell.textContent.trim() : '';
      if (val && val !== '—') ecards.push(val);
    });

    if (!ecards.length) {
      alert('No eCard numbers found to submit.');
      return;
    }

    ahaBtn.classList.add('loading-aha');
    ahaBtn.innerHTML = `<span class="ec-spinner" style="display:inline-block"></span> Opening AHA…`;

    // Write the AHA job to GM storage
    await GM_setValue('ec_aha_job', JSON.stringify({ status: 'pending', ecards }));

    // Open AHA page — the script will pick up the job there
    const ahaTab = window.open(
      'https://ecards.heart.org/student/myecards',
      'ec_aha_worker',
      'width=900,height=700,top=50,left=50'
    );

    if (!ahaTab) {
      alert('Popup blocked — please allow popups for this site and try again.');
      ahaBtn.classList.remove('loading-aha');
      ahaBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px">verified</span> Submit to AHA`;
      return;
    }

    // Poll for completion
    const poll = setInterval(async () => {
      try {
        const raw = await GM_getValue('ec_aha_job', null);
        if (!raw) return;
        const job = JSON.parse(raw);
        if (job.status === 'done' || job.status === 'error') {
          clearInterval(poll);
          await GM_deleteValue('ec_aha_job');
          ahaBtn.classList.remove('loading-aha');
          ahaBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px">verified</span> Submit to AHA`;
          if (job.status === 'error') {
            alert(`AHA submission error: ${job.error}`);
          }
        }
      } catch (e) { /* keep polling */ }
    }, 800);

    // Safety timeout 2 min
    setTimeout(() => {
      clearInterval(poll);
      ahaBtn.classList.remove('loading-aha');
      ahaBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:13px">verified</span> Submit to AHA`;
    }, 120000);
  }

  /* ── Main scraper ── */
  async function runScraper() {
    const btn = document.getElementById('ec-btn');
    btn.disabled = true;
    btn.classList.add('loading');

    const students = collectStudents();
    if (!students.length) {
      alert('No students found. Make sure the student list has loaded.');
      btn.disabled = false;
      btn.classList.remove('loading');
      return;
    }

    buildPanel(students);

    const job = { status: 'pending', students, results: {}, progress: 0 };
    await GM_setValue('ec_job', JSON.stringify(job));

    const workerTab = window.open(
      'https://otsystems.net/admin/students/dashboard/',
      'ec_worker',
      'width=1,height=1,top=0,left=0,toolbar=no,menubar=no,scrollbars=no,status=no,location=no'
    );

    if (!workerTab) {
      document.getElementById('ec-progress-label').textContent =
        '⚠️ Popup blocked — please allow popups for this site and try again.';
      btn.disabled = false;
      btn.classList.remove('loading');
      return;
    }

    const progressFill  = document.getElementById('ec-progress-fill');
    const progressLabel = document.getElementById('ec-progress-label');
    const total = students.length;
    let lastProgress = 0;

    const poll = setInterval(async () => {
      try {
        const raw = await GM_getValue('ec_job', null);
        if (!raw) return;
        const current = JSON.parse(raw);

        if (current.progress > lastProgress) {
          for (let i = lastProgress; i < current.progress; i++) {
            const s = students[i];
            setRowResult(s.number, current.results[s.number]);
          }
          lastProgress = current.progress;
          progressFill.style.width = `${Math.round((current.progress / total) * 100)}%`;
          const s = students[current.progress - 1];
          progressLabel.textContent = `Fetched ${current.progress} of ${total}: ${s ? s.name : ''}`;
        }

        if (current.status === 'done') {
          clearInterval(poll);
          students.forEach(s => setRowResult(s.number, current.results[s.number]));
          const found = Object.values(current.results).filter(Boolean).length;
          progressFill.style.width = '100%';
          progressLabel.textContent = `Done — ${found} of ${total} eCards found`;
          document.getElementById('ec-footer-info').textContent = `${found} of ${total} eCards found`;
          document.getElementById('ec-notice').style.display = 'none';

          // Show AHA button only if at least one eCard was found
          if (found > 0) {
            document.getElementById('ec-aha-btn').classList.add('visible');
          }

          await GM_deleteValue('ec_job');
          btn.disabled = false;
          btn.classList.remove('loading');
        }
      } catch (e) { /* keep polling */ }
    }, 500);

    setTimeout(() => {
      clearInterval(poll);
      btn.disabled = false;
      btn.classList.remove('loading');
    }, 180000);
  }

  /* ── Boot ── */
  injectButton();

  const observer = new MutationObserver(() => {
    if (!document.getElementById('ec-btn') && document.querySelector('.print-student-list-btn')) {
      injectButton();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();