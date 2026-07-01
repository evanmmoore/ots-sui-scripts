// ==UserScript==
// @name         OTS → QB Invoice Filler
// @namespace    https://otsystems.net/
// @version      1.6.0
// @description  Captures the Daily Transactions report (SUI/Affiliate tabs) AND the Corporate Invoice page (incl. Billing ID → Invoice no.), verifies the QBO customer matches, then auto-fills QuickBooks Online invoice lines with the correct SKU variant, qty, rate, and description.
// @match        https://otsystems.net/admin/reports/dailytransactions/*
// @match        https://otsystems.net/admin/reports/dailyTransactions/
// @match        https://otsystems.net/admin/reports/corporateinvoice/generate.asp*
// @match        https://otsystems.net/admin/reports/CorporateInvoice/generate.asp*
// @match        https://*.qbo.intuit.com/app/invoice*
// @match        https://qbo.intuit.com/app/invoice*
// @match        https://qbo.intuit.com/app/invoice?nameId=*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════
   *  CONFIG — edit these to tune behavior without touching the logic
   * ════════════════════════════════════════════════════════════════════ */

  const STORE_KEY = 'ots2qbo_payload';

  // Map report tab id → SKU suffix for Corporate / Non-Corporate columns.
  // NOTE: CONFIRM THESE — currently assumes Affiliate = OTS, SUI = SUI.
  const SUFFIX_MAP = {
    Affiliatetab: { corporate: '-OTSC', nonCorporate: '-OTS'  },
    SUItab:       { corporate: '-SUIC', nonCorporate: '-SUI'  },
  };
  // Fallback if the active tab isn't in the map above:
  const DEFAULT_SUFFIX = { corporate: '-SUIC', nonCorporate: '-SUI' };

  // Corporate Invoice page (generate.asp): every line is a corporate SUI item,
  // so its SKU is always the item number + this fixed suffix. Change here if
  // that ever varies.
  const CORP_INVOICE_SUFFIX = '-SUIC';

  // Per-SKU overrides for items whose QBO SKU doesn't follow the standard
  // suffix pattern. Key = SKU the capture generates, value = actual QBO SKU.
  // Example: '0152-0894-SUI': '0152-0894-SUI-CR',
  const SKU_OVERRIDES = {
  };

  // QBO selectors (centralized so they're easy to fix if Intuit changes the DOM)
  const QBO = {
    productInput : 'input[aria-label^="Product or service line"]',
    menu         : 'ul[id$="-idsMenu"]',
    menuItem     : 'li[role="option"]',
    menuItemSku  : '.sku [title], .sku',
    // Qty / Rate guesses — several fallbacks tried in order:
    qtyInput     : ['input[aria-label^="Quantity line"]', 'input[aria-label^="Qty line"]', 'input[data-testid*="quantity" i]'],
    rateInput    : ['input[aria-label^="Rate line"]', 'input[aria-label^="Price line"]', 'input[data-testid*="rate" i]'],
    // Multi-line description cell. aria-label carries the same "line N" number
    // as the Product/Service field, so findRowFieldForLine can pair them.
    descInput    : ['textarea[aria-label^="Description line"]', 'textarea[data-testid="Description_field"]'],
    // Invoice no. header field — receives the OTS Billing ID.
    invoiceNoInput : ['input[data-automation-id="reference_number"]', '#sales-forms-ui\\/reference_number', 'input[aria-label="Invoice number"]'],
    // Customer name + Bill-to address — used only to VERIFY we're on the right
    // customer's invoice (never written to).
    customerInput  : ['input[aria-label="Customer"]', 'input[placeholder="Add customer"]'],
    billToInput    : ['textarea[aria-label="billToTextAreaLabel"]', 'textarea[aria-label*="billTo" i]'],
    addLinesBtn  : ['button[data-testid*="add-lines" i]', 'button'],
    typeDelay    : 40,    // ms between simulated input steps
    menuTimeout  : 5000,  // ms to wait for the typeahead dropdown
    betweenLines : 120,   // ms pause between invoice lines (row-ready is detected adaptively)
  };

  const PANEL_BLUE = '#1a3a5c';

  /* ════════════════════════════════════════════════════════════════════
   *  TOUR STEPS  (selector = element to spotlight, text = bubble copy)
   *  These are placeholder defaults — replace with your own steps.
   * ════════════════════════════════════════════════════════════════════ */

  const TOUR_STEPS_REPORT = [
    { selector: '#ots2qbo-panel',        text: 'This panel reads the Daily Transactions table on whichever tab is currently active.' },
    { selector: '#ots2qbo-tabname',      text: 'The detected tab (SUI or Affiliate) controls which SKU variant gets selected in QuickBooks (-SUI/-SUIC vs -OTS/-OTSC).' },
    { selector: '#ots2qbo-refunds',      text: 'Check this to also carry refunded amounts over as negative invoice lines.' },
    { selector: '#ots2qbo-capture',      text: 'Click Capture to scan the table. The line items are saved and will be waiting for you on the QB invoice page.' },
    { selector: '#ots2qbo-status',       text: 'A summary of what was captured shows here. Then open the QB invoice and press Fill.' },
  ];

  const TOUR_STEPS_QBO = [
    { selector: '#ots2qbo-panel',        text: 'This panel holds the line items captured from the Daily Transactions report.' },
    { selector: '#ots2qbo-preview',      text: 'Review the SKUs, quantities, and rates before filling. Each row becomes one invoice line.' },
    { selector: '#ots2qbo-fill',         text: 'Click Fill Invoice. The script types each SKU into the Product/Service field, picks the exact match from the dropdown, then sets Qty and Rate.' },
    { selector: '#ots2qbo-status',       text: 'Progress and any lines that could not be matched are reported here. Always eyeball the invoice before saving!' },
  ];

  /* ════════════════════════════════════════════════════════════════════
   *  SHARED HELPERS
   * ════════════════════════════════════════════════════════════════════ */

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function waitFor(fn, timeout = 5000, interval = 50) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        let res = null;
        try { res = fn(); } catch (e) { /* ignore */ }
        if (res) return resolve(res);
        if (Date.now() - t0 > timeout) return reject(new Error('waitFor timeout'));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  // Set value on a React-controlled input so the framework actually sees it
  function setNativeValue(input, value) {
    try {
      const proto = Object.getPrototypeOf(input);
      const setter =
        Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, value);
      else input.value = value;
    } catch (e) {
      input.value = value; // sandbox fallback
    }
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Types text one character at a time with real keyboard events. QBO's
  // newer combobox ignores a single programmatic value swap (the menu never
  // populates), but responds to per-character keydown/input/keyup sequences
  // — i.e., typing the way a person does.
  async function typeForReal(input, text) {
    input.focus();
    try { input.setSelectionRange(0, (input.value || '').length); } catch (_) {}
    setNativeValue(input, '');
    await sleep(60);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    let v = '';
    for (const ch of text) {
      v += ch;
      const kOpts = { key: ch, bubbles: true, cancelable: true };
      try { input.dispatchEvent(new KeyboardEvent('keydown', kOpts)); } catch (_) {}
      try { input.dispatchEvent(new KeyboardEvent('keypress', kOpts)); } catch (_) {}
      try { input.dispatchEvent(new InputEvent('beforeinput', { data: ch, inputType: 'insertText', bubbles: true, cancelable: true })); } catch (_) {}
      try { if (setter) setter.call(input, v); else input.value = v; } catch (_) { input.value = v; }
      try { input.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true })); }
      catch (_) { input.dispatchEvent(new Event('input', { bubbles: true })); }
      try { input.dispatchEvent(new KeyboardEvent('keyup', kOpts)); } catch (_) {}
      await sleep(35);
    }
  }

  function fireClick(el) {
    // NOTE: never pass `view: window` here — in Tampermonkey's sandbox `window`
    // is a proxy and the MouseEvent/PointerEvent constructor throws a TypeError.
    const opts = { bubbles: true, cancelable: true };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
      try {
        const Ev = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
        el.dispatchEvent(new Ev(type, opts));
      } catch (e) {
        try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (_) { /* last resort below */ }
      }
    });
    if (typeof el.click === 'function') { try { el.click(); } catch (_) {} }
  }

  const parseMoney = (s) => {
    const m = String(s).replace(/,/g, '').match(/-?\$?\s*(-?\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  };

  const fmt = (n) => '$' + Math.abs(n).toFixed(2);

  // Corporate / Non-Corporate + channel (SUI vs OTS), shown wherever you may
  // need to search or hand-enter a line. Prefers the variant recorded at
  // capture; falls back to decoding the SKU suffix for older captures.
  function variantOf(line) {
    const sku = (line.sku || '').toUpperCase();
    const channel = sku.includes('-OTS') ? 'OTS' : (sku.includes('-SUI') ? 'SUI' : '');
    let label = line.variant || '';
    if (!label) {
      if (/-(OTSC|SUIC)(\b|-|$)/.test(sku)) label = 'Corporate';
      else if (/-(OTS|SUI)(\b|-|$)/.test(sku)) label = 'Non-Corporate';
    }
    const refund = line.amount < 0 || /\(refund\)/i.test(line.courseName || '');
    return { label, channel, refund };
  }

  function variantBadge(line) {
    const v = variantOf(line);
    if (!v.label && !v.channel) return '';
    const cls = v.label === 'Corporate' ? 'ots2qbo-badge-corp' : 'ots2qbo-badge-nc';
    const text = [v.label ? v.label.toUpperCase() : null, v.channel || null].filter(Boolean).join(' · ');
    return `<span class="ots2qbo-badge ${cls}">${text}</span>` +
           (v.refund ? '<span class="ots2qbo-badge ots2qbo-badge-refund">REFUND</span>' : '');
  }

  function variantText(line) {
    const v = variantOf(line);
    return [v.label, v.channel].filter(Boolean).join(' ');
  }

  function copyText(t) {
    const legacy = () => {
      const ta = document.createElement('textarea');
      ta.value = t;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) { /* ignore */ }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(legacy);
    } else {
      legacy();
    }
    setStatus(`Copied ${t} — click the Product/Service field and paste.`);
  }

  /* ════════════════════════════════════════════════════════════════════
   *  PANEL UI  (shared shell, per-page body)
   * ════════════════════════════════════════════════════════════════════ */

  function injectStyles() {
    const css = `
      #ots2qbo-panel {
        position: fixed; top: 90px; right: 18px; z-index: 999999;
        width: 320px; background: ${PANEL_BLUE}; color: #fff;
        border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.45);
        font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px;
      }
      #ots2qbo-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 12px; cursor: move; user-select: none;
        border-bottom: 1px solid rgba(255,255,255,.18);
        font-weight: 600; font-size: 14px;
      }
      #ots2qbo-header .ots2qbo-spacer { flex: 1; }
      .ots2qbo-iconbtn {
        width: 24px; height: 24px; border-radius: 50%;
        border: 1px solid rgba(255,255,255,.45); background: transparent;
        color: #fff; cursor: pointer; font-size: 13px; line-height: 1;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .ots2qbo-iconbtn:hover { background: rgba(255,255,255,.18); }
      #ots2qbo-body { padding: 12px; }
      .ots2qbo-btn {
        width: 100%; padding: 9px 10px; margin-top: 8px;
        border: none; border-radius: 6px; cursor: pointer;
        background: #2e6da4; color: #fff; font-weight: 600; font-size: 13px;
      }
      .ots2qbo-btn:hover { background: #3a82c4; }
      .ots2qbo-btn:disabled { background: #44607e; cursor: not-allowed; }
      #ots2qbo-status {
        margin-top: 10px; padding: 8px; border-radius: 6px;
        background: rgba(255,255,255,.10); min-height: 18px;
        white-space: pre-wrap; line-height: 1.45;
      }
      #ots2qbo-preview {
        max-height: 220px; overflow-y: auto; margin-top: 8px;
        background: rgba(255,255,255,.08); border-radius: 6px; padding: 6px 8px;
      }
      .ots2qbo-line { padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,.15); }
      .ots2qbo-line:last-child { border-bottom: none; }
      .ots2qbo-line small { opacity: .75; }
      .ots2qbo-neg { color: #ff9e9e; }
      .ots2qbo-badge {
        display: inline-block; padding: 1px 7px; margin: 0 4px 2px 0;
        border-radius: 9px; font-size: 10px; font-weight: 700; letter-spacing: .4px;
        vertical-align: middle;
      }
      .ots2qbo-badge-corp   { background: #d9a430; color: #1a1a05; }
      .ots2qbo-badge-nc     { background: #6fc0e8; color: #06222e; }
      .ots2qbo-badge-refund { background: #d96a6a; color: #2b0707; }
      #ots2qbo-panel label { display: flex; gap: 6px; align-items: center; margin-top: 6px; cursor: pointer; }
      #ots2qbo-panel.ots2qbo-collapsed { width: 220px; opacity: .92; }
      #ots2qbo-panel.ots2qbo-collapsed #ots2qbo-header { border-bottom: none; padding: 8px 10px; font-size: 13px; }
      /* ── Manual match popup ── */
      #ots2qbo-pick {
        background: rgba(255,255,255,.10); border: 1px solid #5fa8e8;
        border-radius: 8px; padding: 10px; margin-bottom: 8px;
      }
      .ots2qbo-pick-head { font-weight: 600; margin-bottom: 4px; }
      .ots2qbo-pick-sub  { font-size: 11px; opacity: .85; margin-bottom: 6px; line-height: 1.4; }
      #ots2qbo-pick-list { max-height: 200px; overflow-y: auto; }
      .ots2qbo-pickrow {
        padding: 6px; border-radius: 5px; cursor: pointer;
        border-bottom: 1px dashed rgba(255,255,255,.15);
      }
      .ots2qbo-pickrow:hover { background: rgba(95,168,232,.3); }
      .ots2qbo-pickrow small { opacity: .8; }
      .ots2qbo-pick-actions { margin-top: 8px; }
      .ots2qbo-pick-actions button {
        width: 100%; padding: 6px; border: 1px solid rgba(255,255,255,.4);
        background: transparent; color: #fff; border-radius: 5px; cursor: pointer; font-size: 12px;
      }
      .ots2qbo-pick-actions button:hover { background: rgba(255,255,255,.15); }
      .ots2qbo-hot { outline: 3px solid #5fa8e8 !important; outline-offset: 1px; }
      /* ── Missed lines list ── */
      #ots2qbo-missed { margin-top: 8px; }
      .ots2qbo-missed-head { font-weight: 600; margin: 2px 0 6px; color: #ffd28a; }
      .ots2qbo-missrow {
        background: rgba(180,40,40,.28); border-radius: 6px;
        padding: 6px 8px; margin-bottom: 6px; line-height: 1.45;
      }
      .ots2qbo-missrow small { opacity: .85; }
      .ots2qbo-copy {
        float: right; margin-left: 6px; padding: 2px 8px; font-size: 11px;
        border: 1px solid rgba(255,255,255,.45); background: transparent;
        color: #fff; border-radius: 4px; cursor: pointer;
      }
      .ots2qbo-copy:hover { background: rgba(255,255,255,.18); }
      .ots2qbo-fillone { margin-top: 6px; padding: 6px 8px; font-size: 12px; }
      .ots2qbo-missline {
        display: flex; align-items: center; justify-content: space-between;
        gap: 6px; padding: 3px 0 3px 8px; border-left: 2px solid rgba(255,255,255,.25);
        margin-top: 4px; font-size: 12px;
      }
      .ots2qbo-minibtn {
        padding: 2px 10px; font-size: 11px; border: 1px solid rgba(255,255,255,.45);
        background: #2e6da4; color: #fff; border-radius: 4px; cursor: pointer; flex: none;
      }
      .ots2qbo-minibtn:hover { background: #3a82c4; }
      .ots2qbo-misssub { margin-top: 4px; font-size: 11px; font-weight: 600; color: #ffd28a; }
      /* ── Tour ── */
      #ots2qbo-tour-overlay { position: fixed; inset: 0; z-index: 1000000; }
      #ots2qbo-tour-spot {
        position: absolute; border-radius: 8px;
        box-shadow: 0 0 0 9999px rgba(0,0,0,.62), 0 0 0 3px #5fa8e8;
        transition: all .25s ease; pointer-events: none;
      }
      #ots2qbo-tour-tip {
        position: absolute; width: 280px; background: ${PANEL_BLUE}; color: #fff;
        border: 1px solid #5fa8e8; border-radius: 8px; padding: 12px;
        box-shadow: 0 6px 20px rgba(0,0,0,.5); font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 13px; line-height: 1.5;
      }
      #ots2qbo-tour-tip .ots2qbo-tour-count { opacity: .7; font-size: 11px; margin-bottom: 6px; }
      #ots2qbo-tour-tip .ots2qbo-tour-nav { display: flex; gap: 8px; margin-top: 10px; }
      #ots2qbo-tour-tip button {
        flex: 1; padding: 6px; border: 1px solid rgba(255,255,255,.4);
        background: transparent; color: #fff; border-radius: 5px; cursor: pointer; font-size: 12px;
      }
      #ots2qbo-tour-tip button:hover { background: rgba(255,255,255,.15); }
      #ots2qbo-tour-tip button.ots2qbo-primary { background: #2e6da4; border-color: #2e6da4; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildPanel(title, bodyHTML, tourSteps) {
    const panel = document.createElement('div');
    panel.id = 'ots2qbo-panel';
    panel.innerHTML = `
      <div id="ots2qbo-header" title="Double-click to expand/collapse">
        <span>${title}</span>
        <span class="ots2qbo-spacer"></span>
        <button class="ots2qbo-iconbtn" id="ots2qbo-toggle" title="Expand/collapse">▸</button>
        <button class="ots2qbo-iconbtn" id="ots2qbo-help" title="Guided tour">?</button>
        <button class="ots2qbo-iconbtn" id="ots2qbo-close" title="Close">✕</button>
      </div>
      <div id="ots2qbo-body">${bodyHTML}</div>
    `;
    document.body.appendChild(panel);

    // Starts COLLAPSED — just the title bar. Chevron (or double-click on the
    // header) opens it when needed.
    const bodyEl = panel.querySelector('#ots2qbo-body');
    const toggleBtn = panel.querySelector('#ots2qbo-toggle');
    const setCollapsed = (c) => {
      bodyEl.style.display = c ? 'none' : '';
      toggleBtn.textContent = c ? '▸' : '▾';
      panel.classList.toggle('ots2qbo-collapsed', c);
    };
    setCollapsed(true);
    toggleBtn.addEventListener('click', () => setCollapsed(bodyEl.style.display !== 'none'));
    panel.querySelector('#ots2qbo-header').addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      setCollapsed(bodyEl.style.display !== 'none');
    });

    panel.querySelector('#ots2qbo-close').addEventListener('click', () => panel.remove());
    panel.querySelector('#ots2qbo-help').addEventListener('click', () => {
      setCollapsed(false); // the tour spotlights elements inside the body
      startTour(tourSteps);
    });

    // drag by header
    const header = panel.querySelector('#ots2qbo-header');
    let drag = null;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      panel.style.left = (e.clientX - drag.dx) + 'px';
      panel.style.top  = (e.clientY - drag.dy) + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => (drag = null));
    return panel;
  }

  const setStatus = (msg, isErr) => {
    const el = document.getElementById('ots2qbo-status');
    if (el) { el.textContent = msg; el.style.color = isErr ? '#ff9e9e' : '#dff0ff'; }
  };

  /* ════════════════════════════════════════════════════════════════════
   *  GUIDED TOUR with spotlight
   * ════════════════════════════════════════════════════════════════════ */

  function startTour(steps) {
    const valid = steps.filter((s) => document.querySelector(s.selector));
    if (!valid.length) return;
    let i = 0;

    const overlay = document.createElement('div');
    overlay.id = 'ots2qbo-tour-overlay';
    overlay.innerHTML = `<div id="ots2qbo-tour-spot"></div><div id="ots2qbo-tour-tip"></div>`;
    document.body.appendChild(overlay);
    const spot = overlay.querySelector('#ots2qbo-tour-spot');
    const tip  = overlay.querySelector('#ots2qbo-tour-tip');

    const end = () => { document.removeEventListener('keydown', onKey); overlay.remove(); };
    const onKey = (e) => {
      if (e.key === 'Escape') end();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') (i === valid.length - 1 ? end() : show(i + 1));
      else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) end(); });

    function show(idx) {
      i = idx;
      const step = valid[i];
      const el = document.querySelector(step.selector);
      if (!el) return end();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const r = el.getBoundingClientRect();
      const pad = 6;
      Object.assign(spot.style, {
        left:   (r.left - pad) + 'px',
        top:    (r.top  - pad) + 'px',
        width:  (r.width  + pad * 2) + 'px',
        height: (r.height + pad * 2) + 'px',
      });
      tip.innerHTML = `
        <div class="ots2qbo-tour-count">Step ${i + 1} of ${valid.length}</div>
        <div>${step.text}</div>
        <div class="ots2qbo-tour-nav">
          ${i > 0 ? '<button id="ots2qbo-tour-back">‹ Back</button>' : ''}
          <button id="ots2qbo-tour-skip">Skip</button>
          <button class="ots2qbo-primary" id="ots2qbo-tour-next">${i === valid.length - 1 ? 'Done' : 'Next ›'}</button>
        </div>`;
      // position tip: prefer left of spotlight, else below
      const tipW = 280, gap = 14;
      let left = r.left - tipW - gap;
      let top = r.top;
      if (left < 8) { left = Math.min(r.left, window.innerWidth - tipW - 8); top = r.bottom + gap; }
      if (top + 160 > window.innerHeight) top = Math.max(8, window.innerHeight - 180);
      Object.assign(tip.style, { left: left + 'px', top: Math.max(8, top) + 'px' });

      tip.querySelector('#ots2qbo-tour-next').onclick = () => (i === valid.length - 1 ? end() : show(i + 1));
      tip.querySelector('#ots2qbo-tour-skip').onclick = end;
      const back = tip.querySelector('#ots2qbo-tour-back');
      if (back) back.onclick = () => show(i - 1);
    }
    show(0);
  }

  /* ════════════════════════════════════════════════════════════════════
   *  PAGE A — otsystems.net Daily Transactions report
   * ════════════════════════════════════════════════════════════════════ */

  function getActiveTab() {
    const pane = document.querySelector('div[role="tabpanel"].active');
    if (pane && pane.id) return pane.id;
    const hash = (location.hash || '').replace(/^#\/?/, '');
    return hash || null;
  }

  // Parse one money cell → { amount, count, breakdown:[{qty, rate}] }
  function parseCell(td) {
    const out = { amount: 0, count: 0, breakdown: [] };
    if (!td) return out;
    const txt = td.textContent || '';
    if (/^\s*-\s*$/.test(txt.trim())) return out;
    const amount = parseMoney(txt);
    if (amount === null) return out;
    out.amount = Math.abs(amount);
    const countMatch = txt.match(/\((\d+)\)/);
    if (countMatch) out.count = parseInt(countMatch[1], 10);
    // breakdown entries like "3 @ $39.95"
    td.querySelectorAll('small').forEach((s) => {
      const m = (s.textContent || '').match(/(\d+)\s*@\s*\$?([\d,.]+)/);
      if (m) out.breakdown.push({ qty: parseInt(m[1], 10), rate: parseFloat(m[2].replace(/,/g, '')) });
    });
    return out;
  }

  function cellToLines(cell, sku, courseName, sign, variant) {
    const lines = [];
    if (!cell || cell.amount <= 0) return lines;
    if (cell.breakdown.length) {
      // One invoice line PER PRICE POINT (e.g. 4 @ $39.95 + 1 @ $44.95).
      cell.breakdown.forEach((b) =>
        lines.push({ sku, courseName, variant, qty: b.qty, rate: sign * b.rate, amount: sign * b.qty * b.rate }));
      // Sanity check: the visible breakdown must add up to the cell total.
      const sum = +cell.breakdown.reduce((s, b) => s + b.qty * b.rate, 0).toFixed(2);
      if (Math.abs(sum - cell.amount) > 0.011) lines[0].sumMismatch = { sum, amount: cell.amount };
    } else {
      const qty = cell.count || 1;
      const rate = +(cell.amount / qty).toFixed(2);
      // averaged: multiple sales collapsed into one line because the price
      // breakdown wasn't visible — the rate may match NO real price.
      lines.push({ sku, courseName, variant, qty, rate: sign * rate, amount: sign * cell.amount, derived: !cell.count, averaged: qty > 1 });
    }
    return lines;
  }

  function captureTable(includeRefunds) {
    const tab = getActiveTab();
    const suffixes = SUFFIX_MAP[tab] || DEFAULT_SUFFIX;
    const pane = document.querySelector('div[role="tabpanel"].active') || document;
    const rows = pane.querySelectorAll('tbody tr[ng-repeat]');
    const lines = [];
    const warnings = [];

    rows.forEach((tr) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 8 || tr.querySelector('td[colspan]')) return; // skip totals row
      const itemNumber = (tds[1].textContent || '').trim();
      const courseName = (tds[2].querySelector('span[ng-click]')?.textContent || tds[2].textContent || '').trim().replace(/\s+/g, ' ');
      if (!itemNumber) return;

      const corpRecv  = parseCell(tds[3]);
      const corpRef   = parseCell(tds[4]);
      const ncRecv    = parseCell(tds[5]);
      const ncRef     = parseCell(tds[6]);

      lines.push(...cellToLines(corpRecv, itemNumber + suffixes.corporate,    courseName,  1, 'Corporate'));
      lines.push(...cellToLines(ncRecv,   itemNumber + suffixes.nonCorporate, courseName,  1, 'Non-Corporate'));
      if (includeRefunds) {
        lines.push(...cellToLines(corpRef, itemNumber + suffixes.corporate,    courseName + ' (refund)', -1, 'Corporate'));
        lines.push(...cellToLines(ncRef,   itemNumber + suffixes.nonCorporate, courseName + ' (refund)', -1, 'Non-Corporate'));
      }
    });

    lines.filter((l) => l.derived).forEach((l) =>
      warnings.push(`${l.sku}: count not visible — assumed qty 1 @ ${fmt(l.rate)}. Turn on "Show Counts" for accuracy.`));
    lines.filter((l) => l.averaged).forEach((l) =>
      warnings.push(`${l.sku}: ${l.qty} sales captured as ONE line @ AVERAGED rate ${fmt(l.rate)} — if they sold at different prices this is wrong. Expand the price breakdown on the report and re-capture to split them.`));
    lines.filter((l) => l.sumMismatch).forEach((l) =>
      warnings.push(`${l.sku}: price breakdown (${fmt(l.sumMismatch.sum)}) doesn't add up to the cell total (${fmt(l.sumMismatch.amount)}) — verify this item.`));

    return { tab, suffixes, capturedAt: new Date().toISOString(), lines, warnings };
  }

  /* ── Auto-expand price breakdowns before capture ─────────────────────
   * The "4 @ $39.95 / 1 @ $44.95" detail rows live inside
   * ng-if="item.ShowBreakdown == true" — ng-if REMOVES them from the DOM
   * when off, so the script can't read what isn't there. This flips
   * ShowBreakdown on for every row (and the ShowCounts filter) through the
   * page's own AngularJS scope, then lets Angular re-render.            */
  function expandBreakdowns() {
    try {
      const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
      const ng = W.angular;
      if (!ng || !ng.element) return false;
      let touched = false;
      document.querySelectorAll('tbody tr[ng-repeat]').forEach((tr) => {
        const sc = ng.element(tr).scope();
        if (sc && sc.item && sc.item.ShowBreakdown !== true) { sc.item.ShowBreakdown = true; touched = true; }
        if (sc && sc.dtc && sc.dtc.Filters && sc.dtc.Filters.ShowCounts !== true) { sc.dtc.Filters.ShowCounts = true; touched = true; }
      });
      if (touched) {
        const inj = ng.element(document.body).injector();
        const root = inj && inj.get ? inj.get('$rootScope') : null;
        if (root && root.$applyAsync) root.$applyAsync();
      }
      return touched;
    } catch (e) {
      console.warn('[OTS2QBO] could not auto-expand breakdowns:', e);
      return false;
    }
  }

  function initReportPage() {
    injectStyles();
    const body = `
      <div>Active tab: <strong id="ots2qbo-tabname">detecting…</strong></div>
      <label id="ots2qbo-refunds"><input type="checkbox" id="ots2qbo-refunds-cb"> Include refunds as negative lines</label>
      <button class="ots2qbo-btn" id="ots2qbo-capture">Capture table for QBO</button>
      <div id="ots2qbo-status">Open the tab you want, then click Capture.</div>
    `;
    buildPanel('OTS → QB Capture', body, TOUR_STEPS_REPORT);

    const updateTab = () => {
      const el = document.getElementById('ots2qbo-tabname');
      if (el) el.textContent = getActiveTab() || 'unknown';
    };
    updateTab();
    setInterval(updateTab, 1500);

    document.getElementById('ots2qbo-capture').addEventListener('click', async () => {
      const includeRefunds = document.getElementById('ots2qbo-refunds-cb').checked;
      // Make hidden price breakdowns visible before reading the table.
      if (expandBreakdowns()) await sleep(400);
      const payload = captureTable(includeRefunds);
      if (!payload.lines.length) {
        setStatus('No billable rows found on the active tab. Is the table loaded?', true);
        return;
      }
      GM_setValue(STORE_KEY, JSON.stringify(payload));
      const total = payload.lines.reduce((s, l) => s + l.amount, 0);
      let msg = `Captured ${payload.lines.length} line(s) from ${payload.tab}\nExpected invoice total: ${fmt(total)}\nNow open the QBO invoice and click Fill.`;
      if (payload.warnings.length) msg += '\nWarning: ' + payload.warnings.join('\nWarning: ');
      setStatus(msg, payload.warnings.length > 0);
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   *  PAGE A2 — otsystems.net Corporate Invoice  (generate.asp)
   *
   *  Different table from Daily Transactions: rows are grouped PER COURSE
   *  (Angular ic.ClassData), each already carrying QTY / RATE / AMOUNT plus a
   *  student roster. One course row → one QBO invoice line. SKU is the item
   *  number + fixed corporate suffix. Description is built to match the
   *  desired QBO layout: course name, then "STUDENT ID (SIGNUP DATE)", then
   *  one "Name (date)" per enrolled student.
   * ════════════════════════════════════════════════════════════════════ */

  // Pull org id + date range straight out of the generate.asp URL, so the
  // panel can show which customer/invoice is loaded (one page = one customer).
  function corpInvoiceMeta() {
    const p = new URLSearchParams(location.search);
    return {
      orgId: p.get('org_id') || p.get('Org_ID') || '',
      startDate: p.get('startdate') || p.get('startDate') || '',
      endDate: p.get('enddate') || p.get('endDate') || '',
    };
  }

  // The company name is rendered in the invoice header (a bare <div>, e.g.
  // "A&M Engineering and Environmental Services, Inc."). No stable class, so
  // try labeled selectors first, then fall back to scanning header divs for
  // text that looks like a company name.
  function corpCompanyName() {
    const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();

    // 1) Explicit selectors if the page ever labels it.
    for (const s of ['.invoice-company', '.company-name', '.org-name']) {
      const t = clean(document.querySelector(s)?.textContent);
      if (t.length > 2 && t.length < 160) return t;
    }

    // 2) A <th>COMPANY</th><td>…</td> row, mirroring Billing ID.
    for (const th of document.querySelectorAll('th')) {
      if (/^\s*(company|organization|bill\s*to)\s*$/i.test(th.textContent || '')) {
        const t = clean(th.nextElementSibling?.textContent);
        if (t.length > 2 && t.length < 160) return t;
      }
    }

    // 3) Scan divs for company-looking text (entity suffix or common words).
    const looksLikeCompany = (t) =>
      t.length > 4 && t.length < 160 &&
      /\b(inc\.?|llc|l\.l\.c\.|corp\.?|co\.?|ltd\.?|company|services|engineering|environmental|group|associates|solutions|systems|construction|industries)\b/i.test(t);
    for (const div of document.querySelectorAll('div')) {
      // Only leaf-ish divs (avoid grabbing a big container's concatenated text)
      if (div.children.length === 0) {
        const t = clean(div.textContent);
        if (looksLikeCompany(t)) return t;
      }
    }
    return '';
  }

  // Normalize a company name for loose comparison: drop a leading account-type
  // prefix like "Corp - " / "Corporate - " / "Corp: ", lowercase, strip
  // punctuation and entity suffixes, collapse whitespace. Lets the OTS name
  // and the QBO "Corp - …" customer match on their core identity.
  function normalizeCompany(name) {
    return (name || '')
      .replace(/&amp;/gi, '&')
      .replace(/^\s*(corp(orate)?|company|acct|account)\s*[-:–—]\s*/i, '') // leading "Corp - "
      .toLowerCase()
      .replace(/\b(inc|llc|l\.l\.c|corp|co|ltd|company)\b\.?/gi, '')       // entity suffixes
      .replace(/[.,&'"()]/g, ' ')                                          // punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Compare the OTS company name against one or more QBO candidate strings
  // (the Customer field value, and each line of the Bill-to address). Passes
  // if the core name matches ANY candidate. Returns details for the message.
  function companyNamesMatch(otsName, qboCandidates) {
    const a = normalizeCompany(otsName);
    const cands = [].concat(qboCandidates).filter(Boolean);
    if (!a || !cands.length) return { match: null, otsCore: a, matchedOn: '', qboCandidates: cands };
    for (const c of cands) {
      const b = normalizeCompany(c);
      if (b && (a === b || a.includes(b) || b.includes(a))) {
        return { match: true, otsCore: a, matchedOn: c, qboCandidates: cands };
      }
    }
    return { match: false, otsCore: a, matchedOn: '', qboCandidates: cands };
  }

  // Pull the candidate company strings currently shown on the QBO invoice.
  function qboCompanyCandidates() {
    const out = [];
    const cust = qFirst(QBO.customerInput);
    if (cust && cust.value) out.push(cust.value.trim());
    const bill = qFirst(QBO.billToInput);
    if (bill && bill.value) {
      // Each non-empty line of the Bill-to block is a candidate (name, company,
      // street, city). The company line will match; the others simply won't.
      bill.value.split('\n').map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s));
    }
    return out;
  }

  // Read one course row's student roster into ["Name (m/d/yy)", ...].
  // Each enrollment is an <a> whose text is "First Last (6/29/26)" (status
  // markers live in HTML comments, so textContent is already clean).
  function readRoster(activityTd) {
    const out = [];
    activityTd.querySelectorAll('a[ng-href*="student_number"], a[href*="student_number"]').forEach((a) => {
      const t = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
    });
    return out;
  }

  // Build the QBO description block for a course line, matching the example:
  //   40 Hour HAZWOPER Online
  //   STUDENT ID (SIGNUP DATE)
  //   Richard Summers (5/22/26)
  //   John Tipton (5/22/26)
  function buildDescription(courseName, roster) {
    const lines = [courseName];
    if (roster.length) {
      lines.push('STUDENT ID (SIGNUP DATE)');
      roster.forEach((r) => lines.push(r));
    }
    return lines.join('\n');
  }

  // Billing ID lives in a header row: <th>BILLING ID</th><td>A&ME063026</td>.
  // This becomes the QBO "Invoice no." (reference_number). Match the <th> by
  // text so we don't depend on row position.
  function corpBillingId() {
    for (const th of document.querySelectorAll('th')) {
      if (/^\s*billing\s*id\s*$/i.test(th.textContent || '')) {
        const td = th.nextElementSibling;
        const v = (td?.textContent || '').replace(/\s+/g, '').trim();
        if (v) return v;
      }
    }
    return '';
  }

  function captureCorporateInvoice() {
    const meta = corpInvoiceMeta();
    const lines = [];
    const warnings = [];

    // Course rows are the ng-repeat rows over ic.ClassData. The totals row has
    // a colspan cell, so skip anything containing td[colspan].
    const rows = document.querySelectorAll('tr[ng-repeat*="ClassData"]');
    rows.forEach((tr) => {
      if (tr.querySelector('td[colspan]')) return;
      const tds = tr.querySelectorAll('td');
      if (tds.length < 4) return;

      const activityTd = tds[0];

      // Item number: the copy-to-clipboard <a> inside the <strong> header,
      // e.g. "0003-2219".
      const itemLink = activityTd.querySelector('strong a[ng-click*="CopyToClipboard"], strong a');
      const itemNumber = (itemLink?.textContent || '').replace(/\s+/g, '').trim();

      // Course name: the <strong> text with the "(item#)" prefix stripped off.
      let courseName = (activityTd.querySelector('strong')?.textContent || '')
        .replace(/\s+/g, ' ')
        .replace(/^\(\s*[\d-]+\s*\)\s*/, '')  // drop leading "(0003-2219) "
        .trim();

      if (!itemNumber || !courseName) return;

      const roster = readRoster(activityTd);

      // QTY / RATE / AMOUNT are the last three right-aligned cells before the
      // trailing 20px spacer cell. Read from the end to stay robust.
      const qty  = parseInt((tds[tds.length - 4].textContent || '').replace(/[^\d.-]/g, ''), 10);
      const rate = parseMoney(tds[tds.length - 3].textContent);
      const amt  = parseMoney(tds[tds.length - 2].textContent);

      const sku = itemNumber + CORP_INVOICE_SUFFIX;
      const qtyFinal = Number.isFinite(qty) && qty > 0 ? qty : (roster.length || 1);
      const rateFinal = rate != null ? rate : (amt != null && qtyFinal ? +(amt / qtyFinal).toFixed(2) : 0);
      const amtFinal = amt != null ? amt : +(qtyFinal * rateFinal).toFixed(2);

      // Cross-check the roster count against the printed QTY.
      if (roster.length && Number.isFinite(qty) && roster.length !== qty) {
        warnings.push(`${sku}: ${roster.length} student(s) listed but QTY reads ${qty} — verify this line.`);
      }
      // Cross-check qty × rate against the printed amount.
      if (rate != null && amt != null && Math.abs(qtyFinal * rateFinal - amtFinal) > 0.011) {
        warnings.push(`${sku}: ${qtyFinal} × ${fmt(rateFinal)} ≠ ${fmt(amtFinal)} — verify this line.`);
      }

      lines.push({
        sku,
        courseName,
        variant: 'Corporate',
        qty: qtyFinal,
        rate: rateFinal,
        amount: amtFinal,
        description: buildDescription(courseName, roster),
        roster,
      });
    });

    return {
      source: 'corporate-invoice',
      tab: meta.orgId ? `Corporate org ${meta.orgId}` : 'Corporate Invoice',
      company: corpCompanyName(),
      billingId: corpBillingId(),
      meta,
      capturedAt: new Date().toISOString(),
      lines,
      warnings,
    };
  }

  // One-step placeholder tour. Per standing preference the ? button always
  // exists; fuller steps can be dropped in here later.
  const TOUR_STEPS_CORP = [
    { selector: '#ots2qbo-capture',
      text: 'This captures the corporate invoice shown on this page — one line per course, with student rosters — and saves it. Then open the customer\'s QBO invoice and click Fill. (More detailed tour steps coming soon.)' },
  ];

  function initCorpInvoicePage() {
    injectStyles();
    const meta = corpInvoiceMeta();
    const range = (meta.startDate && meta.endDate) ? `${meta.startDate} – ${meta.endDate}` : '';
    const body = `
      <div>Org: <strong id="ots2qbo-corp-org">${meta.orgId || 'unknown'}</strong></div>
      ${range ? `<div style="opacity:.85;margin-top:2px">Range: ${range}</div>` : ''}
      <button class="ots2qbo-btn" id="ots2qbo-capture">Capture this invoice for QBO</button>
      <div id="ots2qbo-status">Review the invoice, then click Capture.</div>
    `;
    buildPanel('OTS → QB Capture (Corporate)', body, TOUR_STEPS_CORP);

    document.getElementById('ots2qbo-capture').addEventListener('click', () => {
      const payload = captureCorporateInvoice();
      if (!payload.lines.length) {
        setStatus('No course lines found. Is the invoice fully loaded on this page?', true);
        return;
      }
      GM_setValue(STORE_KEY, JSON.stringify(payload));
      const total = payload.lines.reduce((s, l) => s + l.amount, 0);
      const students = payload.lines.reduce((s, l) => s + (l.roster ? l.roster.length : 0), 0);
      let msg = `Captured ${payload.lines.length} course line(s), ${students} student(s)` +
                `${payload.company ? ' for ' + payload.company : ''}.\n` +
                `${payload.billingId ? 'Billing ID / Invoice no.: ' + payload.billingId + '\n' : ''}` +
                `Expected invoice total: ${fmt(total)}\nNow open this customer's QBO invoice and click Fill.`;
      if (payload.warnings.length) msg += '\nWarning: ' + payload.warnings.join('\nWarning: ');
      setStatus(msg, payload.warnings.length > 0);
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   *  PAGE B — QuickBooks Online invoice
   * ════════════════════════════════════════════════════════════════════ */

  function qFirst(selectors, root = document) {
    for (const sel of [].concat(selectors)) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findEmptyProductInput() {
    return [...document.querySelectorAll(QBO.productInput)].find((inp) => !inp.value.trim()) || null;
  }

  function findRowFieldForLine(productInput, selectors) {
    // aria-label carries the same "line N" number on sibling fields
    const m = (productInput.getAttribute('aria-label') || '').match(/line\s+(\d+)/i);
    if (m) {
      for (const sel of selectors) {
        const candidates = document.querySelectorAll(sel);
        for (const c of candidates) {
          const lbl = c.getAttribute('aria-label') || '';
          if (new RegExp('line\\s+' + m[1] + '$', 'i').test(lbl)) return c;
        }
      }
    }
    // fallback: search within the same table row
    const tr = productInput.closest('tr, [role="row"]');
    if (tr) {
      for (const sel of selectors) {
        const c = tr.querySelector(sel);
        if (c) return c;
      }
    }
    return null;
  }

  async function tryAddLines() {
    // QBO's real button: <button class="idsTSButton ..."><span class="Button-label-...">Add product or service</span></button>
    const btns = [...document.querySelectorAll('button')];
    const btn =
      btns.find((b) => /add\s+product\s+or\s+service/i.test(b.textContent || '')) ||
      btns.find((b) => /add\s+lines?/i.test(b.textContent || ''));
    if (btn) {
      fireClick(btn);
      await waitFor(findEmptyProductInput, 3000).catch(() => null); // adaptive instead of fixed sleep
      return true;
    }
    return false;
  }

  /* ── Dropdown row discovery across BOTH QBO menu generations ─────────
   * Legacy markup:  ul[id$="-idsMenu"] > li[role="option"]
   * New IDS menu:   <span class="Menu-menu-item-container…" role="none">
   *                   <div class="idsRowItem"> … <div class="sku" title=SKU>
   * The new rows have role="none", so li[role="option"] finds NOTHING there —
   * that's why every matching tier (and the popup) saw zero options.
   * menuRows() returns the outermost element per row from whichever markup
   * is present; .sku/.text reading works identically on both.            */
  function menuRows() {
    const set = new Set();
    document.querySelectorAll(`${QBO.menu} ${QBO.menuItem}, .idsRowItem`).forEach((el) => set.add(el));
    const all = [...set];
    // if both selectors hit nested elements of the same row, keep the outermost
    return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
  }

  // New rows carry role="none"; the click handler lives on an ancestor.
  // Climb to the nearest interactive container before firing the click.
  function clickMenuRow(row) {
    const target =
      row.closest('li, [role="option"], [class*="Menu-menu-item"]') || row;
    fireClick(target);
  }

  // Reads the product display name from a dropdown row (title attr is intact
  // even when QBO splits the visible text into <b>/<span> highlight spans).
  function readMenuName(li) {
    const t = li.querySelector('.text [title], .text');
    return (t?.getAttribute('title') || t?.textContent || li.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* ── Manual match popup ──────────────────────────────────────────────
   * Shown when a SKU has no exact dropdown match. The Product/Service field
   * gets a glowing outline — type into IT to search (so QBO's own typeahead
   * does the work). Every option QBO offers is mirrored below, full SKU and
   * product name, one click to use it. Skip moves on and the line lands in
   * the Missed list at the end.
   * mousedown + preventDefault keeps focus inside QBO's field, so its menu
   * (and the <li> elements we click) stay alive at selection time.        */
  function manualMatch(line, productInput, readSku) {
    return new Promise((resolve) => {
      const old = document.getElementById('ots2qbo-pick');
      if (old) old.remove();

      const box = document.createElement('div');
      box.id = 'ots2qbo-pick';
      box.innerHTML = `
        <div class="ots2qbo-pick-head">${variantBadge(line)}<br>No match: ${line.sku}</div>
        <div class="ots2qbo-pick-sub">${line.qty} @ ${line.rate < 0 ? '-' : ''}${fmt(line.rate)} — ${line.courseName}<br>
          You are looking for the <strong>${variantText(line) || 'matching'}</strong> version of this course.<br>
          Type <strong>${(line.sku.match(/^\d{4}-\d{4}/) || [line.sku])[0]}</strong> in the <strong>glowing Product/Service field</strong> —
          the moment the exact SKU appears it will be selected for you automatically (Qty &amp; Rate too). Or click any product below.</div>
        <div id="ots2qbo-pick-list"><em>Waiting for dropdown options…</em></div>
        <div class="ots2qbo-pick-actions">
          <button id="ots2qbo-pick-skip">Skip this line (enter it manually later)</button>
        </div>`;
      const host = document.getElementById('ots2qbo-body') || document.body;
      host.prepend(box);

      productInput.classList.add('ots2qbo-hot');
      productInput.focus();

      const listEl = box.querySelector('#ots2qbo-pick-list');
      let lastSig = '';
      let opts = [];

      const harvest = () => {
        const out = [];
        menuRows().forEach((li) => {
          const sku = readSku(li);
          const name = readMenuName(li);
          if (sku || name) out.push({ li, sku: sku || '(no SKU)', name });
        });
        return out;
      };

      let timer = null;
      const finish = (li) => {
        if (timer) clearInterval(timer);
        productInput.classList.remove('ots2qbo-hot');
        box.remove();
        resolve(li);
      };

      const wanted = line.sku.replace(/\s+/g, '').toUpperCase();
      const render = () => {
        opts = harvest();
        // Auto-select: the instant the exact SKU shows up (usually right
        // after the base number is typed), take it — no click needed.
        const exact = opts.find((o) => (o.sku || '').replace(/\s+/g, '').toUpperCase() === wanted);
        if (exact && exact.li && exact.li.isConnected) { finish(exact.li); return; }
        const sig = opts.map((o) => o.sku + '|' + o.name).join('~');
        if (sig === lastSig) return;
        lastSig = sig;
        listEl.innerHTML = opts.length
          ? opts.map((o, i) =>
              `<div class="ots2qbo-pickrow" data-i="${i}">
                 <strong>${o.sku}</strong><br><small>${o.name}</small>
               </div>`).join('')
          : '<em>No options visible — type in the glowing field to search.</em>';
        listEl.querySelectorAll('.ots2qbo-pickrow').forEach((row) => {
          row.addEventListener('mousedown', (e) => {
            e.preventDefault(); // don't steal focus → QBO's menu stays open
            const choice = opts[Number(row.dataset.i)];
            if (choice && choice.li && choice.li.isConnected) finish(choice.li);
          });
        });
      };

      timer = setInterval(render, 350);
      render();

      box.querySelector('#ots2qbo-pick-skip').addEventListener('mousedown', (e) => {
        e.preventDefault();
        finish(null);
      });
    });
  }

  async function fillLine(line, idx, total, interactive) {
    let stage = 'start';
    let smartNote = '';
    try {
      setStatus(`Filling line ${idx + 1} of ${total}: ${line.sku} (${variantText(line) || 'unknown variant'}) …`);

      stage = 'finding empty Product/Service field';
      let input = findEmptyProductInput();
      if (!input) {
        stage = 'clicking "Add product or service"';
        await tryAddLines();
        stage = 'finding empty Product/Service field after adding line';
        input = await waitFor(findEmptyProductInput, 4000).catch(() => null);
      }
      if (!input) throw new Error('no empty Product/Service field found (and could not add a line)');

      stage = 'focusing/typing SKU';
      input.focus();
      fireClick(input);
      await sleep(QBO.typeDelay);
      setNativeValue(input, line.sku);
      await sleep(QBO.typeDelay);

      stage = 'waiting for typeahead dropdown';
      const readSku = (li) => {
        const skuEl = li.querySelector('.sku');
        if (!skuEl) return '';
        // title attribute is complete even when QBO splits the text into <b>/<span> for highlighting
        return (skuEl.getAttribute('title') || skuEl.textContent || '').replace(/\s+/g, '').trim();
      };
      const findMatch = () => {
        for (const li of menuRows()) {
          if (readSku(li).toUpperCase() === line.sku.toUpperCase()) return li;
        }
        return null;
      };
      let item = await waitFor(findMatch, 2500).catch(() => null);
      const base = (line.sku.match(/^\d{4}-\d{4}/) || [line.sku])[0];
      if (!item) {
        // Retry by typing just the base item number (e.g. "0004-2217") —
        // QBO's typeahead matches reliably on that, then we exact-match the
        // full SKU among the results.
        stage = 'retrying with base item number';
        setNativeValue(input, '');
        await sleep(QBO.typeDelay);
        setNativeValue(input, base);
        item = await waitFor(findMatch, 2500).catch(() => null);
      }
      if (!item && menuRows().length === 0) {
        // The menu is EMPTY (not "no match" — literally no rows). That means
        // the value-swap typing didn't register with this combobox. Re-type
        // the base number with real per-character keyboard events.
        stage = 'retyping base number with keyboard events';
        await typeForReal(input, base);
        item = await waitFor(findMatch, QBO.menuTimeout).catch(() => null);
      }
      if (!item) {
        console.log('[OTS2QBO] line', idx + 1, line.sku, '— rows visible at decision time:',
          menuRows().map((r) => readSku(r) || readMenuName(r)));
      }
      if (!item) {
        /* ── Smart variant match ─────────────────────────────────────────
         * The base number (xxxx-xxxx) already pins down the exact course &
         * version, so among the dropdown results we only need to identify
         * the variant. Tier 2: compare the first SKU-tail segment as a
         * whole token (SUI ≠ SUIC — no prefix confusion). Tier 3: if rows
         * lack a readable SKU, use name markers ("Corporate", "OTS").
         * Auto-pick ONLY when exactly one candidate survives; otherwise
         * fall through to the manual popup. Never guesses.              */
        stage = 'smart variant matching';
        const baseM = line.sku.match(/^\d{4}-\d{4}/);
        if (baseM) {
          const base = baseM[0].toUpperCase();
          const wantedSku = line.sku.toUpperCase();
          const wantedToken = (wantedSku.slice(base.length).split('-').filter(Boolean)[0] || '');
          const cands = [];
          menuRows().forEach((li) =>
            cands.push({ li, sku: readSku(li).toUpperCase(), name: readMenuName(li) }));

          // Tier 2 — whole-token comparison on the SKU tail
          let hits = wantedToken
            ? cands.filter((c) =>
                c.sku.startsWith(base) &&
                (c.sku.slice(base.length).split('-').filter(Boolean)[0] || '') === wantedToken)
            : [];
          let how = 'SKU variant token';

          // Tier 3 — name markers, when SKUs are missing or gave no single hit
          if (hits.length !== 1) {
            const v = variantOf(line);
            const nameHits = cands.filter((c) => {
              if (!c.name) return false;
              const hasCorp = /corporate/i.test(c.name);
              const hasOts  = /\bOTS\b/.test(c.name);
              return hasCorp === (v.label === 'Corporate') && hasOts === (v.channel === 'OTS');
            });
            if (hits.length === 0 && nameHits.length === 1) { hits = nameHits; how = 'product-name markers'; }
          }

          if (hits.length === 1) {
            item = hits[0].li;
            const picked = hits[0].sku || hits[0].name;
            if (picked !== wantedSku) {
              smartNote = `line ${idx + 1} (${line.sku}): auto-picked "${picked}" by ${how} — verify this line on the invoice.`;
            }
            console.log('[OTS2QBO] smart match:', line.sku, '→', picked, 'via', how);
          } else if (hits.length) {
            console.log('[OTS2QBO] smart match ambiguous for', line.sku, '→', hits.map((h) => h.sku || h.name));
          }
        }
      }
      if (!item) {
        if (!interactive) {
          // Batch mode: never pause the run. Clear the field so the next
          // line gets a clean input, record the skip, keep moving.
          stage = 'auto-skipped';
          setNativeValue(input, '');
          throw new Error('no automatic match in the QBO dropdown');
        }
        // ── Interactive (per-row Fill button): popup picker. You type the
        //    base number; the exact SKU auto-selects on sight. ──
        stage = 'manual match (waiting for your pick)';
        setStatus(`No exact match for ${line.sku} — you need the ${variantText(line) || 'matching'} version. Type the base number in the glowing field; the right product will be picked automatically.`, true);
        item = await manualMatch(line, input, readSku);
        if (!item) {
          throw new Error('skipped — enter manually');
        }
      }

      stage = 'clicking dropdown item';
      clickMenuRow(item);
      // adaptive: wait until QBO writes the product name back into the field
      // (it replaces the typed SKU with the product title on selection)
      await waitFor(() => {
        const v = input.value.trim();
        return v && v.toUpperCase() !== line.sku.toUpperCase() ? true : null;
      }, 2500).catch(() => null);
      await sleep(60);

      stage = 'filling Qty';
      const qtyEl = findRowFieldForLine(input, QBO.qtyInput);
      if (qtyEl) { qtyEl.focus(); setNativeValue(qtyEl, String(Math.abs(line.qty))); qtyEl.blur(); await sleep(QBO.typeDelay); }

      stage = 'filling Rate';
      const rateEl = findRowFieldForLine(input, QBO.rateInput);
      if (rateEl) { rateEl.focus(); setNativeValue(rateEl, String(line.rate)); rateEl.blur(); await sleep(QBO.typeDelay); }

      // Description (corporate invoices carry a course + roster block). Only
      // written when the captured line actually has one, so daily-sales fills
      // are unaffected. QBO usually auto-fills a default description on product
      // select, so this overwrites it with our roster version.
      if (line.description) {
        stage = 'filling Description';
        const descEl = findRowFieldForLine(input, QBO.descInput);
        if (descEl) { descEl.focus(); setNativeValue(descEl, line.description); descEl.blur(); await sleep(QBO.typeDelay); }
        else smartNote = (smartNote ? smartNote + '\n' : '') + `line ${idx + 1} (${line.sku}): description field not found — the course/roster text wasn't written.`;
      }

      if (!qtyEl || !rateEl) {
        const w = `line ${idx + 1} (${line.sku}): product selected, but ${!qtyEl ? 'Qty' : ''}${!qtyEl && !rateEl ? ' & ' : ''}${!rateEl ? 'Rate' : ''} field not found — fill manually.`;
        return smartNote ? w + '\n' + smartNote : w;
      }
      return smartNote || null;
    } catch (e) {
      console.error('[OTS2QBO] line', idx + 1, line.sku, 'failed at stage:', stage, e);
      throw new Error(`${e.message || e.name || 'error'} (at: ${stage})`);
    }
  }

  function renderPreview(payload) {
    const el = document.getElementById('ots2qbo-preview');
    if (!payload) { el.innerHTML = '<em>No captured data. Run Capture on the report page first.</em>'; return; }
    const age = Math.round((Date.now() - new Date(payload.capturedAt)) / 60000);
    const total = payload.lines.reduce((s, l) => s + l.amount, 0);
    let header = `<div style="margin-bottom:6px"><strong>${payload.tab}</strong> · ${payload.lines.length} lines · ${total < 0 ? '-' : ''}${fmt(total)} · captured ${age} min ago</div>`;
    if (payload.billingId) header += `<div style="margin-bottom:6px">Invoice no.: <strong>${payload.billingId}</strong></div>`;
    if (age > 120) header += `<div class="ots2qbo-neg" style="margin-bottom:6px">This capture is over 2 hours old — re-capture if the report has changed.</div>`;
    if (payload.filledAt) header += `<div class="ots2qbo-neg" style="margin-bottom:6px">Already filled once at ${new Date(payload.filledAt).toLocaleTimeString()} — filling again will add duplicate lines.</div>`;
    el.innerHTML = header +
      payload.lines.map((l) =>
        `<div class="ots2qbo-line ${l.amount < 0 ? 'ots2qbo-neg' : ''}">
           ${variantBadge(l)}<br>
           <strong>${l.sku}</strong> — ${l.qty} @ ${l.rate < 0 ? '-' : ''}${fmt(l.rate)} = ${l.amount < 0 ? '-' : ''}${fmt(l.amount)}<br>
           <small>${l.courseName}${l.roster && l.roster.length ? ` · ${l.roster.length} student${l.roster.length === 1 ? '' : 's'}` : ''}</small>
         </div>`).join('');
  }

  // Skipped-lines report: one card per SKU, every price point listed
  // (e.g. 4 @ $39.95 AND 1 @ $44.95 under the same SKU), with a per-line
  // Fill button (interactive assist) and a Copy button for manual entry.
  function renderMissed(missed, onFill) {
    const el = document.getElementById('ots2qbo-missed');
    if (!el) return;
    if (!missed.length) { el.innerHTML = ''; return; }
    const groups = new Map();
    missed.forEach((m, i) => {
      const k = (m.sku || '').toUpperCase();
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ m, i });
    });
    const missedTotal = missed.reduce((s, m) => s + m.amount, 0);
    let html = `<div class="ots2qbo-missed-head">Skipped — needs entering: ${groups.size} product(s), ${missed.length} line(s), ${missedTotal < 0 ? '-' : ''}${fmt(missedTotal)}</div>`;
    groups.forEach((entries) => {
      const f = entries[0].m;
      const sub = entries.reduce((s, e) => s + e.m.amount, 0);
      html += `
        <div class="ots2qbo-missrow">
          <button class="ots2qbo-copy" data-sku="${f.sku}">Copy</button>
          ${variantBadge(f)}<br>
          <strong>${f.sku}</strong><br>
          <small>${f.courseName}</small>
          ${entries.map(({ m, i }) => `
            <div class="ots2qbo-missline">
              Qty <strong>${Math.abs(m.qty)}</strong> @ <strong>${m.rate < 0 ? '-' : ''}${fmt(m.rate)}</strong> = ${m.amount < 0 ? '-' : ''}${fmt(m.amount)}
              ${onFill ? `<button class="ots2qbo-minibtn ots2qbo-fillone" data-i="${i}">Fill</button>` : ''}
            </div>`).join('')}
          ${entries.length > 1 ? `<div class="ots2qbo-misssub">SKU total: ${sub < 0 ? '-' : ''}${fmt(sub)}</div>` : ''}
        </div>`;
    });
    el.innerHTML = html;
    el.querySelectorAll('.ots2qbo-copy').forEach((b) =>
      b.addEventListener('click', () => copyText(b.dataset.sku)));
    if (onFill) {
      el.querySelectorAll('.ots2qbo-fillone').forEach((b) =>
        b.addEventListener('click', () => onFill(Number(b.dataset.i))));
    }
  }

  function initQboPage() {
    injectStyles();
    const body = `
      <div id="ots2qbo-preview"></div>
      <button class="ots2qbo-btn" id="ots2qbo-fill">Fill Invoice</button>
      <button class="ots2qbo-btn" id="ots2qbo-clear" style="background:#6b4a4a">Clear captured data</button>
      <div id="ots2qbo-missed"></div>
      <div id="ots2qbo-status"></div>
    `;
    buildPanel('OTS → QB Fill', body, TOUR_STEPS_QBO);

    const load = () => {
      const raw = GM_getValue(STORE_KEY, null);
      const payload = raw ? JSON.parse(raw) : null;
      if (payload) {
        payload.lines.forEach((l) => {
          if (SKU_OVERRIDES[l.sku]) l.sku = SKU_OVERRIDES[l.sku];
        });
      }
      renderPreview(payload);
      document.getElementById('ots2qbo-fill').disabled = !payload;
      return payload;
    };
    let payload = load();

    document.getElementById('ots2qbo-clear').addEventListener('click', () => {
      GM_deleteValue(STORE_KEY);
      payload = load();
      lastMissed = [];
      renderMissed([]);
      setStatus('Captured data cleared.');
    });

    let lastMissed = [];

    async function fillSingle(i) {
      const m = lastMissed[i];
      if (!m) return;
      document.querySelectorAll('.ots2qbo-fillone').forEach((b) => (b.disabled = true));
      try {
        const warn = await fillLine(m, 0, 1, true);
        lastMissed.splice(i, 1);
        renderMissed(lastMissed, fillSingle);
        setStatus(warn
          ? `${m.sku} filled with a note:\n${warn}`
          : `${m.sku} filled (Qty ${Math.abs(m.qty)} @ ${m.rate < 0 ? '-' : ''}${fmt(m.rate)}). ${lastMissed.length ? lastMissed.length + ' line(s) left.' : 'All caught up — verify the invoice total.'}`,
          !!warn);
      } catch (e) {
        m.reason = e.message;
        renderMissed(lastMissed, fillSingle);
        setStatus(`Still couldn't fill ${m.sku}: ${e.message}`, true);
      }
    }

    document.getElementById('ots2qbo-fill').addEventListener('click', async () => {
      payload = load();
      if (!payload) return;
      if (payload.filledAt && !window.confirm('This capture was already filled once. Fill again anyway? (This will add duplicate lines to the invoice.)')) return;
      const btn = document.getElementById('ots2qbo-fill');
      btn.disabled = true;
      const warnings = [];
      const missed = [];
      renderMissed([]);
      try {
        // ── Verify we're on the right customer's invoice ──────────────────
        // Loose core-name match against the QBO Customer field and Bill-to
        // address. Warn (with the specific difference) but never block.
        if (payload.company) {
          const cands = qboCompanyCandidates();
          const chk = companyNamesMatch(payload.company, cands);
          if (chk.match === false) {
            const qboShown = cands[0] || '(no customer set)';
            const proceed = window.confirm(
              'Customer name may not match this capture.\n\n' +
              'OTS company : ' + payload.company + '\n' +
              'QBO invoice : ' + qboShown + '\n\n' +
              'Fill this invoice anyway?'
            );
            if (!proceed) { btn.disabled = false; setStatus('Fill cancelled — customer mismatch.', true); return; }
            warnings.push(`Customer name mismatch — OTS "${payload.company}" vs QBO "${qboShown}". Filled anyway at your confirmation.`);
          } else if (chk.match === null) {
            warnings.push(`Could not read the QBO customer to verify against OTS "${payload.company}" — double-check you're on the right invoice.`);
          }
        }
        // Set the Invoice no. from the OTS Billing ID first (once per run).
        if (payload.billingId) {
          const invNo = qFirst(QBO.invoiceNoInput);
          if (invNo) {
            invNo.focus(); setNativeValue(invNo, payload.billingId); invNo.blur();
            await sleep(QBO.typeDelay);
            if ((invNo.value || '').replace(/\s+/g, '') !== payload.billingId.replace(/\s+/g, '')) {
              warnings.push(`Invoice no. may not have taken — set it to "${payload.billingId}" manually.`);
            }
          } else {
            warnings.push(`Invoice no. field not found — set it to "${payload.billingId}" manually.`);
          }
        }
        for (let i = 0; i < payload.lines.length; i++) {
          const line = payload.lines[i];
          try {
            const warn = await fillLine(line, i, payload.lines.length);
            if (warn) warnings.push(warn);
          } catch (e) {
            missed.push({ ...line, reason: e.message });
          }
          await sleep(QBO.betweenLines);
        }
        const expected = payload.lines.reduce((s, l) => s + l.amount, 0);
        const missedSum = missed.reduce((s, m) => s + m.amount, 0);
        const filledSum = expected - missedSum;
        const filledCount = payload.lines.length - missed.length;
        let msg = missed.length
          ? `Done: ${filledCount} line(s) filled, ${missed.length} auto-skipped — grouped above with their prices.` +
            `\nQBO total should read ${filledSum < 0 ? '-' : ''}${fmt(filledSum)} right now,` +
            ` and ${expected < 0 ? '-' : ''}${fmt(expected)} once the skipped lines are entered.`
          : `All ${payload.lines.length} lines filled.` +
            `\nExpected invoice total: ${expected < 0 ? '-' : ''}${fmt(expected)} — cross-check QBO's total before saving.`;
        if (warnings.length) msg += '\nNote: ' + warnings.join('\nNote: ');
        setStatus(msg, missed.length > 0 || warnings.length > 0);
        lastMissed = missed;
        renderMissed(lastMissed, fillSingle);
        payload.filledAt = new Date().toISOString();
        GM_setValue(STORE_KEY, JSON.stringify(payload));
        renderPreview(payload);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   *  BOOT
   * ════════════════════════════════════════════════════════════════════ */

  function boot() {
    if (document.getElementById('ots2qbo-panel')) return;
    if (location.hostname.includes('otsystems.net')) {
      if (/\/corporateinvoice\/generate\.asp/i.test(location.pathname + location.search) ||
          /\/corporateinvoice\//i.test(location.pathname) && /generate\.asp/i.test(location.href)) {
        // Corporate invoice: Angular renders the ClassData table late.
        waitFor(() => document.querySelector('tr[ng-repeat*="ClassData"]'), 20000)
          .then(initCorpInvoicePage)
          .catch(() => initCorpInvoicePage()); // show panel anyway
      } else {
        // Daily Transactions report
        waitFor(() => document.querySelector('div[role="tabpanel"] table'), 20000)
          .then(initReportPage)
          .catch(() => initReportPage()); // show panel anyway
      }
    } else if (location.hostname.includes('intuit.com')) {
      waitFor(() => document.querySelector('input[aria-label^="Product or service"]') || document.body, 20000)
        .then(initQboPage)
        .catch(initQboPage);
    }
  }

  boot();
})();