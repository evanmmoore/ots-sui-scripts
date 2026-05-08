// ==UserScript==
// @name         Safety Unlimited - Batch Certificate Downloader
// @namespace    https://www.safetyunlimited.com/
// @version      6.0
// @description  Open modal → download PDF to Downloads folder → close → next student
// @author       You
// @match        https://www.safetyunlimited.com/corporate2/reports/class_activity.asp*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      www.safetyunlimited.com
// ==/UserScript==

(function () {
  'use strict';

  // ── UI ────────────────────────────────────────────────────────────────────

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position:'fixed', bottom:'20px', right:'20px', zIndex:'99999',
    display:'flex', flexDirection:'column', alignItems:'flex-end',
    gap:'8px', fontFamily:'system-ui, sans-serif',
  });
  document.body.appendChild(panel);

  const statusBox = document.createElement('div');
  Object.assign(statusBox.style, {
    background:'rgba(15,23,42,0.92)', color:'#e2e8f0', borderRadius:'8px',
    padding:'10px 14px', fontSize:'12px', lineHeight:'1.6',
    maxWidth:'360px', display:'none', whiteSpace:'pre-wrap',
    boxShadow:'0 4px 20px rgba(0,0,0,0.4)',
  });
  panel.appendChild(statusBox);

  const progressWrap = document.createElement('div');
  Object.assign(progressWrap.style, {
    width:'360px', height:'6px', background:'rgba(100,100,100,0.3)',
    borderRadius:'999px', overflow:'hidden', display:'none',
  });
  const progressBar = document.createElement('div');
  Object.assign(progressBar.style, {
    height:'100%', width:'0%', background:'#3b82f6',
    borderRadius:'999px', transition:'width 0.3s ease',
  });
  progressWrap.appendChild(progressBar);
  panel.appendChild(progressWrap);

  const btn = document.createElement('button');
  btn.textContent = '⬇ Download All Certificates';
  Object.assign(btn.style, {
    padding:'11px 18px', background:'#1d4ed8', color:'#fff',
    border:'none', borderRadius:'8px', fontSize:'13px',
    fontWeight:'600', cursor:'pointer',
    boxShadow:'0 4px 16px rgba(0,0,0,0.3)', transition:'background 0.2s',
  });
  btn.addEventListener('mouseover', () => !btn.disabled && (btn.style.background = '#1e40af'));
  btn.addEventListener('mouseout',  () => !btn.disabled && (btn.style.background = '#1d4ed8'));
  panel.appendChild(btn);

  function setStatus(msg, persist = false) {
    statusBox.textContent   = msg;
    statusBox.style.display = 'block';
    if (!persist) setTimeout(() => { statusBox.style.display = 'none'; }, 5000);
  }

  function setProgress(done, total) {
    progressWrap.style.display = 'block';
    progressBar.style.width    = `${Math.round((done / total) * 100)}%`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function waitForVisible(selector, maxMs = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const id = setInterval(() => {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) { clearInterval(id); resolve(el); }
        else if (Date.now() - start > maxMs) { clearInterval(id); reject(new Error(`Timeout: ${selector}`)); }
      }, 150);
    });
  }

  function waitForGone(selector, maxMs = 6000) {
    return new Promise(resolve => {
      const start = Date.now();
      const id = setInterval(() => {
        const el = document.querySelector(selector);
        if (!el || el.offsetParent === null) { clearInterval(id); resolve(); }
        else if (Date.now() - start > maxMs)  { clearInterval(id); resolve(); }
      }, 150);
    });
  }

  function safe(str) {
    return str.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_');
  }

  // Download a URL as a blob, then save via an <a> click so the browser
  // treats it as a file download (works without GM_download permission issues)
  function downloadFile(url, filename) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        onload: r => {
          if (r.status < 200 || r.status >= 300) {
            reject(new Error(`HTTP ${r.status}`));
            return;
          }
          const objUrl = URL.createObjectURL(r.response);
          const a = document.createElement('a');
          a.href = objUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
          resolve();
        },
        onerror: e => reject(new Error(String(e))),
      });
    });
  }

  // ── Parse student rows ────────────────────────────────────────────────────

  function parseRows() {
    const rows = Array.from(document.querySelectorAll('tr[ng-repeat*="enrollment"]'));
    const students = [];

    for (const row of rows) {
      const nameCells = Array.from(
        row.querySelectorAll('span[ng-if*="First_Name"], span[ng-if*="Last_Name"]')
      ).map(el => el.textContent.trim()).filter(Boolean);

      const firstName = nameCells[0] || '';
      const lastName  = nameCells[1] || '';

      const detailsLink = row.querySelector(
        "span[ng-if*=\"col.field == 'Details'\"] span[ng-if*=\"DetailsHaslink == true\"] a"
      );
      if (!detailsLink) continue;

      const certMatch = detailsLink.textContent.trim().match(/^Certificate:\s*(\d+)/i);
      if (!certMatch) continue; // e.g. "S: 0/19 -- T: 0/2" — skip

      const certNum  = certMatch[1];
      const filename = `${safe(firstName)}_${safe(lastName)}_${certNum}.pdf`;
      students.push({ firstName, lastName, certNum, filename, detailsLink });
    }

    return students;
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  async function run() {
    btn.disabled = true;
    btn.style.background = '#6b7280';
    btn.textContent = '⏳ Working…';
    progressBar.style.background = '#3b82f6';

    try {
      const students = parseRows();
      const totalRows = document.querySelectorAll('tr[ng-repeat*="enrollment"]').length;
      const skipped   = totalRows - students.length;

      if (students.length === 0) {
        setStatus('❌ No completed certificates found.\nMake sure the report is fully loaded.');
        btn.disabled = false;
        btn.style.background = '#1d4ed8';
        btn.textContent = '⬇ Download All Certificates';
        return;
      }

      setStatus(
        `Found ${students.length} certificates${skipped ? ` · ${skipped} skipped` : ''}.\nStarting downloads…`,
        true
      );

      const errors = [];

      for (let i = 0; i < students.length; i++) {
        const { firstName, lastName, certNum, filename, detailsLink } = students[i];

        setStatus(
          `[${i + 1}/${students.length}] ${firstName} ${lastName}\nCert ${certNum} — opening modal…`,
          true
        );
        setProgress(i, students.length);

        // 1. Open modal
        detailsLink.click();
        await sleep(400);

        let pdfUrl = null;
        try {
          const anchor = await waitForVisible('a[href*="/cdn/projects/certificate/print.asp"]', 10000);
          const href   = anchor.getAttribute('href');
          pdfUrl = href.startsWith('http') ? href : `https://www.safetyunlimited.com${href}`;
        } catch (e) {
          errors.push(`${firstName} ${lastName} (${certNum}): modal did not open — ${e.message}`);
          const closeBtn = document.querySelector('button[ng-click="dmc.Ok()"]');
          if (closeBtn) closeBtn.click();
          await waitForGone('button[ng-click="dmc.Ok()"]', 4000);
          await sleep(300);
          continue;
        }

        // 2. Download PDF directly to Downloads folder
        setStatus(
          `[${i + 1}/${students.length}] ${firstName} ${lastName}\nDownloading ${filename}…`,
          true
        );
        try {
          await downloadFile(pdfUrl, filename);
        } catch (e) {
          errors.push(`${firstName} ${lastName} (${certNum}): download failed — ${e.message}`);
        }

        // 3. Close modal
        const closeBtn = document.querySelector('button[ng-click="dmc.Ok()"]');
        if (closeBtn) closeBtn.click();
        await waitForGone('button[ng-click="dmc.Ok()"]', 5000);

        // Small pause between students so browser isn't flooded with downloads
        await sleep(500);
      }

      // Done
      progressBar.style.width      = '100%';
      progressBar.style.background = errors.length ? '#f59e0b' : '#22c55e';

      const summary = [
        errors.length
          ? `✅ ${students.length - errors.length}/${students.length} downloaded`
          : `✅ All ${students.length} certificates downloaded!`,
        `📁 Saved to your Downloads folder`,
        skipped > 0 ? `⏭ ${skipped} skipped (no cert yet)` : '',
        errors.length ? `⚠ ${errors.length} error(s) — see console` : '',
      ].filter(Boolean).join('\n');

      setStatus(summary, true);
      if (errors.length) console.warn('[CertDownloader] Errors:\n', errors.join('\n'));

    } catch (e) {
      setStatus(`❌ ${e.message}`, true);
      progressBar.style.background = '#ef4444';
      console.error('[CertDownloader]', e);
    }

    btn.disabled = false;
    btn.style.background = '#1d4ed8';
    btn.textContent = '⬇ Download All Certificates';
  }

  btn.addEventListener('click', run);

})();