// ==UserScript==
// @name         Bulk Student Upload - Corp Account Admin View
// @namespace    https://www.safetyunlimited.com/
// @version      17.0
// @description  Bulk student loader with minimize toggle, auto-detecting MI, name verification table, and required phone
// @match        https://www.safetyunlimited.com/corporate2/multiple_student_add.asp
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /**********************
     * STYLES
     **********************/
    const style = document.createElement('style');
    style.textContent = `
        .su-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 540px;
            background: #121212;
            color: #eaeaea;
            padding: 0;
            z-index: 99999;
            border-radius: 10px;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
            box-shadow: 0 12px 28px rgba(0,0,0,.6);
            transition: all 0.3s ease;
        }
        .su-panel.minimized {
            width: 280px;
        }
        .su-panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            background: linear-gradient(135deg, #1e1e1e, #252525);
            border-radius: 10px 10px 0 0;
            cursor: pointer;
            user-select: none;
        }
        .su-panel-header:hover {
            background: linear-gradient(135deg, #252525, #2a2a2a);
        }
        .su-panel.minimized .su-panel-header {
            border-radius: 10px;
        }
        .su-panel-header h3 {
            margin: 0;
            font-weight: 600;
            font-size: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .su-toggle-icon {
            font-size: 18px;
            transition: transform 0.3s ease;
        }
        .su-panel.minimized .su-toggle-icon {
            transform: rotate(180deg);
        }
        .su-panel-body {
            padding: 14px;
            max-height: calc(90vh - 48px);
            overflow-y: auto;
            transition: all 0.3s ease;
        }
        .su-panel.minimized .su-panel-body {
            max-height: 0;
            padding: 0 14px;
            overflow: hidden;
        }
        .su-panel label {
            font-size: 13px;
            margin-bottom: 4px;
            display: block;
            opacity: .9;
        }
        .su-panel input,
        .su-panel select,
        .su-panel textarea {
            width: 100%;
            margin-bottom: 10px;
            padding: 8px 10px;
            border-radius: 6px;
            border: 1px solid #333;
            background: #1e1e1e;
            color: #fff;
            font-size: 13px;
            box-sizing: border-box;
        }
        .su-panel input:disabled,
        .su-panel select:disabled,
        .su-panel textarea:disabled {
            opacity: .45;
            cursor: not-allowed;
        }
        .su-row { margin-bottom: 10px; }
        .su-checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0 0 6px 0;
            padding-left: 2px;
            font-size: 13px;
        }
        .su-checkbox input {
            margin: 0;
            width: 16px;
            height: 16px;
            accent-color: #4caf50;
            cursor: pointer;
        }
        .su-button {
            margin-top: 8px;
            padding: 10px;
            background: linear-gradient(135deg, #4caf50, #43a047);
            border: none;
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
        }
        .su-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background: #666;
        }
        .su-help {
            font-size: 11px;
            opacity: 0.7;
            margin-top: -6px;
            margin-bottom: 10px;
            padding-left: 2px;
        }

        /* Input Format Selection */
        .su-format-section {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 12px;
        }
        .su-format-section h4 {
            margin: 0 0 8px;
            font-size: 14px;
            font-weight: 600;
        }
        .su-radio-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .su-radio-option {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px;
            border-radius: 4px;
            cursor: pointer;
        }
        .su-radio-option:hover {
            background: #252525;
        }
        .su-radio-option input[type="radio"] {
            margin: 0;
            width: 16px;
            height: 16px;
            accent-color: #4caf50;
            cursor: pointer;
        }
        .su-radio-option label {
            margin: 0;
            cursor: pointer;
            font-size: 13px;
        }
        .su-radio-example {
            font-size: 11px;
            opacity: 0.6;
            margin-left: 24px;
            margin-top: -4px;
        }
        .su-column-order {
            margin-top: 8px;
            padding: 8px;
            background: #252525;
            border-radius: 4px;
            display: none;
        }
        .su-column-order.active {
            display: block;
        }
        .su-column-order label {
            font-size: 12px;
            margin-bottom: 6px;
        }
        .su-column-order select {
            margin-bottom: 6px;
            font-size: 12px;
        }

        /* Verification Table */
        .su-verify-section {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px solid #333;
        }
        .su-verify-section h4 {
            margin: 0 0 10px;
            font-size: 15px;
            font-weight: 600;
        }
        .su-verify-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            font-size: 12px;
        }
        .su-verify-table th {
            background: #2a2a2a;
            padding: 8px 6px;
            text-align: left;
            font-weight: 600;
            border: 1px solid #333;
            font-size: 11px;
        }
        .su-verify-table td {
            padding: 6px;
            border: 1px solid #333;
            background: #1a1a1a;
        }
        .su-verify-table input {
            width: 100%;
            padding: 4px 6px;
            margin: 0;
            font-size: 12px;
            background: #252525;
            border: 1px solid #444;
        }
        .su-verify-table .su-mi-input {
            width: 30px;
            text-align: center;
            text-transform: uppercase;
        }
        .su-verify-table .su-email-input {
            font-size: 11px;
        }
        .su-verify-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }
        .su-verify-actions button {
            flex: 1;
            padding: 8px;
            border: none;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
        }
        .su-btn-edit {
            background: #ff9800;
            color: #fff;
        }
        .su-btn-confirm {
            background: #4caf50;
            color: #fff;
        }
        .su-error-msg {
            background: #d32f2f;
            color: #fff;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            font-size: 13px;
        }
        .su-info-box {
            background: #1565c0;
            color: #fff;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 10px;
            font-size: 12px;
            line-height: 1.5;
        }
        .su-info-box strong {
            display: block;
            margin-bottom: 4px;
        }
    `;
    document.head.appendChild(style);

    /**********************
     * UI
     **********************/
    const panel = document.createElement('div');
    panel.className = 'su-panel';
    panel.innerHTML = `
        <div class="su-panel-header" id="panelHeader">
            <h3>
                <span>📋</span>
                <span>Bulk Student Loader</span>
            </h3>
            <span class="su-toggle-icon">▼</span>
        </div>
        <div class="su-panel-body">
            <label>Additional empty rows</label>
            <input id="additionalRows" type="number" min="0" value="0">

            <label>Password (all students)</label>
            <input id="stuPassword" type="text" value="safe1234">

            <label>Phone Number <span style="color: #f44336;"></span></label>
            <input id="stuPhone" type="text" placeholder="800 680 3789" required>
            <div class="su-help">Format: 10 digits (area code + number)</div>

            <label>Username format</label>
            <select id="usernameOption">
                <option value="email">Use Email as Username</option>
                <option value="fname_lname_random">First + Last + 4 Random Numbers</option>
            </select>

            <div class="su-row">
                <div class="su-checkbox">
                    <input type="checkbox" id="sameEmail">
                    <label for="sameEmail">Use same email for all students</label>
                </div>
                <input id="sameEmailInput" type="text" placeholder="shared@email.com">
            </div>

            <div class="su-format-section">
                <h4>Input Format</h4>
                <div class="su-radio-group">
                    <div class="su-radio-option">
                        <input type="radio" name="inputFormat" id="formatColumns" value="columns" checked>
                        <label for="formatColumns">Excel Columns (Tab-Separated)</label>
                    </div>
                    <div class="su-radio-example">📋 Paste from Excel with columns</div>

                    <div class="su-column-order active" id="columnOrderSection">
                        <label>Column Order:</label>
                        <select id="columnOrder">
                            <option value="first_last_email">First | (MI) | Last | Email</option>
                            <option value="last_first_email">Last | First | (MI) | Email</option>
                        </select>
                        <div class="su-help" style="margin-top: 6px; opacity: 0.8;">
                            ℹ️ Auto-detects 3 or 4 columns. MI column optional - leave cells blank if no middle initial.
                        </div>
                    </div>

                    <div class="su-radio-option">
                        <input type="radio" name="inputFormat" id="formatSingleLine" value="singleline">
                        <label for="formatSingleLine">Single Line (Full Name + Email)</label>
                    </div>
                    <div class="su-radio-example">✏️ Type manually: Sarah Ann Budro sbudro@email.com</div>
                </div>
            </div>

            <label id="stuLabel"></label>
            <div class="su-help" id="stuHelp"></div>
            <textarea id="stuData" rows="8" placeholder="Paste student data here..."></textarea>

            <button id="parseStudents" class="su-button">
                Parse & Verify Names
            </button>

            <div id="verifySection" class="su-verify-section" style="display: none;">
                <h4>Verify Student Names</h4>
                <div class="su-info-box">
                    <strong>📋 Review & Edit:</strong>
                    Click any cell to modify. Middle Initial (MI) is optional - leave blank if none.
                </div>
                <div id="verifyTableContainer"></div>
                <div class="su-verify-actions">
                    <button id="editData" class="su-btn-edit">← Edit Input Data</button>
                    <button id="confirmAndAdd" class="su-btn-confirm">Confirm & Add to Form →</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    /**********************
     * MINIMIZE/MAXIMIZE TOGGLE
     **********************/
    const panelHeader = document.getElementById('panelHeader');
    panelHeader.addEventListener('click', () => {
        panel.classList.toggle('minimized');
    });

    /**********************
     * STATE
     **********************/
    let parsedStudents = [];

    /**********************
     * UI ELEMENTS
     **********************/
    const usernameDropdown = document.getElementById('usernameOption');
    const sameEmailCheckbox = document.getElementById('sameEmail');
    const sameEmailInput = document.getElementById('sameEmailInput');
    const stuLabel = document.getElementById('stuLabel');
    const stuHelp = document.getElementById('stuHelp');
    const stuData = document.getElementById('stuData');
    const stuPhone = document.getElementById('stuPhone');
    const parseBtn = document.getElementById('parseStudents');
    const verifySection = document.getElementById('verifySection');
    const verifyTableContainer = document.getElementById('verifyTableContainer');
    const editBtn = document.getElementById('editData');
    const confirmBtn = document.getElementById('confirmAndAdd');
    const formatColumns = document.getElementById('formatColumns');
    const formatSingleLine = document.getElementById('formatSingleLine');
    const columnOrder = document.getElementById('columnOrder');
    const columnOrderSection = document.getElementById('columnOrderSection');

    /**********************
     * UI STATE LOGIC
     **********************/
    function updateUI(trigger = 'init') {
        const mode = usernameDropdown.value;

        if (mode === 'email') {
            sameEmailCheckbox.checked = false;
            sameEmailCheckbox.disabled = true;
            sameEmailInput.disabled = true;
            stuLabel.textContent = 'Student Data';
            updateHelpText();
        } else {
            if (trigger === 'usernameChange') {
                sameEmailCheckbox.checked = true;
            }
            sameEmailCheckbox.disabled = false;
            sameEmailInput.disabled = !sameEmailCheckbox.checked;
            stuLabel.textContent = 'Student Data';
            updateHelpText();
        }
    }

    function updateHelpText() {
        const isColumns = formatColumns.checked;
        const order = columnOrder.value;

        if (isColumns) {
            const orderMap = {
                'first_last_email': 'First | (MI) | Last | Email — auto-detects 3 or 4 columns',
                'last_first_email': 'Last | First | (MI) | Email — auto-detects 3 or 4 columns'
            };
            stuHelp.textContent = `Paste from Excel: ${orderMap[order]}`;
        } else {
            const needsEmail = usernameDropdown.value === 'email';
            if (needsEmail) {
                stuHelp.textContent = 'One per line. Format: John A. Doe john@email.com (middle initial optional)';
            } else {
                stuHelp.textContent = 'One per line. Format: John A. Doe (middle initial optional)';
            }
        }
    }

    function toggleColumnOrderSection() {
        if (formatColumns.checked) {
            columnOrderSection.classList.add('active');
        } else {
            columnOrderSection.classList.remove('active');
        }
    }

    usernameDropdown.addEventListener('change', () => updateUI('usernameChange'));
    sameEmailCheckbox.addEventListener('change', () => updateUI('checkboxChange'));
    formatColumns.addEventListener('change', () => {
        toggleColumnOrderSection();
        updateHelpText();
    });
    formatSingleLine.addEventListener('change', () => {
        toggleColumnOrderSection();
        updateHelpText();
    });
    columnOrder.addEventListener('change', updateHelpText);
    updateUI();

    /**********************
     * EXCEL COLUMN PARSER (AUTO-DETECTS MI)
     **********************/
    function parseExcelColumns(parts, order) {
        const cleaned = parts.map(p => p.trim());
        let result = { first: '', middle: '', last: '', email: '' };

        if (order === 'first_last_email') {
            // First-name-first format
            if (cleaned.length === 4) {
                // 4 columns: First | MI | Last | Email
                result.first = cleaned[0];
                result.middle = cleaned[1].replace('.', '').toUpperCase();
                result.last = cleaned[2];
                result.email = cleaned[3];
            } else if (cleaned.length === 3) {
                // 3 columns: First | Last | Email
                result.first = cleaned[0];
                result.middle = '';
                result.last = cleaned[1];
                result.email = cleaned[2];
            } else {
                return null;
            }
        } else if (order === 'last_first_email') {
            // Last-name-first format
            if (cleaned.length === 4) {
                // 4 columns: Last | First | MI | Email
                result.last = cleaned[0];
                result.first = cleaned[1];
                result.middle = cleaned[2].replace('.', '').toUpperCase();
                result.email = cleaned[3];
            } else if (cleaned.length === 3) {
                // 3 columns: Last | First | Email
                result.last = cleaned[0];
                result.first = cleaned[1];
                result.middle = '';
                result.email = cleaned[2];
            } else {
                return null;
            }
        }

        return result;
    }

    /**********************
     * SINGLE LINE NAME PARSER
     **********************/
    function parseSingleLineName(nameParts) {
        if (nameParts.length === 0) return null;

        let first = '';
        let middle = '';
        let last = '';

        if (nameParts.length === 1) {
            first = nameParts[0];
        } else if (nameParts.length === 2) {
            first = nameParts[0];
            last = nameParts[1];
        } else {
            const secondToLast = nameParts[nameParts.length - 2];
            const isSingleLetter = secondToLast.replace('.', '').length === 1;

            if (isSingleLetter) {
                middle = secondToLast.replace('.', '').toUpperCase();
                first = nameParts.slice(0, -2).join(' ');
                last = nameParts[nameParts.length - 1];
            } else {
                first = nameParts.slice(0, -1).join(' ');
                last = nameParts[nameParts.length - 1];
            }
        }

        return { first, middle, last };
    }

    /**********************
     * VALIDATION
     **********************/
    function validatePhone(phone) {
        const digits = phone.replace(/\D/g, '');
        return digits.length === 10;
    }

    /**********************
     * VERIFICATION TABLE
     **********************/
    function renderVerificationTable(students) {
        const needsEmail = usernameDropdown.value === 'email';

        let html = '<table class="su-verify-table"><thead><tr>';
        html += '<th style="width: 30px;">#</th>';
        html += '<th style="width: 30%;">First Name</th>';
        html += '<th style="width: 50px;">MI</th>';
        html += '<th style="width: 30%;">Last Name</th>';
        if (needsEmail && !sameEmailCheckbox.checked) {
            html += '<th style="width: 35%;">Email</th>';
        }
        html += '</tr></thead><tbody>';

        students.forEach((student, idx) => {
            html += `<tr>`;
            html += `<td style="text-align: center; color: #888;">${idx + 1}</td>`;
            html += `<td><input type="text" class="su-verify-first" data-idx="${idx}" value="${student.first}" /></td>`;
            html += `<td><input type="text" class="su-verify-middle su-mi-input" data-idx="${idx}" value="${student.middle}" maxlength="1" placeholder="-" /></td>`;
            html += `<td><input type="text" class="su-verify-last" data-idx="${idx}" value="${student.last}" /></td>`;
            if (needsEmail && !sameEmailCheckbox.checked) {
                html += `<td><input type="text" class="su-verify-email su-email-input" data-idx="${idx}" value="${student.email || ''}" /></td>`;
            }
            html += `</tr>`;
        });

        html += '</tbody></table>';
        verifyTableContainer.innerHTML = html;

        // Add event listeners
        document.querySelectorAll('.su-verify-first').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                parsedStudents[idx].first = e.target.value;
            });
        });
        document.querySelectorAll('.su-verify-middle').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const value = e.target.value.toUpperCase();
                parsedStudents[idx].middle = value;
                e.target.value = value;
            });
        });
        document.querySelectorAll('.su-verify-last').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                parsedStudents[idx].last = e.target.value;
            });
        });
        document.querySelectorAll('.su-verify-email').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                parsedStudents[idx].email = e.target.value;
            });
        });
    }

    /**********************
     * PARSE BUTTON
     **********************/
    parseBtn.onclick = () => {
        // Clear any previous errors
        const existingError = document.querySelector('.su-error-msg');
        if (existingError) existingError.remove();

        // Validate phone number
        if (!validatePhone(stuPhone.value)) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'su-error-msg';
            errorDiv.textContent = '⚠️ Please enter a valid 10-digit phone number before proceeding.';
            stuPhone.parentElement.insertBefore(errorDiv, stuPhone.nextSibling);
            stuPhone.focus();
            return;
        }

        // Validate shared email if required
        if (
            usernameDropdown.value === 'fname_lname_random' &&
            sameEmailCheckbox.checked &&
            !sameEmailInput.value.trim()
        ) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'su-error-msg';
            errorDiv.textContent = '⚠️ Please enter a shared email address.';
            sameEmailInput.parentElement.insertBefore(errorDiv, sameEmailInput.nextSibling);
            sameEmailInput.focus();
            return;
        }

        const lines = stuData.value.trim().split('\n');
        const students = [];
        const isColumnFormat = formatColumns.checked;
        const needsEmail = usernameDropdown.value === 'email';
        const order = columnOrder.value;

        lines.forEach((line, lineNum) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            if (isColumnFormat) {
                // EXCEL COLUMN FORMAT - split by tabs
                const parts = trimmed.split('\t');
                const parsed = parseExcelColumns(parts, order);

                if (parsed) {
                    // Validate email if needed
                    if (parsed.email && !parsed.email.includes('@')) {
                        console.warn(`Line ${lineNum + 1}: Invalid email - ${parsed.email}`);
                        return;
                    }
                    students.push(parsed);
                } else {
                    console.warn(`Line ${lineNum + 1}: Invalid column format - expected 3 or 4 columns, got ${parts.length}`);
                }
            } else {
                // SINGLE LINE FORMAT - split by whitespace
                const parts = trimmed.split(/\s+/);

                if (needsEmail) {
                    if (parts.length < 2) return;

                    const email = parts[parts.length - 1];
                    if (!email.includes('@')) {
                        console.warn(`Line ${lineNum + 1}: Invalid email - ${email}`);
                        return;
                    }

                    const nameParts = parts.slice(0, -1);
                    const nameData = parseSingleLineName(nameParts);

                    if (nameData) {
                        students.push({
                            first: nameData.first,
                            middle: nameData.middle,
                            last: nameData.last,
                            email: email
                        });
                    }
                } else {
                    if (parts.length < 1) return;

                    const nameData = parseSingleLineName(parts);

                    if (nameData) {
                        students.push({
                            first: nameData.first,
                            middle: nameData.middle,
                            last: nameData.last
                        });
                    }
                }
            }
        });

        if (!students.length) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'su-error-msg';
            errorDiv.textContent = '⚠️ No valid student data found. Please check the format and try again.';
            stuData.parentElement.insertBefore(errorDiv, stuData.nextSibling);
            return;
        }

        parsedStudents = students;
        renderVerificationTable(students);
        verifySection.style.display = 'block';
        verifySection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    /**********************
     * EDIT BUTTON
     **********************/
    editBtn.onclick = () => {
        verifySection.style.display = 'none';
        stuData.focus();
    };

    /**********************
     * HELPERS
     **********************/
    function waitForElement(id, timeout = 3000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.getElementById(id);
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                }
                if (Date.now() - start > timeout) {
                    clearInterval(timer);
                    reject();
                }
            }, 50);
        });
    }

    async function ensureRows(count) {
        const btn = document.getElementById('Add_Another');
        let current = document.querySelectorAll('[id^="stud_fn"]').length;
        while (current < count) {
            btn.click();
            await waitForElement(`stud_fn${current + 1}`);
            current++;
        }
    }

    /**********************
     * POPULATE
     **********************/
    function populate(students, password, phone) {
        const digits = phone.replace(/\D/g, '');
        const ac = digits.slice(0,3);
        const p1 = digits.slice(3,6);
        const p2 = digits.slice(6,10);

        students.forEach((s, idx) => {
            const i = idx + 1;
            const rand = Math.floor(1000 + Math.random() * 9000);
            const username =
                usernameDropdown.value === 'email'
                    ? s.email
                    : `${s.first}${s.last}${rand}`;

            const email = sameEmailCheckbox.checked
                ? sameEmailInput.value.trim()
                : s.email || '';

            const fields = [
                [`stud_fn${i}`, s.first],
                [`stud_mi${i}`, s.middle],
                [`stud_ln${i}`, s.last],
                [`stud_email${i}`, email],
                [`phone_areacode${i}`, ac],
                [`phone_first3${i}`, p1],
                [`phone_last4${i}`, p2],
                [`stud_username${i}`, username],
                [`stud_password${i}`, password],
                [`stud_verify${i}`, password]
            ];

            fields.forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el) el.value = val || '';
            });
        });
    }

    /**********************
     * CONFIRM BUTTON
     **********************/
    confirmBtn.onclick = async () => {
        if (!parsedStudents.length) {
            alert('No students to add.');
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Adding students...';

        try {
            await ensureRows(parsedStudents.length + (+additionalRows.value || 0));
            populate(parsedStudents, stuPassword.value, stuPhone.value);

            alert(`✅ Successfully populated ${parsedStudents.length} student(s) into the form!`);

            // Reset
            verifySection.style.display = 'none';
            stuData.value = '';
            parsedStudents = [];
        } catch (error) {
            alert('Error adding students. Please try again.');
            console.error(error);
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Add to Form →';
        }
    };

})();