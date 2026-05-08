// ==UserScript==
// @name         Safety Unlimited Autofill
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-fills the Safety Unlimited new student registration form
// @author       You
// @match        https://www.safetyunlimited.com/New-Student-Single.asp
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Generate username like evan.moore + 4 random digits
    function generateUsername() {
        const suffix = Math.floor(1000 + Math.random() * 9000);
        return `evan.moore${suffix}`;
    }

    // Set a native <input> or <select> value and fire React/framework-compatible events
    function setNativeValue(el, value) {
        try {
            const proto = el.tagName === 'SELECT'
                ? window.HTMLSelectElement.prototype
                : window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            nativeSetter.call(el, value);
        } catch (e) {
            el.value = value;
        }
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur',   { bubbles: true }));
    }

    function setCheckbox(id, checked) {
        const el = document.getElementById(id);
        if (el && el.type === 'checkbox') {
            el.checked = checked;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function autofill() {
        const username = generateUsername();

        const fields = {
            account_registrant: 'Myself',
            first_name:         'Evan',
            middle_initial:     '',
            last_name:          'Moore',
            name_suffix:        '',
            address1:           '2139 Tapo Street Suite 228',
            address2:           '',
            city:               'Simi Valley',
            country:            'US',
            zip:                '93063',
            email:              'Evan.moore89@gmail.com',
            verify_email:       'Evan.moore89@gmail.com',
            add_email:          '',
            organization:       'self',
            username:           username,
            password:           'safe1234',
            language:           'English',
        };

        for (const [id, value] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (el) setNativeValue(el, value);
        }

        // Country fires dynamic state list — wait then set state
        setTimeout(() => {
            const stateEl = document.getElementById('state');
            if (stateEl) setNativeValue(stateEl, 'CA');
        }, 350);

        // Phone number
        const phoneEl = document.getElementById('phone');
        if (phoneEl) {
            setNativeValue(phoneEl, '8055551234');
            try {
                const iti = window.intlTelInputGlobals && window.intlTelInputGlobals.getInstance(phoneEl);
                if (iti) {
                    iti.setNumber('+18055551234');
                    const fullPhone = document.getElementById('phone_full');
                    const phoneCC   = document.getElementById('phone_country');
                    const dialCode  = document.getElementById('phone_dial_code');
                    if (fullPhone) fullPhone.value = iti.getNumber();
                    if (phoneCC)   phoneCC.value   = iti.getSelectedCountryData().iso2;
                    if (dialCode)  dialCode.value  = iti.getSelectedCountryData().dialCode;
                }
            } catch (e) {}
        }

        setCheckbox('reminderemails', true);
        setCheckbox('specialoffers',  false);
        setCheckbox('safetymatters',  false);
        setCheckbox('emsmatters',     false);
        setCheckbox('terms',          true);

        const hearabout = document.getElementById('hearabout');
        if (hearabout) setNativeValue(hearabout, '21'); // Decline to Answer

        console.log(`[Autofill] Done! Username: ${username}`);
        showToast(`✅ Form filled!  Username: ${username}`);
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        Object.assign(toast.style, {
            position:     'fixed',
            bottom:       '90px',
            right:        '24px',
            background:   '#1a1a2e',
            color:        '#00e5ff',
            padding:      '12px 20px',
            borderRadius: '10px',
            fontFamily:   'monospace',
            fontSize:     '13px',
            zIndex:       '99999',
            boxShadow:    '0 4px 20px rgba(0,229,255,0.3)',
            border:       '1px solid rgba(0,229,255,0.4)',
            opacity:      '1',
            transition:   'opacity 0.5s ease',
        });
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 3000);
        setTimeout(() => { toast.remove(); }, 3600);
    }

    function injectButton() {
        const btn = document.createElement('button');
        btn.textContent = '⚡ Autofill';
        btn.type = 'button';
        Object.assign(btn.style, {
            position:      'fixed',
            bottom:        '24px',
            left:          '50%',
            transform:     'translateX(-50%)',
            zIndex:        '99999',
            padding:       '12px 22px',
            background:    'linear-gradient(135deg, #0f3460, #1a1a2e)',
            color:         '#00e5ff',
            border:        '1px solid rgba(0,229,255,0.5)',
            borderRadius:  '50px',
            fontFamily:    'monospace',
            fontSize:      '14px',
            fontWeight:    'bold',
            cursor:        'pointer',
            boxShadow:     '0 4px 20px rgba(0,229,255,0.25)',
            transition:    'all 0.2s ease',
            letterSpacing: '0.5px',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'translateX(-50%) scale(1.06)';
            btn.style.boxShadow = '0 6px 28px rgba(0,229,255,0.5), 0 0 0 4px rgba(0,229,255,0.15)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translateX(-50%)';
            btn.style.boxShadow = '0 4px 20px rgba(0,229,255,0.25)';
        });
        btn.addEventListener('click', autofill);
        document.body.appendChild(btn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButton);
    } else {
        injectButton();
    }

})();