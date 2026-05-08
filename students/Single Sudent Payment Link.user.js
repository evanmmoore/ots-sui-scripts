// ==UserScript==
// @name         Single Sudent Payment Link
// @namespace    https://otsystems.net/
// @version      5.4
// @description  Full automation: student dashboard checkbox modal, correct portal/OTS selection, fetch transaction prices via iframe, add line items
// @match        https://otsystems.net/admin/students/dashboard/*
// @match        https://otsystems.net/admin/Utilities/CustomPayment/manage.asp*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /* ---------------- Utilities ---------------- */
    function waitFor(selector, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const t = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(t);
                    resolve(el);
                }
                if (Date.now() - start > timeout) {
                    clearInterval(t);
                    reject(selector);
                }
            }, 300);
        });
    }

    function getScope(el) {
        if (typeof angular === 'undefined') return null;
        let scope = angular.element(el).scope();
        while (scope && !scope.mc && scope.$parent) scope = scope.$parent;
        return scope;
    }

    function setAngularInput(selector, value) {
        const el = document.querySelector(selector);
        if (!el) return;
        const ngModel = angular.element(el).controller('ngModel');
        if (!ngModel) return;
        ngModel.$setViewValue(value);
        ngModel.$render();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function setAngularTextarea(selector, value) {
        const el = document.querySelector(selector);
        if (!el) return;
        const ngModel = angular.element(el).controller('ngModel');
        if (!ngModel) return;
        ngModel.$setViewValue(value);
        ngModel.$render();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /* ---------------- Fetch Training Price via iframe ---------------- */
    async function getTrainingPrice(activityId) {
        return new Promise(resolve => {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = `/admin/students/dashboard/classes/transactions/index.asp?activityId=${activityId}`;
            document.body.appendChild(iframe);

            const start = Date.now();
            const maxWait = 10000;

            const timer = setInterval(() => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc) return;
                    const cell = doc.querySelector('tbody tr td:nth-child(7)');
                    if (cell && cell.textContent.trim().startsWith('$')) {
                        cleanup();
                        resolve(parseFloat(cell.textContent.replace(/[^0-9.]/g, '')) || 0);
                    } else if (Date.now() - start > maxWait) {
                        cleanup();
                        resolve(0);
                    }
                } catch (e) {}
            }, 400);

            function cleanup() {
                clearInterval(timer);
                iframe.remove();
            }
        });
    }

    /* ---------------- Dashboard Page ---------------- */
    if (location.href.includes('/students/dashboard')) {
        setInterval(() => {
            const container = document.querySelector('.col-sm-3');
            if (!container) return;
            if (document.querySelector('.tm-create-payment-checkbox')) return;

            const btn = document.createElement('button');
            btn.textContent = 'Create Payment Link';
            btn.className = 'btn btn-success tm-create-payment-checkbox';
            btn.style.marginLeft = '10px';
            container.appendChild(btn);

            btn.onclick = async () => {
                const header = document.querySelector('.col-sm-8 h4')?.innerText || '';
                const name = header.split('•')[0].trim();
                const accountNumber = header.match(/A#\s*([0-9-]+)/)?.[1] || '';
                const email = document.querySelector('a[href^="mailto:"]')?.innerText || '';

                // Determine portal info
                let isPortalStudent = false;
                let portalName = 'Safety Unlimited';
                document.querySelectorAll('tr').forEach(tr => {
                    if (tr.innerText.includes('Portal Student')) {
                        if (tr.innerText.toLowerCase().includes('yes')) {
                            isPortalStudent = true;
                            const match = tr.innerText.match(/Portal Student\s*:\s*(.+)/i);
                            if (match) portalName = match[1].trim();
                        }
                    }
                });

                // Build class list
                const panels = document.querySelectorAll('.panel.panel-primary, .panel.panel-danger');
                const classes = [];
                const fetchPromises = [];

                for (const panel of panels) {
                    const className = panel.querySelector('h4.m-t-sm')?.innerText.trim();
                    if (!className) continue;

                    let itemNumber = '';
                    panel.querySelectorAll('td.ng-binding').forEach(td => {
                        const m = td.innerText.match(/Item #:\s*([0-9-]+)/);
                        if (m) itemNumber = m[1];
                    });
                    if (!itemNumber) continue;

                    const txLink = panel.querySelector('a[href*="classes/transactions/index.asp"]');
                    if (!txLink) continue;

                    const activityId = new URL(txLink.href, location.origin).searchParams.get('activityId');
                    if (!activityId) continue;

                    fetchPromises.push(
                        getTrainingPrice(activityId).then(price => {
                            classes.push({ className, itemNumber, price });
                        })
                    );
                }

                await Promise.all(fetchPromises);

                if (!classes.length) {
                    alert('No classes found!');
                    return;
                }

                // Checkbox Modal
                const overlay = document.createElement('div');
                overlay.style = `
                    position:fixed;top:0;left:0;width:100%;height:100%;
                    background:rgba(0,0,0,.6);z-index:9999;
                    display:flex;align-items:center;justify-content:center;
                `;

                const box = document.createElement('div');
                box.style = `
                    background:#fff;padding:20px;width:600px;
                    max-height:80%;overflow:auto;border-radius:6px;
                    position:relative;
                `;
                box.innerHTML = `<h4>Select Classes</h4>`;

                const closeBtn = document.createElement('button');
                closeBtn.textContent = 'Close';
                closeBtn.className = 'btn btn-default';
                closeBtn.style = `position:absolute;top:10px;right:10px;cursor:pointer;`;
                closeBtn.onclick = () => document.body.removeChild(overlay);
                box.appendChild(closeBtn);

                classes.forEach((c, i) => {
                    const row = document.createElement('div');
                    row.innerHTML = `
                        <label style="display:block;margin:6px 0">
                            <input type="checkbox" data-i="${i}">
                            ${c.className} | Item # ${c.itemNumber} | $${c.price.toFixed(2)}
                        </label>
                    `;
                    box.appendChild(row);
                });

                const submit = document.createElement('button');
                submit.className = 'btn btn-primary';
                submit.textContent = 'Create Payment';
                submit.style.marginTop = '10px';

                submit.onclick = () => {
                    const selected = [...box.querySelectorAll('input[type="checkbox"]:checked')]
                        .map(cb => classes[cb.dataset.i]);

                    if (!selected.length) {
                        alert('Select at least one class.');
                        return;
                    }

                    GM_setValue('OTS_PAYMENT_DATA', {
                        name,
                        email,
                        accountNumber,
                        portalName,
                        isPortalStudent,
                        classes: selected
                    });

                    document.body.removeChild(overlay);
                    window.location.href =
                        'https://otsystems.net/admin/Utilities/CustomPayment/manage.asp';
                };

                box.appendChild(submit);
                overlay.appendChild(box);
                document.body.appendChild(overlay);
            };
        }, 2000);
    }

    /* ---------------- Custom Payment Page ---------------- */
    if (location.href.includes('/Utilities/CustomPayment/manage.asp')) {
        (async function () {
            const data = GM_getValue('OTS_PAYMENT_DATA');
            if (!data) return;

            const firstInput = await waitFor('input[ng-model="mc.PaymentObj.Request_To"]');

            let scope;
            for (let i = 0; i < 30; i++) {
                scope = getScope(firstInput);
                if (scope && scope.mc) break;
                await new Promise(r => setTimeout(r, 300));
            }
            if (!scope || !scope.mc) return;

            setTimeout(async () => {
                // Select correct portal account
                document.querySelector(data.isPortalStudent ? '#account_ots' : '#account_sui')?.click();

                if (data.isPortalStudent) {
                    const otsRadio = document.querySelector('#account_ots');
                    if (otsRadio) otsRadio.click();

                    // Wait until dropdown exists and affiliate list is ready
                    const waitForAffiliateReady = async () => {
                        let selectEl;
                        for (let i = 0; i < 30; i++) {
                            selectEl = document.querySelector('select[ng-model="mc.PaymentObj.FromPortal"]');
                            if (selectEl && scope.mc.Affilaites && scope.mc.Affilaites.length) break;
                            await new Promise(r => setTimeout(r, 300));
                        }
                        return selectEl;
                    };

                    const affiliateDropdown = await waitForAffiliateReady();
                    if (!affiliateDropdown) {
                        console.error('Affiliate dropdown not found or affiliates not loaded');
                    } else {
                        // Clean portal name (remove Yes/No prefixes)
                        const cleanedPortalName = data.portalName.replace(/^(Yes|No)\s*-\s*/i, '').trim();

                        // Find matching affiliate
                        const affiliate = scope.mc.Affilaites.find(a =>
                            a.Company_Name.toLowerCase() === cleanedPortalName.toLowerCase()
                        );

                        if (!affiliate) {
                            console.error('Affiliate not found for portalName:', cleanedPortalName);
                        } else {
                            // Update Angular model
                            scope.$apply(() => {
                                scope.mc.PaymentObj.FromPortal = affiliate.Portal_Company_Id;
                            });

                            // Update the select visually
                            for (const option of affiliateDropdown.options) {
                                if (Number(option.value) === affiliate.Portal_Company_Id) {
                                    affiliateDropdown.selectedIndex = option.index;
                                    break;
                                }
                            }

                            // Trigger Angular change detection
                            affiliateDropdown.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }

                setAngularInput('input[ng-model="mc.PaymentObj.Request_To"]', data.name);
                setAngularInput('input[ng-model="mc.PaymentObj.Request_Email_To"]', data.email);
                setAngularTextarea(
                    'textarea[ng-model="mc.PaymentObj.Request_Notes"]',
                    `${data.name} | A# ${data.accountNumber}`
                );

                if (Array.isArray(scope.mc.Portals)) {
                    const portal = scope.mc.Portals.find(p => p.Name.includes(data.portalName));
                    if (portal) {
                        scope.$apply(() => {
                            scope.mc.PaymentObj.PortalID = portal.ID;
                        });
                        document.querySelector('select[ng-model="mc.PaymentObj.PortalID"]')
                            ?.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }

                (await waitFor('button[ng-click="mc.SavePayment()"]')).click();

                // Add all selected classes as line items
                for (const c of data.classes) {
                    const addBtn = await waitFor('button[ng-click="mc.AddLineItem()"]');
                    addBtn.click();

                    await waitFor('textarea[ng-model="mc.AddLineItemObj.Description"]');
                    setAngularTextarea(
                        'textarea[ng-model="mc.AddLineItemObj.Description"]',
                        `${c.className} | Item # ${c.itemNumber}`
                    );

                    const amountInput = document.querySelector('input[ng-model="initialAmount"]');
                    if (amountInput) {
                        const ngModel = angular.element(amountInput).controller('ngModel');
                        ngModel.$setViewValue(c.price);
                        ngModel.$render();
                        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }

                    const saveBtn = document.querySelector('button[ng-click="mc.LineItemSave(mc.AddLineItemObj)"]');
                    if (saveBtn) saveBtn.click();
                }
            }, 1000);
        })();
    }
})();
