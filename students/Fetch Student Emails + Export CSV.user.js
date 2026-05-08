// ==UserScript==
// @name         Fetch Student Emails + Export CSV
// @namespace    https://otsystems.net/
// @version      1.3
// @description  Fetches student emails (primary + secondary), shows them, and lets you export student_number,primary_email,secondary_email as CSV.
// @match        https://otsystems.net/admin/Marketing/previewtemplate.asp?id=*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Fetch both primary and secondary emails if found
    async function fetchStudentEmail(studentNumber) {
        try {
            const resp = await fetch(`/admin/students/dashboard/?student_number=${encodeURIComponent(studentNumber)}`, { credentials: 'include' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const htmlText = await resp.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, 'text/html');

            let primaryEmail = null;
            let secondaryEmail = null;

            const rows = [...doc.querySelectorAll('table tr')];
            for (const row of rows) {
                const th = row.querySelector('th');
                const td = row.querySelector('td');
                if (!th || !td) continue;
                const key = th.textContent.trim().toLowerCase();

                if (key.includes('email:') && !key.includes('alt') && !primaryEmail) {
                    // Primary email
                    const mailtoLink = td.querySelector('a[href^="mailto:"]');
                    if (mailtoLink) {
                        primaryEmail = mailtoLink.getAttribute('href').replace(/^mailto:/i, '').trim();
                    } else if (td.textContent.trim()) {
                        primaryEmail = td.textContent.trim();
                    }
                }
                else if ((key.includes('alt email:') || key.includes('secondary email:') || key.includes('alt. email:')) && !secondaryEmail) {
                    // Secondary email
                    const mailtoLink = td.querySelector('a[href^="mailto:"]');
                    if (mailtoLink) {
                        secondaryEmail = mailtoLink.getAttribute('href').replace(/^mailto:/i, '').trim();
                    } else if (td.textContent.trim()) {
                        secondaryEmail = td.textContent.trim();
                    }
                }
            }

            // fallback: if no labeled alt email found, try to get a second mailto link
            if (!secondaryEmail) {
                const mailtoLinks = [...doc.querySelectorAll('a[href^="mailto:"]')];
                if (mailtoLinks.length > 1) {
                    secondaryEmail = mailtoLinks[1].getAttribute('href').replace(/^mailto:/i, '').trim();
                }
            }

            return { primary: primaryEmail, secondary: secondaryEmail };
        } catch (e) {
            console.error(`Error fetching email for student ${studentNumber}:`, e);
            return { primary: null, secondary: null };
        }
    }

    async function processStudentLinks() {
        const studentLinks = Array.from(document.querySelectorAll('a[href*="/admin/students/dashboard/?student_number="]'));

        if (studentLinks.length === 0) {
            alert('No student dashboard links found on the page.');
            return;
        }

        const containerId = 'emailFetchResultsContainer';
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'fixed';
            container.style.top = '60px';
            container.style.right = '10px';
            container.style.maxHeight = '60vh';
            container.style.overflowY = 'auto';
            container.style.backgroundColor = '#fff';
            container.style.border = '1px solid #ccc';
            container.style.padding = '12px';
            container.style.fontSize = '13px';
            container.style.zIndex = 99999;
            container.style.width = '360px';
            container.style.boxShadow = '0 0 12px rgba(0,0,0,0.15)';
            document.body.appendChild(container);
        }

        container.innerHTML = '<h4>Fetching emails...</h4>';

        const results = [];
        container.innerHTML = '';

        for (const link of studentLinks) {
            const urlParams = new URLSearchParams(link.search);
            const studentNumber = urlParams.get('student_number');
            if (!studentNumber) continue;

            const div = document.createElement('div');
            div.style.marginBottom = '6px';
            div.textContent = `S# ${studentNumber}: Fetching...`;
            container.appendChild(div);

            const emails = await fetchStudentEmail(studentNumber);
            const displayPrimary = emails.primary || '[No Primary Email]';
            const displaySecondary = emails.secondary || '[No Secondary Email]';

            if (!emails.primary && !emails.secondary) {
                div.textContent = `S# ${studentNumber}: Email NOT found`;
            } else {
                div.textContent = `S# ${studentNumber}: Primary: ${displayPrimary}, Secondary: ${displaySecondary}`;
                results.push({ studentNumber, primaryEmail: emails.primary || '', secondaryEmail: emails.secondary || '' });
            }
        }

        // Add Export CSV button
        if (results.length > 0) {
            const exportBtn = document.createElement('button');
            exportBtn.textContent = 'Export Emails as CSV';
            exportBtn.style.marginTop = '12px';
            exportBtn.style.padding = '8px 12px';
            exportBtn.style.backgroundColor = '#2a7ae2';
            exportBtn.style.color = '#fff';
            exportBtn.style.border = 'none';
            exportBtn.style.borderRadius = '4px';
            exportBtn.style.cursor = 'pointer';

            exportBtn.onclick = () => {
                const csvHeader = 'student_number,primary_email,secondary_email\n';
                const csvRows = results.map(r =>
                    `${r.studentNumber},${r.primaryEmail || ''},${r.secondaryEmail || ''}`
                ).join('\n');
                const csvContent = csvHeader + csvRows;
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = 'student_emails.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };

            container.appendChild(exportBtn);
        } else {
            container.appendChild(document.createTextNode('No emails found to export.'));
        }
    }

    function addStartButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Fetch Student Emails & Export CSV';
        btn.style.position = 'fixed';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = 9999;
        btn.style.padding = '10px 15px';
        btn.style.backgroundColor = '#28a745';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '5px';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
        btn.addEventListener('click', processStudentLinks);
        document.body.appendChild(btn);
    }

    window.addEventListener('load', addStartButton);

})();
