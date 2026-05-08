// ==UserScript==
// @name         EMS Support - Combined Tool (AHA + NREMT + Offsite)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Combined EMS support tool with AHA Training, NREMT, and Offsite Training Form
// @author       You
// @match        https://*.otsystems.net/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function createEl(tag, text, cls) {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (cls) el.className = cls;
        return el;
    }

    const style = document.createElement('style');
    style.textContent = `
        .ems-modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.55); z-index:10000; display:flex; justify-content:center; align-items:center; }
        .ems-modal { background:#fff; border-radius:10px; padding:18px; width:520px; max-height:86%; overflow-y:auto; position:relative; font-family: Arial, Helvetica, sans-serif; box-shadow:0 8px 30px rgba(0,0,0,0.3); }
        .ems-modal h4 { margin:0 0 10px 0; text-align:center; font-size:18px; }
        .ems-modal p { margin:8px 0; line-height:1.35; }
        .ems-option { display:block; width:100%; padding:10px; margin:6px 0; border:none; border-radius:6px; cursor:pointer; background:#007bff; color:#fff; font-weight:600; text-align:left; }
        .ems-option:hover { background:#0056b3; }
        .ems-option.green { background:#28a745; }
        .ems-option.green:hover { background:#218838; }
        .ems-option.red { background:#d9534f; }
        .ems-option.red:hover { background:#c9302c; }
        .ems-back { display:inline-block; margin-top:10px; padding:8px 12px; border-radius:6px; border:none; cursor:pointer; background:#6c757d; color:#fff; font-weight:600; }
        .ems-back:hover { background:#565e63; }
        .ems-close { display:inline-block; margin-top:10px; padding:8px 12px; border-radius:6px; border:none; cursor:pointer; background:#d9534f; color:#fff; font-weight:600; }
        .ems-close:hover { background:#c9302c; }
        .ems-link { color:#007bff; text-decoration:underline; cursor:pointer; display:block; margin:6px 0; }
        .ems-small { font-size:13px; color:#444; margin-top:6px; }
        .ems-footer { margin-top:12px; text-align:center; font-size:13px; color:#666; }
    `;
    document.head.appendChild(style);

    const COURSE_URLS = {
        // BLS
        "BLS_PROVIDER": "https://ems.safetyunlimited.com/aha-cpr/aha-basic-life-support-cpr.asp",
        "BLS_RENEWAL": "https://ems.safetyunlimited.com/aha-cpr/aha-basic-life-support-cpr-renewal.asp",
        "BLS_SKILLS": "https://ems.safetyunlimited.com/course-overview.asp?cid=403",
        "HEARTCODE_BLS": "https://ems.safetyunlimited.com/aha-cpr/aha-heartcode-bls-online.asp",
        // ACLS
        "ACLS_INITIAL": "https://ems.safetyunlimited.com/aha-cpr/aha-advanced-cardiac-life-support.asp",
        "ACLS_RENEWAL": "https://ems.safetyunlimited.com/aha-cpr/aha-acls-renewal.asp",
        "ACLS_SKILLS": "https://ems.safetyunlimited.com/course-overview.asp?cid=554",
        // PALS
        "PALS_INITIAL": "https://ems.safetyunlimited.com/aha-cpr/aha-pediatric-advanced-life-support.asp",
        "PALS_RENEWAL": "https://ems.safetyunlimited.com/aha-cpr/aha-pals-renewal.asp",
        "PALS_SKILLS": "https://ems.safetyunlimited.com/course-overview.asp?cid=555",
        // Heartsaver
        "HEARTSAVER_CPR": "https://ems.safetyunlimited.com/aha-cpr/heartsaver-cpr-aed.asp",
        "HEARTSAVER_FIRST_AID": "https://ems.safetyunlimited.com/aha-cpr/heartsaver-first-aid.asp",
        "HEARTSAVER_FIRST_AID_CPR": "https://ems.safetyunlimited.com/aha-cpr/heartsaver-first-aid-cpr.asp",
        "HEARTSAVER_PEDS_CPR_AED": "https://ems.safetyunlimited.com/aha-cpr/heartsaver-pediatric-first-aid-cpr-aed.asp",
        // Instructor
        "INSTRUCTOR_BLS_EXCL": "https://ems.safetyunlimited.com/aha-cpr/instructor-course-excl.asp",
        "INSTRUCTOR_BLS_FULL": "https://ems.safetyunlimited.com/aha-cpr/instructor-course-full.asp"
    };

    function createMainModal() {
        const overlay = createEl('div');
        overlay.className = 'ems-modal-overlay';

        const modal = createEl('div');
        modal.className = 'ems-modal';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        return { overlay, modal };
    }

    // ==================== MAIN MENU ====================
    function showMainMenu(overlay, modal) {
        modal.innerHTML = '';
        modal.appendChild(createEl('h4', 'EMS Support Tools'));
        modal.appendChild(createEl('p', 'Select a tool:'));

        const ahaBtn = createEl('button', 'AHA Training Decision Tree', 'ems-option red');
        ahaBtn.onclick = () => startAHATree(overlay, modal);
        modal.appendChild(ahaBtn);

        const nremtBtn = createEl('button', 'NREMT Decision Tree', 'ems-option green');
        nremtBtn.onclick = () => startNREMTTree(overlay, modal);
        modal.appendChild(nremtBtn);

        const offsiteBtn = createEl('button', 'Offsite Training Form', 'ems-option');
        offsiteBtn.onclick = () => showOffsiteForm(overlay, modal);
        modal.appendChild(offsiteBtn);

        const closeBtn = createEl('button', 'Close', 'ems-close');
        closeBtn.onclick = () => overlay.remove();
        closeBtn.style.display = 'block';
        closeBtn.style.margin = '10px auto 0';
        modal.appendChild(closeBtn);
    }

    // ==================== AHA TRAINING TREE ====================
    function startAHATree(overlay, modal) {
        const history = [];

        function showStep(stepFunc) {
            modal.innerHTML = '';
            modal.appendChild(createEl('h4', 'AHA Training — Which course do you need?'));

            const stepEl = stepFunc();
            modal.appendChild(stepEl);

            const btnContainer = createEl('div');
            btnContainer.style.marginTop = '12px';
            btnContainer.style.textAlign = 'center';

            const back = createEl('button', 'Back', 'ems-back');
            back.style.marginRight = '8px';
            back.disabled = history.length === 0;
            back.onclick = () => {
                if(history.length === 0) return;
                const prev = history.pop();
                showStep(prev);
            };
            btnContainer.appendChild(back);

            const mainMenu = createEl('button', 'Main Menu', 'ems-back');
            mainMenu.style.marginRight = '8px';
            mainMenu.onclick = () => showMainMenu(overlay, modal);
            btnContainer.appendChild(mainMenu);

            const close = createEl('button', 'Close', 'ems-close');
            close.onclick = () => overlay.remove();
            btnContainer.appendChild(close);

            modal.appendChild(btnContainer);
        }

        function stepLocation() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Where are you located?'));

            const nearby = createEl('button', 'Within reasonable distance of our office', 'ems-option');
            nearby.onclick = () => { history.push(stepLocation); showStep(stepWho); };

            const far = createEl('button', 'Too far', 'ems-option');
            far.onclick = () => {
                container.innerHTML = '';
                container.appendChild(createEl('p', 'Since you are too far from our office, we recommend using the AHA Class Finder.'));
                const link = createEl('a', 'Open AHA Class Finder', 'ems-link');
                link.href = 'https://atlas.heart.org';
                link.target = '_blank';
                container.appendChild(link);
            };

            container.appendChild(nearby);
            container.appendChild(far);
            return container;
        }

        function stepWho() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Who is taking the training?'));

            function createDesc(text) {
                const desc = createEl('p', text, 'ems-small');
                desc.style.marginTop = '4px';
                desc.style.marginBottom = '10px';
                desc.style.paddingLeft = '12px';
                desc.style.color = '#555';
                return desc;
            }

            const btn1 = createEl('button', 'Healthcare Provider (clinical role)', 'ems-option');
            btn1.onclick = () => { history.push(stepWho); showStep(stepHealthcareLevel); };
            container.appendChild(btn1);
            container.appendChild(createDesc('Examples: Nurses, EMTs, Paramedics, Physicians, Therapists, or anyone providing patient care in a clinical setting.'));

            const btn2 = createEl('button', 'Non-Healthcare (workplace/general public)', 'ems-option');
            btn2.onclick = () => { history.push(stepWho); showStep(stepNonHealthcare); };
            container.appendChild(btn2);
            container.appendChild(createDesc('Examples: Office workers, teachers, construction workers, or anyone seeking CPR/First Aid training for workplace safety or personal knowledge.'));

            const btn3 = createEl('button', 'Instructor / Want to become an Instructor', 'ems-option');
            btn3.onclick = () => { history.push(stepWho); showStep(stepInstructor); };
            container.appendChild(btn3);
            container.appendChild(createDesc('Individuals interested in teaching AHA courses or becoming certified instructors.'));

            const hubLink = createEl('a', 'Open AHA Course Page', 'ems-link');
            hubLink.href = 'https://ems.safetyunlimited.com/aha-cpr/';
            hubLink.target = '_blank';
            container.appendChild(hubLink);

            return container;
        }

        function stepHealthcareLevel() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Select the type of healthcare training:'));

            const blsBtn = createEl('button', 'BLS (Basic Life Support)', 'ems-option');
            blsBtn.onclick = () => { history.push(stepHealthcareLevel); showStep(() => stepCertificateStatus('BLS')); };

            const aclsBtn = createEl('button', 'ACLS (Advanced Cardiac Life Support)', 'ems-option');
            aclsBtn.onclick = () => { history.push(stepHealthcareLevel); showStep(() => stepCertificateStatus('ACLS')); };

            const palsBtn = createEl('button', 'PALS (Pediatric Advanced Life Support)', 'ems-option');
            palsBtn.onclick = () => { history.push(stepHealthcareLevel); showStep(() => stepCertificateStatus('PALS')); };

            container.appendChild(blsBtn);
            container.appendChild(aclsBtn);
            container.appendChild(palsBtn);

            return container;
        }

        function stepCertificateStatus(trainingType) {
            const container = createEl('div');
            container.appendChild(createEl('p', `Is your ${trainingType} certificate current or lapsed?`));

            const info = createEl('p', 'Certificates expire 2 years later at the end of the month. If expired, initial course is required. No renewal for Heartsaver.', 'ems-small');
            container.appendChild(info);

            const currentBtn = createEl('button', 'Current Certificate', 'ems-option');
            currentBtn.onclick = () => {
                history.push(() => stepCertificateStatus(trainingType));
                if (trainingType === 'BLS') showStep(stepBLS);
                else if (trainingType === 'ACLS') showStep(stepACLS);
                else if (trainingType === 'PALS') showStep(stepPALS);
            };
            container.appendChild(currentBtn);

            const lapsedBtn = createEl('button', 'Lapsed / Expired', 'ems-option');
            lapsedBtn.onclick = () => {
                history.push(() => stepCertificateStatus(trainingType));
                if (trainingType === 'BLS') showStep(stepBLSInitial);
                else if (trainingType === 'ACLS') showStep(stepACLSInitial);
                else if (trainingType === 'PALS') showStep(stepPALSInitial);
            };
            container.appendChild(lapsedBtn);

            return container;
        }

        function stepBLSInitial() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'BLS Initial courses:'));

            const provider = createEl('a', 'BLS Provider', 'ems-link');
            provider.href = COURSE_URLS.BLS_PROVIDER;
            provider.target = '_blank';
            container.appendChild(provider);

            const heartcode = createEl('a', 'HeartCode BLS Online', 'ems-link');
            heartcode.href = COURSE_URLS.HEARTCODE_BLS;
            heartcode.target = '_blank';
            container.appendChild(heartcode);

            return container;
        }

        function stepBLS() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'BLS Renewal options:'));

            const renewal = createEl('a', 'BLS Renewal', 'ems-link');
            renewal.href = COURSE_URLS.BLS_RENEWAL;
            renewal.target = '_blank';
            container.appendChild(renewal);

            const skills = createEl('a', 'BLS Skills Session', 'ems-link');
            skills.href = COURSE_URLS.BLS_SKILLS;
            skills.target = '_blank';
            container.appendChild(skills);

            const heartcode = createEl('a', 'HeartCode BLS Online', 'ems-link');
            heartcode.href = COURSE_URLS.HEARTCODE_BLS;
            heartcode.target = '_blank';
            container.appendChild(heartcode);

            return container;
        }

        function stepACLSInitial() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'ACLS Initial course:'));

            const acls = createEl('a', 'ACLS Initial', 'ems-link');
            acls.href = COURSE_URLS.ACLS_INITIAL;
            acls.target = '_blank';
            container.appendChild(acls);

            return container;
        }

        function stepACLS() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'ACLS Renewal options:'));

            const renewal = createEl('a', 'ACLS Renewal', 'ems-link');
            renewal.href = COURSE_URLS.ACLS_RENEWAL;
            renewal.target = '_blank';
            container.appendChild(renewal);

            const skills = createEl('a', 'ACLS Skills Session', 'ems-link');
            skills.href = COURSE_URLS.ACLS_SKILLS;
            skills.target = '_blank';
            container.appendChild(skills);

            return container;
        }

        function stepPALSInitial() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'PALS Initial course:'));

            const pals = createEl('a', 'PALS Initial', 'ems-link');
            pals.href = COURSE_URLS.PALS_INITIAL;
            pals.target = '_blank';
            container.appendChild(pals);

            return container;
        }

        function stepPALS() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'PALS Renewal options:'));

            const renewal = createEl('a', 'PALS Renewal', 'ems-link');
            renewal.href = COURSE_URLS.PALS_RENEWAL;
            renewal.target = '_blank';
            container.appendChild(renewal);

            const skills = createEl('a', 'PALS Skills Session', 'ems-link');
            skills.href = COURSE_URLS.PALS_SKILLS;
            skills.target = '_blank';
            container.appendChild(skills);

            return container;
        }

        function stepNonHealthcare() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Select the type of non-healthcare course:'));

            const hsGeneral = createEl('button', 'Heartsaver (Workplace CPR/First Aid)', 'ems-option');
            hsGeneral.onclick = () => { history.push(stepNonHealthcare); showStep(stepHeartsaverGeneral); };
            container.appendChild(hsGeneral);

            const hsTitle22 = createEl('button', 'Title 22 – Pediatric First Aid CPR AED', 'ems-option');
            hsTitle22.onclick = () => { history.push(stepNonHealthcare); showStep(stepHeartsaverTitle22); };
            container.appendChild(hsTitle22);

            const desc = createEl('p',
                                  'Title 22 applies to teachers, preschool teachers, childcare workers, daycare staff, after-school program staff, foster parents, and school bus drivers.',
                                  'ems-small'
                                 );
            desc.style.marginTop = '8px';
            container.appendChild(desc);

            return container;
        }

        function stepHeartsaverGeneral() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Standard Heartsaver (Adult Workplace) Courses:'));

            const hsCpr = createEl('a', 'Heartsaver CPR AED', 'ems-link');
            hsCpr.href = COURSE_URLS.HEARTSAVER_CPR;
            hsCpr.target = '_blank';
            container.appendChild(hsCpr);

            const hsFirstAid = createEl('a', 'Heartsaver First Aid', 'ems-link');
            hsFirstAid.href = COURSE_URLS.HEARTSAVER_FIRST_AID;
            hsFirstAid.target = '_blank';
            container.appendChild(hsFirstAid);

            const combo = createEl('a', 'Heartsaver First Aid + CPR AED', 'ems-link');
            combo.href = COURSE_URLS.HEARTSAVER_FIRST_AID_CPR;
            combo.target = '_blank';
            container.appendChild(combo);

            return container;
        }

        function stepHeartsaverTitle22() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Pediatric / Title 22 Courses:'));

            const peds = createEl('a', 'Heartsaver Pediatric First Aid CPR AED (Title 22)', 'ems-link');
            peds.href = COURSE_URLS.HEARTSAVER_PEDS_CPR_AED;
            peds.target = '_blank';
            container.appendChild(peds);

            const note = createEl('p',
                                  'Required for: Teachers, preschool/daycare staff, childcare workers, after-school program staff, foster parents, and school bus drivers.',
                                  'ems-small'
                                 );
            container.appendChild(note);

            return container;
        }

        function stepInstructor() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Instructor courses:'));

            const blsInstructor = createEl('a', 'BLS Instructor Courses', 'ems-link');
            blsInstructor.href = COURSE_URLS.INSTRUCTOR_BLS_FULL;
            blsInstructor.target = '_blank';
            container.appendChild(blsInstructor);

            return container;
        }

        showStep(stepLocation);
    }

    // ==================== NREMT TREE ====================
    function startNREMTTree(overlay, modal) {
        let history = [];
        let userCertType = '';
        let userHasCE = false;
        let userState = '';

        function showStep(contentFunc) {
            modal.innerHTML = '';
            const title = createEl('h4', 'NREMT & EMS Certification Decision Tree');
            modal.appendChild(title);

            const content = contentFunc();
            modal.appendChild(content);

            const btnContainer = createEl('div');
            btnContainer.style.marginTop = '12px';
            btnContainer.style.textAlign = 'center';

            if (history.length > 0) {
                const backBtn = createEl('button', 'Back', 'ems-back');
                backBtn.style.marginRight = '8px';
                backBtn.onclick = () => {
                    const last = history.pop();
                    showStep(last);
                };
                btnContainer.appendChild(backBtn);
            }

            const mainMenu = createEl('button', 'Main Menu', 'ems-back');
            mainMenu.style.marginRight = '8px';
            mainMenu.onclick = () => showMainMenu(overlay, modal);
            btnContainer.appendChild(mainMenu);

            const close = createEl('button', 'Close', 'ems-close');
            close.onclick = () => overlay.remove();
            btnContainer.appendChild(close);

            modal.appendChild(btnContainer);
        }

        // Step 1: Are you currently certified?
        function step1() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Are you currently certified (non-expired) with NREMT?'));

            const yesBtn = createEl('button', 'Yes', 'ems-option');
            yesBtn.onclick = () => {
                history.push(step1);
                showStep(stepStateCertified);
            };

            const noBtn = createEl('button', 'No (expired / never certified)', 'ems-option');
            noBtn.onclick = () => {
                history.push(step1);
                showStep(stepStateCertified);
            };

            container.appendChild(yesBtn);
            container.appendChild(noBtn);

            return container;
        }

        // Step 2: Are you State Certified?
        function stepStateCertified() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Are you State Certified?'));

            const yesBtn = createEl('button', 'Yes', 'ems-option');
            yesBtn.onclick = () => {
                history.push(stepStateCertified);
                showStep(stepStateSelector); // ask which state
            };

            const noBtn = createEl('button', 'No', 'ems-option');
            noBtn.onclick = () => {
                userState = "OTHER";
                history.push(stepStateCertified);
                showStep(stepCEQuestion); // continue with CE question
            };

            container.appendChild(yesBtn);
            container.appendChild(noBtn);

            return container;
        }

        // Step 3: Which state?
        function stepStateSelector() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Which state are you certified in?'));

            const input = createEl('input');
            input.type = 'text';
            input.placeholder = 'e.g., CA';
            input.style = 'margin:5px 0; padding:5px; width:100%';

            const submit = createEl('button', 'Submit', 'ems-option');
            submit.onclick = () => {
                userState = input.value.trim().toUpperCase() || "OTHER";
                history.push(stepStateSelector);
                showStep(stepCEQuestion); // continue with CE question
            };

            container.appendChild(input);
            container.appendChild(submit);

            return container;
        }

        // Step 4: CE Question
        function stepCEQuestion() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Have you completed any CEs this recertification cycle?'));

            const yesBtn = createEl('button', 'Yes', 'ems-option');
            yesBtn.onclick = () => {
                userHasCE = true;
                history.push(stepCEQuestion);
                showStep(stepRefresherLevelSelector);
            };

            const noBtn = createEl('button', 'No', 'ems-option');
            noBtn.onclick = () => {
                userHasCE = false;
                history.push(stepCEQuestion);
                showStep(stepRefresherLevelSelector);
            };

            container.appendChild(yesBtn);
            container.appendChild(noBtn);

            return container;
        }

        // Step 5: Level selector
        function stepRefresherLevelSelector() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Which level are you?'));

            let levels;

            if (userState === "CA") {
                // Only CA levels
                levels = [
                    { level: 'EMT', func: () => showStep(() => stepRefresherOptions('EMT')) },
                    { level: 'NRP', func: () => showStep(() => stepRefresherOptions('NRP')) }
                ];
            } else {
                levels = [
                    { level: 'EMR', func: () => showStep(() => stepRefresherOptions('EMR')) },
                    { level: 'EMT', func: () => showStep(() => stepRefresherOptions('EMT')) },
                    { level: 'AEMT', func: () => showStep(() => stepRefresherOptions('AEMT')) },
                    { level: 'NRP', func: () => showStep(() => stepRefresherOptions('NRP')) }
                ];
            }

            levels.forEach(l => {
                const btn = createEl('button', l.level, 'ems-option');
                btn.onclick = l.func;
                container.appendChild(btn);
            });

            return container;
        }

        // Step 6: Refresher options
        function stepRefresherOptions(selectedLevel) {
            const container = createEl('div');

            const courseData = {
                EMR: {
                    links: [
                        { text: '16 HR (F3) All Components', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Responder.asp#f3allcomponents' },
                        { text: '8 HR (F3) National Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Responder.asp#f3national' },
                        { text: '4 HR (F3) State/Local Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Responder.asp#f3state' },
                        { text: '4 HR (F3) Individual Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Responder.asp#f3individual' }
                    ]
                },
                EMT: {
                    links: [
                        { text: '40 HR (F3) All Components', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Technician.asp#All40Hour' },
                        { text: '20 HR (F3) National Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Technician.asp#National20Hour' },
                        { text: '10 HR (F3) State/Local Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Technician.asp#f3state' },
                        { text: '10 HR (F3) Individual Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Technician.asp#f3individual' }
                    ]
                },
                AEMT: {
                    links: [
                        { text: '50 HR (F3) All Components', url: 'https://ems.safetyunlimited.com/nremt-nccp/Advanced-Emergency-Medical-Technician.asp#f3allcomponents' },
                        { text: '25 HR (F3) National Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Advanced-Emergency-Medical-Technician.asp#f3national' },
                        { text: '12.5 HR (F3) State/Local Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Advanced-Emergency-Medical-Technician.asp#f3state' },
                        { text: '12.5 HR (F3) Individual Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Advanced-Emergency-Medical-Technician.asp#f3individual' }
                    ]
                },
                NRP: {
                    links: [
                        { text: '60 HR (F3) All Components', url: 'https://ems.safetyunlimited.com/nremt-nccp/Nationally-Registered-Paramedic.asp#f3allcomponents' },
                        { text: '30 HR (F3) National Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Nationally-Registered-Paramedic.asp#f3national' },
                        { text: '15 HR (F3) State/Local Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Nationally-Registered-Paramedic.asp#f3state' },
                        { text: '15 HR (F3) Individual Component', url: 'https://ems.safetyunlimited.com/nremt-nccp/Nationally-Registered-Paramedic.asp#f3individual' }
                    ]
                }
            };

            const c = courseData[selectedLevel];

            container.appendChild(createEl('p', `${selectedLevel} Recommended Options:`));

            c.links.forEach(link => {
                const a = createEl('a', link.text, 'ems-link');
                a.href = link.url;
                a.target = '_blank';
                container.appendChild(a);
            });

            // California mandatory course
            if (userState === "CA") {
                const caCourse = createEl('a', 'Mandatory Naloxone, Epinephrine, and Glucometer Training (Mandatory Scope of Practice)', 'ems-link');
                caCourse.href = 'https://ems.safetyunlimited.com/ems-ce/mandatory-naloxone-epinephrine-glucometer-training-online.asp';
                caCourse.target = '_blank';
                container.appendChild(caCourse);
            }

            return container;
        }

        // Step 7: Expired / never certified (unchanged)
        function stepExpired() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'For expired / never certified:'));

            const yearInputDiv = createEl('div');
            yearInputDiv.innerHTML = '<strong>Enter the year your certification expires (if known, otherwise current year):</strong><br>';

            const input = createEl('input');
            input.type = 'number';
            input.min = 2000;
            input.max = 2100;
            input.style = 'margin:5px 0; padding:5px; width:100%';
            input.placeholder = 'e.g., 2026';

            const submit = createEl('button', 'Submit', 'ems-option');
            submit.onclick = () => {
                const year = parseInt(input.value) || new Date().getFullYear();
                history.push(stepExpired);
                showStep(() => stepExpiredDecision(year));
            };

            yearInputDiv.appendChild(input);
            yearInputDiv.appendChild(submit);
            container.appendChild(yearInputDiv);

            return container;
        }

        function stepExpiredDecision(year) {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Select your status:'));

            const options = [
                { text: 'State Certified? Yes → Apply for NREMT', action: () => showStep(stepContact) },
                { text: 'State Certified? No → Initial Training Required', action: () => showStep(stepContact) },
                { text: 'Failed NREMT 3 times → Initial Training Required', action: () => showStep(stepContact) },
                { text: 'Never had EMS Certification', action: () => showStep(stepContact) }
            ];

            options.forEach(o => {
                const btn = createEl('button', o.text, 'ems-option');
                btn.onclick = o.action;
                container.appendChild(btn);
            });

            return container;
        }

        // Step 8: Contact page
        function stepContact() {
            const container = createEl('div');
            container.appendChild(createEl('p', 'Contact for additional assistance:'));
            container.appendChild(createEl('p', 'Call our EMS Team: 888-309-7233 X333'));

            const links = [
                'https://ems.safetyunlimited.com/nremt',
                'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Responder.asp#tab2',
                'https://ems.safetyunlimited.com/nremt-nccp/Emergency-Medical-Technician.asp#tab2',
                'https://ems.safetyunlimited.com/nremt-nccp/Advanced-Emergency-Medical-Technician.asp#tab2',
                'https://ems.safetyunlimited.com/nremt-nccp/Nationally-Registered-Paramedic.asp#tab2'
            ];

            links.forEach(l => {
                const a = createEl('a', l, 'ems-link');
                a.href = l;
                a.target = '_blank';
                container.appendChild(a);
            });

            return container;
        }

        showStep(step1);
    }

    // ==================== OFFSITE TRAINING FORM ====================
    function showOffsiteForm(overlay, modal) {
        modal.innerHTML = '';
        modal.appendChild(createEl('h4', 'OFF SITE TRAINING FORM'));

        const form = document.createElement('form');
        form.style.marginTop = '10px';

        const fields = [
            { label: 'EXACT NAME OF CLASS:', name: 'className', type: 'text' },
            { label: 'SITE CONTACT NAME:', name: 'contactName', type: 'text' },
            { label: 'SITE CONTACT PHONE #:', name: 'contactPhone', type: 'text' },
            { label: 'ADDRESS OF CLASS:', name: 'address', type: 'text' },
            { label: 'CLASS TIMES:', name: 'classTimes', type: 'text' },
            { label: 'AUDIO/VISUAL EQUIPMENT NEEDED:', name: 'avEquipment', type: 'text' },
            { label: 'NUMBER OF STUDENTS:', name: 'numStudents', type: 'number' },
            { label: 'TRAINING EQUIPMENT NEEDED:', name: 'trainingEquipment', type: 'text' },
            { label: 'PAYMENT TYPE:', name: 'paymentType', type: 'text' },
            { label: 'SUI CONTACT PERSON:', name: 'suiContact', type: 'text' },
            { label: 'NOTES:', name: 'notes', type: 'textarea' },
            { label: 'COMPLETED BY:', name: 'completedBy', type: 'text' },
            { label: 'DATE:', name: 'date', type: 'date' }
        ];

        fields.forEach(field => {
            const label = document.createElement('label');
            label.textContent = field.label;
            label.style.display = 'block';
            label.style.marginTop = '8px';
            label.style.fontWeight = 'bold';
            form.appendChild(label);

            let input;
            if (field.type === 'textarea') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else {
                input = document.createElement('input');
                input.type = field.type;
            }
            input.name = field.name;
            input.style.width = '100%';
            input.style.padding = '6px';
            input.style.marginTop = '4px';
            input.style.borderRadius = '4px';
            input.style.border = '1px solid #ccc';
            form.appendChild(input);
        });

        const btnContainer = createEl('div');
        btnContainer.style.marginTop = '15px';
        btnContainer.style.textAlign = 'center';

        const submitBtn = createEl('button', 'Submit', 'ems-option');
        submitBtn.type = 'submit';
        submitBtn.style.display = 'inline-block';
        submitBtn.style.width = 'auto';
        submitBtn.style.marginRight = '8px';
        btnContainer.appendChild(submitBtn);

        const mainMenuBtn = createEl('button', 'Main Menu', 'ems-back');
        mainMenuBtn.type = 'button';
        mainMenuBtn.style.marginRight = '8px';
        mainMenuBtn.onclick = () => showMainMenu(overlay, modal);
        btnContainer.appendChild(mainMenuBtn);

        const cancelBtn = createEl('button', 'Close', 'ems-close');
        cancelBtn.type = 'button';
        cancelBtn.onclick = () => overlay.remove();
        btnContainer.appendChild(cancelBtn);

        form.appendChild(btnContainer);

        form.onsubmit = (e) => {
            e.preventDefault();
            const fd = new FormData(form);

            // ----- FORMAT DATE -----
            const rawDate = fd.get('date');
            let formattedDate = "";
            if (rawDate) {
                const dateObj = new Date(rawDate);
                formattedDate = dateObj.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }

            // Bold Unicode labels (supported in Outlook)
            const bodyRaw =
                  `𝗘𝗫𝗔𝗖𝗧 𝗡𝗔𝗠𝗘 𝗢𝗙 𝗖𝗟𝗔𝗦𝗦: ${fd.get('className')}\r\n` +
                  `𝗦𝗜𝗧𝗘 𝗖𝗢𝗡𝗧𝗔𝗖𝗧 𝗡𝗔𝗠𝗘: ${fd.get('contactName')}\r\n` +
                  `𝗦𝗜𝗧𝗘 𝗖𝗢𝗡𝗧𝗔𝗖𝗧 𝗣𝗛𝗢𝗡𝗘 #: ${fd.get('contactPhone')}\r\n` +
                  `𝗔𝗗𝗗𝗥𝗘𝗦𝗦 𝗢𝗙 𝗖𝗟𝗔𝗦𝗦: ${fd.get('address')}\r\n` +
                  `𝗖𝗟𝗔𝗦𝗦 𝗧𝗜𝗠𝗘𝗦: ${fd.get('classTimes')}\r\n` +
                  `𝗔𝗨𝗗𝗜𝗢/𝗩𝗜𝗦𝗨𝗔𝗟 𝗘𝗤𝗨𝗜𝗣𝗠𝗘𝗡𝗧 𝗡𝗘𝗘𝗗𝗘𝗗: ${fd.get('avEquipment')}\r\n` +
                  `𝗡𝗨𝗠𝗕𝗘𝗥 𝗢𝗙 𝗦𝗧𝗨𝗗𝗘𝗡𝗧𝗦: ${fd.get('numStudents')}\r\n` +
                  `𝗧𝗥𝗔𝗜𝗡𝗜𝗡𝗚 𝗘𝗤𝗨𝗜𝗣𝗠𝗘𝗡𝗧 𝗡𝗘𝗘𝗗𝗘𝗗: ${fd.get('trainingEquipment')}\r\n` +
                  `𝗣𝗔𝗬𝗠𝗘𝗡𝗧 𝗧𝗬𝗣𝗘: ${fd.get('paymentType')}\r\n` +
                  `𝗦𝗨𝗜 𝗖𝗢𝗡𝗧𝗔𝗖𝗧 𝗣𝗘𝗥𝗦𝗢𝗡: ${fd.get('suiContact')}\r\n` +
                  `𝗡𝗢𝗧𝗘𝗦: ${fd.get('notes')}\r\n` +
                  `𝗖𝗢𝗠𝗣𝗟𝗘𝗧𝗘𝗗 𝗕𝗬: ${fd.get('completedBy')}\r\n` +
                  `𝗗𝗔𝗧𝗘: ${formattedDate}`;

            const subject = encodeURIComponent("Offsite Training Form Submission");
            const body = encodeURIComponent(bodyRaw);

            window.location.href =
                `mailto:mkomis@safetyunlimited.com,ems@safetyunlimited.com?subject=${subject}&body=${body}`;

            overlay.remove();
        };

        modal.appendChild(form);
    }

    // ==================== ADD BUTTON TO PAGE ====================
    function addMainMenuButton() {
        // Try multiple ways to find the CAPCE link
        const capceMenu = Array.from(document.querySelectorAll('a.mega-grandchild')).find(a => {
            const text = a.textContent || a.innerText || '';
            return text.trim().toUpperCase().includes('CAPCE');
        });

        if (!capceMenu) {
            console.log('CAPCE menu not found yet');
            return;
        }

        // Check if button already exists
        if (document.querySelector('#ems-support-tools-btn')) {
            console.log('Button already exists');
            return;
        }

        console.log('Adding EMS Support Tools button');

        const mainBtn = createEl('a', 'EMS Support Tools', 'mega-grandchild');
        mainBtn.id = 'ems-support-tools-btn';
        mainBtn.style.color = '#000000';
        mainBtn.style.fontWeight = 'bold';
        mainBtn.style.display = 'block';
        mainBtn.style.marginTop = '6px';
        mainBtn.href = '#';

        mainBtn.onclick = (e) => {
            e.preventDefault();
            if (!document.querySelector('.ems-modal-overlay')) {
                const { overlay, modal } = createMainModal();
                showMainMenu(overlay, modal);
            }
        };

        // Insert directly after CAPCE link
        capceMenu.parentNode.insertBefore(mainBtn, capceMenu.nextSibling);
        console.log('Button added successfully');
    }

    // Try both on load and with observer
    window.addEventListener('load', () => {
        setTimeout(addMainMenuButton, 500);
        setTimeout(addMainMenuButton, 1000);
        setTimeout(addMainMenuButton, 2000);
    });

    const observer = new MutationObserver(() => {
        if (document.querySelector('a.mega-grandchild')) {
            addMainMenuButton();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})()