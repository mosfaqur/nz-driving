import json, os, re, html
from difflib import SequenceMatcher

def normalize(text):
    if not text: return ""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()

def strip_html(text):
    if not text: return ""
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = html.unescape(clean)
    return re.sub(r"\s+", " ", clean).strip()

# 1. Load Datasets
print("Loading datasets...")
with open("/root/nz-dirving/export/NZTA_Official_Road_Code/nzta_theory_test_questions.json") as f:
    nzta_raw = json.load(f)["questions"]

with open("/root/nz-dirving/export/DTDriverTraining/questions.json") as f:
    dt_raw = json.load(f)

nzta_prompts = set(normalize(q["Prompt"]) for q in nzta_raw)

# 2. Extract DT Unique Questions
dt_unique_raw = []
for q in dt_raw:
    norm = normalize(q["title"])
    if norm not in nzta_prompts:
        best_sim = max((SequenceMatcher(None, norm, np).ratio() for np in nzta_prompts), default=0)
        if best_sim < 0.75:
            dt_unique_raw.append(q)

print(f"Loaded: {len(nzta_raw)} NZTA questions + {len(dt_unique_raw)} DT unique questions.")
assert len(nzta_raw) + len(dt_unique_raw) == 1279

# 3. Unify Data Model
unified = []

# Process NZTA
nzta_img_dir = "/root/nz-dirving/export/NZTA_Official_Road_Code/images"
for q in nzta_raw:
    cat = q.get("CategoryName", "Core").strip()
    
    sec = "Core Rules & General Theory"
    cl = cat.lower()
    if "intersection" in cl:
        sec = "Intersections & Give-Way Scenarios"
    elif "sign" in cl:
        sec = "Road Signs, Signals & Markings"
    elif "road-position" in cl:
        sec = "Road Position & Overtaking"
    elif "parking" in cl:
        sec = "Parking & Stopping Restrictions"
    elif "emergenc" in cl:
        sec = "Emergencies & Road Safety"
    elif "behaviour" in cl:
        sec = "Driving Behaviour & Defensive Driving"
    elif "bike" in cl or "motorcycle" in cl:
        sec = "Motorcycle Specific (Class 6)"
    elif "class 2" in cl or "class 3" in cl or "heavy" in cl:
        sec = "Heavy Vehicles & Commercial Driving (Classes 2–5)"
    elif "theory" in cl:
        sec = "Core Rules & General Theory"
        
    lic = q.get("LicenseCodes", "All")
    if lic == "A":
        lic_desc = "Class 6 (Motorcycle)"
    elif lic == "C":
        lic_desc = "Class 1 (Car)"
    elif lic == "H":
        lic_desc = "Classes 2–5 (Heavy)"
    else:
        lic_desc = "All Classes"

    opts = []
    for oi in range(1, 6):
        ot = q.get(f"Option{oi}")
        if ot and ot.strip():
            opts.append(strip_html(ot.strip()))
            
    c_idx = q.get("CorrectOption", 1) - 1
    if c_idx < 0 or c_idx >= len(opts):
        c_idx = 0
        
    img_path = ""
    if q.get("ImagePath"):
        full_img = os.path.join(nzta_img_dir, os.path.basename(q["ImagePath"]))
        if os.path.exists(full_img):
            img_path = full_img

    unified.append({
        "section": sec,
        "source": "Official NZTA / Waka Kotahi",
        "category": cat,
        "license": lic_desc,
        "prompt": strip_html(q["Prompt"]),
        "options": opts,
        "correct_idx": c_idx,
        "explanation": strip_html(q.get("Explanation", "")),
        "img_path": img_path
    })

