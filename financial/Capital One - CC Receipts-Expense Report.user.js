// ==UserScript==
// @name         Capital One - CC Receipts/Expense Report
// @namespace    https://example.com/
// @version      1.4
// @description  Extract transactions from Capital One, add On Tapo Server + Notes columns, delete rows, and export with signature footer
// @match        https://myaccounts.capitalone.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /* ------------------ BUTTON INJECTION ------------------ */
    const observer = new MutationObserver(() => {
        if (document.getElementById('cc-receipts-button')) return;

        const container = document.querySelector('body');
        if (!container) return;

        const btn = document.createElement('button');
        btn.textContent = 'CC Receipts';
        btn.id = 'cc-receipts-button';
        btn.style.position = 'fixed';
        btn.style.top = '10px';
        btn.style.right = '10px';
        btn.style.zIndex = 10000;
        btn.style.padding = '10px 14px';
        btn.style.background = '#0070cd';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.onclick = openApp;

        container.appendChild(btn);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    /* ------------------ EXTRACT TRANSACTIONS ------------------ */
    function extractTransactions() {
        const rows = document.querySelectorAll('c1-ease-row');
        const transactions = [];

        rows.forEach(row => {
            const dateMonth = row.querySelector('.c1-ease-txns-date-and-status__month')?.textContent.trim() || '';
            const dateDay = row.querySelector('.c1-ease-txns-date-and-status__day')?.textContent.trim() || '';
            const date = dateMonth + ' ' + dateDay;

            const description = row.querySelector('.c1-ease-txns-description__description')?.textContent.trim() || '';
            const category = row.querySelector('.c1-ease-card-transactions-view-table__rewards-category')?.textContent.trim() || '';
            const card = row.querySelector('.c1-ease-card-transactions-view-table__card span')?.textContent.trim() || '';
            const amount = row.querySelector('.cdk-column-amount span:first-child')?.textContent.trim().replace('$','') || '';

            transactions.push({ date, description, category, card, amount });
        });

        return transactions;
    }

    /* ------------------ POPUP APP ------------------ */
    function openApp() {
        const transactions = extractTransactions();
        const win = window.open('', '_blank', 'width=1100,height=650');

        let tableRows = '';
        transactions.forEach(t => {
            tableRows += `<tr>
                <td><input value="${t.date}"></td>
                <td><input value="${t.description}"></td>
                <td><input value="${t.category}"></td>
                <td><input value="${t.card}"></td>
                <td><input value="${t.amount}"></td>
                <td>
                    <select onchange="toggleRowHighlight(this)">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                    </select>
                </td>
                <td><input placeholder="Optional notes"></td>
                <td><button onclick="this.closest('tr').remove()">X</button></td>
            </tr>`;
        });

        win.document.write(`
<!DOCTYPE html>
<html>
<head>
<title>CC Receipts</title>
<style>
body { font-family: Arial; padding: 20px; }
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
th, td { border: 1px solid #888; padding: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
td input, td select { width: 100%; box-sizing: border-box; padding: 2px 4px; font-size: 13px; }
button { margin: 6px 4px 6px 0; padding: 6px 10px; }

th:nth-child(1), td:nth-child(1) { width: 70px; }
th:nth-child(2), td:nth-child(2) { width: 200px; }
th:nth-child(3), td:nth-child(3) { width: 120px; }
th:nth-child(4), td:nth-child(4) { width: 120px; }
th:nth-child(5), td:nth-child(5) { width: 80px; }
th:nth-child(6), td:nth-child(6) { width: 100px; }
th:nth-child(7), td:nth-child(7) { width: 150px; }
th:nth-child(8), td:nth-child(8) { width: 60px; text-align:center; }

tr.highlighted { background-color: #90EE90 !important; }

@media print {
    tr.highlighted { background-color: transparent !important; }
    button { display: none; }
    th:nth-child(8), td:nth-child(8) { display: none; }
}
</style>
</head>
<body>

<h2>Credit Card Receipts</h2>

<button onclick="setAllTapoYes()">Select All On Tapo Server = Yes</button>
<button onclick="clearHighlights()">Clear Highlights (Keep Yes Values)</button>

<br><br>
<label>
<strong>Signature Name:</strong>
<input id="sigName" style="width:250px">
</label>
<br><br>

<table id="tbl">
<thead>
<tr>
<th>Date</th>
<th>Description</th>
<th>Category</th>
<th>Card</th>
<th>Amount</th>
<th>On Tapo Server</th>
<th>Notes</th>
<th>Delete</th>
</tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>

<button onclick="addRow()">Add Empty Row</button>
<button onclick="exportDoc()">Export to DOC</button>

<script>
function toggleRowHighlight(selectElement) {
    const row = selectElement.closest('tr');
    if (selectElement.value === 'Yes') {
        row.classList.add('highlighted');
    } else {
        row.classList.remove('highlighted');
    }
}

function clearHighlights() {
    document.querySelectorAll('#tbl tbody tr').forEach(tr => {
        tr.classList.remove('highlighted');
    });
}

function addRow(data = {}) {
    const tr = document.createElement('tr');
    const columns = ['date','description','category','card','amount','tapo','notes'];

    columns.forEach(k => {
        const td = document.createElement('td');
        let el;
        if(k === 'tapo') {
            el = document.createElement('select');
            el.onchange = function() { toggleRowHighlight(this); };
            ['No','Yes'].forEach(v => {
                const option = document.createElement('option');
                option.value = v;
                option.textContent = v;
                el.appendChild(option);
            });
        } else {
            el = document.createElement('input');
            if(data[k]) el.value = data[k];
            if(k === 'notes') el.placeholder = 'Optional notes';
        }
        td.appendChild(el);
        tr.appendChild(td);
    });

    const tdDelete = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'X';
    btn.onclick = () => tr.remove();
    tdDelete.appendChild(btn);
    tr.appendChild(tdDelete);

    document.querySelector('#tbl tbody').appendChild(tr);
}

function setAllTapoYes() {
    document.querySelectorAll('#tbl tbody tr').forEach(tr => {
        const select = tr.querySelector('td:nth-child(6) select');
        if(select) {
            select.value = 'Yes';
            toggleRowHighlight(select);
        }
    });
}

function exportDoc() {
    let html = '<h2>Credit Card Receipts</h2><table border="1" cellpadding="6"><tr>' +
        '<th>Date</th><th>Description</th><th>Category</th><th>Card</th><th>Amount</th><th>On Tapo Server</th><th>Notes</th></tr>';

    document.querySelectorAll('#tbl tbody tr').forEach(tr => {
        html += '<tr>';
        tr.querySelectorAll('td').forEach((td, i) => {
            if(i === 7) return; // skip delete column
            const val = td.querySelector('input, select')?.value || '';
            html += '<td>' + val + '</td>';
        });
        html += '</tr>';
    });

    const sigName = document.getElementById('sigName')?.value || '';
    const today = new Date().toLocaleDateString();

    html += '</table>';

    html += \`
<style>
@page { footer: docFooter; }
div.footer {
    position: running(docFooter);
    font-size: 12px;
    margin-top: 40px;
}
</style>

<div class="footer">
<table width="100%" border="0" cellpadding="6">
<tr>
<td width="60%">
<strong>Signature:</strong> \${sigName}<br>
_______________________________
</td>
<td width="40%">
<strong>Date:</strong> \${today}
</td>
</tr>
</table>
</div>
\`;

    const blob = new Blob(['<html><body>' + html + '</body></html>'], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'CC_Receipts.doc';
    a.click();
}
</script>

</body>
</html>
        `);

        win.document.close();
    }
})();