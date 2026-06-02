// ==UserScript==
// @name         Attendance Importer
// @namespace    http://tampermonkey.net/
// @version      11.0.0
// @description  Paste Excel attendance, confirm dates + names, auto-fill attendance page
// @author       You
// @match        https://admin2025.otsystems.net/training/classroom/session/*/attendance/*
// @grant        none
// ==/UserScript==

(function(){
'use strict';

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CLASS_CONFIG = {
  'fast-track':      { label:'Fast Track',      color:'#6366f1' },
  'weekend-warrior': { label:'Weekend Warrior',  color:'#10b981' },
  'after-hours':     { label:'After Hours',      color:'#f59e0b' },
  'other':           { label:'Other / Custom',   color:'#64748b' },
};

// ─── STATE ─────────────────────────────────────────────────────────────────
let selectedClassType = null;
let afterHoursLongDay = 6;   // 6=Sat, 0=Sun
let otherStart        = '08:00';
let otherEnd          = '17:00';
let otherBreak        = 60;
let parsedData        = null;
let dateMappings      = [];
let nameMappings      = [];
let running           = false;
let stopped           = false;

// ─── HELPERS ───────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc   = s  => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function hexToRgb(hex){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return r+','+g+','+b; }

// ─── NAME MATCHING ─────────────────────────────────────────────────────────
function normName(n){ return String(n).toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim(); }
function similarity(a,b){
  if(a===b) return 1; if(!a||!b) return 0;
  const bg=s=>{const st=new Set();for(let i=0;i<s.length-1;i++)st.add(s.slice(i,i+2));return st;};
  const A=bg(a),B=bg(b);let x=0;B.forEach(v=>{if(A.has(v))x++;});
  return(2*x)/(A.size+B.size);
}
function nameVariants(n){
  const norm=normName(n); const vs=[norm];
  if(norm.includes(',')){ const[l,f]=norm.split(',').map(s=>s.trim()); vs.push(f+' '+l,l,f); }
  else{ const p=norm.split(/\s+/); if(p.length>=2) vs.push(p[p.length-1]+', '+p.slice(0,-1).join(' ')); }
  return vs;
}
function bestNameMatch(excelName, rosterNames){
  const evars=nameVariants(excelName);
  let bestIdx=null,bestScore=0;
  rosterNames.forEach((rn,i)=>{
    const rvars=nameVariants(rn);
    let s=0;
    evars.forEach(ev=>rvars.forEach(rv=>{ const sc=similarity(ev,rv); if(sc>s) s=sc; }));
    if(s>bestScore){ bestScore=s; bestIdx=i; }
  });
  return bestScore>=0.5 ? {idx:bestIdx,score:bestScore} : null;
}

// ─── CLASS HELPERS ─────────────────────────────────────────────────────────
function detectClassType(){
  const h4=document.querySelector('h4 span'); if(!h4) return null;
  const t=h4.textContent.toLowerCase();
  if(t.includes('fast-track')||t.includes('fast track')) return 'fast-track';
  if(t.includes('weekend warrior')) return 'weekend-warrior';
  if(t.includes('after hours')||t.includes('after-hours')) return 'after-hours';
  return null;
}

function getClassInfo(){
  const meta=document.querySelector('.session-meta');
  if(meta){
    const text=meta.textContent.trim();
    const idM=text.match(/ID:\s*(\d+)/);
    const trackerM=text.match(/Tracker Name:\s*(.+)$/);
    return { id:idM?idM[1].trim():null, tracker:trackerM?trackerM[1].trim():null };
  }
  const h4=document.querySelector('h4 span');
  return { id:null, tracker:h4?h4.textContent.trim():null };
}

function getExpectedHours(dateISO){
  const ct=selectedClassType||'fast-track';
  if(ct==='after-hours'){
    const day=new Date(dateISO+'T00:00:00').getDay();
    return day===afterHoursLongDay ? 8 : 4;
  }
  if(ct==='other'){
    const [sh,sm]=otherStart.split(':').map(Number);
    const [eh,em]=otherEnd.split(':').map(Number);
    return Math.round(((eh*60+em)-(sh*60+sm)-otherBreak)/60*10)/10;
  }
  return 8;
}

// ─── PAGE HELPERS ──────────────────────────────────────────────────────────
function scanSidebarDates(){
  const MONTHS={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const results=[];
  document.querySelectorAll('.date-display').forEach(el=>{
    const text=el.textContent.trim();
    const m=text.match(/([A-Z][a-z]+)\s+(\d+),\s+(\d{4})/);
    if(!m) return;
    const month=MONTHS[m[1]]; if(month===undefined) return;
    const day=parseInt(m[2]),year=parseInt(m[3]);
    const iso=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    const clickable=el.closest('[class*="item-content"],li,[class*="item"],.list-group-item')??el.parentElement;
    results.push({label:text,iso,element:clickable});
  });
  return results;
}

function parsePaste(raw){
  const lines=raw.trim().split(/\r?\n/).map(l=>l.split('\t'));
  if(lines.length<2) return null;
  const dates=lines[0].slice(1).map(d=>d.trim()).filter(Boolean);
  if(!dates.length) return null;
  const students=[];
  for(let i=1;i<lines.length;i++){
    const cells=lines[i]; const name=cells[0]?.trim();
    if(!name||/^student\s*name$/i.test(name)) continue;
    const hours=dates.map((_,j)=>{ const v=cells[j+1]?.trim(); if(!v) return null; const n=parseFloat(v); return isNaN(n)?null:n; });
    students.push({name,hours});
  }
  return{dates,students};
}

function excelDateToISO(str){
  const p=str.trim().split('/'); if(p.length!==3) return null;
  let[m,d,y]=p.map(Number); if(y<100) y+=2000;
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

function scanRosterNames(){
  const names=[];
  document.querySelectorAll('tr').forEach(tr=>{
    const td=tr.querySelector('td:first-child'); if(!td) return;
    const name=td.querySelector('strong')?.textContent.trim()||td.textContent.trim();
    if(!name||name.length<2) return;
    if(!names.includes(name)) names.push(name);
  });
  return names;
}

function findStudentRow(rosterName){
  const lower=rosterName.toLowerCase().trim();
  for(const tr of document.querySelectorAll('tr')){
    const td=tr.querySelector('td:first-child'); if(!td) continue;
    if(td.textContent.toLowerCase().trim()===lower) return tr;
  }
  for(const tr of document.querySelectorAll('tr')){
    const td=tr.querySelector('td:first-child'); if(!td) continue;
    if(td.textContent.toLowerCase().trim().includes(lower)) return tr;
  }
  return null;
}

// ─── CORE ACTIONS ──────────────────────────────────────────────────────────

// Just click Save on a student row
async function clickSave(rosterName){
  const tr=findStudentRow(rosterName);
  if(!tr){ logLine('  ⚠ Save: row not found for '+rosterName,'warn'); return false; }
  const btn=[...tr.querySelectorAll('button.btn-primary')].find(b=>b.textContent.trim().toLowerCase()==='save');
  if(!btn){ logLine('  ⚠ Save button not found','warn'); return false; }
  btn.click(); await sleep(500); return true;
}

// Check the absent checkbox then save
async function checkAbsentAndSave(rosterName){
  const tr=findStudentRow(rosterName);
  if(!tr){ logLine('  ⚠ Absent: row not found','warn'); return false; }
  const cb=tr.querySelector('input[type="checkbox"][id^="absent-"]')??tr.querySelector('td:nth-child(3) input[type="checkbox"]');
  if(!cb){ logLine('  ⚠ Absent checkbox not found','warn'); return false; }
  if(!cb.checked){ cb.click(); await sleep(400); }
  if(!cb.checked){ cb.click(); await sleep(400); }
  if(!cb.checked){ logLine('  ⚠ Could not check absent','warn'); return false; }
  return await clickSave(rosterName);
}

// Set start + end times on a row then save (used for partial hours popup result)
async function setTimesAndSave(rosterName, start, end){
  const tr=findStudentRow(rosterName);
  if(!tr){ logLine('  ⚠ Times: row not found','warn'); return false; }
  const tds=tr.querySelectorAll('td');
  const startSel=tds[3]?.querySelector('select');
  const endSel  =tds[4]?.querySelector('select');
  if(!startSel||!endSel){ logLine('  ⚠ Time dropdowns not found','warn'); return false; }
  if(startSel.value!==start){
    startSel.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    startSel.value=start;
    startSel.dispatchEvent(new Event('change',{bubbles:true}));
    startSel.dispatchEvent(new Event('blur',{bubbles:true}));
    await sleep(500);
  }
  if(endSel.value!==end){
    endSel.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    endSel.value=end;
    endSel.dispatchEvent(new Event('change',{bubbles:true}));
    endSel.dispatchEvent(new Event('blur',{bubbles:true}));
    await sleep(500);
  }
  logLine('    → '+start+' → '+end);
  return await clickSave(rosterName);
}

// ─── MANUAL ENTRY MODAL ────────────────────────────────────────────────────
async function openManualModal(rosterName){
  const tr=findStudentRow(rosterName);
  if(!tr) return false;
  const schedBtn=tr.querySelector('button[title^="Manual hour entries"]');
  if(!schedBtn||schedBtn.disabled){ logLine('  ⚠ Schedule button disabled','warn'); return false; }
  schedBtn.click(); await sleep(500);
  const addBtn=[...document.querySelectorAll('.modal-body button.btn-primary')].find(b=>b.textContent.trim().includes('Add Manual Entry'));
  if(!addBtn){ logLine('  ⚠ Add Manual Entry not found','warn'); return false; }
  addBtn.click(); await sleep(300); return true;
}

async function fillManualEntry(dateISO, hours, note){
  const di=document.querySelector('#entryDate');
  const hi=document.querySelector('#entryHours');
  const ni=document.querySelector('#entryNote');
  const ab=[...document.querySelectorAll('.modal-content button.btn-primary')].find(b=>b.textContent.trim()==='Add Entry');
  if(!di||!hi||!ab){ logLine('  ⚠ Entry form fields missing','warn'); return false; }
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(di,dateISO); di.dispatchEvent(new Event('input',{bubbles:true})); di.dispatchEvent(new Event('change',{bubbles:true})); await sleep(100);
  setter.call(hi,String(hours)); hi.dispatchEvent(new Event('input',{bubbles:true})); hi.dispatchEvent(new Event('change',{bubbles:true})); await sleep(100);
  if(ni&&note){ setter.call(ni,note); ni.dispatchEvent(new Event('input',{bubbles:true})); ni.dispatchEvent(new Event('change',{bubbles:true})); await sleep(100); }
  for(let i=0;i<25&&ab.disabled;i++) await sleep(80);
  ab.click(); await sleep(300); return true;
}

async function closeModal(){
  const btn=document.querySelector('.modal-footer button.btn-secondary');
  if(btn){ btn.click(); await sleep(200); }
}

function promptOneMakeup(studentName, absentDate, entryNum){
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:9999999;font-family:'DM Sans',sans-serif;";
    ov.innerHTML=`<div style="background:#1e293b;border:1px solid #334155;border-radius:14px;padding:28px;width:400px;color:#f1f5f9;box-shadow:0 24px 64px rgba(0,0,0,0.7);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <div style="font-size:15px;font-weight:700;">Makeup Entry #${entryNum}</div>
        <div style="font-size:11px;color:#64748b;background:#0f172a;padding:2px 8px;border-radius:20px;border:1px solid #334155;">Absent: ${esc(absentDate)}</div>
      </div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:20px;"><strong style="color:#f1f5f9;">${esc(studentName)}</strong> — enter makeup date and hours.</div>
      <div style="display:grid;gap:12px;">
        <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Makeup Date</label>
          <input id="mk-date" type="date" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;padding:8px 11px;color:#f1f5f9;font-size:13px;box-sizing:border-box;outline:none;"/></div>
        <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Hours</label>
          <input id="mk-hours" type="number" min="0.5" step="0.5" placeholder="e.g. 4" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;padding:8px 11px;color:#f1f5f9;font-size:13px;box-sizing:border-box;outline:none;"/></div>
        <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Note</label>
          <input id="mk-note" type="text" placeholder="Student made up time" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;padding:8px 11px;color:#f1f5f9;font-size:13px;box-sizing:border-box;outline:none;"/></div>
      </div>
      <div style="display:grid;gap:8px;margin-top:20px;">
        <button id="mk-add-more" style="background:#6366f1;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">✓ Add Entry &amp; Add Another</button>
        <button id="mk-add-done" style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">✓ Add Entry &amp; Done</button>
        <button id="mk-skip" style="background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:8px;padding:9px;font-size:13px;cursor:pointer;">Done (no more entries)</button>
      </div></div>`;
    document.body.appendChild(ov);
    const getVal=()=>{ const date=ov.querySelector('#mk-date').value,hrs=parseFloat(ov.querySelector('#mk-hours').value),note=ov.querySelector('#mk-note').value.trim()||'Student made up time'; return(date&&!isNaN(hrs))?{date,hours:hrs,note}:null; };
    ov.querySelector('#mk-add-more').onclick=()=>{ const v=getVal(); ov.remove(); resolve(v?{...v,addMore:true}:null); };
    ov.querySelector('#mk-add-done').onclick=()=>{ const v=getVal(); ov.remove(); resolve(v?{...v,addMore:false}:null); };
    ov.querySelector('#mk-skip').onclick=()=>{ ov.remove(); resolve(null); };
  });
}

async function runMakeupLoop(rosterName, absentDateLabel){
  const opened=await openManualModal(rosterName);
  if(!opened) return;
  let entryNum=1;
  while(true){
    const mk=await promptOneMakeup(rosterName,absentDateLabel,entryNum);
    if(!mk){ logLine('    ↳ No more makeup entries'); break; }
    const filled=await fillManualEntry(mk.date,mk.hours,mk.note);
    if(filled) logLine('    ↳ Entry #'+entryNum+': '+mk.hours+'h on '+mk.date,'success');
    entryNum++;
    if(!mk.addMore) break;
    await sleep(200);
    const addBtn=[...document.querySelectorAll('.modal-body button.btn-primary')].find(b=>b.textContent.trim().includes('Add Manual Entry'));
    if(addBtn){ addBtn.click(); await sleep(300); } else break;
  }
  await closeModal();
}

// ─── PARTIAL HOURS POPUP ───────────────────────────────────────────────────
function promptTimes(studentName, dateLabel){
  const times=[];
  for(let h=0;h<24;h++) for(let m=0;m<60;m+=10) times.push(String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'));
  const makeOpts=def=>times.map(t=>`<option value="${t}"${t===def?' selected':''}>${t}</option>`).join('');
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;z-index:9999999;font-family:'DM Sans',sans-serif;";
    ov.innerHTML=`<div style="background:#1e293b;border:1px solid #334155;border-radius:14px;padding:28px;width:380px;color:#f1f5f9;box-shadow:0 24px 64px rgba(0,0,0,0.7);">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Enter Attendance Times</div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:20px;"><strong style="color:#f1f5f9;">${esc(studentName)}</strong> — partial hours on <strong style="color:#f59e0b;">${esc(dateLabel)}</strong></div>
      <div style="display:grid;gap:14px;">
        <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">Start Time</label>
          <select id="pt-start" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;padding:8px 11px;color:#f1f5f9;font-size:13px;box-sizing:border-box;outline:none;">${makeOpts('08:00')}</select></div>
        <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:5px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;">End Time</label>
          <select id="pt-end" style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:7px;padding:8px 11px;color:#f1f5f9;font-size:13px;box-sizing:border-box;outline:none;">${makeOpts('17:00')}</select></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;">
        <button id="pt-confirm" style="flex:1;background:#6366f1;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;">✓ Set Times &amp; Save</button>
        <button id="pt-skip" style="background:#334155;color:#94a3b8;border:none;border-radius:8px;padding:10px 16px;font-size:13px;cursor:pointer;">Skip</button>
      </div></div>`;
    document.body.appendChild(ov);
    ov.querySelector('#pt-confirm').onclick=()=>{ const start=ov.querySelector('#pt-start').value,end=ov.querySelector('#pt-end').value; ov.remove(); resolve({start,end}); };
    ov.querySelector('#pt-skip').onclick=()=>{ ov.remove(); resolve(null); };
  });
}

// ─── LOG ───────────────────────────────────────────────────────────────────
function logLine(msg,type='info'){
  const el=panel.querySelector('#ot-log'); if(!el) return;
  const d=document.createElement('div'); d.className='ot-log-'+type; d.textContent=msg;
  el.appendChild(d); el.scrollTop=el.scrollHeight;
}

// ─── STYLES ────────────────────────────────────────────────────────────────
const style=document.createElement('style');
style.textContent=`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
:root{--ot-bg0:#0b0f1a;--ot-bg1:#111827;--ot-bg2:#1a2236;--ot-bg3:#222d42;--ot-border:#2a3650;--ot-indigo:#6366f1;--ot-green:#10b981;--ot-amber:#f59e0b;--ot-red:#ef4444;--ot-text:#e2e8f0;--ot-muted:#64748b;--ot-sub:#94a3b8;--ot-font:'DM Sans',sans-serif;}
#ot-toggle{position:fixed;bottom:24px;right:24px;z-index:999998;width:48px;height:48px;border-radius:14px;border:none;background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(99,102,241,0.5);font-family:var(--ot-font);transition:transform .15s;animation:ot-pulse 2.5s ease-out infinite;}
#ot-toggle:hover{transform:scale(1.08);}
@keyframes ot-pulse{0%{box-shadow:0 0 0 0 rgba(99,102,241,0.4);}70%{box-shadow:0 0 0 12px rgba(99,102,241,0);}100%{box-shadow:0 0 0 0 rgba(99,102,241,0);}}
#ot-panel{position:fixed;bottom:24px;right:24px;z-index:999999;width:540px;height:680px;min-width:400px;min-height:340px;display:flex;flex-direction:column;background:var(--ot-bg0);border:1px solid var(--ot-border);border-radius:18px;box-shadow:0 32px 96px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.05) inset;font-family:var(--ot-font);font-size:13px;color:var(--ot-text);overflow:hidden;}
#ot-panel.ot-hidden{display:none;}
.ot-resize{position:absolute;z-index:10;}
.ot-resize-e{top:12px;right:-4px;width:8px;height:calc(100% - 24px);cursor:ew-resize;}
.ot-resize-s{bottom:-4px;left:12px;height:8px;width:calc(100% - 24px);cursor:ns-resize;}
.ot-resize-w{top:12px;left:-4px;width:8px;height:calc(100% - 24px);cursor:ew-resize;}
.ot-resize-se{bottom:-4px;right:-4px;width:16px;height:16px;cursor:se-resize;}
#ot-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:var(--ot-bg1);border-bottom:1px solid var(--ot-border);cursor:move;user-select:none;flex-shrink:0;}
#ot-header-left{display:flex;align-items:center;gap:10px;}
.ot-logo{width:34px;height:34px;background:linear-gradient(135deg,#6366f1,#818cf8);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;box-shadow:0 4px 12px rgba(99,102,241,0.4);}
#ot-title{font-size:14px;font-weight:700;letter-spacing:-0.3px;}
#ot-subtitle{font-size:11px;color:var(--ot-muted);margin-top:2px;}
#ot-btn-close{background:none;border:1px solid var(--ot-border);color:var(--ot-muted);border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;font-family:var(--ot-font);transition:all .15s;}
#ot-btn-close:hover{border-color:var(--ot-red);color:var(--ot-red);}
.ot-tabs{display:flex;background:var(--ot-bg1);border-bottom:1px solid var(--ot-border);flex-shrink:0;padding:0 4px;gap:2px;}
.ot-tab{flex:1;padding:11px 0;text-align:center;font-size:11px;font-weight:600;color:var(--ot-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;border-radius:6px 6px 0 0;}
.ot-tab.active{color:var(--ot-indigo);border-bottom-color:var(--ot-indigo);background:rgba(99,102,241,0.06);}
.ot-pane{display:none;flex:1;flex-direction:column;min-height:0;padding:14px 16px;overflow-y:auto;}
.ot-pane.active{display:flex;}
.ot-label{font-size:11px;font-weight:600;color:var(--ot-muted);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;}
.ot-hint{font-size:12px;color:var(--ot-muted);line-height:1.6;}
.ot-card{background:var(--ot-bg1);border:1px solid var(--ot-border);border-radius:12px;padding:14px 16px;}
.ot-paste-area{width:100%;box-sizing:border-box;background:var(--ot-bg1);border:2px dashed var(--ot-border);border-radius:12px;color:var(--ot-text);font-family:var(--ot-font);font-size:12px;padding:14px;resize:none;min-height:100px;outline:none;transition:border-color .2s;line-height:1.6;}
.ot-paste-area:focus{border-color:var(--ot-indigo);border-style:solid;}
.ot-btn{width:100%;padding:10px;border-radius:9px;border:none;font-family:var(--ot-font);font-size:13px;font-weight:600;cursor:pointer;transition:all .18s;}
.ot-btn-indigo{background:linear-gradient(135deg,#6366f1,#7c3aed);color:#fff;}
.ot-btn-indigo:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 20px rgba(99,102,241,0.4);}
.ot-btn-indigo:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none;}
.ot-btn-ghost{background:var(--ot-bg2);color:var(--ot-sub);border:1px solid var(--ot-border);}
.ot-btn-ghost:hover{border-color:var(--ot-sub);color:var(--ot-text);}
.ot-btn-green{background:linear-gradient(135deg,#10b981,#059669);color:#fff;}
.ot-btn-green:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 20px rgba(16,185,129,0.4);}
.ot-btn-green:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none;}
.ot-stats{display:flex;gap:10px;align-items:center;padding:8px 0;flex-shrink:0;border-top:1px solid var(--ot-border);border-bottom:1px solid var(--ot-border);margin:8px 0;}
.ot-stat{display:flex;align-items:center;gap:5px;font-size:11px;}
.ot-stat-num{font-weight:700;font-size:13px;}
.ot-stat-lbl{color:var(--ot-muted);}
.ot-type-btn{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;border:2px solid var(--ot-border);background:var(--ot-bg1);cursor:pointer;transition:all .15s;}
.ot-type-btn:hover{border-color:var(--ot-sub);}
.ot-date-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--ot-bg2);transition:background .1s;}
.ot-date-row:hover{background:var(--ot-bg1);}
.ot-date-select{background:var(--ot-bg2);border:1px solid var(--ot-border);color:var(--ot-text);border-radius:6px;padding:4px 7px;font-size:11px;font-family:var(--ot-font);outline:none;max-width:140px;}
.ot-name-row{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--ot-bg2);transition:background .1s;}
.ot-name-row:hover{background:var(--ot-bg1);}
.ot-name-row.ot-row-skip{opacity:.45;}
.ot-name-select{flex:1;background:var(--ot-bg2);border:1px solid var(--ot-border);color:var(--ot-text);border-radius:6px;padding:4px 7px;font-size:11px;font-family:var(--ot-font);outline:none;min-width:0;}
#ot-log{flex:1;overflow-y:auto;min-height:0;background:#070b13;border:1px solid var(--ot-border);border-radius:10px;padding:10px 12px;font-size:11.5px;line-height:1.8;scrollbar-width:thin;scrollbar-color:var(--ot-border) transparent;display:none;font-family:'DM Mono','Courier New',monospace;}
.ot-log-info{color:var(--ot-sub);}
.ot-log-success{color:var(--ot-green);}
.ot-log-warn{color:var(--ot-amber);}
.ot-log-error{color:var(--ot-red);}
.ot-prog-wrap{width:100%;height:6px;background:var(--ot-bg3);border-radius:3px;overflow:hidden;flex-shrink:0;}
.ot-prog-fill{height:100%;background:linear-gradient(90deg,var(--ot-indigo),#818cf8);border-radius:3px;transition:width .3s;width:0%;}
.ot-prog-lbl{font-size:11px;color:var(--ot-sub);text-align:center;flex-shrink:0;margin-top:4px;}
`;
document.head.appendChild(style);

// ─── BUILD UI ──────────────────────────────────────────────────────────────
const toggleBtn=document.createElement('button');
toggleBtn.id='ot-toggle'; toggleBtn.textContent='📋'; toggleBtn.title='Attendance Importer';
document.body.appendChild(toggleBtn);

const panel=document.createElement('div');
panel.id='ot-panel'; panel.classList.add('ot-hidden');
panel.innerHTML=`
  <div class="ot-resize ot-resize-e" data-dir="e"></div>
  <div class="ot-resize ot-resize-w" data-dir="w"></div>
  <div class="ot-resize ot-resize-s" data-dir="s"></div>
  <div class="ot-resize ot-resize-se" data-dir="se"></div>
  <div id="ot-header">
    <div id="ot-header-left">
      <div class="ot-logo">📋</div>
      <div><div id="ot-title">Attendance Importer</div><div id="ot-subtitle">Paste · Dates · Students · Run</div></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="text-align:right;">
        <div id="ot-class-id" style="font-size:11px;font-weight:600;color:var(--ot-indigo);letter-spacing:0.08em;text-transform:uppercase;"></div>
        <div id="ot-class-name" style="font-size:14px;font-weight:700;color:var(--ot-text);max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
      </div>
      <button id="ot-btn-close">✕</button>
    </div>
  </div>
  <div class="ot-tabs">
    <div class="ot-tab active" data-pane="pane-import">① Import</div>
    <div class="ot-tab" data-pane="pane-dates">② Dates</div>
    <div class="ot-tab" data-pane="pane-run">③ Run</div>
  </div>

  <div class="ot-pane active" id="pane-import">
    <div class="ot-label">Select Class Type</div>
    <div id="ot-class-picker" style="display:grid;gap:8px;margin-bottom:14px;">
      <div class="ot-type-btn" data-type="fast-track">
        <div style="width:10px;height:10px;border-radius:50%;background:#6366f1;flex-shrink:0;"></div>
        <div><div style="font-size:13px;font-weight:600;">Fast Track</div><div style="font-size:11px;color:var(--ot-muted);margin-top:2px;">Mon · Tue · Thu · Fri &nbsp;|&nbsp; 8h/day</div></div>
      </div>
      <div class="ot-type-btn" data-type="weekend-warrior">
        <div style="width:10px;height:10px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
        <div><div style="font-size:13px;font-weight:600;">Weekend Warrior</div><div style="font-size:11px;color:var(--ot-muted);margin-top:2px;">Sat · Sun &nbsp;|&nbsp; 8h/day</div></div>
      </div>
      <div class="ot-type-btn" data-type="after-hours">
        <div style="width:10px;height:10px;border-radius:50%;background:#f59e0b;flex-shrink:0;"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">After Hours</div><div style="font-size:11px;color:var(--ot-muted);margin-top:2px;">Tue · Thu 4h &nbsp;+&nbsp; full day weekend</div></div>
      </div>
      <div id="ot-ah-picker" style="display:none;padding:10px 14px;background:var(--ot-bg2);border:1px solid var(--ot-border);border-radius:0 0 10px 10px;margin-top:-4px;">
        <div style="font-size:11px;font-weight:600;color:var(--ot-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Which day is the 8-hour day?</div>
        <div style="display:flex;gap:8px;">
          <button id="ot-ah-sat" style="flex:1;padding:8px;border-radius:7px;border:2px solid var(--ot-border);background:var(--ot-bg1);color:var(--ot-sub);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--ot-font);transition:all .15s;">Saturday</button>
          <button id="ot-ah-sun" style="flex:1;padding:8px;border-radius:7px;border:2px solid var(--ot-border);background:var(--ot-bg1);color:var(--ot-sub);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--ot-font);transition:all .15s;">Sunday</button>
        </div>
      </div>
      <div class="ot-type-btn" data-type="other">
        <div style="width:10px;height:10px;border-radius:50%;background:#64748b;flex-shrink:0;"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">Other / Custom</div><div style="font-size:11px;color:var(--ot-muted);margin-top:2px;">Custom schedule — enter expected hours</div></div>
      </div>
      <div id="ot-other-picker" style="display:none;padding:12px 14px;background:var(--ot-bg2);border:1px solid var(--ot-border);border-radius:0 0 10px 10px;margin-top:-4px;">
        <div style="font-size:11px;font-weight:600;color:var(--ot-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">Expected hours per day</div>
        <input id="ot-other-hours" type="number" min="0.5" step="0.5" placeholder="e.g. 8" value="8"
          style="width:100%;background:var(--ot-bg1);border:1px solid var(--ot-border);color:var(--ot-text);border-radius:7px;padding:7px 9px;font-size:13px;font-family:var(--ot-font);outline:none;box-sizing:border-box;" />
        <div style="font-size:11px;color:var(--ot-muted);margin-top:6px;">Script will just click Save for full days. Partial hours get a time-entry popup.</div>
      </div>
    </div>
    <div class="ot-label">Paste Excel attendance table</div>
    <textarea class="ot-paste-area" id="ot-paste" spellcheck="false" placeholder="Copy the full table from Excel (date header row + all student rows) and paste here"></textarea>
    <div class="ot-hint" style="margin-top:8px;">First row = dates (1/5/26). First column = student names. Values = hours (blank/0 = absent).</div>
    <div id="ot-parse-result" style="display:none;margin-top:10px;" class="ot-card"></div>
    <div id="ot-picker-warning" style="display:none;margin-top:8px;font-size:12px;color:var(--ot-amber);padding:8px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:8px;">⚠ Please select a class type above before continuing.</div>
    <div style="flex:1"></div>
    <button class="ot-btn ot-btn-indigo" id="ot-btn-to-dates" style="display:none;margin-top:12px;">② Confirm Dates →</button>
  </div>

  <div class="ot-pane" id="pane-dates">
    <div id="ot-dates-no-data" class="ot-hint" style="color:var(--ot-red);">Paste your Excel data in tab ① first.</div>
    <div id="ot-dates-body" style="display:none;flex-direction:column;flex:1;min-height:0;">
      <div class="ot-hint" style="margin-bottom:8px;flex-shrink:0;">Confirm each sidebar date matches the right Excel column.</div>
      <div class="ot-stats">
        <div class="ot-stat"><span class="ot-stat-num" id="ds-matched" style="color:var(--ot-green)">0</span><span class="ot-stat-lbl">matched</span></div>
        <span style="color:var(--ot-border)">·</span>
        <div class="ot-stat"><span class="ot-stat-num" id="ds-unmatched" style="color:var(--ot-amber)">0</span><span class="ot-stat-lbl">unmatched</span></div>
        <span style="color:var(--ot-border)">·</span>
        <div class="ot-stat"><span class="ot-stat-num" id="ds-total" style="color:var(--ot-sub)">0</span><span class="ot-stat-lbl">total</span></div>
      </div>
      <div id="ot-date-list" style="flex:1;overflow-y:auto;min-height:0;border:1px solid var(--ot-border);border-radius:9px;"></div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-shrink:0;">
        <button class="ot-btn ot-btn-ghost" id="ot-btn-rescan" style="width:auto;padding:10px 14px;">↺ Re-scan</button>
        <button class="ot-btn ot-btn-indigo" id="ot-btn-to-run">③ Match Students →</button>
      </div>
    </div>
  </div>

  <div class="ot-pane" id="pane-run">
    <div id="ot-run-no-data" class="ot-hint" style="color:var(--ot-red);">Set up dates in tab ② first.</div>
    <div id="ot-run-body" style="display:none;flex-direction:column;flex:1;min-height:0;gap:8px;">
      <div id="ot-name-section" style="display:flex;flex-direction:column;flex:1;min-height:0;gap:8px;">
        <div class="ot-card" id="ot-run-summary" style="flex-shrink:0;font-size:12px;color:var(--ot-sub);line-height:1.8;"></div>
        <div class="ot-stats" style="flex-shrink:0;">
          <div class="ot-stat"><span class="ot-stat-num" id="ns-exact" style="color:var(--ot-green)">0</span><span class="ot-stat-lbl">exact</span></div>
          <span style="color:var(--ot-border)">·</span>
          <div class="ot-stat"><span class="ot-stat-num" id="ns-fuzzy" style="color:var(--ot-amber)">0</span><span class="ot-stat-lbl">fuzzy</span></div>
          <span style="color:var(--ot-border)">·</span>
          <div class="ot-stat"><span class="ot-stat-num" id="ns-none" style="color:var(--ot-red)">0</span><span class="ot-stat-lbl">unmatched</span></div>
          <div style="flex:1"></div>
          <button id="ot-btn-rematch" style="font-size:11px;padding:4px 10px;background:var(--ot-bg2);border:1px solid var(--ot-border);color:var(--ot-sub);border-radius:6px;cursor:pointer;font-family:var(--ot-font);">↺ Re-scan names</button>
        </div>
        <div id="ot-name-list" style="flex:1;overflow-y:auto;min-height:0;border:1px solid var(--ot-border);border-radius:9px;"></div>
        <button class="ot-btn ot-btn-green" id="ot-btn-run">▶ Run Import</button>
      </div>
      <div id="ot-progress-section" style="display:none;flex-direction:column;flex:1;min-height:0;gap:8px;">
        <div class="ot-prog-wrap"><div class="ot-prog-fill" id="ot-prog-fill"></div></div>
        <div class="ot-prog-lbl" id="ot-prog-lbl">Running…</div>
        <div id="ot-log"></div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button class="ot-btn ot-btn-ghost" id="ot-btn-stop" style="width:auto;padding:10px 14px;color:var(--ot-red);border-color:rgba(239,68,68,0.3);">■ Stop</button>
          <button class="ot-btn ot-btn-ghost" id="ot-btn-back-to-preview" style="flex:1;">← Back to Preview</button>
        </div>
      </div>
    </div>
  </div>
`;
document.body.appendChild(panel);

// ─── UI WIRING ─────────────────────────────────────────────────────────────
function refreshClassInfo(){
  const{id,tracker}=getClassInfo();
  panel.querySelector('#ot-class-id').textContent  = id      ? 'ID '+id : '';
  panel.querySelector('#ot-class-name').textContent= tracker ? tracker  : 'Unknown Class';
}

function checkReadyToAdvance(){
  const btn=panel.querySelector('#ot-btn-to-dates');
  const warn=panel.querySelector('#ot-picker-warning');
  if(parsedData&&selectedClassType){ btn.style.display='block'; warn.style.display='none'; }
  else btn.style.display='none';
}

function switchTab(id){
  panel.querySelectorAll('.ot-tab,.ot-pane').forEach(el=>el.classList.remove('active'));
  panel.querySelector('[data-pane="'+id+'"]').classList.add('active');
  document.getElementById(id).classList.add('active');
  if(id==='pane-dates') initDatesPane();
  if(id==='pane-run')   initRunPane();
}

toggleBtn.addEventListener('click',()=>{ refreshClassInfo(); panel.classList.remove('ot-hidden'); toggleBtn.style.display='none'; });
panel.querySelector('#ot-btn-close').addEventListener('click',()=>{ panel.classList.add('ot-hidden'); toggleBtn.style.display='flex'; });

let dragging=false,ox=0,oy=0;
panel.querySelector('#ot-header').addEventListener('mousedown',e=>{ dragging=true; const r=panel.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; panel.style.right='auto'; panel.style.bottom='auto'; });
document.addEventListener('mousemove',e=>{ if(!dragging) return; panel.style.left=(e.clientX-ox)+'px'; panel.style.top=(e.clientY-oy)+'px'; });
document.addEventListener('mouseup',()=>{ dragging=false; });

let resizing=false,resDir='',rsX=0,rsY=0,rsW=0,rsH=0,rsL=0,rsT=0;
panel.querySelectorAll('.ot-resize').forEach(h=>{ h.addEventListener('mousedown',e=>{ e.preventDefault(); e.stopPropagation(); resizing=true; resDir=h.dataset.dir; rsX=e.clientX; rsY=e.clientY; const r=panel.getBoundingClientRect(); rsW=r.width; rsH=r.height; rsL=r.left; rsT=r.top; panel.style.right='auto'; panel.style.bottom='auto'; panel.style.left=rsL+'px'; panel.style.top=rsT+'px'; }); });
document.addEventListener('mousemove',e=>{ if(!resizing) return; const dx=e.clientX-rsX,dy=e.clientY-rsY; if(resDir.includes('e')) panel.style.width=Math.max(400,rsW+dx)+'px'; if(resDir.includes('s')) panel.style.height=Math.max(340,rsH+dy)+'px'; if(resDir.includes('w')){ const nw=Math.max(400,rsW-dx); panel.style.width=nw+'px'; panel.style.left=(rsL+rsW-nw)+'px'; } });
document.addEventListener('mouseup',()=>{ resizing=false; });

panel.querySelectorAll('.ot-tab').forEach(tab=>{ tab.addEventListener('click',()=>switchTab(tab.dataset.pane)); });

// Class picker
panel.querySelectorAll('.ot-type-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    panel.querySelectorAll('.ot-type-btn').forEach(b=>{ b.style.border='2px solid var(--ot-border)'; b.style.background='var(--ot-bg1)'; });
    const type=btn.dataset.type;
    const cfg=CLASS_CONFIG[type];
    btn.style.border='2px solid '+cfg.color;
    btn.style.background='rgba('+hexToRgb(cfg.color)+',0.08)';
    selectedClassType=type;
    panel.querySelector('#ot-class-id').style.color=cfg.color;
    panel.querySelector('#ot-ah-picker').style.display    = type==='after-hours' ? 'block' : 'none';
    panel.querySelector('#ot-other-picker').style.display = type==='other'       ? 'block' : 'none';
    checkReadyToAdvance();
  });
});

