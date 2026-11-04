# New Zealand Road Code — Semantic Deduplication & Master PDF Report

## Executive Summary

A semantic deduplication was conducted across the entire 1,279 question pool. Instead of byte-for-byte exact matching, the deduplication engine evaluated **semantic meaning, topic boundaries, diagram identity, and answer equivalence**.

* **Raw Questions in Pool:** 1,279
* **Redundant Duplicates Merged:** 588 questions
* **Clean, Truly Unique Question Bank:** **691 questions** (including 252 illustrated questions)
* **Total PDF Page Count:** **126 pages** (A4 print-friendly, down from 225 pages)

---

## 1. Resolution of Identified Duplicate (Q0151 & Q0152 Example)

In the previous print edition, questions `Q0151` and `Q0152` (along with `Q0024` and `Q0222`) asked about the exact same rule:

> **Previous duplicates in raw pool:**
> * `[Q136]` *"If you are driving in wet or frosty conditions, what rule should you use to judge a safe following distance?"* -> **Four-second rule**
> * `[Q682]` *"When driving a car in wet or frosty conditions what rule should you use to judge a safe following distance?"* -> **Four-second rule**
> * `[Q686]` *"When driving a car in wet or frosty conditions, what rule should you use to judge as a safe following distance?"* -> **Four-second rule**
> * `[Q996]` *"What rule should you use to judge a safe following distance in wet or frosty conditions if driving a car?"* -> **Four-second rule**
> * `[Q69]`, `[Q463]`, `[Q586]` *"What should you do when following another vehicle in wet conditions?"* -> **Practice/Observe the four-second rule**

All **7 redundant variations** have been unified into a single canonical entry in the new print edition:

* **New Question ID:** `[Q0009]` (*Core Rules & General Theory*, Page 3)
* **Canonical Prompt:** *"When driving a car in wet or frosty conditions, what rule should you use to judge as a safe following distance?"*
* **Correct Answer:** `[B] Four-second rule`
* **Diagram:** High-resolution official NZTA following distance graphic (`nzroad_136.png`)
* **Explanation:** Complete breakdown of the 2-second dry rule vs 4-second wet/towing rule.

---

## 2. Deduplication Safeguards & Logic

1. **Answer Equivalence:**
   * Numerical values, distances, speeds, weights, licence classes, and boolean states require exact match (e.g. `Class 1` vs `Class 5` or `10 hours` vs `70 hours` are strictly protected from merging).
   * Descriptive answers use semantic sequence matching ($\ge 88\%$).
2. **Topic Boundary Protection:**
   * Distinguishes between different locations even if answers match (e.g. parking 6 metres from a **pedestrian crossing** vs 6 metres from an **intersection**).
   * Distinguishes pedestrian crossings with traffic islands from crossings without traffic islands.
3. **Diagram Preservation:**
   * Questions referencing diagrams (intersections, road signs) require identical MD5 image hashes to merge. Every distinct intersection layout and road sign is preserved.

---

## 3. Section Breakdown (691 Unique Questions)

| Section Name | Questions | Illustrated |
| :--- | :---: | :---: |
| **Core Rules & General Theory** | 94 | 22 |
| **Intersections & Give-Way Scenarios** | 71 | 68 |
| **Road Signs, Signals & Markings** | 54 | 50 |
| **Road Position & Overtaking** | 29 | 10 |
| **Driving Behaviour & Defensive Driving** | 82 | 12 |
| **Parking & Stopping Restrictions** | 22 | 6 |
| **Emergencies & Road Safety** | 33 | 8 |
| **Motorcycle Specific (Class 6)** | 218 | 42 |
| **Heavy Vehicles & Commercial Driving (Classes 2–5)** | 84 | 33 |
| **Tourist & Driving in NZ Preparation** | 4 | 1 |
| **Total Master Collection** | **691** | **252** |

---

## 4. Key Artifact Links

* **[NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf](file:///root/nz-dirving/export/NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf)** (126 pages, 7.0 MB)
* **[master_unique_questions.json](file:///root/nz-dirving/export/master_unique_questions.json)** (Complete 691-question structured dataset)
* **[nz_road_code_master.html](file:///root/nz-dirving/export/nz_road_code_master.html)** (Print-ready HTML)
