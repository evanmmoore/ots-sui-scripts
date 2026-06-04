// ==UserScript==
// @name         ERG Student Address Auto-Fetch
// @namespace    https://otsystems.net/
// @version      3.12
// @description  Fetch student names, organization (3rd column), and addresses in the Queue tab; display instantly in a new column with copy button; wrap long product names; remove middle initials; exclude meaningless orgs; addresses load asynchronously via hidden iframe so Angular renders them.
// @match        https://otsystems.net/admin/utilities/ERG/*
// @grant        none
// @connect      otsystems.net
// ==/UserScript==

(function() {
    'use strict';

    const stateMap = {
        "alabama": "AL","alaska": "AK","arizona": "AZ","arkansas": "AR",
        "california": "CA","colorado": "CO","connecticut": "CT","delaware": "DE",
        "florida": "FL","georgia": "GA","hawaii": "HI","idaho": "ID",
        "illinois": "IL","indiana": "IN","iowa": "IA","kansas": "KS",
        "kentucky": "KY","louisiana": "LA","maine": "ME","maryland": "MD",
        "massachusetts": "MA","michigan": "MI","minnesota": "MN","mississippi": "MS",
        "missouri": "MO","montana": "MT","nebraska": "NE","nevada": "NV",
        "new hampshire": "NH","new jersey": "NJ","new mexico": "NM","new york": "NY",
        "north carolina": "NC","north dakota": "ND","ohio": "OH","oklahoma": "OK",
        "oregon": "OR","pennsylvania": "PA","rhode island": "RI","south carolina": "SC",
        "south dakota": "SD","tennessee": "TN","texas": "TX","utah": "UT",
        "vermont": "VT","virginia": "VA","washington": "WA","west virginia": "WV",
        "wisconsin": "WI","wyoming": "WY","district of columbia": "DC"
    };

    function capitalizeWords(text){
        return text.split(' ').filter(w=>w.length>0).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');
    }

    function normalizeName(name){
        if(!name) return '';
        const parts = name.trim().split(' ');
        if(parts.length>2 && parts[1].length===2 && parts[1].endsWith('.')) parts.splice(1,1);
        return parts.map(p=>capitalizeWords(p)).join(' ');
    }

    function normalizeState(stateText){
        if(!stateText) return "";
        const key = stateText.trim().toLowerCase();
        return stateMap[key] || stateText.trim().toUpperCase();
    }

    // --- Robust label-based field lookup within a rendered document ---
    function getFieldByLabel(doc, labelText){
        const ths = doc.querySelectorAll('table.student-details-table th, #student_data_div th');
        const want = labelText.toLowerCase();
        for(const th of ths){
            if(th.textContent.trim().toLowerCase().startsWith(want)){
                const td = th.nextElementSibling;
                if(td){
                    const span = td.querySelector('span.ng-binding') || td.querySelector('span') || td;
                    const val = (span.textContent || '').trim();
                    return (val === '--') ? '' : val;
                }
            }
        }
        return '';
    }

    // --- Load a student dashboard in a hidden iframe and read the rendered address ---
    function fetchAddressViaIframe(url){
        return new Promise(resolve=>{
            const iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.width = '1024px';
            iframe.style.height = '768px';
            iframe.style.left = '-10000px';
            iframe.style.top = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            let done = false;
            let attempts = 0;
            const maxAttempts = 60; // ~30s at 500ms

            function finish(result){
                if(done) return;
                done = true;
                clearInterval(poll);
                try{ iframe.remove(); }catch(e){}
                resolve(result);
            }

            const poll = setInterval(()=>{
                attempts++;
                let idoc;
                try{ idoc = iframe.contentDocument || iframe.contentWindow.document; }
                catch(e){ return finish(null); } // cross-origin; bail

                if(idoc){
                    const street = getFieldByLabel(idoc, 'Street Address');
                    const city   = getFieldByLabel(idoc, 'City');
                    const state  = getFieldByLabel(idoc, 'State');
                    const zip    = getFieldByLabel(idoc, 'Zip');
                    // Consider it loaded once any of the core fields render
                    if(street || city || state || zip){
                        const apt = getFieldByLabel(idoc, 'Apt/Suite');
                        return finish({ street, apt, city, state, zip });
                    }
                }

                if(attempts >= maxAttempts) finish(null);
            }, 500);

            iframe.src = url;
            document.body.appendChild(iframe);
        });
    }

    function addMailingAddressHeader(table){
        const headerRow = table.querySelector('thead tr:nth-child(2)');
        if(!headerRow) return;

        if(!headerRow.querySelector('.mailing-address-header')){
            const th = document.createElement('th');
            th.className='mailing-address-header';
            th.textContent='Mailing Address';
            th.style.minWidth='220px';
            th.style.textAlign='left';
            headerRow.appendChild(th);
        }

        const productTh = table.querySelector('thead tr:nth-child(2) th:nth-child(3)');
        if(productTh) productTh.style.whiteSpace='normal';
    }

    async function fetchStudentAddress(row){
        // --- Name from table ---
        const nameLink = row.querySelector('td a.ng-binding');
        let studentName='No Name';
        if(nameLink){
            const nameParts = nameLink.textContent.split(',').map(p=>p.trim());
            if(nameParts.length===2) studentName = normalizeName(nameParts[1]+' '+nameParts[0]);
            else studentName = normalizeName(nameLink.textContent.trim());
        }

        // --- Organization from table (3rd column) ---
        const orgCell = row.querySelector('td:nth-child(3) span.ng-binding');
        let orgName='';
        if(orgCell){
            const orgText = orgCell.textContent.trim();
            if(orgText && !['self','Self','none','None','n/a','N/A'].includes(orgText)) orgName = orgText;
        }

        // --- Create placeholder cell with name + org immediately ---
        let addressCell = row.querySelector('.mailing-address-cell');
        if(!addressCell){
            addressCell = document.createElement('td');
            addressCell.className='mailing-address-cell';
            row.appendChild(addressCell);
        }

        addressCell.innerHTML=`
            <div style="display:flex; flex-direction:column; align-items:flex-start; font-size:14px; line-height:1.3; font-family:Roboto,sans-serif;">
                <pre style="margin:0; text-align:left; background:none; border:none; padding:0; font-family:inherit;">${studentName}${orgName?'\n'+orgName:''}</pre>
                <pre class="address-lines" style="margin:0; text-align:left; background:none; border:none; padding:0; font-family:inherit; color:#888;">Loading…</pre>
                <button class="copy-btn" style="margin-top:5px; font-size:11px; cursor:pointer;">Copy</button>
            </div>`;

        const copyBtn=addressCell.querySelector('.copy-btn');
        copyBtn.addEventListener('click',()=>{
            const fullText = `${studentName}${orgName?'\n'+orgName:''}\n${addressCell.querySelector('.address-lines').textContent}`;
            navigator.clipboard.writeText(fullText).then(()=>{
                copyBtn.textContent='✅';
                setTimeout(()=>{copyBtn.textContent='Copy';},1000);
            });
        });

        // --- Fetch mailing address via hidden iframe (Angular renders the values) ---
        const studentURL = nameLink ? nameLink.href : null;
        const addressLines = addressCell.querySelector('.address-lines');
        if(studentURL){
            const data = await fetchAddressViaIframe(studentURL);
            if(data){
                let addressLine1 = data.street ? capitalizeWords(data.street) : '';
                if(data.apt) addressLine1 += (addressLine1 ? ' ' : '') + capitalizeWords(data.apt);

                let addressLine2 = '';
                if(data.city)  addressLine2 += capitalizeWords(data.city);
                if(data.state) addressLine2 += (addressLine2 ? ', ' : '') + normalizeState(data.state);
                if(data.zip)   addressLine2 += ' ' + data.zip;

                if(addressLines){
                    addressLines.style.color = '';
                    addressLines.textContent = `${addressLine1}\n${addressLine2}`;
                }
            } else {
                if(addressLines){
                    addressLines.style.color = '#c00';
                    addressLines.textContent = 'Address unavailable';
                }
            }
        }
    }

    // Limit concurrent iframe loads so we don't open dozens at once
    let queue = [];
    let active = 0;
    const MAX_CONCURRENT = 3;

    function enqueue(row){
        queue.push(row);
        pump();
    }
    function pump(){
        while(active < MAX_CONCURRENT && queue.length){
            const row = queue.shift();
            active++;
            fetchStudentAddress(row).finally(()=>{ active--; pump(); });
        }
    }

    function fetchAllAddresses(){
        const activeTab = document.querySelector('ul.nav-tabs li.active uib-tab-heading');
        if(!activeTab || activeTab.textContent.trim()!=='Queue') return;

        const table=document.querySelector('table');
        if(!table) return;

        addMailingAddressHeader(table);

        const rows=table.querySelectorAll('tbody tr');
        rows.forEach(row=>{
            if(!row.querySelector('.mailing-address-cell')){
                row.dataset.addrQueued = '1';
                enqueue(row);
            }
        });

        // Wrap product column content after dash
        rows.forEach(row=>{
            const productCell=row.querySelector('td:nth-child(3)');
            if(productCell){
                const parts=productCell.innerHTML.split(' - ');
                if(parts.length>1) productCell.innerHTML=parts[0]+' -<br>'+parts.slice(1).join(' - ');
            }
        });
    }

    const tableContainer=document.querySelector('#content');
    if(!tableContainer) return;

    const observer=new MutationObserver(()=>{fetchAllAddresses();});
    observer.observe(tableContainer,{childList:true, subtree:true});

    setTimeout(fetchAllAddresses,1000);

})();