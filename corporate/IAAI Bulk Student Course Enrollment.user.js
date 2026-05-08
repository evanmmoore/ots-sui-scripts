// ==UserScript==
// @name         IAAI Bulk Student Course Enrollment
// @namespace    http://otsystems.net/
// @version      8.3
// @description  Bulk enroll students with per-student course selection, progress HUD, auto-confirm admin-only classes, and no double enrollment
// @match        https://otsystems.net/admin/corporate/org_master_edit.asp?id=5166
// @match        https://otsystems.net/admin/students/dashboard/?student_number=*
// @grant        none
// ==/UserScript==

(async function () {
    'use strict';

    const isOrgPage = location.pathname.includes('/admin/corporate/org_master_edit.asp');
    const isStudentPage = location.pathname.includes('/admin/students/dashboard/');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    /* =================================================
       HUD
    ================================================= */
    function createHUD() {
        const hud = document.createElement('div');
        hud.id = 'bulk-hud';
        hud.style.cssText = `
            position:fixed;bottom:20px;right:20px;
            background:#222;color:#fff;
            padding:12px 16px;border-radius:6px;
            font-size:13px;z-index:99999;
            font-family:Arial,sans-serif;min-width:260px;line-height:1.6;
        `;
        document.body.appendChild(hud);
        return hud;
    }

    function updateHUD(hud, state, msg, isError = false) {
        hud.innerHTML = `
            <strong>Bulk Enrollment</strong><br>
            Student: ${state.index + 1} / ${state.students.length}<br>
            ID: ${state.students[state.index].id}<br>
            <span style="color:${isError ? '#f88' : '#9fd'};">${msg}</span>
        `;
    }

    /* =================================================
       ORG PAGE UI
    ================================================= */
    if (isOrgPage) {
        const toggleAp = document.querySelector('#toggle-ap');
        if (!toggleAp) return;

        const container = toggleAp.closest('.col-sm-5');
        if (!container || document.getElementById('bulk-enroll-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'bulk-enroll-btn';
        btn.className = 'btn btn-warning';
        btn.style.marginRight = '10px';
        btn.textContent = 'Bulk Enrollment';
        container.insertBefore(btn, container.firstChild);

        const modal = document.createElement('div');
        modal.hidden = true;
        modal.style.cssText = `
            position:fixed;top:50%;left:50%;
            transform:translate(-50%,-50%);
            background:#fff;padding:20px;
            border:2px solid #333;z-index:99999;
            width:520px;max-height:80%;overflow:auto;
        `;

        modal.innerHTML = `
            <h3>Bulk Enrollment</h3>
            <label>Student Numbers (one per line)</label>
            <textarea id="be-students" style="width:100%;height:80px;"></textarea>
            <br><br>
            <button id="be-load" class="btn btn-info">Load Students</button>
            <hr>
            <table id="be-table" style="width:100%;display:none;">
                <thead>
                    <tr>
                        <th>Student #</th>
                        <th>HAZ Refresher</th>
                        <th>Asbestos</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
            <br>
            <button id="be-start" class="btn btn-success">Enroll Students</button>
            <button id="be-cancel" class="btn btn-default" style="margin-left:8px;">Cancel</button>
        `;

        document.body.appendChild(modal);
        btn.onclick = () => modal.hidden = false;
        modal.querySelector('#be-cancel').onclick = () => modal.hidden = true;

        modal.querySelector('#be-load').onclick = async () => {
            const list = modal.querySelector('#be-students').value
                .split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

            const tbody = modal.querySelector('#be-table tbody');
            tbody.innerHTML = '';

            for (const id of list) {
                let firstName = '', lastName = '';
                try {
                    const res = await fetch(`/admin/students/dashboard/?student_number=${id}`);
                    const html = await res.text();
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const h4 = doc.querySelector('div.col-sm-8 h4');
                    if (h4) {
                        const parts = h4.textContent.trim().split('•')[0].trim().split(/\s+/);
                        firstName = parts[0] || '';
                        lastName = parts.slice(1).join(' ') || '';
                    }
                } catch (e) {
                    console.warn(`Could not fetch name for student #${id}`);
                }

                const tr = document.createElement('tr');
                tr.dataset.student = id;
                tr.innerHTML = `
                    <td>${id} – ${firstName} ${lastName}</td>
                    <td style="text-align:center"><input type="checkbox" class="haz"></td>
                    <td style="text-align:center"><input type="checkbox" class="asb"></td>
                `;
                tbody.appendChild(tr);
            }

            modal.querySelector('#be-table').style.display = list.length ? 'table' : 'none';
        };

        modal.querySelector('#be-start').onclick = () => {
            const rows = modal.querySelectorAll('#be-table tbody tr');
            const students = [];
            rows.forEach(row => {
                const courses = [];
                if (row.querySelector('.haz').checked) courses.push('haz');
                if (row.querySelector('.asb').checked) courses.push('asb');
                if (courses.length) students.push({ id: row.dataset.student, courses });
            });

            if (!students.length) { alert('Select at least one course for a student.'); return; }

            localStorage.setItem('bulkEnroll', JSON.stringify({ students, index: 0 }));
            sessionStorage.setItem('bulkEnrollActive', '1');
            location.href = `/admin/students/dashboard/?student_number=${students[0].id}`;
        };
    }

    /* =================================================
       STUDENT DASHBOARD AUTOMATION
    ================================================= */
    if (isStudentPage) {
        if (!sessionStorage.getItem('bulkEnrollActive')) return;

        const state = JSON.parse(localStorage.getItem('bulkEnroll'));
        if (!state) {
            sessionStorage.removeItem('bulkEnrollActive');
            return;
        }

        const hud = createHUD();
        const current = state.students[state.index];

        window.confirm = (msg) => { console.log('Auto-confirmed:', msg); return true; };

        function waitFor(selectorOrFn, timeout = 12000) {
            return new Promise(async resolve => {
                const start = Date.now();
                while (Date.now() - start < timeout) {
                    const el = typeof selectorOrFn === 'function'
                        ? selectorOrFn()
                        : document.querySelector(selectorOrFn);
                    if (el) return resolve(el);
                    await sleep(250);
                }
                console.warn(`waitFor timed out: ${selectorOrFn}`);
                resolve(null);
            });
        }

        // Wait for a selector/fn to return falsy (i.e. element gone from DOM)
        function waitForGone(selectorOrFn, timeout = 12000) {
            return new Promise(async resolve => {
                const start = Date.now();
                while (Date.now() - start < timeout) {
                    const el = typeof selectorOrFn === 'function'
                        ? selectorOrFn()
                        : document.querySelector(selectorOrFn);
                    if (!el) return resolve(true);
                    await sleep(250);
                }
                console.warn(`waitForGone timed out`);
                resolve(false);
            });
        }

        async function clickClassesTab() {
            updateHUD(hud, state, 'Opening Classes tab…');
            const tab = await waitFor(() =>
                [...document.querySelectorAll('a[ng-click="select($event)"]')]
                    .find(a => a.textContent.trim().startsWith('Classes'))
            );
            if (tab) { tab.click(); await sleep(1500); }
            else console.warn('Classes tab not found');
        }

        // Close any open modal cleanly and wait for it to disappear
        async function closeModalIfOpen() {
            const cancelBtn = document.querySelector('button[ng-click="emc.Cancel()"]');
            if (cancelBtn) {
                cancelBtn.click();
                await waitForGone('button[ng-click="emc.Cancel()"]', 5000);
                await sleep(500);
            }
        }

        async function enrollCourse(courseType) {
            const courseLabel = courseType === 'haz' ? 'HAZWOPER' : 'Asbestos';
            updateHUD(hud, state, `Starting ${courseLabel} enrollment…`);

            // Ensure no stale modal is open before starting
            await closeModalIfOpen();

            // 1. Wait for and click "Enroll in Class" button
            const enrollBtn = await waitFor('button[ng-click="cc.EnrollStart()"]');
            if (!enrollBtn) {
                updateHUD(hud, state, `❌ Enroll button not found for ${courseLabel}`, true);
                return false;
            }
            enrollBtn.click();
            await sleep(1000);

            // 2. Wait for catalog rows to appear in modal
            const catalogAppeared = await waitFor('[ng-repeat="cat in emc.Catalog"]');
            if (!catalogAppeared) {
                updateHUD(hud, state, `❌ Catalog did not load for ${courseLabel}`, true);
                await closeModalIfOpen();
                return false;
            }
            await sleep(500);

            updateHUD(hud, state, `Finding ${courseLabel} in catalog…`);

            // 3. Find the correct course row by display_name text
            const courseRow = await waitFor(() => {
                const rows = document.querySelectorAll('[ng-repeat="cc in cat.Classes | limitTo: emc.PageSize"]');
                for (const row of rows) {
                    const name = row.querySelector('span[ng-bind-html="cc.display_name"]')?.textContent || '';
                    if (courseType === 'haz' && /HAZWOPER/i.test(name)) return row;
                    if (courseType === 'asb' && /Asbestos/i.test(name)) return row;
                }
                return null;
            });

            if (!courseRow) {
                updateHUD(hud, state, `❌ ${courseLabel} not found in catalog`, true);
                await closeModalIfOpen();
                return false;
            }

            // 4. Click the action button in that specific row
            const rowBtn = courseRow.querySelector('button[ng-click^="emc.PickVersion"], button[ng-click^="emc.SelectClass"]');
            if (!rowBtn) {
                updateHUD(hud, state, `❌ No action button for ${courseLabel}`, true);
                await closeModalIfOpen();
                return false;
            }

            const needsVersionPick = rowBtn.getAttribute('ng-click').includes('PickVersion');
            rowBtn.click();
            console.log(`Clicked: ${rowBtn.getAttribute('ng-click')} for ${courseLabel}`);
            await sleep(1000);

            // 5. If version picker is needed, select the first version
            if (needsVersionPick) {
                updateHUD(hud, state, `Selecting version for ${courseLabel}…`);

                const versionBtn = await waitFor('button[ng-click^="vmc.PickVersion"]');
                if (!versionBtn) {
                    updateHUD(hud, state, `❌ Version picker did not appear for ${courseLabel}`, true);
                    await closeModalIfOpen();
                    return false;
                }

                versionBtn.click();
                console.log('Clicked vmc.PickVersion - selected first version');
                await sleep(1000);
            }

            // 6. Wait for Save button and click it
            updateHUD(hud, state, `Saving ${courseLabel} enrollment…`);
            const saveBtn = await waitFor('button[ng-click="emc.Save()"]');
            if (!saveBtn) {
                updateHUD(hud, state, `❌ Save button did not appear for ${courseLabel}`, true);
                await closeModalIfOpen();
                return false;
            }

            saveBtn.click();
            console.log('Clicked Save');

            // ✅ Wait for modal to fully close before declaring success or moving to next course
            const modalClosed = await waitForGone('button[ng-click="emc.Save()"]', 10000);
            if (!modalClosed) {
                console.warn(`Modal did not close after saving ${courseLabel}`);
            }

            // ✅ Extra buffer to let the page settle and re-render the Classes list
            await sleep(2000);

            updateHUD(hud, state, `${courseLabel} enrolled ✓`);
            return true;
        }

        // --- Main flow ---
        await sleep(2000);
        await clickClassesTab();

        const results = [];
        for (const courseType of current.courses) {
            const ok = await enrollCourse(courseType);
            results.push({ courseType, ok });
            console.log(`${courseType} result:`, ok ? 'success' : 'failed');
            // ✅ Pause between courses so the page is fully settled
            await sleep(2000);
        }

        // Show a summary of what succeeded/failed
        const summary = results.map(r =>
            `${r.courseType === 'haz' ? 'HAZWOPER' : 'Asbestos'}: ${r.ok ? '✓' : '✗'}`
        ).join(' | ');
        updateHUD(hud, state, `Done — ${summary}`);
        await sleep(2000);

        state.index++;
        if (state.index < state.students.length) {
            localStorage.setItem('bulkEnroll', JSON.stringify(state));
            sessionStorage.setItem('bulkEnrollActive', '1');
            location.href = `/admin/students/dashboard/?student_number=${state.students[state.index].id}`;
        } else {
            localStorage.removeItem('bulkEnroll');
            sessionStorage.removeItem('bulkEnrollActive');
            setTimeout(() => hud.remove(), 4000);
            alert('✅ Bulk enrollment complete!');
        }
    }
})();