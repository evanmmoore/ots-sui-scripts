// ==UserScript==
// @name         ERG Student Address Auto-Fetch 9/11/25
// @namespace    https://otsystems.net/
// @version      3.10
// @description  Fetch student names, organization (3rd column), and addresses in the Queue tab; display instantly in a new column with copy button; wrap long product names; remove middle initials; exclude meaningless orgs; addresses load asynchronously.
// @match        https://otsystems.net/admin/utilities/ERG/*
// @grant        GM_xmlhttpRequest
// @connect      https://admin.otsystems.net/#/
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
                <pre class="address-lines" style="margin:0; text-align:left; background:none; border:none; padding:0; font-family:inherit;"></pre>
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

        // --- Fetch mailing address from student dashboard asynchronously ---
        const studentURL = nameLink ? nameLink.href : null;
        if(studentURL){
            await new Promise(resolve=>{
                GM_xmlhttpRequest({
                    method:'GET',
                    url:studentURL,
                    onload:function(response){
                        const parser=new DOMParser();
                        const doc = parser.parseFromString(response.responseText,'text/html');

                        const streetEl = doc.querySelector('#student_data_div > div > div:nth-child(2) > div:nth-child(1) > div > table > tbody > tr:nth-child(4) > td');
                        const aptEl = doc.querySelector('#student_data_div > div > div:nth-child(2) > div:nth-child(1) > div > table > tbody > tr:nth-child(5) > td');
                        const cityEl = doc.querySelector('#student_data_div > div > div:nth-child(2) > div:nth-child(1) > div > table > tbody > tr:nth-child(6) > td');
                        const stateEl = doc.querySelector('#student_data_div > div > div:nth-child(2) > div:nth-child(1) > div > table > tbody > tr:nth-child(7) > td');
                        const zipEl = doc.querySelector('#student_data_div > div > div:nth-child(2) > div:nth-child(1) > div > table > tbody > tr:nth-child(8) > td');

                        let addressLine1 = streetEl ? capitalizeWords(streetEl.textContent.trim()) : '';
                        if(aptEl && aptEl.textContent.trim()) addressLine1 += ' ' + capitalizeWords(aptEl.textContent.trim());

                        let addressLine2 = '';
                        if(cityEl) addressLine2 += capitalizeWords(cityEl.textContent.trim());
                        if(stateEl) addressLine2 += (addressLine2? ', ' : '') + normalizeState(stateEl.textContent.trim());
                        if(zipEl) addressLine2 += ' ' + zipEl.textContent.trim();

                        // Update the placeholder with actual address
                        const addressLines = addressCell.querySelector('.address-lines');
                        if(addressLines) addressLines.textContent = `${addressLine1}\n${addressLine2}`;

                        resolve();
                    },
                    onerror:function(){resolve();}
                });
            });
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
            if(!row.querySelector('.mailing-address-cell')) fetchStudentAddress(row);
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