// After Hours day picker
function setAhDay(day){
  afterHoursLongDay=day;
  const s=panel.querySelector('#ot-ah-sat'), u=panel.querySelector('#ot-ah-sun');
  if(s){ s.style.border=day===6?'2px solid #f59e0b':'2px solid var(--ot-border)'; s.style.color=day===6?'#f59e0b':'var(--ot-sub)'; s.style.background=day===6?'rgba(245,158,11,0.1)':'var(--ot-bg1)'; }
  if(u){ u.style.border=day===0?'2px solid #f59e0b':'2px solid var(--ot-border)'; u.style.color=day===0?'#f59e0b':'var(--ot-sub)'; u.style.background=day===0?'rgba(245,158,11,0.1)':'var(--ot-bg1)'; }
}
panel.querySelector('#ot-ah-sat').addEventListener('click',e=>{ e.stopPropagation(); setAhDay(6); });
panel.querySelector('#ot-ah-sun').addEventListener('click',e=>{ e.stopPropagation(); setAhDay(0); });
panel.querySelector('#ot-ah-picker').addEventListener('click',e=>e.stopPropagation());
panel.querySelector('#ot-other-picker').addEventListener('click',e=>e.stopPropagation());
setAhDay(6);

// Other hours input
const otherHoursInp=panel.querySelector('#ot-other-hours');
otherHoursInp.addEventListener('input',()=>{ const v=parseFloat(otherHoursInp.value); if(!isNaN(v)&&v>0) otherBreak=0; });

