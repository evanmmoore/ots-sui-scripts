// ==UserScript==
// @name         Affiliate Class Adder
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds classes one by one, each by reopening the “Add New Class” UI before selecting, to improve reliability. Includes minimize/close.
// @author       You
// @match        https://*.otsystems.net/admin/classes/online/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    function waitForSelector(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const interval = 100;
            let elapsed = 0;
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(timer);
                    resolve(el);
                }
                elapsed += interval;
                if (elapsed >= timeout) {
                    clearInterval(timer);
                    reject(new Error(`Timeout waiting for selector: ${selector}`));
                }
            }, interval);
        });
    }

    function delay(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    function getClassList() {
        try {
            const sel = document.querySelector('select[ng-model="occ.AddClassObj"]');
            const scope = angular.element(sel).scope();
            if (!scope || !scope.occ || !Array.isArray(scope.occ.AllClasses)) {
                console.warn("Angular scope or AllClasses not found.");
                return [];
            }
            const classes = scope.occ.AllClasses.map((cls, idx) => ({
                name: cls.Display_Name,
                index: idx
            })).filter(cls => cls.name && cls.name.trim().length > 0);
            return classes;
        } catch (err) {
            console.error("Failed to get class list from Angular scope:", err);
            return [];
        }
    }

    async function insertButton() {
        try {
            const header = await waitForSelector("h1");
            if (!header.textContent.includes("Class Management")) return;
            const btn = document.createElement("button");
            btn.textContent = "Affiliate Class Adder";
            btn.className = "btn btn-info";
            btn.style.marginLeft = "20px";
            header.parentNode.insertBefore(btn, header.nextSibling);
            btn.addEventListener("click", showPopup);
        } catch (err) {
            console.error("Failed to insert button:", err);
        }
    }

    async function showPopup() {
        // Popup UI creation
        if (document.getElementById("classAdderPopup")) return;

        const popup = document.createElement("div");
        popup.id = "classAdderPopup";
        popup.style.position = "fixed";
        popup.style.top = "100px";
        popup.style.right = "20px";
        popup.style.zIndex = "9999";
        popup.style.background = "#fefefe";
        popup.style.border = "1px solid #ccc";
        popup.style.padding = "10px";
        popup.style.maxHeight = "750px";
        popup.style.overflowY = "auto";
        popup.style.width = "700px";
        popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
        popup.style.fontSize = "14px";
        popup.style.borderRadius = "6px";
        popup.style.fontFamily = "Arial, sans-serif";

        popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="display: flex; gap: 20px; align-items: center;">
                    <label style="margin: 0;">
                        <input type="checkbox" id="selectAllClasses"> Select All
                    </label>
                    <button class="btn btn-success" id="startAddClasses">Start Adding</button>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button id="minimizePopup" class="btn btn-sm btn-default" title="Minimize/Maximize" style="font-weight: bold;">−</button>
                    <button id="closePopup" class="btn btn-sm btn-danger" title="Close">✕</button>
                </div>
            </div>
            <p id="loadingMsg">Loading classes...</p>
            <div id="classCheckboxes" style="display:none;"></div>
        `;

        document.body.appendChild(popup);

        setTimeout(() => {
            const classes = getClassList();
            const chkContainer = popup.querySelector("#classCheckboxes");
            if (!classes.length) {
                document.getElementById("loadingMsg").innerText = "⚠️ No classes found.";
                return;
            }
            document.getElementById("loadingMsg").style.display = "none";
            chkContainer.style.display = "block";
            classes.forEach(cl => {
                const div = document.createElement("div");
                div.style.marginBottom = "6px";
                div.style.whiteSpace = "nowrap";
                div.style.overflow = "hidden";
                div.style.textOverflow = "ellipsis";
                div.innerHTML = `
                    <label style="display: flex; align-items: center;">
                        <input type="checkbox" data-class-name="${cl.name}" style="margin-right: 8px;">
                        <span title="${cl.name}">${cl.name}</span>
                    </label>`;
                chkContainer.appendChild(div);
            });

            popup.querySelector("#selectAllClasses").addEventListener("change", function () {
                const boxes = chkContainer.querySelectorAll("input[type='checkbox']");
                boxes.forEach(cb => cb.checked = this.checked);
            });

            popup.querySelector("#startAddClasses").addEventListener("click", () => {
                const selected = Array.from(chkContainer.querySelectorAll("input[type='checkbox']:checked"))
                    .map(cb => cb.getAttribute("data-class-name"));
                addClassesSequentiallyStrict(selected);
            });

            popup.querySelector("#minimizePopup").addEventListener("click", function () {
                const checkboxSection = document.getElementById("classCheckboxes");
                const loadingMsg = document.getElementById("loadingMsg");
                const isMinimized = checkboxSection.style.display === "none" && loadingMsg.style.display === "none";
                if (isMinimized) {
                    checkboxSection.style.display = "block";
                    loadingMsg.style.display = "block";
                    this.textContent = "−";
                } else {
                    checkboxSection.style.display = "none";
                    loadingMsg.style.display = "none";
                    this.textContent = "+";
                }
            });

            popup.querySelector("#closePopup").addEventListener("click", function () {
                popup.remove();
            });

        }, 250);
    }

    async function addClassesSequentiallyStrict(classNames) {
        for (const name of classNames) {
            console.log("➕ Attempting to add class:", name);
            try {
                // Step 1: open Add New Class UI
                const addBtn = document.querySelector('button[ng-click="occ.AddClass()"]');
                if (!addBtn) {
                    console.warn("Add New Class button not found, skipping:", name);
                    continue;
                }
                addBtn.click();
                await delay(200);

                // Step 2: Wait for dropdown
                await waitForSelector('select[ng-model="occ.AddClassObj"]');

                // Step 3: Select class
                await selectClassFromDropdown(name);

                // Step 4: Wait for price + Add button
                await waitForPriceAndButton();

                // Step 5: Click Add
                await clickAddClass();

                // Step 6: Wait a little before next loop
                await delay(500);

            } catch (err) {
                console.error("⚠️ Error in adding class:", name, err);
            }
        }
        alert("✅ All selected classes processed!");
    }

    function selectClassFromDropdown(className) {
        return new Promise((resolve, reject) => {
            try {
                const sel = document.querySelector('select[ng-model="occ.AddClassObj"]');
                const scope = angular.element(sel).scope();
                const match = scope.occ.AllClasses.find(c => c.Display_Name === className);
                if (!match) {
                    return reject(`Class not found in AllClasses: ${className}`);
                }
                scope.occ.AddClassObj = match;
                scope.occ.AddClassChange();
                scope.$apply();
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    function waitForPriceAndButton() {
        return new Promise((resolve) => {
            const maxRetries = 20;
            let attempts = 0;
            const check = () => {
                const priceInput = document.querySelector('input[ng-model="occ.AddClassObj.Current_Price"]');
                const addBtn = document.querySelector('button[ng-click="occ.AddClassSubmit();"]');
                const btnEnabled = addBtn && !addBtn.disabled;
                const priceFilled = priceInput && priceInput.value !== "";
                if (btnEnabled && priceFilled) {
                    resolve();
                } else if (++attempts > maxRetries) {
                    console.warn("waitForPriceAndButton timed out, proceeding anyway.");
                    resolve();
                } else {
                    setTimeout(check, 150);
                }
            };
            check();
        });
    }

    function clickAddClass() {
        return new Promise((resolve, reject) => {
            try {
                const btn = document.querySelector('button[ng-click="occ.AddClassSubmit();"]');
                if (!btn || btn.disabled) {
                    return reject("Add Class button not ready or disabled.");
                }
                const scope = angular.element(btn).scope();
                if (!scope || !scope.occ || !scope.occ.AddClassSubmit) {
                    return reject("Cannot access AddClassSubmit method.");
                }
                scope.occ.AddClassSubmit();
                scope.$apply();
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    insertButton();

    const observer = new MutationObserver(() => {
        if (!document.querySelector(".btn-info")) {
            insertButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
