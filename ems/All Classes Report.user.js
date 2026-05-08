// ==UserScript==
// @name         Run Report for All Classes - admin/reports/ems/
// @namespace    https://otsystems.net/
// @version      1.3
// @description  Popup UI to run reports by class and date
// @match        https://otsystems.net/admin/reports/ems/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const hazwoperCourses = [
    { Course_Name: "Emergency Medical Technician (EMT) Initial (In-person California Approved)", Version: null, ID: 2276 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online", Version: null, ID: 1246 },
    { Course_Name: "OSHA 32 Hour HAZWOPER - Online", Version: null, ID: 1248 },
    { Course_Name: "OSHA 24 Hour HAZWOPER Online", Version: null, ID: 1247 },
    { Course_Name: "OSHA 16 Hour HAZWOPER Upgrade (to the 40 Hour) - Online 16 Hour HAZWOPER Upgrade Online", Version: "16 Hour HAZWOPER Upgrade Online", ID: 1249 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor (Initial) OSHA 8 Hour HAZWOPER Supervisor", Version: "OSHA 8 Hour HAZWOPER Supervisor", ID: 1269 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher - Online Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 2214 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher - Online Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 2217 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher - Online Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 2218 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher - Online Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 2221 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 2215 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 2216 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 2219 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher with Wallet ID Card Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 2220 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 1250 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 1257 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher Version 3 (Mobile Ready) - Includes: Physical Hazards and Supervision", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Supervision", ID: 1332 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher Version 4 (Mobile Ready) - Includes: HAZWOPER Programs and Supervision", Version: "Version 4 (Mobile Ready) - Includes: HAZWOPER Programs and Supervision", ID: 1333 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 1251 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 1256 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card Version 3 (Mobile Ready) - Includes: Physical Hazards and Supervision", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Supervision", ID: 1334 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher with Wallet ID Card Version 4 (Mobile Ready) - Includes: HAZWOPER Programs and Supervision", Version: "Version 4 (Mobile Ready) - Includes: HAZWOPER Programs and Supervision", ID: 1335 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS", Version: null, ID: 1150 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS With Wallet ID Card", Version: null, ID: 1151 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS", Version: null, ID: 1150 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS With Wallet ID Card", Version: null, ID: 1151 },
    { Course_Name: "Laboratory Bloodborne Pathogens (Needle Sharps Program)", Version: null, ID: 1393 },
    { Course_Name: "OSHA Respiratory Protection Training", Version: null, ID: 1221 },
    { Course_Name: "EMS-CE (4 hours) - Hazardous Materials First Responder Awareness (FRA) Level I Responder for EMS (With Downloadable ERG)", Version: null, ID: 2166 },
    { Course_Name: "EMS-CE (2 hours) - MCI START Triage", Version: null, ID: 1473 },
    { Course_Name: "EMS-CE (2 hours) - Anaphylaxis Online Continuing Education", Version: null, ID: 1452 },
    { Course_Name: "EMS-CE (1 hour) - Glasgow Coma Scale Online Continuing Education", Version: null, ID: 1456 },
    { Course_Name: "EMS-CE (1 hour) - Methicillin-Resistant Staphylococcus Aureus (MRSA)", Version: null, ID: 1457 },
    { Course_Name: "EMS-CE (1 hour) - Vancomycin-Resistant Enterococcus (VRE)", Version: null, ID: 1455 },
    { Course_Name: "EMS-CE (1 hour) - Introduction to Emergency Medical Care", Version: null, ID: 1458 },
    { Course_Name: "EMS-CE (1 hour) - Lifting and Moving Patients", Version: null, ID: 1459 },
    { Course_Name: "EMS-CE (1 hour) - Cardiac Emergencies", Version: null, ID: 1460 },
    { Course_Name: "EMS-CE (1 hour) - Bleeding, Shock, and Renal Emergencies", Version: null, ID: 1461 },
    { Course_Name: "EMS-CE (1 hour) - Abdominal Emergencies, Chest and Abdominal Trauma", Version: null, ID: 1463 },
    { Course_Name: "EMS-CE (1 hour) - Anatomy, Physiology and General Pharmacology", Version: null, ID: 1462 },
    { Course_Name: "EMS-CE (1 hour) - Diabetic Emergencies, Altered Mental Status, and Allergic Reactions", Version: null, ID: 1464 },
    { Course_Name: "EMS-CE (1 hour) - Communication, Terminology, and Scene Size-up", Version: null, ID: 1465 },
    { Course_Name: "EMS-CE (1 hour) - Trauma to the Head, Neck, and Spine", Version: null, ID: 1479 },
    { Course_Name: "EMS-CE (1 hour) - Pediatric Emergencies", Version: null, ID: 1483 },
    { Course_Name: "EMS-CE (1 hour) - Stroke", Version: null, ID: 1508 },
    { Course_Name: "EMS-CE (1 hour) - Trauma Triage, Central Nervous (CNS) System Injuries, and Hemorrhage Control", Version: null, ID: 1614 },
    { Course_Name: "EMS-CE (1 hour) - The Primary Assessment and Vital Signs/Monitoring Devices", Version: null, ID: 1618 },
    { Course_Name: "EMS-CE (1 hour) - The Secondary Assessment - Medical,Trauma, and Reassessment", Version: null, ID: 1619 },
    { Course_Name: "EMS-CE (1.5 hour) - At-Risk Populations, Ambulance Safety, and EMS Provider Hygiene", Version: null, ID: 1623 },
    { Course_Name: "EMS-CE (1.5 hour) - OB Emergencies, Psychiatric, Behavioral and Toxicological Emergencies", Version: null, ID: 1624 },
    { Course_Name: "EMS-CE (1 hour) - Musculoskeletal and Multi-System Trauma", Version: null, ID: 1625 },
    { Course_Name: "EMS-CE (1.5 hours) - Ventilation and Oxygenation", Version: null, ID: 1571 },
    { Course_Name: "VCFD 2012 Bloodborne Pathogens Training - Test Only", Version: null, ID: 843 },
    { Course_Name: "VCFD 2012 Cervical Spine Immobilization Refresher", Version: null, ID: 856 },
    { Course_Name: "VCFD BLS/ALS Capnography 2013 Spring Update", Version: null, ID: 1029 },
    { Course_Name: "VCFD S-190", Version: null, ID: 139 },
    { Course_Name: "ICS-100", Version: null, ID: 197 },
    { Course_Name: "VCFD I-100", Version: null, ID: 136 },
    { Course_Name: "VCFD ICS-200", Version: null, ID: 140 },
    { Course_Name: "King Airway and ResQPOD (Full Course)", Version: null, ID: 329 },
    { Course_Name: "VCFD EMS Bulletin #23 - Choking: A Consideration in Cardiac Arrest", Version: null, ID: 1064 },
    { Course_Name: "King Airway and ResQPOD (Test Only)", Version: null, ID: 334 },
    { Course_Name: "VCFD Basic MCI Training", Version: null, ID: 1080 },
    { Course_Name: "VCFD Heat-related Emergencies", Version: null, ID: 1079 },
    { Course_Name: "VCFD 2013 Bloodborne Pathogens Training", Version: null, ID: 1054 },
    { Course_Name: "VCFD 2013 Bloodborne Pathogens Training - Test Only", Version: null, ID: 1055 },
    { Course_Name: "VCFD 2014 Bloodborne Pathogens Training", Version: null, ID: 1113 },
    { Course_Name: "VCFD 2015 Cardiac Arrest Management (CAM)", Version: null, ID: 1128 },
    { Course_Name: "VILT Pre-Training Information Meeting", Version: null, ID: 1639 },
    { Course_Name: "DFG Bloodborne Pathogens", Version: null, ID: 1144 },
    { Course_Name: "DFG Hazard Communication Training (HAZCOM)", Version: null, ID: 968 },
    { Course_Name: "DFG HAZWOPER Refresher", Version: null, ID: 1061 },
    { Course_Name: "DFG Hearing Conservation Training", Version: null, ID: 1367 },
    { Course_Name: "ICS-100 Introduction to the Incident Command System", Version: null, ID: 1647 },
    { Course_Name: "ICS-700 National Incident Management System", Version: null, ID: 1773 },
    { Course_Name: "Flood Cleanup Awareness Training", Version: null, ID: 1361 },
    { Course_Name: "DOT Reasonable Suspicion for Supervisors", Version: null, ID: 1480 },
    { Course_Name: "Online Alcohol and Drugs in the Workplace Training", Version: null, ID: 1313 },
    { Course_Name: "Online Job Stress Prevention Training", Version: null, ID: 1314 },
    { Course_Name: "Online Sexual Discrimination & Harassment Prevention Training", Version: null, ID: 1726 },
    { Course_Name: "Online Introduction to Supervision & Leadership Training", Version: null, ID: 1315 },
    { Course_Name: "Online Work Schedules & Working Alone Training", Version: null, ID: 1316 },
    { Course_Name: "Online Human Resources Manager Training (Package of 4 classes)", Version: null, ID: 1317 },
    { Course_Name: "24 Hour Hazardous Materials Technician Level III Responder - Online", Version: null, ID: 2162 },
    { Course_Name: "24 Hour Hazardous Materials Technician Level III Responder - 16 Hours Online (With Verifiable Part 1 (FRO) Prerequisite)", Version: null, ID: 1756 },
    { Course_Name: "16 Hour Hazardous Materials Technician Level III Responder - Online (16 Hours of Online Training to be combined w/8 Hours of Classroom Training done by the Employer)", Version: null, ID: 2161 },
    { Course_Name: "Hazardous Materials Incident Commander Level V Responder Refresher Online (4 Hour)", Version: "Version 1 - Private Sector w/Basic ICS & Animated Video Series", ID: 1171 },
    { Course_Name: "Hazardous Materials Technician Level III Responder Refresher Online (8 Hour)", Version: "Version 1 - Includes 2024 ERG, Animated Video Series & Online Tabletop Exercise", ID: 2188 },
    { Course_Name: "Hazardous Materials Technician Level III Responder Refresher Online (8 Hour)", Version: "Version 2 - Includes Incident Command & Animated Videos", ID: 1759 },
    { Course_Name: "Hazardous Materials Technician Level III Responder Refresher Online (8 Hour)", Version: "Version 3 - Includes PPE & Online Tabletop Exercise", ID: 1760 },
    { Course_Name: "Hazardous Materials Technician Level III Responder Refresher Online (4 Hour)", Version: "Version 1 - Includes 2024 ERG, Site Control & Incident Safety", ID: 2189 },
    { Course_Name: "Hazardous Materials Technician Level III Responder Refresher Online (4 Hour)", Version: "Version 2 - Focuses on Basic PPE for the Hazmat Technician", ID: 1762 },
    { Course_Name: "Hazardous Materials Technician Level III Responder Refresher Online (4 Hour)", Version: "Version 3 - Includes Incident Command, Animated Videos & Online Tabletop Exercise", ID: 1763 },
    { Course_Name: "Hazardous Materials First Responder Operations (FRO) Level II Responder (Includes Mailed ERG)", Version: null, ID: 2168 },
    { Course_Name: "Hazardous Materials First Responder Operations (FRO) Level II Responder (Includes Downloadable ERG)", Version: null, ID: 2195 },
    { Course_Name: "Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (8 Hour) (Includes Mailed ERG)", Version: null, ID: 2171 },
    { Course_Name: "Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (8 Hour) (Includes Downloadable ERG)", Version: null, ID: 2192 },
    { Course_Name: "Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (4 Hour) (Includes Mailed ERG)", Version: null, ID: 2170 },
    { Course_Name: "Hazardous Materials First Responder Operations (FRO) Level II Responder Refresher (4 Hour) (Includes Downloadable ERG)", Version: null, ID: 2193 },
    { Course_Name: "Hazardous Materials First Responder Awareness (FRA) Level I Responder (Includes Mailed ERG)", Version: null, ID: 2165 },
    { Course_Name: "Hazardous Materials First Responder Awareness (FRA) Level I Responder (Includes Downloadable ERG)", Version: null, ID: 2186 },
    { Course_Name: "Hazardous Materials First Responder Awareness (FRA) Level I Responder Refresher (Includes Mailed ERG)", Version: null, ID: 2167 },
    { Course_Name: "Hazardous Materials First Responder Awareness (FRA) Level I Responder Refresher (Includes Downloadable ERG)", Version: null, ID: 2187 },
    { Course_Name: "Hazardous Materials First Responder Awareness (FRA) Level I Responder for Law Enforcement (Includes Mailed ERG)", Version: null, ID: 2158 },
    { Course_Name: "Hazardous Materials First Responder Awareness (FRA) Level I Responder for Law Enforcement (Includes Downloadable ERG)", Version: null, ID: 2183 },
    { Course_Name: "Using the Current Emergency Response Guidebook (Includes Mailed ERG)", Version: null, ID: 2173 },
    { Course_Name: "Using the Current Emergency Response Guidebook (Includes Downloadable ERG)", Version: null, ID: 2172 },
    { Course_Name: "Back Safety in the Workplace", Version: null, ID: 1286 },
    { Course_Name: "Confined Space Awareness Training", Version: null, ID: 1640 },
    { Course_Name: "Confined Space Awareness Training with Wallet ID Card", Version: null, ID: 1641 },
    { Course_Name: "Fall Prevention for Construction", Version: null, ID: 1769 },
    { Course_Name: "Hearing Conservation Training", Version: null, ID: 1356 },
    { Course_Name: "Hearing Conservation Training with Wallet ID", Version: null, ID: 1357 },
    { Course_Name: "Heat Illness Prevention for Employees", Version: null, ID: 1199 },
    { Course_Name: "Heat Illness Prevention for Supervisors", Version: null, ID: 1200 },
    { Course_Name: "Health and Safety Management", Version: null, ID: 1327 },
    { Course_Name: "Introduction to Industrial Hygiene", Version: null, ID: 1300 },
    { Course_Name: "Introduction to Job Hazard Analysis (JHA)", Version: null, ID: 1303 },
    { Course_Name: "Personal Protective Equipment (PPE) Program and Selection", Version: null, ID: 1318 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 1852 },
    { Course_Name: "OSHA 32 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 2077 },
    { Course_Name: "OSHA 24 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 1996 },
    { Course_Name: "OSHA 16 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 2078 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher - Online (Spanish)", Version: null, ID: 1947 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (Spanish)", Version: null, ID: 1985 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher (Spanish)", Version: null, ID: 2223 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher With Wallet ID Card (Spanish)", Version: null, ID: 2224 },
    { Course_Name: "Back Safety in the Workplace (Spanish)", Version: null, ID: 1766 },
    { Course_Name: "Hearing Conservation Training (Spanish)", Version: null, ID: 2058 },
    { Course_Name: "Hearing Conservation Training w/Wallet ID (Spanish)", Version: null, ID: 2059 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS with Wallet ID Card (Spanish)", Version: null, ID: 1198 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS (Spanish)", Version: null, ID: 1197 },
    { Course_Name: "OSHA Respiratory Protection Training (Spanish)", Version: null, ID: 1471 },
    { Course_Name: "OSHA Respiratory Protection Refresher Training (Spanish)", Version: null, ID: 1472 },
    { Course_Name: "Asbestos Awareness Online (Spanish)", Version: null, ID: 1330 },
    { Course_Name: "Asbestos Awareness Online With Wallet ID Card (Spanish)", Version: null, ID: 1337 },
    { Course_Name: "OSHA Hydrogen Sulfide (H2S) Awareness (Spanish)", Version: null, ID: 1498 },
    { Course_Name: "OSHA Hydrogen Sulfide (H2S) Awareness With Wallet ID Card (Spanish)", Version: null, ID: 1742 },
    { Course_Name: "Lead Awareness for General Industry Online (Spanish)", Version: null, ID: 2056 },
    { Course_Name: "Lead Awareness for General Industry Online with Wallet ID (Spanish)", Version: null, ID: 2057 },
    { Course_Name: "Silica Awareness for Construction Online (Spanish)", Version: null, ID: 2053 },
    { Course_Name: "Silica Awareness for Construction Online with Wallet ID Card (Spanish)", Version: null, ID: 2054 },
    { Course_Name: "Heat Illness Prevention for Employees (Spanish)", Version: null, ID: 1359 },
    { Course_Name: "Heat Illness Prevention for Supervisors (Spanish)", Version: null, ID: 1403 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (Spanish) (restricted navigation)", Version: null, ID: 2139 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards (restricted navigation)", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 2138 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations (restricted navigation)", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 2136 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE (restricted navigation)", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 2135 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 4 (Mobile Ready) - Includes: Using Respirators and CPC (restricted navigation)", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 2137 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online (90%)", Version: null, ID: 1276 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online (Spanish) (90%)", Version: null, ID: 999 },
    { Course_Name: "Hydrogen Sulfide Awareness w/Wallet ID Card (70% Exam, 2 Attempt Max)", Version: null, ID: 1390 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (Spanish) (90%)", Version: null, ID: 951 },
    { Course_Name: "Hydrogen Sulfide Awareness (80% Exam, 2 Attempt Max)", Version: null, ID: 1383 },
    { Course_Name: "Hydrogen Sulfide Awareness w/Wallet ID Card (80% Exam, 2 Attempt Max)", Version: null, ID: 1384 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor (Initial) (90%)", Version: null, ID: 1326 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 1277 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 1278 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 1279 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 1280 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 1281 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 1282 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 1283 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 1284 },
    { Course_Name: "Infantile Torticollis and Plagiocephaly", Version: null, ID: 1887 },
    { Course_Name: "Back Injuries:  Return To Work Programs and Safe Lifting Techniques", Version: null, ID: 1382 },
    { Course_Name: "A Parent's Guide to Torticollis & Plagiocephaly", Version: null, ID: 1635 },
    { Course_Name: "Back Safety in the Workplace", Version: null, ID: 1286 },
    { Course_Name: "Confined Space Awareness Training", Version: null, ID: 1640 },
    { Course_Name: "Confined Space Awareness Training with Wallet ID Card", Version: null, ID: 1641 },
    { Course_Name: "Fall Prevention for Construction", Version: null, ID: 1769 },
    { Course_Name: "Hearing Conservation Training", Version: null, ID: 1356 },
    { Course_Name: "Hearing Conservation Training with Wallet ID", Version: null, ID: 1357 },
    { Course_Name: "Heat Illness Prevention for Employees", Version: null, ID: 1199 },
    { Course_Name: "Heat Illness Prevention for Supervisors", Version: null, ID: 1200 },
    { Course_Name: "Health and Safety Management", Version: null, ID: 1327 },
    { Course_Name: "Introduction to Industrial Hygiene", Version: null, ID: 1300 },
    { Course_Name: "Introduction to Job Hazard Analysis (JHA)", Version: null, ID: 1303 },
    { Course_Name: "Personal Protective Equipment (PPE) Program and Selection", Version: null, ID: 1318 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 1852 },
    { Course_Name: "OSHA 32 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 2077 },
    { Course_Name: "OSHA 24 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 1996 },
    { Course_Name: "OSHA 16 Hour HAZWOPER - Online (Spanish)", Version: null, ID: 2078 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher - Online (Spanish)", Version: null, ID: 1947 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (Spanish)", Version: null, ID: 1985 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher (Spanish)", Version: null, ID: 2223 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor Refresher With Wallet ID Card (Spanish)", Version: null, ID: 2224 },
    { Course_Name: "Back Safety in the Workplace (Spanish)", Version: null, ID: 1766 },
    { Course_Name: "Hearing Conservation Training (Spanish)", Version: null, ID: 2058 },
    { Course_Name: "Hearing Conservation Training w/Wallet ID (Spanish)", Version: null, ID: 2059 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS with Wallet ID Card (Spanish)", Version: null, ID: 1198 },
    { Course_Name: "OSHA Hazard Communication Training Aligned with GHS (Spanish)", Version: null, ID: 1197 },
    { Course_Name: "OSHA Respiratory Protection Training (Spanish)", Version: null, ID: 1471 },
    { Course_Name: "OSHA Respiratory Protection Refresher Training (Spanish)", Version: null, ID: 1472 },
    { Course_Name: "Asbestos Awareness Online (Spanish)", Version: null, ID: 1330 },
    { Course_Name: "Asbestos Awareness Online With Wallet ID Card (Spanish)", Version: null, ID: 1337 },
    { Course_Name: "OSHA Hydrogen Sulfide (H2S) Awareness (Spanish)", Version: null, ID: 1498 },
    { Course_Name: "OSHA Hydrogen Sulfide (H2S) Awareness With Wallet ID Card (Spanish)", Version: null, ID: 1742 },
    { Course_Name: "Lead Awareness for General Industry Online (Spanish)", Version: null, ID: 2056 },
    { Course_Name: "Lead Awareness for General Industry Online with Wallet ID (Spanish)", Version: null, ID: 2057 },
    { Course_Name: "Silica Awareness for Construction Online (Spanish)", Version: null, ID: 2053 },
    { Course_Name: "Silica Awareness for Construction Online with Wallet ID Card (Spanish)", Version: null, ID: 2054 },
    { Course_Name: "Heat Illness Prevention for Employees (Spanish)", Version: null, ID: 1359 },
    { Course_Name: "Heat Illness Prevention for Supervisors (Spanish)", Version: null, ID: 1403 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (Spanish) (restricted navigation)", Version: null, ID: 2139 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards (restricted navigation)", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 2138 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations (restricted navigation)", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 2136 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE (restricted navigation)", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 2135 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (restricted navigation) Version 4 (Mobile Ready) - Includes: Using Respirators and CPC (restricted navigation)", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 2137 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online (90%)", Version: null, ID: 1276 },
    { Course_Name: "OSHA 40 Hour HAZWOPER - Online (Spanish) (90%)", Version: null, ID: 999 },
    { Course_Name: "Hydrogen Sulfide Awareness w/Wallet ID Card (70% Exam, 2 Attempt Max)", Version: null, ID: 1390 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (Spanish) (90%)", Version: null, ID: 951 },
    { Course_Name: "Hydrogen Sulfide Awareness (80% Exam, 2 Attempt Max)", Version: null, ID: 1383 },
    { Course_Name: "Hydrogen Sulfide Awareness w/Wallet ID Card (80% Exam, 2 Attempt Max)", Version: null, ID: 1384 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Supervisor (Initial) (90%)", Version: null, ID: 1326 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 1277 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: "Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", ID: 1278 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 1279 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: "Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", ID: 1280 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 1281 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: "Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", ID: 1282 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher (90%) Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 1283 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card (90%) Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", Version: "Version 4 (Mobile Ready) - Includes: Using Respirators and CPC", ID: 1284 },
    { Course_Name: "Infantile Torticollis and Plagiocephaly", Version: null, ID: 1887 },
    { Course_Name: "Back Injuries:  Return To Work Programs and Safe Lifting Techniques", Version: null, ID: 1382 },
    { Course_Name: "A Parent's Guide to Torticollis & Plagiocephaly", Version: null, ID: 1635 },
    { Course_Name: "WPBFD Hazardous Materials Technician Level III Responder Refresher Online (8 Hour)", Version: null, ID: 2174 },
    { Course_Name: "OSHA 30 Hour Construction Safety Online (AO) - Non-Proctored", Version: null, ID: 1137 },
    { Course_Name: "OSHA 30 Hour Construction Safety Online (AO) - Proctored", Version: null, ID: 1507 },
    { Course_Name: "OSHA 10 Hour Construction Safety Online (AO) - Non-Proctored", Version: null, ID: 1135 },
    { Course_Name: "OSHA 10 Hour Construction Safety Online (AO) - Proctored", Version: null, ID: 1505 },
    { Course_Name: "OSHA 10 Hour General Industry Online (AO) - Non-Proctored", Version: null, ID: 1136 },
    { Course_Name: "OSHA 10 Hour General Industry Online (AO) - Proctored", Version: null, ID: 1506 },
    { Course_Name: "DOT Hazmat: General Awareness/Function Specific (10 Hour)", Version: null, ID: 2222 },
    { Course_Name: "DOT Hazmat: Basic General Awareness (4 Hour)", Version: null, ID: 1245 },
    { Course_Name: "DOT Hazmat: Security Awareness", Version: null, ID: 1299 },
    { Course_Name: "DOT Hazmat: Function Specific - Hazard Classes and Divisions", Version: null, ID: 1293 },
    { Course_Name: "DOT Hazmat: Function Specific - Labeling", Version: null, ID: 1290 },
    { Course_Name: "DOT Hazmat: Function Specific - Marking", Version: null, ID: 1288 },
    { Course_Name: "DOT Hazmat: Function Specific - Packaging", Version: null, ID: 1292 },
    { Course_Name: "DOT Hazmat: Function Specific - Placarding", Version: null, ID: 1291 },
    { Course_Name: "DOT Hazmat: Function Specific - Shipping Batteries", Version: null, ID: 1325 },
    { Course_Name: "DOT Hazmat: Function Specific - Shipping Papers", Version: null, ID: 1240 },
    { Course_Name: "DOT Hazmat: Function Specific - Using the Hazmat Table (HMT)", Version: null, ID: 1285 },
    { Course_Name: "DOT Hazmat: Segregation - Highway", Version: null, ID: 2074 },
    { Course_Name: "DOT Hazmat: Segregation - Air", Version: null, ID: 2073 },
    { Course_Name: "DOT Hazmat: Segregation - Rail", Version: null, ID: 2075 },
    { Course_Name: "DOT Hazmat: Segregation - Vessel", Version: null, ID: 2080 },
    { Course_Name: "DOT Hazmat: Carrier Requirements - Air/IATA", Version: null, ID: 1309 },
    { Course_Name: "DOT Hazmat: Carrier Requirements - Highway", Version: null, ID: 1243 },
    { Course_Name: "DOT Hazmat: Carrier Requirements - Rail", Version: null, ID: 1344 },
    { Course_Name: "DOT Hazmat: Carrier Requirements - Vessel", Version: null, ID: 1345 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher for NC Well Contractors - Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: null, ID: 1321 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card for NC Well Contractors - Version 1 (Mobile Ready) - Includes: Legal Issue and Chemical Hazards", Version: null, ID: 1324 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card for NC Well Contractors - Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: null, ID: 1323 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher for NC Well Contractors - Version 2 (Mobile Ready) - Includes: Toxicology and Waste Site Operations", Version: null, ID: 1320 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher for NC Well Contractors - Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: null, ID: 1319 },
    { Course_Name: "OSHA 8 Hour HAZWOPER Refresher With Wallet ID Card for NC Well Contractors - Version 3 (Mobile Ready) - Includes: Physical Hazards and Basic PPE", Version: null, ID: 1322 },
    { Course_Name: "HeartCode® BLS (Basic Life Support) Online (Requires Follow-up Skills Class) - Online Portion of the BLS Course", Version: null, ID: 1748 },
    { Course_Name: "Heartsaver® Pediatric First Aid CPR AED Online (Requires Follow-up Skills Class) - Online Portion of the Heartsaver® Pediatric First Aid CPR AED Course", Version: null, ID: 1788 },
    { Course_Name: "Heartsaver® First Aid Total with CPR AED Online (Requires Follow-up Skills Class) - Online Portion of the Heartsaver® First Aid Total with CPR AED Course", Version: null, ID: 1939 },
    { Course_Name: "Heartsaver® First Aid Online (Requires Follow-up Skills Class) - Online Portion of the AHA First Aid Course", Version: null, ID: 1789 },
    { Course_Name: "Heartsaver® CPR AED Online (Requires Follow-up Skills Class) - Online Portion of the AHA CPR Course", Version: null, ID: 1790 },
    { Course_Name: "Heartsaver® Bloodborne Pathogens Online - Completely Online Version", Version: null, ID: 1701 },
    { Course_Name: "Mandatory Naloxone, Epinephrine, and Glucometer Training (Required for ALL California EMTs- CAPCE Accredited)", Version: null, ID: 1545 },
    { Course_Name: "EMS-CE (24 Hours) EMT Refresher Topics", Version: null, ID: 1266 },
    { Course_Name: "EMS-CE (48 Hours) Paramedic Refresher Topics", Version: null, ID: 1764 },
    { Course_Name: "EMS-CE (8 hours) - Hazardous Materials First Responder Operations (FRO) Level II Responder", Version: null, ID: 2164 },
    { Course_Name: "EMS-CE (4 hours) - Hazardous Materials First Responder Awareness (FRA) Level I Responder", Version: null, ID: 2163 },
    { Course_Name: "Lead Safety for Renovation Repair and Painting (RRP) - Refresher", Version: null, ID: 1296 },
    { Course_Name: "HeartCode® Advanced Cardiovascular Life Support (ACLS) Online (Requires Follow-up Skills Class Sold Separately) - Online Portion of the ACLS Course", Version: null, ID: 1749 },
    { Course_Name: "HeartCode® Pediatric Advanced Life Support (PALS) Online (Requires Follow-up Skills Class Sold Separately) - Online Portion of the PALS Course", Version: null, ID: 1750 },
    { Course_Name: "Online Continuing Education: Advanced Life Support: Respiratory Emergencies", Version: null, ID: 2037 },
    { Course_Name: "Online Continuing Education: Advanced Life Support: Post-Cardiac Arrest Care", Version: null, ID: 2038 },
    { Course_Name: "Online Continuing Education: Advanced Life Support: Mechanical Circulatory Systems", Version: null, ID: 2039 },
    { Course_Name: "Online Continuing Education: PALS Plus  Post-Cardiac Arrest Care", Version: null, ID: 2041 },
    { Course_Name: "Online Continuing Education: PALS Plus  Ultrasound", Version: null, ID: 2042 },
    { Course_Name: "Online Continuing Education: PALS Plus  Sedation & Analgesia", Version: null, ID: 2043 },
    { Course_Name: "Online Continuing Education: PALS Plus  Technologically Dependent Child (TDC)", Version: null, ID: 2044 },
    { Course_Name: "Online Continuing Education: PALS Plus  Toxicology", Version: null, ID: 2045 },
    { Course_Name: "Online Continuing Education: PALS Plus  Child Abuse", Version: null, ID: 2046 },
    { Course_Name: "Online Continuing Education: PALS Plus  Advanced Airway Management", Version: null, ID: 2047 },
    { Course_Name: "Online Continuing Education: PALS Plus  Trauma - Overview and Approach", Version: null, ID: 2048 },
    { Course_Name: "Online Continuing Education: ACLS Prep: Pharmacology", Version: null, ID: 2050 },
    { Course_Name: "Online Continuing Education: ACLS Prep: ECG", Version: null, ID: 2049 },
    { Course_Name: "30 Hour (F3) NCCP National Component NRP (Paramedic) Refresher (CAPCE Accredited for NREMT) - 2025 NCCP Model", Version: null, ID: 2151 },
    { Course_Name: "15 Hour (F3) NCCP State/Local Component NRP (Paramedic) Refresher (CAPCE Accredited for States/Local w/no specific requirements) - 2025 NCCP Model", Version: null, ID: 2147 },
    { Course_Name: "15 Hour (F3) NCCP Individual Component NRP (Paramedic) Refresher (CAPCE Accredited - Includes Hazmat FRA for EMS) - 2025 NCCP Model", Version: null, ID: 2148 },
    { Course_Name: "25 Hour (F3) NCCP National Component AEMT Refresher (CAPCE Accredited for NREMT) - 2025 NCCP Model", Version: null, ID: 2150 },
    { Course_Name: "12.5 Hour (F3) NCCP State/Local Component AEMT Refresher (CAPCE Accredited for States/Local w/no specific requirements) - 2025 NCCP Model", Version: null, ID: 2146 },
    { Course_Name: "12.5 Hour (F3) NCCP Individual Component AEMT Refresher (CAPCE Accredited - Includes Hazmat FRA for EMS) - 2025 NCCP Model", Version: null, ID: 2145 },
    { Course_Name: "20 Hour (F3) NCCP National Component EMT Refresher (CAPCE Accredited for NREMT) - 2025 NCCP Model", Version: null, ID: 2149 },
    { Course_Name: "10 Hour (F3) NCCP State/Local Component EMT Refresher (CAPCE Accredited for States/Local w/no specific requirements) - 2025 NCCP Model", Version: null, ID: 2143 },
    { Course_Name: "10 Hour (F3) NCCP Individual Component EMT Refresher (CAPCE Accredited - Includes Hazmat FRA for EMS) - 2025 NCCP Model", Version: null, ID: 2144 },
    { Course_Name: "8 Hour (F3) NCCP National Component EMR Refresher (CAPCE Accredited for NREMT) - 2016 NCCP F3 Distributed Learning for National Component", Version: null, ID: 1622 },
    { Course_Name: "8 Hour (F3) NCCP National Component EMR Refresher (CAPCE Accredited for NREMT) - 2025 NCCP F3 Distributed Learning for National Component", Version: null, ID: 2142 },
    { Course_Name: "4 Hour (F3) NCCP State/Local Component EMR Refresher (CAPCE Accredited for States/Local w/no specific requirements) - 2016 NCCP F3 Distributed Learning for the State and Local Components", Version: null, ID: 1630 },
    { Course_Name: "4 Hour (F3) NCCP State/Local Component EMR Refresher (CAPCE Accredited for States/Local w/no specific requirements) - 2025 NCCP F3 Distributed Learning for the State and Local Components", Version: null, ID: 2141 },
    { Course_Name: "4 Hour (F3) NCCP Individual Component EMR Refresher (CAPCE Accredited - Includes Hazmat FRA for EMS) - 2016 NCCP Version 1 - Includes Hazmat FRA for EMS (2024 ERG)", Version: null, ID: 1593 },
    { Course_Name: "4 Hour (F3) NCCP Individual Component EMR Refresher (CAPCE Accredited - Includes Hazmat FRA for EMS) - 2025 NCCP Version 1 - Includes Hazmat FRA for EMS (2020 ERG)", Version: null, ID: 2140 },
    { Course_Name: "Acrylonitrile Awareness Online", Version: null, ID: 1685 },
    { Course_Name: "Asbestos Awareness Online", Version: null, ID: 1312 },
    { Course_Name: "Asbestos Awareness Online with Wallet ID Card", Version: null, ID: 1336 },
    { Course_Name: "Benzene Awareness for General Industry and Construction", Version: null, ID: 1360 },
    { Course_Name: "Benzene Awareness for General Industry and Construction with Wallet ID", Version: null, ID: 1467 },
    { Course_Name: "Beryllium Awareness Online", Version: null, ID: 2081 },
    { Course_Name: "Cotton Dust Awareness", Version: null, ID: 2210 },
    { Course_Name: "1,3-Butadiene Awareness Online", Version: null, ID: 1673 },
    { Course_Name: "Cadmium Awareness for Construction Online", Version: null, ID: 1645 },
    { Course_Name: "Cadmium Awareness for General Industry Online", Version: null, ID: 1662 },
    { Course_Name: "13 Carcinogens Awareness Online", Version: null, ID: 1700 },
    { Course_Name: "Chromium (VI) Awareness Online", Version: null, ID: 1665 },
    { Course_Name: "Ethylene Oxide Awareness Online", Version: null, ID: 1642 },
    { Course_Name: "Formaldehyde Awareness Online", Version: null, ID: 1661 },
    { Course_Name: "OSHA Hydrogen Sulfide (H2S) Awareness Online", Version: null, ID: 1397 },
    { Course_Name: "OSHA Hydrogen Sulfide (H2S) Awareness Online with Wallet ID Card", Version: null, ID: 1396 },
    { Course_Name: "Inorganic Arsenic Awareness for General Industry and Construction", Version: null, ID: 1499 },
    { Course_Name: "Lead Awareness for General Industry Online", Version: null, ID: 1096 },
    { Course_Name: "Lead Awareness for General Industry Online with Wallet ID", Version: null, ID: 1142 },
    { Course_Name: "Methylene Chloride Awareness", Version: null, ID: 1646 },
    { Course_Name: "Silica Awareness for Construction Online", Version: null, ID: 1339 },
    { Course_Name: "Silica Awareness for Construction Online with Wallet ID Card", Version: null, ID: 1340 },
    { Course_Name: "Silica Awareness for General Industry Online", Version: null, ID: 2109 },
    { Course_Name: "Vinyl Chloride Awareness", Version: null, ID: 1532 },
    { Course_Name: "VILT (F5) Cardiac Arrest (2 Hours)  National Component For AEMTs, and NRPs", Version: null, ID: 1889 },
    { Course_Name: "VILT (F5) EMS Research (1 Hour)  National Component For NRPs", Version: null, ID: 1902 },
    { Course_Name: "VILT (F5) EMS Research/Field Triage—Disasters and MCIs (1 Hour)  National Component For AEMTs", Version: null, ID: 1890 },
    { Course_Name: "VILT (F5) Endocrine Emergencies—Diabetes (1 Hour)  National Component For AEMTs, and NRPs", Version: null, ID: 1891 },
    { Course_Name: "VILT (F5) Evidence Based Guidelines/EMS Culture of Safety (1 Hour)  National Component For AEMTs, and NRPs", Version: null, ID: 1892 },
    { Course_Name: "VILT (F5) Field Triage—Disasters and MCIs (1 Hour)  National Component For NRPs", Version: null, ID: 1904 },
    { Course_Name: "VILT (F5) Infectious Diseases/Pain Management (1.5 Hours)  National Component For AEMTs, and NRPs", Version: null, ID: 1905 },
    { Course_Name: "VILT (F5) Medication Delivery (1 Hour)  National Component For AEMTs, and NRPs", Version: null, ID: 1906 },
    { Course_Name: "VILT (F5) Neurological Emergencies—Seizures/Immunological Emergencies (1 Hour)  National Component For AEMTs, and NRPs", Version: null, ID: 1893 },
    { Course_Name: "VILT (F5) Pediatric Cardiac Arrest/Congestive Heart Failure (3 Hours)  National Component For NRPs", Version: null, ID: 1907 },
    { Course_Name: "VILT (F5) Pediatric Cardiac Arrest (2 Hours)  National Component For AEMTs", Version: null, ID: 1894 },
    { Course_Name: "VILT (F5) Pediatric Transport/Crew Resource Management (1.5 Hours)  National Component For AEMTs, and NRPs", Version: null, ID: 1895 },
    { Course_Name: "VILT (F5) Post-Resuscitation Care/Ventricular Assist Devices (1 Hour)  National Component For AEMTs, and NRPs", Version: null, ID: 1914 },
    { Course_Name: "VILT (F5) Special Healthcare Needs (2 Hours)  National Component For NRPs", Version: null, ID: 1909 },
    { Course_Name: "VILT (F5) Special Healthcare Needs (1 Hour)  National Component For AEMTs", Version: null, ID: 1910 },
    { Course_Name: "VILT (F5) The EMS Response to an Active Shooter (2 Hours)  State/Local Component For AEMTs, and NRPs", Version: null, ID: 1896 },
    { Course_Name: "VILT (F5) The EMS Response to Terrorism Incidents (1 Hour)  State/Local Component For AEMTs, and NRPs", Version: null, ID: 1897 },
    { Course_Name: "VILT (F5) Ventilation (2 Hours)  National Component For AEMTs, and NRPs", Version: null, ID: 1911 },
    { Course_Name: "VILT (F5) Cardiac Arrest (2 Hours)  National Component For EMTs", Version: null, ID: 1775 },
    { Course_Name: "VILT (F5) Cardiac Arrest/Infectious Disease/Psychiatric and Behavioral Emergencies (1 Hour)  National Component For EMRs", Version: null, ID: 1901 },
    { Course_Name: "VILT (F5) EMS Research/Field Triage—Disasters and MCIs (1 Hour)  National Component For EMTs", Version: null, ID: 1781 },
    { Course_Name: "VILT (F5) Endocrine Emergencies—Diabetes (1 Hour)  National Component For EMTs, and EMRs", Version: null, ID: 1780 },
    { Course_Name: "VILT (F5) Evidence Based Guidelines/EMS Culture of Safety (1 Hour)  National Component For EMTs", Version: null, ID: 1783 },
    { Course_Name: "VILT (F5) Field Triage - Disasters/MCI's - EMS Provider Hygiene, Safety, and Vaccinations - EMS Culture of Safety (1 Hour)  National Component For EMRs", Version: null, ID: 1903 },
    { Course_Name: "VILT (F5) Infectious Diseases/Pain Management (1 Hour)  National Component For EMTs", Version: null, ID: 1778 },
    { Course_Name: "VILT (F5) Neurological Emergencies—Seizures/Immunological Emergencies (1 Hour)  National Component For EMTs, and EMRs", Version: null, ID: 1779 },
    { Course_Name: "VILT (F5) Pediatric Cardiac Arrest (2 Hours)  National Component For EMTs", Version: null, ID: 1776 },
    { Course_Name: "VILT (F5) Pediatric Cardiac Arrest (1 Hour)  National Component For EMRs", Version: null, ID: 1908 },
    { Course_Name: "VILT (F5) Pediatric Transport/Crew Resource Management (1.5 Hours)  National Component For EMTs", Version: null, ID: 1782 },
    { Course_Name: "VILT (F5) Post-Resuscitation Care/Ventricular Assist Devices (1 Hour)  National Component For EMTs and EMRs", Version: null, ID: 1915 },
    { Course_Name: "VILT (F5) Special Healthcare Needs (1.5 Hours)  National Component For EMTs", Version: null, ID: 1777 },
    { Course_Name: "VILT (F5) The EMS Response to an Active Shooter (2 Hours)  State/Local Component For EMTs", Version: null, ID: 1785 },
    { Course_Name: "VILT (F5) The EMS Response to Terrorism Incidents (1 Hour)  State/Local Component For EMTs", Version: null, ID: 1784 },
    { Course_Name: "EMS-CE (1 Hour) Capnography - for Paramedics", Version: null, ID: 1959 },
    { Course_Name: "EMS-CE (0.5 Hour) Oxygenation - for All Levels", Version: null, ID: 1960 },
    { Course_Name: "EMS-CE (0.5 Hour) Ventilation - for EMRs", Version: null, ID: 1956 },
    { Course_Name: "EMS-CE (1 Hour) Ventilation - for EMTs", Version: null, ID: 1957 },
    { Course_Name: "EMS-CE (2 Hour) Ventilation - for AEMTs and Paramedics", Version: null, ID: 1958 },
    { Course_Name: "EMS-CE (1 Hour) Acute Coronary Syndrome - for AEMTs and Paramedics", Version: null, ID: 1967 },
    { Course_Name: "EMS-CE (0.5 Hour) Cardiac Arrest - for EMRs", Version: null, ID: 1963 },
    { Course_Name: "EMS-CE (2 Hour) Cardiac Arrest - for EMTs, AEMTs, and Paramedics", Version: null, ID: 1972 },
    { Course_Name: "EMS-CE (0.5 Hour) Congestive Heart Failure - for Paramedics", Version: null, ID: 1966 },
    { Course_Name: "EMS-CE (1 Hour) Pediatric Cardiac Arrest - for EMRs", Version: null, ID: 1964 },
    { Course_Name: "EMS-CE (2 Hour) Pediatric Cardiac Arrest - for EMTs and AEMTs", Version: null, ID: 1973 },
    { Course_Name: "EMS-CE (2.5 Hour) Pediatric Cardiac Arrest - for Paramedics", Version: null, ID: 1965 },
    { Course_Name: "EMS-CE (0.5 Hour) Post-Resuscitation Care - for All Levels", Version: null, ID: 1969 },
    { Course_Name: "EMS-CE (0.5 Hour) Stroke - for EMRs", Version: null, ID: 1961 },
    { Course_Name: "EMS-CE (1 Hour) Stroke - for EMTs and AEMTs", Version: null, ID: 1971 },
    { Course_Name: "EMS-CE (1.5 Hour) Stroke - for Paramedics", Version: null, ID: 1962 },
    { Course_Name: "EMS-CE (0.5 Hour) Ventricular Assist Devices - for EMTs, AEMTs, and Paramedics", Version: null, ID: 1970 },
    { Course_Name: "EMS-CE (0.5 Hour) Central Nervous System (CNS) Injury - for EMRs and EMTs", Version: null, ID: 1989 },
    { Course_Name: "EMS-CE (1 Hour) Central Nervous System (CNS) Injury - for AEMTs and Paramedics", Version: null, ID: 1990 },
    { Course_Name: "EMS-CE (0.5 Hour) Fluid Resuscitation - for AEMTs and Paramedics", Version: null, ID: 1992 },
    { Course_Name: "EMS-CE (0.5 Hour) Hemorrhage Control - for EMTs, AEMTs, and Paramedics", Version: null, ID: 1991 },
    { Course_Name: "EMS-CE (0.5 Hour) Trauma Triage - for EMTs", Version: null, ID: 1987 },
    { Course_Name: "EMS-CE (1 Hour) Trauma Triage - for AEMTs and Paramedics", Version: null, ID: 1988 },
    { Course_Name: "EMS-CE (0.5 Hour) Endocrine Emergencies – Diabetes  - for EMRs", Version: null, ID: 2028 },
    { Course_Name: "EMS-CE (1 Hour) Endocrine Emergencies – Diabetes  - for EMTs, AEMTs and Paramedics", Version: null, ID: 2029 },
    { Course_Name: "EMS-CE (0.5 Hour) Immunological Emergencies  - for All Levels", Version: null, ID: 2030 },
    { Course_Name: "EMS-CE (0.25 Hour) Infectious Diseases - for EMRs", Version: null, ID: 2018 },
    { Course_Name: "EMS-CE (0.5 Hour) Infectious Diseases - for EMTs, AEMTs, and Paramedics", Version: null, ID: 2019 },
    { Course_Name: "EMS-CE (1 Hour) Medication Delivery  - for AEMTs and Paramedics", Version: null, ID: 2020 },
    { Course_Name: "EMS-CE (0.5 Hour) Neurological Emergencies – Seizures  - for All Levels", Version: null, ID: 2027 },
    { Course_Name: "EMS-CE (0.5 Hour) OB Emergencies - for All Levels", Version: null, ID: 2017 },
    { Course_Name: "EMS-CE (0.5 Hour) Pain Management  - for EMTs", Version: null, ID: 2021 },
    { Course_Name: "EMS-CE (1 Hour) Pain Management  - for AEMTs and Paramedics", Version: null, ID: 2022 },
    { Course_Name: "EMS-CE (0.25 Hour) Psychiatric and Behavioral Emergencies  - for EMRs", Version: null, ID: 2023 },
    { Course_Name: "EMS-CE (0.5 Hour) Psychiatric and Behavioral Emergencies  - for EMTs", Version: null, ID: 2024 },
    { Course_Name: "EMS-CE (1 Hour) Psychiatric and Behavioral Emergencies  - for AEMTs and Paramedics", Version: null, ID: 2025 },
    { Course_Name: "EMS-CE (1.5 Hour) Special Healthcare Needs  - for EMTs", Version: null, ID: 2014 },
    { Course_Name: "EMS-CE (1 Hour) Special Healthcare Needs  - for AEMTs", Version: null, ID: 2015 },
    { Course_Name: "EMS-CE (2 Hour) Special Healthcare Needs  - for Paramedics", Version: null, ID: 2016 },
    { Course_Name: "EMS-CE (0.5 Hour) Toxicological Emergencies – Opioids  - for All Levels", Version: null, ID: 2026 },
    { Course_Name: "EMS-CE (0.5 Hour) Ambulance Safety - for EMTs, AEMTs and Paramedics", Version: null, ID: 1999 },
    { Course_Name: "EMS-CE (0.5 Hour) At-Risk Populations - for EMTs and AEMTs", Version: null, ID: 1997 },
    { Course_Name: "EMS-CE (1 Hour) At-Risk Populations - for Paramedics", Version: null, ID: 1998 },
    { Course_Name: "EMS-CE (1 Hour) Crew Resource Management  - for EMTs, AEMTs and Paramedics", Version: null, ID: 2007 },
    { Course_Name: "EMS-CE (0.25 Hour) EMS Culture of Safety - for EMRs", Version: null, ID: 2004 },
    { Course_Name: "EMS-CE (0.5 Hour) EMS Culture of Safety - for  EMTs, AEMTs and Paramedics", Version: null, ID: 2005 },
    { Course_Name: "EMS-CE (0.25 Hour) EMS Provider Hygiene, Safety, and Vaccinations - for EMRs", Version: null, ID: 2002 },
    { Course_Name: "EMS-CE (0.5 Hour) EMS Provider Hygiene, Safety, and Vaccinations - for  EMTs, AEMTs and Paramedics", Version: null, ID: 2003 },
    { Course_Name: "EMS-CE (0.5 Hour) EMS Research - for EMTs and AEMTs", Version: null, ID: 2008 },
    { Course_Name: "EMS-CE (1 Hour) EMS Research - for Paramedics", Version: null, ID: 2009 },
    { Course_Name: "EMS-CE (0.5 Hour) Evidence Based Guidelines - for  EMTs, AEMTs and Paramedics", Version: null, ID: 2010 },
    { Course_Name: "EMS-CE (0.5 Hour) Field Triage—Disasters/MCIs - for EMRs, EMTs, and AEMTs", Version: null, ID: 2000 },
    { Course_Name: "EMS-CE (1 Hour) Field Triage—Disasters/MCIs - for Paramedics", Version: null, ID: 2001 },
    { Course_Name: "EMS-CE (0.5 Hour) Pediatric Transport - for EMTs, AEMTs and Paramedics", Version: null, ID: 2006 },
    { Course_Name: "16 Hour EM-385-1-1 - Safety and Health Requirements for USACE", Version: null, ID: 2226 },
    { Course_Name: "24 Hour EM-385-1-1 - Safety and Health Requirements for USACE", Version: null, ID: 2225 },
    { Course_Name: "40 Hour EM-385-1-1 - Safety and Health Requirements for USACE", Version: null, ID: 2133 },
    { Course_Name: "8 Hour EM-385-1-1 - Safety and Health Requirements for USACE", Version: null, ID: 2227 },
    { Course_Name: "OSHA 30 Hour: Construction Industry Outreach Training Online (UL)  Actively Proctored", Version: null, ID: 2091 },
    { Course_Name: "OSHA 30 Hour: Construction Industry Outreach Training Online (UL)  Non-Proctored", Version: null, ID: 2092 },
    { Course_Name: "OSHA 30 Hour: Construction Industry Outreach Training Online (Spanish) (UL)  Actively Proctored", Version: null, ID: 2088 },
    { Course_Name: "OSHA 30 Hour: Construction Industry Outreach Training Online (Spanish) (UL)  Non-Proctored", Version: null, ID: 2090 },
    { Course_Name: "OSHA 10 Hour: General Industry Outreach Training Online (UL)  Actively Proctored", Version: null, ID: 2095 },
    { Course_Name: "OSHA 10 Hour: General Industry Outreach Training Online (UL)  Non-Proctored", Version: null, ID: 2096 },
    { Course_Name: "OSHA 10 Hour General Industry Training Online (Spanish) (UL)  UL Non-Proctored", Version: null, ID: 2094 },
    { Course_Name: "OSHA 10 Hour General Industry Training Online (Spanish) (UL)  UL Proctored", Version: null, ID: 2093 },
    { Course_Name: "OSHA 10 Hour: General Industry Outreach Training Course (High-Tech/Semiconductor) Online (UL)  Actively Proctored", Version: null, ID: 2097 },
    { Course_Name: "OSHA 10 Hour: General Industry Outreach Training Course (High-Tech/Semiconductor) Online (UL)  Non-Proctored", Version: null, ID: 2098 },
    { Course_Name: "OSHA 10 Hour: Construction Industry Outreach Training Online (UL)  Actively Proctored", Version: null, ID: 2101 },
    { Course_Name: "OSHA 10 Hour: Construction Industry Outreach Training Online (UL)  Non-Proctored", Version: null, ID: 2102 },
    { Course_Name: "OSHA 10 Hour: Construction Industry Outreach Training Course (Spanish) Online (UL)  Actively Proctored (UL)", Version: null, ID: 2099 },
    { Course_Name: "OSHA 10 Hour: Construction Industry Outreach Training Course (Spanish) Online (UL)  Non-Proctored", Version: null, ID: 2100 },
    { Course_Name: "Advanced Safety Orientation for Managers and Supervisors in General Industry (UL)", Version: null, ID: 2103 },
    { Course_Name: "Advanced Safety Orientation for Managers and Supervisors in Construction (UL)", Version: null, ID: 2104 },
    { Course_Name: "Advanced Safety Orientation for General Industry (UL)", Version: null, ID: 2105 },
    { Course_Name: "Advanced Safety Orientation for Construction Industry (UL)", Version: null, ID: 2106 }
];

  function waitForAngularScope(callback) {
    const check = setInterval(() => {
      const el = document.querySelector('select[ng-model="reportFilter.ClassNumbers"]');
      if (el && window.angular) {
        const scope = angular.element(el).scope();
        if (scope && scope.erc) {
          clearInterval(check);
          callback(scope);
        }
      }
    }, 500);
  }

  function createPopup(scope) {
    const popup = document.createElement('div');
    popup.id = 'hazwoper-popup';
    popup.style = `
      position: fixed; top: 80px; right: 20px; z-index: 9999;
      background: #fff; color: #000;
      border: 1px solid #ccc; width: 340px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      font-family: Arial, sans-serif; font-size: 14px;
      border-radius: 8px;
    `;

    popup.innerHTML = `
      <div style="padding: 20px;" id="popup-content">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="font-size: 16px;">Course Report</strong>
          <button id="togglePopup" style="background: none; border: none; font-size: 18px; cursor: pointer;">&minus;</button>
        </div><br>

        <label>Status:</label>
        <select id="statusSelect" style="width: 100%; margin-bottom: 10px;">
          <option value="Active">Paid (Active)</option>
          <option value="Pending">Pending</option>
          <option value="Payment">Payment</option>
          <option value="Refunded">Refunded</option>
          <option value="Deleted">Deleted</option>
          <option value="All" selected>All</option>
        </select>

        <label>Class:</label>
        <input type="text" id="courseSearch" placeholder="Search courses..." style="width: 100%; padding: 5px; margin-bottom: 5px; border: 1px solid #ccc; border-radius: 4px;" />
        <select id="classSelect" style="width: 100%; margin-bottom: 10px;"></select>

        <label>Date Range:</label>
        <div style="display: flex; gap: 4px; margin-bottom: 10px;">
          <input type="date" id="startDate" style="flex: 1;" />
          <input type="date" id="endDate" style="flex: 1;" />
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px;">
          ${["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Last 60 Days", "Last 90 Days", "The Last Year", "Last 5 Years", "This Month", "Last Month", "This Year", "Last Year"].map(label => `
            <button class="rangeBtn" data-range="${label}" style="flex: 1 1 45%; font-size: 12px; padding: 4px; background: #eee; border: 1px solid #aaa; border-radius: 4px; cursor: pointer;">${label}</button>
          `).join('')}
        </div>

        <button id="runReportBtn" style="width: 100%; background: #28a745; color: white; border: none; padding: 10px; font-weight: bold; border-radius: 4px;">
          ▶️ Run Report
        </button>
      </div>

      <button id="maximizePopup" style="display: none; width: 100%; padding: 8px; font-weight: bold; background: #f1f1f1; border: none; border-top: 1px solid #ccc; border-radius: 0 0 8px 8px; cursor: pointer;">
        ⬆️ Show Report Tool
      </button>
    `;

    document.body.appendChild(popup);

    const popupContent = popup.querySelector('#popup-content');
    const toggleBtn = popup.querySelector('#togglePopup');
    const maximizeBtn = popup.querySelector('#maximizePopup');

    toggleBtn.addEventListener('click', () => {
      popupContent.style.display = 'none';
      maximizeBtn.style.display = 'block';
    });

    maximizeBtn.addEventListener('click', () => {
      popupContent.style.display = 'block';
      maximizeBtn.style.display = 'none';
    });

    const classSelect = popup.querySelector('#classSelect');
    hazwoperCourses.forEach(course => {
      const option = document.createElement('option');
      option.value = course.ID;
      option.textContent = course.Course_Name;
      classSelect.appendChild(option);
    });

    const courseSearch = popup.querySelector('#courseSearch');
    courseSearch.addEventListener('input', () => {
      const searchTerm = courseSearch.value.toLowerCase();
      classSelect.innerHTML = '';
      hazwoperCourses
        .filter(course => course.Course_Name.toLowerCase().includes(searchTerm))
        .forEach(course => {
          const option = document.createElement('option');
          option.value = course.ID;
          option.textContent = course.Course_Name;
          classSelect.appendChild(option);
        });
    });

    popup.querySelectorAll('.rangeBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const now = moment();
        let start, end;
        switch (btn.dataset.range) {
          case 'Today': start = end = now; break;
          case 'Yesterday': start = end = now.clone().subtract(1, 'days'); break;
          case 'Last 7 Days': start = now.clone().subtract(6, 'days'); end = now; break;
          case 'Last 30 Days': start = now.clone().subtract(29, 'days'); end = now; break;
          case 'Last 60 Days': start = now.clone().subtract(59, 'days'); end = now; break;
          case 'Last 90 Days': start = now.clone().subtract(89, 'days'); end = now; break;
          case 'The Last Year': start = now.clone().subtract(1, 'year'); end = now; break;
          case 'Last 5 Years': start = now.clone().subtract(5, 'year'); end = now; break;
          case 'This Month': start = now.clone().startOf('month'); end = now; break;
          case 'Last Month':
            start = now.clone().subtract(1, 'month').startOf('month');
            end = now.clone().subtract(1, 'month').endOf('month');
            break;
          case 'This Year': start = now.clone().startOf('year'); end = now; break;
          case 'Last Year':
            start = now.clone().subtract(1, 'year').startOf('year');
            end = now.clone().subtract(1, 'year').endOf('year');
            break;
          default: return;
        }
        document.getElementById('startDate').value = start.format('YYYY-MM-DD');
        document.getElementById('endDate').value = end.format('YYYY-MM-DD');
      });
    });

    document.getElementById('runReportBtn').addEventListener('click', () => {
      const status = document.getElementById('statusSelect').value;
      const selectedID = parseInt(document.getElementById('classSelect').value);
      const selectedCourse = hazwoperCourses.find(c => c.ID === selectedID);
      const start = document.getElementById('startDate').value;
      const end = document.getElementById('endDate').value;

      if (!selectedCourse || !start || !end) {
        alert('Please select a class and valid date range.');
        return;
      }

      scope.$apply(() => {
        if (!scope.erc.Classes.some(c => c.ID === selectedCourse.ID)) {
          scope.erc.Classes.push({ ID: selectedCourse.ID, Course_Name: selectedCourse.Course_Name });
        }

        scope.reportFilter.ClassNumbers = {
          ID: selectedCourse.ID,
          Course_Name: selectedCourse.Course_Name
        };
        scope.reportFilter.PaymentStatus = status;
        scope.reportFilter.Date = {
          startDate: moment(start).startOf('day'),
          endDate: moment(end).endOf('day')
        };

        scope.erc.RunReport();
      });
    });
  }

  waitForAngularScope(createPopup);
})();