// Paste
const pasteArea=panel.querySelector('#ot-paste');
pasteArea.addEventListener('paste',()=>setTimeout(()=>processPaste(pasteArea.value),0));
pasteArea.addEventListener('input',()=>{ if(pasteArea.value.trim()) processPaste(pasteArea.value); });

function processPaste(raw){
  const result=parsePaste(raw);
  const infoEl=panel.querySelector('#ot-parse-result');
  if(!result||!result.students.length){
    infoEl.style.display='block';
    infoEl.innerHTML='<span style="color:var(--ot-red);">Could not parse — check format.</span>';
    parsedData=null; checkReadyToAdvance(); return;
  }
  parsedData=result;
  infoEl.style.display='block';
  infoEl.innerHTML='<span style="color:var(--ot-green);font-weight:600;">✓ Parsed</span><br>'
    +'<span style="color:var(--ot-sub);">'+result.students.length+' students · '+result.dates.length+' dates</span>';
  checkReadyToAdvance();
}

panel.querySelector('#ot-btn-to-dates').addEventListener('click',()=>{
  if(!selectedClassType){ panel.querySelector('#ot-picker-warning').style.display='block'; return; }
  switchTab('pane-dates');
});

// ─── DATES TAB ─────────────────────────────────────────────────────────────
function initDatesPane(){
  const noData=panel.querySelector('#ot-dates-no-data'),body=panel.querySelector('#ot-dates-body');
  if(!parsedData){ noData.style.display='block'; body.style.display='none'; return; }
  noData.style.display='none'; body.style.display='flex';
  buildDateMappings();
}

