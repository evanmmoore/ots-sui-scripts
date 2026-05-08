// ==UserScript==
// @name         AP Pricing UI
// @namespace    http://tampermonkey.net/
// @version      5.2
// @description  Volume pricing UI with version grouping, search filter, selected button highlight, fixed copy alignment, quantity input, and copy email button (Excel-ready)
// @match        https://admin.otsystems.net*
// @grant        none
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/569522/AP%20Pricing%20UI.user.js
// @updateURL https://update.greasyfork.org/scripts/569522/AP%20Pricing%20UI.meta.js
// ==/UserScript==

(function () {
  'use strict';

  const courseData = [
{ name: 'OSHA 40 Hour HAZWOPER - Online', item: '0077-1246', course: '40 Hour HAZWOPER Online', price: 210.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 40 Hour HAZWOPER - Blended (32 Hours Online/8 Hours Classroom)', item: '0076-1196', course: '40 Hour HAZWOPER (32 hrs Online 8 hrs Classroom)', price: 380.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 32 Hour HAZWOPER - Online', item: '0089-1248', course: '32 Hour HAZWOPER Online', price: 200.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 24 Hour HAZWOPER Online', item: '0002-1247', course: '24 Hour HAZWOPER Online', price: 150.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 16 Hour HAZWOPER Upgrade (to the 40 Hour) - Blended (8 Hours Online/8 Hours Classroom)', item: '0075-1217', course: '16 Hour HAZWOPER Upgrade Combo Online/Classroom', price: 195.00, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 16 Hour HAZWOPER Upgrade (to the 40 Hour) - Online', item: '0071-1249', course: '16 Hour HAZWOPER Upgrade Online', price: 122.50, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor (Initial)', item: '0099-1269', course: 'OSHA 8 Hour HAZWOPER Supervisor (Initial)', price: 53.57, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher - Online (Version 1)', item: '0004-2214', course: '8 Hour HAZWOPER Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher - Online (Version 2)', item: '0004-2217', course: '8 Hour HAZWOPER Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher - Online (Version 3)', item: '0004-2218', course: '8 Hour HAZWOPER Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher - Online (Version 4)', item: '0004-2221', course: '8 Hour HAZWOPER Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card (Version 1)', item: '0003-2215', course: '8 Hour HAZWOPER Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card (Version 2)', item: '0003-2216', course: '8 Hour HAZWOPER Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card (Version 3)', item: '0003-2219', course: '8 Hour HAZWOPER Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card (Version 4)', item: '0003-2220', course: '8 Hour HAZWOPER Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Version 1)', item: '0005-1250', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Version 2)', item: '0005-1257', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Version 3)', item: '0005-1332', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Version 4)', item: '0005-1333', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online', price: 39.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card (Version 1)', item: '0006-1251', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card (Version 2)', item: '0006-1256', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card (Version 3)', item: '0006-1334', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card (Version 4)', item: '0006-1335', course: '8 Hour HAZWOPER SUPERVISOR Refresher Online w/Wallet ID Card', price: 44.95, sale: false, category: 'OSHA HAZWOPER Online' },
{ name: 'Package: OSHA 40 Hour HAZWOPER - Online & OSHA 8 Hour HAZWOPER Supervisor Initial - Online', item: '0100-1220', course: 'Package: Online OSHA 40 Hour HAZWOPER & 8 Hour HAZWOPER Supervisor Initial', price: 250.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'Package: OSHA 24 Hour HAZWOPER - Online & OSHA 8 Hour HAZWOPER Supervisor Initial - Online', item: '0101-0909', course: 'Package: Online OSHA 24 Hour HAZWOPER & 8 Hour HAZWOPER Supervisor Initial', price: 175.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'Package: OSHA 8 Hour HAZWOPER Refresher w/Wallet ID - Online & OSHA 8 Hour HAZWOPER Supervisor (Initial) - Online', item: '0102-0907', course: 'Package: Online OSHA 8 Hour HAZWOPER Refresher & 8 Hour HAZWOPER Supervisor Initial', price: 75.00, sale: true, category: 'OSHA HAZWOPER Online' },
{ name: 'Lead Safety for Renovation Repair and Painting (RRP) - Refresher', item: '0420-1296', course: 'Lead Safety for Renovation Repair and Painting (RRP) - Refresher', price: 74.95, sale: false, category: 'EPA Approved Lead RRP (Renovation, Repair, and Painting) Online' },
{ name: '40 Hour EM-385-1-1 - Safety and Health Requirements for USACE', item: '0804-2133', course: 'USACE 40 Hour EM 385-1-1 Training', price: 325.00, sale: true, category: 'USACE EM-385-1-1 Safety and Health Requirements Online' },
{ name: '24 Hour EM-385-1-1 - Safety and Health Requirements for USACE', item: '0898-2225', course: 'USACE 24 Hour EM 385-1-1 Training', price: 235.00, sale: true, category: 'USACE EM-385-1-1 Safety and Health Requirements Online' },
{ name: '16 Hour EM-385-1-1 - Safety and Health Requirements for USACE', item: '0899-2226', course: 'USACE 16 Hour EM 385-1-1 Training', price: 170.00, sale: true, category: 'USACE EM-385-1-1 Safety and Health Requirements Online' },
{ name: '8 Hour EM-385-1-1 - Safety and Health Requirements for USACE', item: '0900-2227', course: 'USACE 8 Hour EM 385-1-1 Training', price: 125.00, sale: true, category: 'USACE EM-385-1-1 Safety and Health Requirements Online' },
{ name: 'DOT Hazmat: General Awareness/Function Specific (10 Hour)', item: '0213-2222', course: 'DOT Hazmat: General Awareness/Function Specific', price: 199.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Basic General Awareness (4 Hour)', item: '0212-1245', course: 'DOT Hazmat: Basic General Awareness', price: 74.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Security Awareness', item: '0215-1299', course: 'DOT Hazmat: Security Awareness', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Hazard Classes and Divisions', item: '0329-1293', course: 'DOT Hazmat: Function Specific - Hazard Classes and Divisions', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Labeling', item: '0218-1290', course: 'DOT Hazmat: Function Specific - Labeling', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Marking', item: '0217-1288', course: 'DOT Hazmat: Function Specific - Marking', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Packaging', item: '0219-1292', course: 'DOT Hazmat: Function Specific - Packaging', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Placarding', item: '0324-1291', course: 'DOT Hazmat: Function Specific - Placarding', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Shipping Batteries', item: '0341-1325', course: 'DOT Hazmat: Function Specific - Packaging and Shipping Batteries', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Shipping Papers', item: '0220-1240', course: 'DOT Hazmat: Function Specific - Shipping Papers', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Function Specific - Using the Hazmat Table (HMT)', item: '0328-1285', course: 'DOT Hazmat: Function Specific - Using the Hazmat Table (HMT)', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Segregation - Highway', item: '0800-2074', course: 'DOT Hazmat: Segregation - Highway', price: 59.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Segregation - Air', item: '0801-2073', course: 'DOT Hazmat: Segregation - Air', price: 59.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Segregation - Rail', item: '0802-2075', course: 'DOT Hazmat: Segregation - Rail', price: 59.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Segregation - Vessel', item: '0803-2080', course: 'DOT Hazmat: Segregation - Vessel', price: 59.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Carrier Requirements - Air/IATA', item: '0203-1309', course: 'DOT Hazmat Carrier Requirements - Air', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Carrier Requirements - Highway', item: '0205-1243', course: 'DOT Hazmat Carrier Requirements - Highway', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Carrier Requirements - Rail', item: '0204-1344', course: 'DOT Hazmat Carrier Requirements - Rail', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Hazmat: Carrier Requirements - Vessel', item: '0206-1345', course: 'DOT Hazmat Carrier Requirements - Water', price: 49.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT/IATA Package: Hazmat General Awareness/Function Specific (10 Hour) & Air/IATA Requirements', item: '0273-1122', course: 'Package: DOT General Awareness/Function Specific-10 Hr & Air/IATA Requirements', price: 224.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package: Hazmat General Awareness/Function Specific (10 Hour) & Function Specific - Shipping Batteries', item: '0342-1329', course: 'Package: DOT Hazmat Basic General Awareness/Function Specific (10 Hour)/DOT Hazmat Function Specific - Shipping Batteries', price: 224.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package w/Hazmat General Awareness/Function Specific (10 Hour) and DOT Hazmat Carrier Requirements Highway', item: '0531-1684', course: 'DOT/Highway Package w/Hazmat GA/FS (10 Hour) and Carrier Requirements - Highway', price: 224.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package: Hazmat: Segregation - Air/Highway/Rail/Vessel', item: '0808-2087', course: 'Package Deal (DOT Hazmat: Segregation - Air/Highway/Rail/Vessel)', price: 149.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT/IATA Package: Hazmat Basic General Awareness (4 Hour) & Air/IATA Requirements', item: '0238-1066', course: 'Package: DOT General Awareness Basic (4 Hour) & Air/IATA Requirements', price: 99.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package: Hazmat Basic General Awareness (4 Hour) & Function Specific - Shipping Batteries', item: '0343-1328', course: 'Package: DOT Hazmat Basic General Awareness (4 Hour)/DOT Hazmat Function Specific - Shipping Batteries', price: 99.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package: Hazmat Basic General Awareness (4 Hour) & DOT Hazmat: Function Specific - Shipping Papers', item: '0303-1183', course: 'Package: DOT Hazmat Basic General Awareness (4 Hour)/DOT Hazmat Function Specific - Shipping Papers', price: 99.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package: Hazmat Basic General Awareness (4 Hour) & Hazmat Carrier Requirements Highway', item: '0286-1141', course: 'Package: DOT Hazmat Basic General Awareness (4 Hour)/DOT Hazmat Carrier Requirements Highway', price: 99.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'DOT Package: Hazmat Basic General Awareness (4 Hour) & Hazmat: Carrier Requirements - Rail', item: '0893-2211', course: 'Package: DOT Hazmat Basic General Awareness (4 Hour)/DOT Hazmat: Carrier Requirements - Rail', price: 99.95, sale: false, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: 'Package - DOT General Awareness with Air/IATA, Highway, Rail, and Vessel', item: '0913-2305', course: 'Package - DOT General Awareness with Air/IATA, Highway, Rail, and Vessel', price: 234.80, sale: true, category: 'Department of Transportation (DOT) Hazmat ' },
{ name: '24 Hour Hazardous Materials Technician Level III Responder - Online', item: '0246-2162', course: '24 Hour Hazardous Materials Technician Online', price: 175.00, sale: true, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: '24 Hour Hazardous Materials Technician Level III Responder - Blended (16 Hours Online/8 Hours Classroom with Training Provider)', item: '0239-2200', course: '24 Hour Hazmat Technician (16 hrs Online 8 hrs Classroom)', price: 275.00, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: '24 Hour Hazardous Materials Technician Level III Responder - Blended (8 Hours Online/8 Hours Classroom)(With Verifiable Part 1 (FRO) Prerequisite)', item: '0247-1237', course: '24 Hour Hazardous Materials Technician - Blended (8 Hours Online/8 Hours Classroom W/Prior FRO)', price: 225.00, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: '24 Hour Hazardous Materials Technician Level III Responder - 16 Hours Online(With Verifiable Part 1 (FRO) Prerequisite)', item: '0244-1756', course: '24 Hr Hazmat Tech - 16 Hrs Online w/Prior FRO', price: 175.00, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: '16 Hour Hazardous Materials Technician Level III Responder - Online(16 Hours of Online Training to be combined w/8 Hours of Classroom Training done by the Employer)', item: '0280-2161', course: '16 Hour Hazardous Materials Technician Online', price: 175.00, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Incident Commander Level V Responder Refresher Online (4 Hour) (Version 1)', item: '0296-1171', course: 'Hazmat Incident Commander Refresher Online (4 Hour)', price: 59.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Technician Level III Responder Refresher Online (8 Hour) (Version 2)', item: '0248-1759', course: 'Hazmat Technician Level III Responder Refresher Online (8 Hour)', price: 79.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Technician Level III Responder Refresher Online (8 Hour) (Version 3)', item: '0248-1760', course: 'Hazmat Technician Level III Responder Refresher Online (8 Hour)', price: 79.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Technician Level III Responder Refresher Online (8 Hour) (Version 1)', item: '0248-2188', course: 'Hazmat Technician Level III Responder Refresher Online (8 Hour)', price: 79.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Technician Level III Responder Refresher Online (4 Hour) (Version 2)', item: '0249-1762', course: 'Hazmat Technician Level III Responder Refresher Online (4 Hour)', price: 59.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Technician Level III Responder Refresher Online (4 Hour) (Version 3)', item: '0249-1763', course: 'Hazmat Technician Level III Responder Refresher Online (4 Hour)', price: 59.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials Technician Level III Responder Refresher Online (4 Hour) (Version 1)', item: '0249-2189', course: 'Hazmat Technician Level III Responder Refresher Online (4 Hour)', price: 59.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Operations (FRO) Level II Responder (Includes Mailed ERG)', item: '0093-2168', course: 'Hazardous Materials First Responder Operations (FRO)', price: 84.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Operations (FRO) Level II Responder (Includes Downloadable ERG)', item: '0884-2195', course: 'Hazardous Materials First Responder Operations (FRO)', price: 69.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (8 Hour) (Includes Mailed ERG)', item: '0097-2171', course: 'Hazardous Materials First Responder Operations (FRO) Refresher', price: 84.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (8 Hour) (Includes Downloadable ERG)', item: '0885-2192', course: 'Hazardous Materials First Responder Operations (FRO) Refresher', price: 69.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (4 Hour) (Includes Mailed ERG)', item: '0124-2170', course: 'Hazardous Materials First Responder Operations (FRO) 4 Hour Refresher', price: 74.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (4 Hour) (Includes Downloadable ERG)', item: '0886-2193', course: 'Hazardous Materials First Responder Operations (FRO) 4 Hour Refresher', price: 59.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Awareness (FRA) Level I Responder (Includes Mailed ERG)', item: '0090-2165', course: 'Hazardous Materials First Responder Awareness (FRA)', price: 64.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Awareness (FRA) Level I Responder (Includes Downloadable ERG)', item: '0877-2186', course: 'Hazardous Materials First Responder Awareness (FRA)', price: 49.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Awareness (FRA) Level I Responder Refresher (Includes Mailed ERG)', item: '0096-2167', course: 'Hazardous Materials First Responder Awareness (FRA) Refresher', price: 64.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Awareness (FRA) Level I Responder Refresher (Includes Downloadable ERG)', item: '0872-2187', course: 'Hazardous Materials First Responder Awareness (FRA) Refresher', price: 49.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Awareness (FRA) Level I Responder for Law Enforcement (Includes Mailed ERG)', item: '0868-2158', course: 'Hazardous Materials First Responder Awareness (FRA) for Law Enforcement', price: 64.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Hazardous Materials First Responder Awareness (FRA) Level I Responder for Law Enforcement (Includes Downloadable ERG)', item: '0869-2183', course: 'Hazardous Materials First Responder Awareness (FRA) for Law Enforcement', price: 49.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Using the Current Emergency Response Guidebook (Includes Mailed ERG)', item: '0115-2173', course: 'Using the Emergency Response Guidebook (ERG) w/Mailed ERG', price: 34.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Using the Current Emergency Response Guidebook (Includes Downloadable ERG)', item: '0113-2172', course: 'Using the Emergency Response Guidebook (ERG)', price: 19.95, sale: false, category: 'OSHA Hazmat Emergency Responder Online' },
{ name: 'Back Safety in the Workplace', item: '0125-1286', course: 'Back Safety in the Workplace', price: 24.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Confined Space Awareness Training', item: '0114-1640', course: 'Confined Space Awareness', price: 19.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Confined Space Awareness Training with Wallet ID Card', item: '0321-1641', course: 'Confined Space Awareness w/Wallet ID', price: 24.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Fall Prevention for Construction', item: '0562-1769', course: 'Fall Prevention for Construction', price: 19.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Hearing Conservation Training', item: '0095-1356', course: 'OSHA Hearing Conservation Training', price: 19.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Hearing Conservation Training with Wallet ID', item: '0338-1357', course: 'OSHA Hearing Conservation Training w/Wallet ID', price: 24.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Heat Illness Prevention for Employees', item: '0309-1199', course: 'Heat Illness Prevention for Employees', price: 19.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Heat Illness Prevention for Supervisors', item: '0310-1200', course: 'Heat Illness Prevention for Supervisors', price: 24.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Health and Safety Management', item: '0117-1327', course: 'Health and Safety Management', price: 24.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Introduction to Industrial Hygiene', item: '0330-1300', course: 'Introduction to Industrial Hygiene', price: 14.95, sale: true, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Introduction to Job Hazard Analysis (JHA)', item: '0331-1303', course: 'Introduction to Job Hazard Analysis (JHA)', price: 14.95, sale: true, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Personal Protective Equipment (PPE) Program and Selection', item: '0116-1318', course: 'Personal Protective Equipment (PPE) Program and Selection', price: 24.95, sale: false, category: 'OSHA Safety Courses for General Industry and Construction Online ' },
{ name: 'Acrylonitrile Awareness Online', item: '0533-1685', course: 'Acrylonitrile Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Asbestos Awareness Online', item: '0208-1312', course: 'Asbestos Awareness Online', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Asbestos Awareness Online with Wallet ID Card', item: '0209-1336', course: 'Asbestos Awareness Online With Wallet ID', price: 24.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Benzene Awareness for General Industry and Construction', item: '0366-1360', course: 'Benzene Awareness Training', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Benzene Awareness for General Industry and Construction with Wallet ID', item: '0419-1467', course: 'Benzene Awareness Training w/Wallet ID', price: 24.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Beryllium Awareness Online', item: '0832-2081', course: 'Beryllium Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Cotton Dust Awareness', item: '0896-2210', course: 'Cotton Dust Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: '1,3-Butadiene Awareness Online', item: '0532-1673', course: '1,3-Butadiene', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Cadmium Awareness for Construction Online', item: '0520-1645', course: 'Cadmium Awareness for Construction', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Cadmium Awareness for General Industry Online', item: '0523-1662', course: 'Cadmium Awareness for General Industry', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: '13 Carcinogens Awareness Online', item: '0534-1700', course: '13 Carcinogens Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Chromium (VI) Awareness Online', item: '0527-1665', course: 'Chromium (VI) Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Ethylene Oxide Awareness Online', item: '0519-1642', course: 'Ethylene Oxide Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Formaldehyde Awareness Online', item: '0524-1661', course: 'Formaldehyde Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA Hydrogen Sulfide (H2S) Awareness (2-hour OSHA H2S Awareness Online)', item: '0155-1397', course: 'OSHA Hydrogen Sulfide (H2S) Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA Hydrogen Sulfide (H2S) Awareness Online with Wallet ID Card (2-hour OSHA H2S Awareness Online)', item: '0177-1396', course: 'OSHA Hydrogen Sulfide (H2S) Awareness w/Wallet ID', price: 24.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA/ANSI Hydrogen Sulfide (H2S) Awareness (4-hour OSHA/ANSI H2S Awareness Online)', item: '0897-2113', course: 'OSHA/ANSI Hydrogen Sulfide (H2S) Awareness', price: 29.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA/ANSI Hydrogen Sulfide (H2S) Awareness (w/Wallet ID Card) (4-hour OSHA/ANSI H2S Awareness Online)', item: '0903-2114', course: 'OSHA/ANSI Hydrogen Sulfide (H2S) Awareness w/Wallet ID', price: 34.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA/ANSI Hydrogen Sulfide (H2S) Certification (6-hour OSHA/ANSI H2S Certification Online)', item: '0909-2212', course: 'OSHA/ANSI Hydrogen Sulfide (H2S) Certification', price: 39.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA/ANSI Hydrogen Sulfide (H2S) Certification (w/Wallet ID Card) (6-hour OSHA/ANSI H2S Certification Online)', item: '0908-2228', course: 'OSHA/ANSI Hydrogen Sulfide (H2S) Certification w/Wallet ID', price: 44.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Inorganic Arsenic Awareness for General Industry and Construction', item: '0441-1499', course: 'Inorganic Arsenic Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Lead Awareness for General Industry Online', item: '0287-1096', course: 'Lead Awareness for General Industry Online', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Lead Awareness for General Industry Online with Wallet ID', item: '0288-1142', course: 'Lead Awareness for General Industry Online w/Wallet ID', price: 24.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Methylene Chloride Awareness', item: '0521-1646', course: 'Methylene Chloride Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Silica Awareness for Construction Online', item: '0349-1339', course: 'Silica Awareness for Construction', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Silica Awareness for Construction Online with Wallet ID Card', item: '0350-1340', course: 'Silica Awareness for Construction with Wallet ID Card', price: 24.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Silica Awareness for General Industry Online', item: '0831-2109', course: 'Silica Awareness for General Industry', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'Vinyl Chloride Awareness', item: '0468-1532', course: 'Vinyl Chloride Awareness', price: 19.95, sale: false, category: 'Chemical Specific Training for General Industry and Construction' },
{ name: 'OSHA Respiratory Protection Training', item: '0007-1221', course: 'OSHA Respiratory Protection Training', price: 24.95, sale: false, category: 'OSHA Respiratory Protection  Online' },
{ name: 'OSHA Hazard Communication (HAZCOM) Training', item: '0210-2298', course: 'OSHA Hazard Communication Training (HAZCOM)', price: 19.96, sale: true, category: 'OSHA Hazard Communication (HAZCOM) and GHS Online ' },
{ name: 'OSHA Hazard Communication (HAZCOM) Training With Wallet ID Card', item: '0211-2307', course: 'OSHA Hazard Communication (HAZCOM) w/Wallet ID Card', price: 23.96, sale: true, category: 'OSHA Hazard Communication (HAZCOM) and GHS Online ' },
{ name: 'Laboratory Bloodborne Pathogens (Needle Sharps Program)', item: '0015-1393', course: 'Bloodborne Pathogens', price: 29.95, sale: false, category: 'Laboratory Safety Online' },
{ name: 'DOT Reasonable Suspicion for Supervisors', item: '0433-1480', course: 'DOT Reasonable Suspicion for Supervisors', price: 29.95, sale: true, category: 'Human Resource Online' },
{ name: 'Online Alcohol and Drugs in the Workplace Training', item: '0122-1313', course: 'Alcohol and Drugs in the Workplace', price: 19.95, sale: false, category: 'Human Resource Online' },
{ name: 'Online Job Stress Prevention Training', item: '0120-1314', course: 'Online Job Stress Prevention Training', price: 19.95, sale: false, category: 'Human Resource Online' },
{ name: 'Online Sexual Discrimination & Harassment Prevention Training', item: '0072-1726', course: 'Sexual Discrimination & Harassment Prevention Training', price: 24.95, sale: false, category: 'Human Resource Online' },
{ name: 'Online Introduction to Supervision & Leadership Training', item: '0119-1315', course: 'Supervision and Leadership', price: 19.95, sale: false, category: 'Human Resource Online' },
{ name: 'Online Work Schedules & Working Alone Training', item: '0121-1316', course: 'Work Schedules and Working Alone', price: 19.95, sale: false, category: 'Human Resource Online' },
{ name: 'Online Human Resources Manager Training (Package of 4 classes)', item: '0118-1317', course: 'Human Resources Training Package', price: 49.95, sale: false, category: 'Human Resource Online' },
{ name: 'OSHA 40 Hour HAZWOPER - Online (Spanish)', item: '0104-1852', course: '40 Hour HAZWOPER Online (Spanish)', price: 210.00, sale: true, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 32 Hour HAZWOPER - Online (Spanish)', item: '0107-2077', course: '32 Hour HAZWOPER Online (Spanish)', price: 225.00, sale: true, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 24 Hour HAZWOPER - Online (Spanish)', item: '0108-1996', course: '24 Hour HAZWOPER Online (Spanish)', price: 150.00, sale: true, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 16 Hour HAZWOPER - Online (Spanish)', item: '0109-2078', course: '16 Hour HAZWOPER Online (Spanish)', price: 122.50, sale: true, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher - Online (Spanish)', item: '0111-1947', course: '8 Hour HAZWOPER Refresher Online (Spanish)', price: 39.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (Spanish)', item: '0112-1985', course: '8 Hour HAZWOPER Refresher Online w/Wallet ID Card (Spanish)', price: 44.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Spanish)', item: '0142-2223', course: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Spanish)', price: 39.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA 8 Hour HAZWOPER Supervisor Refresher With Wallet ID Card (Spanish)', item: '0143-2224', course: 'OSHA 8 Hour HAZWOPER Supervisor Refresher (Spanish) w/ Wallet ID Card', price: 44.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Back Safety in the Workplace (Spanish)', item: '0176-1766', course: 'Back Safety in the Workplace (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Hearing Conservation Training (Spanish)', item: '0796-2058', course: 'OSHA Hearing Conservation Training (Spanish)', price: 19.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Hearing Conservation Training w/Wallet ID (Spanish)', item: '0797-2059', course: 'OSHA Hearing Conservation Training (Spanish) w/ wallet ID', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA Hazard Communication Training Aligned with GHS with Wallet ID Card (Spanish)', item: '0281-1198', course: 'OSHA Hazard Communication Aligned with GHS w/Wallet ID Card (Spanish)', price: 23.96, sale: true, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA Hazard Communication Training Aligned with GHS (Spanish)', item: '0282-1197', course: 'OSHA Hazard Communication Aligned with GHS (Spanish)', price: 19.96, sale: true, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA Respiratory Protection Training (Spanish)', item: '0126-1471', course: 'OSHA Respiratory Protection Training (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA Respiratory Protection Refresher Training (Spanish)', item: '0129-1472', course: 'OSHA Respiratory Protection Refresher Training (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Asbestos Awareness Online (Spanish)', item: '0345-1330', course: 'Asbestos Awareness Online (Spanish)', price: 19.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Asbestos Awareness Online With Wallet ID Card (Spanish)', item: '0346-1337', course: 'Asbestos Awareness Online With Wallet ID (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA Hydrogen Sulfide (H2S) Awareness (Spanish)', item: '0181-1498', course: 'Hydrogen Sulfide (H2S) Awareness (Spanish)', price: 19.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'OSHA Hydrogen Sulfide (H2S) Awareness With Wallet ID Card (Spanish)', item: '0182-1742', course: 'Hydrogen Sulfide (H2S) Awareness w/Wallet ID Card (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Lead Awareness for General Industry Online (Spanish)', item: '0788-2056', course: 'Lead Awareness for General Industry Online (Spanish)', price: 19.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Lead Awareness for General Industry Online with Wallet ID (Spanish)', item: '0789-2057', course: 'Lead Awareness for General Industry Online w/Wallet ID  (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Silica Awareness for Construction Online (Spanish)', item: '0786-2053', course: 'Silica Awareness for Construction (Spanish)', price: 19.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Silica Awareness for Construction Online with Wallet ID Card (Spanish)', item: '0787-2054', course: 'Silica Awareness for Construction w/Wallet ID Card (Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Heat Illness Prevention for Employees (Spanish)', item: '0363-1359', course: 'Heat Illness Prevention for Employees (Spanish)', price: 19.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' },
{ name: 'Heat Illness Prevention for Supervisors (Spanish)', item: '0383-1403', course: 'Heat Illness Prevention for Supervisors(Spanish)', price: 24.95, sale: false, category: 'Spanish Courses Online  (Versions in Spanish)' }
];

  let isMinimized = false;
  let selectedCourse = null;
  let selectedQty = 10;
  let selectedTiers = "0";
  let filterText = '';
  let selectedSummary = [];
  let selectedTables = [];
  let initInterval = null;
 
  // ─── Styles ───────────────────────────────────────────────────────────────
  const STYLES = `
    #vp-panel * { box-sizing: border-box; }
    #vp-panel { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #111; }
    #vp-panel input, #vp-panel select {
      background: #fff; color: #111; border: 1px solid #d0d0d0;
      border-radius: 5px; padding: 4px 7px; font-size: 12px; outline: none;
    }
    #vp-panel input:focus, #vp-panel select:focus { border-color: #1a73e8; }
    #vp-panel button { cursor: pointer; font-family: inherit; }
    .vp-btn {
      background: transparent; border: 1px solid #d0d0d0;
      border-radius: 5px; padding: 3px 10px; font-size: 12px; color: #555;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .vp-btn:hover { background: #f0f0f0; border-color: #aaa; color: #111; }
    .vp-btn.selected {
      background: #e8f0fe; border-color: #aac3f5; color: #1a56c4; font-weight: 500;
    }
    .vp-btn.danger { color: #c0392b; border-color: #f0b0aa; }
    .vp-btn.danger:hover { background: #fdf0ee; }
    .vp-row { border-bottom: 1px solid #f0f0f0; transition: background 0.1s; }
    .vp-row:hover { background: #fafafa; }
    .vp-row.vp-row-selected { background: #eef3fd; }
    .vp-row.vp-row-selected:hover { background: #e6edfb; }
 
    .vp-sale-badge {
      display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 600;
      padding: 1px 6px; border-radius: 99px;
      background: #e6f4ea; color: #1e7e34; vertical-align: middle;
    }
    .vp-summary-item {
      padding: 8px 10px; border-radius: 5px; background: #fff;
      border: 1px solid #e8e8e8; margin-bottom: 6px; font-size: 12px; line-height: 1.5;
    }
    .vp-result-block { margin-bottom: 18px; }
    .vp-result-block table {
      width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px;
    }
    .vp-result-block th, .vp-result-block td {
      padding: 5px 8px; text-align: center;
      border: 1px solid #e0e0e0;
    }
    .vp-result-block thead th { background: #f5f5f5; font-weight: 600; color: #444; }
    .vp-result-title { font-size: 13px; font-weight: 600; color: #111; margin-bottom: 2px; }
    .vp-result-meta { font-size: 12px; color: #666; margin-bottom: 4px; }
  `;
 
  function injectStyles() {
    if (document.getElementById('vp-styles')) return;
    const s = document.createElement('style');
    s.id = 'vp-styles';
    s.textContent = STYLES;
    document.head.appendChild(s);
  }
 
  // ─── Panel ─────────────────────────────────────────────────────────────────
  function createPanel() {
    injectStyles();
    const panel = document.createElement('div');
    panel.id = 'vp-panel';
    panel.style.cssText = `
      position: fixed; top: 120px; left: 50px; width: 1720px;
      height: 82vh; background: #fff; border: 1px solid #ddd;
      border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      z-index: 10000; display: flex; flex-direction: column; overflow: hidden;
    `;
 
    panel.innerHTML = `
      <!-- Header -->
      <div id="vp-header" style="
        display: flex; justify-content: space-between; align-items: center;
        padding: 9px 14px; background: #fff; border-bottom: 1px solid #e8e8e8;
        flex-shrink: 0;
      ">
        <div id="vp-title-spacer" style="width: 40px;"></div>
        <span id="vp-title" style="font-size: 14px; font-weight: 600; color: #111; letter-spacing: -0.01em; flex: 1; text-align: left; padding-left: 8px;">Volume Pricing Tool</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="vp-clear-summary" class="vp-btn danger">Clear summary</button>
          <button id="vp-toggle" style="
            background: none; border: none; font-size: 18px; line-height: 1;
            color: #888; padding: 0 2px; display: flex; align-items: center;
          ">&#x2212;</button>
          <button id="vp-close" style="
            background: none; border: none; font-size: 18px; line-height: 1;
            color: #888; padding: 0 2px; display: flex; align-items: center;
          ">&#x2715;</button>
        </div>
      </div>
 
      <!-- Controls -->
      <div id="vp-controls" style="
        display: flex; gap: 12px; align-items: center; padding: 8px 14px;
        background: #fafafa; border-bottom: 1px solid #ebebeb; flex-shrink: 0; flex-wrap: wrap;
      ">
        <div style="display: flex; align-items: center; gap: 6px;">
          <label style="font-size: 12px; color: #666; white-space: nowrap;">Search</label>
          <input type="search" id="vp-search" placeholder="Filter courses…"
            style="width: 160px;" />
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <label style="font-size: 12px; color: #666; white-space: nowrap;">Qty</label>
          <input type="number" id="vp-qty" value="${selectedQty}" min="1" style="width: 58px;" />
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <label style="font-size: 12px; color: #666; white-space: nowrap;">Extra tiers</label>
          <select id="vp-tiers">
            <option value="0" selected>0</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
        <a href="/cdn/projects/VolumePricing/SafetyUnlimitedAPQuote.docx" target="_blank"
          style="font-size: 12px; color: #1a73e8; text-decoration: none; font-weight: 500; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
          &#8595; SUI AP Quote Template Download
        </a>
      </div>
 
      <!-- Scrollable body: left course list + right quote panel -->
      <div id="vp-body" style="display: flex; flex-direction: row; overflow: hidden; flex: 1; min-height: 0;">
 
        <!-- LEFT: Course list -->
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; border-right: 1px solid #e8e8e8; overflow: hidden;">
          <div id="vp-courses" style="overflow-y: auto; flex: 1; min-height: 0;"></div>
        </div>
 
        <!-- RIGHT: Quote panel -->
        <div id="vp-quote-panel" style="
          width: 760px; flex-shrink: 0; display: flex; flex-direction: column;
          background: #fafafa; overflow: hidden;
        ">
          <div style="
            padding: 8px 14px; border-bottom: 1px solid #e8e8e8; flex-shrink: 0;
            font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.05em;
            background: #fff;
          ">Quote</div>
          <div id="vp-result" style="padding: 10px 14px 0; overflow-y: auto; flex: 1; min-height: 0;"></div>
          <div id="vp-summary" style="padding: 8px 14px 12px; flex-shrink: 0; border-top: 1px solid #e8e8e8;"></div>
        </div>
 
      </div>
    `;
 
    document.body.appendChild(panel);
 
    // Toggle minimize — collapses to a small pill showing just the title
    document.getElementById('vp-toggle').onclick = () => {
      isMinimized = !isMinimized;
      const controls = document.getElementById('vp-controls');
      const body = document.getElementById('vp-body');
      const clearBtn = document.getElementById('vp-clear-summary');
      const titleWrap = document.getElementById('vp-title-wrap');
      if (isMinimized) {
        controls.style.display = 'none';
        body.style.display = 'none';
        clearBtn.style.display = 'none';
        panel.style.width = 'auto';
        panel.style.height = 'auto';
        panel.style.top = 'auto';
        panel.style.bottom = '20px';
        panel.style.left = 'auto';
        panel.style.right = '20px';
        panel.style.borderRadius = '20px';
        panel.style.background = 'linear-gradient(135deg, rgb(102, 126, 234) 0%, rgb(118, 75, 162) 100%)';
        panel.style.border = 'none';
        panel.style.boxShadow = '0 4px 15px rgba(102,126,234,0.4)';
        document.getElementById('vp-header').style.background = 'transparent';
        document.getElementById('vp-header').style.borderBottom = 'none';
        document.getElementById('vp-header').style.justifyContent = 'flex-start';
        document.getElementById('vp-title-spacer').style.display = 'none';
        document.getElementById('vp-title').style.flex = '0 0 auto';
        document.getElementById('vp-title').style.paddingLeft = '4px';
        document.getElementById('vp-title').style.paddingRight = '16px';
        document.getElementById('vp-title').style.color = '#fff';
        document.getElementById('vp-toggle').style.color = '#fff';
        document.getElementById('vp-close').style.color = '#fff';
        document.getElementById('vp-toggle').innerHTML = '&#x2b;';
      } else {
        controls.style.display = 'flex';
        body.style.display = 'flex';
        clearBtn.style.display = '';
        panel.style.width = '1720px';
        panel.style.height = '82vh';
        panel.style.top = '120px';
        panel.style.bottom = 'auto';
        panel.style.left = '50px';
        panel.style.right = 'auto';
        panel.style.borderRadius = '8px';
        panel.style.background = '#fff';
        panel.style.border = '1px solid #ddd';
        panel.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
        document.getElementById('vp-header').style.background = '#fff';
        document.getElementById('vp-header').style.borderBottom = '1px solid #e8e8e8';
        document.getElementById('vp-header').style.justifyContent = 'space-between';
        document.getElementById('vp-title-spacer').style.display = '';
        document.getElementById('vp-title').style.flex = '1';
        document.getElementById('vp-title').style.paddingLeft = '8px';
        document.getElementById('vp-title').style.paddingRight = '0';
        document.getElementById('vp-title').style.color = '#111';
        document.getElementById('vp-toggle').style.color = '#888';
        document.getElementById('vp-close').style.color = '#888';
        document.getElementById('vp-toggle').innerHTML = '&#x2212;';
      }
    };
 
    // Close button — removes the panel entirely
    document.getElementById('vp-close').onclick = () => {
      panel.remove();
      const styleEl = document.getElementById('vp-styles');
      if (styleEl) styleEl.remove();
    };
 
    document.getElementById('vp-qty').addEventListener('input', e => {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val) && val > 0) selectedQty = val;
    });
 
    document.getElementById('vp-tiers').addEventListener('change', e => {
      selectedTiers = e.target.value;
    });
 
    document.getElementById('vp-search').addEventListener('input', e => {
      filterText = e.target.value.trim().toLowerCase();
      renderCourses();
    });
 
    document.getElementById('vp-clear-summary').addEventListener('click', () => {
      selectedSummary = [];
      selectedTables = [];
      document.getElementById('vp-result').innerHTML = '';
      document.getElementById('vp-summary').innerHTML = '';
    });
  }
 
  // ─── Course list ───────────────────────────────────────────────────────────
  function renderCourses() {
    const container = document.getElementById('vp-courses');
    if (!container) return;
 
    const grouped = {};
    courseData.forEach(c => {
      if (!grouped[c.category]) grouped[c.category] = [];
      grouped[c.category].push(c);
    });
 
    let html = '';
    for (const [category, list] of Object.entries(grouped)) {
      const filteredList = list.filter(c => c.name.toLowerCase().includes(filterText));
      if (filteredList.length === 0) continue;
 
      const baseCourseGroups = {};
      filteredList.forEach(c => {
        const hasVersion = /\(Version \d+\)/i.test(c.name);
        if (hasVersion) {
          const baseName = c.course;
          if (!baseCourseGroups[baseName]) baseCourseGroups[baseName] = [];
          baseCourseGroups[baseName].push(c);
        } else {
          const uniqueKey = `${c.course}_${c.item}`;
          if (!baseCourseGroups[uniqueKey]) baseCourseGroups[uniqueKey] = [];
          baseCourseGroups[uniqueKey].push(c);
        }
      });
 
      // Friendly category label (strip trailing whitespace/parens noise)
      const catLabel = category.replace(/\s*\(.*?\)\s*$/, '').trim();
 
      html += `<table style="width:100%; table-layout:fixed; border-collapse:collapse;">
          <colgroup>
            <col style="width:62%">
            <col style="width:14%">
            <col style="width:10%">
            <col style="width:14%">
          </colgroup>
          <thead>
            <tr style="background:#0066cc;">
              <th style="text-align:left; padding:5px 14px; font-size:12px; font-weight:600; color:#fff;">${catLabel}</th>
              <th style="text-align:center; padding:5px 8px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.8); text-transform:uppercase; letter-spacing:0.04em;">Item #</th>
              <th style="text-align:center; padding:5px 8px; font-size:11px; font-weight:600; color:rgba(255,255,255,0.8); text-transform:uppercase; letter-spacing:0.04em;">Price</th>
              <th style="padding:6px 14px;"></th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(baseCourseGroups).map(group => {
              const c = group[0];
              const isSelected = selectedCourse === c.course;
              const versionCount = group.length;
              const versionText = versionCount > 1 ? ` <span style="font-size:11px;color:#888;">(${versionCount} versions)</span>` : '';
              const saleTag = c.sale ? `<span class="vp-sale-badge">Sale</span>` : '';
              const displayName = c.name.replace(/\s*\(Version \d+\)\s*/i, '');
 
              return `<tr class="vp-row${isSelected ? ' vp-row-selected' : ''}">
                <td style="padding:5px 14px; line-height:1.4; color:#111;">
                  ${displayName}${versionText}${saleTag}
                </td>
                <td style="padding:5px 8px; text-align:center; color:#999; font-size:12px; font-variant-numeric:tabular-nums;">${c.item}</td>
                <td style="padding:5px 8px; text-align:center; color:#111; font-variant-numeric:tabular-nums;">$${c.price.toFixed(2)}</td>
                <td style="padding:5px 14px; text-align:right;">
                  <button
                    class="vp-btn${isSelected ? ' selected' : ''}"
                    onclick="selectVP('${c.course.replace(/'/g, "\\'")}')"
                  >${isSelected ? 'Selected' : 'Select'}</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }
 
    container.innerHTML = html || '<div style="padding:20px 14px; color:#aaa; font-style:italic;">No courses found.</div>';
  }
 
  // ─── Select / version modal ────────────────────────────────────────────────
  window.selectVP = function(courseBaseName) {
    const versions = courseData.filter(c => c.course === courseBaseName);
    if (!versions || versions.length === 0) return;
 
    selectedCourse = courseBaseName;
 
    if (versions.length === 1) {
      addQuote(versions, versions);
      return;
    }
 
    // Modal overlay — normal flow wrapper so iframe doesn't collapse
    const modalWrap = document.createElement('div');
    modalWrap.id = 'vp-version-modal';
    modalWrap.style.cssText = `
      position: fixed; top:0; left:0; width:100%; height:100%;
      background: rgba(0,0,0,0.4); display:flex;
      justify-content:center; align-items:center; z-index:11000;
    `;
 
    const box = document.createElement('div');
    box.style.cssText = `
      background:#fff; border-radius:8px; border:1px solid #ddd;
      box-shadow:0 8px 32px rgba(0,0,0,0.16); padding:20px;
      width:480px; max-height:80vh; overflow:auto; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;
    box.innerHTML = `
      <p style="margin:0 0 14px; font-size:14px; font-weight:600; color:#111;">Select versions</p>
      <p style="margin:0 0 12px; font-size:12px; color:#666;">${courseBaseName}</p>
      <div id="vp-version-list" style="margin-bottom:16px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="vp-version-cancel" class="vp-btn">Cancel</button>
        <button id="vp-version-confirm" style="
          background:#1a73e8; color:#fff; border:none; border-radius:5px;
          padding:5px 14px; font-size:12px; font-weight:500; cursor:pointer;
        ">Confirm</button>
      </div>
    `;
    modalWrap.appendChild(box);
    document.body.appendChild(modalWrap);
 
    const listDiv = box.querySelector('#vp-version-list');
    versions.forEach(v => {
      const id = `vp-ver-${v.item}`;
      const wrapper = document.createElement('label');
      wrapper.style.cssText = `
        display:flex; align-items:flex-start; gap:10px; cursor:pointer;
        padding:8px; border-radius:5px; margin-bottom:4px;
        border:1px solid #ebebeb; background:#fafafa;
      `;
      wrapper.innerHTML = `
        <input type="checkbox" id="${id}" checked style="margin-top:2px; flex-shrink:0;">
        <span style="font-size:13px; color:#111; line-height:1.4;">
          ${v.name}
          <br><span style="font-size:11px; color:#888;">Item # ${v.item} &nbsp;·&nbsp; $${v.price.toFixed(2)}</span>
        </span>
      `;
      listDiv.appendChild(wrapper);
    });
 
    box.querySelector('#vp-version-cancel').onclick = () => modalWrap.remove();
    box.querySelector('#vp-version-confirm').onclick = () => {
      const selectedVersions = versions.filter(v => document.getElementById(`vp-ver-${v.item}`).checked);
      if (selectedVersions.length === 0) {
        alert('Please select at least one version.');
        return;
      }
      modalWrap.remove();
      addQuote(selectedVersions, versions);
    };
  };
 
  // ─── Add quote ─────────────────────────────────────────────────────────────
  function addQuote(selectedVersions, allVersions) {
    if (!selectedVersions || selectedVersions.length === 0) return;
 
    const firstVersion = selectedVersions[0];
    const el = document.querySelector('[ng-model="vpc.InObj.NumberCourses"]');
    if (!el) return alert('Volume Pricing input not found on page!');
 
    const scope = window.angular.element(el).scope();
    scope.vpc.ChangeType(firstVersion.price <= 100 ? 'under100' : (firstVersion.sale ? 'sale' : 'regular'));
    scope.vpc.InObj.NumberCourses = selectedQty;
    scope.vpc.InObj.RegularPrice = firstVersion.price;
    scope.vpc.InObj.PlusRows = selectedTiers;
    scope.$apply();
    scope.vpc.Calculate();
 
    setTimeout(() => {
      const h3s = Array.from(document.querySelectorAll('h3'));
      let quoteTable = null;
      for (const h3 of h3s) {
        if (h3.textContent.trim() === 'Quoted Amount') {
          let next = h3.nextElementSibling;
          while (next && next.tagName !== 'TABLE') next = next.nextElementSibling;
          if (next) quoteTable = next;
          break;
        }
      }
      if (!quoteTable) return;
 
      const cloned = quoteTable.cloneNode(true);
      cloned.style.cssText = 'width:100%; margin-top:8px; border-collapse:collapse;';
      cloned.querySelectorAll('th, td').forEach(cell => {
        cell.style.cssText = 'text-align:center; border:1px solid #e0e0e0; padding:5px 8px; font-size:12px;';
      });
      cloned.querySelectorAll('thead th').forEach(th => {
        th.style.background = '#f5f5f5';
        th.style.fontWeight = '600';
        th.style.color = '#444';
      });
 
      const headerRow = cloned.querySelector('thead tr');
      if (headerRow) {
        const headers = ['Quantity','% Total','Disc./Course','Price/Course','Disc. Total','Reg. Total','Savings'];
        const ths = headerRow.querySelectorAll('th');
        headers.forEach((text, i) => { if (ths[i]) ths[i].textContent = text; });
      }
 
      const firstDataRow = quoteTable.querySelector('tbody tr');
      let pricePerCourse = firstVersion.price.toFixed(2);
      let discTotal = '';
      if (firstDataRow) {
        const cells = firstDataRow.querySelectorAll('td');
        if (cells[3]) {
          const priceText = cells[3].textContent.trim().replace('$', '');
          if (priceText) pricePerCourse = priceText;
        }
        if (cells[4]) discTotal = cells[4].textContent.trim();
      }
 
      let itemNumberDisplay = '';
      if (allVersions.length > 1 && selectedVersions.length === allVersions.length) {
        itemNumberDisplay = selectedVersions[0].item.slice(0, 5) + 'XXXX';
      } else if (allVersions.length > 1) {
        itemNumberDisplay = selectedVersions.map(v => v.item).join(', ');
      } else {
        itemNumberDisplay = selectedVersions[0].item;
      }
 
      const versionNumbers = selectedVersions.map(v => {
        const idx = allVersions.findIndex(av => av.item === v.item);
        return idx + 1;
      }).join(',');
 
      const versionInfo = allVersions.length > 1
        ? ` (Version${selectedVersions.length > 1 ? 's' : ''} ${versionNumbers})`
        : '';
 
      const displayName = selectedVersions[0].name.replace(/\s*\(Version \d+\)\s*/i, '');
 
      selectedSummary.push(`${selectedQty} – ${displayName}${versionInfo}\nItem # ${itemNumberDisplay} @ $${pricePerCourse} each = ${discTotal}`);
      selectedTables.push({
        course: firstVersion,
        table: cloned,
        versionNumbers,
        itemNumberDisplay,
        hasMultipleVersions: allVersions.length > 1,
        displayName,
        pricePerCourse,
        discTotal
      });
 
      // Render results
      const resultDiv = document.getElementById('vp-result');
      resultDiv.innerHTML = '';
      selectedTables.forEach(({ course, table, versionNumbers, itemNumberDisplay, hasMultipleVersions, displayName }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'vp-result-block';
        const versionDisplay = hasMultipleVersions
          ? ` <span style="font-weight:400;color:#666;">(Version${versionNumbers.includes(',') ? 's' : ''} ${versionNumbers})</span>`
          : '';
        wrapper.innerHTML = `
          <div style="margin: 0 0 6px; line-height: 1.6;">
            <div style="font-size: 13px; font-weight: 600; color: #111;">${displayName}${versionDisplay}</div>
            <div style="font-size: 12px; font-weight: 400; color: #111;">Item # ${itemNumberDisplay} &nbsp;·&nbsp; Regular price: $${course.price.toFixed(2)}</div>
          </div>
        `;
        wrapper.appendChild(table);
        resultDiv.appendChild(wrapper);
      });
 
      // Render summary
      const summaryDiv = document.getElementById('vp-summary');
      summaryDiv.innerHTML = `<div style="font-size:11px; font-weight:600; color:#888; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">AP Payment Link Summary</div>` +
        selectedSummary.map(s => {
          const lines = s.split('\n');
          return `<div class="vp-summary-item">
            <div style="font-size:12px; color:#111; line-height:1.6; white-space:normal; word-break:break-word;">${lines[0]}${lines[1] ? ' &nbsp;' + lines[1] : ''}</div>
          </div>`;
        }).join('');
 
      // quote panel always visible
      renderCourses();
    }, 300);
  }
 
  // ─── Page detection & lifecycle ───────────────────────────────────────────
  function isVolumePricingSummaryPage() {
    return window.location.href.includes('#/volume-pricing/summary');
  }
 
  function startVolumePricingUI() {
    initInterval = setInterval(() => {
      if (document.querySelector('[ng-model="vpc.InObj.NumberCourses"]')) {
        clearInterval(initInterval);
        initInterval = null;
        createPanel();
        renderCourses();
      }
    }, 500);
  }
 
  function handleURLChange() {
    const panel = document.getElementById('vp-panel');
    if (isVolumePricingSummaryPage()) {
      if (!panel) startVolumePricingUI();
    } else {
      if (panel) panel.remove();
      const styleEl = document.getElementById('vp-styles');
      if (styleEl) styleEl.remove();
      if (initInterval) clearInterval(initInterval);
      selectedCourse = null;
      filterText = '';
      selectedQty = 10;
      selectedTiers = "0";
      selectedSummary = [];
      selectedTables = [];
    }
  }
 
  function hookHistoryMethod(methodName) {
    const original = history[methodName];
    return function () {
      const result = original.apply(this, arguments);
      window.dispatchEvent(new Event('locationchange'));
      return result;
    };
  }
 
  history.pushState = hookHistoryMethod('pushState');
  history.replaceState = hookHistoryMethod('replaceState');
 
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
  window.addEventListener('hashchange', () => window.dispatchEvent(new Event('locationchange')));
  window.addEventListener('locationchange', handleURLChange);
 
  handleURLChange();
})();
