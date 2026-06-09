// ==UserScript==
// @name         GTR Credit
// @namespace    http://otsystems.net/
// @version      9.6.0
// @description  Scrape a course's progress structure from a lead student, pick sections/modules, then issue credit to a list of other students account-by-account.
// @match        https://otsystems.net/admin/students/dashboard/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'gtr_credit_job';

    const STYLE = `
#gtr-overlay *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
#gtr-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .18s;}
#gtr-overlay.open{opacity:1;pointer-events:all;}
#gtr-panel{background:#fff;border:1px solid #dee2e6;border-radius:8px;width:min(820px,97vw);max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.18);transform:translateY(12px);transition:transform .18s;font-size:13px;}
#gtr-overlay.open #gtr-panel{transform:translateY(0);}
#gtr-header{padding:12px 16px;border-bottom:1px solid #dee2e6;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#1a3a5c;}
#gtr-header h5{margin:0;font-size:14px;font-weight:600;color:#fff;display:flex;align-items:center;gap:8px;}
#gtr-header-sub{font-size:11px;color:rgba(255,255,255,.7);font-weight:400;margin-left:4px;}
#gtr-header-btns{display:flex;align-items:center;gap:6px;}
.gtr-hdr-btn{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;transition:background .15s;line-height:1;}
.gtr-hdr-btn:hover{background:rgba(255,255,255,.28);}
#gtr-close{font-size:15px;line-height:1;}
#gtr-body{overflow-y:auto;flex:1;padding:16px;}

.gtr-steps{display:flex;gap:6px;margin-bottom:16px;}
.gtr-stepdot{flex:1;height:4px;border-radius:2px;background:#e9ecef;}
.gtr-stepdot.on{background:#1a3a5c;}
.gtr-step{display:none;}
.gtr-step.active{display:block;}

.gtr-label{font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;display:block;}
.gtr-alert-info{background:#cfe2ff;border:1px solid #b6d4fe;color:#084298;padding:9px 12px;border-radius:5px;font-size:12px;line-height:1.5;margin-bottom:12px;}
.gtr-alert-danger{display:none;background:#f8d7da;border:1px solid #f1aeb5;color:#58151c;padding:9px 12px;border-radius:5px;font-size:12px;margin-bottom:10px;font-weight:600;}
.gtr-input{width:100%;padding:8px 11px;border:1px solid #ced4da;border-radius:5px;font-size:13px;color:#212529;font-family:inherit;box-sizing:border-box;resize:none;}
.gtr-input:focus{outline:none;border-color:#1a3a5c;box-shadow:0 0 0 2px rgba(26,58,92,.12);}

.gtr-btn{padding:8px 16px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:inherit;transition:background .12s,color .12s;display:inline-flex;align-items:center;justify-content:center;gap:6px;}
.gtr-btn-primary{background:#1a3a5c;color:#fff;border-color:#1a3a5c;}
.gtr-btn-primary:hover{background:#12284a;}
.gtr-btn-primary:disabled{opacity:.55;cursor:not-allowed;background:#6c757d;border-color:#6c757d;}
.gtr-btn-secondary{background:#fff;color:#6c757d;border-color:#6c757d;}
.gtr-btn-secondary:hover{background:#6c757d;color:#fff;}
.gtr-btn-full{width:100%;}
.gtr-row2{display:flex;gap:8px;}
.gtr-row2 .gtr-btn{flex:1;}

/* class list */
#gtr-classlist{border:1px solid #dee2e6;border-radius:6px;max-height:300px;overflow-y:auto;margin-bottom:12px;}
.gtr-class{padding:11px 13px;font-size:13px;cursor:pointer;border-bottom:1px solid #f0f0f0;color:#212529;display:flex;align-items:center;gap:10px;}
.gtr-class:last-child{border-bottom:none;}
.gtr-class:hover{background:#f0f4f8;}
.gtr-class.sel{background:#e8eef5;}
.gtr-class .radio{width:15px;height:15px;border-radius:50%;border:2px solid #adb5bd;flex-shrink:0;}
.gtr-class.sel .radio{border-color:#1a3a5c;background:radial-gradient(#1a3a5c 40%,transparent 45%);}
.gtr-class .meta{font-size:11px;color:#6c757d;margin-left:auto;white-space:nowrap;}

/* roster checklist */
.gtr-roster-bar{display:flex;gap:8px;align-items:center;margin-bottom:8px;}
#gtr-roster{border:1px solid #dee2e6;border-radius:6px;max-height:240px;overflow-y:auto;margin-bottom:6px;background:#fff;}
.gtr-rstudent{display:flex;align-items:center;gap:9px;padding:7px 12px;font-size:12px;color:#212529;cursor:pointer;border-bottom:1px solid #f5f5f5;}
.gtr-rstudent:last-child{border-bottom:none;}
.gtr-rstudent:hover{background:#f0f4f8;}
.gtr-rstudent input{width:15px;height:15px;accent-color:#1a3a5c;cursor:pointer;flex-shrink:0;}
.gtr-rstudent .rnum{color:#6c757d;font-size:11px;margin-left:auto;white-space:nowrap;}
.gtr-rstudent .rsrc{font-size:10px;font-weight:700;color:#1a3a5c;background:#e8eef5;border-radius:3px;padding:1px 5px;margin-left:8px;}
.gtr-roster-count{font-size:12px;font-weight:700;color:#1a3a5c;margin-bottom:12px;}

/* tree — tall + expandable */
#gtr-tree{border:1px solid #dee2e6;border-radius:6px;max-height:56vh;overflow-y:auto;margin-bottom:12px;background:#fff;}
.gtr-mod{border-bottom:1px solid #e9ecef;}
.gtr-mod:last-child{border-bottom:none;}
.gtr-mod-head{display:flex;align-items:center;gap:9px;padding:9px 12px;background:#f4f7fa;cursor:pointer;position:sticky;top:0;}
.gtr-mod-head:hover{background:#eaf0f6;}
.gtr-caret{font-size:16px;line-height:1;color:#6c757d;width:14px;text-align:center;transition:transform .15s;}
.gtr-mod-name{font-size:12px;font-weight:700;color:#1a3a5c;flex:1;text-transform:uppercase;letter-spacing:.3px;}
.gtr-mod-count{font-size:11px;color:#6c757d;font-weight:600;}
.gtr-secs{padding:2px 0;}
.gtr-sec{display:flex;align-items:flex-start;gap:9px;padding:7px 12px 7px 33px;font-size:12px;color:#212529;cursor:pointer;border-top:1px solid #f5f5f5;}
.gtr-sec:hover{background:#f0f4f8;}
.gtr-sec.exam{color:#8a94a3;font-style:italic;}
.gtr-sec.locked{color:#c2c8d0;cursor:not-allowed;background:#fafbfc;}
.gtr-sec.locked:hover{background:#fafbfc;}
.gtr-sec.locked input{cursor:not-allowed;}
.gtr-sec .locknote{color:#c97a7a;font-size:11px;font-style:italic;}
.gtr-sec .code{color:#adb5bd;font-size:11px;}
.gtr-mod-head input,.gtr-sec input{margin:1px 0 0 0;width:15px;height:15px;accent-color:#1a3a5c;cursor:pointer;flex-shrink:0;}
.gtr-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.gtr-selcount{font-size:12px;font-weight:700;color:#1a3a5c;}
.gtr-toolbar .sp{flex:1;}
.gtr-mini{padding:5px 11px;font-size:11px;font-weight:600;border-radius:5px;border:1px solid #1a3a5c;background:#fff;color:#1a3a5c;cursor:pointer;}
.gtr-mini:hover{background:#1a3a5c;color:#fff;}

.gtr-chip{font-size:12px;color:#495057;background:#f4f7fa;border:1px solid #dde4ec;border-radius:6px;padding:10px 12px;margin-bottom:14px;line-height:1.5;}
.gtr-chip strong{color:#1a3a5c;}

/* progress / queue */
#gtr-prog-wrap{width:100%;height:6px;background:#e9ecef;border-radius:3px;overflow:hidden;margin-bottom:10px;}
#gtr-prog-fill{height:100%;background:#1a3a5c;border-radius:3px;transition:width .3s;width:0%;}
#gtr-status-bar{background:#f4f7fa;border:1px solid #dde4ec;border-radius:5px;padding:10px 12px;font-size:12px;color:#212529;margin-bottom:12px;min-height:40px;}
#gtr-queue{border:1px solid #dee2e6;border-radius:6px;max-height:300px;overflow-y:auto;margin-bottom:12px;}
.gtr-q{display:flex;align-items:center;gap:9px;padding:8px 12px;font-size:12px;border-bottom:1px solid #f0f0f0;}
.gtr-q:last-child{border-bottom:none;}
.gtr-q .ic{width:18px;text-align:center;font-weight:700;}
.gtr-q-done{color:#198754;}
.gtr-q-active{color:#f59e0b;background:#fffaf0;font-weight:600;}
.gtr-q-pending{color:#adb5bd;}
.gtr-q-error{color:#dc3545;background:#fdf3f4;}

/* tour */
#gtr-tour-spot{position:fixed;z-index:1000000;box-shadow:0 0 0 9999px rgba(0,0,0,.62);border-radius:6px;pointer-events:none;transition:top .3s,left .3s,width .3s,height .3s;}
#gtr-tour-box{position:fixed;z-index:1000001;background:#1a3a5c;color:#fff;border-radius:10px;padding:18px 20px 14px;width:300px;box-shadow:0 8px 32px rgba(0,0,0,.35);font-size:13px;line-height:1.5;transition:top .3s,left .3s;}
#gtr-tour-box h4{margin:0 0 8px;font-size:14px;font-weight:700;color:#fff;}
#gtr-tour-box p{margin:0 0 14px;color:rgba(255,255,255,.88);font-size:12px;}
#gtr-tour-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;}
#gtr-tour-dots{display:flex;gap:5px;align-items:center;}
.gtr-tour-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.3);}
.gtr-tour-dot.on{background:#fff;}
.gtr-tour-btns{display:flex;gap:6px;}
.gtr-tour-b{padding:5px 13px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid transparent;font-family:inherit;}
.gtr-tour-skip{background:transparent;color:rgba(255,255,255,.6);border-color:rgba(255,255,255,.25);}
.gtr-tour-skip:hover{background:rgba(255,255,255,.1);color:#fff;}
.gtr-tour-next{background:#fff;color:#1a3a5c;border-color:#fff;}
.gtr-tour-next:hover{background:#e8eef5;}
`;

    const styleEl = document.createElement('style');
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
    const fastStyle = document.createElement('style');
    fastStyle.textContent = `.popover{transition:none !important;}`;
    document.head.appendChild(fastStyle);

    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    // Section titles can carry a volatile time suffix like "- 00:07:38" that
    // differs per student (or is absent). Strip any trailing time so matching
    // is on the stable section name only.
    const cleanTitle = s => norm(s).replace(/\s*[-\u2013\u2014]\s*\d{1,2}:\d{2}(?::\d{2})?\s*$/,'').trim();

    function currentSN(){ const el = document.getElementById('SN'); return el ? String(el.value).trim() : null; }
    // Scrape "Evan Moore • S# 614208" from the student details header.
    function currentStudentLabel(){
        const h4 = document.querySelector('h4.student-details-heading-title');
        const sn = currentSN();
        if(h4){
            // The h4 holds "Name • S# NNN • A# ..." mixed with ngIf comments.
            // Take the visible text, keep up to and including the S# segment.
            let txt = norm(h4.textContent);
            // Split on the bullet separator and keep name + the S# part.
            const parts = txt.split('\u2022').map(p=>norm(p));
            const name = parts[0] || '';
            const snPart = parts.find(p => /S#/i.test(p)) || (sn ? 'S# ' + sn : '');
            const label = [name, snPart].filter(Boolean).join(' \u2022 ');
            if(label) return label;
        }
        return sn ? ('S# ' + sn) : '?';
    }
    function studentUrl(sn){ return location.origin + '/admin/students/dashboard/?student_number=' + encodeURIComponent(sn); }
    function navTo(url){ try { location.replace(url); } catch (e) { location.href = url; } setTimeout(()=>{ try{ location.href=url; }catch(e){} }, 250); }
    function waitFor(selector, timeout=8000){
        return new Promise((resolve, reject) => {
            let elapsed=0; const iv=100;
            const t=setInterval(()=>{ const el=document.querySelector(selector);
                if(el){ clearInterval(t); resolve(el); }
                else if(elapsed>=timeout){ clearInterval(t); reject(new Error('Timeout: '+selector)); }
                elapsed+=iv; }, iv);
        });
    }
    // Wait until at least one enrollment panel (any color) has rendered.
    function waitForEnrollments(timeout=10000){
        return new Promise((resolve, reject) => {
            let elapsed=0; const iv=100;
            const t=setInterval(()=>{
                if(enrollmentPanels().length){ clearInterval(t); resolve(true); }
                else if(elapsed>=timeout){ clearInterval(t); reject(new Error('Timeout: no enrollment panels found')); }
                elapsed+=iv;
            }, iv);
        });
    }
    window.alert = function(msg){ console.warn('[GTR] alert suppressed:', msg); };

    // ── SCRAPING ────────────────────────────────────────────────────────
    // Enrollment panels can be panel-primary (active), panel-success
    // (completed), or other states. Match them structurally instead: any
    // .panel that has the heading dropdown and an "Activity ID:" info row.
    function enrollmentPanels(){
        return Array.from(document.querySelectorAll('div.panel')).filter(p =>
            p.querySelector('.panel-heading.clearfix') && /Activity ID:/i.test(p.textContent));
    }
    function scrapeClasses(){
        const panels = enrollmentPanels();
        const out = [];
        for (const panel of panels){
            const heading = panel.querySelector('.panel-heading.clearfix'); if(!heading) continue;
            const h4 = heading.querySelector('.panel-title.pull-left h4'); if(!h4) continue;
            const clone = h4.cloneNode(true);
            clone.querySelectorAll('span,em,small').forEach(n=>n.remove());
            const name = norm(clone.textContent);
            let activity = null, mseId = null;
            const row = panel.querySelector('tr.bg-grey-200 td');
            if(row){
                const m = row.textContent.match(/Activity ID:\s*([0-9]+)/i); if(m) activity = m[1];
                const mm = row.textContent.match(/MSE:\s*([0-9]+)/i); if(mm) mseId = mm[1];
            }
            if(name) out.push({ name, activity, mseId });
        }
        return out;
    }

    // ── ROSTER SOURCES (corporate account + MSE) ─────────────────────────
    // Detect the corporate org id from the student details "Corporate Student" row.
    function detectCorpId(){
        const link = document.querySelector('a[href*="org_master_edit.asp?ID="]');
        if(link){ const m = link.getAttribute('href').match(/[?&]ID=([0-9]+)/i); if(m) return m[1]; }
        return null;
    }
    // Fetch a same-origin page and return a parsed DOM document.
    async function fetchDoc(url){
        const res = await fetch(url, { credentials: 'include' });
        if(!res.ok) throw new Error('Fetch failed: ' + res.status);
        const html = await res.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }
    // Parse the corporate roster page (manage_students.asp?id=NNN).
    // Each student row has a dashboard link with student_number plus a
    // "Lastname, Firstname" name cell.
    async function fetchCorpRoster(corpId){
        const url = location.origin + '/admin/corporate/manage_students.asp?id=' + encodeURIComponent(corpId);
        const doc = await fetchDoc(url);
        const out = [];
        const links = Array.from(doc.querySelectorAll('a[href*="dashboard.asp?student_number="], a[href*="dashboard.asp?Student_Number="]'));
        for (const a of links){
            const m = a.getAttribute('href').match(/student_number=([0-9]+)/i);
            if(!m) continue;
            const sn = m[1];
            // Name lives in a sibling td of the same row: "Lastname, Firstname".
            let name = '';
            const trEl = a.closest('tr');
            if(trEl){
                const tds = Array.from(trEl.querySelectorAll('td'));
                // Find the cell that looks like "Last, First".
                const nameTd = tds.find(td => /,/.test(norm(td.textContent)) && !/dashboard/i.test(td.innerHTML));
                if(nameTd){
                    const raw = norm(nameTd.textContent.replace(/\u00a0/g,' '));
                    const parts = raw.split(',').map(p=>norm(p));
                    if(parts.length>=2) name = parts[1] + ' ' + parts[0]; else name = raw;
                }
            }
            out.push({ sn, name, source:'Corp' });
        }
        return out;
    }
    // Parse the MSE roster page (multipleEnrollmentsPicked.asp?...signup_id=NNN).
    // Each student panel heading links to dashboard with Student_Number and
    // shows "First Last (NNNNN)".
    // Build a display name from the JSON student record.
    function mseStudentName(s){
        const mi = (s.Middle_Initial && String(s.Middle_Initial).trim()) ? ' ' + String(s.Middle_Initial).trim() : '';
        const suf = (s.Name_Suffix && String(s.Name_Suffix).trim()) ? ' ' + String(s.Name_Suffix).trim() : '';
        return norm([s.First_Name, mi, s.Last_Name, suf].join(' '));
    }
    // Read a cookie value by name (used for the security-token header).
    function getCookie(name){
        const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : null;
    }
    async function fetchMseRoster(mseId){
        const base = location.origin + '/admin/students';
        const pageUrl = base + '/multipleEnrollmentsPicked.asp?form_action=load_enrollments&signup_id=' + encodeURIComponent(mseId);
        const apiUrl  = base + '/MSE/API/JSON_MSE.asp';

        // The Angular page loads the roster from JSON_MSE.asp after boot via a
        // POST with a JSON body, an Accept: application/json header, and a
        // `security-token` header echoed from the cookie of the same name. The
        // server 500s without that token, so we replicate the call exactly.
        const token = getCookie('security-token');
        const headers = {
            'Content-Type': 'application/json; charset=UTF-8',
            'Accept': 'application/json; charset=UTF-8'
        };
        if(token) headers['security-token'] = token;

        // Exact request the Angular page sends (captured): POST JSON body
        // {"formAction":"getmsefull","signupId":"<id>"} with the security-token
        // header echoed from the cookie. The server 500s without the token and
        // returns an empty 200 if the body fields/casing don't match.
        let data = null, lastInfo = '';
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({ formAction: 'getmsefull', signupId: String(mseId) }),
            });
            const txt = await res.text();
            lastInfo = res.status + ' len ' + txt.length + (token ? '' : ' (no security-token cookie!)');
            if(res.ok){ try { data = JSON.parse(txt); } catch(e){ /* not json */ } }
        } catch(e){ lastInfo = 'ERR ' + e.message; }

        if(data && Array.isArray(data.students) && data.students.length){
            return data.students
                .map(s => ({ sn: String(s.Student_Number), name: mseStudentName(s), source:'MSE' }))
                .filter(s => s.sn);
        }

        // Fallback: scrape the rendered page (works if it's server-rendered).
        console.warn('[GTR] MSE API did not return students (' + lastInfo + '); falling back to page scrape.');
        const doc = await fetchDoc(pageUrl);
        const byNum = new Map();
        const links = Array.from(doc.querySelectorAll('a[href*="dashboard.asp?Student_Number="], a[href*="dashboard.asp?student_number="]'));
        for (const aEl of links){
            const m = aEl.getAttribute('href').match(/student_number=([0-9]+)/i);
            if(!m) continue;
            const sn = m[1];
            const name = norm(aEl.textContent).replace(/\(\s*[0-9]+\s*\)\s*$/,'').trim();
            if(!byNum.has(sn) || (!byNum.get(sn) && name)) byNum.set(sn, name);
        }
        return Array.from(byNum.entries()).map(([sn,name])=>({ sn, name, source:'MSE' }));
    }
    // Gather + merge roster students from whatever sources are available,
    // dedupe by student number, and drop the lead.
    async function gatherRoster(selectedClass){
        const map = new Map();   // sn -> {sn,name,sources:Set}
        const add = (list)=>{ for(const s of list){ if(!s.sn || s.sn===state.leadSN) continue;
            if(map.has(s.sn)){ if(s.source) map.get(s.sn).sources.add(s.source); if(!map.get(s.sn).name && s.name) map.get(s.sn).name=s.name; }
            else map.set(s.sn, { sn:s.sn, name:s.name||'', sources:new Set(s.source?[s.source]:[]) }); } };
        const corpId = detectCorpId();
        const mseId = selectedClass && selectedClass.mseId;
        const results = { corpId, mseId, errors:[] };
        if(corpId){ try { add(await fetchCorpRoster(corpId)); } catch(e){ results.errors.push('Corp roster: '+e.message); } }
        if(mseId){ try { add(await fetchMseRoster(mseId)); } catch(e){ results.errors.push('MSE roster: '+e.message); } }
        results.students = Array.from(map.values()).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
        return results;
    }

    async function openClassesTab(){
        const tab = Array.from(document.querySelectorAll('li[ng-class] a')).find(a => a.textContent.trim().startsWith('Classes'));
        if(!tab) throw new Error('Classes tab not found');
        tab.click();
        await waitForEnrollments(6000);
        await sleep(300);
    }
    async function openManageProgressByName(courseName){
        await waitForEnrollments(10000);
        const want = norm(courseName).toLowerCase();
        const panels = enrollmentPanels();
        for (const panel of panels){
            const heading = panel.querySelector('.panel-heading.clearfix'); if(!heading) continue;
            const h4 = heading.querySelector('.panel-title.pull-left h4');
            const clone = h4 ? h4.cloneNode(true) : null;
            if(clone) clone.querySelectorAll('span,em,small').forEach(n=>n.remove());
            const titleText = norm(clone ? clone.textContent : heading.textContent).toLowerCase();
            if(!titleText.includes(want)) continue;
            // Gear button color varies (primary/success/etc) — match by the cog icon.
            const gear = heading.querySelector('button i.fa.fa-cog')?.closest('button');
            if(!gear) continue;
            gear.click(); await sleep(250);
            const link = Array.from(heading.querySelectorAll('ul.dropdown-menu li a')).find(a => a.textContent.toLowerCase().includes('manage progress'));
            if(!link) throw new Error("'Manage Progress' not available for this course");
            link.click(); await sleep(500);
            return true;
        }
        throw new Error('Course not found: ' + courseName);
    }
    function scrapeOutline(){
        const modules = [];
        const blocks = Array.from(document.querySelectorAll('div[ng-repeat="entry in EnrollmentProgressCtrl.Outline"]'));
        for (const block of blocks){
            const h5 = block.querySelector('h5 span.text-blue-800');
            const modName = norm(h5 ? h5.textContent : block.querySelector('h5')?.textContent) || 'Module';
            const sections = [];
            const rows = Array.from(block.querySelectorAll('table tbody tr'));
            for (const tr of rows){
                const td = tr.querySelector('td.ng-binding'); if(!td) continue;
                const codeEl = td.querySelector('small.ng-binding');
                const code = codeEl ? norm(codeEl.textContent).replace(/[()]/g,'') : null;
                const clone = td.cloneNode(true);
                clone.querySelectorAll('span,em,small,a').forEach(n=>n.remove());
                const title = cleanTitle(clone.textContent);
                let type='OTH';
                if(code){ if(/-CON-/i.test(code))type='CON'; else if(/-TES-/i.test(code))type='TES'; else if(/-VER-/i.test(code))type='VER'; else if(/-EVA-/i.test(code))type='EVA'; }
                // Module exams must never appear or be credited.
                if(type==='TES' || /\bexam\b/i.test(title)) continue;
                // Lead completion: a credited section shows a green check; an
                // outstanding one shows a pencil on its popover button.
                const pbtn = tr.querySelector('button.popover-button');
                const leadDone = !!(pbtn && pbtn.querySelector('.fa-check'));
                if(title) sections.push({ title, code, type, leadDone });
            }
            if(sections.length) modules.push({ name: modName, sections });
        }
        // A section is eligible to copy only if the LEAD actually completed it
        // (its button shows a green check). A pencil means no credit for that
        // specific section, so it stays locked even if a later section is done.
        modules.forEach(m => m.sections.forEach(s => { s.eligible = !!s.leadDone; }));
        return modules;
    }
    async function creditSelected(selectedTitles, onProgress){
        await waitFor('button.popover-button', 8000); await sleep(150);

        // Build the worklist of titles we still need to credit. We re-find each
        // row fresh right before acting on it, because Angular re-renders the
        // outline after every save (pencil -> check), which detaches old nodes.
        const wanted = new Set(selectedTitles);
        let done = 0;
        const attempted = wanted.size;

        for (const title of wanted){
            // Find this section's row fresh by its title text.
            let target = findRowByTitle(title);
            if(!target){ continue; }                 // not on page
            // Skip exams defensively.
            if(/-TES-/i.test(target.code) || /\bexam\b/i.test(title)) continue;
            // Already credited? (shows a check, no pencil) -> count as done.
            if(target.btn.querySelector('.fa-check') && !target.btn.querySelector('.fa-pencil')){ done++; if(onProgress) onProgress(title,done); continue; }
            if(!target.btn.querySelector('.fa-pencil')) continue; // nothing actionable

            let credited = false;
            for (let attempt=0; attempt<2 && !credited; attempt++){
                // Re-find the row each attempt in case of a re-render.
                target = findRowByTitle(title);
                if(!target || !target.btn) break;
                await closeAnyPopover();
                target.btn.click();
                const completeBtn = await waitForComplete(3000);
                if(!completeBtn){ await closeAnyPopover(); continue; }
                completeBtn.click();
                // Confirm it actually took: wait for this row's button to show a check.
                credited = await waitForRowCredited(title, 3000);
                await closeAnyPopover();
                await sleep(120);
            }
            if(credited){ done++; if(onProgress) onProgress(title,done); }
        }
        return { done, attempted };
    }

    // Find a section row by its title text; returns {tr, btn, code} or null.
    function findRowByTitle(title){
        const blocks = Array.from(document.querySelectorAll('div[ng-repeat="entry in EnrollmentProgressCtrl.Outline"]'));
        for (const block of blocks){
            const rows = Array.from(block.querySelectorAll('table tbody tr'));
            for (const tr of rows){
                const td = tr.querySelector('td.ng-binding'); if(!td) continue;
                const codeEl = td.querySelector('small.ng-binding');
                const code = codeEl ? norm(codeEl.textContent).replace(/[()]/g,'') : '';
                const clone = td.cloneNode(true);
                clone.querySelectorAll('span,em,small,a').forEach(n=>n.remove());
                if(cleanTitle(clone.textContent) !== title) continue;
                const btn = tr.querySelector('button.popover-button');
                if(!btn) return null;
                return { tr, btn, code };
            }
        }
        return null;
    }

    // After a save, the row's popover button switches from pencil to check.
    function waitForRowCredited(title, timeout=3000){
        return new Promise(resolve=>{
            let elapsed=0; const iv=80;
            const t=setInterval(()=>{
                const r = findRowByTitle(title);
                const ok = r && r.btn && r.btn.querySelector('.fa-check') && !r.btn.querySelector('.fa-pencil');
                if(ok){ clearInterval(t); resolve(true); }
                else if(elapsed>=timeout){ clearInterval(t); resolve(false); }
                elapsed+=iv;
            }, iv);
        });
    }

    // Close any open popover so the next section starts clean.
    async function closeAnyPopover(){
        const cancel = document.querySelector('.popover button.btn-default[ng-click="cancel()"], button.btn.btn-default[ng-click="cancel()"]');
        if(cancel){ cancel.click(); await sleep(60); return; }
        // No cancel button found: click an open popover-button to toggle it closed.
        const openTrigger = document.querySelector('button.popover-button[aria-describedby]');
        if(openTrigger){ openTrigger.click(); await sleep(60); }
    }
    // The confirm button: <button class="btn btn-info" ng-click="...SaveEvent(child)"><span>Complete</span></button>
    function findCompleteButton(){
        let b = document.querySelector('button[ng-click*="SaveEvent"]');
        if(b) return b;
        // Fallbacks.
        const pops = Array.from(document.querySelectorAll('.popover'));
        for (const p of pops){ const x = Array.from(p.querySelectorAll('button')).find(btn => /complete/i.test(btn.textContent)); if(x) return x; }
        const info = document.querySelector('button.btn-info');
        if(info && /complete/i.test(info.textContent)) return info;
        return null;
    }
    function waitForComplete(timeout=3000){
        return new Promise(resolve=>{
            let elapsed=0; const iv=60;
            const t=setInterval(()=>{
                const b=findCompleteButton();
                if(b){ clearInterval(t); resolve(b); }
                else if(elapsed>=timeout){ clearInterval(t); resolve(null); }
                elapsed+=iv;
            }, iv);
        });
    }

    // ── STORAGE ──────────────────────────────────────────────────────────
    function saveJob(j){ sessionStorage.setItem(STORAGE_KEY, JSON.stringify(j)); }
    function loadJob(){ try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)); } catch { return null; } }
    function clearJob(){ sessionStorage.removeItem(STORAGE_KEY); }

    // ── STATE ──────────────────────────────────────────────────────────────
    const state = { leadSN:null, leadLabel:null, classes:[], selectedClass:null, outline:[], selected:new Set(), students:[], roster:[], rosterChecked:new Set() };

    function gotoStep(n){
        document.querySelectorAll('#gtr-overlay .gtr-step').forEach(s=>s.classList.remove('active'));
        document.getElementById('gtr-step-'+n).classList.add('active');
        document.querySelectorAll('#gtr-overlay .gtr-stepdot').forEach((d,idx)=>d.classList.toggle('on', idx<=(n-1)));
    }

    // ── BUILD OVERLAY ────────────────────────────────────────────────────
    let overlay;
    function buildOverlay(){
        if (overlay) return;
        overlay = document.createElement('div');
        overlay.id = 'gtr-overlay';
        overlay.innerHTML = `
        <div id="gtr-panel">
            <div id="gtr-header">
                <h5>GTR Credit <span id="gtr-header-sub"></span></h5>
                <div id="gtr-header-btns">
                    <button class="gtr-hdr-btn" id="gtr-help" title="Help / Tour">?</button>
                    <button class="gtr-hdr-btn" id="gtr-close" title="Close">\u00D7</button>
                </div>
            </div>
            <div id="gtr-body">
                <div class="gtr-steps">
                    <div class="gtr-stepdot on"></div><div class="gtr-stepdot"></div><div class="gtr-stepdot"></div><div class="gtr-stepdot"></div>
                </div>

                <div class="gtr-step active" id="gtr-step-1">
                    <div class="gtr-alert-info"><strong>Step 1 \u2014 Pick a class.</strong> These are the lead student's enrollments.</div>
                    <label class="gtr-label">Select a class to credit</label>
                    <div id="gtr-classlist"><div style="padding:14px;color:#6c757d;">Loading classes\u2026</div></div>
                    <div class="gtr-alert-danger" id="gtr-err-1"></div>
                    <button class="gtr-btn gtr-btn-primary gtr-btn-full" id="gtr-next-1" disabled>Next: load progress \u2192</button>
                </div>

                <div class="gtr-step" id="gtr-step-2">
                    <div class="gtr-toolbar">
                        <span class="gtr-selcount" id="gtr-selcount">0 selected</span>
                        <span class="sp"></span>
                        <button class="gtr-mini" id="gtr-all">Select all</button>
                        <button class="gtr-mini" id="gtr-none">Clear</button>
                        <button class="gtr-mini" id="gtr-expand">Expand all</button>
                        <button class="gtr-mini" id="gtr-collapse">Collapse all</button>
                    </div>
                    <label class="gtr-label" id="gtr-tree-label">Select sections / modules to credit</label>
                    <div id="gtr-tree"></div>
                    <div class="gtr-alert-danger" id="gtr-err-2"></div>
                    <div class="gtr-row2">
                        <button class="gtr-btn gtr-btn-secondary" id="gtr-back-2">\u2190 Back</button>
                        <button class="gtr-btn gtr-btn-primary" id="gtr-next-2" disabled>Next \u2192</button>
                    </div>
                </div>

                <div class="gtr-step" id="gtr-step-3">
                    <div class="gtr-chip" id="gtr-summary"></div>

                    <div id="gtr-roster-wrap" style="display:none;">
                        <label class="gtr-label">Account roster <span id="gtr-roster-src" style="font-weight:400;text-transform:none;letter-spacing:0;color:#6c757d;"></span></label>
                        <div class="gtr-roster-bar">
                            <input type="text" id="gtr-roster-filter" class="gtr-input" placeholder="Filter by name or number\u2026" style="flex:1;">
                            <button class="gtr-mini" id="gtr-roster-all">Select all</button>
                            <button class="gtr-mini" id="gtr-roster-none">Clear</button>
                        </div>
                        <div id="gtr-roster"></div>
                        <div class="gtr-roster-count" id="gtr-roster-count"></div>
                    </div>
                    <div id="gtr-roster-loading" class="gtr-alert-info" style="display:none;">Loading account roster\u2026</div>

                    <label class="gtr-label">Additional student numbers (one per line or comma-separated)</label>
                    <textarea id="gtr-students" class="gtr-input" rows="4" placeholder="123456&#10;789012"></textarea>
                    <div class="gtr-alert-danger" id="gtr-err-3" style="margin-top:10px;"></div>
                    <div class="gtr-row2" style="margin-top:12px;">
                        <button class="gtr-btn gtr-btn-secondary" id="gtr-back-3">\u2190 Back</button>
                        <button class="gtr-btn gtr-btn-primary" id="gtr-run-btn">\u25B6 Run</button>
                    </div>
                </div>

                <div class="gtr-step" id="gtr-step-4">
                    <div id="gtr-prog-wrap"><div id="gtr-prog-fill"></div></div>
                    <div id="gtr-status-bar">Starting\u2026</div>
                    <div id="gtr-queue"></div>
                    <button class="gtr-btn gtr-btn-secondary gtr-btn-full" id="gtr-stop-btn">\u25A0 Stop</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#gtr-help').addEventListener('click', startTour);
        overlay.querySelector('#gtr-close').addEventListener('click', closePanel);
        overlay.addEventListener('click', e => { if (e.target === overlay) closePanel(); });

        wireStep2(); wireStep3();
    }

    function closePanel(){ overlay.classList.remove('open'); endTour(); }

    async function openPanel(){
        buildOverlay();
        state.leadSN = currentSN();
        state.leadLabel = currentStudentLabel();
        overlay.querySelector('#gtr-header-sub').textContent = 'Lead Student - ' + state.leadLabel;
        // reset to step 1
        state.classes=[]; state.selectedClass=null; state.outline=[]; state.selected=new Set(); state.roster=[]; state.rosterChecked=new Set();
        const rwrap=overlay.querySelector('#gtr-roster-wrap'); if(rwrap) rwrap.style.display='none';
        const rfilter=overlay.querySelector('#gtr-roster-filter'); if(rfilter) rfilter.value='';
        gotoStep(1);
        overlay.classList.add('open');
        await loadClasses();
    }

    // STEP 1
    async function loadClasses(){
        const list = overlay.querySelector('#gtr-classlist');
        const next = overlay.querySelector('#gtr-next-1');
        const err = overlay.querySelector('#gtr-err-1');
        err.style.display='none'; next.disabled=true;
        list.innerHTML = '<div style="padding:14px;color:#6c757d;">Loading classes\u2026</div>';
        try { await openClassesTab(); state.classes = scrapeClasses(); }
        catch(e){ err.style.display='block'; err.textContent=e.message; list.innerHTML=''; return; }
        if(!state.classes.length){ list.innerHTML = '<div style="padding:14px;color:#dc3545;">No classes found on this account.</div>'; return; }
        list.innerHTML = '';
        state.classes.forEach(c=>{
            const div = document.createElement('div');
            div.className='gtr-class';
            div.innerHTML = `<span class="radio"></span><span>${esc(c.name)}</span>${c.activity?`<span class="meta">AID ${esc(c.activity)}</span>`:''}`;
            div.addEventListener('click', ()=>{
                list.querySelectorAll('.gtr-class').forEach(x=>x.classList.remove('sel'));
                div.classList.add('sel'); state.selectedClass=c; next.disabled=false;
            });
            list.appendChild(div);
        });
        next.onclick = async ()=>{
            if(!state.selectedClass) return;
            next.disabled=true; next.textContent='Loading progress\u2026';
            try {
                await openManageProgressByName(state.selectedClass.name);
                await waitFor('div[ng-repeat="entry in EnrollmentProgressCtrl.Outline"]', 10000);
                await sleep(300);
                state.outline = scrapeOutline();
                if(!state.outline.length) throw new Error('No sections found in progress view.');
                buildTree(); gotoStep(2);
            } catch(e){ err.style.display='block'; err.textContent=e.message; }
            finally { next.disabled=false; next.textContent='Next: load progress \u2192'; }
        };
    }

    // STEP 2
    function buildTree(){
        const tree = overlay.querySelector('#gtr-tree');
        overlay.querySelector('#gtr-tree-label').textContent = 'Select sections / modules \u2014 ' + state.selectedClass.name;
        tree.innerHTML=''; state.selected=new Set();

        state.outline.forEach(mod=>{
            const wrap=document.createElement('div'); wrap.className='gtr-mod';
            const head=document.createElement('div'); head.className='gtr-mod-head';
            const caret=document.createElement('span'); caret.className='gtr-caret'; caret.textContent='\u25BE';
            const cb=document.createElement('input'); cb.type='checkbox';
            const name=document.createElement('span'); name.className='gtr-mod-name'; name.textContent=mod.name;
            const cnt=document.createElement('span'); cnt.className='gtr-mod-count';
            const eligible = mod.sections.filter(s=>s.eligible);
            cnt.textContent = eligible.length + ' of ' + mod.sections.length + ' available';
            head.appendChild(caret); head.appendChild(cb); head.appendChild(name); head.appendChild(cnt);

            const secWrap=document.createElement('div'); secWrap.className='gtr-secs';
            const secBoxes=[];   // only eligible (within the lead's credit ceiling) section checkboxes
            mod.sections.forEach(sec=>{
                const row=document.createElement('label');
                row.className='gtr-sec'+((sec.type==='VER'||sec.type==='EVA')?' exam':'');
                const sb=document.createElement('input'); sb.type='checkbox';
                const lbl=document.createElement('span');
                lbl.innerHTML = esc(sec.title)+(sec.code?` <span class="code">(${esc(sec.code)})</span>`:'');

                if(!sec.eligible){
                    // Beyond the lead's credit ceiling - not eligible to copy.
                    row.classList.add('locked');
                    sb.disabled = true;
                    lbl.innerHTML += ` <span class="locknote">\u2014 lead student does not have credit</span>`;
                    row.appendChild(sb); row.appendChild(lbl); secWrap.appendChild(row);
                    return;
                }
                sb.addEventListener('change',()=>{
                    if(sb.checked) state.selected.add(sec.title); else state.selected.delete(sec.title);
                    cb.checked = secBoxes.length>0 && secBoxes.every(x=>x.checked);
                    cb.indeterminate = !cb.checked && secBoxes.some(x=>x.checked);
                    refreshSel();
                });
                sb._secTitle = sec.title;
                row.appendChild(sb); row.appendChild(lbl); secWrap.appendChild(row); secBoxes.push(sb);
            });

            cb.disabled = secBoxes.length===0;
            cb.addEventListener('change',()=>{
                secBoxes.forEach(x=>{
                    x.checked = cb.checked;
                    const t = x._secTitle;
                    if(cb.checked) state.selected.add(t); else state.selected.delete(t);
                });
                cb.indeterminate = false;
                refreshSel();
            });
            head.addEventListener('click',e=>{
                if(e.target===cb) return;
                const hidden = secWrap.style.display==='none';
                secWrap.style.display = hidden?'block':'none';
                caret.textContent = hidden?'\u25BE':'\u25B8';
            });
            wrap.appendChild(head); wrap.appendChild(secWrap); tree.appendChild(wrap);
        });

        function setAllSections(on){
            tree.querySelectorAll('.gtr-mod').forEach(modEl=>{
                const sectionBoxes = Array.from(modEl.querySelectorAll('.gtr-secs input[type=checkbox]:not(:disabled)'));
                sectionBoxes.forEach(x=>{
                    x.checked = on;
                    if(on) state.selected.add(x._secTitle); else state.selected.delete(x._secTitle);
                });
                const modCb = modEl.querySelector('.gtr-mod-head input[type=checkbox]');
                if(modCb && !modCb.disabled){ modCb.checked = on; modCb.indeterminate = false; }
            });
            refreshSel();
        }
        overlay.querySelector('#gtr-all').onclick = ()=>setAllSections(true);
        overlay.querySelector('#gtr-none').onclick = ()=>setAllSections(false);
        overlay.querySelector('#gtr-expand').onclick = ()=>{ tree.querySelectorAll('.gtr-secs').forEach(s=>s.style.display='block'); tree.querySelectorAll('.gtr-caret').forEach(c=>c.textContent='\u25BE'); };
        overlay.querySelector('#gtr-collapse').onclick = ()=>{ tree.querySelectorAll('.gtr-secs').forEach(s=>s.style.display='none'); tree.querySelectorAll('.gtr-caret').forEach(c=>c.textContent='\u25B8'); };
        refreshSel();
    }
    function refreshSel(){
        const n=state.selected.size;
        overlay.querySelector('#gtr-selcount').textContent = n+' selected';
        overlay.querySelector('#gtr-next-2').disabled = n===0;
    }
    function wireStep2(){
        overlay.querySelector('#gtr-back-2').addEventListener('click', ()=>gotoStep(1));
        overlay.querySelector('#gtr-next-2').addEventListener('click', ()=>{
            if(!state.selected.size) return;
            overlay.querySelector('#gtr-summary').innerHTML =
                `Class: <strong>${esc(state.selectedClass.name)}</strong><br>${state.selected.size} sections selected \u00b7 lead #${esc(state.leadSN||'?')} excluded.`;
            gotoStep(3);
            loadRoster();
        });
    }

    // Load corp/MSE roster in the background and render the checklist.
    async function loadRoster(){
        const wrap = overlay.querySelector('#gtr-roster-wrap');
        const loading = overlay.querySelector('#gtr-roster-loading');
        // Only load once per session unless the class changed.
        if(state.roster.length && state.roster._forClass === state.selectedClass.name){ return; }
        state.roster = []; state.rosterChecked = new Set();
        wrap.style.display='none';
        const corpId = detectCorpId();
        const mseId = state.selectedClass && state.selectedClass.mseId;
        if(!corpId && !mseId){ return; }  // no roster sources; manual entry only
        loading.style.display='block';
        try {
            const res = await gatherRoster(state.selectedClass);
            state.roster = res.students;
            state.roster._forClass = state.selectedClass.name;
            const srcBits = [];
            if(res.corpId) srcBits.push('Corporate');
            if(res.mseId) srcBits.push('MSE');
            overlay.querySelector('#gtr-roster-src').textContent = srcBits.length ? '(' + srcBits.join(' + ') + ')' : '';
            renderRoster();
            if(state.roster.length){
                wrap.style.display = 'block';
            } else {
                // Sources were detected but nothing parsed — tell the user so it
                // isn't a silent no-op; they can still type numbers manually.
                wrap.style.display = 'block';
                const box = overlay.querySelector('#gtr-roster');
                box.innerHTML = '<div style="padding:12px;color:#6c757d;font-size:12px;">Detected ' + srcBits.join(' + ') + ', but couldn\u2019t read the student list automatically. Enter numbers below, or check the console for details.</div>';
                overlay.querySelector('#gtr-roster-count').textContent = '';
            }
            if(res.errors.length) console.warn('[GTR] roster', res.errors);
        } catch(e){
            console.warn('[GTR] roster load failed', e);
        } finally {
            loading.style.display='none';
        }
    }
    function renderRoster(){
        const box = overlay.querySelector('#gtr-roster');
        const filter = norm(overlay.querySelector('#gtr-roster-filter').value).toLowerCase();
        box.innerHTML='';
        const visible = state.roster.filter(s => {
            if(!filter) return true;
            return (s.name||'').toLowerCase().includes(filter) || s.sn.includes(filter);
        });
        if(!visible.length){ box.innerHTML = '<div style="padding:12px;color:#6c757d;font-size:12px;">No matching students.</div>'; }
        visible.forEach(s=>{
            const row=document.createElement('label'); row.className='gtr-rstudent';
            const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=state.rosterChecked.has(s.sn);
            cb.addEventListener('change',()=>{ if(cb.checked) state.rosterChecked.add(s.sn); else state.rosterChecked.delete(s.sn); updateRosterCount(); });
            const nm=document.createElement('span'); nm.textContent = s.name || '(no name)';
            const src=s.sources && s.sources.size ? `<span class="rsrc">${Array.from(s.sources).join('/')}</span>` : '';
            const num=document.createElement('span'); num.className='rnum'; num.innerHTML = esc(s.sn) + src;
            row.appendChild(cb); row.appendChild(nm); row.appendChild(num); box.appendChild(row);
        });
        updateRosterCount();
    }
    function updateRosterCount(){
        const el = overlay.querySelector('#gtr-roster-count');
        if(el) el.textContent = state.rosterChecked.size + ' of ' + state.roster.length + ' selected';
    }
    function wireStep3(){
        overlay.querySelector('#gtr-back-3').addEventListener('click', ()=>gotoStep(2));
        overlay.querySelector('#gtr-roster-filter').addEventListener('input', renderRoster);
        overlay.querySelector('#gtr-roster-all').addEventListener('click', ()=>{
            // Select all that match the current filter.
            const filter = norm(overlay.querySelector('#gtr-roster-filter').value).toLowerCase();
            state.roster.forEach(s=>{
                const match = !filter || (s.name||'').toLowerCase().includes(filter) || s.sn.includes(filter);
                if(match) state.rosterChecked.add(s.sn);
            });
            renderRoster();
        });
        overlay.querySelector('#gtr-roster-none').addEventListener('click', ()=>{ state.rosterChecked.clear(); renderRoster(); });
        overlay.querySelector('#gtr-run-btn').addEventListener('click', ()=>{
            const err=overlay.querySelector('#gtr-err-3');
            const raw=overlay.querySelector('#gtr-students').value;
            const typed = raw.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
            // Merge roster selections + typed numbers, dedupe, drop the lead.
            const seen = new Set();
            let students = [];
            for (const sn of [...Array.from(state.rosterChecked), ...typed]){
                if(!sn || sn===state.leadSN || seen.has(sn)) continue;
                seen.add(sn); students.push(sn);
            }
            if(!students.length){ err.style.display='block'; err.textContent='Select at least one student from the roster, or enter a student number (other than the lead).'; return; }
            err.style.display='none'; state.students=students;
            saveJob({ course: state.selectedClass.name, titles: Array.from(state.selected), students, index:0, errors:[], leadLabel: state.leadLabel });
            gotoStep(4);
            overlay.querySelector('#gtr-stop-btn').addEventListener('click', ()=>{ clearJob(); overlay.querySelector('#gtr-status-bar').textContent='\u25A0 Stopped.'; });
            navTo(studentUrl(students[0]));
        });
    }

    // ── GUIDED TOUR ──────────────────────────────────────────────────────
    // The tour walks through the wizard. Because steps 2-4 are empty until a
    // real class is loaded, the tour injects dummy example data into each step
    // as it arrives, then restores the real (step 1) state when it ends.
    let tourDemoActive = false;
    function buildDemoTree(){
        // Save whatever real state exists, then render an example outline.
        state.selectedClass = { name: '40 Hour HAZWOPER Online', activity: '1156442' };
        state.outline = [
            { name: 'Course Overview', sections: [
                { title: 'Section 1 - 40 Hour HAZWOPER Online', code:'596-CON-6658', type:'CON', leadDone:true, eligible:true },
            ]},
            { name: 'Module 1', sections: [
                { title: 'Section 2 - Module Overview - Legal Issues', code:'596-CON-6660', type:'CON', leadDone:true, eligible:true },
                { title: 'Section 3 - Introduction to OSHA', code:'596-CON-6661', type:'CON', leadDone:true, eligible:true },
                { title: 'Section 4 - Introduction to HAZWOPER', code:'596-CON-6662', type:'CON', leadDone:true, eligible:true },
            ]},
            { name: 'Module 2', sections: [
                { title: 'Section 9 - Module Overview - Toxicology', code:'596-CON-6669', type:'CON', leadDone:true, eligible:true },
                { title: 'Section 10 - Introduction to Toxicology', code:'596-CON-6670', type:'CON', leadDone:false, eligible:false },
                { title: 'Section 11 - The Importance of Dosage', code:'596-CON-6671', type:'CON', leadDone:false, eligible:false },
            ]},
        ];
        buildTree();
        // Pre-check a couple eligible sections so the selection count shows.
        const boxes = overlay.querySelectorAll('#gtr-tree .gtr-secs input[type=checkbox]:not(:disabled)');
        [0,1,2].forEach(i=>{ const b=boxes[i]; if(b){ b.checked=true; if(b._secTitle) state.selected.add(b._secTitle); } });
        refreshSel();
    }
    function clearDemo(){
        // Wipe demo selections and tree, reset state for a clean step 1.
        state.selectedClass = null;
        state.outline = [];
        state.selected = new Set();
        const tree = overlay.querySelector('#gtr-tree'); if(tree) tree.innerHTML='';
        const sInput = overlay.querySelector('#gtr-students'); if(sInput) sInput.value='';
        refreshSel();
    }

    const TOUR = [
        { title:'\u2460 Pick a class', text:'Start here. These are the lead student\u2019s enrollments. Choose the class you want to credit on the other students. The lead student is NOT credited.', target:'#gtr-classlist', pos:'below',
          enter:()=>{ gotoStep(1); } },
        { title:'\u2461 Pick sections / modules', text:'This shows the progress you\u2019re selecting. Check whole modules or individual sections. Sections the lead student doesn\u2019t have credit for are greyed out. This example shows Module 2\u2019s later sections locked.', target:'#gtr-tree', pos:'below',
          enter:()=>{ buildDemoTree(); gotoStep(2); } },
        { title:'\u2461 Select all / Expand', text:'Use Select all to grab every available section, or Expand all to open every module. The counter shows how many sections are selected right now.', target:'#gtr-tree .gtr-toolbar', pos:'below',
          enter:()=>{ gotoStep(2); } },
        { title:'\u2462 Pick students', text:'If the lead is in a corporate account or the class is part of an MSE, the account roster loads here automatically \u2014 filter by name or number and check who to credit. You can also type additional student numbers below. The lead is always excluded.', target:'#gtr-students', pos:'above',
          enter:()=>{ const s=overlay.querySelector('#gtr-students'); if(s && !s.value) s.value='640793\n632978\n640229'; gotoStep(3); } },
        { title:'\u2463 Run', text:'Navigates to each student, opens the same class by name, and credits your selected sections \u2014 verifying each one took before moving on. The window closes when all students are done.', target:'#gtr-run-btn', pos:'above',
          enter:()=>{ gotoStep(3); } },
    ];
    let tourSpot, tourBox, tourStep=0;
    function startTour(){
        endTour(); tourStep=0; tourDemoActive=true;
        tourSpot=document.createElement('div'); tourSpot.id='gtr-tour-spot'; document.body.appendChild(tourSpot);
        tourBox=document.createElement('div'); tourBox.id='gtr-tour-box'; document.body.appendChild(tourBox);
        renderTour();
    }
    function renderTour(){
        const step=TOUR[tourStep], total=TOUR.length;
        if(step.enter){ try{ step.enter(); }catch(e){ console.warn('[GTR] tour step', e); } }
        // Give the wizard a moment to switch steps/render before measuring.
        setTimeout(()=>{
            let tgt=document.querySelector(step.target);
            if(!tgt || step.pos==='center'){
                tourSpot.style.cssText='position:fixed;top:50%;left:50%;width:0;height:0;box-shadow:0 0 0 9999px rgba(0,0,0,.62);border-radius:0;';
            } else {
                const r=tgt.getBoundingClientRect(), p=8;
                tourSpot.style.cssText=`position:fixed;top:${r.top-p}px;left:${r.left-p}px;width:${r.width+p*2}px;height:${r.height+p*2}px;box-shadow:0 0 0 9999px rgba(0,0,0,.62);border-radius:6px;pointer-events:none;transition:top .3s,left .3s,width .3s,height .3s;`;
            }
            const dots=TOUR.map((_,i)=>`<div class="gtr-tour-dot ${i===tourStep?'on':''}"></div>`).join('');
            const last=tourStep===total-1;
            tourBox.innerHTML=`<h4>${step.title}</h4><p>${step.text}</p>
                <div id="gtr-tour-foot"><div id="gtr-tour-dots">${dots}</div>
                <div class="gtr-tour-btns"><button class="gtr-tour-b gtr-tour-skip" id="gtr-tour-skip">Skip</button>
                <button class="gtr-tour-b gtr-tour-next" id="gtr-tour-next">${last?'Done \u2713':'Next \u2192'}</button></div></div>`;
            positionTour(step, tgt);
            document.getElementById('gtr-tour-skip').onclick = endTour;
            document.getElementById('gtr-tour-next').onclick = ()=>{ if(tourStep<total-1){ tourStep++; renderTour(); } else endTour(); };
        }, 60);
    }
    function positionTour(step,tgt){
        tourBox.style.top='50%'; tourBox.style.left='50%'; tourBox.style.transform='translate(-50%,-50%)';
        if(!tgt||step.pos==='center') return;
        requestAnimationFrame(()=>{
            const r=tgt.getBoundingClientRect(), bw=tourBox.offsetWidth||300, bh=tourBox.offsetHeight||160, vw=innerWidth, vh=innerHeight, g=16;
            let top,left; tourBox.style.transform='none';
            if(step.pos==='below'){ top=r.bottom+g; } else { top=r.top-bh-g; }
            left=Math.min(Math.max(r.left+r.width/2-bw/2,g),vw-bw-g);
            top=Math.max(g,Math.min(top,vh-bh-g));
            tourBox.style.top=top+'px'; tourBox.style.left=left+'px';
        });
    }
    function endTour(){
        if(tourSpot){tourSpot.remove();tourSpot=null;}
        if(tourBox){tourBox.remove();tourBox=null;}
        if(tourDemoActive){
            tourDemoActive=false;
            clearDemo();
            gotoStep(1);   // return to the real picker
        }
    }

    // ── Inject button ────────────────────────────────────────────────────
    function injectButton(timeout=15000){
        let elapsed=0; const iv=200;
        const t=setInterval(()=>{
            const transfer=document.querySelector('button[enrollment-transfer]');
            if(transfer){
                clearInterval(t);
                if(document.getElementById('gtr-open-btn')) return;
                const b=document.createElement('button');
                b.id='gtr-open-btn'; b.className='btn btn-success'; b.style.marginLeft='5px'; b.textContent='GTR Credit';
                transfer.insertAdjacentElement('afterend', b);
                b.addEventListener('click', openPanel);
            } else if(elapsed>=timeout){ clearInterval(t); }
            elapsed+=iv;
        }, iv);
    }
    injectButton();

    // ── RESUME ───────────────────────────────────────────────────────────
    async function resume(){
        const job=loadJob(); if(!job) return;
        buildOverlay();
        state.leadSN = currentSN();
        overlay.querySelector('#gtr-header-sub').textContent = job.leadLabel ? ('Lead Student - ' + job.leadLabel + ' \u2022 running\u2026') : 'Running\u2026';
        overlay.classList.add('open');
        gotoStep(4);
        await sleep(150);

        let { course, titles, students, index, errors } = job;
        const titleSet=new Set(titles);
        const setStatus=m=>{ const el=overlay.querySelector('#gtr-status-bar'); if(el) el.textContent=m; };
        const setProg=(d,t)=>{ const el=overlay.querySelector('#gtr-prog-fill'); if(el) el.style.width=Math.round((d/t)*100)+'%'; };
        function queue(cur){
            const el=overlay.querySelector('#gtr-queue'); if(!el) return;
            el.innerHTML = students.map((s,i)=>{
                if(errors.includes(i)) return `<div class="gtr-q gtr-q-error"><span class="ic">\u2717</span>${esc(s)}</div>`;
                if(i<cur) return `<div class="gtr-q gtr-q-done"><span class="ic">\u2713</span>${esc(s)}</div>`;
                if(i===cur) return `<div class="gtr-q gtr-q-active"><span class="ic">\u2192</span>${esc(s)}</div>`;
                return `<div class="gtr-q gtr-q-pending"><span class="ic">\u25CB</span>${esc(s)}</div>`;
            }).join('');
            const a=el.querySelector('.gtr-q-active'); if(a) a.scrollIntoView({block:'nearest'});
        }
        overlay.querySelector('#gtr-stop-btn').addEventListener('click', ()=>{ clearJob(); setStatus('\u25A0 Stopped.'); });

        queue(index); setProg(index, students.length);
        setStatus(`[${index+1}/${students.length}] Loading\u2026`);
        await sleep(1000);
        if(!loadJob()){ setStatus('\u25A0 Stopped.'); return; }

        const expected=String(students[index]).trim();
        const loaded=currentSN();
        if(loaded!==expected){
            if(!job._renav){ setStatus(`[${index+1}/${students.length}] \u27F3 Wrong student (${loaded||'?'}). Re-navigating\u2026`); saveJob({...job,_renav:true}); await sleep(150); navTo(studentUrl(expected)); return; }
            setStatus(`[${index+1}/${students.length}] \u2717 Could not load #${expected} (shows ${loaded||'?'}). Skipped.`);
            if(!errors.includes(index)) errors.push(index);
            return advance();
        }
        if(job._renav){ const j=loadJob(); delete j._renav; saveJob(j); }

        try {
            setStatus(`[${index+1}/${students.length}] #${expected}: opening class\u2026`);
            await openClassesTab();
            await openManageProgressByName(course);
            await waitFor('div[ng-repeat="entry in EnrollmentProgressCtrl.Outline"]', 10000);
            await sleep(300);
            setStatus(`[${index+1}/${students.length}] #${expected}: crediting\u2026`);
            const res = await creditSelected(titleSet, (title,d)=>setStatus(`[${index+1}/${students.length}] #${expected}: ${d} credited\u2026`));
            if(res.done === 0 && titles.length > 0){
                // Nothing matched/credited — surface it rather than a false success.
                setStatus(`[${index+1}/${students.length}] \u2717 #${expected}: 0 of ${titles.length} credited \u2014 no matching sections found.`);
                if(!errors.includes(index)) errors.push(index);
            } else {
                setStatus(`[${index+1}/${students.length}] \u2713 #${expected}: ${res.done} of ${titles.length} credited.`);
            }
        } catch(e){
            console.error('[GTR]', e);
            setStatus(`[${index+1}/${students.length}] \u26A0 ${e.message}`);
            if(!errors.includes(index)) errors.push(index);
        }
        await sleep(400);
        return advance();

        function advance(){
            setProg(index+1, students.length); queue(index+1);
            const ni=index+1;
            if(!loadJob()){ setStatus('\u25A0 Stopped.'); return; }
            if(ni>=students.length){
                clearJob();
                setStatus(`All ${students.length} students processed.`);
                queue(students.length);
                overlay.querySelector('#gtr-header-sub').textContent='Done';
                setTimeout(()=>{ overlay.classList.remove('open'); endTour(); }, 1500);
                return;
            }
            saveJob({ course, titles, students, index:ni, errors });
            setStatus(`[${ni+1}/${students.length}] Navigating to #${students[ni]}\u2026`);
            setTimeout(()=>navTo(studentUrl(students[ni])), 200);
        }
    }

    setTimeout(resume, 1500);
    console.log('[GTR] GTR Credit v9.6.0 ready');
})();