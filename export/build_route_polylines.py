#!/usr/bin/env python3
import json
import os
import re
import time
import urllib.parse
import urllib.request

DATA_FILE = "/root/nz-dirving/export/auckland_test_routes.json"
CACHE_FILE = "/root/nz-dirving/export/geocode_cache.json"

cache = {}
if os.path.exists(CACHE_FILE):
    try:
        with open(CACHE_FILE, "r") as f:
            cache = json.load(f)
    except Exception:
        cache = {}

def save_cache():
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

def clean_street_name(name):
    name = re.sub(r'\(.*', '', name)
    name = re.sub(r'Continue to follow.*', '', name, flags=re.IGNORECASE)
    name = re.sub(r'/.*', '', name)
    parts = [p.strip() for p in name.split(',') if p.strip()]
    street = parts[0] if parts else name
    return ' '.join(street.split())

def geocode(raw_query):
    street = clean_street_name(raw_query)
    cache_key = street.lower()
    if cache_key in cache:
        return cache[cache_key]

    variations = [
        f"{street}, Auckland, New Zealand",
        f"{street}, Auckland",
        street
    ]

    for q in variations:
        try:
            url = f"https://photon.komoot.io/api/?q={urllib.parse.quote(q)}&limit=3"
            req = urllib.request.Request(url, headers={"User-Agent": "NZDrivingApp/1.0"})
            with urllib.request.urlopen(req, timeout=5) as res:
                data = json.loads(res.read().decode("utf-8"))
                for feat in data.get("features", []):
                    coords = feat["geometry"]["coordinates"] # [lng, lat]
                    lat, lng = coords[1], coords[0]
                    if -37.5 <= lat <= -36.2 and 174.2 <= lng <= 175.4:
                        cache[cache_key] = [round(lat, 6), round(lng, 6)]
                        save_cache()
                        return cache[cache_key]
            time.sleep(0.1)
        except Exception:
            time.sleep(0.2)

    return None

def fetch_osrm_polyline(coords_list):
    if len(coords_list) < 2:
        return None, 0, 0

    osrm_str = ';'.join(f"{c[1]},{c[0]}" for c in coords_list)
    url = f"https://router.project-osrm.org/route/v1/driving/{osrm_str}?overview=full&geometries=geojson&steps=false"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "NZDrivingApp/1.0"})
        with urllib.request.urlopen(req, timeout=15) as res:
            data = json.loads(res.read().decode("utf-8"))
            if data.get("code") == "Ok" and data.get("routes"):
                r0 = data["routes"][0]
                geojson_coords = r0["geometry"]["coordinates"] # [[lng, lat], ...]
                lat_lng_polyline = [[round(p[1], 6), round(p[0], 6)] for p in geojson_coords]
                return lat_lng_polyline, r0.get("distance", 0), r0.get("duration", 0)
    except Exception as e:
        print(f"OSRM Error: {e}")
    return None, 0, 0

def process_all_routes():
    with open(DATA_FILE, "r") as f:
        data = json.load(f)

    total_centers = len(data["centers"])
    total_routes_updated = 0

    for ci, center in enumerate(data["centers"], 1):
        c_lat = center["coords"]["lat"]
        c_lng = center["coords"]["lng"]
        c_point = [round(c_lat, 6), round(c_lng, 6)]
        print(f"\n[{ci}/{total_centers}] Center: {center['name']} ({len(center['routes'])} routes)")

        for ri, route in enumerate(center["routes"], 1):
            waypoints = route.get("waypoints", [])
            route_coords = [c_point]
            snapped_wps = [{"name": center["name"] + " (Start)", "lat": c_point[0], "lng": c_point[1]}]

            for wp in waypoints:
                pt = geocode(wp)
                if pt:
                    route_coords.append(pt)
                    snapped_wps.append({"name": clean_street_name(wp), "lat": pt[0], "lng": pt[1]})
                else:
                    print(f"    ! Could not geocode: {wp}")

            route_coords.append(c_point)
            snapped_wps.append({"name": center["name"] + " (Finish)", "lat": c_point[0], "lng": c_point[1]})

            polyline, dist_m, dur_s = fetch_osrm_polyline(route_coords)
            if polyline and len(polyline) > 10:
                route["polyline_coords"] = polyline
                route["snapped_waypoints"] = snapped_wps
                route["total_distance_m"] = round(dist_m)
                route["total_duration_s"] = round(dur_s)
                total_routes_updated += 1
                print(f"  Route {ri}: {route['route_code']} -> {len(polyline)} road points ({dist_m/1000:.1f} km)")
            else:
                route["polyline_coords"] = route_coords
                route["snapped_waypoints"] = snapped_wps
                print(f"  Route {ri}: {route['route_code']} -> fallback {len(route_coords)} nodes")

            time.sleep(0.1)

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nDone! Successfully updated {total_routes_updated} routes with high-resolution road geometries.")

if __name__ == "__main__":
    process_all_routes()
