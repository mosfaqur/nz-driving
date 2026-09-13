import os
import re
import json
import sqlite3
import csv
import time
import urllib.request
import http.cookiejar
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_DIR = "/root/nz-dirving/export/DTDriverTraining"
IMAGES_DIR = os.path.join(BASE_DIR, "images")
os.makedirs(IMAGES_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/html',
}

SECTIONS = [
    # Car
    ("car", "behaviour", "/roadcode/car/behaviour/87/"),
    ("car", "core", "/roadcode/car/core/62/"),
    ("car", "emergencies", "/roadcode/car/emergencies/16/"),
    ("car", "intersection", "/roadcode/car/intersection/78/"),
    ("car", "parking", "/roadcode/car/parking/19/"),
    ("car", "road-position", "/roadcode/car/road-position/18/"),
    ("car", "signs", "/roadcode/car/signs/54/"),
    ("car", "theory", "/roadcode/car/theory/33/"),
    # Heavy Vehicle
    ("heavy_vehicle", "behaviour", "/roadcode/heavy_vehicle/behaviour/81/"),
    ("heavy_vehicle", "core", "/roadcode/heavy_vehicle/core/62/"),
    ("heavy_vehicle", "emergencies", "/roadcode/heavy_vehicle/emergencies/14/"),
    ("heavy_vehicle", "class-2", "/roadcode/heavy_vehicle/heavy-vehicle-specific-questions-class-2/55/"),
    ("heavy_vehicle", "class-3-5", "/roadcode/heavy_vehicle/heavy-vehicle-specific-questions-class-3-5/19/"),
    ("heavy_vehicle", "intersection", "/roadcode/heavy_vehicle/intersection/70/"),
    ("heavy_vehicle", "parking", "/roadcode/heavy_vehicle/parking/18/"),
    ("heavy_vehicle", "road-position", "/roadcode/heavy_vehicle/road-position/18/"),
    ("heavy_vehicle", "signs", "/roadcode/heavy_vehicle/signs/54/"),
    ("heavy_vehicle", "theory", "/roadcode/heavy_vehicle/theory/18/"),
    # Motorbike
    ("motorbike", "behaviour", "/roadcode/motorbike/behaviour/80/"),
    ("motorbike", "core", "/roadcode/motorbike/core/62/"),
    ("motorbike", "emergencies", "/roadcode/motorbike/emergencies/13/"),
    ("motorbike", "intersection", "/roadcode/motorbike/intersection/78/"),
    ("motorbike", "motorbike-specific", "/roadcode/motorbike/motorbike-specific-questions/79/"),
    ("motorbike", "parking", "/roadcode/motorbike/parking/18/"),
    ("motorbike", "road-position", "/roadcode/motorbike/road-position/18/"),
    ("motorbike", "signs", "/roadcode/motorbike/signs/53/"),
    ("motorbike", "theory", "/roadcode/motorbike/theory/15/"),
    # Tourist
    ("tourist", "all", "/roadcode/tourist/all/66/"),
]

def check_answer_single(opener, check_url, test_url, log_id, token, q):
    dummy_answer_id = q['answers'][0]['id'] if q.get('answers') else None
    payload = json.dumps({
        'answer_ids': [dummy_answer_id] if dummy_answer_id else [],
        'answer_text_value': None,
        'image_id': None,
        'log_id': log_id,
        'access_token': token,
        'question_id': q['id']
    }).encode('utf-8')
    req = urllib.request.Request(check_url, data=payload, headers={
        **HEADERS,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': test_url
    })
    for attempt in range(4):
        try:
            with opener.open(req, timeout=12) as resp:
                res = json.loads(resp.read().decode('utf-8'))
                return q['id'], res.get('data', {}).get('correct_ids', [])
        except Exception as e:
            if attempt < 3:
                time.sleep(0.5 * (attempt + 1))
            else:
                print(f"Error checking Q{q['id']}: {e}")
                return q['id'], []

