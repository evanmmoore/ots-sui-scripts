// ==UserScript==
// @name         Auto Add Course + Save Warning + Refresh + Price Note (Keep)
// @namespace    https://otsystems.net/
// @version      1.5
// @description  Auto Add Course button, auto Choose, auto-close modal after Save with warning popup, then refresh page. Also adds a custom note next to the price field.
// @match        https://otsystems.net/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ------------------- Add New (Add Course) Button -------------------
    function addNewCourseButton() {
        const historyBtn = document.querySelector('button[ng-click="clc.ViewHistory()"]');
        if (!historyBtn) return setTimeout(addNewCourseButton, 500);

        if (document.getElementById('newAddCourseBtn')) return;

        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'btn btn-success';
        newBtn.id = 'newAddCourseBtn';
        newBtn.style.marginLeft = '10px';
        newBtn.textContent = '(New) Add Course';

        newBtn.onclick = () => {
            const plusLink = document.querySelector('a[ng-click="clc.ManageCatalogEntry()"]');
            if (plusLink) {
                plusLink.click();

                const tryChooseButton = () => {
                    const chooseBtn = document.querySelector('button[ng-click="mcmc.SelectCatalog()"]');
                    if (chooseBtn) {
                        chooseBtn.click();
                    } else {
                        setTimeout(tryChooseButton, 300);
                    }
                };
                setTimeout(tryChooseButton, 300);
            } else {
                alert('Cannot find the + link to add a course.');
            }
        };

        historyBtn.parentNode.insertBefore(newBtn, historyBtn.nextSibling);
    }
    addNewCourseButton();

    // ------------------- Auto-Close Modal with Warning and Refresh -------------------
    function monitorSaveButton() {
        const observer = new MutationObserver(() => {
            const saveBtn = document.querySelector(
                'button.btn-success[ng-click="mcmc.Save()"]'
            );
            const cancelBtn = document.querySelector(
                'button.btn-default[ng-click="mcmc.Cancel()"]'
            );

            if (saveBtn && cancelBtn) {
                if (!saveBtn.dataset.autoClose) {
                    saveBtn.dataset.autoClose = 'true';
                    saveBtn.addEventListener('click', () => {
                        setTimeout(() => {
                            // Show warning popup
                            alert('⚠️ Heads Up! Using this tool? Make sure to note the corporate account. Events won’t trigger automatically - IT setup is still in progress.');

                            // Close the modal
                            cancelBtn.click();

                            // Refresh the page
                            location.reload();
                        }, 300); // slight delay to let save process
                    });
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }
    monitorSaveButton();

    // ------------------- Add Custom Note Next to Price Field -------------------
    function addNoteNextToPrice() {
        const observer = new MutationObserver(() => {
            const priceInput = document.querySelector('input[ng-model="mcmc.CatalogObj.price"]');
            if (priceInput) {
                // Check if note is already added
                if (document.getElementById('customPriceNote')) return;

                const parent = priceInput.closest('.input-group');

                // Create the note span
                const note = document.createElement('span');
                note.id = 'customPriceNote';
                note.textContent = '💡 Note: Check corporate pricing policy.';
                note.style.marginLeft = '10px';
                note.style.color = '#d9534f'; // Bootstrap "danger" color
                note.style.fontWeight = 'bold';
                note.style.fontSize = '13px';

                parent.parentElement.appendChild(note); // Add after the .input-group container
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }
    addNoteNextToPrice();

})();
