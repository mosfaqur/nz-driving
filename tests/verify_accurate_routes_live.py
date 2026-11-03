#!/usr/bin/env python3
import os
import sys
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ARTIFACTS_DIR = "/root/.gemini/antigravity-cli/brain/d65bb738-4a77-47a0-8d8f-6ea110515598"
DOCS_SCREENSHOTS_DIR = "/root/nz-dirving/docs/screenshots"
os.makedirs(DOCS_SCREENSHOTS_DIR, exist_ok=True)

TARGET_HOST = "http://192.168.1.100:8011"
TOKEN = "4tKMdzka1QyjMZVy7ECh4vKyEoWGmOZX912dQULr2xY"

chrome_options = Options()
chrome_options.binary_location = "/usr/bin/chromium"
chrome_options.add_argument("--headless=new")
chrome_options.add_argument("--no-sandbox")
chrome_options.add_argument("--disable-dev-shm-usage")
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--window-size=1280,820")

service = Service("/usr/bin/chromedriver")
driver = webdriver.Chrome(service=service, options=chrome_options)

try:
    print(f"Connecting to {TARGET_HOST} with token...")
    driver.get(f"{TARGET_HOST}/?token={TOKEN}&view=routes")
    time.sleep(2.5)

    # 1. Switch to Routes view if not already active
    nav_routes = WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "nav-routes")))
    driver.execute_script("arguments[0].click();", nav_routes)
    
    # Wait for route cards
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CLASS_NAME, "route-card")))
    time.sleep(1.0)

    # Capture accurate routes overview
    shot1 = os.path.join(DOCS_SCREENSHOTS_DIR, "accurate_routes_overview.png")
    driver.save_screenshot(shot1)
    os.system(f"cp {shot1} {ARTIFACTS_DIR}/accurate_routes_overview.png")
    print(f"Saved: {shot1}")

    # Inspect rendered route distances on page
    route_cards = driver.find_elements(By.CLASS_NAME, "route-card")
    print(f"Found {len(route_cards)} route cards on screen.")
    card_info = []
    for card in route_cards[:8]:
        title = card.find_element(By.TAG_NAME, "h4").text if card.find_elements(By.TAG_NAME, "h4") else "Unknown"
        text = card.text.replace("\n", " | ")
        card_info.append(f"{title}: {text}")
    print("Sample route cards rendered:")
    for ci in card_info:
        print("  -", ci)

    # 2. Select Westgate or Albany route card
    target_card = None
    for card in route_cards:
        cid = card.get_attribute("id") or ""
        if "westgate" in cid.lower() or "albany" in cid.lower():
            target_card = card
            break
    if not target_card:
        target_card = route_cards[0]

    steps_btn = target_card.find_element(By.CSS_SELECTOR, ".btn-route-details")
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", steps_btn)
    time.sleep(0.3)
    driver.execute_script("arguments[0].click();", steps_btn)
    time.sleep(1.0)

    # Capture Route Details Modal
    shot2 = os.path.join(DOCS_SCREENSHOTS_DIR, "accurate_route_modal.png")
    driver.save_screenshot(shot2)
    os.system(f"cp {shot2} {ARTIFACTS_DIR}/accurate_route_modal.png")
    print(f"Saved: {shot2}")

    # 3. Launch In-App GPS Navigation from modal
    start_gps_btn = driver.find_element(By.ID, "routeModalStartGpsBtn")
    driver.execute_script("arguments[0].click();", start_gps_btn)
    time.sleep(1.5)

    overlay = driver.find_element(By.ID, "driverNavOverlay")
    assert overlay.is_displayed(), "Driver Nav Overlay is not visible!"

    # 4. Start Demo Drive Simulation
    demo_btn = driver.find_element(By.ID, "driverDemoBtn")
    driver.execute_script("arguments[0].click();", demo_btn)
    print("Demo Drive simulation started. Waiting 3.5 seconds...")
    time.sleep(3.5)

    speed_text = driver.find_element(By.ID, "driverLiveSpeed").text
    print(f"Live Speed Readout during Demo: {speed_text} km/h")

    shot3 = os.path.join(DOCS_SCREENSHOTS_DIR, "accurate_nav_demo_drive.png")
    driver.save_screenshot(shot3)
    os.system(f"cp {shot3} {ARTIFACTS_DIR}/accurate_nav_demo_drive.png")
    print(f"Saved: {shot3}")

    # 5. Mobile viewport check
    driver.set_window_size(390, 844)
    time.sleep(1.0)
    shot4 = os.path.join(DOCS_SCREENSHOTS_DIR, "accurate_nav_mobile_hud.png")
    driver.save_screenshot(shot4)
    os.system(f"cp {shot4} {ARTIFACTS_DIR}/accurate_nav_mobile_hud.png")
    print(f"Saved: {shot4}")

    # 6. Exit Navigation
    exit_btn = driver.find_element(By.CSS_SELECTOR, ".btn-driver-exit")
    driver.execute_script("arguments[0].click();", exit_btn)
    time.sleep(0.5)

    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")

finally:
    driver.quit()
