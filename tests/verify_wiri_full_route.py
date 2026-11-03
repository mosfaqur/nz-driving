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
chrome_options.add_argument("--window-size=1280,850")

service = Service("/usr/bin/chromedriver")
driver = webdriver.Chrome(service=service, options=chrome_options)

try:
    print(f"Connecting to {TARGET_HOST} for Wiri Full Licence Route verification...")
    driver.get(f"{TARGET_HOST}/?token={TOKEN}&view=routes")
    time.sleep(2.5)

    # 1. Switch to Routes view
    nav_routes = WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "nav-routes")))
    driver.execute_script("arguments[0].click();", nav_routes)

    # Wait for route cards
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CLASS_NAME, "route-card")))
    time.sleep(1.0)

    # 2. Filter or search for Wiri
    search_input = WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "routes-search-input")))
    search_input.clear()
    search_input.send_keys("Wiri")
    time.sleep(1.2)

    # Find the Full Licence route card
    route_cards = driver.find_elements(By.CLASS_NAME, "route-card")
    print(f"Found {len(route_cards)} route cards matching search 'Wiri'.")
    wiri_full_card = None
    for card in route_cards:
        cid = card.get_attribute("id") or ""
        txt = card.text
        if "wiri-full-1" in cid or "Full Licence" in txt:
            wiri_full_card = card
            break

    assert wiri_full_card is not None, "Could not find wiri-full-1 card!"
    print("Found wiri_full_card text:", wiri_full_card.text.replace("\n", " | "))

    # Capture Wiri filtered routes overview
    shot1 = os.path.join(DOCS_SCREENSHOTS_DIR, "wiri_routes_overview.png")
    driver.save_screenshot(shot1)
    os.system(f"cp {shot1} {ARTIFACTS_DIR}/wiri_routes_overview.png")
    print(f"Saved: {shot1}")

    # 3. Open Route Details Modal for Wiri Full Licence
    steps_btn = wiri_full_card.find_element(By.CSS_SELECTOR, ".btn-route-details")
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", steps_btn)
    time.sleep(0.3)
    driver.execute_script("arguments[0].click();", steps_btn)
    time.sleep(1.0)

    # Capture Route Details Modal showing motorway instructions
    shot2 = os.path.join(DOCS_SCREENSHOTS_DIR, "wiri_full_route_modal.png")
    driver.save_screenshot(shot2)
    os.system(f"cp {shot2} {ARTIFACTS_DIR}/wiri_full_route_modal.png")
    print(f"Saved: {shot2}")

    # 4. Launch In-App GPS Navigation
    start_gps_btn = driver.find_element(By.ID, "routeModalStartGpsBtn")
    driver.execute_script("arguments[0].click();", start_gps_btn)
    time.sleep(1.5)

    overlay = driver.find_element(By.ID, "driverNavOverlay")
    assert overlay.is_displayed(), "Driver Nav Overlay is not visible!"

    # 5. Start Demo Simulation along the Southwestern Motorway
    demo_btn = driver.find_element(By.ID, "driverDemoBtn")
    driver.execute_script("arguments[0].click();", demo_btn)
    print("Demo Drive simulation started on Wiri Full Motorway route. Waiting 3.5 seconds...")
    time.sleep(3.5)

    speed_text = driver.find_element(By.ID, "driverLiveSpeed").text
    instruction_text = driver.find_element(By.ID, "driverInstruction").text
    distance_to_turn = driver.find_element(By.ID, "driverCountdown").text
    step_meta = driver.find_element(By.ID, "driverStepMeta").text
    print(f"HUD State -> Speed: {speed_text} km/h | Step: {step_meta} | Next: {instruction_text} ({distance_to_turn})")

    shot3 = os.path.join(DOCS_SCREENSHOTS_DIR, "wiri_full_motorway_demo_hud.png")
    driver.save_screenshot(shot3)
    os.system(f"cp {shot3} {ARTIFACTS_DIR}/wiri_full_motorway_demo_hud.png")
    print(f"Saved: {shot3}")

    # 6. Exit Navigation
    exit_btn = driver.find_element(By.CSS_SELECTOR, ".btn-driver-exit")
    driver.execute_script("arguments[0].click();", exit_btn)
    time.sleep(0.5)

    print("WIRI FULL LICENCE MOTORWAY ROUTE VERIFICATION COMPLETED SUCCESSFULLY!")

finally:
    driver.quit()
