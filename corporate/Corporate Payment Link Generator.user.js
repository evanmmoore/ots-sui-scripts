// ==UserScript==
// @name         Corporate Payment Link Generator
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Generate payment link line items with student/class/admin selection popup
// @match        https://otsystems.net/admin/corporate/*
// @match        https://otsystems.net/admin/Utilities/CustomPayment/manage.asp*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      otsystems.net
// ==/UserScript==

(function () {
    'use strict';

    const url = location.href;

    // ---------------------------------------
    // --- CORPORATE PAGE: STUDENTS/CLASSES ---
    // ---------------------------------------
    if (url.includes('/admin/corporate/org_master_edit.asp') || url.includes('/admin/corporate/manage_catalog.asp')) {
        const header = document.querySelector('.col-sm-7');
        if (!header) return;

        const btn = document.createElement('button');
        btn.textContent = 'Create Payment Link';
        btn.style.marginLeft = '20px';
        btn.className = 'btn btn-primary';
        header.appendChild(btn);

        btn.addEventListener('click', showStudentClassAdminPopup);
    }

    async function showStudentClassAdminPopup() {
        const corpId = new URL(location.href).searchParams.get('id');
        if (!corpId) return alert('Corporate ID not found');

        const students = await fetchStudents(corpId);
        if (!students.length) return alert('No students found!');

        const classes = await fetchClassesViaIframe(corpId);
        if (!classes.length) return alert('No classes found!');

        const admins = await fetchAdmins(corpId);

        // --- Overlay ---
        const overlay = document.createElement('div');
        overlay.style = `
            position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,.5);z-index:9999;
        `;

        const popup = document.createElement('div');
        popup.style = `
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            background:#fff;padding:20px;
            width:700px;max-height:80%;
            overflow:auto;border-radius:5px;
        `;
        popup.innerHTML = `<h3>Assign Classes to Students & Admin</h3>`;

        // --- Students ---
        const studentContainer = document.createElement('div');
        studentContainer.innerHTML = '<h4>Students</h4>';
        students.forEach(s => {
            studentContainer.insertAdjacentHTML(
                'beforeend',
                `<label style="display:block">
                    <input type="checkbox" data-number="${s.number}" data-name="${s.name}">
                    ${s.name} (${s.number})
                </label>`
            );
        });

        // --- Classes ---
        const classContainer = document.createElement('div');
        classContainer.innerHTML = '<h4>Classes</h4>';
        classes.forEach((c, i) => {
            classContainer.insertAdjacentHTML(
                'beforeend',
                `<label style="display:block">
                    <input type="checkbox" data-index="${i}">
                    ${c.name} (${c.price})
                </label>`
            );
        });

        // --- Admin selection ---
        const adminContainer = document.createElement('div');
        adminContainer.innerHTML = '<h4>Select Admin (or override)</h4>';

        admins.forEach((a, i) => {
            adminContainer.insertAdjacentHTML(
                'beforeend',
                `<label style="display:block">
                    <input type="radio" name="adminRadio" data-name="${a.name}" data-email="${a.email}" ${i===0?'checked':''}>
                    ${a.name} (${a.email})
                </label>`
            );
        });

        // Override fields
        adminContainer.insertAdjacentHTML('beforeend', `
            <div style="margin-top:5px;">
                <strong>Override Name:</strong> <input type="text" id="overrideAdminName" placeholder="Name">
                <strong>Email:</strong> <input type="text" id="overrideAdminEmail" placeholder="Email">
            </div>
        `);

        // --- Buttons ---
        const controls = document.createElement('div');
        controls.style.marginTop = '10px';

        const okBtn = document.createElement('button');
        okBtn.textContent = 'Generate Payment Link';
        okBtn.className = 'btn btn-success';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.marginLeft = '10px';

        controls.append(okBtn, cancelBtn);
        popup.append(studentContainer, classContainer, adminContainer, controls);
        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        cancelBtn.onclick = () => overlay.remove();

        okBtn.onclick = async () => {
            const selectedStudents = [...studentContainer.querySelectorAll('input:checked')]
                .map(cb => ({ number: cb.dataset.number, name: cb.dataset.name }));
            if (!selectedStudents.length) return alert('Select at least one student!');

            const selectedClasses = [...classContainer.querySelectorAll('input:checked')]
                .map(cb => classes[cb.dataset.index]);
            if (!selectedClasses.length) return alert('Select at least one class!');

            let adminName = document.getElementById('overrideAdminName').value.trim();
            let adminEmail = document.getElementById('overrideAdminEmail').value.trim();

            if (!adminName || !adminEmail) {
                const radio = adminContainer.querySelector('input[name="adminRadio"]:checked');
                adminName = radio?.dataset.name;
                adminEmail = radio?.dataset.email;
            }

            let lineItems = [];
            for (const student of selectedStudents) {
                const data = await fetchStudentData(student.number);
                if (!data) continue;
                for (const cls of selectedClasses) {
                    lineItems.push({
                        studentName: data.name,
                        accountNumber: data.accountNumber,
                        className: cls.name,
                        price: cls.price
                    });
                }
            }

            // Store data for Custom Payment page
            GM_setValue('OTS_PAYMENT_DATA', {
                adminName,
                adminEmail,
                corpId,
                lineItems
            });

            overlay.remove();
            window.location.href = 'https://otsystems.net/admin/Utilities/CustomPayment/manage.asp';
        };
    }

    // ---------- STUDENTS ----------
    function fetchStudents(corpId) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://otsystems.net/admin/corporate/manage_students.asp?id=${corpId}`,
                onload: r => {
                    const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
                    const students = [...doc.querySelectorAll('#studentsTable tbody tr')]
                        .map(row => ({
                            number: row.querySelector('td:nth-child(1) a')?.textContent?.trim(),
                            name: row.querySelector('td:nth-child(3)')?.textContent?.trim()
                        }))
                        .filter(s => s.number && s.name);
                    resolve(students);
                },
                onerror: () => resolve([])
            });
        });
    }

    // ---------- ADMINS ----------
    function fetchAdmins(corpId) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://otsystems.net/admin/corporate/manage_administrators.asp?id=${corpId}`,
                onload: r => {
                    const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
                    const admins = [...doc.querySelectorAll('table#adminsTable tbody tr')]
                        .map(row => ({
                            name: row.querySelector('td:nth-child(1)')?.textContent?.trim(),
                            email: row.querySelector('td:nth-child(2)')?.textContent?.trim()
                        }))
                        .filter(a => a.name && a.email);
                    resolve(admins);
                },
                onerror: () => resolve([])
            });
        });
    }

    // ---------- CLASSES ----------
    function fetchClassesViaIframe(corpId) {
        return new Promise(resolve => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = `https://otsystems.net/admin/corporate/manage_catalog.asp?id=${corpId}`;
            document.body.appendChild(iframe);

            iframe.onload = () => {
                const doc = iframe.contentDocument;

                const poll = setInterval(() => {
                    const rows = doc.querySelectorAll('span[ng-bind-html="ent.display_Name"]');
                    if (rows.length) {
                        clearInterval(poll);
                        const classes = [];
                        rows.forEach(span => {
                            const row = span.closest('.row');
                            const name = span.textContent.trim();
                            const price = row.querySelector('strong.ng-binding')?.textContent?.trim();
                            if (name && price) classes.push({ name, price });
                        });
                        iframe.remove();
                        resolve(classes);
                    }
                }, 500);

                setTimeout(() => {
                    clearInterval(poll);
                    iframe.remove();
                    resolve([]);
                }, 10000);
            };
        });
    }

    // ---------- STUDENT DATA ----------
    function fetchStudentData(studentNumber) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://otsystems.net/admin/students/dashboard.asp?student_number=${studentNumber}`,
                onload: r => {
                    const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
                    resolve({
                        name: doc.querySelector('#studentName')?.textContent?.trim() || studentNumber,
                        accountNumber: doc.querySelector('#accountNumber')?.textContent?.trim() || studentNumber
                    });
                },
                onerror: () => resolve(null)
            });
        });
    }

    // ---------------------------------------
    // --- CUSTOM PAYMENT PAGE INJECTION ---
    // ---------------------------------------
    if (url.includes('/admin/Utilities/CustomPayment/manage.asp')) {
        (async () => {
            const data = GM_getValue('OTS_PAYMENT_DATA');
            if (!data) return;

            const waitFor = selector => new Promise(res => {
                const t = setInterval(() => {
                    const el = document.querySelector(selector);
                    if (el) {
                        clearInterval(t);
                        res(el);
                    }
                }, 200);
            });

            // Fill admin
            await waitFor('input[ng-model="mc.PaymentObj.Request_To"]');
            document.querySelector('input[ng-model="mc.PaymentObj.Request_To"]').value = data.adminName;
            document.querySelector('input[ng-model="mc.PaymentObj.Request_Email_To"]').value = data.adminEmail;

            // Notes
            const noteField = document.querySelector('textarea[ng-model="mc.PaymentObj.Request_Notes"]');
            if (noteField) noteField.value = `Corporate Account ID: ${data.corpId}`;

            // Add line items
            for (const item of data.lineItems) {
                const addBtn = document.querySelector('button[ng-click="mc.AddLineItem()"]');
                if (!addBtn) continue;
                addBtn.click();
                await new Promise(r => setTimeout(r, 300));

                const desc = document.querySelector('textarea[ng-model="mc.AddLineItemObj.Description"]');
                if (desc) desc.value = `${item.studentName} | ${item.className} | A# ${item.accountNumber}`;

                const amountInput = document.querySelector('input[ng-model="initialAmount"]');
                if (amountInput) amountInput.value = item.price.replace('$','');

                const saveBtn = document.querySelector('button[ng-click="mc.LineItemSave(mc.AddLineItemObj)"]');
                if (saveBtn) saveBtn.click();
                await new Promise(r => setTimeout(r, 300));
            }

            alert(`Injected ${data.lineItems.length} line items for admin ${data.adminName}`);
        })();
    }

})();
