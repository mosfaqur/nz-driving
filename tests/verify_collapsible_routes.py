#!/usr/bin/env python3
"""
Automated verification for collapsible accordion navigation in Practical Driving Test Routes.
Verifies compact collapsed mode, Expand All, Collapse All, single toggle, and search auto-expand.
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

    # 1. Switch to Routes view
    nav_routes = wait.until(EC.element_to_be_clickable((By.ID, "nav-routes")))
    driver.execute_script("arguments[0].click();", nav_routes)

    # Wait for centre cards to render
    wait.until(EC.presence_of_element_located((By.CLASS_NAME, "center-card")))
    time.sleep(1)

    cards = driver.find_elements(By.CLASS_NAME, "center-card")
    print(f"Rendered {len(cards)} test centre cards.")
    assert len(cards) >= 66, f"Expected 66 centres, got {len(cards)}"

    # Check how many are collapsed vs expanded initially
    collapsed_cards = driver.find_elements(By.CSS_SELECTOR, ".center-card.is-collapsed")
    print(f"Initially collapsed centres: {len(collapsed_cards)} of {len(cards)}")
    assert len(collapsed_cards) == len(cards), "Expected all centres to be collapsed by default for clean navigation!"

    # Screenshot 1: Clean Collapsed Overview
    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "routes_collapsed_overview.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "routes_collapsed_overview.png"))
    print("Saved routes_collapsed_overview.png")

    # 2. Click Auckland to see regional view
    print("Filtering by Auckland...")
    akl_btn = driver.find_element(By.CSS_SELECTOR, "button.region-pill-btn[data-region='auckland']")
    driver.execute_script("arguments[0].click();", akl_btn)
    time.sleep(1)

    akl_cards = driver.find_elements(By.CLASS_NAME, "center-card")
    print(f"Auckland centres: {len(akl_cards)}")
    assert len(akl_cards) == 13, f"Expected 13 Auckland centres, got {len(akl_cards)}"

    # 3. Expand a single centre (e.g. Wiri)
    wiri_card = driver.find_element(By.ID, "center-wiri")
    driver.execute_script("arguments[0].scrollIntoView(true);", wiri_card)
    time.sleep(0.5)

    wiri_header = wiri_card.find_element(By.CLASS_NAME, "center-card-header")
    print("Clicking VTNZ Wiri header to toggle routes...")
    driver.execute_script("arguments[0].click();", wiri_header)
    time.sleep(0.8)

    assert "is-expanded" in wiri_card.get_attribute("class"), "Expected Wiri card to be expanded!"
    wiri_routes = wiri_card.find_elements(By.CLASS_NAME, "route-card")
    print(f"Wiri expanded! Visible routes in Wiri: {len(wiri_routes)}")
    assert len(wiri_routes) == 3, f"Expected 3 routes in Wiri, got {len(wiri_routes)}"

    # Screenshot 2: Single Centre Expanded
    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "routes_single_expanded.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "routes_single_expanded.png"))
    print("Saved routes_single_expanded.png")

    # 4. Test "Expand All"
    print("Clicking 'Expand All'...")
    expand_all_btn = driver.find_element(By.ID, "btn-routes-expand-all")
    driver.execute_script("arguments[0].click();", expand_all_btn)
    time.sleep(0.8)

    expanded_count = len(driver.find_elements(By.CSS_SELECTOR, ".center-card.is-expanded"))
    print(f"Expanded centres after 'Expand All': {expanded_count} of {len(akl_cards)}")
    assert expanded_count == len(akl_cards), "Expected all Auckland centres to be expanded!"

    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "routes_all_expanded.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "routes_all_expanded.png"))
    print("Saved routes_all_expanded.png")

    # 5. Test "Collapse All"
    print("Clicking 'Collapse All'...")
    collapse_all_btn = driver.find_element(By.ID, "btn-routes-collapse-all")
    driver.execute_script("arguments[0].click();", collapse_all_btn)
    time.sleep(0.8)

    collapsed_count = len(driver.find_elements(By.CSS_SELECTOR, ".center-card.is-collapsed"))
    print(f"Collapsed centres after 'Collapse All': {collapsed_count} of {len(akl_cards)}")
    assert collapsed_count == len(akl_cards), "Expected all Auckland centres to be collapsed!"

    # 6. Test Search Auto-Expand
    print("Searching for 'Thorndon'...")
    all_nz_btn = driver.find_element(By.CSS_SELECTOR, "button.region-pill-btn[data-region='all']")
    driver.execute_script("arguments[0].click();", all_nz_btn)
    time.sleep(0.5)

    search_input = driver.find_element(By.ID, "routes-search-input")
    search_input.clear()
    search_input.send_keys("Thorndon")
    time.sleep(1.2)

    thorndon_card = wait.until(EC.presence_of_element_located((By.ID, "center-wellington-thorndon")))
    print("Found Thorndon card class:", thorndon_card.get_attribute("class"))
    assert "is-expanded" in thorndon_card.get_attribute("class"), "Expected searched centre to auto-expand!"

    driver.save_screenshot(os.path.join(ARTIFACT_DIR, "routes_search_auto_expanded.png"))
    driver.save_screenshot(os.path.join(SCREENSHOT_DIR, "routes_search_auto_expanded.png"))
    print("Saved routes_search_auto_expanded.png")

    print("\nALL COLLAPSIBLE ACCORDION VERIFICATION CHECKS PASSED SUCCESSFULLY!")

finally:
    driver.quit()
