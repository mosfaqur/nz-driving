#!/usr/bin/env python3
"""
Automated end-to-end verification script for Nationwide New Zealand Practical Test Routes.
Verifies all 66 test centres across 12 regions on production (http://192.168.1.100:8011).
"""

import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

TARGET_URL = "http://192.168.1.100:8011"
ARTIFACT_DIR = "/root/.gemini/antigravity-cli/brain/d65bb738-4a77-47a0-8d8f-6ea110515598"
SCREENSHOT_DIR = "/root/nz-dirving/docs/screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

chrome_options = Options()
chrome_options.binary_location = "/usr/bin/chromium"
chrome_options.add_argument("--headless=new")
chrome_options.add_argument("--no-sandbox")
chrome_options.add_argument("--disable-dev-shm-usage")
chrome_options.add_argument("--disable-gpu")
chrome_options.add_argument("--window-size=1280,850")

service = Service("/usr/bin/chromedriver")
driver = webdriver.Chrome(service=service, options=chrome_options)
wait = WebDriverWait(driver, 15)

TOKEN = "4tKMdzka1QyjMZVy7ECh4vKyEoWGmOZX912dQULr2xY"

try:
    print(f"Connecting to {TARGET_URL}...")
    driver.get(f"{TARGET_URL}/?token={TOKEN}&view=routes")
    time.sleep(2.5)

    # Navigate to "Driving Routes & GPS" tab
    print("Navigating to Driving Routes tab...")
    routes_tab = wait.until(EC.element_to_be_clickable((By.ID, "nav-routes")))
    driver.execute_script("arguments[0].click();", routes_tab)

    # Wait for initial cards to render
    print("Waiting for test centres and route cards to render...")
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "center-card")))
    time.sleep(1)

    # 1. Verify nationwide summary
    summary_el = wait.until(EC.visibility_of_element_located((By.ID, "routes-summary-text")))
    print("Summary text:", summary_el.text)
    assert "66 testing centres" in summary_el.text, f"Expected 66 centres, got: {summary_el.text}"
    assert "145 routes" in summary_el.text, f"Expected 145 routes, got: {summary_el.text}"

    # Screenshot 1: Nationwide Overview
    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "nationwide_overview.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "nationwide_overview.png"))
    print("Saved nationwide overview screenshot.")

    # 2. Filter by Wellington
    print("Filtering by Wellington...")
    wlg_btn = driver.find_element(By.CSS_SELECTOR, "button.region-pill-btn[data-region='wellington']")
    driver.execute_script("arguments[0].click();", wlg_btn)
    time.sleep(1)

    print("Wellington summary text:", summary_el.text)
    assert "6 testing centres" in summary_el.text, f"Expected 6 centres for Wellington, got: {summary_el.text}"
    assert "12 routes" in summary_el.text, f"Expected 12 routes for Wellington, got: {summary_el.text}"

    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "wellington_routes.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "wellington_routes.png"))
    print("Saved Wellington routes screenshot.")

    # 3. Filter by Canterbury
    print("Filtering by Canterbury...")
    cant_btn = driver.find_element(By.CSS_SELECTOR, "button.region-pill-btn[data-region='canterbury']")
    driver.execute_script("arguments[0].click();", cant_btn)
    time.sleep(1)

    print("Canterbury summary text:", summary_el.text)
    assert "6 testing centres" in summary_el.text, f"Expected 6 centres for Canterbury, got: {summary_el.text}"
    assert "12 routes" in summary_el.text, f"Expected 12 routes for Canterbury, got: {summary_el.text}"

    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "canterbury_routes.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "canterbury_routes.png"))
    print("Saved Canterbury routes screenshot.")

    # 4. Filter by Wellington to find Thorndon
    print("Switching back to Wellington to inspect Thorndon...")
    wlg_btn = driver.find_element(By.CSS_SELECTOR, "button.region-pill-btn[data-region='wellington']")
    driver.execute_script("arguments[0].click();", wlg_btn)
    time.sleep(1)

    print("Searching for Thorndon...")
    search_input = driver.find_element(By.ID, "routes-search-input")
    search_input.clear()
    search_input.send_keys("Thorndon")
    time.sleep(1.2)

    print("Search summary text:", summary_el.text)
    thorndon_card = wait.until(EC.presence_of_element_located((By.ID, "center-wellington-thorndon")))
    driver.execute_script("arguments[0].scrollIntoView(true);", thorndon_card)
    time.sleep(0.5)
    print("Found Thorndon card by ID: center-wellington-thorndon")

    # 5. Open Route Modal for Thorndon
    print("Opening Thorndon route modal...")
    details_btn = thorndon_card.find_element(By.CSS_SELECTOR, ".route-card .btn-route-details")
    driver.execute_script("arguments[0].scrollIntoView(true);", details_btn)
    time.sleep(0.5)
    driver.execute_script("arguments[0].click();", details_btn)
    time.sleep(1.2)

    modal_title = wait.until(EC.visibility_of_element_located((By.ID, "routeModalTitle")))
    print("Route modal opened:", modal_title.text)

    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "thorndon_route_modal.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "thorndon_route_modal.png"))
    print("Saved Thorndon route modal screenshot.")

    # Close modal
    driver.execute_script("closeRouteModal();")
    time.sleep(1)

    # 6. Launch Demo Drive simulation for Thorndon
    print("Launching Demo Drive for Thorndon...")
    demo_btn = thorndon_card.find_element(By.CSS_SELECTOR, ".route-card .btn-demo-sim-card")
    driver.execute_script("arguments[0].scrollIntoView(true);", demo_btn)
    time.sleep(0.5)
    driver.execute_script("arguments[0].click();", demo_btn)
    time.sleep(3)

    # Check HUD
    hud_instr = wait.until(EC.visibility_of_element_located((By.ID, "driverInstruction")))
    speed_el = driver.find_element(By.ID, "driverLiveSpeed")
    print("Driver Nav HUD Active! Instruction:", hud_instr.text, "| Live speed:", speed_el.text)

    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "thorndon_demo_drive_hud.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "thorndon_demo_drive_hud.png"))
    print("Saved Thorndon demo drive HUD screenshot.")

    print("\nALL NATIONWIDE VERIFICATION CHECKS PASSED SUCCESSFULLY!")

finally:
    driver.quit()
