// ==UserScript==
// @name         Affiliate Report Toggle + Notes + CSV
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Toggle zero rows, add checkboxes/dropdowns/notes, and export to CSV
// @match        https://otsystems.net/admin/reports/affiliate/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ---------- Styles ----------
    const style = document.createElement("style");
    style.textContent = `
        #toggleZeroRowsBtn:hover { filter: brightness(1.1); }
        .affiliate-extra { display: inline-flex; gap: 5px; align-items: center; margin-left: 10px; font-size: 12px; }
        .affiliate-extra input[type="text"] { width: 120px; }
        .btn-custom { cursor: pointer; text-decoration: none; padding: 6px 12px; border-radius: 4px; color: white; }
        .btn-gradient { background-image: linear-gradient(135deg, #667EEA 0%, #764BA2 100%); }
        .btn-green { background-image: linear-gradient(135deg, #34D399 0%, #10B981 100%); }
    `;
    document.head.appendChild(style);

    // ---------- Toggle $0 Rows ----------
    function createToggleButton() {
        let btn = document.createElement("a");
        btn.id = "toggleZeroRowsBtn";
        btn.textContent = "Hide $0.00 Rows";
        btn.className = "btn-custom btn-gradient";
        btn.style.marginLeft = "10px";
        return btn;
    }

    let toggleState = false;
    function isZeroAmountRow(tr) {
        let simpleAmount = tr.querySelector("td.amount");
        if (simpleAmount) return parseFloat(simpleAmount.textContent.replace(/[^0-9.-]/g,"")) === 0;
        let amounts = tr.innerText.match(/\$[-0-9.]+/g);
        if (!amounts) return false;
        return amounts.reduce((sum, amt) => sum + parseFloat(amt.replace(/[^0-9.-]/g,"")),0) === 0;
    }
    function toggleZeroRows() {
        document.querySelectorAll("table tr").forEach(tr => {
            if (isZeroAmountRow(tr)) tr.style.display = toggleState ? "" : "none";
        });
        toggleState = !toggleState;
        button.textContent = toggleState ? "Show $0.00 Rows" : "Hide $0.00 Rows";
    }

    // ---------- Add checkboxes/dropdowns/notes ----------
    function addExtraUI() {
        document.querySelectorAll("td.action-cell.no-print").forEach(cell => {
            if (cell.querySelector(".affiliate-extra")) return;

            const div = document.createElement('div');
            div.className = 'affiliate-extra';
            div.innerHTML = `
                <input type="checkbox" class="matches-report" title="Matches Affiliate Earnings Report">
                <label>Matches Affiliate Earnings Report</label>
                <select class="match-status">
                    <option value="">--Select--</option>
                    <option value="does_not_match">Doesn't Match</option>
                </select>
                <input type="text" class="notes" placeholder="Notes">
            `;
            cell.appendChild(div);
        });
    }

    // ---------- Download CSV ----------
    function addDownloadButton() {
        const printButton = document.querySelector("a.btn-print");
        if (!printButton) return setTimeout(addDownloadButton, 500);

        const downloadBtn = document.createElement("a");
        downloadBtn.textContent = "Download Table CSV";
        downloadBtn.className = "btn-custom btn-green";
        downloadBtn.style.marginLeft = "10px";
        downloadBtn.addEventListener("click", () => {
            const rows = Array.from(document.querySelectorAll("table tr"));
            const csv = [];

            rows.forEach(tr => {
                const tds = Array.from(tr.querySelectorAll("td"));
                if (tds.length === 0) return;

                const values = tds.map(td => `"${td.innerText.replace(/"/g,'""')}"`);

                // Add checkbox, dropdown, notes if they exist
                const extra = tr.querySelector(".affiliate-extra");
                if (extra) {
                    const checkbox = extra.querySelector(".matches-report");
                    const select = extra.querySelector(".match-status");
                    const notes = extra.querySelector(".notes");

                    values.push(checkbox ? (checkbox.checked ? "Yes" : "No") : "");
                    values.push(select ? select.value : "");
                    values.push(notes ? notes.value.replace(/"/g,'""') : "");
                } else {
                    values.push("","","");
                }

                csv.push(values.join(","));
            });

            const blob = new Blob([csv.join("\n")], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "affiliate_report.csv";
            a.click();
            URL.revokeObjectURL(a.href);
        });

        printButton.parentNode.insertBefore(downloadBtn, printButton.nextSibling);
    }

    // ---------- Insert toggle button ----------
    const button = createToggleButton();
    function insertButton() {
        const printButton = document.querySelector("a.btn-print");
        if (printButton) {
            printButton.parentNode.insertBefore(button, printButton.nextSibling);
            button.addEventListener("click", toggleZeroRows);

            // Add checkboxes/dropdowns/notes
            addExtraUI();
            // Add Download CSV button
            addDownloadButton();
        } else {
            setTimeout(insertButton, 300);
        }
    }

    insertButton();
})();
