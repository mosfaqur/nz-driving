# DT Driver Training - NZ Driving Theory Test Question Bank

Extracted directly from the **DT Driving Test Theory** Android app (`com.zeeroapps.drivingtests`, v1.4.0) and DT Driver Training's platform ([drivingtests.co.nz](https://www.drivingtests.co.nz/)).

---

## 1. Overview & Architecture

Unlike offline quiz apps that store local SQLite databases inside the APK, the DT Driving Test Theory app is built as a **Trusted Web Activity (TWA)** shell backed by a dynamic cloud API layer. All question feeds, real-time answer scoring, and illustrations are served through:

* **Question Feed API:** `GET https://www.drivingtests.co.nz/ng/get-roadcode-questions`
* **Answer Validation API:** `POST https://www.drivingtests.co.nz/ng/check-answer`
* **Media Delivery CDN:** `https://www.drivingtests.co.nz/media/question-images/{image_name}`
* **Audio Delivery CDN:** `https://www.drivingtests.co.nz/media/question-audio/{audioName}`

This dataset represents a complete, verified snapshot of all tests across all vehicle classes.

---

## 2. Dataset Summary Statistics

* **Total Unique Questions:** `589`
* **Answer Choices Extracted:** `2,105`
* **Verification Rate:** `100%` (All 589 questions verified via `/ng/check-answer`)
* **Questions with Diagrams / Illustrations:** `234`
* **Downloaded Images & Diagrams:** `236` files in [`images/`](images/)
* **Supported Vehicle Test Suites:** `4` (Car, Heavy Vehicle, Motorbike, Tourist)

---

## 3. Question Distribution & Overlap Analysis

The 589 unique questions are composed of a shared **General Road Code** core combined with vehicle-specific and specialized endorsement modules.

### Venn Overlap Breakdown

| Distribution Pool | Unique Questions | Description / Content |
| :--- | :---: | :--- |
| **Core Shared Road Code** | **321** | Intersection give-way rules, traffic signals, speed limits, parking, and general signs shared across Car, Heavy Vehicle, and Motorbike. |
| **Motorbike-Only** | **80** | Class 6 specific rules: pillion passengers, helmet safety, countersteering, braking techniques, lane positioning, protective clothing. |
| **Heavy Vehicle-Only** | **77** | Class 2 (`55` qs), Class 3–5 (`19` qs), gross vehicle mass (GVM), logbook hours, bridge limits, loading and dimensions. |
| **Tourist-Only** | **65** | Rules for overseas visitors, campervan driving, driving on the left, unsealed gravel roads, and tourist routes. |
| **Car-Only** | **21** | Light vehicle rules: 1.5mm tyre tread depth, front load overhang limits (3m), towing light trailers. |
| **Car + Motorbike** | **14** | Shared passenger and light vehicle road positioning rules. |
| **Car + Heavy Vehicle** | **10** | Rules applicable to multi-track motor vehicles. |
| **Universal (All 4)** | **1** | Fatigue rule: *"What should you do if you're driving and become sleepy?"* |
| **Total Unique Questions** | **589** | **Complete deduplicated dataset** |

---

### Section Breakdown by Vehicle Test Suite

Users taking tests on DT practice within these test sizes:

```
                      +-------------------+
                      |   Core Road Code  |
                      |   (321 questions) |
                      +---------+---------+
                                |
       +------------------------+------------------------+------------------------+
       |                        |                        |                        |
       v                        v                        v                        v
+--------------+        +----------------+        +---------------+        +--------------+
|     Car      |        | Heavy Vehicle  |        |   Motorbike   |        |   Tourist    |
|   367 total  |        |   409 total    |        |   416 total   |        |   66 total   |
| (21 unique)  |        |  (77 unique)   |        |  (80 unique)  |        | (65 unique)  |
+--------------+        +----------------+        +---------------+        +--------------+
```

#### Car Test Sections (367 Total)
* **Behaviour:** 87 questions
* **Core:** 62 questions
* **Emergencies:** 16 questions
* **Intersection:** 78 questions
* **Parking:** 19 questions
* **Road Position:** 18 questions
* **Signs:** 54 questions
* **Theory:** 33 questions

#### Heavy Vehicle Sections (409 Total)
* **Class 2 Specific:** 55 questions
* **Class 3–5 Specific:** 19 questions
* **Behaviour:** 81 questions
* **Core:** 62 questions
* **Emergencies:** 14 questions
* **Intersection:** 70 questions
* **Parking:** 18 questions
* **Road Position:** 18 questions
* **Signs:** 54 questions
* **Theory:** 18 questions

#### Motorbike Sections (416 Total)
* **Motorbike-Specific:** 79 questions
* **Behaviour:** 80 questions
* **Core:** 62 questions
* **Emergencies:** 13 questions
* **Intersection:** 78 questions
* **Parking:** 18 questions
* **Road Position:** 18 questions
* **Signs:** 53 questions
* **Theory:** 15 questions

#### Tourist Section (66 Total)
* **Tourist Road Code & Safe Driving:** 66 questions (65 exclusive + 1 shared)

---

## 4. Category-Exclusive Question Examples

* **Car-Only Questions:**
  * `[Q194]`: *"What is the minimum tread depth required for car tyres?"* (Answer: 1.5mm)
  * `[Q190]`: *"What is the maximum distance a load may extend in front of a car?"* (Answer: 3 metres)
  * `[Q192]`: *"At night, a towed vehicle must have..."*
* **Heavy Vehicle-Only Questions:**
  * `[Q407]`: *"What is the maximum gross weight allowed on a Class 2 driver licence?"* (Answer: 18,000kg)
  * `[Q412]`: *"When must you fill in a logbook?"*
  * `[Q442]`: *"What is the maximum overall length for a heavy rigid vehicle?"*
