// ==UserScript==
// @name         Bulk Student Termination
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Add a Bulk Termination button to disassociate multiple students at once
// @author       You
// @match        https://otsystems.net/admin/corporate/manage_students.asp*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ─── Inject button to the right of the IAAI Workflow button ───────────────
  function injectButton() {
    // Anchor after #iaai-launcher-btn if the IAAI Workflow script is installed,
    // otherwise fall back to the first .btn-success on the page.
    const anchor = document.getElementById('iaai-launcher-btn')
                || document.querySelector('button.btn.btn-success');
    if (!anchor || document.getElementById('bulk-termination-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'bulk-termination-btn';
    btn.type = 'button';
    btn.className = 'btn btn-danger';
    btn.style.marginLeft = '10px';
    btn.textContent = 'Bulk Termination';
    btn.addEventListener('click', openModal);
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  // ─── Build and inject modal styles ─────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #bt-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.55);
      z-index: 99999; display: flex; align-items: center; justify-content: center;
    }
    #bt-modal {
      background: #fff; border-radius: 8px; padding: 24px 28px;
      width: 420px; max-width: 95vw; box-shadow: 0 8px 32px rgba(0,0,0,.25);
      font-family: Arial, sans-serif; font-size: 14px; color: #333;
    }
    #bt-modal h2 { margin: 0 0 6px; font-size: 18px; }
    #bt-modal p.bt-hint { margin: 0 0 12px; color: #666; font-size: 13px; }
    #bt-textarea {
      width: 100%; box-sizing: border-box; height: 120px;
      border: 1px solid #ccc; border-radius: 4px;
      padding: 8px; font-size: 13px; resize: vertical;
    }
    #bt-preview {
      margin-top: 12px; font-size: 13px; min-height: 24px;
    }
    #bt-preview .bt-found { color: #217a3c; font-weight: bold; }
    #bt-preview .bt-missing { color: #c0392b; }
    #bt-progress-wrap {
      margin-top: 14px; display: none;
    }
    #bt-progress-bar-outer {
      background: #e0e0e0; border-radius: 6px; height: 18px; overflow: hidden;
    }
    #bt-progress-bar {
      background: #217a3c; height: 100%; width: 0%;
      transition: width .3s ease; border-radius: 6px;
    }
    #bt-progress-label {
      margin-top: 6px; font-size: 12px; color: #555; text-align: center;
    }
    #bt-status {
      margin-top: 10px; font-size: 13px; min-height: 20px; color: #555;
    }
    .bt-actions {
      margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end;
    }
    .bt-btn {
      padding: 7px 18px; border: none; border-radius: 4px;
      cursor: pointer; font-size: 14px; font-weight: bold;
    }
    .bt-btn-cancel { background: #aaa; color: #fff; }
    .bt-btn-cancel:hover { background: #888; }
    .bt-btn-submit { background: #c0392b; color: #fff; }
    .bt-btn-submit:hover { background: #a93226; }
    .bt-btn-submit:disabled { background: #e0a09a; cursor: not-allowed; }
    .bt-tag-found { display:inline-block; background:#d4edda; color:#155724;
      border-radius:4px; padding:1px 7px; margin:2px; font-size:12px; }
    .bt-tag-missing { display:inline-block; background:#f8d7da; color:#721c24;
      border-radius:4px; padding:1px 7px; margin:2px; font-size:12px; }
  `;
  document.head.appendChild(style);

  // ─── Parse student numbers from the table ──────────────────────────────────
  function getStudentsOnPage() {
    const map = {};
    const links = document.querySelectorAll('a[href*="action=delete_student"]');
    links.forEach(link => {
      const match = link.href.match(/sn=(\d+)/);
      if (match) map[match[1]] = link;
    });
    return map;
  }

  // ─── Open modal ────────────────────────────────────────────────────────────
  function openModal() {
    if (document.getElementById('bt-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'bt-overlay';

    overlay.innerHTML = `
      <div id="bt-modal" role="dialog" aria-modal="true" aria-label="Bulk Termination">
        <h2>⚠ Bulk Termination</h2>
        <p class="bt-hint">Enter one student number per line (or comma-separated). The script will verify each number exists on this page before disassociating.</p>
        <textarea id="bt-textarea" placeholder="e.g.&#10;589299&#10;123456&#10;789012"></textarea>
        <div id="bt-preview"></div>
        <div id="bt-progress-wrap">
          <div id="bt-progress-bar-outer"><div id="bt-progress-bar"></div></div>
          <div id="bt-progress-label"></div>
        </div>
        <div id="bt-status"></div>
        <div class="bt-actions">
          <button class="bt-btn bt-btn-cancel" id="bt-cancel-btn">Cancel</button>
          <button class="bt-btn bt-btn-submit" id="bt-submit-btn" disabled>Disassociate</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea  = document.getElementById('bt-textarea');
    const preview   = document.getElementById('bt-preview');
    const submitBtn = document.getElementById('bt-submit-btn');
    const cancelBtn = document.getElementById('bt-cancel-btn');

    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
    cancelBtn.addEventListener('click', closeModal);
    textarea.addEventListener('input', () => updatePreview(textarea, preview, submitBtn));
    submitBtn.addEventListener('click', () => runTermination(textarea, submitBtn, cancelBtn));
    textarea.focus();
  }

  function closeModal() {
    const overlay = document.getElementById('bt-overlay');
    if (overlay) overlay.remove();
  }

  // ─── Parse input ───────────────────────────────────────────────────────────
  function parseInput(raw) {
    return raw
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(s => /^\d+$/.test(s));
  }

  // ─── Live preview ──────────────────────────────────────────────────────────
  function updatePreview(textarea, preview, submitBtn) {
    const nums = parseInput(textarea.value);
    if (!nums.length) {
      preview.innerHTML = '';
      submitBtn.disabled = true;
      return;
    }

    const pageStudents = getStudentsOnPage();
    const found   = nums.filter(n =>  pageStudents[n]);
    const missing = nums.filter(n => !pageStudents[n]);

    let html = '';
    if (found.length) {
      html += `<div><span class="bt-found">✔ Found (${found.length}):</span> `;
      html += found.map(n => `<span class="bt-tag-found">${n}</span>`).join('');
      html += `</div>`;
    }
    if (missing.length) {
      html += `<div style="margin-top:6px"><span class="bt-missing">✘ Not on page (${missing.length}):</span> `;
      html += missing.map(n => `<span class="bt-tag-missing">${n}</span>`).join('');
      html += `</div>`;
    }

    preview.innerHTML = html;
    submitBtn.disabled = found.length === 0;
  }

  // ─── Main termination loop ─────────────────────────────────────────────────
  async function runTermination(textarea, submitBtn, cancelBtn) {
    const nums = parseInput(textarea.value);
    const pageStudents = getStudentsOnPage();
    const toProcess = nums.filter(n => pageStudents[n]);

    if (!toProcess.length) return;

    const confirmed = window.confirm(
      `You are about to disassociate ${toProcess.length} student(s):\n\n` +
      toProcess.join(', ') +
      `\n\nThis cannot be undone. Proceed?`
    );
    if (!confirmed) return;

    submitBtn.disabled = true;
    textarea.disabled  = true;
    cancelBtn.disabled = true;

    const progressWrap  = document.getElementById('bt-progress-wrap');
    const progressBar   = document.getElementById('bt-progress-bar');
    const progressLabel = document.getElementById('bt-progress-label');
    const statusEl      = document.getElementById('bt-status');
    progressWrap.style.display = 'block';

    let successCount = 0;
    let failCount    = 0;

    for (let i = 0; i < toProcess.length; i++) {
      const sn  = toProcess[i];
      const pct = Math.round((i / toProcess.length) * 100);
      progressBar.style.width    = pct + '%';
      progressLabel.textContent  = `Processing ${i + 1} of ${toProcess.length} — student #${sn}`;
      statusEl.textContent       = `Disassociating student #${sn}…`;

      try {
        const freshStudents = getStudentsOnPage();
        const link = freshStudents[sn];

        if (!link) {
          statusEl.textContent = `Student #${sn} no longer found on page — skipping.`;
          failCount++;
          await sleep(400);
          continue;
        }

        const origConfirm = window.confirm;
        window.confirm = () => true;
        const href = link.getAttribute('href');
        window.confirm = origConfirm;

        if (!href) { failCount++; continue; }

        const url  = new URL(href, window.location.href).href;
        const resp = await fetch(url, { credentials: 'same-origin' });

        if (resp.ok) {
          successCount++;
          statusEl.textContent = `✔ Student #${sn} disassociated.`;
        } else {
          failCount++;
          statusEl.textContent = `✘ Failed for student #${sn} (HTTP ${resp.status}).`;
        }
      } catch (err) {
        failCount++;
        statusEl.textContent = `✘ Error for student #${sn}: ${err.message}`;
      }

      await sleep(600);
    }

    progressBar.style.width   = '100%';
    progressLabel.textContent = `Complete — ${successCount} disassociated, ${failCount} failed.`;
    statusEl.innerHTML = `<strong style="color:#217a3c">Done!</strong> ${successCount} student(s) removed. ${failCount > 0 ? `<span style="color:#c0392b">${failCount} failed.</span>` : ''} <em>Reload the page to see updated results.</em>`;

    cancelBtn.disabled    = false;
    cancelBtn.textContent = 'Close';

    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'bt-btn bt-btn-submit';
    reloadBtn.style.background = '#217a3c';
    reloadBtn.textContent = 'Reload Page';
    reloadBtn.addEventListener('click', () => window.location.reload());
    document.querySelector('.bt-actions').appendChild(reloadBtn);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  injectButton();

  const observer = new MutationObserver(() => injectButton());
  observer.observe(document.body, { childList: true, subtree: true });

})();