import json, os, html, subprocess

print("=" * 65)
print("NZ ROAD CODE - 570 CANONICAL QUESTIONS MASTER PDF BUILDER")
print("=" * 65)

_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_DIR = os.path.dirname(_DIR)
SRC_JSON = os.path.join(_DIR, "master_unique_questions.json")
HTML_OUT = os.path.join(_DIR, "nz_road_code_master.html")
PDF_OUT = os.path.join(_DIR, "NZ_Road_Code_Master_Unique_Questions_Print_Friendly.pdf")

def resolve_img(ip):
    if not ip:
        return None
    if os.path.isabs(ip) and os.path.exists(ip):
        return ip
    cand1 = os.path.join(_REPO_DIR, ip)
    if os.path.exists(cand1):
        return cand1
    cand2 = os.path.join(_DIR, ip)
    if os.path.exists(cand2):
        return cand2
    return None

with open(SRC_JSON, "r", encoding="utf-8") as f:
    questions = json.load(f)

print(f"Loaded {len(questions)} verified canonical questions from {SRC_JSON}")

SECTION_ORDER = [
    "Motorcycle Specific (Class 6)",
    "Intersections & Give-Way Scenarios",
    "Core Rules & General Theory",
    "Heavy Vehicles & Commercial Driving (Classes 2–5)",
    "Driving Behaviour & Defensive Driving",
    "Road Signs, Signals & Markings",
    "Road Position & Overtaking",
    "Emergencies & Road Safety",
    "Parking & Stopping Restrictions",
    "Tourist & Driving in NZ Preparation"
]

sections_dict = {s: [] for s in SECTION_ORDER}
for q in questions:
    s = q.get("section")
    if s in sections_dict:
        sections_dict[s].append(q)
    else:
        sections_dict["Core Rules & General Theory"].append(q)

letters = ["A", "B", "C", "D", "E", "F"]
total_illustrated = sum(1 for q in questions if resolve_img(q.get("image_path")))
total_dups = 1279 - len(questions)

html_parts = []
html_parts.append(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>New Zealand Road Code - Master Question Bank ({len(questions)} Unique Questions)</title>
<style>
@page {{
    size: A4;
    margin: 10mm 8mm 10mm 8mm;
    @top-left {{
        content: "New Zealand Road Code - Master Question Bank ({len(questions)} Clean Unique Questions)";
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

# Header
html_parts.append(f"""
<div class="doc-header">
    <div class="doc-title">New Zealand Road Code - Master Question Bank</div>
    <div class="doc-subtitle">Complete {len(questions)} Unique Questions with Validated Answers & Diagrams (Semantic Deduplicated)</div>
    <div class="doc-meta">
        <span><b>Total Unique Questions:</b> {len(questions)}</span>
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
        resolved_ip = resolve_img(q.get("image_path"))
        if resolved_ip:
            img_box_html = f'<div class="q-img-box"><img src="file://{os.path.abspath(resolved_ip)}" alt="Diagram" /></div>'

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
        if q.get("explanation") and len(q["explanation"]) > 5:
            exp_text = q["explanation"]
            if len(exp_text) > 280:
                exp_text = exp_text[:280].rsplit(" ", 1)[0] + "..."
            exp_html = f'<div class="q-explanation"><strong>Explanation:</strong> {html.escape(exp_text)}</div>'

        multi_badge_html = ""
        if q.get("is_multi_answer"):
            multi_badge_html = f'<span class="tag tag-multi">Multiple Answers</span>'

        html_parts.append(f"""
        <div class="q-card">
            <div class="q-main">
                <div class="q-top">
                    <span class="q-num">{q_id_str}</span>
                    <span class="tag tag-lic">{html.escape(q.get("license_class", "All Classes"))}</span>
                    <span class="tag">{html.escape(q.get("category", "General"))}</span>
                    <span class="tag tag-src">{html.escape(q.get("source", "NZTA"))}</span>
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
with open(HTML_OUT, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Generated HTML: {HTML_OUT} with {global_qnum - 1} questions ({len(html_content)/1024:.1f} KB).")
