// ==UserScript==
// @name         EMS - Scantron Score Entry (Gemini)
// @namespace    https://admin2025.otsystems.net/
// @version      9.1
// @description  Upload scantron photos or PDFs; Gemini 2.5 Flash reads each student name + earned-points score (handwritten overrides printed). Review every row, then enter scores into the current quiz page. The grade date is set from the assignment's due date (never today's date) and shown in an editable box. Review is mandatory — nothing saves until you confirm.
// @author       You
// @match        https://admin2025.otsystems.net/training/classroom/session/*/grades/*
// @match        https://admin2025.otsystems.net/training/classroom/session/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// ==/UserScript==

(function () {
  'use strict';

  var NAVY    = '#1a3a5c';
  var NAVY_DK = '#12293f';
  var GREEN   = '#15803d';
  var RED     = '#b91c1c';
  var AMBER   = '#b45309';

  function save(key, val) { try { GM_setValue(key, JSON.stringify(val)); } catch (e) {} }
  function load(key, def) {
    try { var v = GM_getValue(key, null); return v !== null ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }

  var MODEL = 'gemini-2.5-flash'; // fixed; not user-changeable

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  // Reduce a score string to just the earned-points number.
  // "10/100" -> "10", "09/90%" -> "9", "90%" -> "90", "8" -> "8".
  function normalizeScore(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    if (s.indexOf('/') !== -1) s = s.split('/')[0];   // take numerator
    s = s.replace(/%/g, '').trim();                    // strip percent
    var m = s.match(/-?\d+(\.\d+)?/);                  // first number
    if (!m) return '';
    var n = parseFloat(m[0]);
    return String(n);                                  // drops leading zeros: "09" -> "9"
  }
  function normalizeName(n) {
    return String(n).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  }
  function similarity(a, b) {
    if (a === b) return 1; if (!a || !b) return 0;
    var bg = function (s) { var st = {}; for (var i = 0; i < s.length - 1; i++) st[s.slice(i, i + 2)] = 1; return st; };
    var A = bg(a), B = bg(b), x = 0, sa = 0, sb = 0, k;
    for (k in A) sa++; for (k in B) { sb++; if (A[k]) x++; }
    return (2 * x) / (sa + sb);
  }

  // Detect the selected assignment's type and possible points from the page.
  // Quiz -> 10, Block -> 100, Final -> 150, else unknown (null max).
  function detectAssignment() {
    var title = '';
    var sel = document.querySelector('.assignment-item-vertical.selected .assignment-title');
    if (sel) title = (sel.textContent || '').trim();
    if (!title) {
      var h4 = document.querySelector('app-assignment-detail h4.card-title, h4.card-title');
      if (h4) title = (h4.textContent || '').trim();
    }
    var t = title.toLowerCase();
    var type = 'unknown', max = null, pages = 1;
    if (/\bfinal\b/.test(t))        { type = 'final'; max = 150; pages = 2; }
    else if (/\bblock\b/.test(t))   { type = 'block'; max = 100; pages = 2; }
    else if (/\bquiz\b/.test(t))    { type = 'quiz';  max = 10;  pages = 1; }
    var due = detectDueDate();
    return { title: title, type: type, max: max, pages: pages, dueDate: due.text, dueISO: due.iso };
  }

  // Read the assignment's preset due date from the page (e.g. "Due: Jun 4, 2026").
  // Returns { text: "Jun 4, 2026", iso: "2026-06-04" }. The script uses this so the
  // grade date matches the assignment — it never writes the current date.
  function detectDueDate() {
    var scopes = [
      document.querySelector('.assignment-item-vertical.selected .assignment-details'),
      document.querySelector('app-assignment-detail .assignment-details'),
      document.querySelector('app-assignment-detail')
    ];
    for (var i = 0; i < scopes.length; i++) {
      var el = scopes[i];
      if (!el) continue;
      var txt = (el.textContent || '').replace(/\s+/g, ' ');
      var m = txt.match(/Due:\s*([A-Za-z]{3,}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (m) return { text: m[1].trim(), iso: parseDateToISO(m[1].trim()) };
    }
    return { text: '', iso: '' };
  }

  var MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
                 jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  // Convert "Jun 4, 2026" or "6/4/2026" to "2026-06-04" for a date input. '' if unparseable.
  function parseDateToISO(s) {
    if (!s) return '';
    s = String(s).trim();
    var m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) {
      var mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
      if (!mo) return '';
      return m[3] + '-' + mo + '-' + ('0' + m[2]).slice(-2);
    }
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      var yr = m[3].length === 2 ? '20' + m[3] : m[3];
      return yr + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
    }
    return '';
  }

  // Convert a roster name that may be "Last, First" into "First Last" for matching.
  function flipName(name) {
    var s = String(name || '').trim();
    if (s.indexOf(',') !== -1) {
      var p = s.split(',');
      if (p.length === 2) return (p[1].trim() + ' ' + p[0].trim()).trim();
    }
    return s;
  }

  // Pull the clean student name out of a row's first cell, dropping any
  // "Saved" badge text and the student-ID sub-line.
  function extractRosterName(row) {
    var cell = row.querySelector('td:first-child');
    if (!cell) return '';
    var nameDiv = cell.querySelector('div');
    var raw = nameDiv ? nameDiv.cloneNode(true) : cell.cloneNode(true);
    // Remove any badge/pill spans (e.g. "✓ Saved") so they don't pollute the name.
    raw.querySelectorAll('span').forEach(function (s) { s.remove(); });
    var txt = (raw.textContent || '').replace(/\s+/g, ' ').trim();
    txt = txt.replace(/\u2713/g, '').replace(/\bsaved\b/ig, '').replace(/\s+/g, ' ').trim();
    return txt;
  }

  // Find the roster rows on the current quiz/grade page.
  // Handles ungraded rows (number input + Save) AND already-graded rows
  // (which show "N pts" + an Edit button and no input until Edit is clicked).
  function getRosterRows() {
    var rows = [];
    document.querySelectorAll('table tbody tr').forEach(function (row) {
      var displayName = extractRosterName(row);
      if (!displayName) return;
      var input = row.querySelector('input[type="number"]');
      var dateInput = row.querySelector('input[type="date"]');
      var saveBtn = row.querySelector('button.btn-primary');
      var editBtn = null, graded = false;
      row.querySelectorAll('button').forEach(function (b) {
        var bt = (b.textContent || '').trim().toLowerCase();
        if (!editBtn && bt === 'edit') editBtn = b;
      });
      if (!input && editBtn) graded = true;
      rows.push({
        name: displayName,                 // as shown, e.g. "Bates, Carson"
        matchName: flipName(displayName),  // "Carson Bates" for matching
        rowEl: row,
        inputEl: input,                    // may be null on graded rows
        dateEl: dateInput,                 // per-row grade date field (may be null)
        saveBtn: saveBtn,                  // may be null on graded rows
        editBtn: editBtn,
        graded: graded
      });
    });
    return rows;
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent =
    '#sse-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:2147482000;display:none;align-items:flex-start;justify-content:center;padding:34px 16px;overflow:auto;}' +
    '#sse-backdrop.open{display:flex;}' +
    '#sse-panel{background:#fff;width:560px;max-width:100%;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:Arial,Helvetica,sans-serif;overflow:hidden;display:flex;flex-direction:column;max-height:88vh;}' +

    '#sse-header{background:' + NAVY + ';color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}' +
    '#sse-header .sse-title{font-size:16px;font-weight:bold;}' +
    '#sse-header .sse-sub{font-size:13px;opacity:.85;margin-top:3px;}' +
    '#sse-header button{background:' + NAVY_DK + ';color:#fff;border:none;border-radius:50%;width:26px;height:26px;font-size:14px;font-weight:bold;cursor:pointer;margin-left:6px;}' +
    '#sse-header button:hover{filter:brightness(1.2);}' +

    '#sse-body{padding:16px;overflow:auto;}' +
    '.sse-label{display:block;font-size:12px;font-weight:600;color:' + NAVY + ';margin-bottom:4px;}' +
    '.sse-row{display:flex;gap:8px;margin-bottom:12px;}' +
    '.sse-input,.sse-select{box-sizing:border-box;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;outline:none;font-family:inherit;}' +
    '.sse-input:focus,.sse-select:focus{border-color:' + NAVY + ';}' +
    '.sse-btn{background:' + NAVY + ';color:#fff;border:none;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:bold;cursor:pointer;transition:filter .15s,transform .1s;}' +
    '.sse-btn:hover{filter:brightness(1.1);transform:translateY(-1px);}' +
    '.sse-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none;}' +
    '.sse-btn-light{background:#e2e8f0;color:' + NAVY + ';}' +
    '.sse-btn-sm{padding:6px 10px;font-size:12px;border-radius:6px;}' +

    '.sse-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px;}' +
    '.sse-status{font-size:11px;margin-top:6px;}' +

    '#sse-drop{border:2px dashed #cbd5e1;border-radius:10px;padding:22px 16px;text-align:center;cursor:pointer;transition:all .15s;background:#f8fafc;}' +
    '#sse-drop:hover,#sse-drop.dragover{border-color:' + NAVY + ';background:#eef4fa;}' +
    '#sse-drop .sse-drop-icon{font-size:28px;}' +
    '#sse-drop .sse-drop-text{font-size:13px;color:#334155;margin-top:6px;font-weight:600;}' +
    '#sse-drop .sse-drop-sub{font-size:11px;color:#64748b;margin-top:3px;}' +

    '#sse-files{display:flex;flex-direction:column;gap:6px;margin-top:10px;}' +
    '.sse-file{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:7px;padding:6px 8px;}' +
    '.sse-file img{width:40px;height:40px;object-fit:cover;border-radius:5px;flex-shrink:0;}' +
    '.sse-file .sse-file-pdf{width:40px;height:40px;border-radius:5px;flex-shrink:0;background:' + NAVY + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;}' +
    '.sse-file .sse-file-name{flex:1;font-size:12px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.sse-file .sse-file-x{background:none;border:none;color:' + RED + ';cursor:pointer;font-size:15px;padding:2px 4px;}' +

    '#sse-progress{margin-top:12px;display:none;}' +
    '#sse-progress.active{display:block;}' +
    '#sse-prog-track{width:100%;height:7px;background:#e2e8f0;border-radius:4px;overflow:hidden;}' +
    '#sse-prog-fill{height:100%;width:0%;background:' + NAVY + ';transition:width .3s;border-radius:4px;}' +
    '#sse-prog-label{font-size:11px;color:#475569;margin-top:5px;text-align:center;}' +

    '#sse-review{display:none;margin-top:14px;}' +
    '#sse-review.active{display:block;}' +
    '#sse-confirm-banner{background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:9px 11px;font-size:11px;color:' + AMBER + ';line-height:1.5;margin-bottom:10px;}' +
    '#sse-date-box{display:flex;align-items:flex-start;gap:8px;background:#eef4fa;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;font-size:12px;color:' + NAVY + ';line-height:1.5;margin-bottom:10px;}' +
    '#sse-date-box .sse-date-icon{font-size:15px;flex-shrink:0;margin-top:2px;}' +
    '#sse-date-box .sse-date-note{color:#64748b;font-size:11px;}' +
    '#sse-date-input{padding:6px 8px;}' +
    '#sse-review-head{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;padding:7px 0;margin-bottom:6px;}' +
    '#sse-review-head .sse-label{margin:0;}' +
    '#sse-review-count{font-size:11px;color:#64748b;}' +
    '#sse-review-list{max-height:300px;overflow-y:auto;}' +
    '.sse-rev{display:flex;align-items:center;gap:7px;padding:6px 4px;border-bottom:1px solid #f1f5f9;}' +
    '.sse-rev.skip{opacity:.45;}' +
    '.sse-rev.nomatch{border-left:3px solid ' + RED + ';padding-left:6px;}' +
    '.sse-rev.fuzzy{border-left:3px solid #f59e0b;padding-left:6px;}' +
    '.sse-rev .sse-rev-dot{flex-shrink:0;width:14px;text-align:center;font-size:13px;}' +
    '.sse-rev .sse-rev-name{flex:1.3;min-width:0;padding:5px 7px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;font-family:inherit;outline:none;}' +
    '.sse-rev .sse-rev-name:focus{border-color:' + NAVY + ';}' +
    '.sse-rev .sse-rev-match{flex:1;min-width:0;font-size:10px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.sse-rev .sse-rev-score{width:60px;flex-shrink:0;padding:5px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;text-align:center;font-family:inherit;outline:none;}' +
    '.sse-rev .sse-rev-score:focus{border-color:' + NAVY + ';}' +
    '.sse-rev .sse-rev-score.unsure{border-color:#f59e0b;background:#fffbeb;}' +
    '.sse-rev .sse-rev-skip{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:2px 4px;flex-shrink:0;}' +
    '.sse-rev .sse-rev-skip:hover{color:' + RED + ';}' +
    '.sse-rev-picker{display:flex;padding:0 4px 6px 21px;}' +
    '.sse-rev-picker select{flex:1;padding:4px 6px;border:1px solid #cbd5e1;border-radius:6px;font-size:11px;font-family:inherit;}' +
    '#sse-review-actions{display:flex;gap:8px;align-items:center;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:8px;}' +

    '#sse-log{margin-top:10px;background:#f1f5f9;border-radius:8px;padding:9px 11px;font-size:11px;line-height:1.7;max-height:140px;overflow-y:auto;display:none;}' +
    '#sse-log.active{display:block;}' +
    '.sse-log-ok{color:' + GREEN + ';}.sse-log-warn{color:' + AMBER + ';}.sse-log-err{color:' + RED + ';}.sse-log-info{color:' + NAVY + ';}' +

    '#sse-msg{font-size:12px;margin-top:8px;min-height:14px;}' +

    '#sse-inline-btn{display:inline-flex;align-items:center;gap:6px;vertical-align:middle;margin-left:12px;' +
      'background:' + NAVY + ';color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:13px;font-weight:600;' +
      'font-family:Arial,Helvetica,sans-serif;cursor:pointer;transition:filter .15s,transform .1s;}' +
    '#sse-inline-btn:hover{filter:brightness(1.12);transform:translateY(-1px);}' +

    /* tour */
    '.sse-tour-el{}' +
    '';
  document.head.appendChild(style);

  // ── Panel ──────────────────────────────────────────────────────────────────────
  var backdrop = document.createElement('div');
  backdrop.id = 'sse-backdrop';
  backdrop.innerHTML =
    '<div id="sse-panel">' +
      '<div id="sse-header">' +
        '<div>' +
          '<div class="sse-title">Scantron Score Entry</div>' +
          '<div class="sse-sub" id="sse-sub">This tool reads name + printed score \u00b7 you confirm before saving</div>' +
        '</div>' +
        '<div>' +
          '<button id="sse-keybtn" title="API key">\uD83D\uDD11</button>' +
          '<button id="sse-help" title="Guided tour">?</button>' +
          '<button id="sse-close" title="Close">\u2715</button>' +
        '</div>' +
      '</div>' +
      '<div id="sse-body">' +

        '<div class="sse-card" id="sse-key-card" style="display:none;">' +
          '<label class="sse-label">Gemini API key</label>' +
          '<div class="sse-row" style="margin-bottom:0;">' +
            '<input class="sse-input" id="sse-key" type="password" placeholder="AIza\u2026" autocomplete="off" style="flex:1;">' +
            '<button class="sse-btn sse-btn-sm" id="sse-key-save">Save</button>' +
            '<button class="sse-btn sse-btn-sm sse-btn-light" id="sse-key-clear" title="Forget key">\u2715</button>' +
          '</div>' +
          '<div class="sse-status" id="sse-key-status"></div>' +
        '</div>' +

        '<div id="sse-drop">' +
          '<div class="sse-drop-icon">\uD83D\uDCC4</div>' +
          '<div class="sse-drop-text">Click or drop scantron files here</div>' +
          '<div class="sse-drop-sub">Images or PDFs \u00b7 reads name + printed score</div>' +
          '<input type="file" id="sse-file-input" accept="image/*,application/pdf" multiple style="display:none;">' +
        '</div>' +
        '<div id="sse-files"></div>' +

        '<button class="sse-btn" id="sse-read" style="width:100%;margin-top:12px;" disabled>Read Scantrons</button>' +

        '<div id="sse-progress">' +
          '<div id="sse-prog-track"><div id="sse-prog-fill"></div></div>' +
          '<div id="sse-prog-label">Reading\u2026</div>' +
        '</div>' +

        '<div id="sse-review">' +
          '<div id="sse-confirm-banner">\u26a0 Review every name and score below. Gemini can misread \u2014 nothing is entered until you confirm. Fix anything wrong, then enter scores.</div>' +
          '<div id="sse-date-box">' +
            '<span class="sse-date-icon">\ud83d\udcc5</span>' +
            '<div style="flex:1;">' +
              '<label class="sse-label" style="margin-bottom:3px;">Grade date entered for every score</label>' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
                '<input type="date" id="sse-date-input" class="sse-input" style="width:170px;">' +
                '<span id="sse-date-src" class="sse-date-note"></span>' +
              '</div>' +
              '<div class="sse-date-note" style="margin-top:4px;">Pulled from the assignment\u2019s due date \u2014 never today\u2019s date. Change it here if you need a different date.</div>' +
            '</div>' +
          '</div>' +
          '<div id="sse-review-head">' +
            '<span class="sse-label">Extracted \u2014 verify each row</span>' +
            '<span id="sse-review-count"></span>' +
          '</div>' +
          '<div id="sse-review-list"></div>' +
          '<div id="sse-review-actions">' +
            '<button class="sse-btn sse-btn-sm sse-btn-light" id="sse-rematch">\u21ba Re-match roster</button>' +
            '<div style="flex:1;"></div>' +
            '<button class="sse-btn" id="sse-apply" disabled>\u2713 Confirm &amp; Enter Scores</button>' +
          '</div>' +
        '</div>' +

        '<div id="sse-log"></div>' +
        '<div id="sse-msg"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(backdrop);

  function $(id) { return document.getElementById(id); }

  // ── Open / close ────────────────────────────────────────────────────────────────
  function refreshAssignmentLabel() {
    var sub = $('sse-sub');
    if (!sub) return;
    var a = detectAssignment();
    if (a.title) {
      sub.textContent = a.title;
    } else {
      sub.textContent = 'Gemini reads name + printed score \u00b7 you confirm before saving';
    }
  }
  function openPanel() { backdrop.classList.add('open'); refreshKeyCard(); refreshAssignmentLabel(); }
  function closePanel() { clearTour(); backdrop.classList.remove('open'); }
  $('sse-close').addEventListener('click', closePanel);
  $('sse-help').addEventListener('click', startTour);
  backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closePanel(); });

  // Key button in header toggles the key entry card
  $('sse-keybtn').addEventListener('click', function () {
    var card = $('sse-key-card');
    var showing = card.style.display !== 'none';
    card.style.display = showing ? 'none' : 'block';
    if (!showing) { refreshKeyCard(); $('sse-key').focus(); }
  });

  // ── Key (model is fixed: gemini-2.5-flash) ────────────────────────────────────────
  function refreshKeyCard() {
    var key = load('sse_key', '');
    var keyInput = $('sse-key');
    var status = $('sse-key-status');
    if (key) {
      keyInput.value = '';
      keyInput.placeholder = '\u2022\u2022\u2022\u2022 stored \u2022\u2022\u2022\u2022';
      status.style.color = GREEN;
      status.textContent = '\u2713 key stored \u00b7 model: ' + MODEL;
    } else {
      status.style.color = AMBER;
      status.textContent = 'No key yet \u2014 paste a Gemini key to enable reading.';
    }
    updateReadBtn();
  }
  $('sse-key-save').addEventListener('click', function () {
    var v = $('sse-key').value.trim();
    if (v) save('sse_key', v);
    $('sse-key').value = '';
    refreshKeyCard();
  });
  $('sse-key-clear').addEventListener('click', function () {
    save('sse_key', ''); refreshKeyCard();
  });

  // ── File handling ────────────────────────────────────────────────────────────────
  var files = []; // { name, mimeType, base64, dataUrl(optional), isPdf }
  var drop = $('sse-drop');
  var fileInput = $('sse-file-input');
  drop.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function (e) { handleFiles(e.target.files); fileInput.value = ''; });
  ['dragover', 'dragenter'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
  });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files); });

  function handleFiles(fileList) {
    Array.prototype.forEach.call(fileList, function (file) {
      var isImg = file.type.indexOf('image/') === 0;
      var isPdf = file.type === 'application/pdf';
      if (!isImg && !isPdf) return;
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var base64 = dataUrl.split(',')[1];
        files.push({
          name: file.name,
          mimeType: file.type,
          base64: base64,
          dataUrl: isImg ? dataUrl : null,
          isPdf: isPdf
        });
        renderFiles();
        updateReadBtn();
      };
      reader.readAsDataURL(file);
    });
  }

  function renderFiles() {
    var wrap = $('sse-files');
    wrap.innerHTML = '';
    files.forEach(function (f, i) {
      var el = document.createElement('div');
      el.className = 'sse-file';
      var thumb = f.isPdf
        ? '<div class="sse-file-pdf">PDF</div>'
        : '<img src="' + f.dataUrl + '" alt="">';
      el.innerHTML = thumb +
        '<div class="sse-file-name" title="' + esc(f.name) + '">' + esc(f.name) + '</div>' +
        '<button class="sse-file-x" data-i="' + i + '" title="Remove">\u2715</button>';
      wrap.appendChild(el);
    });
    wrap.querySelectorAll('.sse-file-x').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        files.splice(parseInt(e.target.dataset.i, 10), 1);
        renderFiles(); updateReadBtn();
      });
    });
  }

  function updateReadBtn() {
    var hasKey = !!load('sse_key', '');
    $('sse-read').disabled = !(hasKey && files.length > 0);
  }

  // ── Read via Gemini ───────────────────────────────────────────────────────────────
  var results = []; // { extractedName, score, unsure, rosterName, inputEl, saveBtn, matchScore, status, skipped, done }

  $('sse-read').addEventListener('click', readScantrons);

  async function readScantrons() {
    var key = load('sse_key', '');
    var model = MODEL;
    if (!key || files.length === 0) return;

    var prog = $('sse-progress'), fill = $('sse-prog-fill'), label = $('sse-prog-label');
    var logEl = $('sse-log');
    prog.classList.add('active');
    logEl.innerHTML = '';
    logEl.classList.remove('active');
    fill.style.width = '0%';
    $('sse-read').disabled = true;
    setMsg('', '');

    var extracted = [];
    var done = 0;
    var hadError = false;
    var asg = detectAssignment();
    refreshAssignmentLabel();
    for (var idx = 0; idx < files.length; idx++) {
      var f = files[idx];
      label.textContent = 'Reading ' + (done + 1) + ' / ' + files.length + ' \u2014 ' + f.name;
      try {
        var recs = await callGemini(key, model, f, asg);
        recs.forEach(function (r) { extracted.push(r); });
      } catch (ex) {
        hadError = true;
        logEl.classList.add('active');
        addLog(logEl, '\u2717 ' + f.name + ': ' + ex.message, 'err');
      }
      done++;
      fill.style.width = Math.round((done / files.length) * 100) + '%';
      await sleep(120);
    }

    label.textContent = 'Read ' + extracted.length + ' record(s) from ' + files.length + ' file(s)';
    buildReview(extracted, asg);
  }

  function callGemini(key, model, f, asg) {
    asg = asg || { type: 'unknown', max: null, pages: 1 };
    var scaleLine = '';
    var groupLine = '';
    if (asg.type === 'quiz') {
      scaleLine = 'This is a QUIZ. Each quiz is out of ' + asg.max + ' points. The score is machine-printed near the top-right as a fraction like "10/100%" or "07/70%" \u2014 the number BEFORE the slash is the earned points (e.g. "07/70%" -> 7). ';
      groupLine = 'Each page is ONE student. ';
    } else if (asg.type === 'block') {
      scaleLine = 'This is a BLOCK EXAM, out of ' + asg.max + ' points. The score is HANDWRITTEN, usually in the TOTAL box at the bottom-right of the student\'s FIRST page, often written as a percentage like "94%" or a fraction; report the number before any slash/percent as the earned points. ';
      groupLine = 'Each student spans TWO pages (questions 1-50 on the first page which has the NAME box, and 51-100 on the next page which has a BLANK name box). Treat each NAME-bearing page plus the following continuation page as ONE student, and return ONE record per student. ';
    } else if (asg.type === 'final') {
      scaleLine = 'This is a FINAL EXAM, out of ' + asg.max + ' points (a 200-item Scantron form, with about 150 questions used). The score is HANDWRITTEN at the bottom as a fraction like "122/81%"; the number BEFORE the slash is the earned points (e.g. "122/81%" -> 122). ';
      groupLine = 'Each student is ONE physical sheet scanned as TWO pages: the first page is labeled "SIDE 1" and carries the NAME box, the second is "SIDE 2". Treat each SIDE 1 + following SIDE 2 as ONE student and return ONE record per student. ';
    } else {
      groupLine = 'A page (or pair of pages for two-sided sheets) corresponds to one student. ';
    }
    var maxLine = asg.max ? ('The maximum possible score is ' + asg.max + ' points. ') : '';

    var prompt =
      'This file is a scantron / test answer sheet (it may contain one or more students, possibly across multiple pages). ' +
      scaleLine + groupLine + maxLine +
      'For each student, extract: (1) the student name as written in the NAME box, and (2) the score. ' +
      'Rules for the score: ' +
      'Only read a score that is visibly printed or handwritten on the page \u2014 do NOT compute or guess from the filled-in bubbles. ' +
      'If a handwritten score is present AND differs from a machine-printed score, the HANDWRITTEN score is correct \u2014 use it. ' +
      'Report the POINTS EARNED only, as a plain number. If the score appears as a fraction like 122/150 or 10/100, or a percentage like 94%, report only the number BEFORE the slash (and never the percentage): "10/100%" -> "10", "122/81%" -> "122", "94%" -> "94". ' +
      'If you cannot clearly read a score, set "score" to null and "unsure" to true. ' +
      (asg.max ? 'If the score you read is greater than ' + asg.max + ', still report what you see but set "unsure" to true. ' : '') +
      'Do NOT include seat numbers, version numbers, subject text, or test numbers in the name field. ' +
      'Return ONLY a JSON array, no prose, no markdown code fences. ' +
      'Schema: [{"name": string, "score": string|null, "unsure": boolean}]';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);

    var body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: f.mimeType, data: f.base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0, response_mime_type: 'application/json' }
    };

    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: 'POST',
        url: url,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify(body),
        timeout: 90000,
        onload: function (resp) {
          try {
            if (resp.status < 200 || resp.status >= 300) {
              var m = 'HTTP ' + resp.status;
              try { var e = JSON.parse(resp.responseText); if (e.error && e.error.message) m += ' \u2014 ' + e.error.message; } catch (ig) {}
              return reject(new Error(m));
            }
            var data = JSON.parse(resp.responseText);
            var cand = data.candidates && data.candidates[0];
            if (!cand) return reject(new Error('No response from model'));
            var text = (cand.content && cand.content.parts || [])
              .map(function (p) { return p.text || ''; }).join('');
            var clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            var arr = JSON.parse(clean);
            if (!Array.isArray(arr)) arr = [arr];
            resolve(arr);
          } catch (err) {
            reject(new Error('Could not parse model response'));
          }
        },
        onerror: function () { reject(new Error('Network error')); },
        ontimeout: function () { reject(new Error('Request timed out')); }
      });
    });
  }

  // ── Review ────────────────────────────────────────────────────────────────────────
  var currentAsg = { type: 'unknown', max: null, pages: 1 };

  // Pre-fill the editable date box with the assignment's due date (never today's date).
  // Only fills when empty so a manual edit isn't clobbered on re-render.
  function populateDateBox() {
    var di = $('sse-date-input');
    var src = $('sse-date-src');
    if (!di) return;
    if (!di.value && currentAsg.dueISO) di.value = currentAsg.dueISO;
    if (src) {
      if (currentAsg.dueDate) {
        src.textContent = 'from assignment due date · ' + currentAsg.dueDate;
      } else {
        src.textContent = 'no due date found on page — set one above';
      }
    }
  }

  function buildReview(extracted, asg) {
    if (asg) currentAsg = asg;
    populateDateBox();
    var max = currentAsg.max;
    var roster = getRosterRows();
    results = extracted.map(function (rec) {
      var name = (rec.name || '').trim();
      var score = normalizeScore(rec.score);
      var unsure = !!rec.unsure;
      // Flag scores above the possible points (e.g. bonus "+1" marks) for review.
      var over = false;
      if (max != null && score !== '') {
        var nv = parseFloat(score);
        if (!isNaN(nv) && nv > max) { over = true; unsure = true; }
      }
      var norm = normalizeName(name);
      var match = null, best = 0;
      roster.forEach(function (rr) {
        var s = similarity(norm, normalizeName(rr.matchName));
        if (s > best) { best = s; match = rr; }
      });
      var status;
      if (match && best >= 0.85) status = 'exact';
      else if (match && best >= 0.6) status = 'fuzzy';
      else { match = null; status = 'nomatch'; }
      return {
        extractedName: name, score: score, unsure: unsure, over: over,
        rosterName: match ? match.name : '',
        inputEl: match ? match.inputEl : null,
        dateEl: match ? match.dateEl : null,
        saveBtn: match ? match.saveBtn : null,
        editBtn: match ? match.editBtn : null,
        graded: match ? match.graded : false,
        matchScore: best, status: status, skipped: false, done: false
      };
    });
    renderReview();
  }

  function renderReview() {
    var review = $('sse-review');
    var list = $('sse-review-list');
    review.classList.add('active');
    populateDateBox();
    list.innerHTML = '';
    var roster = getRosterRows();
    var rosterNames = roster.map(function (r) { return r.name; });

    results.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'sse-rev' + (r.skipped ? ' skip' : '') +
        (r.status === 'nomatch' ? ' nomatch' : '') + (r.status === 'fuzzy' ? ' fuzzy' : '');
      var dot = r.status === 'exact' ? '<span style="color:' + GREEN + '">\u25cf</span>'
        : r.status === 'fuzzy' ? '<span style="color:#f59e0b">\u25d0</span>'
        : '<span style="color:' + RED + '">\u25cb</span>';
      var matchTxt = r.status === 'nomatch'
        ? '<span style="color:' + RED + '">no roster match \u2014 pick below</span>'
        : '\u2192 ' + esc(r.rosterName) + ' <span style="color:#94a3b8">(' + Math.round(r.matchScore * 100) + '%)</span>'
          + (r.graded ? ' <span style="color:#94a3b8" title="Already graded \u2014 will click Edit first">\u270e</span>' : '');
      var scoreTitle = r.over
        ? 'Above the ' + currentAsg.max + '-point maximum \u2014 verify or edit'
        : (r.unsure ? 'Gemini was unsure \u2014 verify this one' : '');
      row.innerHTML =
        '<span class="sse-rev-dot">' + dot + '</span>' +
        '<input class="sse-rev-name" data-i="' + i + '" value="' + esc(r.extractedName) + '" placeholder="name">' +
        '<span class="sse-rev-match" title="' + esc(r.rosterName) + '">' + matchTxt + '</span>' +
        '<input class="sse-rev-score' + (r.unsure ? ' unsure' : '') + '" data-i="' + i + '" value="' + esc(r.score) + '" placeholder="\u2014"' +
          (scoreTitle ? ' title="' + esc(scoreTitle) + '"' : '') + '>' +
        '<button class="sse-rev-skip" data-i="' + i + '" title="' + (r.skipped ? 'Un-skip' : 'Skip') + '">' + (r.skipped ? '\u21ba' : '\u2715') + '</button>';
      list.appendChild(row);

      if (r.status === 'nomatch' || r.status === 'fuzzy') {
        var picker = document.createElement('div');
        picker.className = 'sse-rev-picker';
        var sel = document.createElement('select');
        sel.setAttribute('data-i', i);
        sel.innerHTML = '<option value="">\u2014 assign to roster student \u2014</option>' +
          rosterNames.map(function (n) {
            return '<option value="' + esc(n) + '"' + (n === r.rosterName ? ' selected' : '') + '>' + esc(n) + '</option>';
          }).join('');
        sel.addEventListener('change', function () {
          var picked = sel.value;
          if (!picked) {
            results[i].rosterName = ''; results[i].inputEl = null; results[i].saveBtn = null;
            results[i].dateEl = null;
            results[i].editBtn = null; results[i].graded = false; results[i].status = 'nomatch';
          } else {
            var rr = roster.filter(function (x) { return x.name === picked; })[0];
            results[i].rosterName = picked; results[i].inputEl = rr.inputEl; results[i].saveBtn = rr.saveBtn;
            results[i].dateEl = rr.dateEl;
            results[i].editBtn = rr.editBtn; results[i].graded = rr.graded;
            results[i].status = 'exact'; results[i].matchScore = 1;
          }
          renderReview();
        });
        picker.appendChild(sel);
        list.appendChild(picker);
      }
    });

    list.querySelectorAll('.sse-rev-name').forEach(function (inp) {
      inp.addEventListener('input', function (e) { results[parseInt(e.target.dataset.i, 10)].extractedName = e.target.value; });
    });
    list.querySelectorAll('.sse-rev-score').forEach(function (inp) {
      inp.addEventListener('input', function (e) {
        var idx = parseInt(e.target.dataset.i, 10);
        results[idx].score = e.target.value;
        // Re-evaluate the over-max flag live as the user edits.
        if (currentAsg.max != null) {
          var nv = parseFloat(e.target.value);
          results[idx].over = (!isNaN(nv) && nv > currentAsg.max);
        }
      });
    });
    list.querySelectorAll('.sse-rev-skip').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var i = parseInt(e.currentTarget.dataset.i, 10);
        results[i].skipped = !results[i].skipped;
        renderReview();
      });
    });

    // A row is enterable if it's matched (has an input OR is a graded row we can Edit),
    // not skipped, has a score, and isn't already done.
    var ready = results.filter(function (r) {
      return !r.skipped && !r.done && r.score !== '' && (r.inputEl || r.graded);
    }).length;
    var unsure = results.filter(function (r) { return r.unsure && !r.skipped; }).length;
    var asgTxt = '';
    if (currentAsg && currentAsg.type && currentAsg.type !== 'unknown') {
      var nice = currentAsg.type === 'quiz' ? 'Quiz' : currentAsg.type === 'block' ? 'Block exam' : 'Final exam';
      asgTxt = nice + ' /' + currentAsg.max + ' \u00b7 ';
    }
    $('sse-review-count').textContent = asgTxt + ready + ' ready' + (unsure ? ' \u00b7 ' + unsure + ' unsure' : '');
    if (typeof demoActive === 'undefined' || !demoActive) $('sse-apply').disabled = ready === 0;
  }

  $('sse-rematch').addEventListener('click', function () {
    var extracted = results.map(function (r) { return { name: r.extractedName, score: r.score, unsure: r.unsure }; });
    buildReview(extracted, currentAsg);
  });

  $('sse-apply').addEventListener('click', applyScores);

  async function applyScores() {
    var toApply = results.filter(function (r) {
      return !r.skipped && !r.done && r.score !== '' && (r.inputEl || r.graded);
    });
    if (toApply.length === 0) return;

    var dateInputEl = $('sse-date-input');
    var gradeDate = (dateInputEl && dateInputEl.value) || '';  // ISO yyyy-mm-dd
    var hasDateFields = toApply.some(function (r) { return !!r.dateEl; });
    if (!gradeDate && hasDateFields) {
      if (!confirm('No grade date is set, so the system may fall back to today\u2019s date.\n\nLeave it blank and continue anyway?')) return;
    }

    var dateMsg = gradeDate ? ' on ' + gradeDate : '';
    if (!confirm('Enter ' + toApply.length + ' score(s)' + dateMsg + ' into the gradebook now?\n\nMake sure you have reviewed every name, score, and the date.')) return;

    var logEl = $('sse-log');
    logEl.classList.add('active');
    addLog(logEl, '\u2500\u2500\u2500 Entering scores' + (gradeDate ? ' \u00b7 date ' + gradeDate : '') + ' \u2500\u2500\u2500', 'info');

    var saved = 0;
    for (var i = 0; i < toApply.length; i++) {
      var r = toApply[i];
      try {
        // Already-graded rows show "N pts" + Edit and have no input until Edit is clicked.
        if (!r.inputEl && r.graded && r.editBtn) {
          r.editBtn.click();
          // Wait for the input + Save button to appear in that row.
          for (var w = 0; w < 12 && !r.inputEl; w++) {
            await sleep(120);
            var rr = r.rowEl || (r.editBtn.closest && r.editBtn.closest('tr'));
            if (rr) {
              r.inputEl = rr.querySelector('input[type="number"]');
              r.dateEl = rr.querySelector('input[type="date"]');
              r.saveBtn = rr.querySelector('button.btn-primary');
            }
          }
        }
        if (!r.inputEl) {
          addLog(logEl, '\u26a0 ' + r.rosterName + ' \u2192 ' + r.score + ' (no score field found)', 'warn');
          continue;
        }
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        // Set the grade date (the assignment's due date) so it isn't left blank / defaulted to today.
        if (gradeDate && r.dateEl) {
          setter.call(r.dateEl, gradeDate);
          r.dateEl.dispatchEvent(new Event('input', { bubbles: true }));
          r.dateEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        setter.call(r.inputEl, r.score);
        r.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        r.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        r.inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        await sleep(150);
        if (r.saveBtn && !r.saveBtn.disabled) {
          r.saveBtn.click(); r.done = true; saved++;
          addLog(logEl, '\u2713 ' + r.rosterName + ' \u2192 ' + r.score + (gradeDate ? ' (' + gradeDate + ')' : ''), 'ok');
        } else {
          await sleep(350);
          if (r.saveBtn && !r.saveBtn.disabled) {
            r.saveBtn.click(); r.done = true; saved++;
            addLog(logEl, '\u2713 ' + r.rosterName + ' \u2192 ' + r.score, 'ok');
          } else {
            addLog(logEl, '\u26a0 ' + r.rosterName + ' \u2192 ' + r.score + ' (Save button disabled)', 'warn');
          }
        }
        await sleep(120);
      } catch (ex) {
        addLog(logEl, '\u2717 ' + r.rosterName + ': ' + ex.message, 'err');
      }
    }
    addLog(logEl, '\u2500\u2500\u2500 Done: ' + saved + '/' + toApply.length + ' entered \u2500\u2500\u2500', saved === toApply.length ? 'ok' : 'warn');
    renderReview();

    // If every attempted score saved cleanly, let the user see the result briefly,
    // then clear the UI and close the panel. If any were skipped/failed, stay open.
    if (saved === toApply.length && saved > 0) {
      await sleep(1800);
      clearAll();
      closePanel();
    }
  }

  // Reset the panel to a fresh state: no files, no review, no progress/log.
  function clearAll() {
    files.length = 0;
    results = [];
    renderFiles();
    updateReadBtn();
    var review = $('sse-review');
    if (review) review.classList.remove('active');
    var list = $('sse-review-list'); if (list) list.innerHTML = '';
    var count = $('sse-review-count'); if (count) count.textContent = '';
    var di = $('sse-date-input'); if (di) di.value = '';  // re-pull due date on next read
    var log = $('sse-log'); if (log) { log.innerHTML = ''; log.classList.remove('active'); }
    var prog = $('sse-progress'); if (prog) prog.classList.remove('active');
    var fill = $('sse-prog-fill'); if (fill) fill.style.width = '0%';
    var label = $('sse-prog-label'); if (label) label.textContent = 'Reading\u2026';
  }

  // ── Small UI helpers ─────────────────────────────────────────────────────────────
  function addLog(container, msg, type) {
    var d = document.createElement('div');
    d.className = 'sse-log-' + type;
    d.textContent = msg;
    container.appendChild(d);
    container.scrollTop = container.scrollHeight;
  }
  function setMsg(text, color) {
    var m = $('sse-msg');
    m.textContent = text || '';
    m.style.color = color || '';
  }

  // ── Guided tour (navy spotlight, live-tracked) ─────────────────────────────────────
  var TOUR_STEPS = [
    { sel: '#sse-keybtn', title: 'Gemini API key', body: 'Click this key button to paste your Gemini key. It is stored locally on this machine via Tampermonkey and sent only to Google to read the files. The model is fixed to ' + MODEL + '.' },
    { sel: '#sse-drop', title: 'Upload scantrons', body: 'Click or drag in scantron photos or PDFs. A PDF can hold many students across pages; each file is read in one call.' },
    { sel: '#sse-read', title: 'Read scantrons', body: 'Sends each file to Gemini, which returns each student name and the score printed on the sheet.' },
    { sel: '#sse-review', title: 'You review everything', demo: true, body: 'After reading, each student appears here with their name and score (example rows shown). Nothing is entered until you confirm. Rows Gemini was unsure about are highlighted amber \u2014 fix any wrong name or score first.' },
    { sel: '#sse-apply', title: 'Confirm & enter scores', demo: true, body: 'Open the quiz page first so the roster loads, then this types each reviewed score into the matching student row and saves it. (The example rows below are just a preview.)' },
    { sel: '#sse-help', title: 'Replay anytime', body: 'Click this ? button whenever you want to see this tour again.' }
  ];
  var tourIdx = 0;
  var tourRing = null, tourTip = null, tourTarget = null, tourRaf = 0, tourTracking = false;

  // Demo (sample) review rows shown during steps 4-5 so the spotlight has a
  // real, visible target and the user can see what reviewed data looks like.
  var demoActive = false;
  var savedResults = null;
  function SAMPLE_ROWS() {
    return [
      { extractedName: 'Carson Bates',     score: '9',  unsure: false, rosterName: 'Bates, Carson',     inputEl: null, saveBtn: null, matchScore: 1,    status: 'exact',   skipped: false, done: false },
      { extractedName: 'Elizabeth Soria',  score: '7',  unsure: false, rosterName: 'Soria, Elizabeth',  inputEl: null, saveBtn: null, matchScore: 1,    status: 'exact',   skipped: false, done: false },
      { extractedName: 'Isaac Decaen',     score: '8',  unsure: true,  rosterName: 'Decaen, Isaac',     inputEl: null, saveBtn: null, matchScore: 0.95, status: 'fuzzy',   skipped: false, done: false }
    ];
  }
  function enterDemo() {
    if (demoActive) return;
    demoActive = true;
    savedResults = results;
    results = SAMPLE_ROWS();
    renderReview();
    // Samples are a preview only — never let Apply fire on them.
    $('sse-apply').disabled = true;
  }
  function exitDemo() {
    if (!demoActive) return;
    demoActive = false;
    results = savedResults || [];
    savedResults = null;
    if (results.length) {
      renderReview();
    } else {
      $('sse-review').classList.remove('active');
      $('sse-review-list').innerHTML = '';
      $('sse-review-count').textContent = '';
    }
  }

  function startTour() {
    if (!backdrop.classList.contains('open')) openPanel();
    tourIdx = 0;
    buildTourEls();
    showTourStep();
  }

  function buildTourEls() {
    if (tourRing) return;
    // Ring = fixed box with a massive box-shadow that dims everything outside it.
    tourRing = document.createElement('div');
    tourRing.className = 'sse-tour-el';
    tourRing.style.cssText =
      'position:fixed;z-index:2147483000;border-radius:8px;pointer-events:none;' +
      'border:3px solid ' + NAVY + ';box-shadow:0 0 0 9999px rgba(10,20,35,0.55);' +
      'transition:top .25s ease,left .25s ease,width .25s ease,height .25s ease;';
    document.body.appendChild(tourRing);

    tourTip = document.createElement('div');
    tourTip.className = 'sse-tour-el';
    tourTip.style.cssText =
      'position:fixed;z-index:2147483003;max-width:300px;background:#fff;border:2px solid ' + NAVY +
      ';border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,0.3);font-family:Arial,Helvetica,sans-serif;' +
      'overflow:hidden;transition:top .25s ease,left .25s ease;';
    document.body.appendChild(tourTip);

    window.addEventListener('scroll', positionTour, true); // capture = catch inner scrolls too
    window.addEventListener('resize', positionTour);
  }

  function clearTour() {
    tourTracking = false;
    if (tourRaf) { cancelAnimationFrame(tourRaf); tourRaf = 0; }
    window.removeEventListener('scroll', positionTour, true);
    window.removeEventListener('resize', positionTour);
    if (tourRing) { tourRing.remove(); tourRing = null; }
    if (tourTip) { tourTip.remove(); tourTip = null; }
    tourTarget = null;
    exitDemo();
  }

  function showTourStep() {
    if (tourIdx < 0 || tourIdx >= TOUR_STEPS.length) { clearTour(); return; }
    var step = TOUR_STEPS[tourIdx];
    if (step.sel === '#sse-keybtn') { $('sse-key-card').style.display = 'block'; refreshKeyCard(); }
    // Steps that point at the review section need it populated & visible.
    if (step.demo) { enterDemo(); } else { exitDemo(); }
    tourTarget = document.querySelector(step.sel);

    // Tooltip content for this step
    tourTip.innerHTML =
      '<div style="background:' + NAVY + ';color:#fff;padding:9px 12px;font-size:14px;font-weight:bold;">' + (tourIdx + 1) + '. ' + step.title + '</div>' +
      '<div style="padding:12px;font-size:13px;color:#222;line-height:1.45;">' + step.body + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px 12px;">' +
        '<span style="font-size:11px;color:#888;">Step ' + (tourIdx + 1) + ' of ' + TOUR_STEPS.length + '</span><span>' +
        (tourIdx > 0 ? '<button id="sse-tour-prev" style="background:#e2e8f0;border:none;border-radius:6px;padding:6px 12px;margin-right:6px;cursor:pointer;font-size:12px;">Back</button>' : '') +
        '<button id="sse-tour-skip" style="background:#e2e8f0;border:none;border-radius:6px;padding:6px 12px;margin-right:6px;cursor:pointer;font-size:12px;">Skip</button>' +
        '<button id="sse-tour-next" style="background:' + NAVY + ';color:#fff;border:none;border-radius:6px;padding:6px 14px;cursor:pointer;font-size:12px;">' +
          (tourIdx === TOUR_STEPS.length - 1 ? 'Done' : 'Next') + '</button></span></div>';

    tourTip.querySelector('#sse-tour-next').addEventListener('click', function () {
      if (tourIdx === TOUR_STEPS.length - 1) clearTour(); else { tourIdx++; showTourStep(); }
    });
    tourTip.querySelector('#sse-tour-skip').addEventListener('click', clearTour);
    var pv = tourTip.querySelector('#sse-tour-prev');
    if (pv) pv.addEventListener('click', function () { tourIdx--; showTourStep(); });

    // Bring the target into view, then track it live until it settles.
    if (tourTarget && tourTarget.scrollIntoView) {
      tourTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    startTracking();
  }

  // Keep the ring + tooltip glued to the target. Runs every frame for ~500ms
  // (covers smooth-scroll settling) and also on scroll/resize events.
  function startTracking() {
    tourTracking = true;
    var start = performance.now();
    function frame(now) {
      positionTour();
      if (tourTracking && now - start < 600) {
        tourRaf = requestAnimationFrame(frame);
      } else {
        tourRaf = 0;
      }
    }
    if (tourRaf) cancelAnimationFrame(tourRaf);
    tourRaf = requestAnimationFrame(frame);
  }

  function positionTour() {
    if (!tourRing || !tourTip) return;
    var pad = 5;
    var r;
    if (tourTarget && document.body.contains(tourTarget)) {
      r = tourTarget.getBoundingClientRect();
    } else {
      // No target: hide ring offscreen, center tooltip
      tourRing.style.width = '0px'; tourRing.style.height = '0px';
      tourRing.style.top = '-9999px'; tourRing.style.left = '-9999px';
      tourTip.style.top = '80px'; tourTip.style.left = '80px';
      return;
    }
    tourRing.style.top = (r.top - pad) + 'px';
    tourRing.style.left = (r.left - pad) + 'px';
    tourRing.style.width = (r.width + pad * 2) + 'px';
    tourRing.style.height = (r.height + pad * 2) + 'px';

    // Tooltip placement: try below the target; if it would run off the bottom,
    // place it beside the target (left, then right) so it doesn't cover the
    // highlighted content; only as a last resort put it above.
    var tipH = tourTip.offsetHeight || 180;
    var tipW = tourTip.offsetWidth || 300;
    var gap = 12, m = 8;
    var top, left;

    if (r.bottom + gap + tipH <= window.innerHeight - m) {
      // below
      top = r.bottom + gap;
      left = clamp(r.left, m, window.innerWidth - tipW - m);
    } else if (r.left - gap - tipW >= m) {
      // left side, vertically aligned to the target's top
      left = r.left - gap - tipW;
      top = clamp(r.top, m, window.innerHeight - tipH - m);
    } else if (r.right + gap + tipW <= window.innerWidth - m) {
      // right side
      left = r.right + gap;
      top = clamp(r.top, m, window.innerHeight - tipH - m);
    } else {
      // above
      top = Math.max(m, r.top - gap - tipH);
      left = clamp(r.left, m, window.innerWidth - tipW - m);
    }
    tourTip.style.top = top + 'px';
    tourTip.style.left = left + 'px';
  }

  // ── Inline button next to the "Student Grades" heading ─────────────────────────────
  // The Angular _ngcontent attr changes per build, so match the heading by text.
  function findGradesHeading() {
    var hs = document.querySelectorAll('h5');
    for (var i = 0; i < hs.length; i++) {
      if ((hs[i].textContent || '').trim() === 'Student Grades') return hs[i];
    }
    return null;
  }

  function injectInlineButton() {
    if (document.getElementById('sse-inline-btn')) return;
    var heading = findGradesHeading();
    if (!heading) return;
    var btn = document.createElement('button');
    btn.id = 'sse-inline-btn';
    btn.type = 'button';
    btn.title = 'Scantron Score Entry';
    btn.innerHTML = 'Upload Scantron';
    btn.addEventListener('click', openPanel);
    heading.appendChild(btn); // sits to the right of the heading text
  }

  // The grade view is rendered/replaced by Angular as assignments are clicked,
  // so watch the DOM and re-inject whenever the heading reappears.
  injectInlineButton();
  var sseObserver = new MutationObserver(function () { injectInlineButton(); });
  sseObserver.observe(document.body, { childList: true, subtree: true });

  // ── Init ──────────────────────────────────────────────────────────────────────────
  refreshKeyCard();

})();