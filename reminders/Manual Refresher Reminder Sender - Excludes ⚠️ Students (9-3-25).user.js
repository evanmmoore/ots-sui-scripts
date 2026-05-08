// ==UserScript==
// @name         Manual Refresher Reminder Sender - Excludes ⚠️ Students (9/3/25)
// @namespace    http://otsystems.net/
// @version      1.0
// @description  Adds a button in the bottom-right corner to manually send reminder emails for students without warning icons.
// @match        https://otsystems.net/admin/utilities/refresherreminder/default2.asp
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ---------------- Logger UI ----------------
    const logContainer = document.createElement('div');
    Object.assign(logContainer.style, {
        position: 'fixed',
        bottom: '60px',
        right: '10px',
        width: '350px',
        maxHeight: '300px',
        overflowY: 'auto',
        backgroundColor: '#fff',
        border: '1px solid #ccc',
        borderRadius: '5px',
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '8px',
        boxShadow: '0 0 10px rgba(0,0,0,0.2)',
        zIndex: 9999
    });

    const log = (message, type = 'info') => {
        const color = type === 'warn' ? 'orange' : type === 'error' ? 'red' : 'green';
        const line = document.createElement('div');
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        line.style.color = color;
        logContainer.appendChild(line);
        logContainer.scrollTop = logContainer.scrollHeight;
        console.log(`[Refresher Log] ${message}`);
    };

    document.body.appendChild(logContainer);

    // ---------------- Core Logic ----------------
    function hasWarningIcon(row) {
        return row.querySelector('i.fa-exclamation-triangle') !== null;
    }

    function sendEmail(row) {
        const btn = row.querySelector('button.btn.btn-blue');
        if (btn) {
            btn.click();
            const name = row.innerText.trim().split('\n')[0];
            log(`✅ Email sent for: ${name}`);
        }
    }

    function processStudents() {
        const rows = document.querySelectorAll('tr[ng-repeat="reminder in rc.Reminders"]');
        log(`🔍 Found ${rows.length} student row(s).`);
        rows.forEach(row => {
            const name = row.innerText.trim().split('\n')[0];
            if (hasWarningIcon(row)) {
                log(`⚠️ Skipped (warning icon): ${name}`, 'warn');
            } else {
                sendEmail(row);
            }
        });
    }

    // ---------------- Manual Trigger Button ----------------
    const btn = document.createElement('button');
    btn.textContent = '📧 Send Reminders';
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        padding: '10px 16px',
        backgroundColor: '#007BFF',
        color: '#fff',
        border: 'none',
        borderRadius: '5px',
        fontWeight: 'bold',
        fontSize: '14px',
        cursor: 'pointer',
        zIndex: 10000,
        boxShadow: '0 0 8px rgba(0, 0, 0, 0.3)'
    });

    btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'Processing...';
        processStudents();
        setTimeout(() => {
            btn.disabled = false;
            btn.textContent = '📧 Send Reminders';
        }, 4000);
    };

    document.body.appendChild(btn);
})();
