// ==UserScript==
// @name         Gradebook Excel Importer
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Paste full gradebook from Excel; auto-fills + saves grades per assignment page. Batch mode fills all assignments automatically.
// @author       You
// @match        https://admin2025.otsystems.net/training/classroom/session/*/grades/*
// @match        https://admin2025.otsystems.net/training/classroom/session/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  function save(key, val) { try { GM_setValue(key, JSON.stringify(val)); } catch(e) {} }
  function load(key, def) {
    try { const v = GM_getValue(key, null); return v !== null ? JSON.parse(v) : def; }
    catch { return def; }
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

    :root {
      --bg0: #0d0f14;
      --bg1: #13161e;
      --bg2: #1a1e29;
      --bg3: #222737;
      --border: #2c3145;
      --green: #00e887;
      --green-dim: rgba(0,232,135,0.12);
      --amber: #f0b429;
      --amber-dim: rgba(240,180,41,0.12);
      --red: #ff5a5a;
      --red-dim: rgba(255,90,90,0.12);
      --blue: #60a5fa;
      --blue-dim: rgba(96,165,250,0.12);
      --text: #dde4f0;
      --text-muted: #5a6380;
      --text-sub: #8892a8;
      --mono: 'IBM Plex Mono', monospace;
      --sans: 'IBM Plex Sans', sans-serif;
    }

    #gei-toggle-btn {
      position: fixed; bottom: 28px; right: 28px; z-index: 999998;
      width: 48px; height: 48px; border-radius: 12px; border: none;
      background: var(--green); color: var(--bg0);
      font-size: 20px; cursor: pointer;
      box-shadow: 0 0 0 0 rgba(0,232,135,0.4);
      animation: gei-pulse-ring 2.5s ease-out infinite;
      display: flex; align-items: center; justify-content: center;
      transition: transform .15s, filter .15s;
      font-family: var(--mono);
    }
    #gei-toggle-btn:hover { transform: scale(1.07); filter: brightness(1.1); }
    @keyframes gei-pulse-ring {
      0%   { box-shadow: 0 0 0 0 rgba(0,232,135,0.35); }
      70%  { box-shadow: 0 0 0 12px rgba(0,232,135,0); }
      100% { box-shadow: 0 0 0 0 rgba(0,232,135,0); }
    }
    #gei-toggle-btn .gei-dot {
      position: absolute; top: -4px; right: -4px; width: 11px; height: 11px;
      background: var(--amber); border-radius: 50%; border: 2px solid var(--bg0); display: none;
    }
    #gei-toggle-btn.has-data .gei-dot { display: block; }

    #gei-panel {
      position: fixed; bottom: 28px; right: 28px; z-index: 999999;
      width: 560px; height: 660px; min-width: 380px; min-height: 340px;
      display: flex; flex-direction: column;
      background: var(--bg0); border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03) inset;
      font-family: var(--mono); font-size: 12px; color: var(--text);
      overflow: hidden; transition: opacity .2s;
    }
    #gei-panel.gei-hidden { opacity: 0; pointer-events: none; }

    .gei-resize { position: absolute; z-index: 10; }
    .gei-resize-e  { top:12px; right:-4px; width:8px; height:calc(100% - 24px); cursor:ew-resize; }
    .gei-resize-s  { bottom:-4px; left:12px; height:8px; width:calc(100% - 24px); cursor:ns-resize; }
    .gei-resize-w  { top:12px; left:-4px; width:8px; height:calc(100% - 24px); cursor:ew-resize; }
    .gei-resize-se { bottom:-4px; right:-4px; width:16px; height:16px; cursor:se-resize; }
    .gei-resize-sw { bottom:-4px; left:-4px; width:16px; height:16px; cursor:sw-resize; }
    .gei-resize-se::after {
      content:''; position:absolute; bottom:5px; right:5px;
      width:5px; height:5px;
      border-right:2px solid var(--border); border-bottom:2px solid var(--border);
    }

    #gei-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px 12px 18px;
      background: var(--bg1); border-bottom: 1px solid var(--border);
      cursor: move; user-select: none; flex-shrink: 0;
    }
    #gei-header-left { display: flex; align-items: center; gap: 10px; }
    #gei-header-left .gei-logo {
      width: 28px; height: 28px; background: var(--green); border-radius: 8px;
      display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;
    }
    #gei-header h3 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--text); font-family: var(--mono); }
    #gei-header-sub { font-size: 10px; color: var(--text-muted); font-family: var(--mono); margin-top: 1px; }
    #gei-btn-minimize {
      background: none; border: 1px solid var(--border); color: var(--text-muted);
      border-radius: 6px; padding: 4px 9px; font-size: 11px; cursor: pointer;
      font-family: var(--mono); transition: all .15s; flex-shrink: 0;
    }
    #gei-btn-minimize:hover { border-color: var(--red); color: var(--red); }

    .gei-tabs {
      display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0;
      background: var(--bg1);
    }
    .gei-tab {
      flex: 1; padding: 10px 0; text-align: center; font-size: 10px; font-weight: 600;
      letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted);
      cursor: pointer; border-bottom: 2px solid transparent; transition: all .15s;
      font-family: var(--mono);
    }
    .gei-tab.active { color: var(--green); border-bottom-color: var(--green); }
    .gei-tab:hover:not(.active) { color: var(--text-sub); }
    .gei-tab .tab-badge {
      display: inline-block; margin-left: 4px; padding: 1px 5px; border-radius: 8px;
      font-size: 9px; background: var(--blue-dim); color: var(--blue);
      border: 1px solid rgba(96,165,250,0.2); vertical-align: middle;
    }

    #gei-panel-scroll { flex: 1; overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
    .gei-pane { padding: 16px 18px; display: none; flex: 1; min-height: 0; box-sizing: border-box; overflow-y: auto; flex-direction: column; }
    .gei-pane.active { display: flex; }

    .gei-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 6px; font-family: var(--mono); }
    .gei-hint  { font-size: 11px; color: var(--text-muted); line-height: 1.6; }

    .gei-paste-area {
      width: 100%; box-sizing: border-box; background: var(--bg1);
      border: 2px dashed var(--border); border-radius: 10px; color: var(--text);
      font-family: var(--mono); font-size: 11px; padding: 12px;
      resize: none; min-height: 90px; outline: none; transition: border-color .2s, background .2s;
    }
    .gei-paste-area:focus { border-color: var(--green); border-style: solid; background: var(--bg0); }

    .gei-select {
      width: 100%; background: var(--bg2); border: 1px solid var(--border); color: var(--text);
      border-radius: 8px; padding: 8px 10px; font-size: 11px; font-family: var(--mono); outline: none;
      transition: border-color .15s;
    }
    .gei-select:focus { border-color: var(--green); }
    .gei-select option { background: var(--bg1); }

    .gei-pill {
      display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 600;
      font-family: var(--mono); letter-spacing: .05em; white-space: nowrap;
    }
    .gei-pill-green { background: var(--green-dim); color: var(--green); border: 1px solid rgba(0,232,135,0.2); }
    .gei-pill-amber { background: var(--amber-dim); color: var(--amber); border: 1px solid rgba(240,180,41,0.2); }
    .gei-pill-red   { background: var(--red-dim);   color: var(--red);   border: 1px solid rgba(255,90,90,0.2); }
    .gei-pill-blue  { background: var(--blue-dim);  color: var(--blue);  border: 1px solid rgba(96,165,250,0.2); }
    .gei-pill-muted { background: var(--bg3);        color: var(--text-sub); border: 1px solid var(--border); }

    .gei-card { background: var(--bg1); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }

    .gei-btn {
      width: 100%; padding: 11px; border-radius: 10px; border: none;
      font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .1em;
      text-transform: uppercase; cursor: pointer; transition: all .18s;
    }
    .gei-btn-ghost { background: var(--bg2); color: var(--text-sub); border: 1px solid var(--border); }
    .gei-btn-ghost:hover { border-color: var(--text-sub); color: var(--text); }
    .gei-btn-green { background: var(--green); color: var(--bg0); }
    .gei-btn-green:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,232,135,0.3); }
    .gei-btn-green:disabled { opacity: .35; cursor: not-allowed; transform: none; box-shadow: none; }
    .gei-btn-blue { background: var(--blue); color: var(--bg0); }
    .gei-btn-blue:hover { filter: brightness(1.08); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(96,165,250,0.3); }
    .gei-btn-blue:disabled { opacity: .35; cursor: not-allowed; transform: none; box-shadow: none; }
    .gei-btn-sm {
      padding: 5px 12px; font-size: 10px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--bg2); color: var(--text-sub); font-family: var(--mono); cursor: pointer; transition: all .15s;
    }
    .gei-btn-sm:hover { border-color: var(--green); color: var(--green); }
    .gei-btn-sm.active { border-color: var(--green); color: var(--green); background: var(--green-dim); }

    .gei-divider { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
    .gei-info-box { background: var(--bg1); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 11px; color: var(--text-sub); margin-top: 8px; line-height: 1.6; }

    /* ── APPLY PANE ── */
    #gei-assign-banner {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 10px;
      padding: 10px 14px; display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    #gei-assign-name { font-size: 12px; font-weight: 600; color: var(--text); font-family: var(--mono); flex: 1; }
    #gei-col-row { display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-top: 10px; }
    #gei-col-row .gei-label { margin: 0; white-space: nowrap; }
    #gei-col-row .gei-select { flex: 1; }
    #gei-filter-bar { display: flex; gap: 6px; align-items: center; flex-shrink: 0; margin-top: 10px; }
    #gei-filter-search {
      flex: 1; background: var(--bg2); border: 1px solid var(--border); color: var(--text);
      border-radius: 7px; padding: 6px 10px; font-size: 11px; font-family: var(--mono); outline: none;
    }
    #gei-filter-search:focus { border-color: var(--green); }
    #gei-filter-search::placeholder { color: var(--text-muted); }
    .gei-filter-btns { display: flex; gap: 4px; }
    #gei-stats-bar {
      display: flex; gap: 8px; align-items: center; flex-shrink: 0;
      margin-top: 8px; padding: 8px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
    }
    .gei-stat { display: flex; align-items: center; gap: 5px; font-size: 10px; }
    .gei-stat-num { font-weight: 700; font-size: 12px; font-family: var(--mono); }
    .gei-stat-ok   .gei-stat-num { color: var(--green); }
    .gei-stat-warn .gei-stat-num { color: var(--amber); }
    .gei-stat-err  .gei-stat-num { color: var(--red); }
    .gei-stat-sep { color: var(--border); font-size: 14px; }
    .gei-stat-label { color: var(--text-muted); }
    #gei-grade-list { flex: 1; overflow-y: auto; min-height: 0; }
    .gei-grade-row {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px; border-bottom: 1px solid var(--bg2);
      transition: background .1s;
    }
    .gei-grade-row:hover { background: var(--bg1); }
    .gei-grade-row.gei-row-skipped { opacity: .4; }
    .gei-grade-row.gei-row-done { opacity: .55; }
    .gei-grade-row.gei-row-done .gei-row-name { text-decoration: line-through; text-decoration-color: var(--green); }
    .gei-row-status { flex-shrink: 0; width: 22px; display: flex; justify-content: center; }
    .gei-row-name { flex: 1; font-size: 11px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .gei-row-match { font-size: 10px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0.8; min-width: 0; }
    .gei-row-grade-wrap { flex-shrink: 0; display: flex; align-items: center; gap: 4px; }
    .gei-row-grade {
      width: 64px; background: var(--bg2); border: 1px solid var(--border); color: var(--text);
      border-radius: 6px; padding: 4px 8px; font-size: 12px; font-family: var(--mono);
      text-align: center; outline: none; transition: border-color .15s, background .15s;
    }
    .gei-row-grade:focus { border-color: var(--green); background: var(--bg0); }
    .gei-row-skip-btn {
      background: none; border: none; color: var(--text-muted); cursor: pointer;
      font-size: 14px; padding: 2px 4px; border-radius: 4px; transition: color .15s; line-height: 1;
    }
    .gei-row-skip-btn:hover { color: var(--red); }
    .gei-grade-row.gei-row-skipped .gei-row-skip-btn { color: var(--amber); }
    #gei-grade-empty { display: none; text-align: center; padding: 32px 20px; color: var(--text-muted); font-size: 11px; line-height: 1.8; }
    #gei-action-bar { flex-shrink: 0; padding: 10px 0 0 0; border-top: 1px solid var(--border); margin-top: 6px; }
    #gei-action-inner { display: flex; gap: 8px; align-items: center; }
    #gei-btn-apply-sel {
      padding: 10px 14px; border-radius: 9px; border: 1px solid var(--border);
      background: var(--bg2); color: var(--text-sub);
      font-family: var(--mono); font-size: 11px; font-weight: 600;
      text-transform: uppercase; cursor: pointer; transition: all .2s; white-space: nowrap;
    }
    #gei-btn-apply-sel:hover { border-color: var(--green); color: var(--green); }
    #gei-btn-apply-sel:disabled { opacity: .35; cursor: not-allowed; }
    #gei-btn-apply-all {
      flex: 1; padding: 10px; border-radius: 9px; border: none;
      background: var(--green); color: var(--bg0);
      font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; cursor: pointer; transition: all .2s;
    }
    #gei-btn-apply-all:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,232,135,0.3); }
    #gei-btn-apply-all:disabled { opacity: .35; cursor: not-allowed; transform: none; box-shadow: none; }
    #gei-progress-overlay {
      display: none; flex-direction: column; align-items: center; justify-content: center;
      padding: 24px; gap: 12px; flex: 1;
    }
    #gei-progress-overlay.active { display: flex; }
    #gei-progress-bar-wrap { width: 100%; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
    #gei-progress-fill { height: 100%; background: linear-gradient(90deg, var(--green), #00c96e); border-radius: 3px; transition: width .3s; width: 0%; }
    #gei-progress-label { font-size: 11px; color: var(--text-sub); font-family: var(--mono); text-align: center; }
    #gei-log {
      width: 100%; max-height: 160px; overflow-y: auto;
      background: var(--bg2); border-radius: 8px; padding: 8px 10px; box-sizing: border-box;
      font-size: 10px; line-height: 1.7;
    }
    .gei-log-line { }
    .gei-log-ok   { color: var(--green); }
    .gei-log-warn { color: var(--amber); }
    .gei-log-err  { color: var(--red);   }
    .gei-log-info { color: var(--blue);  }

    /* ── BATCH PANE ── */
    #pane-batch { overflow: hidden; }

    #batch-no-data { color: var(--red); }

    #batch-body { display: none; flex-direction: column; flex: 1; min-height: 0; }

    /* Summary bar */
    #batch-summary-bar {
      display: flex; gap: 6px; align-items: center; flex-shrink: 0;
      padding: 8px 0; border-bottom: 1px solid var(--border); margin-bottom: 6px; flex-wrap: wrap;
    }
    .batch-stat { font-size: 10px; color: var(--text-muted); }
    .batch-stat strong { font-family: var(--mono); }
    .batch-stat-ok   strong { color: var(--green); }
    .batch-stat-warn strong { color: var(--amber); }
    .batch-stat-err  strong { color: var(--red);   }

    /* Assignment list */
    #batch-assign-list { flex: 1; overflow-y: auto; min-height: 0; }

    .batch-row {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-bottom: 1px solid var(--bg2);
      transition: background .1s; cursor: default;
    }
    .batch-row:hover { background: var(--bg1); }
    .batch-row.batch-row-active { background: var(--blue-dim); border-left: 2px solid var(--blue); }
    .batch-row.batch-row-done   { opacity: .5; }
    .batch-row.batch-row-done .batch-row-name { text-decoration: line-through; text-decoration-color: var(--green); }
    .batch-row.batch-row-skipped { opacity: .35; }
    .batch-row.batch-row-error { border-left: 2px solid var(--red); }

    .batch-row-icon { flex-shrink: 0; width: 18px; text-align: center; font-size: 12px; }
    .batch-row-name { flex: 1; font-size: 11px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .batch-row-col  { font-size: 10px; flex: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .batch-row-col-ok   { color: var(--green); }
    .batch-row-col-warn { color: var(--amber); }
    .batch-row-col-err  { color: var(--red); }

    .batch-col-select {
      flex: 0.7; background: var(--bg2); border: 1px solid var(--border); color: var(--text);
      border-radius: 5px; padding: 3px 6px; font-size: 10px; font-family: var(--mono); outline: none;
      min-width: 0;
    }
    .batch-col-select:focus { border-color: var(--green); }
    .batch-col-select option { background: var(--bg1); }

    .batch-skip-btn {
      background: none; border: none; color: var(--text-muted); cursor: pointer;
      font-size: 13px; padding: 2px 4px; border-radius: 4px; transition: color .15s; line-height: 1;
      flex-shrink: 0;
    }
    .batch-skip-btn:hover { color: var(--red); }
    .batch-row-skipped .batch-skip-btn { color: var(--amber); }

    /* Batch progress */
    #batch-progress-section {
      display: none; flex-direction: column; gap: 10px; flex-shrink: 0;
      padding: 12px 0 0 0; border-top: 1px solid var(--border); margin-top: 6px;
    }
    #batch-progress-section.active { display: flex; }
    #batch-prog-bar-wrap { width: 100%; height: 8px; background: var(--bg3); border-radius: 4px; overflow: hidden; }
    #batch-prog-fill { height: 100%; background: linear-gradient(90deg, var(--blue), #3b82f6); border-radius: 4px; transition: width .4s; width: 0%; }
    #batch-prog-label { font-size: 11px; color: var(--text-sub); font-family: var(--mono); }
    #batch-log {
      max-height: 100px; overflow-y: auto; background: var(--bg2); border-radius: 8px;
      padding: 8px 10px; font-size: 10px; line-height: 1.7; display: none;
    }
    #batch-log.active { display: block; }

    /* Batch action bar */
    #batch-action-bar {
      flex-shrink: 0; padding: 10px 0 0 0; border-top: 1px solid var(--border); margin-top: 6px;
      display: flex; gap: 8px;
    }
    #batch-btn-scan {
      padding: 10px 14px; border-radius: 9px; border: 1px solid var(--border);
      background: var(--bg2); color: var(--text-sub);
      font-family: var(--mono); font-size: 11px; font-weight: 600; text-transform: uppercase;
      cursor: pointer; transition: all .2s; white-space: nowrap;
    }
    #batch-btn-scan:hover { border-color: var(--blue); color: var(--blue); }
    #batch-btn-run {
      flex: 1; padding: 10px; border-radius: 9px; border: none;
      background: var(--blue); color: var(--bg0);
      font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .1em;
      text-transform: uppercase; cursor: pointer; transition: all .2s;
    }
    #batch-btn-run:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(96,165,250,0.3); }
    #batch-btn-run:disabled { opacity: .35; cursor: not-allowed; transform: none; box-shadow: none; }
    #batch-btn-stop {
      padding: 10px 14px; border-radius: 9px; border: 1px solid rgba(255,90,90,0.3);
      background: var(--bg2); color: var(--red);
      font-family: var(--mono); font-size: 11px; font-weight: 600; text-transform: uppercase;
      cursor: pointer; transition: all .2s; display: none; white-space: nowrap;
    }
    #batch-btn-stop.active { display: block; }
    #batch-btn-stop:hover { background: var(--red-dim); }

    /* ── Stored data ── */
    #gei-stored-grid {
      flex: 1; overflow: auto; margin-top: 8px;
      border: 1px solid var(--border); border-radius: 8px; min-height: 0;
    }
    #gei-stored-grid table { border-collapse: collapse; font-size: 11px; white-space: nowrap; width: 100%; }
    #gei-stored-grid thead tr { position: sticky; top: 0; z-index: 1; }
    #gei-stored-grid th { background: var(--bg2); color: var(--green); padding: 7px 10px; border-right: 1px solid var(--border); border-bottom: 2px solid var(--border); font-size: 10px; letter-spacing: .07em; text-align: left; font-weight: 700; font-family: var(--mono); }
    #gei-stored-grid td { padding: 5px 10px; border-right: 1px solid var(--bg2); border-bottom: 1px solid var(--bg2); color: var(--text-sub); }
    #gei-stored-grid tr:hover td { background: var(--bg2); }
    #gei-stored-grid td:first-child { color: var(--text); font-weight: 600; position: sticky; left: 0; background: var(--bg0); border-right: 2px solid var(--border); }
    #gei-stored-grid tr:hover td:first-child { background: var(--bg1); }
  `;
  document.head.appendChild(style);

  // ── Toggle button ─────────────────────────────────────────────────────────────
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'gei-toggle-btn';
  toggleBtn.innerHTML = '⚡<span class="gei-dot"></span>';
  toggleBtn.title = 'Grade Importer';
  document.body.appendChild(toggleBtn);

  // ── Panel HTML ────────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'gei-panel';
  panel.classList.add('gei-hidden');
  panel.innerHTML = `
    <div class="gei-resize gei-resize-e"  data-dir="e"></div>
    <div class="gei-resize gei-resize-w"  data-dir="w"></div>
    <div class="gei-resize gei-resize-s"  data-dir="s"></div>
    <div class="gei-resize gei-resize-se" data-dir="se"></div>
    <div class="gei-resize gei-resize-sw" data-dir="sw"></div>

    <div id="gei-header">
      <div id="gei-header-left">
        <div class="gei-logo">⚡</div>
        <div>
          <h3>Grade Importer</h3>
          <div id="gei-header-sub">no data loaded</div>
        </div>
      </div>
      <button id="gei-btn-minimize">✕</button>
    </div>

    <div class="gei-tabs">
      <div class="gei-tab active" data-pane="pane-paste">① Import</div>
      <div class="gei-tab" data-pane="pane-apply">② Credit</div>
      <div class="gei-tab" data-pane="pane-batch">③ Batch <span class="tab-badge">NEW</span></div>
      <div class="gei-tab" data-pane="pane-data">④ Data</div>
    </div>

    <div id="gei-panel-scroll">

      <!-- ── TAB 1: Import ── -->
      <div class="gei-pane active" id="pane-paste">
        <div class="gei-label">Paste Excel gradebook</div>
        <textarea class="gei-paste-area" id="gei-paste-area" spellcheck="false"
          placeholder="Select ALL columns in Excel (header row + all students) → Ctrl+C → click here → Ctrl+V"></textarea>
        <div class="gei-hint" style="margin-top:6px">Include the header row with student names and all assignment columns.</div>
        <div id="gei-name-col-row" style="display:none; margin-top:12px">
          <div class="gei-label">Student name column</div>
          <select class="gei-select" id="gei-col-name"></select>
        </div>
        <div id="gei-parse-info" style="display:none; margin-top:10px" class="gei-info-box"></div>
        <div style="flex:1"></div>
        <button class="gei-btn gei-btn-green" id="gei-btn-save-grid" style="display:none; margin-top:12px">
          ✓ Save Gradebook & Go to Batch →
        </button>
      </div>

      <!-- ── TAB 2: Credit (single assignment) ── -->
      <div class="gei-pane" id="pane-apply">
        <div id="gei-no-data-msg" class="gei-hint" style="color:var(--red); display:block">
          No gradebook loaded — go to tab ① first.
        </div>
        <div id="gei-apply-body" style="display:none; flex-direction:column; flex:1; min-height:0; gap:0">
          <div id="gei-assign-banner">
            <span class="gei-assign-icon">📋</span>
            <span id="gei-assign-name">Loading…</span>
            <span id="gei-assign-col-tag" class="gei-pill gei-pill-muted">—</span>
          </div>
          <div id="gei-col-row">
            <span class="gei-label">Column:</span>
            <select class="gei-select" id="gei-override-col"></select>
            <button class="gei-btn-sm" id="gei-btn-remap">↺ Rebuild</button>
          </div>
          <div id="gei-stats-bar">
            <div class="gei-stat gei-stat-ok"><span class="gei-stat-num" id="stat-ok">0</span><span class="gei-stat-label">exact</span></div>
            <span class="gei-stat-sep">·</span>
            <div class="gei-stat gei-stat-warn"><span class="gei-stat-num" id="stat-warn">0</span><span class="gei-stat-label">fuzzy</span></div>
            <span class="gei-stat-sep">·</span>
            <div class="gei-stat gei-stat-err"><span class="gei-stat-num" id="stat-err">0</span><span class="gei-stat-label">no match</span></div>
            <div style="flex:1"></div>
            <div class="gei-filter-btns">
              <button class="gei-btn-sm active" data-filter="all">All</button>
              <button class="gei-btn-sm" data-filter="unmatched">Unmatched</button>
            </div>
          </div>
          <div id="gei-filter-bar">
            <input id="gei-filter-search" type="text" placeholder="Search student…" autocomplete="off">
          </div>
          <div id="gei-grade-list"></div>
          <div id="gei-grade-empty">No students match the current filter.</div>
          <div id="gei-progress-overlay">
            <div id="gei-progress-bar-wrap"><div id="gei-progress-fill"></div></div>
            <div id="gei-progress-label">Applying…</div>
            <div id="gei-log"></div>
          </div>
          <div id="gei-action-bar">
            <div id="gei-action-inner">
              <button id="gei-btn-apply-sel" disabled>Apply Selected</button>
              <button id="gei-btn-apply-all" disabled>⚡ Apply All Matched</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── TAB 3: Batch ── -->
      <div class="gei-pane" id="pane-batch">
        <div id="batch-no-data" class="gei-hint" style="color:var(--red); display:block">
          No gradebook loaded — go to tab ① first.
        </div>

        <div id="batch-body">
          <!-- Summary bar -->
          <div id="batch-summary-bar">
            <div class="batch-stat batch-stat-ok"><strong id="bs-matched">0</strong> matched</div>
            <span style="color:var(--border)">·</span>
            <div class="batch-stat batch-stat-warn"><strong id="bs-fuzzy">0</strong> fuzzy</div>
            <span style="color:var(--border)">·</span>
            <div class="batch-stat batch-stat-err"><strong id="bs-none">0</strong> no column</div>
            <div style="flex:1"></div>
            <span class="gei-hint" style="font-size:10px" id="bs-assign-count"></span>
          </div>

          <!-- Assignment list -->
          <div id="batch-assign-list"></div>

          <!-- Progress section -->
          <div id="batch-progress-section">
            <div id="batch-prog-bar-wrap"><div id="batch-prog-fill"></div></div>
            <div id="batch-prog-label">Waiting…</div>
            <div id="batch-log"></div>
          </div>

          <!-- Action bar -->
          <div id="batch-action-bar">
            <button id="batch-btn-scan">↺ Re-scan</button>
            <button id="batch-btn-run" disabled>🚀 Run Batch Fill</button>
            <button id="batch-btn-stop">■ Stop</button>
          </div>
        </div>
      </div>

      <!-- ── TAB 4: Data ── -->
      <div class="gei-pane" id="pane-data" style="padding-bottom:0">
        <div id="gei-stored-info" class="gei-hint" style="flex-shrink:0"></div>
        <div id="gei-stored-grid"></div>
        <button class="gei-btn gei-btn-ghost" id="gei-btn-clear-data"
          style="margin-top:12px; color:var(--red); border-color:rgba(255,90,90,0.3); flex-shrink:0; margin-bottom:16px">
          🗑 Clear Stored Gradebook
        </button>
      </div>

    </div>
  `;
  document.body.appendChild(panel);

  // ── Tab switching ─────────────────────────────────────────────────────────────
  panel.querySelectorAll('.gei-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.gei-tab, .gei-pane').forEach(el => el.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.pane).classList.add('active');
      if (tab.dataset.pane === 'pane-apply') initApplyPane();
      if (tab.dataset.pane === 'pane-batch') initBatchPane();
      if (tab.dataset.pane === 'pane-data')  renderStoredData();
    });
  });

  // ── Toggle open/close ─────────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    panel.classList.remove('gei-hidden');
    toggleBtn.style.display = 'none';
  });
  document.getElementById('gei-btn-minimize').addEventListener('click', () => {
    panel.classList.add('gei-hidden');
    toggleBtn.style.display = 'flex';
  });

  // ── Draggable ─────────────────────────────────────────────────────────────────
  let dragging = false, ox = 0, oy = 0;
  document.getElementById('gei-header').addEventListener('mousedown', e => {
    dragging = true;
    const r = panel.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    panel.style.right = 'auto'; panel.style.bottom = 'auto';
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = (e.clientX - ox) + 'px';
    panel.style.top  = (e.clientY - oy) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  // ── Resizable ─────────────────────────────────────────────────────────────────
  let resizing = false, resizeDir = '', resizeStartX = 0, resizeStartY = 0;
  let resizeStartW = 0, resizeStartH = 0, resizeStartL = 0, resizeStartT = 0;
  panel.querySelectorAll('.gei-resize').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      resizing = true; resizeDir = handle.dataset.dir;
      resizeStartX = e.clientX; resizeStartY = e.clientY;
      const r = panel.getBoundingClientRect();
      resizeStartW = r.width; resizeStartH = r.height;
      resizeStartL = r.left;  resizeStartT = r.top;
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = resizeStartL + 'px'; panel.style.top = resizeStartT + 'px';
    });
  });
  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const dx = e.clientX - resizeStartX, dy = e.clientY - resizeStartY;
    const minW = 380, minH = 340;
    if (resizeDir.includes('e')) panel.style.width  = Math.max(minW, resizeStartW + dx) + 'px';
    if (resizeDir.includes('w')) {
      const newW = Math.max(minW, resizeStartW - dx);
      panel.style.width = newW + 'px';
      panel.style.left  = (resizeStartL + resizeStartW - newW) + 'px';
    }
    if (resizeDir.includes('s')) panel.style.height = Math.max(minH, resizeStartH + dy) + 'px';
  });
  document.addEventListener('mouseup', () => { resizing = false; });

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 1 — IMPORT
  // ─────────────────────────────────────────────────────────────────────────────
  let parsedRows = [];
  const pasteArea = document.getElementById('gei-paste-area');
  pasteArea.addEventListener('paste', () => setTimeout(() => processPaste(pasteArea.value), 0));
  pasteArea.addEventListener('input', () => { if (pasteArea.value.trim()) processPaste(pasteArea.value); });

  function processPaste(raw) {
    const lines = raw.trim().split(/\r?\n/);
    parsedRows = lines.map(l => l.split('\t').map(c => c.trim()));
    if (parsedRows.length < 2) { showParseInfo('Need at least a header row + 1 data row.'); return; }
    const headers = parsedRows[0];
    const dataCount = parsedRows.length - 1;
    const nameSel = document.getElementById('gei-col-name');
    nameSel.innerHTML = headers.map((h, i) => `<option value="${i}">${h || 'Col '+(i+1)}</option>`).join('');
    const nameIdx = headers.findIndex(h => /name|student/i.test(h));
    if (nameIdx >= 0) nameSel.value = nameIdx;
    document.getElementById('gei-name-col-row').style.display = 'block';
    document.getElementById('gei-btn-save-grid').style.display = 'block';
    const colList = headers.map(h => `<em style="color:var(--text)">${h||'?'}</em>`).join(', ');
    showParseInfo(`<span style="color:var(--green)">✓</span> ${dataCount} students · ${headers.length} columns<br>${colList}`);
  }

  function showParseInfo(html) {
    const el = document.getElementById('gei-parse-info');
    el.style.display = 'block'; el.innerHTML = html;
  }

  document.getElementById('gei-btn-save-grid').addEventListener('click', () => {
    if (!parsedRows.length) return;
    const nameCol = parseInt(document.getElementById('gei-col-name').value, 10);
    save('gei_rows', parsedRows);
    save('gei_headers', parsedRows[0]);
    save('gei_namecol', nameCol);
    updateToggleDot(); updateHeaderSub();
    // Jump to Batch tab
    panel.querySelectorAll('.gei-tab, .gei-pane').forEach(el => el.classList.remove('active'));
    panel.querySelector('[data-pane="pane-batch"]').classList.add('active');
    document.getElementById('pane-batch').classList.add('active');
    initBatchPane();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 2 — CREDIT (single assignment)
  // ─────────────────────────────────────────────────────────────────────────────
  let matchResults = [];
  let activeFilter = 'all';
  let searchQuery  = '';

  function initApplyPane() {
    const rows    = load('gei_rows', null);
    const headers = load('gei_headers', null);
    const nameCol = load('gei_namecol', 0);
    if (!rows || !headers) {
      document.getElementById('gei-no-data-msg').style.display = 'block';
      document.getElementById('gei-apply-body').style.display  = 'none';
      return;
    }
    document.getElementById('gei-no-data-msg').style.display = 'none';
    document.getElementById('gei-apply-body').style.display  = 'flex';
    const assignmentName = detectAssignmentName();
    document.getElementById('gei-assign-name').textContent = assignmentName || '(could not detect)';
    const overrideSel = document.getElementById('gei-override-col');
    overrideSel.innerHTML = headers
      .map((h, i) => i === nameCol ? null : `<option value="${i}">${h || 'Col '+(i+1)}</option>`)
      .filter(Boolean).join('');
    const bestIdx = findBestColumn(assignmentName, headers, nameCol);
    const colTag  = document.getElementById('gei-assign-col-tag');
    if (bestIdx !== null) {
      overrideSel.value = bestIdx;
      colTag.textContent = headers[bestIdx];
      colTag.className = 'gei-pill gei-pill-green';
    } else {
      colTag.textContent = 'no auto-match';
      colTag.className = 'gei-pill gei-pill-amber';
    }
    buildMatches();
  }

  function buildMatches() {
    const rows    = load('gei_rows', null);
    const headers = load('gei_headers', null);
    const nameCol = load('gei_namecol', 0);
    if (!rows) return;
    const gradeCol = parseInt(document.getElementById('gei-override-col').value, 10);
    const colTag = document.getElementById('gei-assign-col-tag');
    colTag.textContent = headers[gradeCol] || 'Col '+(gradeCol+1);
    colTag.className = 'gei-pill gei-pill-green';
    const excelMap = new Map();
    rows.slice(1).forEach(row => {
      const rawName = (row[nameCol] || '').trim();
      const grade   = (row[gradeCol] || '').trim() || '0';
      if (rawName) excelMap.set(normalizeName(rawName), { rawName, grade });
    });
    const rosterRows = getRosterRows();
    matchResults = rosterRows.map(({ name, rowEl, inputEl, saveBtn }) => {
      const norm = normalizeName(name);
      if (excelMap.has(norm)) {
        const e = excelMap.get(norm);
        return { rosterName: name, excelName: e.rawName, grade: e.grade, rowEl, inputEl, saveBtn, status: 'exact', skipped: false, done: false };
      }
      let best = null, bestScore = 0;
      for (const [key, entry] of excelMap) {
        const s = similarity(norm, key);
        if (s > bestScore) { bestScore = s; best = entry; }
      }
      if (best && bestScore >= 0.65) {
        return { rosterName: name, excelName: best.rawName, grade: best.grade, rowEl, inputEl, saveBtn, status: 'fuzzy', score: bestScore, skipped: false, done: false };
      }
      return { rosterName: name, excelName: null, grade: null, rowEl, inputEl, saveBtn, status: 'unmatched', skipped: false, done: false };
    });
    updateStats(); renderGradeList();
  }

  document.getElementById('gei-btn-remap').addEventListener('click', buildMatches);

  panel.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderGradeList();
    });
  });

  document.getElementById('gei-filter-search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderGradeList();
  });

  function updateStats() {
    let ok = 0, warn = 0, err = 0;
    matchResults.forEach(r => { if (r.status === 'exact') ok++; else if (r.status === 'fuzzy') warn++; else err++; });
    document.getElementById('stat-ok').textContent   = ok;
    document.getElementById('stat-warn').textContent  = warn;
    document.getElementById('stat-err').textContent   = err;
    document.getElementById('gei-btn-apply-all').disabled = (ok + warn) === 0;
  }

  function renderGradeList() {
    const list  = document.getElementById('gei-grade-list');
    const empty = document.getElementById('gei-grade-empty');
    list.innerHTML = '';
    const visible = matchResults.filter(r => {
      if (activeFilter === 'unmatched' && r.status !== 'unmatched') return false;
      if (searchQuery && !r.rosterName.toLowerCase().includes(searchQuery)) return false;
      return true;
    });
    if (visible.length === 0) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    visible.forEach(r => {
      const realIdx = matchResults.indexOf(r);
      const row = document.createElement('div');
      row.className = 'gei-grade-row' + (r.skipped ? ' gei-row-skipped' : '') + (r.done ? ' gei-row-done' : '');
      row.dataset.idx = realIdx;
      let statusIcon = '', matchText = '';
      if (r.status === 'exact')      { statusIcon = `<span style="color:var(--green)">●</span>`; matchText = esc(r.excelName); }
      else if (r.status === 'fuzzy') { statusIcon = `<span style="color:var(--amber)">◐</span>`; matchText = `${esc(r.excelName)} <span style="color:var(--text-muted)">(${Math.round((r.score||0)*100)}%)</span>`; }
      else                           { statusIcon = `<span style="color:var(--red)">○</span>`;   matchText = '<span style="color:var(--text-muted)">—</span>'; }
      const doneIcon = r.done ? `<span style="color:var(--green)">✓</span>` : '';
      row.innerHTML = `
        <div class="gei-row-status">${doneIcon || statusIcon}</div>
        <div class="gei-row-name" title="${esc(r.rosterName)}">${esc(r.rosterName)}</div>
        <div class="gei-row-match">${matchText}</div>
        <div class="gei-row-grade-wrap">
          <input class="gei-row-grade" type="number" step="0.01" min="0"
            value="${esc(r.grade||'')}" placeholder="—" data-idx="${realIdx}" ${r.skipped?'disabled':''}>
          <button class="gei-row-skip-btn" data-idx="${realIdx}" title="${r.skipped?'Un-skip':'Skip'}">${r.skipped?'↺':'✕'}</button>
        </div>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.gei-row-grade').forEach(inp => {
      inp.addEventListener('input', e => { matchResults[parseInt(e.target.dataset.idx)].grade = e.target.value; });
    });
    list.querySelectorAll('.gei-row-skip-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.dataset.idx);
        matchResults[idx].skipped = !matchResults[idx].skipped;
        renderGradeList();
      });
    });
    const canApply = matchResults.filter(r => !r.skipped && r.grade !== null && r.grade !== '' && r.status !== 'unmatched').length;
    document.getElementById('gei-btn-apply-all').disabled = canApply === 0;
  }

  document.getElementById('gei-btn-apply-all').addEventListener('click', () => applyGrades());
  document.getElementById('gei-btn-apply-sel').addEventListener('click', () => applyGrades());

  async function applyGrades() {
    const log = document.getElementById('gei-log'), fill = document.getElementById('gei-progress-fill');
    const overlay = document.getElementById('gei-progress-overlay'), label = document.getElementById('gei-progress-label');
    const gradeList = document.getElementById('gei-grade-list');
    gradeList.style.display = 'none'; overlay.classList.add('active');
    log.innerHTML = ''; fill.style.width = '0%';
    const toApply = matchResults.filter(r => !r.skipped && r.grade !== null && r.grade !== '' && r.inputEl && r.status !== 'unmatched');
    let done = 0;
    for (const r of toApply) {
      await sleep(150);
      label.textContent = `Applying ${done + 1} / ${toApply.length} — ${r.rosterName}`;
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(r.inputEl, r.grade);
        r.inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
        r.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        r.inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        await sleep(120);
        if (r.saveBtn && !r.saveBtn.disabled) {
          r.saveBtn.click(); addLog(log, `✓ ${r.rosterName} → ${r.grade}`, 'ok'); r.done = true;
        } else {
          await sleep(350);
          if (r.saveBtn && !r.saveBtn.disabled) {
            r.saveBtn.click(); addLog(log, `✓ ${r.rosterName} → ${r.grade}`, 'ok'); r.done = true;
          } else {
            addLog(log, `⚠ ${r.rosterName} → ${r.grade} (Save still disabled)`, 'warn');
          }
        }
        done++; fill.style.width = Math.round((done / toApply.length) * 100) + '%';
      } catch (ex) { addLog(log, `✗ ${r.rosterName}: ${ex.message}`, 'err'); }
    }
    label.textContent = `Done — ${done} / ${toApply.length} applied`;
    setTimeout(() => { overlay.classList.remove('active'); gradeList.style.display = 'block'; renderGradeList(); }, 2000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 3 — BATCH (auto-fill all assignments)
  // ─────────────────────────────────────────────────────────────────────────────

  // State for each assignment found in the sidebar
  let batchAssignments = [];   // { name, colIdx, colName, colScore, element, skipped, done, error }
  let batchRunning = false;
  let batchStopped = false;

  function initBatchPane() {
    const rows    = load('gei_rows', null);
    const headers = load('gei_headers', null);

    if (!rows || !headers) {
      document.getElementById('batch-no-data').style.display = 'block';
      document.getElementById('batch-body').style.display    = 'none';
      return;
    }
    document.getElementById('batch-no-data').style.display = 'none';
    document.getElementById('batch-body').style.display    = 'flex';

    scanAssignments();
  }

  // Scan the sidebar for all assignment items and match them to columns
  function scanAssignments() {
    const headers = load('gei_headers', null);
    const nameCol = load('gei_namecol', 0);
    if (!headers) return;

    // Find all assignment items in the sidebar list
    const items = document.querySelectorAll('.assignment-item-vertical');
    batchAssignments = [];

    items.forEach(item => {
      const titleEl = item.querySelector('.assignment-title');
      if (!titleEl) return;
      const name = titleEl.textContent.trim();
      if (!name) return;

      // Find the best matching gradebook column
      const bestIdx = findBestColumn(name, headers, nameCol);
      const colScore = bestIdx !== null ? getColumnScore(name, headers[bestIdx]) : 0;

      batchAssignments.push({
        name,
        element: item,
        colIdx: bestIdx,
        colName: bestIdx !== null ? headers[bestIdx] : null,
        colScore,
        skipped: false,
        done: false,
        error: null,
        isActive: item.classList.contains('selected'),
      });
    });

    renderBatchList();
  }

  // Get score for a specific column match (for display)
  function getColumnScore(assignName, colName) {
    if (!assignName || !colName) return 0;
    const a = normalizeName(assignName), b = normalizeName(colName);
    if (a.includes(b) || b.includes(a)) return 1;
    return similarity(a, b);
  }

  function renderBatchList() {
    const headers = load('gei_headers', null);
    const nameCol = load('gei_namecol', 0);
    const list = document.getElementById('batch-assign-list');
    list.innerHTML = '';

    let matched = 0, fuzzy = 0, none = 0;

    batchAssignments.forEach((a, i) => {
      if (a.colIdx !== null) {
        if (a.colScore >= 0.8) matched++;
        else fuzzy++;
      } else {
        none++;
      }

      const row = document.createElement('div');
      row.className = 'batch-row' +
        (a.isActive ? ' batch-row-active' : '') +
        (a.done     ? ' batch-row-done'   : '') +
        (a.skipped  ? ' batch-row-skipped': '') +
        (a.error    ? ' batch-row-error'  : '');
      row.dataset.batchIdx = i;

      // Status icon
      let icon = '';
      if (a.done)         icon = `<span style="color:var(--green)">✓</span>`;
      else if (a.error)   icon = `<span style="color:var(--red)">✗</span>`;
      else if (a.isActive) icon = `<span style="color:var(--blue)">▶</span>`;
      else if (a.skipped)  icon = `<span style="color:var(--amber)">—</span>`;
      else if (a.colIdx !== null) icon = `<span style="color:${a.colScore >= 0.8 ? 'var(--green)' : 'var(--amber)'}">●</span>`;
      else icon = `<span style="color:var(--red)">○</span>`;

      // Column selector (non-name cols only)
      const colOptions = headers
        .map((h, ci) => ci === nameCol ? '' : `<option value="${ci}" ${a.colIdx === ci ? 'selected' : ''}>${h || 'Col '+(ci+1)}</option>`)
        .join('');
      const noneOpt = `<option value="" ${a.colIdx === null ? 'selected' : ''}>— skip —</option>`;

      // Score pill
      let scorePill = '';
      if (!batchRunning && a.colIdx !== null) {
        const pct = Math.round(a.colScore * 100);
        const cls = a.colScore >= 0.8 ? 'batch-row-col-ok' : 'batch-row-col-warn';
        scorePill = `<span class="${cls}" style="font-size:9px; margin-left:2px">${pct}%</span>`;
      }

      row.innerHTML = `
        <div class="batch-row-icon">${icon}</div>
        <div class="batch-row-name" title="${esc(a.name)}">${esc(a.name)}</div>
        <select class="batch-col-select" data-bidx="${i}">
          ${noneOpt}${colOptions}
        </select>
        <button class="batch-skip-btn" data-bidx="${i}" title="${a.skipped?'Un-skip':'Skip'}">${a.skipped?'↺':'✕'}</button>
      `;

      list.appendChild(row);
    });

    // Wire column selects
    list.querySelectorAll('.batch-col-select').forEach(sel => {
      sel.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.bidx);
        const val = e.target.value;
        batchAssignments[idx].colIdx  = val === '' ? null : parseInt(val);
        const headers = load('gei_headers', null);
        batchAssignments[idx].colName = val === '' ? null : headers[parseInt(val)];
        batchAssignments[idx].colScore = val === '' ? 0 : getColumnScore(batchAssignments[idx].name, headers[parseInt(val)]);
        updateBatchStats();
      });
    });

    // Wire skip buttons
    list.querySelectorAll('.batch-skip-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.dataset.bidx);
        batchAssignments[idx].skipped = !batchAssignments[idx].skipped;
        renderBatchList();
      });
    });

    updateBatchStats();
  }

  function updateBatchStats() {
    let matched = 0, fuzzy = 0, none = 0;
    batchAssignments.forEach(a => {
      if (a.skipped) return;
      if (a.colIdx !== null) { if (a.colScore >= 0.8) matched++; else fuzzy++; }
      else none++;
    });
    document.getElementById('bs-matched').textContent = matched;
    document.getElementById('bs-fuzzy').textContent   = fuzzy;
    document.getElementById('bs-none').textContent    = none;
    document.getElementById('bs-assign-count').textContent =
      `${batchAssignments.length} total assignments`;
    document.getElementById('batch-btn-run').disabled =
      (matched + fuzzy) === 0 || batchRunning;
  }

  document.getElementById('batch-btn-scan').addEventListener('click', scanAssignments);

  // ── BATCH RUN ─────────────────────────────────────────────────────────────────
  document.getElementById('batch-btn-run').addEventListener('click', runBatch);
  document.getElementById('batch-btn-stop').addEventListener('click', () => {
    batchStopped = true;
    document.getElementById('batch-prog-label').textContent = 'Stopping after current assignment…';
  });

  async function runBatch() {
    if (batchRunning) return;
    batchRunning = true;
    batchStopped = false;

    const progSection = document.getElementById('batch-progress-section');
    const progFill    = document.getElementById('batch-prog-fill');
    const progLabel   = document.getElementById('batch-prog-label');
    const batchLog    = document.getElementById('batch-log');
    const runBtn      = document.getElementById('batch-btn-run');
    const stopBtn     = document.getElementById('batch-btn-stop');

    progSection.classList.add('active');
    batchLog.classList.add('active');
    batchLog.innerHTML = '';
    progFill.style.width = '0%';
    runBtn.disabled = true;
    stopBtn.classList.add('active');

    const toRun = batchAssignments.filter(a => !a.skipped && a.colIdx !== null && !a.done);
    let doneCount = 0;

    for (const assignment of toRun) {
      if (batchStopped) {
        addLog(batchLog, '■ Stopped by user.', 'warn');
        break;
      }

      progLabel.textContent = `[${doneCount + 1}/${toRun.length}] Navigating → ${assignment.name}`;
      addLog(batchLog, `→ ${assignment.name}`, 'info');

      // Highlight active row
      batchAssignments.forEach(a => a.isActive = false);
      assignment.isActive = true;
      renderBatchList();

      // Click the assignment item to navigate to it
      assignment.element.click();

      // Wait for the page to load the new assignment's grade table
      const loaded = await waitForGradeTable(4000);
      if (!loaded) {
        assignment.error = 'Grade table did not load in time';
        addLog(batchLog, `✗ ${assignment.name}: timeout waiting for grade table`, 'err');
        renderBatchList();
        continue;
      }

      // Small additional settle time for Angular rendering
      await sleep(400);

      // Now fill grades for this assignment
      const result = await fillCurrentAssignment(assignment, batchLog);
      assignment.done  = result.ok;
      assignment.error = result.error || null;
      doneCount++;
      progFill.style.width = Math.round((doneCount / toRun.length) * 100) + '%';
      renderBatchList();

      // Brief pause between assignments to avoid hammering the server
      await sleep(500);
    }

    batchAssignments.forEach(a => a.isActive = false);
    progLabel.textContent = batchStopped
      ? `Stopped — ${doneCount} / ${toRun.length} processed`
      : `✓ Batch complete — ${doneCount} / ${toRun.length} assignments filled`;
    addLog(batchLog, `─── Done: ${doneCount}/${toRun.length} ───`, doneCount === toRun.length ? 'ok' : 'warn');

    batchRunning = false;
    runBtn.disabled = false;
    stopBtn.classList.remove('active');
    renderBatchList();
  }

  // Wait until a grade-entry table with inputs appears
  function waitForGradeTable(timeout) {
    return new Promise(resolve => {
      const start = Date.now();
      const check = () => {
        const inputs = document.querySelectorAll('table tbody tr input[type="number"]');
        if (inputs.length > 0) { resolve(true); return; }
        if (Date.now() - start > timeout) { resolve(false); return; }
        setTimeout(check, 200);
      };
      check();
    });
  }

  // Fill grades for the currently visible assignment page
  async function fillCurrentAssignment(assignment, logEl) {
    const rows    = load('gei_rows', null);
    const headers = load('gei_headers', null);
    const nameCol = load('gei_namecol', 0);
    if (!rows) return { ok: false, error: 'No gradebook data' };

    const gradeCol = assignment.colIdx;

    // Build excel map for this column
    const excelMap = new Map();
    rows.slice(1).forEach(row => {
      const rawName = (row[nameCol] || '').trim();
      const grade   = (row[gradeCol] || '').trim() || '0';
      if (rawName) excelMap.set(normalizeName(rawName), { rawName, grade });
    });

    const rosterRows = getRosterRows();
    if (rosterRows.length === 0) return { ok: false, error: 'No roster rows found on page' };

    // Match students
    const matched = rosterRows.map(({ name, inputEl, saveBtn }) => {
      const norm = normalizeName(name);
      let grade = null;
      if (excelMap.has(norm)) {
        grade = excelMap.get(norm).grade;
      } else {
        let best = null, bestScore = 0;
        for (const [key, entry] of excelMap) {
          const s = similarity(norm, key);
          if (s > bestScore) { bestScore = s; best = entry; }
        }
        if (best && bestScore >= 0.65) grade = best.grade;
      }
      return { name, inputEl, saveBtn, grade };
    }).filter(r => r.grade !== null);

    let saved = 0;
    for (const r of matched) {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(r.inputEl, r.grade);
        r.inputEl.dispatchEvent(new Event('input',  { bubbles: true }));
        r.inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        r.inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        await sleep(120);
        if (r.saveBtn && !r.saveBtn.disabled) {
          r.saveBtn.click(); saved++;
        } else {
          await sleep(350);
          if (r.saveBtn && !r.saveBtn.disabled) { r.saveBtn.click(); saved++; }
        }
        await sleep(100);
      } catch(ex) {
        addLog(logEl, `  ✗ ${r.name}: ${ex.message}`, 'err');
      }
    }

    addLog(logEl, `  ✓ ${assignment.name}: ${saved}/${rosterRows.length} students saved`, saved > 0 ? 'ok' : 'warn');
    return { ok: saved > 0 };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TAB 4 — DATA
  // ─────────────────────────────────────────────────────────────────────────────
  function renderStoredData() {
    const rows    = load('gei_rows', null);
    const headers = load('gei_headers', null);
    const nameCol = load('gei_namecol', 0);
    const infoEl  = document.getElementById('gei-stored-info');
    const gridEl  = document.getElementById('gei-stored-grid');
    if (!rows || !headers) {
      infoEl.innerHTML = '<span style="color:var(--red)">No gradebook stored yet.</span>';
      gridEl.innerHTML = ''; return;
    }
    infoEl.innerHTML = `<span style="color:var(--green); font-weight:700">${rows.length - 1} students</span> · ${headers.length} columns · Name: <em style="color:var(--text)">${esc(headers[nameCol])}</em>`;
    gridEl.innerHTML = `<table>
      <thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.slice(1).map(row =>
        `<tr>${headers.map((_, i) => `<td>${esc(row[i] || '')}</td>`).join('')}</tr>`
      ).join('')}</tbody>
    </table>`;
  }

  document.getElementById('gei-btn-clear-data').addEventListener('click', () => {
    if (!confirm('Clear the stored gradebook?')) return;
    save('gei_rows', null); save('gei_headers', null); save('gei_namecol', 0);
    updateToggleDot(); updateHeaderSub(); renderStoredData();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────
  function detectAssignmentName() {
    // Prefer the currently selected/active assignment item in the sidebar
    const selected = document.querySelector('.assignment-item-vertical.selected .assignment-title');
    if (selected && selected.textContent.trim()) return selected.textContent.trim();
    const selectors = ['.assignment-title','h1','h2','h3','.page-title','.assignment-name'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    const m = location.href.match(/assignment-detail\/(\d+)/);
    return m ? `Assignment ${m[1]}` : '';
  }

  function findBestColumn(assignmentName, headers, nameCol) {
    if (!assignmentName) return null;
    const normAssign = normalizeName(assignmentName);
    let bestIdx = null, bestScore = 0;
    headers.forEach((h, i) => {
      if (i === nameCol) return;
      const normH = normalizeName(h);
      if (!normH) return;
      if (normAssign.includes(normH) || normH.includes(normAssign)) {
        const score = normH.length / Math.max(normAssign.length, 1);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
        return;
      }
      const s = similarity(normAssign, normH);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return bestScore >= 0.3 ? bestIdx : null;
  }

  function getRosterRows() {
    const results = [];
    document.querySelectorAll('table tbody tr').forEach(row => {
      const nameTd = row.querySelector('td:first-child div:first-child');
      if (!nameTd) return;
      const name = nameTd.textContent.trim();
      if (!name) return;
      const input   = row.querySelector('input[type="number"]');
      const saveBtn = row.querySelector('button.btn-primary');
      if (input && saveBtn) results.push({ name, rowEl: row, inputEl: input, saveBtn });
    });
    return results;
  }

  function updateToggleDot() {
    toggleBtn.classList.toggle('has-data', !!load('gei_rows', null));
  }

  function updateHeaderSub() {
    const rows = load('gei_rows', null);
    const sub  = document.getElementById('gei-header-sub');
    if (rows) {
      const headers = load('gei_headers', null);
      sub.textContent = `${rows.length - 1} students · ${(headers||[]).length} columns`;
      sub.style.color = 'var(--green)';
    } else {
      sub.textContent = 'no data loaded'; sub.style.color = '';
    }
  }

  function normalizeName(n) {
    return String(n).toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  }
  function similarity(a, b) {
    if (a === b) return 1; if (!a || !b) return 0;
    const bg = s => { const st = new Set(); for (let i = 0; i < s.length - 1; i++) st.add(s.slice(i,i+2)); return st; };
    const A = bg(a), B = bg(b); let x = 0;
    B.forEach(v => { if (A.has(v)) x++; });
    return (2 * x) / (A.size + B.size);
  }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function addLog(container, msg, type) {
    const d = document.createElement('div');
    d.className = `gei-log-line gei-log-${type}`; d.textContent = msg;
    container.appendChild(d); container.scrollTop = container.scrollHeight;
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Init ─────────────────────────────────────────────────────────────────────
  updateToggleDot();
  updateHeaderSub();

  // Auto-open to Batch tab if data is loaded
  if (load('gei_rows', null)) {
    panel.classList.remove('gei-hidden');
    toggleBtn.style.display = 'none';
    panel.querySelectorAll('.gei-tab, .gei-pane').forEach(el => el.classList.remove('active'));
    panel.querySelector('[data-pane="pane-batch"]').classList.add('active');
    document.getElementById('pane-batch').classList.add('active');
    initBatchPane();
  }

})();