# Process DT Unique
dt_img_dir = "/root/nz-dirving/export/DTDriverTraining/images"
for q in dt_unique_raw:
    c_info = q.get("categories", [{}])[0] if q.get("categories") else {}
    veh = c_info.get("vehicle", "car").lower()
    sec_info = c_info.get("section", "core").lower()
    
    sec = "Core Rules & General Theory"
    if veh == "tourist":
        sec = "Tourist & Driving in NZ Preparation"
        lic_desc = "Tourist / Visitor"
    elif veh == "motorbike" or "bike" in sec_info:
        sec = "Motorcycle Specific (Class 6)"
        lic_desc = "Class 6 (Motorcycle)"
    elif "heavy" in veh or "class" in sec_info:
        sec = "Heavy Vehicles & Commercial Driving (Classes 2–5)"
        lic_desc = "Classes 2–5 (Heavy)"
    elif "intersection" in sec_info:
        sec = "Intersections & Give-Way Scenarios"
        lic_desc = "Class 1 (Car)"
    elif "sign" in sec_info:
        sec = "Road Signs, Signals & Markings"
        lic_desc = "Class 1 (Car)"
    elif "road-position" in sec_info:
        sec = "Road Position & Overtaking"
        lic_desc = "Class 1 (Car)"
    elif "parking" in sec_info:
        sec = "Parking & Stopping Restrictions"
        lic_desc = "Class 1 (Car)"
    elif "emergenc" in sec_info:
        sec = "Emergencies & Road Safety"
        lic_desc = "Class 1 (Car)"
    elif "behaviour" in sec_info:
        sec = "Driving Behaviour & Defensive Driving"
        lic_desc = "Class 1 (Car)"
    else:
        lic_desc = "Class 1 (Car)"
        
    opts = []
    c_idx = 0
    for idx, a in enumerate(q.get("answers", [])):
        opts.append(strip_html(a.get("text", "")))
        if a.get("is_correct"):
            c_idx = idx
            
    img_path = ""
    if q.get("image_name"):
        full_img = os.path.join(dt_img_dir, os.path.basename(q["image_name"]))
        if os.path.exists(full_img):
            img_path = full_img
            
    unified.append({
        "section": sec,
        "source": "DT Driver Training (Extended)",
        "category": f"{veh.title()} - {sec_info.title()}",
        "license": lic_desc,
        "prompt": strip_html(q["title"]),
        "options": opts,
        "correct_idx": c_idx,
        "explanation": strip_html(q.get("explanation_text", "")),
        "img_path": img_path
    })

print(f"Total Unified Questions: {len(unified)}")

# 4. Group by Section Order
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

sections_dict = {s: [] for s in SECTION_ORDER}
for q in unified:
    s = q["section"]
    if s in sections_dict:
        sections_dict[s].append(q)
    else:
        sections_dict["Core Rules & General Theory"].append(q)

letters = ["A", "B", "C", "D", "E", "F"]

# 5. Generate HTML with Print-Friendly CSS
html_parts = []
html_parts.append("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>New Zealand Road Code - Complete Question Bank (1,279 Questions)</title>
<style>
@page {
    size: A4;
    margin: 10mm 8mm 10mm 8mm;
    @top-left {
        content: "New Zealand Road Code - Master Question Bank (1,279 Questions)";
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 6.5pt;
        color: #475569;
        font-weight: 600;
        border-bottom: 0.4pt solid #cbd5e1;
        padding-bottom: 1.5mm;
    }
    @top-right {
        content: "Official Waka Kotahi NZTA & DT Driver Training";
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 6.5pt;
        color: #475569;
        border-bottom: 0.4pt solid #cbd5e1;
        padding-bottom: 1.5mm;
    }
    @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 6.5pt;
        font-weight: 600;
        color: #64748b;
        padding-top: 1.5mm;
    }
}

* {
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 8pt;
    line-height: 1.25;
    color: #0f172a;
    background: #ffffff;
    margin: 0;
    padding: 0;
}

/* Cover / Title Block */
.doc-header {
    border: 1.5pt solid #0f172a;
    border-radius: 4px;
    padding: 10px 14px;
    background: #f8fafc;
    margin-bottom: 10px;
    break-inside: avoid;
}
.doc-title {
    font-size: 15pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 2px 0;
    letter-spacing: -0.3px;
    text-transform: uppercase;
}
.doc-subtitle {
    font-size: 9.5pt;
    font-weight: 600;
    color: #2563eb;
    margin: 0 0 6px 0;
}
.doc-meta {
    font-size: 7.5pt;
    color: #334155;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding-top: 4px;
    border-top: 0.5pt solid #cbd5e1;
}
.doc-meta span {
    display: inline-flex;
    align-items: center;
}