function buildDateMappings(){
  const sidebarDates=scanSidebarDates();
  dateMappings=sidebarDates.map(sd=>{
    let bestColIdx=null;
    parsedData.dates.forEach((d,i)=>{ if(excelDateToISO(d)===sd.iso) bestColIdx=i; });
    return{sidebarDate:sd,excelColIndex:bestColIdx};
  });
  renderDateList();
}

function renderDateList(){
  const list=panel.querySelector('#ot-date-list'); list.innerHTML='';
  let matched=0,unmatched=0;
  dateMappings.forEach((mapping,i)=>{
    const{sidebarDate,excelColIndex}=mapping;
    const isMatched=excelColIndex!==null;
    if(isMatched) matched++; else unmatched++;
    const row=document.createElement('div'); row.className='ot-date-row';
    const icon=isMatched?'<span style="color:var(--ot-green)">●</span>':'<span style="color:var(--ot-amber)">○</span>';
    const opts=['<option value="" '+(excelColIndex===null?'selected':'')+'>— skip —</option>']
      .concat(parsedData.dates.map((d,ci)=>'<option value="'+ci+'" '+(excelColIndex===ci?'selected':'')+'>'+esc(d)+'</option>'));
    row.innerHTML=`<div style="width:20px;text-align:center;">${icon}</div><div style="flex:1;font-size:12px;">${esc(sidebarDate.label)}</div><div style="color:var(--ot-muted);font-size:12px;">→</div><select class="ot-date-select" data-midx="${i}">${opts.join('')}</select>`;
    list.appendChild(row);
  });
  panel.querySelector('#ds-matched').textContent=matched;
  panel.querySelector('#ds-unmatched').textContent=unmatched;
  panel.querySelector('#ds-total').textContent=dateMappings.length;
  panel.querySelector('#ot-btn-to-run').disabled=matched===0;
  list.querySelectorAll('.ot-date-select').forEach(sel=>{
    sel.addEventListener('change',e=>{
      const idx=parseInt(e.target.dataset.midx),val=e.target.value;
      dateMappings[idx].excelColIndex=val===''?null:parseInt(val);
      renderDateList();
    });
  });
}