def extract_all():
    print("=== Step 1: Fetching all sections and questions ===")
    all_questions = {}
    question_categories = {} # q_id -> set of (category, section)
    section_sessions = []

    for cat, sec, path in SECTIONS:
        test_url = "https://www.drivingtests.co.nz" + path
        cj = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        success = False
        for attempt in range(3):
            try:
                req = urllib.request.Request(test_url, headers=HEADERS)
                with opener.open(req, timeout=15) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
                
                token_m = re.search(r'data-access-token=[\'"]([^\'"]+)[\'"]', html)
                token = token_m.group(1) if token_m else None
                
                snap_m = re.search(r'<script[^>]*data-hook=[\'"]quiz-initial-snapshot[\'"][^>]*>(.*?)</script>', html, re.DOTALL)
                if not snap_m or not token:
                    print(f"  [!] Failed to parse snapshot or token for {path} (attempt {attempt+1})")
                    time.sleep(1)
                    continue
                
                data = json.loads(snap_m.group(1).strip())
                log_id = data['data']['log_id']
                qs = data['data']['questions']
                
                print(f"  [+] {cat:13} / {sec:20} -> Loaded {len(qs):2d} questions (log_id={log_id})")
                section_sessions.append({
                    'cat': cat,
                    'sec': sec,
                    'path': path,
                    'test_url': test_url,
                    'opener': opener,
                    'token': token,
                    'log_id': log_id,
                    'questions': qs
                })
                
                for q in qs:
                    qid = q['id']
                    if qid not in all_questions:
                        all_questions[qid] = q
                        question_categories[qid] = set()
                    question_categories[qid].add((cat, sec))
                success = True
                break
            except Exception as e:
                print(f"  [!] Error fetching {path} (attempt {attempt+1}): {e}")
                time.sleep(1)
        if not success:
            print(f"  [X] Failed section {cat}/{sec}")

    print(f"\nTotal unique questions discovered: {len(all_questions)}")

    print("\n=== Step 2: Resolving correct answers via /ng/check-answer ===")
    correct_ids_map = {}
    check_url = "https://www.drivingtests.co.nz/ng/check-answer"

    for sess in section_sessions:
        opener = sess['opener']
        token = sess['token']
        log_id = sess['log_id']
        test_url = sess['test_url']
        unresolved = [q for q in sess['questions'] if q['id'] not in correct_ids_map]
        if not unresolved:
            continue
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(check_answer_single, opener, check_url, test_url, log_id, token, q)
                for q in unresolved
            ]
            for fut in as_completed(futures):
                qid, cids = fut.result()
                if cids:
                    correct_ids_map[qid] = cids

        print(f"  Section {sess['cat']}/{sess['sec']} verified. (Total resolved: {len(correct_ids_map)}/{len(all_questions)})")

    print(f"\nCorrect answers resolved for {len(correct_ids_map)} / {len(all_questions)} questions.")

    print("\n=== Step 3: Downloading Media (Images) ===")
    images_to_download = set()
    for q in all_questions.values():
        if q.get('image_name'):
            images_to_download.add(q['image_name'])
        for a in q.get('answers', []):
            if a.get('image_name'):
                images_to_download.add(a['image_name'])

    print(f"Unique images to download: {len(images_to_download)}")

    def download_image(img_name):
        dest_path = os.path.join(IMAGES_DIR, img_name)
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
            return img_name, True
        img_url = f"https://www.drivingtests.co.nz/media/question-images/{img_name}"
        for attempt in range(3):
            try:
                req = urllib.request.Request(img_url, headers=HEADERS)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                    if len(data) > 0:
                        with open(dest_path, 'wb') as f:
                            f.write(data)
                        return img_name, True
            except Exception as e:
                time.sleep(0.5)
        return img_name, False

    downloaded = 0
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(download_image, img) for img in images_to_download]
        for fut in as_completed(futures):
            img_name, success = fut.result()
            if success:
                downloaded += 1

    print(f"Images successfully downloaded: {downloaded}/{len(images_to_download)}")

    print("\n=== Step 4: Structuring Data and Exporting ===")
    processed_questions = []

    for qid in sorted(all_questions.keys()):
        raw_q = all_questions[qid]
        correct_ids = set(correct_ids_map.get(qid, []))
        cats = sorted(list(question_categories.get(qid, [])))
        
        # Build answer list
        letters = ["A", "B", "C", "D", "E", "F", "G"]
        answers = []
        for idx, a in enumerate(raw_q.get('answers', [])):
            letter = letters[idx] if idx < len(letters) else str(idx + 1)
            is_correct = (a['id'] in correct_ids)
            answers.append({
                'id': a['id'],
                'letter': letter,
                'text': a.get('title', '').strip() if a.get('title') else '',
                'is_correct': is_correct,
                'image_name': a.get('image_name')
            })
        
        correct_letters = [a['letter'] for a in answers if a['is_correct']]
        correct_text = " / ".join([a['text'] for a in answers if a['is_correct']])
        
        # Clean HTML description to get explanation
        desc_html = raw_q.get('description') or ''
        clean_explanation = re.sub(r'<[^>]+>', ' ', desc_html)
        clean_explanation = re.sub(r'\s+', ' ', clean_explanation).strip()

        q_item = {
            'id': raw_q['id'],
            'title': raw_q.get('title', '').strip() if raw_q.get('title') else '',
            'input_type': raw_q.get('input_type', 'Radio'),
            'image_name': raw_q.get('image_name'),
            'audio_name': raw_q.get('audioName'),
            'permalink': raw_q.get('permalink'),
            'explanation_html': desc_html,
            'explanation_text': clean_explanation,
            'categories': [{'vehicle': c[0], 'section': c[1]} for c in cats],
            'answers': answers,
            'correct_ids': list(correct_ids),
            'correct_letters': correct_letters,
            'correct_answer_text': correct_text,
            'hint_correct': raw_q.get('question_hint', {}).get('correct_text') if raw_q.get('question_hint') else None,
            'hint_incorrect': raw_q.get('question_hint', {}).get('incorrect_text') if raw_q.get('question_hint') else None
        }
        processed_questions.append(q_item)

    # 1. Export JSON
    json_path = os.path.join(BASE_DIR, "questions.json")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(processed_questions, f, indent=2, ensure_ascii=False)
    print(f"Exported JSON: {json_path} ({os.path.getsize(json_path)} bytes)")

    # 2. Export CSV
    csv_path = os.path.join(BASE_DIR, "questions.csv")
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'id', 'title', 'input_type', 'categories', 'image_name', 'audio_name',
            'correct_letters', 'correct_answer_text', 'all_choices', 'explanation', 'permalink'
        ])
        for q in processed_questions:
            cats_str = "; ".join([f"{c['vehicle']}:{c['section']}" for c in q['categories']])
            choices_str = " | ".join([f"{a['letter']}. {a['text']}" for a in q['answers']])
            writer.writerow([
                q['id'],
                q['title'],
                q['input_type'],
                cats_str,
                q['image_name'] or '',
                q['audio_name'] or '',
                ", ".join(q['correct_letters']),
                q['correct_answer_text'],
                choices_str,
                q['explanation_text'],
                q['permalink'] or ''
            ])
    print(f"Exported CSV: {csv_path} ({os.path.getsize(csv_path)} bytes)")

    # 3. Export SQLite DB
    db_path = os.path.join(BASE_DIR, "questions.db")
    if os.path.exists(db_path):
        os.remove(db_path)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute('''
    CREATE TABLE questions (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        input_type TEXT,
        image_name TEXT,
        audio_name TEXT,
        permalink TEXT,
        explanation_html TEXT,
        explanation_text TEXT,
        hint_correct TEXT,
        hint_incorrect TEXT
    )''')

    cur.execute('''
    CREATE TABLE answers (
        id INTEGER PRIMARY KEY,
        question_id INTEGER NOT NULL,
        letter TEXT NOT NULL,
        text TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        image_name TEXT,
        FOREIGN KEY (question_id) REFERENCES questions (id)
    )''')

    cur.execute('''
    CREATE TABLE question_categories (
        question_id INTEGER NOT NULL,
        vehicle TEXT NOT NULL,
        section TEXT NOT NULL,
        PRIMARY KEY (question_id, vehicle, section),
        FOREIGN KEY (question_id) REFERENCES questions (id)
    )''')

    for q in processed_questions:
        cur.execute('''
        INSERT INTO questions (id, title, input_type, image_name, audio_name, permalink, explanation_html, explanation_text, hint_correct, hint_incorrect)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            q['id'], q['title'], q['input_type'], q['image_name'], q['audio_name'],
            q['permalink'], q['explanation_html'], q['explanation_text'],
            q['hint_correct'], q['hint_incorrect']
        ))

        for a in q['answers']:
            cur.execute('''
            INSERT INTO answers (id, question_id, letter, text, is_correct, image_name)
            VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                a['id'], q['id'], a['letter'], a['text'], 1 if a['is_correct'] else 0, a['image_name']
            ))

        for c in q['categories']:
            cur.execute('''
            INSERT INTO question_categories (question_id, vehicle, section)
            VALUES (?, ?, ?)
            ''', (q['id'], c['vehicle'], c['section']))

    conn.commit()
    conn.close()
    print(f"Exported SQLite DB: {db_path} ({os.path.getsize(db_path)} bytes)")

    # 4. Generate README.md
    readme_path = os.path.join(BASE_DIR, "README.md")
    with open(readme_path, 'w', encoding='utf-8') as f:
        f.write(f"""# DT Driver Training - NZ Driving Theory Test Question Bank

Extracted directly from **DT Driving Test Theory** (`com.zeeroapps.drivingtests`) & [drivingtests.co.nz](https://www.drivingtests.co.nz/).

## Summary Statistics

* **Total Unique Questions:** {len(processed_questions)}
* **Total Options / Choices:** {sum(len(q['answers']) for q in processed_questions)}
* **Total Questions with Illustrations:** {len([q for q in processed_questions if q['image_name']])}
* **Images Extracted & Stored:** {downloaded} files in [`images/`](images/)
* **Supported Vehicle Classes:**
  * **Car:** Behaviour (87), Core (62), Emergencies (16), Intersection (78), Parking (19), Road Position (18), Signs (54), Theory (33)
  * **Heavy Vehicle:** Classes 2, 3, 4, 5 specific modules + common road code
  * **Motorbike:** Motorbike-specific modules (79) + common road code
  * **Tourist:** Driving in NZ tourist preparation questions (66)

---

## File Manifest

* [`questions.json`](questions.json) - Full structured JSON dataset with all metadata, hints, and explanations.
* [`questions.db`](questions.db) - Relational SQLite 3 database with indexed `questions`, `answers`, and `question_categories`.
* [`questions.csv`](questions.csv) - Tabular export for spreadsheets and quick inspections.
* [`images/`](images/) - Directory containing all {downloaded} SVG, GIF, PNG, and JPG diagrams.

---

## SQLite Database Schema

```sql
CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    input_type TEXT,                -- 'Radio' (single choice) or 'Checkbox' (multi-select)
    image_name TEXT,                -- Diagram filename in images/
    audio_name TEXT,                -- Spoken question audio filename (.mp3)
    permalink TEXT,
    explanation_html TEXT,          -- Full road code explanation in HTML
    explanation_text TEXT,          -- Plain text explanation
    hint_correct TEXT,              -- Feedback shown when answered correctly
    hint_incorrect TEXT             -- Feedback shown when answered incorrectly
);

CREATE TABLE answers (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL,
    letter TEXT NOT NULL,           -- 'A', 'B', 'C', 'D', etc.
    text TEXT NOT NULL,
    is_correct INTEGER NOT NULL,    -- 1 = Correct, 0 = Incorrect
    image_name TEXT,
    FOREIGN KEY (question_id) REFERENCES questions (id)
);

CREATE TABLE question_categories (
    question_id INTEGER NOT NULL,
    vehicle TEXT NOT NULL,          -- 'car', 'heavy_vehicle', 'motorbike', 'tourist'
    section TEXT NOT NULL,          -- 'core', 'intersection', 'behaviour', etc.
    PRIMARY KEY (question_id, vehicle, section),
    FOREIGN KEY (question_id) REFERENCES questions (id)
);
```
""")
    print(f"Generated README.md: {readme_path}")
    print("\n=== EXTRACTION COMPLETED SUCCESSFULLY ===")

if __name__ == '__main__':
    extract_all()
