#!/usr/bin/env python3
import urllib.request
import re
import json
import time
import os

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

REGIONS = [
    'auckland', 'bay-of-plenty', 'canterbury', 'hawkes-bay',
    'manawatu-whanganui', 'nelson-marlborough-tasman', 'northland', 'otago',
    'southland', 'taranaki', 'waikato', 'wellington'
]

OUT_FILE = '/root/nz-dirving/export/nz_all_scraped_routes.json'

def fetch_html(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def clean_text(html_fragment):
    clean = re.sub(r'<[^>]+>', ' ', html_fragment)
    return ' '.join(clean.split())

def scrape_centre_page(region, path):
    url = f"https://nzdrivingtestroutes.com{path}"
    html = fetch_html(url)
    if not html:
        return None

    # Title & H1
    h1_match = re.search(r'<h1[^>]*>(.*?)</h1>', html, re.DOTALL)
    h1_title = clean_text(h1_match.group(1)) if h1_match else ""

    # Parse Table Steps
    steps = []
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
    for r in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', r, re.DOTALL)
        if len(cells) >= 4:
            s_num = clean_text(cells[0])
            inst = clean_text(cells[1])
            dur = clean_text(cells[2])
            dist = clean_text(cells[3])
            try:
                s_idx = int(s_num)
                steps.append({
                    "step_num": s_idx,
                    "instruction": inst,
                    "duration": dur,
                    "distance": dist
                })
            except ValueError:
                continue

    # Parse Address & Hours
    address = ""
    addr_match = re.search(r'<strong>Address:</strong>\s*([^<]+)', html)
    if addr_match:
        address = clean_text(addr_match.group(1))

    # Parse Challenges & Tips
    tips = []
    tip_matches = re.findall(r'<p><strong>Tip:</strong>\s*(.*?)</p>', html, re.DOTALL)
    for t in tip_matches:
        tips.append(clean_text(t))

    summary_p = ""
    p_matches = re.findall(r'<p[^>]*>(.*?)</p>', html, re.DOTALL)
    for p in p_matches:
        c = clean_text(p)
        if "sample" in c.lower() and "route" in c.lower() and len(c) > 30:
            summary_p = c
            break

    # Parse distance and duration from summary paragraph if available
    dist_km = 0.0
    dur_str = "30 min"
    dist_m = re.search(r'(\d+(?:\.\d+)?)\s*km', summary_p)
    if dist_m:
        dist_km = float(dist_m.group(1))
    dur_m = re.search(r'(\d+\s*min(?:\s*\d+\s*s)?)', summary_p)
    if dur_m:
        dur_str = dur_m.group(1)

    slug = path.split('/')[-1]
    name = h1_title.replace(" Driving Test Routes - Restricted & Full", "").strip()
    if not name:
        name = slug.replace("-", " ").title()

    return {
        "slug": slug,
        "path": path,
        "region": region,
        "title": h1_title,
        "name": name,
        "address": address,
        "summary": summary_p,
        "distance_km": dist_km,
        "duration_str": dur_str,
        "tips": tips,
        "steps_count": len(steps),
        "steps": steps
    }

def main():
    print("Collecting all New Zealand test centres...")
    all_centres_by_region = {}
    total_found = 0

    for reg in REGIONS:
        url = f"https://nzdrivingtestroutes.com/{reg}"
        html = fetch_html(url)
        if not html:
            continue
        links = set(re.findall(r'href=[\"\'](/' + reg + r'/[^\"\'#?]+)[\"\']', html))
        sorted_links = sorted(links)
        all_centres_by_region[reg] = sorted_links
        total_found += len(sorted_links)
        print(f"Region: {reg} -> {len(sorted_links)} test centres")

    print(f"\nTotal test centres to scrape: {total_found}")
    scraped_data = {}

    idx = 1
    for reg, paths in all_centres_by_region.items():
        print(f"\n--- Scraping Region: {reg} ({len(paths)} centres) ---")
        for p in paths:
            print(f"[{idx}/{total_found}] Scraping {p}...")
            c_data = scrape_centre_page(reg, p)
            if c_data:
                slug_key = f"{reg}:{c_data['slug']}"
                scraped_data[slug_key] = c_data
                print(f"   -> {c_data['name']}: {c_data['steps_count']} steps, {c_data['distance_km']} km, addr: {c_data['address']}")
            idx += 1
            time.sleep(0.3)

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(scraped_data, f, indent=2, ensure_ascii=False)

    print(f"\nSUCCESS! Scraped {len(scraped_data)} test centres across all of New Zealand.")
    print(f"Saved to: {OUT_FILE}")

if __name__ == '__main__':
    main()
