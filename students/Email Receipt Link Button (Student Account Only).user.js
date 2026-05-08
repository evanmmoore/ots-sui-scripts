// ==UserScript==
// @name         📧 Email Receipt Link Button (Student Account Only)
// @namespace    https://otsystems.net/
// @version      1.9
// @description  Adds an email button next to receipt links inside expanded class rows in the student dashboard, plain text email body
// @match        https://otsystems.net/admin/students/dashboard/?student_number=*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function getStudentFirstName() {
    const header = document.querySelector('.col-sm-8.col-md-8.col-lg-9 h4');
    if (header) {
      const text = header.textContent.trim();
      const namePart = text.split('•')[0].trim();
      return namePart.split(/\s+/)[0]; // first name only
    }
    return 'Student';
  }

  function injectEmailButton(receiptLink) {
    if (!receiptLink || receiptLink.parentElement.querySelector('.email-receipt-btn')) return;

    const emailBtn = document.createElement('a');
    emailBtn.href = 'javascript:void(0)';
    emailBtn.className = 'btn btn-info btn-sm email-receipt-btn';
    emailBtn.title = 'Email Receipt';
    emailBtn.style.marginRight = '6px';
    emailBtn.innerHTML = '<i class="fa fa-envelope-o"></i>';

    receiptLink.parentElement.insertBefore(emailBtn, receiptLink);

    emailBtn.addEventListener('click', () => {
      const receiptUrl = receiptLink.href;

      let className = 'Class';
      let h4 = receiptLink.closest('.panel')?.querySelector('h4.m-t-sm.ng-binding');
      if (h4 && h4.textContent.trim()) {
        className = h4.textContent.replace(/\s+/g, ' ').trim();
      }

      const firstName = getStudentFirstName();

      // Plain text email body with proper line breaks
      const bodyText = `Hello ${firstName},\n\nHere is a link to your ${className} receipt:\n${receiptUrl}`;

      const subject = encodeURIComponent(`${className} Receipt`);
      const body = encodeURIComponent(bodyText);

      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const receiptLinks = node.querySelectorAll?.('a[href*="print_receipt.asp"]');
        receiptLinks?.forEach(injectEmailButton);
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  document.querySelectorAll('a[href*="print_receipt.asp"]').forEach(injectEmailButton);

})();