panel.querySelector('#ot-btn-rescan').addEventListener('click',buildDateMappings);
panel.querySelector('#ot-btn-to-run').addEventListener('click',()=>switchTab('pane-run'));

// ─── RUN TAB ───────────────────────────────────────────────────────────────
function initRunPane(){
  const noData=panel.querySelector('#ot-run-no-data'),body=panel.querySelector('#ot-run-body');
  if(!parsedData||!dateMappings.length){ noData.style.display='block'; body.style.display='none'; return; }
  noData.style.display='none'; body.style.display='flex';
  panel.querySelector('#ot-name-section').style.display='flex';
  panel.querySelector('#ot-progress-section').style.display='none';
  const active=dateMappings.filter(m=>m.excelColIndex!==null);
  panel.querySelector('#ot-run-summary').innerHTML=
    '<strong style="color:var(--ot-text);">'+active.length+'</strong> dates · <strong style="color:var(--ot-text);">'+parsedData.students.length+'</strong> students<br>'
    +'<span style="font-size:11px;color:var(--ot-muted);">Full day = Save only. Absent = absent+save+makeup. Partial = time popup. 🔴 = absent no makeup.</span>';
  buildNameMappings();
}

function buildNameMappings(){
  const rosterNames=scanRosterNames();
  nameMappings=parsedData.students.map(s=>{
    const match=bestNameMatch(s.name,rosterNames);
    return{ excelName:s.name, rosterName:match?rosterNames[match.idx]:null, status:match?(match.score>=0.92?'exact':'fuzzy'):'unmatched', score:match?match.score:0, skipped:false, absentNoMakeup:false };
  });
  renderNameList();
}

