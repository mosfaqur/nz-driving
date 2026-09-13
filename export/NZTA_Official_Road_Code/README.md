# Official New Zealand Road Code Theory Test Dataset

Complete digitized collection of the **New Zealand Transport Agency (NZTA / Waka Kotahi)** Road Code theory test question bank, including official question prompts, multiple-choice options, correct answers, explanations, and all 452 road diagrams and illustrations.

---

## 1. Dataset Origin & Availability

* **Issuing Authority:** Waka Kotahi NZ Transport Agency (NZTA)
* **Governing Rules:** Land Transport (Driver Licensing) Rule 1999
* **Public Publication:** Published in the official handbook *"The official New Zealand road code"* and on the web at [nzta.govt.nz/roadcode](https://nzta.govt.nz/driver-licences/getting-a-licence/road-code).
* **Open Data Status:** NZTA does **not** provide a downloadable raw database file (such as CSV or JSON) on its open data portal (`data.govt.nz` / `opendata-nzta.opendata.arcgis.com`). Instead, questions are published as web pages protected by web application firewalls.
* **This Package:** Represents the complete, verified, and normalized compilation of the entire official test syllabus extracted directly from native test engines.

---

## 2. Directory Layout

```
/root/nz-dirving/export/NZTA_Official_Road_Code/
├── README.md                           # This documentation file
├── nzta_theory_test_questions.json     # Complete structured JSON dataset
├── nzta_theory_test_questions.csv      # Flat tabular CSV for spreadsheets and data analysis
├── nzta_theory_test_questions.sqlite   # Standard SQLite 3 database
└── images/                             # 452 official diagram PNG files
    ├── nzroad_*.png                    # 428 question scenario diagrams (e.g. nzroad_297.png)
    └── rimage_*.png                    # 24 multiple-choice visual options
```

---

## 3. Dataset Breakdown

* **Total Database Entries:** **990**
* **Total Unique Question Scenarios:** **573**  
  *(Note: Official core questions are tested across multiple license pools, e.g. Car and Heavy Vehicle)*
* **Total Study Categories:** **11**
* **Total Diagram Illustrations:** **452**

### Categories Breakdown

| Category ID | Category Name | Entries | Target License Classes |
| :---: | :--- | :---: | :--- |
| **1** | Core | 163 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **2** | Signs | 132 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **3** | Behaviour | 214 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **4** | Emergencies | 41 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **5** | Intersection | 141 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **6** | Parking | 54 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **7** | Road-position | 39 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |
| **8** | Bike-specific | 79 | Class 6 (Motorcycle `A`) |
| **9** | Class 2 | 55 | Medium Rigid Vehicle (`HV`) |
| **10** | Class 3–5 | 19 | Heavy Rigid / Combination Vehicle (`HV`) |
| **11** | Theory | 53 | Class 1 (Car `B`), Motorcycle (`A`), Heavy Vehicle (`HV`) |

### License Codes
* `B`: Class 1 (Car / Light private vehicle)
* `A`: Class 6 (Motorcycle)
* `HV`: Class 2, 3, 4, 5 (Heavy Vehicle / Trucks)

---

## 4. Data Fields Reference

| Field | Description | Example |
| :--- | :--- | :--- |
| `id` | Unique question number (1 to 990) | `297` |
| `category_id` | Category index (1 to 11) | `5` |
| `category_name` | Official topic category name | `Intersection` |
| `license_codes` | Target license classes | `B,A,HV` |
| `prompt` | The complete question scenario | *"What should you do if the red lights continue to flash...?"* |
| `option1` | Answer Option A | *"Check both ways and wait until they have stopped flashing..."* |
| `option2` | Answer Option B | *"If you look both ways and you see nothing coming then drive on"* |
| `option3` | Answer Option C | *"Wait for 10 seconds and then drive on"* |
| `option4` | Answer Option D | `null` |
| `option5` | Answer Option E | `null` |
| `correct_option`| Index of the single correct answer | `1` |
| `correct_options_csv` | Comma-separated correct indices (for multi-choice) | `"1"` |
| `explanation` | Official rationale based on the road code | *"This means that there may be another train coming."* |
| `source_url` | NZTA official website reference | `https://nzta.govt.nz/driver-licences/getting-a-licence/road-code` |
| `image_path` | Filename in `images/` directory | `nzroad_297.png` |

---

## 5. Quickstart Queries

### Python SQLite
```python
import sqlite3

conn = sqlite3.connect("nzta_theory_test_questions.sqlite")
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get 5 intersection questions that have diagrams
cur.execute("""
    SELECT id, prompt, option1, correct_option, image_path 
    FROM Questions 
    WHERE category_name = 'Intersection' AND image_path IS NOT NULL 
    LIMIT 5;
""")

for row in cur.fetchall():
    print(f"[{row['id']}] {row['prompt']}")
    print(f"  Diagram: images/{row['image_path']}")
    print(f"  Correct Option: {row['correct_option']}")
```

### Python JSON
```python
import json

with open("nzta_theory_test_questions.json", "r", encoding="utf-8") as f:
    dataset = json.load(f)

print(f"Loaded {len(dataset['questions'])} question rows.")
print(f"Categories: {[c['Name'] for c in dataset['categories']]}")
```
