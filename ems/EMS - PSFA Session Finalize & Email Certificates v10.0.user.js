// ==UserScript==
// @name         PSFA Session Finalize & Email Certificates v10.0
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  Complete PSFA automation - Open Enrollment and On-Site workflows
// @match        https://admin2025.otsystems.net/training/classroom/session/*/students*.asp
// @match        https://admin2025.otsystems.net/training/classroom/session/*
// @match        https://otsystems.net/admin/students/dashboard/*
// @match        https://otsystems.net/admin/students/dashboard/classes/completecourse.asp*
// @match        https://otsystems.net/admin/students/dashboard/classes/CompleteCourse.asp*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    console.log('PSFA Script v10.0 loaded on:', window.location.href);

    // ============================================================
    // CONSTANTS
    // ============================================================
    const CERT_TEMPLATES = {
        '547': '547 - Sacramento County - 21 Hour PSFA',
        '554': '554 - El Dorado County EMSA - 21 Hour PSFA',
        '555': '555 - Santa Barbara County EMSA - 21 Hour PSFA',
        '592': '592 - Inland Counties - 21 Hour PSFA',
        '579': '579 - Monterey County - 21 Hour PSFA'
    };

    // ============================================================
    // ROUTE: SESSION PAGE
    // ============================================================
    const isSessionPage = window.location.href.includes('admin2025.otsystems.net/training/classroom/session/');
    const isCompleteCoursePage = window.location.href.toLowerCase().includes('completecourse.asp') &&
        window.location.search.includes('psfa_auto=1');
    const isDashboardAuto = window.location.href.includes('otsystems.net/admin/students/dashboard/') &&
        window.location.search.includes('psfa_auto=1') &&
        !window.location.href.toLowerCase().includes('completecourse.asp');

    if (isSessionPage) {
        initSessionPage();
    } else if (isCompleteCoursePage) {
        initCompleteCoursePage();
    } else if (isDashboardAuto) {
        initDashboardWorkflow();
    }

    // ============================================================
    // SESSION PAGE - Helpers
    // ============================================================
    function initSessionPage() {
        // Inject button next to "Finalized:" detail item, retry until page is ready
        setTimeout(() => addProcessButton(), 2000);
        setInterval(() => addProcessButton(), 5000);
    }

    function addProcessButton() {
        if (!isPSFAClass() || document.querySelector('.psfa-process-btn')) return;

        const sessionId = getSessionId();
        if (!sessionId) return;

        const finalizedItem = Array.from(document.querySelectorAll('.detail-item')).find(item =>
            item.querySelector('strong')?.textContent === 'Finalized:'
        );
        if (!finalizedItem) return;

        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-primary psfa-process-btn';
        btn.innerHTML = '<i class="fa fa-flag-checkered"></i> Process PSFA Class';
        btn.style.cssText = 'margin-left:10px;vertical-align:middle';

        btn.onclick = () => {
            const endDate = getSessionEndDate();
            if (!endDate) { alert('Could not find session end date.'); return; }

            const students = getStudentList();
            if (students.length === 0) { alert('No students found.'); return; }

            showClassTypeDialog(sessionId, students, endDate);
        };

        finalizedItem.appendChild(btn);
    }

    function isPSFAClass() {
        const title = document.querySelector('h4 span');
        return title && (title.textContent.includes('Public Safety First Aid') || title.textContent.includes('PSFA'));
    }

    function getSessionId() {
        const match = window.location.pathname.match(/\/session\/(\d+)/);
        return match ? match[1] : null;
    }

    function getSessionEndDate() {
        const dateItem = Array.from(document.querySelectorAll('.detail-item')).find(item =>
            item.querySelector('strong')?.textContent === 'Date(s):'
        );
        if (!dateItem) return null;
        const dateText = dateItem.querySelector('span')?.textContent || '';
        const match = dateText.match(/- (.+)$/);
        if (!match) return null;
        const parsed = new Date(match[1].trim());
        if (isNaN(parsed)) return null;
        return `${parsed.getMonth() + 1}/${parsed.getDate()}/${parsed.getFullYear()}`;
    }

    function isSessionFinalized() {
        return Array.from(document.querySelectorAll('.detail-item')).some(item =>
            item.textContent.includes('Finalized:') && item.textContent.includes('Yes')
        );
    }

    function getStudentList() {
        const rows = document.querySelectorAll('table tbody tr');
        const students = [];

        rows.forEach(row => {
            const activityIdCell = row.cells[1];
            const studentInfoCell = row.cells[3];

            if (activityIdCell && studentInfoCell) {
                const activityId = activityIdCell.textContent.trim();
                const studentIdDiv = studentInfoCell.querySelector('.student-id');
                const nameLink = studentInfoCell.querySelector('.student-name a');

                if (studentIdDiv && nameLink) {
                    const studentNumberMatch = studentIdDiv.textContent.match(/S#:\s*(\d+)/);
                    if (studentNumberMatch) {
                        students.push({
                            activityId,
                            studentNumber: studentNumberMatch[1],
                            name: nameLink.textContent.trim()
                        });
                    }
                }
            }
        });

        console.log('Found students:', students);
        return students;
    }

    // ============================================================
    // STEP 1: Class Type Selection
    // ============================================================
    function showClassTypeDialog(sessionId, students, endDate) {
        const overlay = createOverlay();
        const dialog = createDialog();

        dialog.innerHTML = `
            <h2 style="margin-top:0;margin-bottom:30px;color:#1976d2">
                <i class="fa fa-question-circle"></i> PSFA Class Type
            </h2>
            <p style="font-size:18px;margin-bottom:30px">Is this an <strong>Open Enrollment</strong> or <strong>On-Site</strong> class?</p>
            <div style="display:flex;gap:20px;justify-content:center">
                <button id="openEnrollmentBtn" class="btn btn-primary btn-lg" style="padding:15px 40px;font-size:16px">
                    <i class="fa fa-users"></i><br>Open Enrollment
                </button>
                <button id="onSiteBtn" class="btn btn-success btn-lg" style="padding:15px 40px;font-size:16px">
                    <i class="fa fa-building"></i><br>On-Site
                </button>
            </div>
        `;

        mountDialog(overlay, dialog);

        dialog.querySelector('#openEnrollmentBtn').onclick = () => {
            removeOverlay(overlay);
            showChecklist(sessionId, students, endDate, 'open-enrollment');
        };
        dialog.querySelector('#onSiteBtn').onclick = () => {
            removeOverlay(overlay);
            showChecklist(sessionId, students, endDate, 'on-site');
        };
    }

    // ============================================================
    // STEP 2: Checklist
    // ============================================================
    function showChecklist(sessionId, students, endDate, classType) {
        const isOpenEnrollment = classType === 'open-enrollment';
        const title = isOpenEnrollment ? 'Open Enrollment' : 'On-Site';
        const fileLocation = isOpenEnrollment
            ? 'Tapo Server → Classroom Records → Open Enrollment → EMS and CPR Training → PSFA → SUI SIMI → Correct Year'
            : 'Tapo Server → Classroom Records → On-Site Training → PSFA → Client Name → Correct Year';

        const overlay = createOverlay();
        const dialog = createDialog('900px', '90vh', true);

        const checklistHTML = isOpenEnrollment
            ? buildOpenEnrollmentChecklist(fileLocation)
            : buildOnSiteChecklist(fileLocation);

        dialog.innerHTML = `
            <div style="background:#1976d2;color:white;padding:15px 30px">
                <h3 style="margin:0"><i class="fa fa-clipboard-check"></i> PSFA ${title} Checklist</h3>
            </div>
            <div style="padding:30px;overflow-y:auto;flex:1">
                <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:15px;margin-bottom:20px">
                    <strong>⚠️ Important:</strong> Complete all items below before proceeding.
                </div>
                <div style="margin-bottom:15px;text-align:right;display:flex;gap:10px;justify-content:flex-end">
                    <button id="selectAllBtn" class="btn btn-sm btn-success">
                        <i class="fa fa-check-square"></i> Select All
                    </button>
                    <button id="deselectAllBtn" class="btn btn-sm btn-secondary">
                        <i class="fa fa-square-o"></i> Deselect All
                    </button>
                </div>
                <div style="background:#f5f5f5;padding:20px;border-radius:5px;margin-bottom:20px">
                    ${checklistHTML}
                </div>
            </div>
            <div style="padding:20px 30px;background:white;border-top:1px solid #e0e0e0;display:flex;gap:10px;justify-content:center">
                <button id="proceedBtn" class="btn btn-primary btn-lg" style="padding:12px 30px">
                    <i class="fa fa-arrow-right"></i> Proceed
                </button>
                <button id="cancelBtn" class="btn btn-secondary" style="padding:12px 30px">Cancel</button>
            </div>
        `;

        mountDialog(overlay, dialog);

        const checkboxes = dialog.querySelectorAll('.checklist-item');
        dialog.querySelector('#selectAllBtn').onclick = () => checkboxes.forEach(cb => cb.checked = true);
        dialog.querySelector('#deselectAllBtn').onclick = () => checkboxes.forEach(cb => cb.checked = false);
        dialog.querySelector('#proceedBtn').onclick = () => {
            removeOverlay(overlay);
            showChecklistConfirmation(sessionId, students, endDate, classType);
        };
        dialog.querySelector('#cancelBtn').onclick = () => removeOverlay(overlay);
    }

    function buildChecklistItem(id, label, subItems = []) {
        const subHTML = subItems.length
            ? `<ul style="margin:5px 0 0 20px;font-size:13px;color:#555;line-height:1.6">${subItems.map(s => `<li>${s}</li>`).join('')}</ul>`
            : '';
        return `
            <div style="margin-bottom:15px;padding:15px;background:white;border-radius:5px;border:2px solid #e0e0e0">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <label for="${id}" style="cursor:pointer;flex:1"><strong>${label}</strong></label>
                    <input type="checkbox" id="${id}" class="checklist-item" style="margin-left:15px;transform:scale(2);cursor:pointer;flex-shrink:0">
                </div>
                ${subHTML}
            </div>
        `;
    }

    function buildOpenEnrollmentChecklist(fileLocation) {
        return [
            buildChecklistItem('check1', '1. Class Rosters – Check rosters to ensure no information is missing and that students attend each day of class.'),
            buildChecklistItem('check2', '2. Skills Sheet – Verify that everything has been signed and all six skills are checked off.'),
            buildChecklistItem('check3', '3. Post Test – Confirm that all post-tests are scored at 80% or higher.'),
            buildChecklistItem('check4', '4. Evaluations – Use the correct evaluation template.'),
            buildChecklistItem('check5', '5. Classroom Session – Verify Attendance, Online Done, and Attended Session are all Yes.'),
            buildChecklistItem('check6', `6. Save File – Save under: ${fileLocation}`)
        ].join('');
    }

    function buildOnSiteChecklist(fileLocation) {
        return [
            buildChecklistItem('check1', '1. Class Rosters (STC) – Check rosters to ensure no information is missing and that students attend each day of class.', [
                'All names on rosters must have signatures from the students',
                'If there is no signature, check OTS to see if they were a no show, and cross them out',
                'Mark is the only authorized person that can sign the rosters',
                'Safety Unlimited Rosters - everyone should be signed in everyday'
            ]),
            buildChecklistItem('check2', '2. BLS/CPR Portion – Give to Dianna as is (don\'t check anything on this)'),
            buildChecklistItem('check3', '3. Exams – Verify all exams are completed and graded', [
                'Make sure there are the same amount per the amount of students in the class',
                'All exams graded and have an 80% or higher',
                '<strong>Naloxone Exam</strong> - Same amount per students, graded, 80% or higher'
            ]),
            buildChecklistItem('check4', '4. Skills Sheet – Verify completion and signatures', [
                'Same amount match the amount of students that are in the class',
                'Everything has been checked off',
                'All sheets have been signed'
            ]),
            buildChecklistItem('check5', '5. Evaluations – Check and scan with STC rosters', [
                'Check evaluations to make sure there are no major or missing information',
                'Use the correct evaluation template',
                '<strong>STC rosters and evaluations need to be scanned together</strong>',
                'Email to Burry Harrington and CC: Mkomins@safetyunlimited.com'
            ]),
            buildChecklistItem('check6', '6. Post Test – Confirm that all post-tests are scored at 80% or higher.'),
            buildChecklistItem('check7', '7. Classroom Session – Verify Attendance, Online Done, and Attended Session are all Yes.'),
            buildChecklistItem('check8', `8. Save File – Save under: ${fileLocation}<br><em style="font-size:13px;color:#555">Note: Mark will email Joyce, Susan, and CC Jules to send the customer an invoice.</em>`)
        ].join('');
    }

    // ============================================================
    // STEP 3: Checklist Confirmation
    // ============================================================
    function showChecklistConfirmation(sessionId, students, endDate, classType) {
        const overlay = createOverlay();
        const dialog = createDialog();

        dialog.innerHTML = `
            <h3 style="margin-top:0;margin-bottom:20px;color:#1976d2">
                <i class="fa fa-exclamation-triangle"></i> Confirmation Required
            </h3>
            <p style="font-size:16px;margin-bottom:30px;line-height:1.6">
                By proceeding, you confirm you've completed <strong>everything</strong> in the checklist.
            </p>
            <div style="display:flex;gap:15px;justify-content:center">
                <button id="yesBtn" class="btn btn-success btn-lg" style="padding:12px 40px">
                    <i class="fa fa-check"></i> Yes, Proceed
                </button>
                <button id="noBtn" class="btn btn-danger btn-lg" style="padding:12px 40px">
                    <i class="fa fa-times"></i> No, Go Back
                </button>
            </div>
        `;

        mountDialog(overlay, dialog);

        dialog.querySelector('#yesBtn').onclick = () => {
            removeOverlay(overlay);
            if (classType === 'open-enrollment') {
                // Open Enrollment always uses template 337
                showStudentSelection(sessionId, students, endDate, classType, '337');
            } else {
                // On-Site: pick a certificate template first
                showTemplateSelector(sessionId, students, endDate);
            }
        };
        dialog.querySelector('#noBtn').onclick = () => {
            removeOverlay(overlay);
            showChecklist(sessionId, students, endDate, classType);
        };
    }

    // ============================================================
    // STEP 4a: Template Selector (On-Site ONLY)
    // ============================================================
    function showTemplateSelector(sessionId, students, endDate) {
        const overlay = createOverlay();
        const dialog = createDialog('600px');

        const templateOptions = Object.entries(CERT_TEMPLATES)
            .map(([id, name]) => `<option value="${id}">${name}</option>`)
            .join('');

        dialog.innerHTML = `
            <h3 style="margin-top:0">Select Certificate Template</h3>
            <div style="background:#e3f2fd;padding:15px;border-radius:5px;margin-bottom:20px">
                <p style="margin:0 0 10px 0"><strong>📅 Completion Date:</strong> <span style="font-size:18px;color:#1976d2">${endDate}</span></p>
                <label style="display:block;margin-bottom:8px;font-weight:bold">Certificate Template:</label>
                <select id="templateSelect" class="form-control" style="width:100%;padding:8px;font-size:14px">
                    <option value="">-- Select Template --</option>
                    ${templateOptions}
                </select>
            </div>
            <div style="display:flex;gap:10px;justify-content:center">
                <button id="continueBtn" class="btn btn-primary btn-lg" style="padding:12px 30px" disabled>Continue</button>
                <button id="cancelBtn" class="btn btn-secondary" style="padding:12px 30px">Cancel</button>
            </div>
        `;

        mountDialog(overlay, dialog);

        const templateSelect = dialog.querySelector('#templateSelect');
        const continueBtn = dialog.querySelector('#continueBtn');

        templateSelect.onchange = () => { continueBtn.disabled = !templateSelect.value; };
        continueBtn.onclick = () => {
            const templateId = templateSelect.value;
            if (!templateId) return;
            removeOverlay(overlay);
            showStudentSelection(sessionId, students, endDate, 'on-site', templateId);
        };
        dialog.querySelector('#cancelBtn').onclick = () => removeOverlay(overlay);
    }

    // ============================================================
    // STEP 4b: Student Selection
    // ============================================================
    function showStudentSelection(sessionId, students, endDate, classType, templateId) {
        const isOpenEnrollment = classType === 'open-enrollment';
        const title = isOpenEnrollment ? 'Open Enrollment' : 'On-Site';

        const overlay = createOverlay();
        const dialog = createDialog('900px', '80vh', true);

        dialog.innerHTML = `
            <h3 style="margin-top:0">${title} - Select Students</h3>
            <div style="background:#e3f2fd;padding:15px;border-radius:5px;margin-bottom:20px">
                <p style="margin:0"><strong>📅 Completion Date:</strong> ${endDate}</p>
                ${!isOpenEnrollment && templateId ? `<p style="margin:5px 0 0"><strong>🎓 Template:</strong> ${CERT_TEMPLATES[templateId]}</p>` : ''}
            </div>
            <div style="margin-bottom:15px;padding:10px;background:#f5f5f5;border-radius:5px">
                <input type="checkbox" id="selectAll" checked style="margin-right:10px">
                <label for="selectAll" style="font-weight:bold;cursor:pointer">Select All Students</label>
            </div>
            <table class="table table-bordered table-striped">
                <thead style="background-color:rgb(32,77,116);color:white">
                    <tr>
                        <th style="width:50px;text-align:center"><input type="checkbox" id="headerCheck" checked></th>
                        <th style="width:50px">#</th>
                        <th>Student Name</th>
                        <th style="width:120px">Student #</th>
                        <th style="width:120px">Activity ID</th>
                    </tr>
                </thead>
                <tbody id="studentList"></tbody>
            </table>
            <div style="display:flex;gap:10px;justify-content:center;margin-top:20px">
                <button id="processBtn" class="btn btn-primary btn-lg" style="padding:12px 30px">
                    <i class="fa fa-play"></i> Start Process
                </button>
                <button id="closeBtn" class="btn btn-secondary" style="padding:12px 30px">Close</button>
            </div>
        `;

        mountDialog(overlay, dialog);

        const tbody = dialog.querySelector('#studentList');
        const checkboxes = [];

        students.forEach((s, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center"><input type="checkbox" class="student-check" checked data-index="${i}"></td>
                <td style="text-align:center">${i + 1}</td>
                <td>${s.name}</td>
                <td style="text-align:center;font-weight:bold">${s.studentNumber}</td>
                <td style="text-align:center;font-weight:bold">${s.activityId}</td>
            `;
            tbody.appendChild(tr);
            checkboxes.push(tr.querySelector('.student-check'));
        });

        const selectAll = dialog.querySelector('#selectAll');
        const headerCheck = dialog.querySelector('#headerCheck');
        selectAll.onchange = () => { checkboxes.forEach(cb => cb.checked = selectAll.checked); headerCheck.checked = selectAll.checked; };
        headerCheck.onchange = () => { checkboxes.forEach(cb => cb.checked = headerCheck.checked); selectAll.checked = headerCheck.checked; };

        dialog.querySelector('#processBtn').onclick = () => {
            const selected = students.filter((s, i) => checkboxes[i].checked);
            if (selected.length === 0) { alert('Please select at least one student.'); return; }

            const workflow = isOpenEnrollment
                ? '1. Complete course\n2. Email certificate'
                : '1. Complete course\n2. Swap certificate template\n3. Email certificate';

            if (!confirm(`Process ${selected.length} student(s)?\n\nWorkflow per student:\n${workflow}\n\nThen: Finalize session`)) return;

            dialog.innerHTML = `
                <h3 style="margin-top:0">Processing Students</h3>
                <div style="padding:20px;text-align:center">
                    <div style="font-size:18px;margin-bottom:15px" id="statusText">
                        <i class="fa fa-spinner fa-spin"></i> Initializing...
                    </div>
                    <div style="background:#f5f5f5;padding:15px;border-radius:5px;margin-top:20px">
                        <div><strong>Students:</strong> ${selected.length}</div>
                        ${!isOpenEnrollment && templateId ? `<div><strong>Template:</strong> ${CERT_TEMPLATES[templateId]}</div>` : ''}
                    </div>
                </div>
            `;

            processStudentsSequentially(selected, endDate, classType, templateId, sessionId, dialog);
        };

        dialog.querySelector('#closeBtn').onclick = () => removeOverlay(overlay);
    }

    // ============================================================
    // SEQUENTIAL PROCESSING
    // ============================================================
    function processStudentsSequentially(students, endDate, classType, templateId, sessionId, dialog) {
        const statusText = dialog.querySelector('#statusText');
        let currentIndex = 0;

        function processNext() {
            if (currentIndex >= students.length) {
                statusText.innerHTML = '<i class="fa fa-check" style="color:#4CAF50"></i> All students processed!';
                setTimeout(() => finalizeSession(sessionId, dialog), 1500);
                return;
            }

            const student = students[currentIndex];
            console.log(`Processing ${currentIndex + 1}/${students.length}: ${student.name}`);

            statusText.innerHTML = `
                <i class="fa fa-spinner fa-spin"></i>
                Student ${currentIndex + 1}/${students.length}: ${student.name}
                <br><small>Opening student dashboard...</small>
            `;

            let url = `https://otsystems.net/admin/students/dashboard/?activity_id=${student.activityId}`;
            url += `&psfa_auto=1`;
            url += `&completion_date=${encodeURIComponent(endDate)}`;
            url += `&class_type=${classType}`;
            url += `&student_name=${encodeURIComponent(student.name)}`;
            url += `&student_number=${student.studentNumber}`;
            if (templateId) url += `&template_id=${templateId}`;

            const popup = window.open(url, '_blank');
            if (!popup) { alert('Popup blocked! Please allow popups and try again.'); return; }

            let done = false;
            let timeoutId;

            const handler = (event) => {
                if (event.data?.type === 'PSFA_STUDENT_COMPLETE' && event.data.activityId === student.activityId) {
                    if (!done) {
                        done = true;
                        clearTimeout(timeoutId);
                        window.removeEventListener('message', handler);
                        console.log(event.data.success ? `✓ Done: ${student.name}` : `⚠ Issues with: ${student.name}`);
                        currentIndex++;
                        setTimeout(processNext, 1000);
                    }
                }
            };

            window.addEventListener('message', handler);

            timeoutId = setTimeout(() => {
                if (!done) {
                    done = true;
                    window.removeEventListener('message', handler);
                    console.warn(`Timeout: ${student.name}`);
                    try { if (!popup.closed) popup.close(); } catch (e) {}
                    currentIndex++;
                    setTimeout(processNext, 1000);
                }
            }, 180000);
        }

        processNext();
    }

    // ============================================================
    // FINALIZE SESSION
    // ============================================================
    function finalizeSession(sessionId, dialog) {
        const statusText = dialog.querySelector('#statusText');

        if (isSessionFinalized()) {
            statusText.innerHTML = '<i class="fa fa-check" style="color:#4CAF50"></i> Complete!<br><small>Session was already finalized</small>';
            setTimeout(() => { alert('All students processed successfully!'); window.location.reload(); }, 2000);
            return;
        }

        statusText.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Finalizing session...';

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `/training/classroom/edit/${sessionId}/details`;
        document.body.appendChild(iframe);

        let attempted = false;

        iframe.onload = () => {
            if (attempted) return;
            attempted = true;

            setTimeout(() => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    const select = doc.querySelector('select[formcontrolname="finalized"]');
                    const saveBtn = doc.querySelector('button[type="submit"].btn-primary');

                    if (select && saveBtn) {
                        select.value = 'true';
                        select.dispatchEvent(new Event('change', { bubbles: true }));

                        try {
                            const ng = iframe.contentWindow.angular;
                            if (ng) {
                                ng.element(select).triggerHandler('change');
                                ng.element(select).scope().$apply();
                            }
                        } catch (e) {}

                        setTimeout(() => {
                            saveBtn.click();
                            setTimeout(() => {
                                document.body.removeChild(iframe);
                                statusText.innerHTML = '<i class="fa fa-check" style="color:#4CAF50"></i> Complete!<br><small>Session finalized</small>';
                                setTimeout(() => { alert('All students processed successfully!'); window.location.reload(); }, 2000);
                            }, 2500);
                        }, 500);
                    } else {
                        throw new Error('Finalize controls not found');
                    }
                } catch (e) {
                    console.error('Finalize error:', e);
                    document.body.removeChild(iframe);
                    statusText.innerHTML = '<i class="fa fa-exclamation-triangle" style="color:#ff9800"></i> Complete!<br><small>Please finalize manually</small>';
                    setTimeout(() => { alert('All students processed!\n\nNote: Please finalize the session manually.'); window.location.reload(); }, 2000);
                }
            }, 3000);
        };

        // Fallback if iframe never loads
        setTimeout(() => {
            if (!attempted) {
                attempted = true;
                if (document.body.contains(iframe)) document.body.removeChild(iframe);
                statusText.innerHTML = '<i class="fa fa-exclamation-triangle" style="color:#ff9800"></i> Complete!<br><small>Please finalize manually</small>';
                setTimeout(() => { alert('All students processed!\n\nNote: Please finalize the session manually.'); window.location.reload(); }, 2000);
            }
        }, 10000);
    }

    // ============================================================
    // COMPLETE COURSE PAGE - Fill date and submit
    // ============================================================
    function initCompleteCoursePage() {
        console.log('🤖 PSFA Complete Course Page');

        const params = new URLSearchParams(window.location.search);
        const completionDate = params.get('completion_date');
        const activityId = params.get('activity_id');
        const classType = params.get('class_type');
        const templateId = params.get('template_id');
        const studentName = params.get('student_name');

        if (!completionDate || !activityId) {
            console.error('Missing parameters on completecourse page');
            return;
        }

        // Save all params to sessionStorage BEFORE submitting — the form posts
        // to CompleteCourse.asp with no query string, so params would be lost otherwise
        sessionStorage.setItem('psfa_pending', JSON.stringify({
            activityId, classType, templateId, studentName, completionDate
        }));

        const run = () => setTimeout(() => fillAndSubmitCourseForm(completionDate), 1000);
        if (document.readyState === 'complete') { run(); }
        else { window.addEventListener('load', run); }
    }

    function fillAndSubmitCourseForm(completionDate) {
        console.log('Filling completion date:', completionDate);

        const dateInput = document.querySelector('input#date_completed, input[name="date_completed"]');
        if (!dateInput) { console.error('Date input not found'); return; }

        dateInput.value = completionDate;
        dateInput.dispatchEvent(new Event('input', { bubbles: true }));
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
        try { jQuery(dateInput).datepicker('setDate', completionDate); } catch (e) {}

        setTimeout(() => {
            const submitBtn = document.querySelector('button[type="submit"].btn-primary');
            if (!submitBtn) { console.error('Submit button not found'); return; }
            console.log('✓ Submitting course completion');
            submitBtn.click();
            // Page will redirect to CompleteCourse.asp — handler below takes over
        }, 500);
    }

    // ============================================================
    // COMPLETION LANDING PAGE - CompleteCourse.asp (no query string)
    // Redirects to dashboard for cert ops using sessionStorage params
    // ============================================================
    const isCompletionLanding = window.location.href.includes('CompleteCourse.asp') &&
        !window.location.search.includes('psfa_auto=1');

    if (isCompletionLanding) {
        const stored = sessionStorage.getItem('psfa_pending');
        if (stored) {
            sessionStorage.removeItem('psfa_pending');
            const { activityId, classType, templateId, studentName, completionDate } = JSON.parse(stored);
            console.log('✓ Course completed, redirecting to dashboard for cert ops');

            let url = `https://otsystems.net/admin/students/dashboard/?activity_id=${activityId}`;
            url += `&psfa_auto=1&psfa_certs=1`;
            url += `&class_type=${classType}`;
            url += `&completion_date=${encodeURIComponent(completionDate)}`;
            url += `&student_name=${encodeURIComponent(studentName || '')}`;
            if (templateId) url += `&template_id=${templateId}`;

            setTimeout(() => { window.location.href = url; }, 500);
        }
    }

    // ============================================================
    // ROUTE: STUDENT DASHBOARD AUTOMATION
    // ============================================================
    function initDashboardWorkflow() {
        console.log('🤖 PSFA Dashboard Automation Active');

        const params = new URLSearchParams(window.location.search);
        const completionDate = params.get('completion_date');
        const classType = params.get('class_type');
        const templateId = params.get('template_id');
        const activityId = params.get('activity_id');
        const studentName = params.get('student_name');

        if (!completionDate || !activityId || !classType) {
            console.error('Missing required URL parameters');
            reportComplete(activityId, false);
            return;
        }

        const run = () => setTimeout(() => startDashboardWorkflow(completionDate, classType, templateId, activityId, studentName), 2000);
        if (document.readyState === 'complete') { run(); }
        else { window.addEventListener('load', run); }
    }

    function startDashboardWorkflow(completionDate, classType, templateId, activityId, studentName) {
        console.log(`=== Dashboard Workflow: ${studentName} | ${classType} ===`);

        const body = new URLSearchParams({
            completionType: '6',
            date_completed: completionDate,
            eval_flag: 'doeval',
            action: 'complete',
            ID: activityId,
            adminId: '39'
        }).toString();

        console.log('POSTing course completion for activityId:', activityId);

        fetch('https://otsystems.net/admin/students/dashboard/classes/CompleteCourse.asp', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        })
        .then(res => {
            console.log('✓ Course completion POST response:', res.status);
            // Give server time to process, then do cert ops
            setTimeout(() => {
                const classesTab = Array.from(document.querySelectorAll('a[uib-tab-heading-transclude]'))
                    .find(tab => tab.textContent.includes('Classes'));
                if (classesTab) classesTab.click();
                setTimeout(() => doCertificateOps(activityId, classType, templateId), 2500);
            }, 2000);
        })
        .catch(err => {
            console.error('Course completion POST failed:', err);
            reportComplete(activityId, false);
        });
    }

    // ============================================================
    // CERTIFICATE OPERATIONS
    // Open Enrollment: email only
    // On-Site:         swap template, then email
    // ============================================================
    function doCertificateOps(activityId, classType, templateId) {
        console.log(`=== Certificate Ops | Type: ${classType} | Template: ${templateId} ===`);

        const targetPanel = findPanelByActivityId(activityId);
        if (!targetPanel) { console.error('Panel not found for cert ops'); reportComplete(activityId, false); return; }

        // Both open-enrollment (337) and on-site (selected template) swap then email
        swapCertificate(targetPanel, templateId, activityId, (swapOk) => {
            console.log(swapOk ? '✓ Swap done' : '⚠ Swap failed, continuing to email');
            emailCertificate(activityId, () => reportComplete(activityId, swapOk));
        });
    }

    function swapCertificate(targetPanel, templateId, activityId, callback) {
        console.log('Swapping certificate template to:', templateId);

        const switchBtn = targetPanel.querySelector('a[ng-click*="CertTemplateChange"][title*="Switch"]');
        if (!switchBtn) { console.error('Switch Template button not found'); callback(false); return; }

        switchBtn.click();

        setTimeout(() => {
            const changeDiv = targetPanel.querySelector('div.alert-warning[ng-if*="Certificate.Changing"]');
            if (!changeDiv) { console.error('Certificate change div not shown'); callback(false); return; }

            const dropdown = changeDiv.querySelector('select[ng-model*="Certificate.EditObj"]');
            if (!dropdown) { console.error('Template dropdown not found'); callback(false); return; }

            let found = false;
            for (let opt of dropdown.querySelectorAll('option')) {
                if (opt.value.includes(`"CertificateTemplate":${templateId}`)) {
                    dropdown.value = opt.value;
                    dropdown.dispatchEvent(new Event('change', { bubbles: true }));
                    dropdown.dispatchEvent(new Event('input', { bubbles: true }));
                    try { angular.element(dropdown).triggerHandler('change'); } catch (e) {}
                    found = true;

                    setTimeout(() => {
                        const saveBtn = changeDiv.querySelector('button[ng-click*="CertTemplateChangeSave"]');
                        if (!saveBtn) { console.error('Save button not found'); callback(false); return; }
                        saveBtn.click();
                        setTimeout(() => { console.log('✓ Certificate swapped'); callback(true); }, 2000);
                    }, 500);
                    break;
                }
            }

            if (!found) { console.error('Template not found in dropdown'); callback(false); }
        }, 1500);
    }

    function emailCertificate(activityId, callback) {
        console.log('Emailing certificate for activityId:', activityId);

        fetch(`https://www.safetyunlimited.com/cdn/projects/certificate/print.asp?id=${activityId}&email=1`, {
            credentials: 'include'
        })
        .then(res => {
            console.log('✓ Certificate email response:', res.status);
            callback();
        })
        .catch(err => {
            console.error('Certificate email failed:', err);
            callback(); // continue anyway
        });
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function findPanelByActivityId(activityId) {
        const panels = document.querySelectorAll('.panel.panel-success[ng-repeat*="enrollments"]');
        for (let panel of panels) {
            if (panel.textContent.includes('Activity ID:') && panel.textContent.includes(activityId)) {
                return panel;
            }
        }
        return null;
    }

    function reportComplete(activityId, success) {
        console.log(`Reporting complete | success: ${success}`);
        if (window.opener) {
            window.opener.postMessage({ type: 'PSFA_STUDENT_COMPLETE', activityId, success }, '*');
        }
        setTimeout(() => window.close(), 1000);
    }

    function createOverlay() {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center';
        return el;
    }

    function createDialog(maxWidth = '600px', maxHeight = null, flex = false) {
        const el = document.createElement('div');
        let css = `background:white;padding:${flex ? '0' : '40px'};border-radius:8px;max-width:${maxWidth};`;
        if (maxHeight) css += `max-height:${maxHeight};overflow:hidden;`;
        if (flex) css += 'display:flex;flex-direction:column;';
        el.style.cssText = css;
        return el;
    }

    function mountDialog(overlay, dialog) {
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    function removeOverlay(overlay) {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

})();