* **Motorbike-Only Questions:**
  * `[Q315]`: *"What is the minimum age a pillion passenger can be on a motorbike?"*
  * `[Q332]`: *"Why should you use both the front and rear brakes when stopping a motorbike?"*
  * `[Q348]`: *"What does countersteering involve when turning a motorcycle?"*
* **Tourist-Only Questions:**
  * `[Q524]`: *"In New Zealand, on which side of the road do we drive?"* (Answer: On the left)
  * `[Q540]`: *"If you are travelling slower than traffic behind you, what should you do?"* (Answer: Pull over safely to let them pass)

---

## 5. File Manifest

| File | Format | Description |
| :--- | :---: | :--- |
| [`questions.json`](questions.json) | JSON | Complete dataset containing full metadata, HTML explanations, plain-text explanations, hints, answers, and category tags. |
| [`questions.db`](questions.db) | SQLite 3 | Relational SQLite database with indexed tables: `questions`, `answers`, and `question_categories`. |
| [`questions.csv`](questions.csv) | CSV | Tabular format for spreadsheets, data analysis, and quick inspections. |
| [`images/`](images/) | JPG / PNG / GIF / SVG | Folder containing all 236 road diagram, intersection, and sign illustrations. |

---

## 6. SQLite Database Schema

```sql
-- Core questions table
CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    input_type TEXT,                -- 'Radio' (single-choice) or 'Checkbox' (multi-select)
    image_name TEXT,                -- Filename in images/ (e.g. '169-intersection.jpg')
    audio_name TEXT,                -- Spoken audio file name (e.g. '83.mp3')
    permalink TEXT,                 -- Web slug identifier
    explanation_html TEXT,          -- Full road code explanation with formatting & diagrams
    explanation_text TEXT,          -- Clean plain-text explanation
    hint_correct TEXT,              -- Contextual feedback when answered correctly
    hint_incorrect TEXT             -- Contextual feedback when answered incorrectly
);

-- Answer choices
CREATE TABLE answers (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL,
    letter TEXT NOT NULL,           -- 'A', 'B', 'C', 'D', etc.
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL,    -- 1 = Correct, 0 = Incorrect
    image_name TEXT,                -- Optional choice diagram
    FOREIGN KEY (question_id) REFERENCES questions (id)
);

-- Vehicle & Section tag mappings
CREATE TABLE question_categories (
    question_id INTEGER NOT NULL,
    vehicle TEXT NOT NULL,          -- 'car', 'heavy_vehicle', 'motorbike', 'tourist'
    section TEXT NOT NULL,          -- 'core', 'intersection', 'behaviour', 'signs', etc.
    PRIMARY KEY (question_id, vehicle, section),
    FOREIGN KEY (question_id) REFERENCES questions (id)
);
```

### Useful SQL Queries

```sql
-- 1. Get a random 35-question Car mock test with correct answers:
SELECT q.id, q.title, a.letter AS correct_letter, a.text AS correct_answer
FROM questions q
JOIN question_categories qc ON q.id = qc.question_id
JOIN answers a ON q.id = a.question_id AND a.is_correct = 1
WHERE qc.vehicle = 'car'
GROUP BY q.id
ORDER BY RANDOM()
LIMIT 35;

-- 2. Count questions per vehicle class:
SELECT vehicle, COUNT(DISTINCT question_id) AS total_questions
FROM question_categories
GROUP BY vehicle;

-- 3. Find multi-select ('Checkbox') questions:
SELECT id, title FROM questions WHERE input_type = 'Checkbox';

-- 4. Find all questions with illustrations:
SELECT id, title, image_name FROM questions WHERE image_name IS NOT NULL;
```

---

## 7. Sample JSON Record

```json
{
  "id": 83,
  "title": "You're coming up to a railway level crossing. Which of these should you do? Select all that apply.",
  "input_type": "Checkbox",
  "image_name": "railway-cross-sign.gif",
  "audio_name": "83.mp3",
  "permalink": "youre-coming-up-to-a-railway-crossing-wh",
  "explanation_text": "Approaching a railway level crossing. As you are coming up to a railway level crossing, slow down and be ready to stop if necessary, check each way before proceeding to cross, and only cross if there's nothing blocking your path...",
  "categories": [
    {"vehicle": "car", "section": "core"},
    {"vehicle": "heavy_vehicle", "section": "core"},
    {"vehicle": "motorbike", "section": "core"}
  ],
  "answers": [
    {
      "id": 304,
      "letter": "A",
      "text": "If there are no barrier arms, it's safe to continue at the speed you're travelling at because that railway line isn't used",
      "is_correct": false
    },
    {
      "id": 305,
      "letter": "B",
      "text": "Slow down and get ready to stop",
      "is_correct": true
    },
    {
      "id": 306,
      "letter": "C",
      "text": "Check each way before proceeding across",
      "is_correct": true
    },
    {
      "id": 307,
      "letter": "D",
      "text": "Only cross if there's nothing blocking your path and there are no trains coming",
      "is_correct": true
    }
  ],
  "correct_ids": [305, 306, 307],
  "correct_letters": ["B", "C", "D"],
  "correct_answer_text": "Slow down and get ready to stop / Check each way before proceeding across / Only cross if there's nothing blocking your path and there are no trains coming",
  "hint_correct": "Correct. Just because there are no barriers doesn't mean that the line isn't used...",
  "hint_incorrect": "Just because there are no barriers doesn't mean the line isn't used..."
}
```
