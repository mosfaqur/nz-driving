# New Zealand Road Code — Master Question Bank & Dataset Collection

This repository contains the extracted, analyzed, deduplicated, and unified New Zealand Road Code theory test questions across all major official and commercial platforms.

---

## 1. Master Compilation & Clean Unique Question Bank

* **[NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf](file:///root/nz-dirving/export/NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf)**: Complete 104-page print-friendly PDF of all **570 verified unique questions**.
  * **Semantic Deduplication:** 709 redundant duplicate questions merged based on strict numerical/distance matching, clause permutation equivalence, set-based multiple answer comparisons, and official image diagram MD5 hashes.
  * **Layout:** Low-margin A4 (10mm top/bottom, 8mm left/right), ink-efficient, dedicated right-hand image boxes (215px wide) for all 198 illustrated questions, left-aligned metadata badges (`[Q#]`, `[Class]`, `[Category]`, `[Source]`), highlighted correct answers with explanations, and running headers/footers with dynamic page numbering (`Page X of 104`).
* **[nz_road_code_master.html](file:///root/nz-dirving/export/nz_road_code_master.html)**: Standalone print-ready HTML source with embedded CSS Paged Media.
* **[master_unique_questions.json](file:///root/nz-dirving/export/master_unique_questions.json)**: Consolidated structured database of all 570 clean unique questions with tracked merged question IDs, categories, license classes, answer choices, correct answers, explanations, and local image paths.
* **[master_1279_questions.json](file:///root/nz-dirving/export/master_1279_questions.json)**: Raw pre-deduplication collection of all 1,279 questions extracted across sources.

---

## 2. Section Breakdown (570 Clean Unique Questions)

| Section Name | Questions | Description |
| :--- | :---: | :--- |
| **Motorcycle Specific (Class 6)** | **136** | Protective gear, pillion passengers, stability, and motorcycle roadcraft. |
| **Intersections & Give-Way Scenarios** | **83** | Priority rules, uncontrolled intersections, T-junctions, roundabouts, and traffic lights. |
| **Core Rules & General Theory** | **80** | General road rules, speed limits, legal duties, and vehicle standards. |
| **Heavy Vehicles & Commercial Driving (Classes 2–5)** | **80** | Gross vehicle mass, load securing, logbooks, work-time rules, and height restrictions. |
| **Driving Behaviour & Defensive Driving** | **74** | Scanning, hazard perception, alcohol/drug limits, fatigue, and mobile phone laws. |
| **Road Signs, Signals & Markings** | **45** | Compulsory, warning, and information signs; road markings and light signals. |
| **Road Position & Overtaking** | **28** | Passing lanes, lane positioning, motorway driving, and following distances. |
| **Emergencies & Road Safety** | **26** | Crash procedures, breakdowns, emergency vehicles, and hazard management. |
| **Parking & Stopping Restrictions** | **15** | Broken yellow lines, pedestrian crossings, clearways, and parking prohibitions. |
| **Tourist & Driving in NZ Preparation** | **3** | NZ road orientation, driving on the left, and rural driving precautions. |
| **Total Clean Bank** | **570** | **100% Deduplicated, Verified Road Code Knowledge Base.** |

---

## 3. Dataset Source Summary

| Source Dataset | Raw Extracted | Diagrams | Description |
| :--- | :---: | :---: | :--- |
| **[NZTA_Official_Road_Code/](file:///root/nz-dirving/export/NZTA_Official_Road_Code/)** | **990** | **452** | Official Waka Kotahi NZTA road code theory test question bank. |
| **[DTDriverTraining/](file:///root/nz-dirving/export/DTDriverTraining/)** | **589** | **236** | DT Driver Training Ltd APK (`nz.co.drivingtests.theory`) with proprietary motorbike, heavy vehicle, tourist, and hazard perception questions. |
| **[Quizzard/](file:///root/nz-dirving/export/Quizzard/)** | **431** | **204** | Quizzard Exam Prep APK (`com.apperturelabs.nzdriverstest`). Subset of the official 990 NZTA questions. |
| **[AA/](file:///root/nz-dirving/export/AA/)** | **35** | **60** | Automobile Association NZ (`practicetest.aa.co.nz`). Static practice mock test from the official pool. |
| **[i234DEV/](file:///root/nz-dirving/export/i234DEV/)** | **990** | **452** | RoadNZ Android APK (`com.i234dev.roadnz`). Verbatim match to the official NZTA dataset. |
| **[Vialsoft/](file:///root/nz-dirving/export/Vialsoft/)** | **990** | **452** | Vialsoft Road Code APK. Verbatim match to the official NZTA dataset. |
| **Raw Pool Total** | **1,279** | **500** | Initial combined raw collection before semantic deduplication. |

---

## 4. Semantic Deduplication Methodology

The original source databases (especially NZTA 990) contained hundreds of artificial duplicates created by app developers to populate randomized draw pools. Rather than simple exact character matching, deduplication evaluates:
1. **Answer Equivalence:** Strict matching for numerical values, speeds, distances, licence classes, and boolean answers; semantic equivalence for descriptive answers.
2. **Semantic Meaning & Topic Protection:** Normalizes question prompt fluff (e.g. "what should you do if", "what rule should you use") and computes SequenceMatcher and token overlap. Hard topic boundaries prevent conflating distinct situations (e.g. parking near pedestrian crossings vs intersections).
3. **Diagram Preservation:** Questions with visual diagrams (intersection priority diagrams, road signs) require identical image hashes to be merged, ensuring every distinct road scenario is retained.
4. **Canonical Selection:** Merged questions retain the clearest phrasing, the most complete explanation, and high-resolution diagram artwork.
