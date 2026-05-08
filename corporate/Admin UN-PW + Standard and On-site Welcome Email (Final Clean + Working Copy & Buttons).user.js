// ==UserScript==
// @name         Admin UN/PW + Standard and On-site Welcome Email (Final Clean + Working Copy & Buttons)
// @namespace    https://otsystems.net/admin/*
// @version      4.6.3
// @description  Admin UN/PW popup, Welcome Email popup (Standard + On-site), with full HTML copy + button alignment fix
// @match        https://otsystems.net/admin/corporate/manage_administrators.asp**
// @match        https://www.otsystems.net/admin/corporate/manage_administrators.asp?id=*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- HELPERS ----------
  const getOrgId = () => new URL(window.location.href).searchParams.get('id');
  const getCorpUrlFromHeader = () => document.querySelector('h4 a')?.href || "https://www.safetyunlimited.com/safetyunlimited";

  async function fetchOrgSettings(orgId) {
    if (!orgId) return null;
    try {
      const resp = await fetch(`/admin/corporate/org_master_edit.asp?id=${orgId}`, { credentials: 'include' });
      const text = await resp.text();

      const paymentTypeMatch = text.match(/<select[^>]*name="payment_type"[^>]*>[\s\S]*?<option[^>]*value="([^"]+)"[^>]*selected/i);
      const paymentType = paymentTypeMatch ? paymentTypeMatch[1].toLowerCase() : 'creditcard';

      const newStudentAccessMatch = text.match(/name="NewStudentAccessActive"[^>]*value="([^"]*)"/i);
      const newStudentAccessActive = newStudentAccessMatch ? newStudentAccessMatch[1].toLowerCase() === 'true' : false;

      const accessCodeMatch = text.match(/name="Student_Password"[^>]*value="([^"]*)"/i);
      const accessCode = accessCodeMatch ? accessCodeMatch[1] : '';

      return { paymentType, newStudentAccessActive, accessCode };
    } catch (err) {
      console.error("Error fetching org settings:", err);
      return null;
    }
  }

  // ---------- POPUP CREATION ----------
  function createPopup(name, email, password, corpUrl, orgId) {
    document.getElementById('custom-admin-modal')?.remove();

    const sectionStyle = 'font-weight:bold; font-family:Tahoma, sans-serif; margin-top:10px;';
    const line = (text) => `<div style="margin-bottom:4px;">${text}</div>`;

    fetchOrgSettings(orgId).then(orgSettings => {
      const isSafetyUnlimited = corpUrl.includes("safetyunlimited.com");

      // Billing text
      let billingText = `Currently, your account is set for payment via credit card at the time of course enrollment.<br><br>
                         Need invoicing? Email us to set up corporate billing.`;
      if (orgSettings?.paymentType === 'invoice') {
        billingText = `Your account is currently set to invoice, and you will receive a bill at the beginning of the month for the students you enrolled in the previous month.`;
      }

      // Student Access
      let studentAccessHtml = '';
      if (orgSettings?.newStudentAccessActive && orgSettings.accessCode) {
        studentAccessHtml = `
          <br>
          <div style="font-weight:bold; font-family:Tahoma, sans-serif;">Let Employees Create Accounts</div>
          <div>Give them this info:</div>
          <div>Access Code: ${orgSettings.accessCode}</div>
          <div>Student Login Page: <a href="${corpUrl}" target="_blank">${corpUrl}</a></div>
          <div>Choose "New Students (Setup New Account)"</div><br>
          <div><em>Note: If employees already have an account, email us to link it to your corporate account.</em></div>
        `;
      }

      // ---------- EMAIL TEMPLATES ----------
      const standardWelcomeHtml = `
        ${line(`Hi ${name},`)}<br>
        ${line(`Thank you for submitting your Corporate Account Setup Form! Your ${isSafetyUnlimited
          ? 'Safety Unlimited, Inc.'
          : corpUrl.match(/^https?:\/\/([^\.]+)\.otsystems/)[1].replace(/^./, c => c.toUpperCase())
        } corporate account is now active.`)}<br>

        <div style="${sectionStyle}">Admin Login Area</div>
        ${line(`Login Area: <a href="${corpUrl}" target="_blank">${corpUrl}</a>`)}
        ${line(`Email: ${email}`)}
        ${line(`Password: ${password}`)}<br>

        <div style="${sectionStyle}">Admin Tools</div>
        <ul style="margin-top:0;">
          <li>Add/remove Admins and Students</li>
          <li>Enroll students in training</li>
          <li>Run reports</li>
          <li>View completion certificates</li>
          <li>Update organization info</li>
          <li>Reset student login credentials</li>
        </ul><br>

        <div style="${sectionStyle}">Adding Students</div>
        ${line(`Create accounts yourself: Go to "Student Management → Add a Student" on your admin dashboard. Add one at a time or use the Multiple Student Enrollment form.  If you are scheduled for classroom training at your site, we can add your students to your account after the classroom training.`)}
        ${studentAccessHtml}<br>

        <div style="${sectionStyle}">Course Enrollment Options</div>
        ${line(`Once your students are set up in your account, you can now enroll them in the training you desire. Your courses are currently set to the enrollment method you selected (Admin Only or Both Admin & Student) on your initial setup request.`)}<br>
        ${line(`You can update this anytime via "Organization Setup → Class Management" or email us, and we’ll make the change for you.`)}<br>
        ${line(`Want to add more courses? Just let us know!`)}<br>

        <div style="${sectionStyle}">Billing</div>
        ${line(billingText)}<br>

        ${isSafetyUnlimited ? `<div style="${sectionStyle}">W-9 Form</div>${line('<a href="https://www.safetyunlimited.com/w9" target="_blank">https://www.safetyunlimited.com/w9</a>')}<br>` : ''}

        <div style="${sectionStyle}">Customer Support & Customization</div>
        ${line(`Send us your company logo to display on your Corporate Home Page.`)}<br>
        ${line(`Contact: ${isSafetyUnlimited ? 'info@safetyunlimited.com' : 'info@otsystems.net'} or call ${isSafetyUnlimited ? '888-309-SAFE (7233)' : '800-680-3789'}`)}<br>
        ${line(`We’re excited to support your training needs. Welcome aboard!`)}
      `;

      const adminUnPwHtml = `
        ${line(`Hello ${name},`)}<br>
        ${line(`Here is your admin login information:`)}<br>
        ${line(`<b>Login Area:</b> <a href="${corpUrl}" target="_blank">${corpUrl}</a>`)}
        ${line(`<b>Email:</b> ${email}`)}
        ${line(`<b>Password:</b> ${password}`)}
      `;

      const onSiteHtml = `
        ${line(`Hello ${name},`)}<br>
        ${line(`We received your Corporate Account Setup Form for your upcoming on-site training. We look forward to working with you.`)}<br>
        ${line(`Below is some helpful information regarding your new corporate account, including your administrative login information.`)}<br>
        <div style="${sectionStyle}">Admin Login Area</div>
        ${line(`Login Area: <a href="${corpUrl}" target="_blank">${corpUrl}</a>`)}
        ${line(`Email: ${email}`)}
        ${line(`Password: ${password}`)}<br>
        ${line(`As a Corporate Administrator you can add other Administrators, add students to your account, enroll students in training, reset student passwords, terminate students, and update your organizational information. You can also reset your Administrator password and update Administrator account information.`)}<br>
        ${line(`At this time, you do not need to worry about enrolling students in the on-site training course. We will enroll students based on their class attendance and according to the daily class roster.`)}<br>
        ${line(`You do have the option to create student accounts for your employees prior to the on-site training or we can create their accounts for you. If you choose to create student accounts yourself, you would do this through your admin dashboard under “Student Management → Add a Student”. You can either add students one at a time or use our Multiple Student Enrollment form.`)}<br>
        ${line(`If you have a company logo, please send it to ${isSafetyUnlimited ? 'info@safetyunlimited.com' : 'info@otsystems.net'} and we will display it on your Corporate Home Page.`)}<br>
        ${line(`If you have any other questions feel free to contact us at ${isSafetyUnlimited ? 'info@safetyunlimited.com or 888-309-SAFE (7233)' : 'info@otsystems.net or 800-680-3789'}.`)}<br>
        ${line(`Thank you and have a wonderful day!`)}
      `;

      // ---------- POPUP HTML ----------
      const html = `
        <div id="custom-admin-modal" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:flex-start; padding-top:40px; z-index:9999;">
          <div style="background:white; border-radius:8px; max-width:750px; width:90%; max-height:90vh; overflow:hidden; font-family:Tahoma, sans-serif; font-size:14px; position:relative; box-shadow:0 0 15px rgba(0,0,0,0.4);">
            <div style="display:flex; align-items:center; border-bottom:1px solid #ccc;">
              <div id="tab-welcome" style="flex:1; text-align:center; padding:6px 8px; cursor:pointer; background:#265a88; color:#fff; font-weight:bold; font-size:13px;">Welcome Email</div>
              <div id="tab-unpw" style="flex:1; text-align:center; padding:6px 8px; cursor:pointer; background:#f0f0f0; font-size:13px;">Admin UN/PW</div>
              <div id="tab-onsite" style="flex:1; text-align:center; padding:6px 8px; cursor:pointer; background:#f0f0f0; font-size:13px;">On-Site Email</div>
              <button id="close-popup-btn" style="margin-right:5px; font-size:20px; background:none; border:none; cursor:pointer;">&times;</button>
            </div>
            <div id="tab-content" style="padding:10px 20px; overflow-y:auto; max-height:calc(90vh - 80px);">${standardWelcomeHtml}</div>
            <div style="text-align:right; padding:10px 20px; border-top:1px solid #ccc;">
              <button id="copy-tab-btn" style="padding:6px 12px; font-size:13px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">📋 Copy</button>
            </div>
          </div>
        </div>`;

      document.body.insertAdjacentHTML('beforeend', html);

      const contentDiv = document.getElementById('tab-content');
      const tabs = {
        welcome: document.getElementById('tab-welcome'),
        unpw: document.getElementById('tab-unpw'),
        onsite: document.getElementById('tab-onsite')
      };

      function activateTab(key) {
        Object.keys(tabs).forEach(k => {
          tabs[k].style.background = "#f0f0f0";
          tabs[k].style.color = "#000";
          tabs[k].style.fontWeight = "normal";
        });
        tabs[key].style.background = "#265a88";
        tabs[key].style.color = "#fff";
        tabs[key].style.fontWeight = "bold";
        contentDiv.innerHTML = key === 'welcome' ? standardWelcomeHtml : key === 'unpw' ? adminUnPwHtml : onSiteHtml;
      }

      Object.entries(tabs).forEach(([k, el]) => el.onclick = () => activateTab(k));
      document.getElementById('close-popup-btn').onclick = () => document.getElementById('custom-admin-modal').remove();

      // ✅ FIXED COPY FUNCTION (PRESERVES HTML FORMATTING)
      document.getElementById('copy-tab-btn').onclick = async () => {
        try {
          const htmlContent = contentDiv.innerHTML;
          const textContent = contentDiv.innerText;

          const blobHtml = new Blob([htmlContent], { type: "text/html" });
          const blobText = new Blob([textContent], { type: "text/plain" });

          await navigator.clipboard.write([
            new ClipboardItem({
              "text/html": blobHtml,
              "text/plain": blobText
            })
          ]);

          alert("Copied to clipboard! Formatting (bold, links, spacing) is preserved.");
        } catch (err) {
          console.error("Copy failed:", err);
          alert("Copy failed — check console.");
        }
      };
    });
  }

  // ---------- ADD BUTTONS ----------
  function addPopupButtonsToRows() {
    const table = document.querySelector('table.table');
    if (!table) return;

    table.querySelectorAll('tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 9) return;

      const name = cells[0].innerText.trim();
      const email = cells[3].innerText.trim();
      const password = Array.from(cells[4].childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent.trim()).join('');

      const actionsCell = cells[8];
      if (actionsCell.querySelector('.show-admin-info-btn')) return;

      const corpUrl = getCorpUrlFromHeader();
      const orgId = getOrgId();

      const popupBtn = document.createElement('button');
      popupBtn.textContent = 'Admin Info';
      popupBtn.className = 'show-admin-info-btn';
      Object.assign(popupBtn.style, {
        marginLeft: '4px',
        height: '34px',
        padding: '4px 8px',
        fontSize: '12px',
        background: '#28a745',
        border: 'none',
        color: 'white',
        borderRadius: '4px',
        cursor: 'pointer',
        verticalAlign: 'middle'
      });
      popupBtn.onclick = () => createPopup(name, email, password, corpUrl, orgId);

      // ✅ Insert so it fits cleanly with existing action buttons
      actionsCell.style.whiteSpace = 'nowrap';
      actionsCell.appendChild(popupBtn);
    });
  }

  const observer = new MutationObserver(addPopupButtonsToRows);
  window.addEventListener('load', addPopupButtonsToRows);
  observer.observe(document.body, { childList: true, subtree: true });

})();
