// ==UserScript==
// @name         Student Receipt Autofill
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Paste transaction data to autofill the Add Receipt form on otsystems.net
// @author       You
// @match        https://otsystems.net/admin/students/dashboard/classes/receipt/*
// @match        https://otsystems.net/admin/students/dashboard/classes/transactions/index.asp*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ── Wait for Angular to be ready ──────────────────────────────────────────
    function waitForAngular(cb, attempts) {
        attempts = attempts || 0;
        if (attempts > 60) return;
        if (window.angular && angular.element(document.body).injector()) {
            cb();
        } else {
            setTimeout(function () { waitForAngular(cb, attempts + 1); }, 500);
        }
    }

    // ── Parse raw pasted text into structured fields ──────────────────────────
    // Handles the label-per-line format:
    //   Transaction ID\n121472027619\nOID\n42317613342218-145710\n...
    function parseTransaction(raw) {
        var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

        // Get the line immediately after a matching label line
        function getAfter(label) {
            for (var i = 0; i < lines.length - 1; i++) {
                if (lines[i] === label) return lines[i + 1];
            }
            return '';
        }

        var transactionId = getAfter('Transaction ID');
        var oid           = getAfter('OID');
        var paymentDate   = getAfter('Payment Date');
        var amount        = (getAfter('Grand Total') || getAfter('Total Price') || getAfter('Sub Total')).replace('$', '');
        var paymentType   = getAfter('Transaction Type'); // "creditcard"

        // Card line: "(Visa) ...4096"
        var cardType = '', last4 = '';
        var cardLine = getAfter('Card');
        var cm = cardLine.match(/\((.+?)\)\s*\.+(\d{4})/);
        if (cm) { cardType = cm[1]; last4 = cm[2]; }

        // Billing address: label line is "Billing Address",
        // value line is "Billing Address 1914 125TH AVE NW WATFORD CITY, ND 58854"
        // (the label repeats at the start of the value line)
        var address = '', city = '', state = '', zip = '';
        var billingLine = '';
        for (var i = 0; i < lines.length; i++) {
            if (lines[i] === 'Billing Address' && i + 1 < lines.length) {
                var next = lines[i + 1];
                // Strip the repeated "Billing Address " prefix if present
                billingLine = next.replace(/^Billing Address\s+/i, '').trim();
                break;
            }
        }

        if (billingLine) {
            // Split "1914 125TH AVE NW WATFORD CITY, ND 58854"
            // Anchor on ", ST ZIP" at the end
            var locM = billingLine.match(/^(.+),\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
            if (locM) {
                var pre = locM[1]; // "1914 125TH AVE NW WATFORD CITY"
                state   = locM[2];
                zip     = locM[3];
                // Split address from city using last street suffix
                var suffixMatch = pre.match(/^(.*\b(?:AVE|ST|RD|BLVD|DR|LN|CT|NW|NE|SW|SE|HWY|WAY|PL|TER|CIR|LOOP|PKWY|SQ|FWY)\b)(.*)$/i);
                if (suffixMatch) {
                    address = suffixMatch[1].trim();
                    city    = suffixMatch[2].trim();
                } else {
                    // fallback: first 3 tokens = address, rest = city
                    var parts = pre.split(/\s+/);
                    address = parts.slice(0, 3).join(' ');
                    city    = parts.slice(3).join(' ');
                }
            }
        }

        // Cardholder name — not always in pasted data; leave blank if missing
        // (the page already shows the student name separately)
        var cardholderName = '';
        for (var i = 0; i < lines.length; i++) {
            if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(lines[i])) {
                cardholderName = lines[i]; break;
            }
        }

        return {
            oid:            oid,
            transactionId:  transactionId,
            paymentDate:    paymentDate,
            amount:         amount,
            cardholderName: cardholderName,
            address:        address,
            address2:       '',
            city:           city,
            state:          state,
            zip:            zip,
            paymentType:    paymentType || (cardType ? 'creditcard' : ''),
            cardType:       cardType,
            last4:          last4
        };
    }

    // ── Fill the form ─────────────────────────────────────────────────────────
    // Console testing proved the working pattern:
    // 1. One single $apply for ALL fields (multiple $apply calls cause digest conflicts)
    // 2. Plain .click() on the radio AFTER $apply completes
    // 3. Set CardType + Last4 via angular.element triggerHandler AFTER a delay
    function fillForm(d) {
        var scope = angular.element(document.body).scope();
        if (!scope || !scope.rc || !scope.rc.TransactionObj) return;
        var txObj = scope.rc.TransactionObj;

        // Step 1: set all plain fields in ONE batched $apply
        scope.$apply(function () {
            if (d.oid)            txObj.OID            = d.oid;
            if (d.transactionId)  txObj.TransactionId  = d.transactionId;
            if (d.amount)         txObj.Amount         = parseFloat(d.amount);
            if (d.cardholderName) txObj.CardholderName = d.cardholderName;
            if (d.address)        txObj.Address        = d.address;
            if (d.address2)       txObj.Address2       = d.address2;
            if (d.city)           txObj.City           = d.city;
            if (d.state)          txObj.State          = d.state;
            if (d.zip)            txObj.Zip            = d.zip;
            if (d.paymentDate) {
                var dt = new Date(d.paymentDate);
                if (!isNaN(dt))   txObj.PaymentDate    = dt;
            }
        });

        // Step 2: click the radio AFTER $apply is done ($$phase is null)
        if (d.paymentType) {
            var ccRadio = document.querySelector(
                'input[name="inlineRadioOptions"][value="' + d.paymentType + '"]'
            );
            if (ccRadio) ccRadio.click();
        }

        // Step 3: wait for ng-show digest, then set CardType + Last4
        setTimeout(function () {
            if (d.cardType) {
                var sel = document.getElementById('CardType');
                if (sel) {
                    sel.value = d.cardType;
                    angular.element(sel).triggerHandler('change');
                }
            }
            if (d.last4) {
                var last4El = document.getElementById('Last4');
                if (last4El) {
                    last4El.value = d.last4;
                    angular.element(last4El).triggerHandler('input');
                }
            }
        }, 400);
    }

    // ── Inject "Fill from Clipboard" button next to the Add Receipt heading ─────
    function buildUI() {
        var heading = null;
        var allH4 = document.querySelectorAll('h4');
        for (var i = 0; i < allH4.length; i++) {
            if (allH4[i].textContent.trim() === 'Add Receipt') {
                heading = allH4[i];
                break;
            }
        }
        if (!heading || document.getElementById('tm-fill-btn')) return;

        // Wrap h4 in a flex container so button sits inline with it
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:0;';
        heading.parentNode.insertBefore(wrapper, heading);
        wrapper.appendChild(heading);

        var fillBtn = document.createElement('button');
        fillBtn.id = 'tm-fill-btn';
        fillBtn.className = 'btn btn-info btn-sm';
        fillBtn.type = 'button';
        fillBtn.textContent = 'Fill from Clipboard';

        var msgEl = document.createElement('span');
        msgEl.id = 'tm-fill-msg';
        msgEl.style.cssText = 'font-size:12px;display:none;';

        wrapper.appendChild(fillBtn);
        wrapper.appendChild(msgEl);

        fillBtn.addEventListener('click', function() {
            navigator.clipboard.readText().then(function(text) {
                if (!text.trim()) {
                    showMsg('Clipboard is empty — copy a transaction first.', 'red');
                    return;
                }
                var d = parseTransaction(text.trim());
                if (!d.transactionId && !d.oid) {
                    showMsg('No transaction data found in clipboard.', 'red');
                    return;
                }
                fillForm(d);
                showMsg('Form filled!', 'green');
            }).catch(function() {
                showMsg('Could not read clipboard — try copying again.', 'red');
            });
        });

        function showMsg(msg, color) {
            msgEl.textContent = msg;
            msgEl.style.color = color === 'green' ? '#1a7a1a' : '#c0392b';
            msgEl.style.display = 'inline';
            setTimeout(function() { msgEl.style.display = 'none'; }, 4000);
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // TRANSACTIONS PAGE — inject a "Copy" button next to the Close button
    // ════════════════════════════════════════════════════════════════════════════

    function getTextAfterLabel(labelText) {
        // Find a .control-label whose text matches, then get the sibling .form-text
        var labels = document.querySelectorAll('.control-label');
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].textContent.trim().replace(/\s+/g,' ').indexOf(labelText) === 0) {
                var row = labels[i].closest('.form-group');
                if (row) {
                    var val = row.querySelector('.form-text, .ng-binding');
                    if (val) return val.textContent.trim().replace(/\s+/g,' ');
                }
            }
        }
        return '';
    }

    function buildCopyText() {
        // Pull every labelled field from the page DOM
        var fields = [
            'System ID', 'Added', 'Status Code', 'Is Paid?',
            'Sub Total', 'Total Price', 'Grand Total',
            'Payment Date', 'Is Refund?', 'Transaction ID', 'OID',
            'Transaction Type', 'Card'
        ];
        var lines = [];
        fields.forEach(function(f) {
            var val = getTextAfterLabel(f);
            if (val) lines.push(f + '\n' + val);
        });

        // Billing address needs special handling — it's multi-line
        var billingLabels = document.querySelectorAll('.control-label');
        for (var i = 0; i < billingLabels.length; i++) {
            if (billingLabels[i].textContent.trim() === 'Billing Address') {
                var row = billingLabels[i].closest('.form-group');
                if (row) {
                    var div = row.querySelector('.ng-binding');
                    if (div) {
                        // Get innerText to preserve line breaks, collapse whitespace
                        var raw = (div.innerText || div.textContent)
                            .split('\n')
                            .map(function(l){ return l.trim(); })
                            .filter(function(l){ return l && l !== 'Billing Address'; })
                            .join(' ');
                        // Combine onto one line: "1914 125TH AVE NW WATFORD CITY, ND 58854"
                        // innerText gives us separate lines; join them
                        var rawLines = (div.innerText || div.textContent)
                            .split('\n')
                            .map(function(l){ return l.trim(); })
                            .filter(function(l){ return l && l !== 'Billing Address'; });
                        // rawLines = ["Billing Address", "1914 125TH AVE NW", "WATFORD CITY, ND 58854"]
                        // Already filtered "Billing Address" out above
                        var addrLine = rawLines.join(' ').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
                        lines.push('Billing Address\nBilling Address ' + addrLine);
                    }
                }
                break;
            }
        }

        return lines.join('\n');
    }

    function injectCopyButton() {
        // Already injected or Close button not in DOM yet — bail
        var closeBtn = document.querySelector('.well.well-sm button[ng-click="vtmc.Close()"]');
        if (!closeBtn || document.getElementById('tm-copy-btn')) return;

        var copyBtn = document.createElement('button');
        copyBtn.id = 'tm-copy-btn';
        copyBtn.className = 'btn btn-info';
        copyBtn.type = 'button';
        copyBtn.style.marginLeft = '6px';
        copyBtn.textContent = 'Copy for Receipt';

        copyBtn.addEventListener('click', function() {
            var text = buildCopyText();
            if (!text) {
                alert('Could not read transaction data.');
                return;
            }
            // Warn about OID before copying
            var confirmed = confirm(
                'If you are adding a second (or additional) receipt to a course, ' +
                'make sure you use the ORIGINAL OID (Order ID) from the very first receipt — ' +
                'not a new one.\n\nClick OK to copy the transaction data.'
            );
            if (!confirmed) return;
            navigator.clipboard.writeText(text).then(function() {
                copyBtn.textContent = 'Copied!';
                copyBtn.classList.remove('btn-info');
                copyBtn.classList.add('btn-success');
                setTimeout(function() {
                    copyBtn.textContent = 'Copy for Receipt';
                    copyBtn.classList.remove('btn-success');
                    copyBtn.classList.add('btn-info');
                }, 2500);
            }).catch(function() {
                var ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                copyBtn.textContent = 'Copied!';
                setTimeout(function() { copyBtn.textContent = 'Copy for Receipt'; }, 2500);
            });
        });

        closeBtn.parentNode.insertBefore(copyBtn, closeBtn.nextSibling);
    }

    // ── Route: run the right logic depending on which page we're on ───────────
    if (window.location.href.indexOf('/transactions/') !== -1) {
        // Transactions page — Angular scope is unavailable here, so skip waitForAngular.
        // Just watch the DOM directly for the Close button to appear.
        var txObserver = new MutationObserver(function() {
            if (!document.getElementById('tm-copy-btn')) {
                injectCopyButton();
            }
        });
        txObserver.observe(document.body, { childList: true, subtree: true });
        // Also try immediately in case DOM is already ready
        injectCopyButton();
    } else {
        // Receipt page — run the autofill panel
        waitForAngular(buildUI);
    }


})();