// ==UserScript==
// @name         Training Calendar Gooder
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Make the calendar more aesthetically pleasing + color-coded course filters
// @match        https://admin2025.otsystems.net/training/classroom/calendar
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /* ─────────────────────────────────────────────
       COURSE COLOR CATEGORIES
       Each entry maps to a color bucket visible on
       the calendar. Adjust hex/labels as needed.
    ───────────────────────────────────────────── */
    const CATEGORIES = [
        {
            id: 'emt_initial',
            label: 'EMT Initial',
            color: '#60e460',
            textColor: '#000',
            keywords: ['EMT Initial', 'Fast-track EMT', 'Weekend Warrior EMT', 'After Hours EMT', 'Remote.*EMT'],
        },
        {
            id: 'emr',
            label: 'EMR',
            color: '#0a42ec',
            textColor: '#fff',
            keywords: ['Emergency Medical Responder', 'EMR'],
        },
        {
            id: 'bls_cpr',
            label: 'BLS / CPR',
            color: '#a5132d',
            textColor: '#fff',
            keywords: ['Basic Life Support', 'BLS', 'CPR', 'Heartsaver'],
        },
        {
            id: 'psfa',
            label: 'Public Safety First Aid',
            color: '#026c9a',
            textColor: '#fff',
            keywords: ['Public Safety First Aid', 'PSFA', 'First Aid Renewal'],
        },
        {
            id: 'hazmat',
            label: 'Hazmat / OSHA',
            color: '#207709',
            textColor: '#fff',
            keywords: ['Hazardous Materials', 'Hazmat', 'HAZWOPER', 'FRO', 'FRA', 'OSHA', 'Incidental', 'DOT Hazmat', 'IATA'],
        },
        {
            id: 'skills_testing',
            label: 'Skills / Testing',
            color: '#24367c',
            textColor: '#fff',
            keywords: ['Skills Test', 'Skills Training', 'Skills Session', 'Skills Testing', 'Instructor Course'],
        },
        {
            id: 'vcems',
            label: 'VCEMS / EMS Events',
            color: '#d4a800',
            textColor: '#000',
            keywords: ['EMT.*Event', 'EMTs.*', 'VCEMS CE', 'ambulance'],
            classMatch: ['calendar-event-vcems'],
        },
        {
            id: 'instructor',
            label: 'Instructor / Admin',
            color: '#800000',
            textColor: '#fff',
            classMatch: ['calendar-event-instructor'],
            keywords: [],
        },
        {
            id: 'vehicle',
            label: 'Vehicle',
            color: '#d84315',
            textColor: '#fff',
            classMatch: ['calendar-event-vehicle'],
            keywords: [],
        },
        {
            id: 'other',
            label: 'Other Courses',
            color: '#4c4c4c',
            textColor: '#fff',
            keywords: ['.*'],
            isFallback: true,
        },
    ];

    /* ─────────────────────────────────────────────
       STATE
    ───────────────────────────────────────────── */
    const filterState = {};
    CATEGORIES.forEach(c => { filterState[c.id] = true; });

    /* ─────────────────────────────────────────────
       HELPER: classify an event element
    ───────────────────────────────────────────── */
    function classifyEvent(el) {
        const text = el.innerText || '';
        const classes = el.className || '';

        for (const cat of CATEGORIES) {
            if (cat.isFallback) continue;

            if (cat.classMatch) {
                for (const cls of cat.classMatch) {
                    if (classes.includes(cls)) return cat.id;
                }
            }

            if (cat.keywords && cat.keywords.length) {
                for (const kw of cat.keywords) {
                    if (new RegExp(kw, 'i').test(text)) return cat.id;
                }
            }
        }
        return 'other';
    }

    /* ─────────────────────────────────────────────
       APPLY FILTERS: grey out hidden events
    ───────────────────────────────────────────── */
    function applyFilters() {
        document.querySelectorAll('.fc-event').forEach(event => {
            const inner = event.querySelector('.alert');
            if (!inner) return;

            const catId = inner.dataset.catId || (() => {
                const id = classifyEvent(inner);
                inner.dataset.catId = id;
                return id;
            })();

            const visible = filterState[catId] !== false;

            event.style.opacity = visible ? '1' : '0.18';
            event.style.filter  = visible ? 'none' : 'grayscale(1)';
            event.style.pointerEvents = visible ? '' : 'none';
        });
    }

    /* ─────────────────────────────────────────────
       BUILD FILTER BAR
    ───────────────────────────────────────────── */
    function buildFilterBar() {
        const bar = document.createElement('div');
        bar.id = 'ot-filter-bar';
        bar.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px 10px;
            padding: 10px 14px;
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 12px;
            border: 1px solid #dee2e6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        const title = document.createElement('span');
        title.style.cssText = 'font-size:12px; font-weight:600; color:#495057; margin-right:4px; white-space:nowrap;';
        title.textContent = 'Show:';
        bar.appendChild(title);

        CATEGORIES.forEach(cat => {
            const pill = document.createElement('label');
            pill.style.cssText = `
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 3px 10px 3px 7px;
                border-radius: 20px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: opacity 0.2s, transform 0.1s;
                user-select: none;
                border: 1.5px solid ${cat.color};
                background: ${cat.color};
                color: ${cat.textColor};
            `;

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = true;
            cb.style.cssText = 'width:13px; height:13px; cursor:pointer; accent-color: white; margin:0;';
            cb.addEventListener('change', () => {
                filterState[cat.id] = cb.checked;
                if (!cb.checked) {
                    pill.style.background = '#e9ecef';
                    pill.style.color = '#6c757d';
                    pill.style.borderColor = '#ced4da';
                } else {
                    pill.style.background = cat.color;
                    pill.style.color = cat.textColor;
                    pill.style.borderColor = cat.color;
                }
                applyFilters();
            });

            pill.appendChild(cb);
            pill.appendChild(document.createTextNode(cat.label));
            bar.appendChild(pill);
        });

        /* All on / All off buttons */
        const sep = document.createElement('span');
        sep.style.cssText = 'width:1px; height:18px; background:#dee2e6; margin: 0 2px;';
        bar.appendChild(sep);

        ['All On', 'All Off'].forEach(label => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.style.cssText = `
                font-size: 11px;
                padding: 3px 9px;
                border-radius: 4px;
                border: 1px solid #dee2e6;
                background: #fff;
                color: #495057;
                cursor: pointer;
                font-family: inherit;
            `;
            btn.addEventListener('click', () => {
                const val = label === 'All On';
                CATEGORIES.forEach(cat => {
                    filterState[cat.id] = val;
                });
                bar.querySelectorAll('input[type=checkbox]').forEach((cb, i) => {
                    cb.checked = val;
                    const pill = cb.parentElement;
                    const cat = CATEGORIES[i];
                    if (val) {
                        pill.style.background = cat.color;
                        pill.style.color = cat.textColor;
                        pill.style.borderColor = cat.color;
                    } else {
                        pill.style.background = '#e9ecef';
                        pill.style.color = '#6c757d';
                        pill.style.borderColor = '#ced4da';
                    }
                });
                applyFilters();
            });
            bar.appendChild(btn);
        });

        return bar;
    }

    /* ─────────────────────────────────────────────
       INSERT FILTER BAR next to Sessions tab
    ───────────────────────────────────────────── */
    function injectFilterBar() {
        if (document.getElementById('ot-filter-bar')) return;

        /* Try to find the tab row that contains "Sessions" */
        const tabRows = document.querySelectorAll('.d-flex.justify-content-between');
        let targetRow = null;
        tabRows.forEach(row => {
            if (row.innerText && row.innerText.includes('Sessions')) targetRow = row;
        });

        if (targetRow) {
            /* Inject filter bar as a flex child to the RIGHT of the tabs */
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex; align-items:center; gap:10px; flex-wrap:wrap; width:100%;';

            /* Move existing content (tab list) into wrapper */
            while (targetRow.firstChild) wrapper.appendChild(targetRow.firstChild);

            const filterBar = buildFilterBar();
            filterBar.style.marginBottom = '0';
            filterBar.style.flex = '1';
            wrapper.appendChild(filterBar);

            targetRow.appendChild(wrapper);
        } else {
            /* Fallback: inject above the full-calendar component */
            const fc = document.querySelector('full-calendar, .fc');
            if (fc && fc.parentElement) {
                fc.parentElement.insertBefore(buildFilterBar(), fc);
            }
        }

        applyFilters();
    }

    /* ─────────────────────────────────────────────
       CALENDAR VISUAL STYLES (original + tweaks)
    ───────────────────────────────────────────── */
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .fc {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                border-radius: 8px;
                overflow: hidden;
            }
            .fc-header-toolbar {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px !important;
                margin-bottom: 0 !important;
                border-radius: 8px 8px 0 0;
            }
            .fc-toolbar-title {
                color: white !important;
                font-weight: 600 !important;
                font-size: 24px !important;
                text-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .fc-button {
                background: rgba(255,255,255,0.2) !important;
                border: 1px solid rgba(255,255,255,0.3) !important;
                color: white !important;
                border-radius: 6px !important;
                padding: 8px 16px !important;
                font-weight: 500 !important;
                transition: all 0.3s ease !important;
                text-transform: capitalize !important;
            }
            .fc-button:hover {
                background: rgba(255,255,255,0.3) !important;
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }
            .fc-button:disabled { background: rgba(255,255,255,0.1) !important; opacity: 0.5; }
            .fc-button-active { background: rgba(255,255,255,0.4) !important; }
            .fc-col-header { background: #f8f9fa !important; }
            .fc-col-header-cell {
                padding: 12px 8px !important;
                font-weight: 600 !important;
                color: #495057 !important;
                border-color: #dee2e6 !important;
            }
            .fc-col-header-cell-cushion {
                text-decoration: none !important;
                color: #495057 !important;
                font-size: 14px !important;
                letter-spacing: 0.5px;
            }
            .fc-daygrid-day { transition: background-color 0.2s ease; }
            .fc-daygrid-day:hover { background-color: #f8f9fa !important; }
            .fc-day-today { background-color: #e3f2fd !important; }
            .fc-daygrid-day-number {
                padding: 8px !important;
                font-weight: 500 !important;
                color: #495057 !important;
                text-decoration: none !important;
            }
            .fc-day-past .fc-daygrid-day-number { color: #adb5bd !important; }
            .fc-day-today .fc-daygrid-day-number {
                background: #1976d2;
                color: white !important;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .fc-event {
                border-radius: 6px !important;
                margin: 2px 0 !important;
                padding: 0 !important;
                transition: opacity 0.25s ease, filter 0.25s ease, transform 0.2s ease, box-shadow 0.2s ease !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .fc-event:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                z-index: 10;
            }
            .fc-scrollgrid { border-color: #dee2e6 !important; }
            .fc-theme-standard td, .fc-theme-standard th { border-color: #dee2e6 !important; }
            .event-id { opacity: 0.7; font-size: 10px; }
            .fc-scroller::-webkit-scrollbar { width: 8px; height: 8px; }
            .fc-scroller::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
            .fc-scroller::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
            .fc-scroller::-webkit-scrollbar-thumb:hover { background: #555; }
            .form-select {
                border: 1px solid #dee2e6 !important;
                border-radius: 6px !important;
                padding: 6px 12px !important;
                transition: all 0.2s ease !important;
            }
            .form-select:focus {
                border-color: #667eea !important;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1) !important;
            }
            .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
                border: none !important;
                border-radius: 6px !important;
                padding: 8px 20px !important;
                font-weight: 500 !important;
                transition: all 0.3s ease !important;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .fc-view-harness { animation: fadeIn 0.3s ease; }

            /* Greyed-out events */
            .fc-event[style*="opacity: 0.18"] .alert,
            .fc-event[style*="opacity:0.18"] .alert {
                pointer-events: none;
            }
        `;
        document.head.appendChild(style);
    }

    /* ─────────────────────────────────────────────
       OBSERVE DOM for Angular-rendered changes
    ───────────────────────────────────────────── */
    function watchForCalendar() {
        const observer = new MutationObserver(() => {
            injectFilterBar();
            applyFilters();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* ─────────────────────────────────────────────
       INIT
    ───────────────────────────────────────────── */
    function init() {
        injectStyles();
        injectFilterBar();
        applyFilters();
        watchForCalendar();
        console.log('OT Calendar Gooder v2 loaded!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();