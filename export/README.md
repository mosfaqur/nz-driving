# New Zealand Road Code — Master Question Bank & Dataset Collection

This repository contains the extracted, analyzed, deduplicated, and unified New Zealand Road Code theory test questions across all major official and commercial platforms.

---

## 1. Master Compilation & Clean Unique Question Bank

* **[NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf](file:///root/nz-dirving/export/NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf)**: Complete 126-page print-friendly PDF of all **691 truly unique questions**.
  * **Semantic Deduplication:** 588 redundant duplicate questions were merged based on answer and meaning (e.g. merging 7 reworded duplicates of the Four-Second Rule in wet conditions, duplicate one-lane bridge questions, duplicate cyclist passing questions, etc.).
  * **Layout:** Low-margin A4 (10mm top/bottom, 8mm left/right), ink-efficient, dedicated right-hand image boxes (215px wide) for all illustrated questions, left-aligned metadata badges (`[Q#]`, `[Class]`, `[Category]`, `[Source]`), highlighted correct answers with explanations, and clean running headers/footers with page numbering (`Page X of 126`).
* **[master_unique_questions.json](file:///root/nz-dirving/export/master_unique_questions.json)**: Consolidated structured database of all 691 clean unique questions with tracked merged question IDs, categories, license classes, answer choices, correct answers, explanations, and local image paths.
* **[nz_road_code_master.html](file:///root/nz-dirving/export/nz_road_code_master.html)**: Standalone HTML source with embedded CSS Paged Media.
* **[master_1279_questions.json](file:///root/nz-dirving/export/master_1279_questions.json)**: Raw pre-deduplication collection of all 1,279 questions extracted across sources.

---

## 2. Section Breakdown (716 Clean Unique Questions)

| Section Name | Questions | Description |
| :--- | :---: | :--- |
| **Core Rules & General Theory** | **96** | General road rules, speed limits, legal duties, and vehicle standards. |
| **Driving Behaviour & Defensive Driving** | **96** | Scanning, hazard perception, alcohol/drug limits, fatigue, and mobile phone laws. |
| **Heavy Vehicles & Commercial Driving (Classes 2–5)** | **84** | Gross vehicle mass, load securing, logbooks, work-time rules, and height restrictions. |
| **Intersections & Give-Way Scenarios** | **83** | Priority rules, uncontrolled intersections, T-junctions, roundabouts, and traffic lights. |
| **Road Signs, Signals & Markings** | **54** | Compulsory, warning, and information signs; road markings and light signals. |
| **Road Position & Overtaking** | **37** | Passing lanes, lane positioning, motorway driving, and following distances. |
| **Emergencies & Road Safety** | **32** | Crash procedures, breakdowns, emergency vehicles, and hazard management. |
| **Parking & Stopping Restrictions** | **21** | Broken yellow lines, pedestrian crossings, clearways, and parking prohibitions. |
| **Motorcycle Specific (Class 6)** | **206** | Protective gear, pillion passengers, stability, and motorcycle roadcraft. |
| **Tourist & Driving in NZ Preparation** | **7** | NZ road orientation, driving on the left, and rural driving precautions. |
| **Total Clean Bank** | **716** | **100% Deduplicated, Verified Road Code Knowledge Base.** |

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
