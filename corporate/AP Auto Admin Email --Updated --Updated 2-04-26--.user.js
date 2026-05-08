// ==UserScript==
// @name         AP Auto Admin Email **Updated **Updated 2/04/26**
// @namespace    http://tampermonkey.net/
// @version      3.4
// @description  Fetch admin emails, submit Add Prepaid Record, and open Outlook with selected classes (including Mix and Match) in one click with editable email, plus a direct Send AP Email button.
// @match        https://otsystems.net/admin/reports/adv_purch/AP_Add.asp*
// @match        https://www.otsystems.net/admin/reports/adv_purch/AP_Add.asp*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ---------- 0. Styled Yes/No prompt ----------
    function showYesNoPromptStyled(message, callback) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = 9999;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.opacity = 0;
        overlay.style.transition = 'opacity 0.2s ease';

        const popup = document.createElement('div');
        popup.style.width = '400px';
        popup.style.borderRadius = '6px';
        popup.style.overflow = 'hidden';
        popup.style.background = '#fff';
        popup.style.padding = '20px';
        popup.style.textAlign = 'center';
        popup.style.fontSize = '16px';
        popup.style.color = 'black';
        popup.style.transform = 'scale(0.9)';
        popup.style.transition = 'transform 0.2s ease';

        popup.innerHTML = `
        <div style="margin-bottom: 20px;">${message}</div>
        <button id="yesBtn" class="btn btn-success" style="padding:6px 12px; border-radius:4px; margin-right:10px;">Yes</button>
        <button id="noBtn" class="btn btn-danger" style="padding:6px 12px; border-radius:4px;">No</button>
    `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        setTimeout(() => { overlay.style.opacity = 1; popup.style.transform = 'scale(1)'; }, 10);

        popup.querySelector('#yesBtn').addEventListener('click', () => {
            overlay.style.opacity = 0;
            popup.style.transform = 'scale(0.9)';
            setTimeout(() => {
                document.body.removeChild(overlay);
                callback(true);
            }, 200);
        });

        popup.querySelector('#noBtn').addEventListener('click', () => {
            overlay.style.opacity = 0;
            popup.style.transform = 'scale(0.9)';
            setTimeout(() => {
                document.body.removeChild(overlay);
                callback(false);
            }, 200);
        });
    }

    // ---------- 1. Get selected corporate account ID ----------
    function getSelectedOrgId() {
        const chosenSpan = document.querySelector('a.chosen-single > span');
        if (!chosenSpan) return null;
        const accountName = chosenSpan.textContent.trim();
        const orgSelect = document.getElementById('org');
        if (!orgSelect) return null;

        for (const option of orgSelect.options) {
            if (option.text.trim() === accountName) {
                return option.value;
            }
        }
        return null;
    }

    // ---------- 2. Fetch admin emails via hidden iframe ----------
    function fetchAdminEmailsViaIframe(orgId, callback) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `/admin/corporate/manage_administrators.asp?id=${orgId}`;
        document.body.appendChild(iframe);

        iframe.onload = () => {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                const emails = [];

                setTimeout(() => {
                    const rows = doc.querySelectorAll('tr[ng-repeat^="admin"] td');
                    rows.forEach(td => {
                        const text = td.textContent.trim();
                        if (text.includes('@')) emails.push(text);
                    });

                    document.body.removeChild(iframe);
                    callback(emails);
                }, 500);
            } catch (err) {
                console.error("Error fetching emails from iframe:", err);
                document.body.removeChild(iframe);
                callback([]);
            }
        };
    }

    // ---------- 3. Show class selection popup with Mix and Match ----------
    function showClassSelector(classes, callback) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = 9999;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const popup = document.createElement('div');
        popup.className = 'panel panel-primary';
        popup.style.width = '52%';
        popup.style.maxHeight = '80%';
        popup.style.overflowY = 'auto';
        popup.style.borderRadius = '6px';
        popup.style.background = '#fff';

        popup.innerHTML = `
            <div class="panel-heading" style="padding: 15px; font-size: 18px; background-color: white; color: black;">
                Select Classes and Quantities
            </div>
            <div style="padding:15px; background-color: white; color: black;">
                <input type="text" id="classSearch" placeholder="Search classes..."
                    style="width:100%; padding:8px; margin-bottom:15px; border-radius:4px; border:1px solid #ccc; color: black; background: white;">
                <div style="margin-bottom:15px; padding:10px; background-color:#f0f8ff; border:1px solid #5bc0de; border-radius:4px;">
                    <strong>Mix and Match:</strong> Check multiple classes, then click "Create Mix and Match" to combine them.
                    <button id="createMixMatchBtn" class="btn btn-info btn-sm" style="margin-left:10px; padding:4px 8px;">Create Mix and Match</button>
                </div>
                <div id="mixMatchContainer" style="margin-bottom:15px;"></div>
                <table class="table table-bordered table-hover table-condensed table-striped">
                    <thead style="background-color: rgb(32, 77, 116); color: white;">
                        <tr>
                            <th style="width:50px;">Include</th>
                            <th>Class Name</th>
                            <th style="width:100px;">Quantity</th>
                        </tr>
                    </thead>
                    <tbody style="color: black; background-color: white;"></tbody>
                </table>
                <div class="text-right" style="margin-top:10px;">
                    <button id="nextEmailBtn" class="btn btn-success" style="padding:6px 12px; border-radius:4px;">Next</button>
                    <button id="noEmailBtn" class="btn btn-danger" style="padding:6px 12px; border-radius:4px; margin-left:5px;">No</button>
                </div>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const tbody = popup.querySelector('tbody');
        const mixMatchContainer = popup.querySelector('#mixMatchContainer');
        const mixMatchGroups = [];

        classes.forEach(c => {
            const cleanName = c.replace(/\(\d+\)$/, '').replace(/\s*-\s*$/, '').trim();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center"><input type="checkbox" class="class-checkbox"></td>
                <td>${cleanName}</td>
                <td><input type="number" style="width:60px; padding:3px;" class="qty-input"></td>
            `;
            tbody.appendChild(tr);
        });

        // Filter search
        const searchInput = popup.querySelector('#classSearch');
        searchInput.addEventListener('input', () => {
            const filter = searchInput.value.toLowerCase();
            tbody.querySelectorAll('tr').forEach(row => {
                const text = row.cells[1].textContent.toLowerCase();
                row.style.display = text.includes(filter) ? '' : 'none';
            });
        });

        // Create Mix and Match button
        popup.querySelector('#createMixMatchBtn').addEventListener('click', () => {
            const selectedForMixMatch = [];
            tbody.querySelectorAll('tr').forEach(row => {
                const checkbox = row.cells[0].querySelector('input');
                if (checkbox.checked) {
                    selectedForMixMatch.push(row.cells[1].textContent.trim());
                    // Uncheck and clear quantity
                    checkbox.checked = false;
                    row.cells[2].querySelector('input').value = '';
                }
            });

            if (selectedForMixMatch.length < 2) {
                alert("Please select at least 2 classes to create a Mix and Match.");
                return;
            }

            // Create mix and match group
            const mixMatchGroup = {
                classes: selectedForMixMatch,
                quantity: 0
            };
            mixMatchGroups.push(mixMatchGroup);

            // Display the mix and match group
            const groupDiv = document.createElement('div');
            groupDiv.style.padding = '10px';
            groupDiv.style.marginBottom = '10px';
            groupDiv.style.backgroundColor = '#e7f3ff';
            groupDiv.style.border = '1px solid #2196F3';
            groupDiv.style.borderRadius = '4px';

            groupDiv.innerHTML = `
                <div style="margin-bottom:5px;">
                    <strong>Mix and Match Group:</strong>
                    <button class="btn btn-danger btn-xs" style="float:right; padding:2px 6px;">Remove</button>
                </div>
                <div style="margin-bottom:5px; font-size:13px;">
                    ${selectedForMixMatch.join(' + ')}
                </div>
                <div>
                    <label style="display:inline-block; margin-right:5px;">Total Quantity:</label>
                    <input type="number" class="mixmatch-qty" style="width:80px; padding:3px;" value="0">
                </div>
            `;

            mixMatchContainer.appendChild(groupDiv);

            // Remove button
            groupDiv.querySelector('.btn-danger').addEventListener('click', () => {
                const index = mixMatchGroups.indexOf(mixMatchGroup);
                if (index > -1) mixMatchGroups.splice(index, 1);
                mixMatchContainer.removeChild(groupDiv);
            });

            // Quantity input
            const qtyInput = groupDiv.querySelector('.mixmatch-qty');
            qtyInput.addEventListener('input', () => {
                mixMatchGroup.quantity = qtyInput.value;
            });
        });

        popup.querySelector('#noEmailBtn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback(null);
        });

        popup.querySelector('#nextEmailBtn').addEventListener('click', () => {
            const selected = [];

            // Add individual classes
            tbody.querySelectorAll('tr').forEach(row => {
                const checkbox = row.cells[0].querySelector('input');
                const qtyInput = row.cells[2].querySelector('input');
                if (checkbox.checked && qtyInput.value && Number(qtyInput.value) > 0) {
                    selected.push({
                        name: row.cells[1].textContent.trim(),
                        quantity: qtyInput.value,
                        isMixMatch: false
                    });
                }
            });

            // Add mix and match groups
            mixMatchGroups.forEach(group => {
                if (group.quantity && Number(group.quantity) > 0) {
                    selected.push({
                        name: group.classes.join(' + '),
                        quantity: group.quantity,
                        isMixMatch: true
                    });
                }
            });

            if (selected.length === 0) {
                alert("Please select at least one class/Mix and Match and enter a quantity.");
                return;
            }

            document.body.removeChild(overlay);
            callback(selected);
        });
    }

    // ---------- 4. Show editable email popup ----------
    function showEmailEditor(selectedClasses, emails, callback) {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = 9999;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        const popup = document.createElement('div');
        popup.style.width = '60%';
        popup.style.maxHeight = '80%';
        popup.style.background = '#fff';
        popup.style.padding = '20px';
        popup.style.borderRadius = '6px';
        popup.style.overflowY = 'auto';
        popup.style.display = 'flex';
        popup.style.flexDirection = 'column';

        // Build email text
        const emailText =
              "Hello Corporate Admin,\n\n" +
              "This is an auto-generated email letting you know that your advance purchases for the following classes have been added to your corporate account, and you may begin enrolling students immediately.\n\n" +
              selectedClasses.map(c => `(${c.quantity}) ${c.name}`).join("\n") +
              "\n\nTo review your Advance Purchases, please log into your admin dashboard and go to Reporting – Advance Purchases.\n\n" +
              "Here, you can view your Advance Purchases by course.\n\n" +
              "At a glance, you will see the original number of seats purchased, the seats filled, and the remaining open seats.\n\n" +
              "If you click on the Usage button, you will see everyone who has been enrolled in the course using an Advance Purchase seat.\n\n" +
              "If a student's course has not been completed and they will not be completing it, please let us know and we can remove them from the course and open the seat back up.\n\n" +
              "Thank you.";

        popup.innerHTML = `
            <label style="margin-bottom:5px;">Edit Email:</label>
            <textarea style="width:100%; height:300px; padding:10px; font-family:monospace; font-size:14px;">${emailText}</textarea>
            <div style="margin-top:15px; text-align:right;">
                <button id="backBtn" class="btn btn-danger" style="margin-right:10px;">Back</button>
                <button id="sendBtn" class="btn btn-success">Send Email</button>
            </div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        const textarea = popup.querySelector('textarea');

        popup.querySelector('#backBtn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            callback('back');
        });

        popup.querySelector('#sendBtn').addEventListener('click', () => {
            const body = encodeURIComponent(textarea.value);
            const subject = encodeURIComponent("Advance Purchases Added");
            const mailtoLink = `mailto:${emails.join(',')}?subject=${subject}&body=${body}`;
            window.location.href = mailtoLink;
            document.body.removeChild(overlay);
            callback('sent');
        });
    }

    // ---------- 5. Intercept Add Prepaid Record button ----------
    const addButton = document.querySelector('button[type="submit"][value="Add Prepaid Record"]');
    if (addButton) {
        addButton.addEventListener('click', function(e) {
            e.preventDefault(); // stop default submit

            const orgId = getSelectedOrgId();
            if (!orgId) {
                alert("Please select a corporate account first.");
                return;
            }

            const allOptions = [];
            document.querySelectorAll('select[name="Catalog_Number"] option').forEach(opt => {
                if (opt.value) allOptions.push(opt.text);
            });

            // ---- Styled Yes/No Prompt ----
            showYesNoPromptStyled("Generate AP email to admin?", function(yesSelected) {
                if (!yesSelected) {
                    addButton.form.submit();
                    return;
                }

                function selectClassesLoop() {
                    showClassSelector(allOptions, selectedClasses => {
                        if (!selectedClasses) {
                            addButton.form.submit();
                            return;
                        }

                        fetchAdminEmailsViaIframe(orgId, function(emails) {
                            if (emails.length === 0) {
                                alert("No admin emails found.");
                                addButton.form.submit();
                                return;
                            }

                            showEmailEditor(selectedClasses, emails, function(result) {
                                if(result === 'back') {
                                    // go back to class selection
                                    selectClassesLoop();
                                    return;
                                }
                                // Email sent, submit form
                                setTimeout(() => {
                                    addButton.form.submit();
                                }, 500);
                            });
                        });
                    });
                }

                selectClassesLoop();
            });
        });
    }

    function addSendAPEmailButtonToHeading() {
        // Find the <h3> with the exact text
        const headings = document.querySelectorAll('h3');
        let heading = null;
        headings.forEach(h => {
            if (h.textContent.trim() === "Add a Corporate Prepay Record") heading = h;
        });
        if (!heading) return;

        // Avoid adding multiple buttons
        if (document.getElementById('sendAPEmailBtn')) return;

        const btn = document.createElement('button');
        btn.id = 'sendAPEmailBtn';
        btn.textContent = 'Send AP Email Without Adding AP';
        btn.style.marginLeft = '15px';
        btn.style.padding = '6px 12px';
        btn.style.fontSize = '14px';
        btn.style.backgroundColor = '#28a745'; // green
        btn.style.color = 'white';
        btn.style.border = '1px solid #28a745';
        btn.style.borderRadius = '4px';
        btn.style.verticalAlign = 'middle';
        btn.type = 'button'; // prevent form submission

        heading.parentNode.insertBefore(btn, heading.nextSibling);

        btn.addEventListener('click', () => {
            const orgId = getSelectedOrgId();
            if (!orgId) {
                alert("Please select a corporate account first.");
                return;
            }

            const allOptions = [];
            document.querySelectorAll('select[name="Catalog_Number"] option').forEach(opt => {
                if (opt.value) allOptions.push(opt.text);
            });

            function selectClassesLoop() {
                showClassSelector(allOptions, selectedClasses => {
                    if (!selectedClasses) return;

                    fetchAdminEmailsViaIframe(orgId, function(emails) {
                        if (emails.length === 0) {
                            alert("No admin emails found.");
                            return;
                        }

                        showEmailEditor(selectedClasses, emails, function(result) {
                            if(result === 'back') {
                                selectClassesLoop();
                                return;
                            }
                            // Email sent
                        });
                    });
                });
            }

            selectClassesLoop();
        });
    }

    // Run periodically in case heading reloads dynamically
    setInterval(addSendAPEmailButtonToHeading, 1000);

})();