/* Section Index Table */
.toc-grid {
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
}
.toc-item {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    border-bottom: 0.3pt dotted #cbd5e1;
}
.toc-name { font-weight: 600; color: #1e293b; }
.toc-count { font-weight: bold; color: #0284c7; }

/* Section Banner */
.section-banner {
    break-before: page;
    background: #0f172a;
    color: #ffffff;
    padding: 6px 10px;
    border-radius: 3px;
    margin: 10px 0 6px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.section-banner:first-of-type {
    break-before: auto;
}
.section-title {
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.2px;
}
.section-badge {
    background: #2563eb;
    color: #ffffff;
    font-size: 7pt;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 2px;
}

/* Question Card - Flex Layout */
.q-card {
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
}
.q-main {
    flex: 1;
    min-width: 0;
}

/* Top bar with all badges moved to LEFT */
.q-top {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    padding-bottom: 3px;
    border-bottom: 0.4pt solid #f1f5f9;
}
.q-num {
    background: #0f172a;
    color: #ffffff;
    font-weight: 800;
    font-size: 7.5pt;
    padding: 1.5px 5px;
    border-radius: 2px;
    letter-spacing: 0.3px;
}
.tag {
    font-size: 6.8pt;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 2px;
    border: 0.4pt solid #cbd5e1;
    background: #f8fafc;
    color: #475569;
}
.tag-lic { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
.tag-src { background: #fdf4ff; color: #86198f; border-color: #f5d0fe; }

.q-prompt {
    font-size: 8.8pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 4px;
    line-height: 1.25;
}

/* Dedicated Image Box */
.q-img-box {
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
}
.q-img-box img {
    max-width: 100%;
    max-height: 140px;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 2px;
    display: block;
}

/* Options */
.options-list {
    list-style: none;
    padding: 0;
    margin: 0 0 4px 0;
}
.opt-item {
    display: flex;
    align-items: baseline;
    font-size: 8pt;
    padding: 2px 4px;
    margin-bottom: 2px;
    border-radius: 2px;
    border: 0.4pt solid transparent;
}
.opt-item.correct {
    background: #ecfdf5;
    border-color: #10b981;
    color: #065f46;
    font-weight: 600;
}
.opt-letter {
    font-weight: 700;
    min-width: 18px;
    color: #475569;
}
.opt-item.correct .opt-letter { color: #047857; }
.opt-text { flex: 1; }
.correct-badge {
    font-size: 6.5pt;
    font-weight: 800;
    color: #047857;
    background: #d1fae5;
    padding: 1px 4px;
    border-radius: 2px;
    margin-left: 6px;
    border: 0.4pt solid #6ee7b7;
    white-space: nowrap;
}

/* Explanation */
.q-explanation {
    margin-top: 3px;
    padding: 3px 6px;
    background: #f8fafc;
    border-left: 2pt solid #0284c7;
    font-size: 7.2pt;
    color: #334155;
    line-height: 1.25;
}
</style>
</head>
<body>
""")

# Document Header & Table of Contents
html_parts.append(f"""
<div class="doc-header">
    <div class="doc-title">New Zealand Road Code - Master Question Bank</div>
    <div class="doc-subtitle">Complete 1,279 Unique Questions with Validated Answers & Diagrams</div>
    <div class="doc-meta">
        <span><b>Total Questions:</b> 1,279</span>
        <span><b>Official NZTA / Waka Kotahi:</b> 990</span>
        <span><b>DT Driver Training (Extended):</b> 289</span>
        <span><b>Diagrams & Signs:</b> 500 Illustrated Questions</span>
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
        if q["img_path"]:
            img_box_html = f'<div class="q-img-box"><img src="file://{q["img_path"]}" alt="Diagram" /></div>'
            
        opts_html = []
        for oidx, otxt in enumerate(q["options"]):
            is_c = (oidx == q["correct_idx"])
            c_cls = "correct" if is_c else ""
            c_badge = '<span class="correct-badge">&#10004; Correct</span>' if is_c else ''
            letter = letters[oidx] if oidx < len(letters) else str(oidx+1)
            opts_html.append(f"""
            <li class="opt-item {c_cls}">
                <span class="opt-letter">[{letter}]</span>
                <span class="opt-text">{otxt}</span>
                {c_badge}
            </li>
            """)
            
        exp_html = ""
        if q["explanation"] and len(q["explanation"]) > 5:
            exp_text = q["explanation"]
            if len(exp_text) > 280:
                exp_text = exp_text[:280].rsplit(" ", 1)[0] + "..."
            exp_html = f'<div class="q-explanation"><strong>Explanation:</strong> {exp_text}</div>'
            
        html_parts.append(f"""
        <div class="q-card">
            <div class="q-main">
                <div class="q-top">
                    <span class="q-num">{q_id_str}</span>
                    <span class="tag tag-lic">{q["license"]}</span>
                    <span class="tag">{q["category"]}</span>
                    <span class="tag tag-src">{q["source"]}</span>
                </div>
                <div class="q-prompt">{q["prompt"]}</div>
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
html_file = "/root/nz-dirving/export/nz_road_code_1279.html"
with open(html_file, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Generated HTML: {html_file} ({len(html_content)/1024:.1f} KB)")
print("Total questions in document:", global_qnum - 1)
