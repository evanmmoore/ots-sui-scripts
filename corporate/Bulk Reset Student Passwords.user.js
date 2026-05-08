// ==UserScript==
// @name         Bulk Reset Student Passwords
// @namespace    https://otsystems.net/
// @version      1.0
// @description  Bulk reset student passwords from the admin emailer page
// @match        https://otsystems.net/admin/tools/emailer/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Wait for Angular + DOM
    function waitForElement(selector, callback) {
        const el = document.querySelector(selector);
        if (el) return callback(el);
        setTimeout(() => waitForElement(selector, callback), 500);
    }

    waitForElement('input[ng-model="ec.ResetPasswordObj.Username"]', (input) => {
        const container = input.closest('.alert');

        // Build UI
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '10px';

        wrapper.innerHTML = `
            <hr>
            <h6>Bulk Reset</h6>
            <textarea class="form-control" rows="5"
                placeholder="Enter student numbers (one per line or comma-separated)"></textarea>
            <br>
            <button class="btn btn-danger">Send Bulk Reset</button>
            <small style="display:block;margin-top:5px;color:#666;">
                Sends one request every 1.5 seconds
            </small>
        `;

        container.appendChild(wrapper);

        const textarea = wrapper.querySelector('textarea');
        const button = wrapper.querySelector('button');

        // Get Angular scope
        const scope = angular.element(input).scope();
        const ec = scope.ec;

        async function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        button.addEventListener('click', async () => {
            let users = textarea.value
                .split(/[\n,]+/)
                .map(u => u.trim())
                .filter(Boolean);

            if (!users.length) {
                alert('No student numbers entered.');
                return;
            }

            button.disabled = true;
            button.innerText = 'Sending...';

            for (let username of users) {
                console.log('Resetting password for:', username);

                ec.ResetPasswordObj.Username = username;
                scope.$apply();

                ec.ResetPassword();

                // delay to avoid rate limits / race conditions
                await sleep(1500);
            }

            button.innerText = 'Done!';
            setTimeout(() => {
                button.disabled = false;
                button.innerText = 'Send Bulk Reset';
            }, 2000);
        });

        console.log('Bulk Reset UI injected');
    });
})();