function renderNameList(){
  const list=panel.querySelector('#ot-name-list');
  const rosterNames=scanRosterNames();
  list.innerHTML='';
  let exact=0,fuzzy=0,none=0;
  nameMappings.forEach((m,i)=>{
    if(m.status==='exact') exact++; else if(m.status==='fuzzy') fuzzy++; else none++;
    const row=document.createElement('div');
    row.className='ot-name-row'+(m.skipped?' ot-row-skip':'');
    const icon=m.skipped?'<span style="color:var(--ot-amber)">—</span>':m.absentNoMakeup?'<span title="Absent no makeup">📵</span>':m.status==='exact'?'<span style="color:var(--ot-green)">●</span>':m.status==='fuzzy'?'<span style="color:var(--ot-amber)">◐</span>':'<span style="color:var(--ot-red)">○</span>';
    const opts=['<option value="">— skip —</option>'].concat(rosterNames.map(rn=>'<option value="'+esc(rn)+'" '+(m.rosterName===rn?'selected':'')+'>'+esc(rn)+'</option>'));
    row.innerHTML=`
      <div style="width:18px;text-align:center;font-size:12px;">${icon}</div>
      <div style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(m.excelName)}">${esc(m.excelName)}</div>
      <div style="color:var(--ot-muted);font-size:12px;flex-shrink:0;">→</div>
      <select class="ot-name-select" data-nidx="${i}" ${(m.skipped||m.absentNoMakeup)?'disabled':''}>${opts.join('')}</select>
      <button class="ot-absent-btn" data-nidx="${i}" title="${m.absentNoMakeup?'Undo':'Mark absent whole class (no makeup)'}" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px;opacity:${m.absentNoMakeup?1:0.35};flex-shrink:0;">🔴</button>
      <button class="ot-skip-btn" data-nidx="${i}" title="${m.skipped?'Un-skip':'Skip'}" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px;color:var(--ot-muted);flex-shrink:0;">${m.skipped?'↺':'✕'}</button>`;
    list.appendChild(row);
  });
  panel.querySelector('#ns-exact').textContent=exact;
  panel.querySelector('#ns-fuzzy').textContent=fuzzy;
  panel.querySelector('#ns-none').textContent=none;
  list.querySelectorAll('.ot-name-select').forEach(sel=>{
    sel.addEventListener('change',e=>{
      const idx=parseInt(e.target.dataset.nidx),val=e.target.value;
      nameMappings[idx].rosterName=val||null;
      nameMappings[idx].status=val?'fuzzy':'unmatched';
      renderNameList();
    });
  });
  list.querySelectorAll('.ot-absent-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const idx=parseInt(e.currentTarget.dataset.nidx);
      nameMappings[idx].absentNoMakeup=!nameMappings[idx].absentNoMakeup;
      if(nameMappings[idx].absentNoMakeup) nameMappings[idx].skipped=false;
      renderNameList();
    });
  });
  list.querySelectorAll('.ot-skip-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const idx=parseInt(e.currentTarget.dataset.nidx);
      nameMappings[idx].skipped=!nameMappings[idx].skipped;
      renderNameList();
    });
  });
}

