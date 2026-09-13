import json, os, hashlib, re, html
from difflib import SequenceMatcher
from collections import Counter

print("=" * 65)
print("NZ ROAD CODE - SEMANTIC DEDUPLICATION & MASTER PDF BUILDER")
print("=" * 65)

# 1. Load Raw Master Dataset
master_path = "/root/nz-dirving/export/master_1279_questions.json"
with open(master_path, "r", encoding="utf-8") as f:
    raw_questions = json.load(f)

print(f"Loaded {len(raw_questions)} raw questions from {master_path}")

# 2. Hash existing images for diagram equivalence
img_hashes = {}
for q in raw_questions:
    p = q.get("image_path")
    if p and os.path.exists(p):
        with open(p, "rb") as f:
            img_hashes[p] = hashlib.md5(f.read()).hexdigest()

print(f"Computed hashes for {len(img_hashes)} images on disk.")

STOP_WORDS = set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during',
    'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s',
    'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself',
    'let\'s', 'me', 'more', 'most', 'must', 'mustn\'t', 'my', 'myself',
    'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such',
    'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too',
    'under', 'until', 'up', 'very',
    'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t',
    'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
    'check', 'apply', 'select', 'must', 'should', 'need', 're', 've', 'll', 'd', 's'
])

def text_norm(t):
    if not t: return ""
    t = t.lower()
    t = re.sub(r"[^a-z0-9\s]", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def clean_ans(a):
    if not a: return ""
    a = a.lower()
    a = re.sub(r"[^a-z0-9\s]", " ", a)
    a = re.sub(r"\s+", " ", a).strip()
    a = re.sub(r"^(observe|practice|use|apply|follow|obey|check|do not|dont|never|always)\s+", "", a)
    a = re.sub(r"^(the|a|an)\s+", "", a)
    return a.strip()

def extract_keywords(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    words = text.split()
    return set(w for w in words if w not in STOP_WORDS and len(w) > 1)

def is_diagram_question(prompt, has_image):
    if not has_image:
        return False
    p = text_norm(prompt)
    markers = [
        'this sign', 'the sign', 'these signs', 'sign mean', 'signs mean',
        'traffic signal', 'road marking', 'this marking', 'these markings',
        'blue car', 'red car', 'green car', 'yellow car',
        'vehicle a', 'vehicle b', 'vehicle c',
        'car a', 'car b', 'car c',
        'which vehicle must give way', 'which vehicle gives way', 'which vehicle goes first',
        'which vehicle is required to give way',
        'who gives way', 'who must give way',
        'in this situation', 'in this picture', 'in the diagram', 'in this diagram',
        'does the driver of the blue car', 'give way at this intersection'
    ]
    for m in markers:
        if m in p:
            return True
    if ('give way' in p or 'must give way' in p) and len(p.split()) < 10:
        return True
    return False

def answers_match(a1, a2):
    n1 = clean_ans(a1)
    n2 = clean_ans(a2)
    if not n1 or not n2:
        return False
    if n1 == n2:
        return True
    if re.search(r'\d', n1) or re.search(r'\d', n2) or 'class' in n1 or 'class' in n2:
        return False
    if n1 in ['true', 'false', 'yes', 'no'] or n2 in ['true', 'false', 'yes', 'no']:
        return False
    return SequenceMatcher(None, n1, n2).ratio() >= 0.88

def has_conflicting_topics(p1, p2):
    locs = ['pedestrian crossing', 'intersection', 'railway', 'level crossing', 'fire hydrant', 'bus stop', 'motorway', 'one lane bridge', 'roundabout']
    for loc in locs:
        in1 = loc in p1
        in2 = loc in p2
        if in1 != in2:
            if ('pedestrian crossing' in p1 and 'intersection' in p2) or ('intersection' in p1 and 'pedestrian crossing' in p2):
                return True
            if ('railway' in p1 and 'intersection' in p2 and 'railway' not in p2):
                return True
            if ('fire hydrant' in p1 and 'fire hydrant' not in p2):
                return True
    if ('with a raised traffic island' in p1 and 'without a raised traffic island' in p2) or ('without a raised traffic island' in p1 and 'with a raised traffic island' in p2):
        return True
    return False

def similarity(a, b):
    return SequenceMatcher(None, a, b).ratio()

# 3. Deduplication Algorithm
print("Running semantic deduplication...")
groups = []
used = set()

for i in range(len(raw_questions)):
    if i in used:
        continue
    q1 = raw_questions[i]
    p1 = q1["prompt"]
    ans1 = q1["correct_answer_text"]
    h1 = img_hashes.get(q1.get("image_path"))
    norm_p1 = text_norm(p1)
    kw1 = extract_keywords(p1)
    is_diag1 = is_diagram_question(p1, bool(h1))
    
    group = [i]
    used.add(i)
    
    for j in range(i + 1, len(raw_questions)):
        if j in used:
            continue
        q2 = raw_questions[j]
        ans2 = q2["correct_answer_text"]
        
        # 1. Strict answer match
        if not answers_match(ans1, ans2):
            continue
            
        p2 = q2["prompt"]
        norm_p2 = text_norm(p2)
        
        # 2. Topic conflict check
        if has_conflicting_topics(norm_p1, norm_p2):
            continue
            
        h2 = img_hashes.get(q2.get("image_path"))
        kw2 = extract_keywords(p2)
        is_diag2 = is_diagram_question(p2, bool(h2))
        
        # 3. Diagram check
        if is_diag1 or is_diag2:
            if not (is_diag1 and is_diag2):
                continue
            if not (h1 and h2 and h1 == h2):
                continue
            group.append(j)
            used.add(j)
            continue
            
        # 4. General theory check
        p_sim = similarity(norm_p1, norm_p2)
        is_dup = False
        if p_sim >= 0.70:
            is_dup = True
        elif len(kw1) >= 3 and len(kw2) >= 3:
            jaccard = len(kw1 & kw2) / len(kw1 | kw2)
            overlap = len(kw1 & kw2) / min(len(kw1), len(kw2))
            if jaccard >= 0.55 or (overlap >= 0.55 and clean_ans(ans1) not in ['true', 'false', 'yes', 'no']):
                is_dup = True
                
        lic1 = q1.get("license_class", "")
        lic2 = q2.get("license_class", "")
        if lic1 and lic2 and lic1 != lic2:
            if ("motorcycle" in lic1.lower() and "heavy" in lic2.lower()) or ("heavy" in lic1.lower() and "motorcycle" in lic2.lower()):
                is_dup = False

        if is_dup:
            group.append(j)
            used.add(j)
                
    groups.append(group)

total_dups = sum(len(g) - 1 for g in groups)
print(f"Deduplication complete: {len(groups)} unique questions (removed {total_dups} duplicate entries).")

# 4. Standardize Sections
SECTION_ORDER = [
    "Core Rules & General Theory",
    "Intersections & Give-Way Scenarios",
    "Road Signs, Signals & Markings",
    "Road Position & Overtaking",
    "Driving Behaviour & Defensive Driving",
    "Parking & Stopping Restrictions",
    "Emergencies & Road Safety",
    "Motorcycle Specific (Class 6)",
    "Heavy Vehicles & Commercial Driving (Classes 2–5)",
    "Tourist & Driving in NZ Preparation"
]

def map_section(category, lic_class, prompt):
    cl = category.lower()
    pl = prompt.lower()
    if "tourist" in cl or "tourist" in pl:
        return "Tourist & Driving in NZ Preparation"
    if "car" in pl and ("bike" in cl or "motorcycle" in cl or "class 6" in lic_class.lower()):
        # If prompt says driving a car, it is not motorcycle-specific!
        pass
    elif "bike" in cl or "motorcycle" in cl or "class 6" in lic_class.lower():
        return "Motorcycle Specific (Class 6)"
    if "heavy" in cl or "class 2" in cl or "class 3" in cl or "class 4" in cl or "class 5" in cl or "heavy" in lic_class.lower():
        return "Heavy Vehicles & Commercial Driving (Classes 2–5)"
    if "intersection" in cl or "give way" in pl or "roundabout" in pl:
        return "Intersections & Give-Way Scenarios"
    if "sign" in cl or "marking" in cl or "signal" in cl or "speed limit" in pl:
        return "Road Signs, Signals & Markings"
    if "parking" in cl or "stopping" in cl:
        return "Parking & Stopping Restrictions"
    if "road-position" in cl or "overtaking" in cl or "passing" in pl or "lane" in pl:
        return "Road Position & Overtaking"
    if "emergenc" in cl or "crash" in pl or "accident" in pl or "hazard" in pl or "towing" in pl:
        return "Emergencies & Road Safety"
    if "behaviour" in cl or "alcohol" in pl or "fatigue" in pl or "phone" in pl or "seatbelt" in pl:
        return "Driving Behaviour & Defensive Driving"
    return "Core Rules & General Theory"

# 5. Build Canonical Question Objects
canonical_questions = []
for g in groups:
    # Prefer question with image
    def prompt_score(idx):
        p = raw_questions[idx]["prompt"]
        score = len(p)
        if p.endswith("?"): score += 10
        if raw_questions[idx].get("image_path") and os.path.exists(raw_questions[idx]["image_path"]): score += 50
        # If prompt mentions driving a car, boost it
        if "car" in p.lower(): score += 5
        return score
    
    best_prompt_idx = max(g, key=prompt_score)
    best_q = raw_questions[best_prompt_idx]
    
    # Best explanation
    best_exp = max((raw_questions[i].get("explanation", "") for i in g), key=len)
    
    # Best image
    best_img = ""
    # Prefer NZTA official diagram if available
    for i in g:
        ip = raw_questions[i].get("image_path", "")
        if ip and os.path.exists(ip) and "NZTA" in ip:
            best_img = ip
            break
    if not best_img:
        for i in g:
            ip = raw_questions[i].get("image_path", "")
            if ip and os.path.exists(ip):
                best_img = ip
                break
            
    # Combined sources
    sources = sorted(list(set(raw_questions[i]["source"] for i in g)))
    if len(sources) > 1:
        source_str = "Official NZTA & DT Driver Training"
    else:
        source_str = sources[0]
        
    category = best_q.get("category", "General Theory")
    lic_class = best_q.get("license_class", "All Classes")
    
    # Clean up accidental motorcycle tag on car prompts
    if "car" in best_q["prompt"].lower() and "motorcycle" in lic_class.lower():
        lic_class = "Class 1 (Car)"
        if "bike" in category.lower() or "motorcycle" in category.lower():
            category = "Core"
            
    section = map_section(category, lic_class, best_q["prompt"])
    
    merged_q = {
        "canonical_id": len(canonical_questions) + 1,
        "section": section,
        "source": source_str,
        "category": category,
        "license_class": lic_class,
        "prompt": best_q["prompt"],
        "options": best_q["options"],
        "is_multi_answer": best_q.get("is_multi_answer", False),
        "correct_option_indices": best_q.get("correct_option_indices", [best_q["correct_option_index"]]),
        "correct_letters": best_q.get("correct_letters", [best_q["correct_letter"]]),
        "correct_option_index": best_q["correct_option_index"],
        "correct_letter": best_q["correct_letter"],
        "correct_answer_text": best_q["correct_answer_text"],
        "explanation": best_exp,
        "image_path": best_img,
        "merged_count": len(g),
        "merged_raw_ids": [raw_questions[i]["question_number"] for i in g]
    }
    canonical_questions.append(merged_q)

# Sort questions by section order
canonical_questions.sort(key=lambda q: (SECTION_ORDER.index(q["section"]) if q["section"] in SECTION_ORDER else 99, q["canonical_id"]))

# Re-number from 1 to N
for idx, q in enumerate(canonical_questions, 1):
    q["canonical_id"] = idx

out_json = "/root/nz-dirving/export/master_unique_questions.json"
with open(out_json, "w", encoding="utf-8") as f:
    json.dump(canonical_questions, f, indent=2)

print(f"Exported clean unique question bank to: {out_json}")

# 6. Build Sections Dictionary
sections_dict = {s: [] for s in SECTION_ORDER}
for q in canonical_questions:
    s = q["section"]
    if s in sections_dict:
        sections_dict[s].append(q)
    else:
        sections_dict["Core Rules & General Theory"].append(q)

letters = ["A", "B", "C", "D", "E", "F"]
total_illustrated = sum(1 for q in canonical_questions if q["image_path"])

# 7. Generate Print-Optimized HTML
html_parts = []
html_parts.append(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>New Zealand Road Code - Master Question Bank ({len(canonical_questions)} Unique Questions)</title>
<style>
@page {{
    size: A4;
    margin: 10mm 8mm 10mm 8mm;
    @top-left {{
        content: "New Zealand Road Code - Master Question Bank ({len(canonical_questions)} Clean Unique Questions)";
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 6.5pt;
        color: #475569;
        font-weight: 600;
        border-bottom: 0.4pt solid #cbd5e1;
        padding-bottom: 1.5mm;
    }}
    @top-right {{
        content: "Official Waka Kotahi NZTA & DT Driver Training (Semantic Deduplicated)";
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 6.5pt;
        color: #475569;
        border-bottom: 0.4pt solid #cbd5e1;
        padding-bottom: 1.5mm;
    }}
    @bottom-right {{
        content: "Page " counter(page) " of " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 6.5pt;
        font-weight: 600;
        color: #64748b;
        padding-top: 1.5mm;
    }}
}}

* {{
    box-sizing: border-box;
}}

body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 8pt;
    line-height: 1.25;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 0;
}}

/* Cover / Title Block */
.doc-header {{
    border: 1.5pt solid #0f172a;
    border-radius: 4px;
    padding: 10px 14px;
    background: #f8fafc;
    margin-bottom: 10px;
    break-inside: avoid;
}}
.doc-title {{
    font-size: 15pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 2px 0;
    letter-spacing: -0.3px;
    text-transform: uppercase;
}}
.doc-subtitle {{
    font-size: 9.5pt;
    font-weight: 600;
    color: #2563eb;
    margin: 0 0 6px 0;
}}
.doc-meta {{
    font-size: 7.5pt;
    color: #334155;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 4px;
    border-top: 0.5pt solid #cbd5e1;
}}
.doc-meta span {{
    display: inline-flex;
    align-items: center;
}}

/* Section Index Table */
.toc-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 10px;
    font-size: 7.5pt;
    background: #ffffff;
    border: 0.5pt solid #e2e8f0;
    border-radius: 3px;
    padding: 6px 10px;
    margin-bottom: 12px;
    break-inside: avoid;
}}
.toc-item {{
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    border-bottom: 0.3pt dotted #cbd5e1;
}}
.toc-name {{ font-weight: 600; color: #1e293b; }}
.toc-count {{ font-weight: bold; color: #0284c7; }}

/* Section Banner */
.section-banner {{
    break-before: page;
    background: #0f172a;
    color: #ffffff;
    padding: 6px 10px;
    border-radius: 3px;
    margin: 10px 0 6px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}}
.section-banner:first-of-type {{
    break-before: auto;
}}
.section-title {{
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.2px;
}}
.section-badge {{
    background: #2563eb;
    color: #ffffff;
    font-size: 7pt;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 2px;
}}

/* Question Card - Flex Layout */
.q-card {{
    break-inside: avoid;
    page-break-inside: avoid;
    border: 0.6pt solid #cbd5e1;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 6px;
    background: #ffffff;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: space-between;
}}
.q-main {{
    flex: 1;
    min-width: 0;
}}

/* Top bar with all badges moved to LEFT */
.q-top {{
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    padding-bottom: 3px;
    border-bottom: 0.4pt solid #f1f5f9;
}}
.q-num {{
    background: #0f172a;
    color: #ffffff;
    font-weight: 800;
    font-size: 7.5pt;
    padding: 1.5px 5px;
    border-radius: 2px;
    letter-spacing: 0.3px;
}}
.tag {{
    font-size: 6.8pt;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 2px;
    border: 0.4pt solid #cbd5e1;
    background: #f8fafc;
    color: #475569;
}}
.tag-lic {{ background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }}
.tag-src {{ background: #fdf4ff; color: #86198f; border-color: #f5d0fe; }}
.tag-multi {{ background: #fdf2f8; color: #9d174d; border-color: #fbcfe8; font-weight: 700; }}

.q-prompt {{
    font-size: 8.8pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
    line-height: 1.25;
}}

/* Dedicated Image Box */
.q-img-box {{
    width: 215px;
    min-width: 215px;
    max-width: 215px;
    margin-left: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f8fafc;
    border: 0.8pt solid #cbd5e1;
    border-radius: 4px;
    padding: 4px;
}}
.q-img-box img {{
    max-width: 100%;
    max-height: 140px;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 2px;
    display: block;
}}

/* Options */
.options-list {{
    list-style: none;
    padding: 0;
    margin: 0 0 4px 0;
}}
.opt-item {{
    display: flex;
    align-items: baseline;
    font-size: 8pt;
    padding: 2px 4px;
    margin-bottom: 2px;
    border-radius: 2px;
    border: 0.4pt solid transparent;
}}
.opt-item.correct {{
    background: #ecfdf5;
    border-color: #10b981;
    color: #065f46;
    font-weight: 600;
}}
.opt-letter {{
    font-weight: 700;
    min-width: 18px;
    color: #475569;
}}
.opt-item.correct .opt-letter {{ color: #047857; }}
.opt-text {{ flex: 1; }}
.correct-badge {{
    font-size: 6.5pt;
    font-weight: 800;
    color: #047857;
    background: #d1fae5;
    padding: 1px 4px;
    border-radius: 2px;
    margin-left: 6px;
    border: 0.4pt solid #6ee7b7;
    white-space: nowrap;
}}

/* Explanation */
.q-explanation {{
    margin-top: 3px;
    padding: 3px 6px;
    background: #f8fafc;
    border-left: 2pt solid #0284c7;
    font-size: 7.2pt;
    color: #334155;
    line-height: 1.25;
}}
</style>
</head>
<body>
""")

# Document Header & Table of Contents
html_parts.append(f"""
<div class="doc-header">
    <div class="doc-title">New Zealand Road Code - Master Question Bank</div>
    <div class="doc-subtitle">Complete {len(canonical_questions)} Unique Questions with Validated Answers & Diagrams (Semantic Deduplicated)</div>
    <div class="doc-meta">
        <span><b>Total Unique Questions:</b> {len(canonical_questions)}</span>
        <span><b>Duplicates Removed:</b> {total_dups} (Semantic Matching)</span>
        <span><b>Illustrated Diagrams:</b> {total_illustrated} Questions</span>
        <span><b>Sources:</b> Waka Kotahi NZTA & DT Driver Training</span>
        <span><b>Format:</b> Low-Margin Print Edition</span>
    </div>
</div>

<div class="toc-grid">
""")

for sname in SECTION_ORDER:
    scnt = len(sections_dict[sname])
    html_parts.append(f"""
    <div class="toc-item">
        <span class="toc-name">{sname}</span>
        <span class="toc-count">{scnt} questions</span>
    </div>
    """)

html_parts.append("""
</div>
""")

# Build Question Cards
global_qnum = 1

for sname in SECTION_ORDER:
    q_list = sections_dict[sname]
    if not q_list: continue
    
    html_parts.append(f"""
    <div class="section-banner">
        <span class="section-title">{sname}</span>
        <span class="section-badge">{len(q_list)} Questions</span>
    </div>
    """)
    
    for q in q_list:
        q_id_str = f"Q{global_qnum:04d}"
        
        img_box_html = ""
        if q["image_path"]:
            img_box_html = f'<div class="q-img-box"><img src="file://{q["image_path"]}" alt="Diagram" /></div>'
            
        correct_indices = set(q.get("correct_option_indices", [q.get("correct_option_index", 0)]))
        opts_html = []
        for oidx, otxt in enumerate(q["options"]):
            is_c = (oidx in correct_indices)
            c_cls = "correct" if is_c else ""
            c_badge = '<span class="correct-badge">&#10004; Correct</span>' if is_c else ''
            letter = letters[oidx] if oidx < len(letters) else str(oidx+1)
            opts_html.append(f"""
            <li class="opt-item {c_cls}">
                <span class="opt-letter">[{letter}]</span>
                <span class="opt-text">{html.escape(otxt)}</span>
                {c_badge}
            </li>
            """)
            
        exp_html = ""
        if q["explanation"] and len(q["explanation"]) > 5:
            exp_text = q["explanation"]
            if len(exp_text) > 280:
                exp_text = exp_text[:280].rsplit(" ", 1)[0] + "..."
            exp_html = f'<div class="q-explanation"><strong>Explanation:</strong> {html.escape(exp_text)}</div>'
            
        multi_badge_html = ""
        if q.get("is_multi_answer"):
            multi_badge_html = f'<span class="tag tag-multi">Multiple Answers ({html.escape(q.get("correct_letter", ""))})</span>'

        html_parts.append(f"""
        <div class="q-card">
            <div class="q-main">
                <div class="q-top">
                    <span class="q-num">{q_id_str}</span>
                    <span class="tag tag-lic">{html.escape(q["license_class"])}</span>
                    <span class="tag">{html.escape(q["category"])}</span>
                    <span class="tag tag-src">{html.escape(q["source"])}</span>
                    {multi_badge_html}
                </div>
                <div class="q-prompt">{html.escape(q["prompt"])}</div>
                <ul class="options-list">
                    {"".join(opts_html)}
                </ul>
                {exp_html}
            </div>
            {img_box_html}
        </div>
        """)
        global_qnum += 1

html_parts.append("""
</body>
</html>
""")

html_content = "".join(html_parts)
html_file = "/root/nz-dirving/export/nz_road_code_master.html"
with open(html_file, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Generated HTML: {html_file} ({len(html_content)/1024:.1f} KB)")
print(f"Total cards rendered: {global_qnum - 1}")
