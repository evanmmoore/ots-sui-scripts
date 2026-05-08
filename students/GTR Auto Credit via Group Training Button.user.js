// ==UserScript==
// @name         GTR Auto Credit via Group Training Button
// @namespace    http://otsystems.net/
// @version      5.1.2
// @description  Auto-completes course sections for a list of students, persists state across page loads
// @match        https://otsystems.net/admin/students/dashboard/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'gtr_job';

    const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
#gtr-ui *{box-sizing:border-box;font-family:'DM Sans',sans-serif;}
#gtr-ui{position:fixed;top:16px;right:16px;width:380px;background:#0f172a;border:1px solid #1e293b;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,0.7);z-index:99999;overflow:hidden;color:#e2e8f0;}
#gtr-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#111827;border-bottom:1px solid #1e293b;cursor:move;user-select:none;}
#gtr-header-left{display:flex;align-items:center;gap:10px;}
#gtr-logo{width:32px;height:32px;background:linear-gradient(135deg,#10b981,#059669);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
#gtr-title{font-size:14px;font-weight:700;color:#f1f5f9;}
#gtr-subtitle{font-size:11px;color:#64748b;margin-top:1px;}
#gtr-close{background:none;border:1px solid #1e293b;color:#64748b;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;transition:all .15s;}
#gtr-close:hover{border-color:#ef4444;color:#ef4444;}
#gtr-body{padding:16px;}
.gtr-label{font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.gtr-input{width:100%;background:#1e293b;border:1px solid #2a3650;color:#e2e8f0;border-radius:8px;padding:8px 11px;font-size:13px;outline:none;transition:border-color .15s;resize:none;}
.gtr-input:focus{border-color:#10b981;}
.gtr-row{margin-bottom:12px;}
.gtr-grid{display:grid;grid-template-columns:3fr 2fr;gap:10px;margin-bottom:12px;}
.gtr-btn{width:100%;padding:10px;border-radius:9px;border:none;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .18s;}
.gtr-btn-green{background:linear-gradient(135deg,#10b981,#059669);color:#fff;}
.gtr-btn-green:hover{filter:brightness(1.1);transform:translateY(-1px);}
.gtr-btn-green:disabled{opacity:.4;cursor:not-allowed;transform:none;}
.gtr-btn-ghost{background:#1e293b;color:#94a3b8;border:1px solid #2a3650;}
.gtr-btn-ghost:hover{border-color:#94a3b8;color:#e2e8f0;}
#gtr-progress-section{display:none;}
#gtr-queue{background:#070b13;border:1px solid #1e293b;border-radius:9px;padding:10px 12px;max-height:180px;overflow-y:auto;margin-bottom:12px;font-size:12px;font-family:'DM Mono','Courier New',monospace;line-height:1.8;}
.gtr-q-done{color:#10b981;}
.gtr-q-active{color:#f59e0b;font-weight:600;}
.gtr-q-pending{color:#475569;}
.gtr-q-error{color:#ef4444;}
#gtr-status-bar{background:#1e293b;border:1px solid #2a3650;border-radius:8px;padding:10px 12px;font-size:12px;color:#94a3b8;margin-bottom:12px;min-height:38px;}
#gtr-prog-wrap{width:100%;height:5px;background:#1e293b;border-radius:3px;overflow:hidden;margin-bottom:8px;}
#gtr-prog-fill{height:100%;background:linear-gradient(90deg,#10b981,#34d399);border-radius:3px;transition:width .3s;width:0%;}
`;

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);

    // Disable CSS transitions for faster completion
    const fastStyle = document.createElement('style');
    fastStyle.textContent = `* { transition: none !important; animation: none !important; } .popover { transition: none !important; }`;
    document.head.appendChild(fastStyle);

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function waitForElement(selector, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const interval = 100;
            let elapsed = 0;
            const check = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) { clearInterval(check); resolve(el); }
                else if (elapsed >= timeout) { clearInterval(check); reject(new Error('Timeout waiting for: ' + selector)); }
                elapsed += interval;
            }, interval);
        });
    }

    window.alert = function(msg){ console.warn('[GTR] Auto-dismissed alert:', msg); };

    // ── PAGE AUTOMATION ────────────────────────────────────────────────

    async function clickClassesTab() {
        const tab = Array.from(document.querySelectorAll('li[ng-class] a'))
            .find(a => a.textContent.trim().startsWith('Classes'));
        if (!tab) throw new Error('Classes tab not found');
        tab.click();
        await waitForElement('div.panel.panel-primary', 5000);
    }

    async function clickGearAndManageProgress(targetText) {
        await waitForElement('div.panel.panel-primary', 10000);
        const panels = Array.from(document.querySelectorAll('div.panel.panel-primary'));
        for (const panel of panels) {
            const heading = panel.querySelector('.panel-heading.clearfix');
            if (!heading) continue;
            if (!heading.textContent.replace(/\s+/g, ' ').toLowerCase().includes(targetText.toLowerCase())) continue;
            const gearBtn = heading.querySelector('button.btn.btn-sm.btn-primary > i.fa.fa-cog')?.parentElement;
            if (!gearBtn) continue;
            gearBtn.click();
            await sleep(200);
            const manageLink = Array.from(heading.querySelectorAll('ul.dropdown-menu li a'))
                .find(a => a.textContent.toLowerCase().includes('manage progress'));
            if (!manageLink) throw new Error("'Manage Progress' link not found");
            manageLink.click();
            await sleep(400);
            return;
        }
        throw new Error('Course panel not found: ' + targetText);
    }

    async function completeSections(maxSections) {
        await waitForElement('button.popover-button', 8000);
        await sleep(100);
        const buttons = Array.from(document.querySelectorAll('button.popover-button')).filter(btn => {
            const hasPencil = btn.querySelector('.fa-pencil');
            const title = btn.getAttribute('popover-title') || '';
            return hasPencil && /-CON-/i.test(title);
        });
        let completed = 0;
        for (const btn of buttons) {
            if (completed >= maxSections) break;
            try {
                btn.click();
                let completeBtn = document.querySelector('button.btn-info');
                if (!completeBtn) { await sleep(150); completeBtn = document.querySelector('button.btn-info'); }
                if (completeBtn) {
                    const span = completeBtn.querySelector('span.ng-scope');
                    if (span && span.textContent.trim() === 'Complete') { completeBtn.click(); completed++; }
                }
                await sleep(30);
            } catch {
                const cancel = document.querySelector('button.btn.btn-default[ng-click="cancel()"]');
                if (cancel) cancel.click();
                await sleep(50);
            }
        }
        return completed;
    }

    // ── SESSION STORAGE ────────────────────────────────────────────────
    function saveJob(job){ sessionStorage.setItem(STORAGE_KEY, JSON.stringify(job)); }
    function loadJob(){ try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; } }
    function clearJob(){ sessionStorage.removeItem(STORAGE_KEY); }

    // ── ORIGINAL UI ──────────────────────────────────────────────────
    function openUI() {
        if (document.getElementById('gtr-ui')) return;
        const ui = document.createElement('div');
        ui.id = 'gtr-ui';
        ui.innerHTML = `
            <div id="gtr-header">
                <div id="gtr-header-left">
                    <div id="gtr-logo">🎓</div>
                    <div>
                        <div id="gtr-title">Group Training</div>
                        <div id="gtr-subtitle">Auto credit</div>
                    </div>
                </div>
                <button id="gtr-close">✕</button>
            </div>
            <div id="gtr-body">
                <div id="gtr-setup-section">
                    <div class="gtr-row">
                        <label class="gtr-label">Student Numbers (one per line or comma-separated)</label>
                        <textarea id="gtr-students" class="gtr-input" rows="5" placeholder="123456&#10;789012&#10;345678"></textarea>
                    </div>
                    <div class="gtr-row">
                        <label class="gtr-label">Course Name</label>
                        <input id="gtr-course" class="gtr-input" type="text" placeholder="e.g. 8 Hour HAZWOPER Refresher" />
                    </div>
                    <div class="gtr-grid">
                        <div>
                            <label class="gtr-label">Sections to complete (skips exams)</label>
                            <input id="gtr-sections" class="gtr-input" type="number" value="19" min="1" />
                        </div>
                        <div style="display:flex;align-items:flex-end;">
                            <button id="gtr-start-btn" class="gtr-btn gtr-btn-green">▶ Run All</button>
                        </div>
                    </div>
                    <div id="gtr-setup-error" style="display:none;font-size:12px;color:#ef4444;margin-top:-4px;margin-bottom:8px;padding:8px 10px;background:rgba(239,68,68,0.1);border-radius:7px;border:1px solid rgba(239,68,68,0.25);"></div>
                </div>
                <div id="gtr-progress-section">
                    <div id="gtr-prog-wrap"><div id="gtr-prog-fill"></div></div>
                    <div id="gtr-status-bar">Starting…</div>
                    <div id="gtr-queue"></div>
                    <button id="gtr-stop-btn" class="gtr-btn gtr-btn-ghost">■ Stop</button>
                </div>
            </div>
        `;
        document.body.appendChild(ui);

        // CLOSE
        ui.querySelector('#gtr-close').addEventListener('click', ()=>{ clearJob(); ui.remove(); });

        // DRAG
        let dragging=false, ox=0, oy=0;
        ui.querySelector('#gtr-header').addEventListener('mousedown', e=>{ dragging=true; const r=ui.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; });
        document.addEventListener('mousemove', e=>{ if(!dragging) return; ui.style.left=(e.clientX-ox)+'px'; ui.style.top=(e.clientY-oy)+'px'; ui.style.right='auto'; });
        document.addEventListener('mouseup', ()=>{ dragging=false; });

        // RUN BUTTON
        ui.querySelector('#gtr-start-btn').addEventListener('click', () => {
            const raw = ui.querySelector('#gtr-students').value;
            const course = ui.querySelector('#gtr-course').value.trim();
            const sections = Number(ui.querySelector('#gtr-sections').value) || 19;
            const errorEl = ui.querySelector('#gtr-setup-error');
            const students = raw.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
            if(!students.length){ errorEl.style.display='block'; errorEl.textContent='Enter at least one student number.'; return; }
            if(!course){ errorEl.style.display='block'; errorEl.textContent='Enter a course name.'; return; }
            errorEl.style.display='none';
            ui.querySelector('#gtr-setup-section').style.display='none';
            ui.querySelector('#gtr-progress-section').style.display='block';
            saveJob({ students, course, sections, index:0, errors:[] });
            const url = new URL(window.location.href);
            url.searchParams.set('student_number', students[0]);
            url.searchParams.set('_gtr', Date.now());
            window.location.href = url.href;
        });

        ui.querySelector('#gtr-stop-btn').addEventListener('click', ()=>{
            clearJob(); ui.querySelector('#gtr-status-bar').textContent='■ Stopped.';
        });
    }

    // ── Inject Button AFTER openUI exists
    function injectGroupTrainingButton(timeout=15000){
        const interval=200; let elapsed=0;
        const check=setInterval(()=>{
            const transferBtn=document.querySelector('button[enrollment-transfer]');
            if(transferBtn){
                clearInterval(check);
                if(document.getElementById('gtr-open-btn')) return;
                const groupBtn=document.createElement('button');
                groupBtn.id='gtr-open-btn';
                groupBtn.className='btn btn-success';
                groupBtn.style.marginLeft='5px';
                groupBtn.textContent='Group Training';
                transferBtn.insertAdjacentElement('afterend', groupBtn);
                groupBtn.addEventListener('click', ()=>openUI());
            } else if(elapsed>=timeout){ clearInterval(check); }
            elapsed+=interval;
        }, interval);
    }

    injectGroupTrainingButton();

    // ── RESUME JOB
    async function resume(){
        const job=loadJob();
        if(!job) return;
        openUI(); await sleep(100);
        const ui=document.getElementById('gtr-ui');
        if(!ui) return;
        ui.querySelector('#gtr-setup-section').style.display='none';
        ui.querySelector('#gtr-progress-section').style.display='block';
        let {students, course, sections}=job;
        let {index, errors}=job;

        function setStatus(msg){ const el=ui.querySelector('#gtr-status-bar'); if(el) el.textContent=msg; }
        function setProgress(done,total){ const el=ui.querySelector('#gtr-prog-fill'); if(el) el.style.width=Math.round((done/total)*100)+'%'; }
        function updateQueue(currentIndex){
            const el=ui.querySelector('#gtr-queue');
            if(!el) return;
            el.innerHTML=students.map((s,i)=>{
                if(errors.includes(i)) return `<div class="gtr-q-error">✗ ${s}</div>`;
                if(i<currentIndex) return `<div class="gtr-q-done">✓ ${s}</div>`;
                if(i===currentIndex) return `<div class="gtr-q-active">→ ${s}</div>`;
                return `<div class="gtr-q-pending">○ ${s}</div>`;
            }).join('');
            const active=el.querySelector('.gtr-q-active'); if(active) active.scrollIntoView({block:'nearest'});
        }

        ui.querySelector('#gtr-stop-btn').addEventListener('click', ()=>{
            clearJob(); setStatus('■ Stopped.');
        });

        updateQueue(index); setProgress(index,students.length);
        setStatus(`[${index+1}/${students.length}] Page loaded — waiting for Angular…`);
        await sleep(1000);
        if(!loadJob()){ setStatus('■ Stopped.'); return; }

        try{
            setStatus(`[${index+1}/${students.length}] Opening Classes tab…`); await clickClassesTab();
            setStatus(`[${index+1}/${students.length}] Finding course: ${course}…`); await clickGearAndManageProgress(course);
            setStatus(`[${index+1}/${students.length}] Completing sections…`);
            const done=await completeSections(sections);
            setStatus(`[${index+1}/${students.length}] ✓ Done — ${done} sections completed.`);
        }catch(err){
            console.error('[GTR] Error on student', students[index], err);
            setStatus(`[${index+1}/${students.length}] ⚠ ${err.message}`);
            if(!errors.includes(index)) errors.push(index);
        }

        setProgress(index+1,students.length); updateQueue(index+1); await sleep(300);
        index++;
        if(!loadJob()){ setStatus('■ Stopped.'); return; }
        if(index>=students.length){ clearJob(); setStatus(`✅ All ${students.length} students processed.`); updateQueue(students.length); return; }

        saveJob({students, course, sections, index, errors});
        setStatus(`[${index+1}/${students.length}] Navigating to #${students[index]}…`);
        await sleep(150);
        const url=new URL(window.location.href);
        url.searchParams.set('student_number', students[index]);
        url.searchParams.set('_gtr', Date.now());
        window.location.href = url.href;
    }

    setTimeout(resume, 1500);
    console.log('[GTR] Group Training script v5.1.2 ready');
})();