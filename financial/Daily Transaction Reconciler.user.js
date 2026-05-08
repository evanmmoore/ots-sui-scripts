// ==UserScript==
// @name         Daily Transaction Reconciler
// @namespace    http://tampermonkey.net/
// @version      5.4
// @description  Floating draggable reconciler — enter bank amount, see the gap, find culprits. TX Lookup tab to paste IDs + amounts from Excel. Click any result to highlight it on the page.
// @author       Evan
// @match        https://otsystems.net/admin/reports/dailytransactions/
// @match        https://otsystems.net/admin/reports/dailytransactions/*
// @match        https://otsystems.net/admin/reports/dailyTransactions/
// @match        https://otsystems.net/admin/reports/dailyTransactions/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(fontLink);

    const PANEL_W = 820;
    const PANEL_H = 560;

    const style = document.createElement('style');
    style.textContent = `
        /* ── Launch Button ───────────────────────────────────────────────────── */
        #recon-btn {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99998;
            background: linear-gradient(135deg, #0f766e, #0d9488);
            color: #fff;
            border: none;
            border-radius: 10px;
            padding: 11px 20px;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(13,148,136,0.35), 0 1px 3px rgba(0,0,0,0.1);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #recon-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(13,148,136,0.45); }
        #recon-btn:active { transform: translateY(0); }
        #recon-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        #recon-btn .btn-ring {
            width: 13px; height: 13px;
            border: 2px solid rgba(255,255,255,0.4);
            border-top-color: white;
            border-radius: 50%;
            animation: r-spin 0.7s linear infinite;
        }

        /* ── Panel Shell ─────────────────────────────────────────────────────── */
        #recon-panel {
            position: fixed;
            z-index: 99999;
            width: ${PANEL_W}px;
            height: ${PANEL_H}px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            display: flex;
            flex-direction: column;
            font-family: 'IBM Plex Sans', sans-serif;
            box-shadow: 0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04);
            overflow: hidden;
            opacity: 0;
            transform: scale(0.96) translateY(8px);
            transition: opacity 0.22s ease, transform 0.22s ease, height 0.22s ease;
            pointer-events: none;
        }
        #recon-panel.open {
            opacity: 1;
            transform: scale(1) translateY(0);
            pointer-events: all;
        }
        #recon-panel.minimized {
            height: 46px !important;
            overflow: hidden;
        }
        #recon-panel.minimized #rp-tabs,
        #recon-panel.minimized #rp-main {
            display: none;
        }

        /* ── Header ──────────────────────────────────────────────────────────── */
        #rp-header {
            background: #fff;
            border-bottom: 1px solid #e2e8f0;
            padding: 12px 16px 11px;
            cursor: grab;
            flex-shrink: 0;
            user-select: none;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        #rp-header:active { cursor: grabbing; }
        #rp-header-left { display: flex; align-items: center; gap: 10px; }
        #rp-title {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 7px;
        }
        #rp-title::before {
            content: '';
            display: block;
            width: 7px; height: 7px;
            border-radius: 50%;
            background: #0d9488;
            box-shadow: 0 0 0 2px rgba(13,148,136,0.2);
            flex-shrink: 0;
        }
        #rp-date {
            font-size: 10.5px;
            font-family: 'IBM Plex Mono', monospace;
            color: #64748b;
            background: #f1f5f9;
            padding: 2px 8px;
            border-radius: 4px;
        }
        #rp-header-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        #rp-refresh-btn {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            color: #475569;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 11px;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        #rp-refresh-btn:hover { background: #e2e8f0; color: #334155; }
        #rp-close, #rp-minimize {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            color: #94a3b8;
            width: 26px; height: 26px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s;
            flex-shrink: 0;
            line-height: 1;
        }
        #rp-close:hover { background: #fee2e2; color: #ef4444; border-color: #fca5a5; }
        #rp-minimize:hover { background: #e0f2fe; color: #0284c7; border-color: #bae6fd; }

        /* ── Tabs ────────────────────────────────────────────────────────────── */
        #rp-tabs {
            display: flex;
            background: #fff;
            border-bottom: 1px solid #e2e8f0;
            flex-shrink: 0;
            padding: 0 4px;
        }
        .rp-tab {
            flex: 1;
            padding: 9px 0;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            color: #94a3b8;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            transition: all 0.15s;
        }
        .rp-tab:hover { color: #475569; }
        .rp-tab.active { color: #0d9488; border-bottom-color: #0d9488; }

        /* ── Main Layout ─────────────────────────────────────────────────────── */
        #rp-main {
            flex: 1;
            display: flex;
            overflow: hidden;
            min-height: 0;
            background: #f8fafc;
        }

        #rp-left {
            width: 300px;
            flex-shrink: 0;
            border-right: 1px solid #e2e8f0;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            overflow-x: hidden;
            background: #fff;
        }
        #rp-left::-webkit-scrollbar { width: 4px; }
        #rp-left::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }

        #rp-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-width: 0;
            background: #fff;
        }

        /* ── Right Column Header ─────────────────────────────────────────────── */
        #rp-col-header {
            flex-shrink: 0;
            border-bottom: 2px solid #e2e8f0;
            background: #f8fafc;
        }
        .rp-col-header-row {
            display: grid;
            grid-template-columns: 26px 1fr 78px 78px 78px 78px 78px;
            align-items: center;
        }
        .rp-col-header-row.top-row { border-bottom: 1px solid #f1f5f9; }
        .rp-ch {
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            padding: 5px 4px;
            text-align: center;
            color: #94a3b8;
        }
        .rp-ch.name-col { text-align: left; padding-left: 8px; }
        .rp-ch.corp-grp  { color: #0d9488; background: #f0fdfa; border-radius: 4px 4px 0 0; }
        .rp-ch.nc-grp    { color: #059669; background: #f0fdf4; border-radius: 4px 4px 0 0; }
        .rp-ch.corp-sub  { color: #0d9488; }
        .rp-ch.corp-ref  { color: #dc2626; }
        .rp-ch.nc-sub    { color: #059669; }
        .rp-ch.nc-ref    { color: #dc2626; }
        .rp-ch.cu-col    { color: #b45309; }

        /* ── TX List ─────────────────────────────────────────────────────────── */
        #rp-tx-list {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
        }
        #rp-tx-list::-webkit-scrollbar { width: 4px; }
        #rp-tx-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }

        .rp-tx-row {
            display: grid;
            grid-template-columns: 26px 1fr 78px 78px 78px 78px 78px;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
            transition: background 0.1s;
            min-height: 30px;
        }
        .rp-tx-row:hover { background: #f8fafc; }
        .rp-tx-row:last-child { border-bottom: none; }
        .rp-tx-row.suspect-exact {
            background: #fff7ed !important;
            border-left: 3px solid #f97316;
        }
        .rp-tx-row.suspect-close {
            background: #fefce8 !important;
            border-left: 3px solid #eab308;
        }
        .rp-tx-row.suspect-divider {
            border-bottom: 2px solid #e2e8f0 !important;
        }
        .rp-tx-pill-cell { display: flex; align-items: center; justify-content: center; padding: 0 2px; }
        .rp-tx-name {
            font-size: 11px;
            color: #475569;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 0 6px 0 8px;
        }
        .rp-tx-amt {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10.5px;
            font-weight: 600;
            white-space: nowrap;
            text-align: right;
            padding-right: 8px;
        }
        .rp-tx-amt.corp-rcv { color: #0d9488; }
        .rp-tx-amt.corp-ref { color: #dc2626; }
        .rp-tx-amt.nc-rcv   { color: #059669; }
        .rp-tx-amt.nc-ref   { color: #dc2626; }
        .rp-tx-amt.cu       { color: #b45309; }
        .rp-sus-pill {
            font-size: 7.5px;
            font-weight: 800;
            padding: 2px 4px;
            border-radius: 3px;
            text-transform: uppercase;
        }
        .rp-sus-pill.exact { background: #ffedd5; color: #f97316; }
        .rp-sus-pill.close { background: #fef9c3; color: #ca8a04; }
        .rp-tx-total-row {
            display: grid;
            grid-template-columns: 26px 1fr 78px 78px 78px 78px 78px;
            align-items: center;
            padding: 7px 0;
            background: #f8fafc;
            border-top: 2px solid #e2e8f0;
            font-size: 10px;
            font-weight: 700;
        }
        .rp-tx-total-row .tt-lbl {
            color: #94a3b8;
            padding-left: 8px;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            grid-column: 1 / 3;
        }
        .rp-tx-total-row .tt-v {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10.5px;
            text-align: right;
            padding-right: 8px;
        }
        .rp-tx-total-row .tt-v.corp-rcv { color: #0d9488; }
        .rp-tx-total-row .tt-v.corp-ref { color: #dc2626; }
        .rp-tx-total-row .tt-v.nc-rcv   { color: #059669; }
        .rp-tx-total-row .tt-v.nc-ref   { color: #dc2626; }
        .rp-tx-total-row .tt-v.cu       { color: #b45309; }
        .rp-tx-empty {
            padding: 32px 14px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
        }

        /* ── Left Panel Sections ─────────────────────────────────────────────── */
        .rp-section { border-bottom: 1px solid #f1f5f9; }
        .rp-section-title {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.3px;
            color: #94a3b8;
            padding: 8px 14px 7px;
            background: #f8fafc;
            border-bottom: 1px solid #f1f5f9;
        }
        .rp-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 14px;
            border-bottom: 1px solid #f8fafc;
            gap: 8px;
        }
        .rp-row:last-child { border-bottom: none; }
        .rp-row.net-row {
            background: #f0fdfa;
            border-top: 1px solid #ccfbf1;
            border-bottom: none;
            padding: 9px 14px;
        }
        .rp-lbl { font-size: 11px; color: #64748b; flex: 1; }
        .rp-lbl.noncorp { color: #059669; }
        .rp-lbl.corp    { color: #0d9488; }
        .rp-lbl.refund  { color: #dc2626; }
        .rp-lbl.paylink { color: #0284c7; }
        .rp-lbl.net     { color: #0f172a; font-weight: 700; }
        .rp-val { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; color: #334155; white-space: nowrap; }
        .rp-val.net { font-size: 14px; color: #0d9488; }

        /* ── Bank Input ──────────────────────────────────────────────────────── */
        .rp-bank-wrap { padding: 10px 14px 8px; }
        .rp-bank-lbl {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.1px;
            color: #94a3b8;
            margin-bottom: 5px;
        }
        .rp-bank-input {
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border-radius: 7px;
            color: #0f172a;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 18px;
            font-weight: 700;
            padding: 9px 12px;
            outline: none;
            width: 100%;
            transition: border-color 0.15s, box-shadow 0.15s;
            letter-spacing: 0.5px;
            box-sizing: border-box;
        }
        .rp-bank-input:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,0.1); background: #fff; }
        .rp-bank-input::placeholder { color: #cbd5e1; font-size: 14px; }

        /* ── Gap Display ─────────────────────────────────────────────────────── */
        .rp-gap-wrap { padding: 10px 14px 12px; }
        .rp-gap-dir { font-size: 10px; color: #94a3b8; margin-bottom: 3px; }
        .rp-gap-amount {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 22px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .rp-gap-amount.match { color: #059669; }
        .rp-gap-amount.over  { color: #f97316; }
        .rp-gap-amount.under { color: #dc2626; }
        .rp-gap-amount.none  { color: #cbd5e1; }
        .rp-gap-pill { font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.8px; }
        .rp-gap-pill.match { background: #dcfce7; color: #059669; }
        .rp-gap-pill.over  { background: #ffedd5; color: #f97316; }
        .rp-gap-pill.under { background: #fee2e2; color: #dc2626; }

        .rp-closer {
            padding: 8px 14px 10px;
            background: #eff6ff;
            border-top: 1px solid #bfdbfe;
        }
        .rp-closer-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #3b82f6; margin-bottom: 2px; }
        .rp-closer-val { font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 600; color: #1d4ed8; }

        /* ── Sync Indicator ──────────────────────────────────────────────────── */
        #rp-date.syncing { animation: r-pulse 0.6s ease infinite alternate; }
        @keyframes r-pulse { from { color: #64748b; } to { color: #0d9488; } }
        #rp-date .sync-ring {
            display: inline-block;
            width: 8px; height: 8px;
            border: 1.5px solid #cbd5e1;
            border-top-color: #0d9488;
            border-radius: 50%;
            animation: r-spin 0.6s linear infinite;
            margin-left: 5px;
            vertical-align: middle;
        }

        @keyframes r-spin   { to { transform: rotate(360deg); } }
        @keyframes r-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }

        /* ── TX Lookup Tab ───────────────────────────────────────────────────── */
        #rp-lookup-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-height: 0;
        }
        #rp-lookup-stats-bar {
            flex-shrink: 0;
            padding: 7px 14px;
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        #rp-lookup-stats { display: flex; gap: 6px; flex-wrap: wrap; }
        .rp-stat-pill {
            font-size: 10px;
            font-weight: 700;
            padding: 4px 10px;
            border-radius: 99px;
            font-family: 'IBM Plex Mono', monospace;
        }
        .rp-stat-pill.found     { background: #f0fdfa; color: #0d9488; border: 1px solid #ccfbf1; }
        .rp-stat-pill.mismatch  { background: #fff7ed; color: #f97316; border: 1px solid #fed7aa; }
        .rp-stat-pill.missing   { background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; }
        .rp-stat-pill.total     { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .rp-stat-pill.amt-sum   { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .rp-stat-pill.page-only { background: #fdf4ff; color: #9333ea; border: 1px solid #e9d5ff; }

        #rp-lookup-inner {
            flex: 1;
            display: flex;
            overflow: hidden;
            min-height: 0;
        }
        #rp-lookup-left {
            width: 260px;
            flex-shrink: 0;
            border-right: 1px solid #e2e8f0;
            display: flex;
            flex-direction: column;
            padding: 12px 14px;
            gap: 8px;
            background: #fff;
        }
        .rp-lookup-lbl {
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.1px;
            color: #94a3b8;
            margin-bottom: 2px;
        }
        .rp-col-hint { display: flex; gap: 5px; margin-bottom: 4px; }
        .rp-col-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 7px;
            border-radius: 4px;
            font-family: 'IBM Plex Mono', monospace;
            letter-spacing: 0.3px;
        }
        .rp-col-badge.col-a { background: #f0fdfa; color: #0d9488; border: 1px solid #ccfbf1; }
        .rp-col-badge.col-b { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
        .rp-col-badge.col-opt { opacity: 0.6; }
        #rp-lookup-textarea {
            flex: 1;
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border-radius: 7px;
            color: #0f172a;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 11px;
            padding: 9px 10px;
            outline: none;
            resize: none;
            transition: border-color 0.15s, box-shadow 0.15s;
            line-height: 1.6;
        }
        #rp-lookup-textarea:focus { border-color: #0d9488; box-shadow: 0 0 0 3px rgba(13,148,136,0.1); background: #fff; }
        #rp-lookup-textarea::placeholder { color: #cbd5e1; }
        .rp-lookup-hint {
            font-size: 10px;
            color: #94a3b8;
            line-height: 1.5;
        }
        #rp-lookup-run {
            background: linear-gradient(135deg, #0f766e, #0d9488);
            border: none;
            border-radius: 7px;
            color: #fff;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 12px;
            font-weight: 700;
            padding: 9px 0;
            cursor: pointer;
            transition: all 0.15s;
            letter-spacing: 0.4px;
            box-shadow: 0 2px 8px rgba(13,148,136,0.3);
        }
        #rp-lookup-run:hover { filter: brightness(1.08); box-shadow: 0 4px 12px rgba(13,148,136,0.4); }
        #rp-lookup-clear {
            background: #f1f5f9;
            border: 1px solid #e2e8f0;
            border-radius: 7px;
            color: #94a3b8;
            font-family: 'IBM Plex Sans', sans-serif;
            font-size: 11px;
            font-weight: 600;
            padding: 6px 0;
            cursor: pointer;
            transition: all 0.15s;
        }
        #rp-lookup-clear:hover { background: #e2e8f0; color: #64748b; }

        /* ── Lookup Results ──────────────────────────────────────────────────── */
        #rp-lookup-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-width: 0;
            background: #fff;
        }
        #rp-lookup-col-header {
            flex-shrink: 0;
            border-bottom: 2px solid #e2e8f0;
            background: #f8fafc;
        }
        .rp-lookup-ch-row {
            display: grid;
            grid-template-columns: 22px 110px 1fr 80px 80px 52px;
            align-items: center;
        }
        .rp-lkch {
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            padding: 6px 4px;
            color: #94a3b8;
        }
        .rp-lkch.txid-col  { color: #0d9488; }
        .rp-lkch.name-col  { color: #64748b; }
        .rp-lkch.eamt-col  { text-align: right; color: #b45309; padding-right: 6px; }
        .rp-lkch.pamt-col  { text-align: right; color: #059669; padding-right: 6px; }
        .rp-lkch.flag-col  { text-align: center; color: #f97316; }
        #rp-lookup-list {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
        }
        #rp-lookup-list::-webkit-scrollbar { width: 4px; }
        #rp-lookup-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }

        .rp-lk-row {
            display: grid;
            grid-template-columns: 22px 110px 1fr 80px 80px 52px;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
            min-height: 28px;
            transition: background 0.1s;
        }
        .rp-lk-row.clickable {
            cursor: pointer;
        }
        .rp-lk-row.clickable:hover {
            background: #f0fdfa !important;
        }
        .rp-lk-row.missing-row {
            background: #fff5f5;
            border-left: 3px solid #fca5a5;
        }
        .rp-lk-row.mismatch-row {
            background: #fffbf5;
            border-left: 3px solid #fdba74;
        }
        .rp-lk-row.page-only-row {
            background: #fdf4ff;
            border-left: 3px solid #d8b4fe;
        }
        .rp-lk-row.rp-lk-subtotal-row {
            background: #faf5ff;
            border-top: 1px solid #e9d5ff;
            border-bottom: 2px solid #d8b4fe;
            min-height: 26px;
        }
        .rp-lk-row.found-row {
            background: #fff;
        }
        .rp-lk-row.section-header {
            background: #f8fafc;
            border-bottom: 1px solid #e2e8f0;
        }
        .rp-lk-status-dot { display: flex; align-items: center; justify-content: center; }
        .rp-lk-dot { width: 6px; height: 6px; border-radius: 50%; }
        .rp-lk-dot.found     { background: #0d9488; box-shadow: 0 0 0 2px rgba(13,148,136,0.2); }
        .rp-lk-dot.mismatch  { background: #f97316; box-shadow: 0 0 0 2px rgba(249,115,22,0.2); }
        .rp-lk-dot.missing   { background: #dc2626; box-shadow: 0 0 0 2px rgba(220,38,38,0.15); }
        .rp-lk-dot.page-only { background: #9333ea; box-shadow: 0 0 0 2px rgba(147,51,234,0.2); }
        .rp-lk-txid {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            font-weight: 600;
            color: #0d9488;
            padding: 0 6px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .rp-lk-txid.missing   { color: #dc2626; }
        .rp-lk-txid.mismatch  { color: #f97316; }
        .rp-lk-txid.page-only { color: #9333ea; }
        .rp-lk-name {
            font-size: 10px;
            color: #64748b;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            padding: 0 6px;
        }
        .rp-lk-eamt {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            font-weight: 600;
            color: #b45309;
            text-align: right;
            padding-right: 6px;
            white-space: nowrap;
        }
        .rp-lk-pamt {
            font-family: 'IBM Plex Mono', monospace;
            font-size: 10px;
            font-weight: 600;
            color: #059669;
            text-align: right;
            padding-right: 6px;
            white-space: nowrap;
        }
        .rp-lk-pamt.mismatch { color: #f97316; }
        .rp-lk-pamt.no-page  { color: #cbd5e1; }
        .rp-lk-flag { display: flex; align-items: center; justify-content: center; padding: 0 4px; }
        .rp-flag-pill {
            font-size: 7px;
            font-weight: 800;
            padding: 2px 5px;
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            white-space: nowrap;
        }
        .rp-flag-pill.ok        { background: #f0fdfa; color: #0d9488; }
        .rp-flag-pill.mismatch  { background: #fff7ed; color: #f97316; }
        .rp-flag-pill.missing   { background: #fee2e2; color: #dc2626; }
        .rp-flag-pill.no-amt    { background: #f1f5f9; color: #94a3b8; }
        .rp-flag-pill.page-only { background: #fdf4ff; color: #9333ea; }
        .rp-lk-section-lbl {
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 5px 8px;
            grid-column: 1 / -1;
        }
        .rp-lk-section-lbl.found-lbl     { color: #0d9488; }
        .rp-lk-section-lbl.mismatch-lbl  { color: #f97316; }
        .rp-lk-section-lbl.missing-lbl   { color: #dc2626; }
        .rp-lk-section-lbl.page-only-lbl { color: #9333ea; }
        .rp-lookup-empty {
            padding: 32px 14px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.7;
        }

        /* ── Page Highlight (injected into the host page) ────────────────────── */
        @keyframes recon-flash-in {
            0%   { background-color: #fecaca; outline: 2px solid #ef4444; }
            60%  { background-color: #fee2e2; outline: 2px solid #ef4444; }
            100% { background-color: #fff5f5; outline: 2px solid #ef4444; }
        }
        /* Persistent red highlight — stays until next click */
        .recon-highlighted {
            background-color: #fff5f5 !important;
            outline: 2px solid #ef4444 !important;
            outline-offset: -1px;
            border-radius: 2px;
            position: relative;
            z-index: 2;
            animation: recon-flash-in 0.5s ease forwards !important;
        }
        /* The first row of a multi-row group gets a count badge */
        .recon-highlighted-first::before {
            content: attr(data-recon-count);
            position: absolute;
            left: -1px;
            top: 50%;
            transform: translateY(-50%);
            background: #ef4444;
            color: #fff;
            font-size: 9px;
            font-weight: 800;
            font-family: 'IBM Plex Mono', monospace;
            padding: 1px 5px;
            border-radius: 0 3px 3px 0;
            white-space: nowrap;
            z-index: 3;
            pointer-events: none;
        }

        /* ── Click-to-find tooltip on result rows ─────────────────────────────── */
        .rp-lk-row.clickable .rp-lk-txid::after {
            content: ' ↗';
            font-size: 8px;
            opacity: 0;
            transition: opacity 0.15s;
            color: #0d9488;
        }
        .rp-lk-row.clickable:hover .rp-lk-txid::after {
            opacity: 1;
        }
        .rp-lk-row.selected-result {
            background: #fef2f2 !important;
            outline: 1px solid #fca5a5;
            outline-offset: -1px;
        }
        .rp-lk-row.selected-result .rp-lk-txid::after {
            opacity: 1;
            content: ' ●';
            color: #ef4444;
        }
    `;
    document.head.appendChild(style);

    // ─── Utilities ────────────────────────────────────────────────────────────────
    function parseDollar(str) {
        if (!str) return 0;
        return parseFloat(String(str).replace(/[^0-9.\-]/g, '')) || 0;
    }
    function fmt(n) {
        if (n === null || n === undefined) return '—';
        const neg = n < 0;
        const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (neg ? '-' : '') + '$' + s;
    }
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    function mk(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

    function normHeader(h) {
        return h.replace(/\u00a0/g, ' ').trim().toLowerCase().replace(/[\s.]+/g, '');
    }

    // ─── Click-to-Highlight: find ALL rows with this TX ID, persist red outline ───
    function highlightTxOnPage(txid) {
        if (!txid) return false;

        // Clear all previous highlights
        document.querySelectorAll('.recon-highlighted, .recon-highlighted-first').forEach(el => {
            el.classList.remove('recon-highlighted', 'recon-highlighted-first');
            el.removeAttribute('data-recon-count');
        });

        // Collect ALL rows that contain this TX ID
        const matchedRows = [];
        for (const table of document.querySelectorAll('table')) {
            for (const tr of table.querySelectorAll('tbody tr')) {
                for (const td of tr.querySelectorAll('td')) {
                    const text = td.textContent.trim().replace(/\s+/g, '');
                    if (text.toUpperCase() === txid.toUpperCase()) {
                        matchedRows.push(tr);
                        break; // found in this row, move to next tr
                    }
                }
            }
        }

        if (!matchedRows.length) return false;

        // Apply persistent red highlight to all matched rows
        matchedRows.forEach((tr, i) => {
            tr.classList.add('recon-highlighted');
            if (i === 0) {
                tr.classList.add('recon-highlighted-first');
                if (matchedRows.length > 1) {
                    tr.setAttribute('data-recon-count', `${matchedRows.length} rows`);
                }
            }
        });

        // Scroll the first match into view
        matchedRows[0].scrollIntoView({ behavior: 'smooth', block: 'center' });

        return true;
    }

    // ─── Scrape ───────────────────────────────────────────────────────────────────
    function scrapeDate() {
        const h4 = document.querySelector('h4.text-teal-500');
        return h4 ? (h4.childNodes[0]?.textContent?.trim() || '') : '';
    }

    function scrapeGrandTotals() {
        const out = {
            sui: { nonCorp:0, corp:0, refunds:0, subtotal:0, paymentLinks:0, netBatch:0 },
            ots: { nonCorp:0, corp:0, refunds:0, subtotal:0, paymentLinks:0, netBatch:0 },
        };
        const table = document.querySelector('table.custom-table-total');
        if (!table) return out;
        const rows = table.querySelectorAll('tbody tr');
        ['nonCorp','corp','refunds','subtotal','paymentLinks','netBatch'].forEach((key, i) => {
            const row = rows[i]; if (!row) return;
            const tds = row.querySelectorAll('td');
            if (tds.length >= 2) {
                out.sui[key] = parseDollar(tds[0].textContent);
                out.ots[key] = parseDollar(tds[1].textContent);
            }
        });
        return out;
    }

    function scrapeActiveTabRows() {
        const rows = [];
        const pane = document.querySelector('.tab-pane.active') || document;
        for (const tr of pane.querySelectorAll('table tbody tr')) {
            if (!tr.querySelector('td')) continue;
            const ths = tr.querySelectorAll('th');
            const tds = tr.querySelectorAll('td');
            if (!ths.length && !tds.length) continue;
            let itemNum = '', label = '';
            if (ths.length >= 2) {
                itemNum = ths[0].textContent.trim();
                label   = ths[1].textContent.trim().replace(/\s+/g, ' ').substring(0, 60);
            } else if (ths.length === 1) {
                label = ths[0].textContent.trim().replace(/\s+/g, ' ').substring(0, 60);
            } else {
                label = tds[0]?.textContent.trim().replace(/\s+/g, ' ').substring(0, 60) || '';
            }
            if (!label) continue;
            const parseEl = el => {
                if (!el) return { amount: 0, count: 0 };
                const clone = el.cloneNode(true);
                clone.querySelectorAll('small').forEach(s => s.remove());
                const amount = parseDollar(clone.textContent);
                const sm = el.querySelector('small');
                return { amount, count: sm ? (parseInt(sm.textContent.replace(/\D/g,'')) || 0) : 0 };
            };
            let corpRcv  = parseEl(tr.querySelector('[ng-if*="Corporate.Debits"]')    || tds[0]);
            let corpRef  = parseEl(tr.querySelector('[ng-if*="Corporate.Credits"]')   || tds[1]);
            let ncRcv    = parseEl(tr.querySelector('[ng-if*="NonCorporate.Debits"]') || tds[2]);
            let ncRef    = parseEl(tr.querySelector('[ng-if*="NonCorporate.Credits"]')|| tds[3]);
            let cumulative = { amount: 0 };
            const lastTd = tds[tds.length - 1];
            if (lastTd) {
                const strong = lastTd.querySelector('strong');
                cumulative = { amount: parseDollar(strong ? strong.textContent : lastTd.textContent) };
            }
            if (!corpRcv.amount && !ncRcv.amount && !cumulative.amount) continue;
            rows.push({ label, itemNum, corpRcv, corpRef, ncRcv, ncRef, cumulative });
        }
        return rows;
    }

    // ─── TX Lookup: scrape all transaction detail tables ─────────────────────────
    function scrapeDetailTransactions() {
        const txMap = new Map();

        document.querySelectorAll('table').forEach(table => {
            const headerRow = table.querySelector('thead tr, tr:first-child');
            if (!headerRow) return;

            const rawHeaders = [...headerRow.querySelectorAll('th, td')];
            if (!rawHeaders.length) return;
            const headers = rawHeaders.map(h => normHeader(h.textContent));

            const isLayoutB = (
                headers.length >= 8 &&
                (headers[2] === 'transid' || headers[2] === 'transactionid') &&
                headers[7] === 'price'
            );
            const isLayoutA = (
                headers.length >= 6 &&
                (headers[2] === 'transactionid' || headers[2] === 'transid') &&
                (headers[5] === 'amount' || headers[5] === 'price')
            );

            if (!isLayoutB && !isLayoutA) {
                const hasTxHeader = headers.some(h => h === 'transid' || h === 'transactionid');
                if (!hasTxHeader) return;
            }

            let txidIdx, amtIdx, timeIdx, oidIdx, paidByIdx, notesIdx;

            if (isLayoutB) {
                txidIdx=2; amtIdx=7; timeIdx=1; oidIdx=3; paidByIdx=4; notesIdx=5;
            } else if (isLayoutA) {
                txidIdx=2; amtIdx=5; timeIdx=0; oidIdx=1; paidByIdx=3; notesIdx=4;
            } else {
                txidIdx   = headers.findIndex(h => h === 'transid' || h === 'transactionid');
                amtIdx    = headers.findIndex(h => h === 'price' || h === 'amount');
                timeIdx   = headers.findIndex(h => h === 'time');
                oidIdx    = headers.findIndex(h => h === 'oid');
                paidByIdx = headers.findIndex(h => h.includes('paidby'));
                notesIdx  = headers.findIndex(h => h === 'notes' || h === 'student');
                if (txidIdx === -1) return;
            }

            table.querySelectorAll('tbody tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 3 || txidIdx >= tds.length) return;

                const rawTxid = tds[txidIdx].textContent.trim().replace(/\s+/g, '');
                if (!rawTxid || !/^\d{10,}$/.test(rawTxid)) return;

                const normalized = rawTxid.toUpperCase();

                let pageAmount = null;
                if (amtIdx >= 0 && amtIdx < tds.length) {
                    const amtEl  = tds[amtIdx];
                    const span   = amtEl.querySelector('span.ng-binding');
                    const rawAmt = (span ? span.textContent : amtEl.textContent).trim();
                    const amt    = parseDollar(rawAmt);
                    if (amt !== 0) pageAmount = Math.abs(amt);
                }

                if (!txMap.has(normalized)) {
                    txMap.set(normalized, {
                        txid:      rawTxid,
                        time:      (timeIdx   >= 0 && timeIdx   < tds.length) ? tds[timeIdx].textContent.trim()   : '',
                        oid:       (oidIdx    >= 0 && oidIdx    < tds.length) ? tds[oidIdx].textContent.trim()    : '',
                        paidBy:    (paidByIdx >= 0 && paidByIdx < tds.length)
                                       ? tds[paidByIdx].childNodes[0]?.textContent?.trim() || tds[paidByIdx].textContent.trim()
                                       : '',
                        notes:     (notesIdx  >= 0 && notesIdx  < tds.length) ? tds[notesIdx].textContent.trim()  : '',
                        pageAmount: pageAmount || 0,
                        rowCount:  1,
                        rowAmount: pageAmount || 0, // amount per individual row
                    });
                } else {
                    // Accumulate amounts for multi-row TX IDs (e.g. 23 students on one order)
                    const existing = txMap.get(normalized);
                    if (pageAmount) {
                        existing.pageAmount = (existing.pageAmount || 0) + pageAmount;
                        existing.rowCount  += 1;
                        // rowAmount stays as the per-row unit (first row's amount)
                        if (!existing.rowAmount) existing.rowAmount = pageAmount;
                    }
                }
            });
        });

        return txMap;
    }

    // ─── Parse pasted input ───────────────────────────────────────────────────────
    function parseInputRows(raw) {
        const lines = raw.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
        const results = [];

        for (const line of lines) {
            const parts = line.split(/\t|,\s*/).map(p => p.trim()).filter(p => p.length > 0);
            if (parts.length === 0) continue;

            if (parts.length === 1) {
                results.push({ id: parts[0].replace(/\s+/g, '').toUpperCase(), excelAmount: null });
                continue;
            }

            let idPart = null, amtPart = null;

            if (parts.length === 2) {
                const looksLikeId = s => /^\d{10,}$/.test(s.replace(/\s+/g, '')) || /[a-zA-Z]/.test(s);
                if (looksLikeId(parts[0])) {
                    idPart = parts[0]; amtPart = parts[1];
                } else if (looksLikeId(parts[1])) {
                    idPart = parts[1]; amtPart = parts[0];
                } else {
                    idPart  = parts[0].length >= parts[1].length ? parts[0] : parts[1];
                    amtPart = parts[0].length >= parts[1].length ? parts[1] : parts[0];
                }
            } else {
                for (const p of parts) {
                    const clean = p.replace(/\s+/g, '');
                    if (idPart === null && /^\d{10,}$/.test(clean)) {
                        idPart = p;
                    } else if (amtPart === null) {
                        amtPart = p;
                    }
                }
                if (!idPart) idPart = parts[0];
            }

            const normalizedId = idPart.replace(/\s+/g, '').toUpperCase();
            const excelAmount  = amtPart !== null ? Math.abs(parseDollar(amtPart)) : null;

            results.push({ id: normalizedId, excelAmount });
        }

        return results;
    }

    // ─── Run the lookup ───────────────────────────────────────────────────────────
    function runLookup() {
        const inputRows = parseInputRows(state.lookupInput);
        if (!inputRows.length) { state.lookupResults = null; return; }

        const txMap = scrapeDetailTransactions();
        const AMOUNT_TOLERANCE = 0.02;

        const found    = [];
        const mismatch = [];
        const missing  = [];

        inputRows.forEach(({ id, excelAmount }) => {
            let hit = txMap.get(id) || null;
            let partial = false;

            if (!hit) {
                for (const [key, val] of txMap.entries()) {
                    if (key.includes(id) || id.includes(key)) {
                        hit = val; partial = true; break;
                    }
                }
            }

            if (!hit) {
                missing.push({ searchId: id, excelAmount });
                return;
            }

            const pageAmount = hit.pageAmount; // now a running sum (0 if nothing found)
            const hasPageAmount = pageAmount > 0;

            let amountStatus = 'no-excel';
            if (excelAmount !== null && hasPageAmount) {
                amountStatus = Math.abs(excelAmount - pageAmount) <= AMOUNT_TOLERANCE ? 'match' : 'mismatch';
            } else if (excelAmount !== null && !hasPageAmount) {
                amountStatus = 'no-page';
            }

            const row = { searchId: id, excelAmount, pageAmount, amountStatus, partial, ...hit };

            if (amountStatus === 'mismatch') {
                mismatch.push(row);
            } else {
                found.push(row);
            }
        });

        const excelTotal = [...found, ...mismatch]
            .filter(r => r.excelAmount !== null)
            .reduce((s, r) => s + r.excelAmount, 0);
        const pageTotal = [...found, ...mismatch]
            .filter(r => r.pageAmount > 0)
            .reduce((s, r) => s + r.pageAmount, 0);
        const hasAmounts = inputRows.some(r => r.excelAmount !== null);

        // ── Page-only: TX IDs on the page that weren't in the pasted list ────────
        const pastedIds = new Set(inputRows.map(r => r.id.toUpperCase()));
        const pageOnly = [];
        for (const [key, val] of txMap.entries()) {
            if (!pastedIds.has(key)) {
                pageOnly.push({ ...val, searchId: key });
            }
        }
        // Sort by pageAmount descending so biggest surprises are at top
        pageOnly.sort((a, b) => (b.pageAmount || 0) - (a.pageAmount || 0));
        const pageOnlyTotal = pageOnly.reduce((s, r) => s + (r.pageAmount || 0), 0);

        state.lookupResults = { found, mismatch, missing, pageOnly, pageOnlyTotal, total: inputRows.length, hasAmounts, excelTotal, pageTotal };
    }

    // ─── Render lookup pane ───────────────────────────────────────────────────────
    function renderLookupPane() {
        const main = document.getElementById('rp-main');
        if (!main) return;
        main.innerHTML = '';

        const pane = mk('div', ''); pane.id = 'rp-lookup-pane';

        const statsBar = mk('div', ''); statsBar.id = 'rp-lookup-stats-bar';
        const statsInner = mk('div', ''); statsInner.id = 'rp-lookup-stats';
        statsBar.appendChild(statsInner);
        pane.appendChild(statsBar);

        const inner = mk('div', ''); inner.id = 'rp-lookup-inner';

        // ── LEFT ──
        const lLeft = mk('div', ''); lLeft.id = 'rp-lookup-left';

        const lbl = mk('div', 'rp-lookup-lbl'); lbl.textContent = 'Paste from Excel'; lLeft.appendChild(lbl);

        const colHint = mk('div', 'rp-col-hint');
        colHint.innerHTML = `<span class="rp-col-badge col-a">Col A: TX ID</span><span class="rp-col-badge col-b col-opt">Col B: Amount (optional)</span>`;
        lLeft.appendChild(colHint);

        const hint = mk('div', 'rp-lookup-hint');
        hint.textContent = 'Copy two columns from Excel (TX ID + Amount). Click any result row to jump to it on the page.';
        lLeft.appendChild(hint);

        const ta = mk('textarea', ''); ta.id = 'rp-lookup-textarea';
        ta.placeholder = 'e.g.\n121509042536\t19.95\n121509100756\t100\n121509117311\t74.95\n\nor just IDs:\n121509042536\n121509100756';
        ta.value = state.lookupInput;
        ta.addEventListener('input', e => { state.lookupInput = e.target.value; });
        lLeft.appendChild(ta);

        const runBtn = mk('button', ''); runBtn.id = 'rp-lookup-run'; runBtn.textContent = '🔍  Search & Match';
        runBtn.addEventListener('click', () => { state.lookupInput = ta.value; runLookup(); renderLookupPane(); });
        lLeft.appendChild(runBtn);

        const clearBtn = mk('button', ''); clearBtn.id = 'rp-lookup-clear'; clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => { state.lookupInput = ''; state.lookupResults = null; renderLookupPane(); });
        lLeft.appendChild(clearBtn);

        inner.appendChild(lLeft);

        // ── RIGHT ──
        const lRight = mk('div', ''); lRight.id = 'rp-lookup-right';

        if (!state.lookupResults) {
            lRight.innerHTML = `<div class="rp-lookup-empty">Paste transaction IDs (+ optional amounts) on the left,<br>then click <strong style="color:#0d9488">Search & Match</strong>.<br><br><span style="font-size:10px;color:#94a3b8">Once results appear, click any row to jump to<br>that transaction on the page.</span></div>`;
        } else {
            const { found, mismatch, missing, pageOnly, hasAmounts } = state.lookupResults;

            const colHdr = mk('div', ''); colHdr.id = 'rp-lookup-col-header';
            if (hasAmounts) {
                colHdr.innerHTML = `<div class="rp-lookup-ch-row"><span class="rp-lkch"></span><span class="rp-lkch txid-col">Transaction ID</span><span class="rp-lkch name-col">Paid By / Notes</span><span class="rp-lkch eamt-col">Excel Amt</span><span class="rp-lkch pamt-col">Page Amt</span><span class="rp-lkch flag-col">Status</span></div>`;
            } else {
                colHdr.innerHTML = `<div class="rp-lookup-ch-row" style="grid-template-columns:22px 110px 1fr 0 0 60px"><span class="rp-lkch"></span><span class="rp-lkch txid-col">Transaction ID</span><span class="rp-lkch name-col">Paid By / Notes</span><span></span><span></span><span class="rp-lkch flag-col">Status</span></div>`;
            }
            lRight.appendChild(colHdr);

            const list = mk('div', ''); list.id = 'rp-lookup-list';

            function buildResultRow(item, rowType) {
                const rowCls = rowType === 'mismatch'  ? 'rp-lk-row mismatch-row'
                             : rowType === 'missing'   ? 'rp-lk-row missing-row'
                             : rowType === 'page-only' ? 'rp-lk-row page-only-row'
                             : 'rp-lk-row found-row';

                // page-only rows are also clickable (they exist on the page)
                const isClickable = rowType !== 'missing' && item.txid;
                const row = mk('div', rowCls + (isClickable ? ' clickable' : ''));
                row.style.gridTemplateColumns = hasAmounts ? '22px 110px 1fr 80px 80px 52px' : '22px 110px 1fr 0 0 60px';

                if (isClickable) {
                    row.title = `Click to jump to TX ${item.txid} on the page`;
                    row.addEventListener('click', () => {
                        document.querySelectorAll('.rp-lk-row.selected-result').forEach(r => r.classList.remove('selected-result'));
                        const found = highlightTxOnPage(item.txid);
                        if (found) {
                            row.classList.add('selected-result');
                        } else {
                            row.style.transition = 'background 0.1s';
                            row.style.background = '#fee2e2';
                            setTimeout(() => { row.style.background = ''; }, 1200);
                        }
                    });
                }

                const dot = mk('div', 'rp-lk-status-dot');
                const dotCls = rowType === 'mismatch'  ? 'mismatch'
                             : rowType === 'missing'   ? 'missing'
                             : rowType === 'page-only' ? 'page-only'
                             : 'found';
                const d = mk('span', `rp-lk-dot ${dotCls}`);
                d.title = rowType === 'mismatch'  ? 'Amount mismatch'
                        : rowType === 'missing'   ? 'Not found on page'
                        : rowType === 'page-only' ? 'On page but not in Excel'
                        : item.partial ? 'Partial match' : 'Found';
                dot.appendChild(d); row.appendChild(dot);

                const txid = mk('span', `rp-lk-txid ${rowType === 'missing' ? 'missing' : rowType === 'mismatch' ? 'mismatch' : rowType === 'page-only' ? 'page-only' : ''}`);
                txid.textContent = item.txid || item.searchId;
                if (item.partial) txid.style.opacity = '0.75';
                row.appendChild(txid);

                const isMultiRow = item.rowCount > 1;

                const name = mk('span', 'rp-lk-name');
                if (rowType === 'missing') {
                    name.textContent = 'Not found on this page';
                    name.style.color = '#fca5a5';
                } else {
                    const baseLabel = [item.paidBy, item.notes].filter(Boolean).join(' · ') || (item.oid ? `OID ${item.oid}` : '—');
                    if (isMultiRow) {
                        const badgeColor = rowType === 'page-only'
                            ? 'background:#fdf4ff;color:#9333ea;border:1px solid #e9d5ff'
                            : 'background:#f0fdf4;color:#059669;border:1px solid #bbf7d0';
                        name.innerHTML = `<span style="font-size:9px;font-weight:700;${badgeColor};border-radius:3px;padding:1px 5px;margin-right:5px;font-family:'IBM Plex Mono',monospace;">${item.rowCount}×${fmt(item.rowAmount)}</span>${baseLabel}`;
                        name.title = `${item.rowCount} rows × ${fmt(item.rowAmount)} = ${fmt(item.pageAmount)} | ${baseLabel}`;
                    } else {
                        name.textContent = baseLabel;
                        name.title = [item.paidBy, item.notes, item.oid ? `OID: ${item.oid}` : ''].filter(Boolean).join(' | ');
                    }
                }
                row.appendChild(name);

                const eAmt = mk('span', 'rp-lk-eamt');
                if (rowType === 'page-only') {
                    eAmt.textContent = '—';
                    eAmt.style.color = '#cbd5e1';
                } else {
                    eAmt.textContent = (hasAmounts && item.excelAmount !== null && item.excelAmount !== undefined) ? fmt(item.excelAmount) : '';
                }
                row.appendChild(eAmt);

                const pAmt = mk('span', `rp-lk-pamt ${rowType === 'mismatch' ? 'mismatch' : (!item.pageAmount ? 'no-page' : '')}`);
                if (rowType === 'page-only') {
                    pAmt.style.color = '#9333ea';
                    pAmt.textContent = item.pageAmount ? fmt(item.pageAmount) : '—';
                } else if (rowType !== 'missing') {
                    pAmt.textContent = item.pageAmount ? fmt(item.pageAmount) : (hasAmounts ? '—' : '');
                }
                row.appendChild(pAmt);

                const flagCell = mk('div', 'rp-lk-flag');
                let pillCls = 'no-amt', pillTxt = '';
                if (rowType === 'missing') {
                    pillCls = 'missing'; pillTxt = 'Not Found';
                } else if (rowType === 'page-only') {
                    pillCls = 'page-only'; pillTxt = isMultiRow ? `+${item.rowCount} rows` : '+ Page Only';
                } else if (rowType === 'mismatch') {
                    pillCls = 'mismatch'; pillTxt = 'Mismatch';
                    const delta = item.excelAmount - item.pageAmount;
                    flagCell.title = `Excel: ${fmt(item.excelAmount)} · Page: ${fmt(item.pageAmount)} · Δ ${fmt(delta)}${isMultiRow ? ` · ${item.rowCount} rows × ${fmt(item.rowAmount)}` : ''}`;
                } else if (hasAmounts && item.amountStatus === 'match') {
                    pillCls = 'ok'; pillTxt = isMultiRow ? `✓ ${item.rowCount} rows` : '✓ OK';
                } else if (hasAmounts && item.amountStatus === 'no-page') {
                    pillCls = 'no-amt'; pillTxt = 'No Amt';
                } else if (!hasAmounts) {
                    pillCls = 'ok'; pillTxt = isMultiRow ? `✓ ${item.rowCount} rows` : '✓ Found';
                }
                const pill = mk('span', `rp-flag-pill ${pillCls}`); pill.textContent = pillTxt;
                flagCell.appendChild(pill); row.appendChild(flagCell);
                return row;
            }

            function addSection(items, type, icon, labelCls, labelText, subtotal) {
                if (!items.length) return;
                const secHdr = mk('div', 'rp-lk-row section-header');
                const secLbl = mk('span', `rp-lk-section-lbl ${labelCls}`);
                secLbl.textContent = `${icon}  ${labelText} (${items.length})`;
                secHdr.appendChild(secLbl); list.appendChild(secHdr);
                items.forEach(item => list.appendChild(buildResultRow(item, type)));
                // Optional subtotal footer row
                if (subtotal != null) {
                    const totRow = mk('div', 'rp-lk-row rp-lk-subtotal-row');
                    totRow.style.gridTemplateColumns = hasAmounts ? '22px 110px 1fr 80px 80px 52px' : '22px 110px 1fr 0 0 60px';
                    totRow.innerHTML = `
                        <span></span>
                        <span></span>
                        <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#9333ea;padding:0 6px;">Section Total</span>
                        <span style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:700;color:#94a3b8;text-align:right;padding-right:6px;">${hasAmounts ? '—' : ''}</span>
                        <span style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:700;color:#9333ea;text-align:right;padding-right:6px;">${fmt(subtotal)}</span>
                        <span></span>
                    `;
                    list.appendChild(totRow);
                }
            }

            const { pageOnlyTotal } = state.lookupResults;

            addSection(mismatch,  'mismatch',   '⚠', 'mismatch-lbl',  'Amount mismatch');
            addSection(pageOnly,  'page-only',  '◉', 'page-only-lbl', 'On page, not in Excel', pageOnly.length ? pageOnlyTotal : null);
            addSection(found,     'found',      '✓', 'found-lbl',     'Found on page');
            addSection(missing,   'missing',    '✗', 'missing-lbl',   'Not found on page');

            if (!found.length && !mismatch.length && !missing.length) {
                list.innerHTML = `<div class="rp-lookup-empty">No IDs entered.</div>`;
            }
            lRight.appendChild(list);
        }

        inner.appendChild(lRight);
        pane.appendChild(inner);
        main.appendChild(pane);

        if (state.lookupResults) {
            const { found, mismatch, missing, pageOnly, pageOnlyTotal, total, hasAmounts, excelTotal, pageTotal } = state.lookupResults;
            let html = `<span class="rp-stat-pill total">${total} searched</span>`;
            if (mismatch.length) html += `<span class="rp-stat-pill mismatch">⚠ ${mismatch.length} mismatch</span>`;
            html += `<span class="rp-stat-pill found">✓ ${found.length} ok</span>`;
            if (missing.length)  html += `<span class="rp-stat-pill missing">✗ ${missing.length} missing</span>`;
            if (pageOnly.length) html += `<span class="rp-stat-pill page-only">◉ ${pageOnly.length} page-only · ${fmt(pageOnlyTotal)}</span>`;
            if (hasAmounts) {
                html += `<span class="rp-stat-pill amt-sum">Excel ${fmt(excelTotal)}</span>`;
                if (Math.abs(excelTotal - pageTotal) > 0.01) html += `<span class="rp-stat-pill mismatch">Page ${fmt(pageTotal)}</span>`;
            }
            statsInner.innerHTML = html;
        } else {
            statsInner.innerHTML = `<span style="font-size:10px;color:#94a3b8;font-family:'IBM Plex Sans',sans-serif;">Paste IDs (+ optional amounts) and click Search & Match</span>`;
        }

        setTimeout(() => { document.getElementById('rp-lookup-textarea')?.focus(); }, 50);
    }

    // ─── Suspect finder ───────────────────────────────────────────────────────────
    function findSuspects(rows, gap) {
        const absGap = Math.abs(gap);
        if (absGap < 0.005) return new Map();
        const suspectMap = new Map();
        rows.forEach((row, idx) => {
            let best = null;
            [
                { bucket: 'Corp Rcv',   amount: row.corpRcv?.amount   || 0 },
                { bucket: 'Corp Ref',   amount: row.corpRef?.amount   || 0 },
                { bucket: 'NC Rcv',     amount: row.ncRcv?.amount     || 0 },
                { bucket: 'NC Ref',     amount: row.ncRef?.amount     || 0 },
                { bucket: 'Cumulative', amount: row.cumulative?.amount || 0 },
            ].forEach(c => {
                if (!c.amount) return;
                const diff = Math.abs(c.amount - absGap);
                const type = diff <= 0.02 ? 'exact' : diff <= 1.00 ? 'close' : null;
                if (type && (!best || (type === 'exact' && best.type !== 'exact') || diff < best.diff)) {
                    best = { bucket: c.bucket, amount: c.amount, diff, type };
                }
            });
            if (best) suspectMap.set(idx, best);
        });
        return suspectMap;
    }

    // ─── State ────────────────────────────────────────────────────────────────────
    const state = {
        activeTab: 'sui',
        date: '', totals: null,
        suiRows: [], otsRows: [],
        bankSUI: '', bankOTS: '',
        loaded: false,
        lookupInput: '',
        lookupResults: null,
    };

    // ─── Render left column ───────────────────────────────────────────────────────
    function renderLeft(isSUI, totals, bankKey, bankVal, gap) {
        const left = document.getElementById('rp-left');
        if (!left) return;
        left.innerHTML = '';
        const sumSec = mk('div', 'rp-section');
        sumSec.innerHTML = `
            <div class="rp-section-title">${isSUI ? 'SUI' : 'OTS / Affiliate'} — Totals</div>
            <div class="rp-row"><span class="rp-lbl noncorp">Non-Corporate</span><span class="rp-val">${fmt(totals.nonCorp)}</span></div>
            <div class="rp-row"><span class="rp-lbl corp">Corporate</span><span class="rp-val">${fmt(totals.corp)}</span></div>
            <div class="rp-row"><span class="rp-lbl refund">Refunds</span><span class="rp-val">${fmt(totals.refunds)}</span></div>
            <div class="rp-row"><span class="rp-lbl">Subtotal</span><span class="rp-val">${fmt(totals.subtotal)}</span></div>
            <div class="rp-row"><span class="rp-lbl paylink">Payment Links</span><span class="rp-val">${fmt(totals.paymentLinks)}</span></div>
            <div class="rp-row net-row"><span class="rp-lbl net">Net Batch</span><span class="rp-val net">${fmt(totals.netBatch)}</span></div>
        `;
        left.appendChild(sumSec);
        const bankSec = mk('div', 'rp-section');
        bankSec.innerHTML = `
            <div class="rp-section-title">Bank Reconciliation</div>
            <div class="rp-bank-wrap">
                <div class="rp-bank-lbl">Bank deposit amount</div>
                <input class="rp-bank-input" type="text" placeholder="e.g. 10034.29"
                    value="${bankVal}" data-key="${bankKey}" autocomplete="off" spellcheck="false" />
            </div>
        `;
        left.appendChild(bankSec);
        const gapSec = mk('div', 'rp-section');
        let gapHTML = '';
        if (bankVal.trim() === '') {
            gapHTML = `<div class="rp-gap-wrap"><div class="rp-gap-dir">Enter bank amount above</div><div class="rp-gap-amount none">—</div></div>`;
        } else if (gap !== null && Math.abs(gap) < 0.005) {
            gapHTML = `<div class="rp-gap-wrap"><div class="rp-gap-dir">Result</div><div class="rp-gap-amount match">$0.00 <span class="rp-gap-pill match">✓ Match</span></div></div>`;
        } else if (gap !== null) {
            const absGap = Math.abs(gap);
            const cls = gap > 0 ? 'over' : 'under';
            const dir = gap > 0 ? 'Bank is OVER system by' : 'Bank is UNDER system by';
            const pillTxt = gap > 0 ? 'Bank Over' : 'Bank Under';
            gapHTML = `
                <div class="rp-gap-wrap">
                    <div class="rp-gap-dir">${dir}</div>
                    <div class="rp-gap-amount ${cls}">${fmt(absGap)} <span class="rp-gap-pill ${cls}">${pillTxt}</span></div>
                </div>
                <div class="rp-closer">
                    <div class="rp-closer-lbl">${gap > 0 ? 'Missing system entry of' : 'Extra system entry of'}</div>
                    <div class="rp-closer-val">${fmt(absGap)} would close this gap</div>
                </div>`;
        }
        gapSec.innerHTML = `<div class="rp-section-title">Gap</div>${gapHTML}`;
        left.appendChild(gapSec);
        const inp = left.querySelector('.rp-bank-input');
        if (inp) {
            inp.addEventListener('input', e => {
                const pos = e.target.selectionStart;
                state[e.target.dataset.key] = e.target.value;
                renderPanel();
                const newInp = document.querySelector('.rp-bank-input');
                if (newInp) { newInp.focus(); try { newInp.setSelectionRange(pos, pos); } catch(_){} }
            });
        }
    }

    // ─── Render right column ──────────────────────────────────────────────────────
    function buildTxRow(r, idx, suspect, isLastSuspect) {
        const cls = suspect ? (suspect.type === 'exact' ? 'rp-tx-row suspect-exact' : 'rp-tx-row suspect-close') : 'rp-tx-row';
        const row = mk('div', cls + (isLastSuspect ? ' suspect-divider' : ''));
        const pillCell = mk('div', 'rp-tx-pill-cell');
        if (suspect) {
            const pill = mk('span', `rp-sus-pill ${suspect.type}`);
            pill.textContent = suspect.type === 'exact' ? '!' : '~';
            pill.title = suspect.type === 'exact' ? `Exact match for gap (${suspect.bucket})` : `Close match — off by ${fmt(suspect.diff)} (${suspect.bucket})`;
            pillCell.appendChild(pill);
        }
        row.appendChild(pillCell);
        const name = mk('span', 'rp-tx-name');
        name.textContent = r.label; name.title = r.itemNum ? `#${r.itemNum} — ${r.label}` : r.label;
        row.appendChild(name);
        const cRcv = mk('span', 'rp-tx-amt corp-rcv'); cRcv.textContent = r.corpRcv?.amount ? fmt(r.corpRcv.amount) : ''; row.appendChild(cRcv);
        const cRef = mk('span', 'rp-tx-amt corp-ref'); cRef.textContent = r.corpRef?.amount ? fmt(r.corpRef.amount) : ''; row.appendChild(cRef);
        const nRcv = mk('span', 'rp-tx-amt nc-rcv');   nRcv.textContent = r.ncRcv?.amount   ? fmt(r.ncRcv.amount)   : ''; row.appendChild(nRcv);
        const nRef = mk('span', 'rp-tx-amt nc-ref');   nRef.textContent = r.ncRef?.amount   ? fmt(r.ncRef.amount)   : ''; row.appendChild(nRef);
        const cu   = mk('span', 'rp-tx-amt cu');       cu.textContent   = r.cumulative?.amount ? fmt(r.cumulative.amount) : ''; row.appendChild(cu);
        return row;
    }

    function renderRight(rows, suspectMap) {
        const txList  = document.getElementById('rp-tx-list');
        const totalEl = document.getElementById('rp-tx-total');
        if (!txList) return;
        txList.innerHTML = '';
        if (rows.length === 0) {
            txList.innerHTML = `<div class="rp-tx-empty">No transactions found on this tab.</div>`;
            if (totalEl) totalEl.style.display = 'none';
            return;
        }
        const suspectIdxs = [], normalIdxs = [];
        rows.forEach((_, idx) => { if (suspectMap.has(idx)) suspectIdxs.push(idx); else normalIdxs.push(idx); });
        suspectIdxs.sort((a, b) => {
            const ta = suspectMap.get(a).type === 'exact' ? 0 : 1;
            const tb = suspectMap.get(b).type === 'exact' ? 0 : 1;
            return ta - tb;
        });
        const orderedIdxs = [...suspectIdxs, ...normalIdxs];
        let totCorpRcv = 0, totCorpRef = 0, totNcRcv = 0, totNcRef = 0, totCu = 0;
        orderedIdxs.forEach((idx, pos) => {
            const r = rows[idx];
            const suspect = suspectMap.get(idx);
            const isLastSuspect = pos === suspectIdxs.length - 1 && suspectIdxs.length > 0;
            totCorpRcv += r.corpRcv?.amount  || 0;
            totCorpRef += r.corpRef?.amount  || 0;
            totNcRcv   += r.ncRcv?.amount    || 0;
            totNcRef   += r.ncRef?.amount    || 0;
            totCu      += r.cumulative?.amount || 0;
            txList.appendChild(buildTxRow(r, idx, suspect, isLastSuspect));
        });
        if (totalEl) {
            totalEl.style.display = 'grid';
            totalEl.innerHTML = `
                <span class="tt-lbl">Totals</span>
                <span class="tt-v corp-rcv">${totCorpRcv ? fmt(totCorpRcv) : ''}</span>
                <span class="tt-v corp-ref">${totCorpRef ? fmt(totCorpRef) : ''}</span>
                <span class="tt-v nc-rcv">${totNcRcv ? fmt(totNcRcv) : ''}</span>
                <span class="tt-v nc-ref">${totNcRef ? fmt(totNcRef) : ''}</span>
                <span class="tt-v cu">${totCu ? fmt(totCu) : ''}</span>
            `;
        }
    }

    // ─── Full panel render ────────────────────────────────────────────────────────
    function renderPanel() {
        if (!state.loaded) return;
        if (state.activeTab === 'lookup') {
            ['rp-col-header','rp-tx-list','rp-tx-total','rp-left','rp-right'].forEach(id => {
                const el = document.getElementById(id); if (el) el.style.display = 'none';
            });
            renderLookupPane();
            return;
        }
        const existingLookup = document.getElementById('rp-lookup-pane');
        if (existingLookup) existingLookup.remove();
        ['rp-left','rp-right','rp-col-header','rp-tx-list'].forEach(id => {
            const el = document.getElementById(id); if (el) el.style.display = '';
        });
        const isSUI   = state.activeTab === 'sui';
        const totals  = isSUI ? state.totals.sui : state.totals.ots;
        const rows    = isSUI ? state.suiRows    : state.otsRows;
        const bankKey = isSUI ? 'bankSUI'        : 'bankOTS';
        const bankVal = state[bankKey];
        let gap = null;
        if (bankVal.trim() !== '') gap = parseDollar(bankVal) - totals.netBatch;
        const suspectMap = gap !== null && Math.abs(gap) >= 0.005 ? findSuspects(rows, gap) : new Map();
        renderLeft(isSUI, totals, bankKey, bankVal, gap);
        renderRight(rows, suspectMap);
    }

    // ─── Build panel shell ────────────────────────────────────────────────────────
    function buildPanel() {
        document.getElementById('recon-panel')?.remove();
        let startX, startY;
        const tableCard = document.querySelector('table.custom-table-total');
        if (tableCard) {
            const rect = tableCard.closest('.col-md-5, .card, .row')?.getBoundingClientRect() || tableCard.getBoundingClientRect();
            startX = Math.min(rect.right + 20, window.innerWidth - PANEL_W - 12);
            startY = Math.max(rect.top, 20);
            if (startX + PANEL_W > window.innerWidth - 8) startX = Math.max(8, (window.innerWidth - PANEL_W) / 2);
        } else {
            startX = Math.max(20, window.innerWidth - PANEL_W - 20);
            startY = Math.max(20, (window.innerHeight - PANEL_H) / 4);
        }
        startY = Math.max(8, Math.min(startY, window.innerHeight - PANEL_H - 8));
        const panel = mk('div', ''); panel.id = 'recon-panel';
        panel.style.left = startX + 'px'; panel.style.top = startY + 'px';
        panel.innerHTML = `
            <div id="rp-header">
                <div id="rp-header-left">
                    <div id="rp-title">Daily Reconciler</div>
                    <div id="rp-date">${state.date}</div>
                </div>
                <div id="rp-header-right">
                    <button id="rp-refresh-btn">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                        </svg>
                        Re-scrape
                    </button>
                    <button id="rp-minimize" title="Minimize">—</button>
                    <button id="rp-close" title="Close">✕</button>
                </div>
            </div>
            <div id="rp-tabs">
                <button class="rp-tab active" data-tab="sui">SUI</button>
                <button class="rp-tab" data-tab="ots">OTS / Affiliate</button>
                <button class="rp-tab" data-tab="lookup">🔍 TX Lookup</button>
            </div>
            <div id="rp-main">
                <div id="rp-left"></div>
                <div id="rp-right">
                    <div id="rp-col-header">
                        <div class="rp-col-header-row top-row">
                            <span class="rp-ch"></span>
                            <span class="rp-ch name-col">Course</span>
                            <span class="rp-ch corp-grp" style="grid-column:span 2">Corporate</span>
                            <span class="rp-ch nc-grp"   style="grid-column:span 2">Non-Corporate</span>
                            <span class="rp-ch cu-col">Cumul.</span>
                        </div>
                        <div class="rp-col-header-row">
                            <span class="rp-ch"></span>
                            <span class="rp-ch name-col"></span>
                            <span class="rp-ch corp-sub">Rcvd</span>
                            <span class="rp-ch corp-ref">Refnd</span>
                            <span class="rp-ch nc-sub">Rcvd</span>
                            <span class="rp-ch nc-ref">Refnd</span>
                            <span class="rp-ch cu-col"></span>
                        </div>
                    </div>
                    <div id="rp-tx-list"></div>
                    <div id="rp-tx-total" class="rp-tx-total-row" style="display:none;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
        requestAnimationFrame(() => panel.classList.add('open'));
        panel.querySelector('#rp-close').addEventListener('click', () => { panel.classList.remove('open'); setTimeout(() => panel.remove(), 250); });
        panel.querySelector('#rp-minimize').addEventListener('click', () => {
            const minimized = panel.classList.toggle('minimized');
            panel.querySelector('#rp-minimize').textContent = minimized ? '▲' : '—';
            panel.querySelector('#rp-minimize').title = minimized ? 'Restore' : 'Minimize';
        });
        panel.querySelectorAll('.rp-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeTab = btn.dataset.tab;
                panel.querySelectorAll('.rp-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPanel();
            });
        });
        panel.querySelector('#rp-refresh-btn').addEventListener('click', async () => {
            const btn = panel.querySelector('#rp-refresh-btn');
            btn.disabled = true; btn.textContent = 'Scraping…';
            await loadData(); renderPanel();
            btn.disabled = false;
            btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Re-scrape`;
        });
        const header = panel.querySelector('#rp-header');
        let dragging = false, ox = 0, oy = 0;
        header.addEventListener('mousedown', e => {
            if (e.target.closest('button')) return;
            dragging = true;
            const r = panel.getBoundingClientRect();
            ox = e.clientX - r.left; oy = e.clientY - r.top;
            panel.style.transition = 'none'; e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            let nx = Math.max(0, Math.min(window.innerWidth  - PANEL_W, e.clientX - ox));
            let ny = Math.max(0, Math.min(window.innerHeight - PANEL_H, e.clientY - oy));
            panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
        });
        document.addEventListener('mouseup', () => { if (dragging) { dragging = false; panel.style.transition = ''; } });
        renderPanel();
    }

    // ─── Load data ────────────────────────────────────────────────────────────────
    async function loadData() {
        state.date   = scrapeDate();
        state.totals = scrapeGrandTotals();
        const suiLink = document.querySelector('a[href="#SUItab"]');
        const otsLink = document.querySelector('a[href="#Affiliatetab"]');
        if (suiLink) { suiLink.click(); await sleep(400); }
        state.suiRows = scrapeActiveTabRows();
        if (otsLink) { otsLink.click(); await sleep(400); }
        state.otsRows = scrapeActiveTabRows();
        if (suiLink) { suiLink.click(); await sleep(150); }
        state.loaded = true;
    }

    // ─── Date watcher ─────────────────────────────────────────────────────────────
    let _watchedDate = '', _syncTimer = null;
    function showSyncIndicator() {
        const dateEl = document.getElementById('rp-date'); if (!dateEl) return;
        dateEl.classList.add('syncing'); dateEl.innerHTML = `Updating… <span class="sync-ring"></span>`;
    }
    function hideSyncIndicator() {
        const dateEl = document.getElementById('rp-date'); if (!dateEl) return;
        dateEl.classList.remove('syncing'); dateEl.textContent = state.date;
    }
    async function onDateChanged() {
        const panel = document.getElementById('recon-panel');
        if (!panel || !panel.classList.contains('open')) return;
        showSyncIndicator(); await sleep(900); await loadData();
        state.bankSUI = ''; state.bankOTS = '';
        hideSyncIndicator(); renderPanel();
    }
    function startDateWatcher() {
        const h4 = document.querySelector('h4.text-teal-500'); if (!h4) return;
        _watchedDate = h4.textContent.trim();
        const observer = new MutationObserver(() => {
            const newDate = (document.querySelector('h4.text-teal-500')?.textContent || '').trim();
            if (newDate && newDate !== _watchedDate) {
                _watchedDate = newDate; clearTimeout(_syncTimer);
                _syncTimer = setTimeout(onDateChanged, 200);
            }
        });
        const container = h4.closest('.col-md-4') || h4.parentElement;
        observer.observe(container, { childList: true, subtree: true, characterData: true });
    }

    // ─── Launch button ────────────────────────────────────────────────────────────
    function createLaunchBtn() {
        if (document.getElementById('recon-btn')) return;
        const btn = mk('button', ''); btn.id = 'recon-btn';
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Reconcile`;
        btn.addEventListener('click', async () => {
            const existing = document.getElementById('recon-panel');
            if (existing) { existing.classList.toggle('open'); return; }
            btn.disabled = true;
            btn.innerHTML = `<span class="btn-ring"></span> Loading…`;
            await loadData(); buildPanel();
            btn.disabled = false;
            btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Reconcile`;
        });
        document.body.appendChild(btn);
    }

    function waitForPage(retries = 60, interval = 300) {
        if (document.querySelector('table.custom-table-total')) {
            createLaunchBtn(); startDateWatcher();
        } else if (retries > 0) {
            setTimeout(() => waitForPage(retries - 1, interval), interval);
        } else {
            createLaunchBtn();
        }
    }

    window.addEventListener('load', () => setTimeout(() => waitForPage(), 500));
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => waitForPage(), 800));
})();