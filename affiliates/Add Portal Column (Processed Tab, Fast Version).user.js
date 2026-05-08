// ==UserScript==
// @name         Add Portal Column (Processed Tab, Fast Version)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Quickly check portal student status and add column in Processed tab
// @match        https://otsystems.net/admin/utilities/ERG/
// @grant        GM_xmlhttpRequest
// @connect      otsystems.net
// ==/UserScript==

(function () {
    'use strict';

    const MAX_CONCURRENT = 20; // You can increase/decrease for speed/safety

    function createRunButton() {
        const button = document.createElement('button');
        button.textContent = 'Add Portal Column';
        button.style.position = 'fixed';
        button.style.bottom = '20px';
        button.style.right = '20px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 15px';
        button.style.backgroundColor = '#007BFF';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.3)';
        button.addEventListener('click', runPortalReport);
        document.body.appendChild(button);
    }

    function findProcessedTable() {
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
            const headers = Array.from(table.querySelectorAll('thead th')).map(th =>
                th.textContent.trim()
            );
            if (
                headers.includes('Date Processed') &&
                headers.includes('By Admin') &&
                headers.includes('Student') &&
                headers.includes('Enrollment')
            ) {
                return table;
            }
        }
        return null;
    }

    async function runPortalReport() {
        const table = findProcessedTable();
        if (!table) {
            alert("Couldn't find the Processed tab table.");
            return;
        }

        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return;

        if (![...headerRow.children].some(th => th.textContent.includes('Portal Student'))) {
            const newTh = document.createElement('th');
            newTh.textContent = 'Portal Student';
            newTh.style.backgroundColor = '#f5f5f5';
            headerRow.insertBefore(newTh, headerRow.lastElementChild);
        }

        const rows = [...table.querySelectorAll('tbody tr')];
        const tasks = [];

        for (const row of rows) {
            const studentLink = row.querySelector('a[href*="student_number="]');
            if (!studentLink) continue;

            const studentNumber = (studentLink.href.match(/student_number=(\d+)/) || [])[1];
            if (!studentNumber) continue;

            tasks.push({ row, studentNumber });
        }

        for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
            const batch = tasks.slice(i, i + MAX_CONCURRENT);

            await Promise.all(batch.map(async ({ row, studentNumber }) => {
                const portalStatus = await fetchPortalInfo(studentNumber);
                const newTd = document.createElement('td');
                newTd.textContent = portalStatus;
                row.insertBefore(newTd, row.lastElementChild);
            }));

            console.log(`✅ Processed ${Math.min(i + MAX_CONCURRENT, tasks.length)} / ${tasks.length}`);
        }

        console.log('✅ Done adding portal student column (batched).');
    }

    function fetchPortalInfo(studentNumber) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `https://otsystems.net/admin/students/dashboard.asp?student_number=${studentNumber}`,
                onload: function (response) {
                    if (response.status === 200) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');
                        const portalTh = Array.from(doc.querySelectorAll('th')).find(th =>
                            th.textContent.includes('Portal Student:')
                        );

                        if (portalTh) {
                            const td = portalTh.parentElement.querySelector('td');
                            const label = td?.innerText?.trim();

                            if (label) {
                                resolve(`Yes – ${label}`);
                            } else {
                                resolve('No');
                            }
                        } else {
                            resolve('No');
                        }
                    } else {
                        resolve('No');
                    }
                },
                onerror: function () {
                    resolve('No');
                }
            });
        });
    }

    window.addEventListener('load', () => {
        createRunButton();
    });
})();
