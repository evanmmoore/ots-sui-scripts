// ==UserScript==
// @name         Show Unreconciled Payments
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Show unreconciled payments (excluding AP/Advance Purchase) when "Paid" filter is selected
// @match        https://otsystems.net/admin/Utilities/CustomPayment/*
// @match        https://www.otsystems.net/admin/Utilities/CustomPayment/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Check if "Paid" option is selected
    function isPaidSelected() {
        const typeSelect = document.getElementById('Type');
        if (!typeSelect) return false;

        const selectedOption = typeSelect.options[typeSelect.selectedIndex];
        return selectedOption && selectedOption.value === 'paid';
    }

    // Add or remove button based on selection
    function updateButtonVisibility() {
        const typeSelect = document.getElementById('Type');
        if (!typeSelect) return;

        // Check if button already exists
        let unreconciledBtn = document.getElementById('showUnreconciledBtn');

        if (isPaidSelected()) {
            // Show button if it doesn't exist
            if (!unreconciledBtn) {
                // Change select to inline-block so button can be next to it
                typeSelect.style.display = 'inline-block';
                typeSelect.style.width = 'auto';

                unreconciledBtn = document.createElement('button');
                unreconciledBtn.id = 'showUnreconciledBtn';
                unreconciledBtn.type = 'button';
                unreconciledBtn.className = 'btn btn-warning';
                unreconciledBtn.textContent = 'Show Unreconciled';
                unreconciledBtn.style.whiteSpace = 'nowrap';
                unreconciledBtn.style.marginLeft = '10px';
                unreconciledBtn.style.display = 'inline-block';
                unreconciledBtn.style.verticalAlign = 'middle';

                // Insert button right after the select element
                typeSelect.insertAdjacentElement('afterend', unreconciledBtn);

                unreconciledBtn.addEventListener('click', showUnreconciledPayments);
            }
        } else {
            // Remove button if it exists
            if (unreconciledBtn) {
                unreconciledBtn.remove();
                // Reset select display if needed
                typeSelect.style.display = '';
                typeSelect.style.width = '';
            }
        }
    }

    // Extract unreconciled payments
    function getUnreconciledPayments() {
        const rows = document.querySelectorAll('table.dataTable tbody tr');
        const unreconciled = [];

        rows.forEach(row => {
            // Check if row has "Reconciled" label
            const hasReconciled = row.querySelector('span.label.bg-purple-500');
            if (hasReconciled) return; // Skip reconciled payments

            // Get the "Re:" column (4th column, index 3)
            const reColumn = row.cells[3];
            if (!reColumn) return;

            const reText = reColumn.textContent.trim().toLowerCase();

            // Skip if contains "AP" or "Advance Purchase"
            if (reText.includes('ap') || reText.includes('advance purchase')) return;

            // Extract payment data
            const dateTime = row.cells[0]?.textContent.trim() || '';
            const name = row.cells[1]?.textContent.trim() || '';
            const company = row.cells[2]?.textContent.trim() || '';
            const re = row.cells[3]?.textContent.trim() || '';
            const processedDate = row.cells[4]?.textContent.trim() || '';
            const amount = row.cells[5]?.textContent.trim() || '';
            const balance = row.cells[6]?.textContent.trim() || '';

            // Get VIEW button link
            const viewBtn = row.querySelector('a.btn.btn-info[href*="paymentview.asp"]');
            const viewLink = viewBtn ? viewBtn.href : '';

            unreconciled.push({
                dateTime,
                name,
                company,
                re,
                processedDate,
                amount,
                balance,
                viewLink
            });
        });

        return unreconciled;
    }

    // Show unreconciled payments in a modal
    function showUnreconciledPayments() {
        const payments = getUnreconciledPayments();

        if (payments.length === 0) {
            alert('No unreconciled payments found (excluding AP/Advance Purchase).');
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.6)';
        overlay.style.zIndex = 9999;
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';

        // Create modal
        const modal = document.createElement('div');
        modal.style.width = '95%';
        modal.style.maxWidth = '1400px';
        modal.style.maxHeight = '90%';
        modal.style.background = '#fff';
        modal.style.borderRadius = '6px';
        modal.style.overflow = 'hidden';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';

        // Modal header
        const header = document.createElement('div');
        header.style.padding = '20px';
        header.style.borderBottom = '1px solid #ddd';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.backgroundColor = '#f8f9fa';

        const title = document.createElement('h3');
        title.textContent = `Unreconciled Payments (${payments.length})`;
        title.style.margin = 0;
        title.style.color = '#333';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn btn-danger';
        closeBtn.textContent = 'Close';
        closeBtn.style.padding = '8px 16px';

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Modal body
        const body = document.createElement('div');
        body.style.padding = '20px';
        body.style.overflowY = 'auto';
        body.style.flex = '1';

        // Create table
        const table = document.createElement('table');
        table.className = 'table table-bordered table-striped table-hover';
        table.style.fontSize = '13px';

        table.innerHTML = `
            <thead style="background-color: rgb(32, 77, 116); color: white;">
                <tr>
                    <th>Date/Time</th>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Re:</th>
                    <th>Processed</th>
                    <th>Amount</th>
                    <th>Balance</th>
                    <th>Actions</th>
                    <th>Reconciled</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');

        payments.forEach(payment => {
            const tr = document.createElement('tr');

            // Extract request_id from view link
            const requestId = payment.viewLink.match(/request_id=(\d+)/)?.[1];

            tr.innerHTML = `
                <td>${payment.dateTime}</td>
                <td>${payment.name}</td>
                <td>${payment.company}</td>
                <td>${payment.re}</td>
                <td>${payment.processedDate}</td>
                <td>${payment.amount}</td>
                <td>${payment.balance}</td>
                <td nowrap="nowrap">
                    ${payment.viewLink ? `<a href="${payment.viewLink}" class="btn btn-info btn-sm" target="_blank">VIEW</a>` : ''}
                </td>
                <td class="text-center reconcile-cell" data-request-id="${requestId}">
                    <button class="btn btn-sm btn-default reconcile-toggle" style="min-width:60px;">
                        <span class="reconcile-status">Loading...</span>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        body.appendChild(table);

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Load reconciled status for each payment
        loadReconciledStatuses(tbody);

        // Close button handler
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }

    // Load reconciled status for all payments via iframes
    function loadReconciledStatuses(tbody) {
        const cells = tbody.querySelectorAll('.reconcile-cell');

        cells.forEach(cell => {
            const requestId = cell.getAttribute('data-request-id');
            if (!requestId) return;

            const button = cell.querySelector('.reconcile-toggle');
            const statusSpan = button.querySelector('.reconcile-status');

            // Fetch the payment view page
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = `/admin/Utilities/payment/paymentview.asp?request_id=${requestId}`;
            document.body.appendChild(iframe);

            iframe.onload = () => {
                // Wait for Angular to render (increased delay)
                setTimeout(() => {
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;

                        // Find the reconciled button - try alert first as it's more specific
                        let reconciledBtn = doc.querySelector('.alert button[ng-click="rc.ToggleReconciled()"]');

                        // Fallback to broader search
                        if (!reconciledBtn) {
                            reconciledBtn = doc.querySelector('button[ng-click="rc.ToggleReconciled()"]');
                        }

                        if (reconciledBtn) {
                            const isReconciled = reconciledBtn.classList.contains('btn-success');
                            const isDisabled = reconciledBtn.hasAttribute('disabled') ||
                                             reconciledBtn.getAttribute('ng-disabled') === 'true';

                            // Update button appearance
                            if (isReconciled) {
                                button.classList.remove('btn-default');
                                button.classList.add('btn-success');
                                statusSpan.textContent = 'Yes';
                            } else {
                                button.classList.remove('btn-success');
                                button.classList.add('btn-default');
                                statusSpan.textContent = 'No';
                            }

                            if (isDisabled) {
                                button.disabled = true;
                                button.style.opacity = '0.6';
                                button.style.cursor = 'not-allowed';
                            } else {
                                button.disabled = false;
                                button.style.cursor = 'pointer';

                                // Add click handler to toggle
                                button.addEventListener('click', () => {
                                    toggleReconciled(requestId, button, statusSpan);
                                });
                            }
                        } else {
                            console.log('Reconciled button not found for request_id:', requestId);
                            statusSpan.textContent = 'N/A';
                            button.disabled = true;
                        }

                        document.body.removeChild(iframe);
                    } catch (err) {
                        console.error('Error loading reconciled status:', err);
                        statusSpan.textContent = 'Error';
                        button.disabled = true;
                        document.body.removeChild(iframe);
                    }
                }, 2000); // Increased to 2 seconds for Angular to load
            };

            iframe.onerror = () => {
                statusSpan.textContent = 'Error';
                button.disabled = true;
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            };
        });
    }

    // Toggle reconciled status
    function toggleReconciled(requestId, button, statusSpan) {
        const wasReconciled = button.classList.contains('btn-success');

        // Optimistic UI update
        button.disabled = true;
        statusSpan.textContent = 'Updating...';

        // Create iframe to interact with the page
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `/admin/Utilities/payment/paymentview.asp?request_id=${requestId}`;
        document.body.appendChild(iframe);

        iframe.onload = () => {
            // Wait for Angular to render
            setTimeout(() => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    let reconciledBtn = doc.querySelector('.alert button[ng-click="rc.ToggleReconciled()"]');

                    if (!reconciledBtn) {
                        reconciledBtn = doc.querySelector('button[ng-click="rc.ToggleReconciled()"]');
                    }

                    if (reconciledBtn && !reconciledBtn.hasAttribute('disabled')) {
                        // Click the button
                        reconciledBtn.click();

                        // Wait for the angular action to complete
                        setTimeout(() => {
                            // Update UI to reflect new state
                            if (wasReconciled) {
                                button.classList.remove('btn-success');
                                button.classList.add('btn-default');
                                statusSpan.textContent = 'No';
                            } else {
                                button.classList.remove('btn-default');
                                button.classList.add('btn-success');
                                statusSpan.textContent = 'Yes';
                            }

                            button.disabled = false;
                            document.body.removeChild(iframe);
                        }, 1500);
                    } else {
                        statusSpan.textContent = wasReconciled ? 'Yes' : 'No';
                        button.disabled = false;
                        document.body.removeChild(iframe);
                        alert('Cannot toggle reconciled status.');
                    }
                } catch (err) {
                    console.error('Error toggling reconciled:', err);
                    statusSpan.textContent = wasReconciled ? 'Yes' : 'No';
                    button.disabled = false;
                    document.body.removeChild(iframe);
                    alert('Error toggling reconciled status.');
                }
            }, 2000); // Wait 2 seconds for Angular to load
        };
    }

    // Initialize
    function init() {
        const typeSelect = document.getElementById('Type');
        if (!typeSelect) return;

        // Initial check
        updateButtonVisibility();

        // Listen for changes
        typeSelect.addEventListener('change', updateButtonVisibility);
    }

    // Wait for page to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Also check periodically in case the page updates dynamically
    setInterval(updateButtonVisibility, 1000);

})();