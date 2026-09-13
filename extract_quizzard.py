import os
import re
import ast
import json
import sqlite3
import csv
import zipfile

APK_PATH = "/root/nz-dirving/Driving_Test_NZ_1.1.10_Quizzard.apk"
DECOMPILED_JS = "/root/nz-dirving/quizzard_decompiled.js"
BASE_DIR = "/root/nz-dirving/export/Quizzard"
IMAGES_DIR = os.path.join(BASE_DIR, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

def run():
    print("=== Step 1: Reading decompiled JavaScript ===")
    with open(DECOMPILED_JS, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # 1. Parse CATEGORIES from module 1768
    print("Parsing categories...")
    c_idx = content.find('r8 = 1768;')
    c_start = content.rfind('function(a0, a1, a2, a3, a4, a5, a6)', 0, c_idx)
    c_code = content[c_start:c_idx]

    categories = {}
    cat_blocks = re.findall(r'r3 = ({\'name\':.*?});\s*r[0-9]+ = (\[.*?\]);', c_code, re.DOTALL)
    for cat_str, sub_str in cat_blocks:
        c_data = eval(cat_str.replace(': null', ': None'))
        sub_ids = eval(sub_str)
        categories[c_data['id']] = {
            'id': c_data['id'],
            'name': c_data['name'],
            'subCategoryIds': sub_ids
        }

    # 2. Parse SUB_CATEGORIES from module 1946
    print("Parsing subcategories...")
    s_idx = content.find('r8 = 1946;')
    s_start = content.rfind('function(a0, a1, a2, a3, a4, a5, a6)', 0, s_idx)
    s_code = content[s_start:s_idx]

    subcategories = {}
    qid_to_cat = {} # qid -> (cat_dict, subcat_dict)

    sub_blocks = re.findall(r'r3 = ({\'name\':.*?});\s*r[0-9]+ = (\[.*?\]);', s_code, re.DOTALL)
    for sub_str, qids_str in sub_blocks:
        s_data = eval(sub_str.replace(': false', ': False').replace(': true', ': True'))
        q_ids = eval(qids_str)
        subcategories[s_data['id']] = {
            'id': s_data['id'],
            'name': s_data['name'],
            'subtitle': s_data.get('subtitle'),
            'isPremium': s_data.get('isPremium', False),
            'questionIds': q_ids
        }

    # Connect categories to subcategories
    for cid, cinfo in categories.items():
        for sid in cinfo['subCategoryIds']:
            if sid in subcategories:
                subcategories[sid]['categoryId'] = cid
                subcategories[sid]['categoryName'] = cinfo['name']
                for qid in subcategories[sid]['questionIds']:
                    qid_to_cat[qid] = {
                        'category_id': cid,
                        'category_name': cinfo['name'],
                        'subcategory_id': sid,
                        'subcategory_name': subcategories[sid]['name'],
                        'is_premium': subcategories[sid]['isPremium']
                    }

    print(f"Loaded {len(categories)} categories and {len(subcategories)} subcategories.")

    # 3. Parse module 1769 dependencies (Asset map)
    print("Parsing asset dependency table...")
    m1769_match = re.search(r'r8 = 1769;\s*r7 = \[([0-9, ]+)\];', content)
    deps = [int(x.strip()) for x in m1769_match.group(1).split(',')]
    asset_map = {}
    for i, dep_id in enumerate(deps):
        dep_match = re.search(rf'r8 = {dep_id};\s*r7 = \[103\];', content)
        if dep_match:
            start = max(0, dep_match.start() - 1000)
            chunk = content[start:dep_match.start()]
            name_m = re.search(r'\'name\':\s*\'([^\']+)\'', chunk)
            type_m = re.search(r'\'type\':\s*\'([^\']+)\'', chunk)
            if name_m:
                asset_map[i] = f"{name_m.group(1)}.{type_m.group(1) if type_m else 'png'}"

    print(f"Mapped {len(asset_map)} image assets.")

    # 4. Extract all 431 questions from module 1769
    print("Extracting questions...")
    func_1769_idx = content.find('r8 = 1769;')
    func_start = content.rfind('function(a0, a1, a2, a3, a4, a5, a6)', 0, func_1769_idx)
    func_code = content[func_start:func_1769_idx]

    blocks = re.split(r'r1\[\d+\] = r3;', func_code)
    processed_questions = []
    letters = ["A", "B", "C", "D", "E", "F", "G"]

    for i, block in enumerate(blocks[:-1]):
        m_r3 = re.search(r'r3 = ({.*?});', block, re.DOTALL)
        if not m_r3:
            continue
        try:
            r3_dict = ast.literal_eval(m_r3.group(1))
        except Exception:
            continue

        qid = r3_dict['id']
        title = r3_dict.get('title', '').strip()
        explanation = r3_dict.get('correctAnswerExplanation', '').strip()
        hint = r3_dict.get('hint', '').strip()

        # Asset
        m_asset = re.search(r'r[0-9]+ = (\d+);\s*r[0-9]+ = r6\[r[0-9]+\];', block)
        asset_idx = int(m_asset.group(1)) if m_asset else None
        image_name = asset_map.get(asset_idx) if asset_idx is not None else None

        # Options
        opt_matches = re.findall(r'r[0-9]+ = ({[^{}]*\'text\':[^{}]*\'isCorrect\':[^{}]*});', block)
        options = []
        for idx, opt_str in enumerate(opt_matches):
            opt_py = opt_str.replace(': true', ': True').replace(': false', ': False')
            try:
                opt_dict = eval(opt_py)
                options.append({
                    'letter': letters[idx] if idx < len(letters) else str(idx + 1),
                    'text': opt_dict['text'].strip(),
                    'is_correct': opt_dict['isCorrect']
                })
            except:
                pass

        correct_letters = [o['letter'] for o in options if o['is_correct']]
        correct_text = " / ".join([o['text'] for o in options if o['is_correct']])

        # Category mapping
        cat_meta = qid_to_cat.get(qid, {
            'category_id': None,
            'category_name': 'General',
            'subcategory_id': None,
            'subcategory_name': 'General',
            'is_premium': False
        })

        q_item = {
            'index': i + 1,
            'id': qid,
            'title': title,
            'explanation': explanation,
            'hint': hint,
            'image_name': image_name,
            'category': cat_meta['category_name'],
            'category_id': cat_meta['category_id'],
            'subcategory': cat_meta['subcategory_name'],
            'subcategory_id': cat_meta['subcategory_id'],
            'is_premium': cat_meta['is_premium'],
            'options': options,
            'correct_letters': correct_letters,
            'correct_answer_text': correct_text
        }
        processed_questions.append(q_item)

    print(f"Extracted {len(processed_questions)} questions successfully.")

    # 5. Extract Images from APK
    print("=== Step 2: Extracting images from APK ===")
    extracted_images = 0
    with zipfile.ZipFile(APK_PATH, 'r') as z:
        for name in z.namelist():
            if name.startswith('res/drawable-mdpi-v4/src_assets_att') and name.endswith('.png'):
                # Extract filename part: src_assets_att...png -> att...png
                basename = os.path.basename(name)
                att_part = basename.replace('src_assets_', '')
                # Find matching original case in asset_map
                matched_name = None
                for orig in asset_map.values():
                    if orig.lower() == att_part.lower():
                        matched_name = orig
                        break
                if not matched_name:
                    matched_name = att_part

                dest = os.path.join(IMAGES_DIR, matched_name)
                with open(dest, 'wb') as out_f:
                    out_f.write(z.read(name))
                extracted_images += 1

    print(f"Extracted {extracted_images} images to {IMAGES_DIR}")

    # 6. Export to JSON
    print("=== Step 3: Exporting files ===")
    json_path = os.path.join(BASE_DIR, "questions.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(processed_questions, f, indent=2, ensure_ascii=False)
    print(f"Exported JSON: {json_path} ({os.path.getsize(json_path)} bytes)")

    # 7. Export to CSV
    csv_path = os.path.join(BASE_DIR, "questions.csv")
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'index', 'id', 'category', 'subcategory', 'is_premium', 'title',
            'image_name', 'correct_letters', 'correct_answer_text',
            'options', 'explanation', 'hint'
        ])
        for q in processed_questions:
            opts_str = " | ".join([f"{o['letter']}. {o['text']}" for o in q['options']])
            writer.writerow([
                q['index'],
                q['id'],
                q['category'],
                q['subcategory'],
                '1' if q['is_premium'] else '0',
                q['title'],
                q['image_name'] or '',
                ", ".join(q['correct_letters']),
                q['correct_answer_text'],
                opts_str,
                q['explanation'],
                q['hint']
            ])
    print(f"Exported CSV: {csv_path} ({os.path.getsize(csv_path)} bytes)")

    # 8. Export to SQLite DB
    db_path = os.path.join(BASE_DIR, "questions.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute('''
    CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
    )''')

    cur.execute('''
    CREATE TABLE subcategories (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        subtitle TEXT,
        is_premium INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories (id)
    )''')

    cur.execute('''
    CREATE TABLE questions (
        id TEXT PRIMARY KEY,
        question_index INTEGER NOT NULL,
        category_id TEXT,
        subcategory_id TEXT,
        title TEXT NOT NULL,
        explanation TEXT,
        hint TEXT,
        image_name TEXT,
        is_premium INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories (id),
        FOREIGN KEY (subcategory_id) REFERENCES subcategories (id)
    )''')

    cur.execute('''
    CREATE TABLE options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_id TEXT NOT NULL,
        letter TEXT NOT NULL,
        text TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        FOREIGN KEY (question_id) REFERENCES questions (id)
    )''')

    for cid, cinfo in categories.items():
        cur.execute("INSERT INTO categories (id, name) VALUES (?, ?)", (cid, cinfo['name']))

    for sid, sinfo in subcategories.items():
        cur.execute("INSERT INTO subcategories (id, category_id, name, subtitle, is_premium) VALUES (?, ?, ?, ?, ?)",
                    (sid, sinfo.get('categoryId', ''), sinfo['name'], sinfo.get('subtitle', ''), 1 if sinfo['isPremium'] else 0))

    for q in processed_questions:
        cur.execute('''
        INSERT INTO questions (id, question_index, category_id, subcategory_id, title, explanation, hint, image_name, is_premium)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            q['id'], q['index'], q['category_id'], q['subcategory_id'],
            q['title'], q['explanation'], q['hint'], q['image_name'],
            1 if q['is_premium'] else 0
        ))

        for o in q['options']:
            cur.execute('''
            INSERT INTO options (question_id, letter, text, is_correct)
            VALUES (?, ?, ?, ?)
            ''', (q['id'], o['letter'], o['text'], 1 if o['is_correct'] else 0))

    conn.commit()
    conn.close()
    print(f"Exported SQLite DB: {db_path} ({os.path.getsize(db_path)} bytes)")

    # 9. Generate README.md
    readme_path = os.path.join(BASE_DIR, "README.md")
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(f"""# Driving Test NZ (Quizzard Exam Preparation) - Question Bank

Extracted directly from the **Driving Test NZ** APK (`com.apperturelabs.nzdriverstest`, v1.1.10) developed by **Quizzard Exam Preparation** / **Apperture Labs**.

---

## 1. Overview & Extraction Method

* **App Platform:** React Native / Expo SDK 53 with Hermes Bytecode (`assets/index.android.bundle`).
* **Source Architecture:** The question bank and assets are compiled directly into the application bundle with full Airtable record mappings.
* **Extraction Technique:** Hermes bytecode decompilation (`hermes-dec`) parsed into structured Python objects and normalized with internal package assets (`res/drawable-mdpi-v4/src_assets_att*.png`).

---

## 2. Dataset Summary Statistics

* **Total Questions:** `{len(processed_questions)}`
* **Total Options / Choices:** `{sum(len(q['options']) for q in processed_questions)}`
* **Questions with Diagrams / Illustrations:** `{len([q for q in processed_questions if q['image_name']])}`
* **Extracted Diagram Images:** `{extracted_images}` files in [`images/`](images/)
* **Categories:** `6` main categories across `24` structured subcategories (Easy, Medium, Hard, Hardest).
* **Premium vs Free Tier:**
  * Free Questions: `{len([q for q in processed_questions if not q['is_premium']])}`
  * Gated Premium Questions: `{len([q for q in processed_questions if q['is_premium']])}` (fully unlocked and extracted here)

---

## 3. Category & Subcategory Breakdown

| Category | Easy | Medium | Hard | Hardest | Total Questions |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Rules of the Road** | 37 | 39 | 39 | 39 | **154** |
| **Driving and Parking** | 26 | 25 | 26 | 26 | **103** |
| **Road Signs** | 11 | 11 | 11 | 10 | **43** |
| **Motorbike** | 16 | 16 | 16 | 16 | **64** |
| **Heavy Vehicles Class 2** | 12 | 12 | 13 | 13 | **50** |
| **Heavy Vehicles Class 3 & 5** | 4 | 4 | 4 | 5 | **17** |
| **Total** | **106** | **107** | **109** | **109** | **431** |

---

## 4. File Manifest

* [`questions.json`](questions.json) - Full structured JSON file with all question texts, hints, explanations, choices, and category links.
* [`questions.db`](questions.db) - Relational SQLite database with tables: `questions`, `options`, `categories`, `subcategories`.
* [`questions.csv`](questions.csv) - Tabular export for spreadsheet tools and rapid analysis.
* [`images/`](images/) - Directory of all {extracted_images} PNG road diagrams and signs.

---

## 5. SQLite Database Schema

```sql
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE subcategories (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    subtitle TEXT,
    is_premium INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories (id)
);

CREATE TABLE questions (
    id TEXT PRIMARY KEY,
    question_index INTEGER NOT NULL,
    category_id TEXT,
    subcategory_id TEXT,
    title TEXT NOT NULL,
    explanation TEXT,
    hint TEXT,
    image_name TEXT,
    is_premium INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories (id),
    FOREIGN KEY (subcategory_id) REFERENCES subcategories (id)
);

CREATE TABLE options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id TEXT NOT NULL,
    letter TEXT NOT NULL,           -- 'A', 'B', 'C', 'D'
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL,    -- 1 = Correct, 0 = Incorrect
    FOREIGN KEY (question_id) REFERENCES questions (id)
);
```

### Useful SQL Queries

```sql
-- Get random 35-question mock test from Rules of the Road:
SELECT q.title, o.letter, o.text AS correct_answer, q.explanation
FROM questions q
JOIN categories c ON q.category_id = c.id
JOIN options o ON q.id = o.question_id AND o.is_correct = 1
WHERE c.name = 'Rules of the Road'
ORDER BY RANDOM()
LIMIT 35;

-- List breakdown of questions per difficulty tier:
SELECT s.name AS difficulty, COUNT(q.id) AS count
FROM questions q
JOIN subcategories s ON q.subcategory_id = s.id
GROUP BY s.name;
```

---

## 6. Sample Question Record

```json
{{
  "index": 1,
  "id": "recUSVdQPIprnKldA",
  "title": "You're approaching this roundabout and want to follow the arrow. Do you need to indicate?",
  "explanation": "This one is tricky, but the rules state that if you are passing more than 'halfway' around the roundabout, technically you are turning right, therefore you need to indicate right when approaching the roundabout and left as you pass the exit just before the one you want to take...",
  "hint": "Pay attention to your intended movement at the roundabout and the sequence of exits. Remember, clear signaling enhances communication and promotes safe navigation.",
  "image_name": "attfiSwDTUpqVBEVh.png",
  "category": "Rules of the Road",
  "subcategory": "Easy Questions",
  "is_premium": false,
  "options": [
    {{
      "letter": "A",
      "text": "Yes - indicate right as you approach the roundabout, then indicate left as you go past the first exit.",
      "is_correct": true
    }},
    {{
      "letter": "B",
      "text": "No - it's almost a straight line.",
      "is_correct": false
    }},
    {{
      "letter": "C",
      "text": "Yes - don't indicate as you approach the roundabout, but indicate left after you've gone past the first exit.",
      "is_correct": false
    }}
  ],
  "correct_letters": ["A"],
  "correct_answer_text": "Yes - indicate right as you approach the roundabout, then indicate left as you go past the first exit."
}}
```
""")
    print(f"Generated README.md: {readme_path}")
    print("\n=== EXTRACTION COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    run()
