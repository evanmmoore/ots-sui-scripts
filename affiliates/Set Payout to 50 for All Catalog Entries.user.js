// ==UserScript==
// @name         Set Payout to 50 for All Catalog Entries
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically sets payout amount to 50 for all catalog entries
// @author       You
// @match        https://admin.otsystems.net/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Add a button to trigger the automation
    function addControlButton() {
        const btn = document.createElement('button');
        btn.textContent = '▶ Set All Payouts to 50';
        btn.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 99999;
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        `;

        const status = document.createElement('div');
        status.id = 'ots-status';
        status.style.cssText = `
            position: fixed;
            top: 50px;
            right: 10px;
            z-index: 99999;
            background: rgba(0,0,0,0.75);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            max-width: 300px;
            display: none;
        `;

        btn.addEventListener('click', () => {
            status.style.display = 'block';
            runAutomation(status);
        });

        document.body.appendChild(btn);
        document.body.appendChild(status);
    }

    function setStatus(statusEl, msg) {
        statusEl.textContent = msg;
        console.log('[OTS Script]', msg);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Trigger Angular's ng-model update on an input
    function setNgModelValue(inputEl, value) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(inputEl, value);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function processEntry(row, index, total, statusEl) {
        setStatus(statusEl, `Processing ${index + 1}/${total}...`);

        // Click the pencil/edit button
        const editBtn = row.querySelector('.edit i.fa-pencil');
        if (!editBtn) {
            console.warn('No edit button found for row', index);
            return;
        }
        editBtn.parentElement.click();
        await sleep(200);

        // Find the edit card within this row
        const editCard = row.querySelector('.card.edit-entry');
        if (!editCard) {
            console.warn('No edit card found for row', index);
            return;
        }

        // Set the payout value input to 50
        const payoutInput = editCard.querySelector('input[type="number"][ng-model="entry.PayoutValue"]');
        if (!payoutInput) {
            console.warn('No payout input found for row', index);
            return;
        }

        setNgModelValue(payoutInput, 50);
        await sleep(150);

        // Click the Update button
        const updateBtn = editCard.querySelector('.btn.btn-success');
        if (!updateBtn) {
            console.warn('No Update button found for row', index);
            return;
        }
        updateBtn.click();
        await sleep(300);
    }

    async function runAutomation(statusEl) {
        setStatus(statusEl, 'Starting...');
        await sleep(250);

        const rows = document.querySelectorAll('tr.portal-catalog-entry');
        if (!rows.length) {
            setStatus(statusEl, '❌ No catalog rows found. Make sure the page is fully loaded.');
            return;
        }

        setStatus(statusEl, `Found ${rows.length} entries. Starting...`);
        await sleep(250);

        for (let i = 0; i < rows.length; i++) {
            await processEntry(rows[i], i, rows.length, statusEl);
        }

        setStatus(statusEl, `✅ Done! Processed ${rows.length} entries.`);
    }

    // Wait for the page/Angular app to load before injecting the button
    function waitForTable() {
        const interval = setInterval(() => {
            if (document.querySelector('tr.portal-catalog-entry')) {
                clearInterval(interval);
                addControlButton();
            }
        }, 500);
    }

    waitForTable();

})();