panel.querySelector('#ot-btn-rematch').addEventListener('click',buildNameMappings);
panel.querySelector('#ot-btn-back-to-preview').addEventListener('click',()=>{
  panel.querySelector('#ot-name-section').style.display='flex';
  panel.querySelector('#ot-progress-section').style.display='none';
});

// ─── MAIN RUN ──────────────────────────────────────────────────────────────
panel.querySelector('#ot-btn-run').addEventListener('click',async()=>{
  if(running) return;
  running=true; stopped=false;
  panel.querySelector('#ot-name-section').style.display='none';
  panel.querySelector('#ot-progress-section').style.display='flex';
  const logEl=panel.querySelector('#ot-log');
  logEl.style.display='block'; logEl.innerHTML='';
  panel.querySelector('#ot-prog-fill').style.width='0%';

  const active=dateMappings.filter(m=>m.excelColIndex!==null);
  const nameMap=new Map();
  nameMappings.forEach(m=>{ if(!m.skipped&&m.rosterName) nameMap.set(m.excelName,{rosterName:m.rosterName,noMakeup:m.absentNoMakeup}); });
  const flagged=[]; let doneCount=0;

  // Get expected hours for 'other' class from input
  let otherExpected=8;
  const otherHoursVal=parseFloat(panel.querySelector('#ot-other-hours')?.value);
  if(selectedClassType==='other'&&!isNaN(otherHoursVal)&&otherHoursVal>0) otherExpected=otherHoursVal;

  for(const mapping of active){
    if(stopped){ logLine('■ Stopped.','warn'); break; }
    const{sidebarDate,excelColIndex}=mapping;
    const expectedHours = selectedClassType==='other' ? otherExpected : getExpectedHours(sidebarDate.iso);
    logLine('📆 '+sidebarDate.label+' (expected '+expectedHours+'h)');
    panel.querySelector('#ot-prog-lbl').textContent='Processing '+sidebarDate.label+'…';

    sidebarDate.element.click();
    await sleep(600);

    for(const student of parsedData.students){
      if(stopped) break;
      const h=student.hours[excelColIndex];
      const nameEntry=nameMap.get(student.excelName||student.name)||nameMap.get(student.name);
      if(!nameEntry){ logLine('  ⚠ '+student.name+': no name match — skipped','warn'); continue; }
      const{rosterName,noMakeup}=nameEntry;

      // ABSENT NO MAKEUP
      if(noMakeup){
        logLine('  ✗ '+student.name+' → '+rosterName+': absent (no makeup)');
        await checkAbsentAndSave(rosterName);
        continue;
      }

      // ABSENT
      if(h===null||h===0){
        logLine('  ✗ '+student.name+' → '+rosterName+': absent');
        const ok=await checkAbsentAndSave(rosterName);
        if(ok) await runMakeupLoop(rosterName,sidebarDate.label);
        continue;
      }

      // PARTIAL — popup for times
      if(h<expectedHours){
        logLine('  ⚠ '+student.name+' → '+rosterName+': '+h+'h partial','warn');
        const times=await promptTimes(rosterName,sidebarDate.label);
        if(times){
          await setTimesAndSave(rosterName,times.start,times.end);
          logLine('    ↳ '+times.start+' → '+times.end,'success');
        } else {
          logLine('    ↳ Skipped — fix manually','warn');
          flagged.push(student.name+' | '+sidebarDate.label+' | '+h+'h/'+expectedHours+'h');
        }
        continue;
      }

      // FULL DAY (exact or over) — just Save
      logLine('  ✓ '+student.name+' → '+rosterName+': '+h+'h');
      await clickSave(rosterName);
    }

    doneCount++;
    panel.querySelector('#ot-prog-fill').style.width=Math.round((doneCount/active.length)*100)+'%';
  }

  panel.querySelector('#ot-prog-lbl').textContent=stopped
    ?'Stopped — '+doneCount+'/'+active.length+' dates'
    :'✓ Complete — '+doneCount+'/'+active.length+' dates';
  logLine('── Complete ──','success');
  if(flagged.length){
    logLine('⚠ Fix manually:','warn');
    flagged.forEach(f=>logLine('   • '+f,'warn'));
  }
  running=false;
});

panel.querySelector('#ot-btn-stop').addEventListener('click',()=>{
  stopped=true;
  panel.querySelector('#ot-prog-lbl').textContent='Stopping…';
});

setTimeout(()=>refreshClassInfo(), 800);

})();