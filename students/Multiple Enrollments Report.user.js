// ==UserScript==
// @name         Multiple Enrollments Report
// @namespace    https://otsystems.net/
// @version      1.7
// @description  Show report of enrollments matching Payment / Current:Students with exact table colors
// @match        https://otsystems.net/admin/students/MultipleEnrollments.asp*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function buildReport() {
        const tableWrapper = document.querySelector("#mseTable_wrapper > div:nth-child(2) > div");
        if (!tableWrapper) return alert("Table container not found!");

        const table = tableWrapper.querySelector("#mseTable");
        if (!table) return alert("Table not found inside wrapper!");

        const headerCells = Array.from(table.querySelectorAll("thead th"));
        const statusIndex = headerCells.findIndex(th => th.textContent.trim().includes("Status"));
        const signupDateIndex = headerCells.findIndex(th => th.textContent.trim().includes("Signup Date"));
        const signupIdIndex = headerCells.findIndex(th => th.textContent.trim().includes("Signup ID"));

        if (statusIndex === -1 || signupDateIndex === -1 || signupIdIndex === -1)
            return alert("Required columns not found.");

        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const matches = rows.filter(row => {
            const cells = row.querySelectorAll("td");
            const status = cells[statusIndex]?.textContent.trim() || "";
            return /Payment|Current:Students|Enrollments|Students/i.test(status);
        });

        // Remove old report
        const oldReport = document.getElementById("tm-enrollment-report");
        if (oldReport) oldReport.remove();

        const container = document.createElement("div");
        container.id = "tm-enrollment-report";
        container.style.border = "2px solid #444";
        container.style.padding = "10px";
        container.style.margin = "15px 0";
        container.style.background = "#f9f9f9";

        const title = document.createElement("h3");
        title.textContent = "Filtered Enrollments (Payment / Current:Students)";
        container.appendChild(title);

        const list = document.createElement("ul");
        list.style.listStyleType = "none";
        list.style.paddingLeft = "0";

        matches.forEach(row => {
            const cells = row.querySelectorAll("td");
            const signupDate = cells[signupDateIndex]?.textContent.trim();
            const signupId = cells[signupIdIndex]?.textContent.trim();
            const statusCell = cells[statusIndex];
            const status = statusCell?.textContent.trim();

            if (signupId && statusCell) {
                const li = document.createElement("li");
                li.style.padding = "5px";
                li.style.marginBottom = "3px";
                li.style.backgroundColor = window.getComputedStyle(statusCell).backgroundColor;
                li.style.borderRadius = "3px";

                const link = document.createElement("a");
                link.href = `https://otsystems.net/admin/students/multipleEnrollmentsPicked.asp?form_action=load_enrollments&signup_id=${encodeURIComponent(signupId)}`;
                link.textContent = `MSE # ${signupId}`;
                link.target = "_blank";

                li.appendChild(link);
                li.appendChild(document.createTextNode(` | Signup Date: ${signupDate} | Status: ${status}`));
                list.appendChild(li);
            }
        });

        container.appendChild(list);
        tableWrapper.parentNode.insertBefore(container, tableWrapper);
    }

    const button = document.createElement("button");
    button.textContent = "Generate Enrollment Report";
    button.style.backgroundColor = "#FF6600"; // bright orange
    button.style.color = "#ffffff";
    button.style.margin = "10px";
    button.style.padding = "5px 10px";
    button.style.fontSize = "14px";
    button.addEventListener("click", buildReport);

    document.body.insertBefore(button, document.body.firstChild);
})();
