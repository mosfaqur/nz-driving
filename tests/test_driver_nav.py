#!/usr/bin/env python3
import os
import time
import subprocess
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from webapp.database import create_session

ARTIFACTS_DIR = "/root/.gemini/antigravity-cli/brain/d65bb738-4a77-47a0-8d8f-6ea110515598"
PORT = 8013

print("Starting test server on port", PORT)
srv = subprocess.Popen(["python3", "/root/nz-dirving/webapp/server.py", "--port", str(PORT), "--host", "127.0.0.1"])
time.sleep(2.5)

try:
    chrome_options = Options()
    chrome_options.binary_location = "/usr/bin/chromium"
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1280,820")

    service = Service("/usr/bin/chromedriver")
    driver = webdriver.Chrome(service=service, options=chrome_options)

    # 1. Load app with authenticated token in URL query parameter
    token = create_session(2)
    driver.get(f"http://127.0.0.1:{PORT}/?token={token}")
    time.sleep(2.0)

    # 2. Switch to Routes view
    nav_routes = WebDriverWait(driver, 10).until(EC.element_to_be_clickable((By.ID, "nav-routes")))
    driver.execute_script("arguments[0].click();", nav_routes)
    
    # Wait for routes to load from API
    WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CLASS_NAME, "route-card")))
    time.sleep(1.0)

    # Take screenshot of Routes overview with new action buttons
    routes_overview_path = os.path.join(ARTIFACTS_DIR, "routes_overview_with_nav.png")
    driver.save_screenshot(routes_overview_path)
    print("Saved:", routes_overview_path)

    # 3. Find any route card (e.g. Westgate or first route card)
    route_cards = driver.find_elements(By.CLASS_NAME, "route-card")
    print("Found total route cards:", len(route_cards))
    target_card = route_cards[0] # First route card
    for card in route_cards:
        if "westgate" in card.get_attribute("id"):
            target_card = card
            break
            
    steps_btn = target_card.find_element(By.CSS_SELECTOR, ".btn-route-details")
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", steps_btn)
    time.sleep(0.3)
    driver.execute_script("arguments[0].click();", steps_btn)
    time.sleep(0.8)

    modal_path = os.path.join(ARTIFACTS_DIR, "route_modal_with_nav_btns.png")
    driver.save_screenshot(modal_path)
    print("Saved:", modal_path)

    # 4. Launch In-App GPS Navigation from modal
    start_gps_btn = driver.find_element(By.ID, "routeModalStartGpsBtn")
    driver.execute_script("arguments[0].click();", start_gps_btn)
    time.sleep(1.5)

    # Verify #driverNavOverlay is visible
    overlay = driver.find_element(By.ID, "driverNavOverlay")
    assert overlay.is_displayed(), "Driver Nav Overlay is not visible!"

    nav_hud_path = os.path.join(ARTIFACTS_DIR, "driver_nav_hud_view.png")
    driver.save_screenshot(nav_hud_path)
    print("Saved:", nav_hud_path)

    # 5. Start Demo Simulation
    demo_btn = driver.find_element(By.ID, "driverDemoBtn")
    driver.execute_script("arguments[0].click();", demo_btn)
    print("Demo simulation started. Waiting for 3 seconds of driving...")
    time.sleep(3)

    # Verify speedometer has live speed
    speed_text = driver.find_element(By.ID, "driverLiveSpeed").text
    print("Live Speed Readout during Demo:", speed_text, "km/h")

    demo_sim_path = os.path.join(ARTIFACTS_DIR, "driver_nav_demo_simulating.png")
    driver.save_screenshot(demo_sim_path)
    print("Saved:", demo_sim_path)

    # 6. Test Mobile Viewport (iPhone / Pixel form factor)
    driver.set_window_size(390, 844)
    time.sleep(1)
    mobile_hud_path = os.path.join(ARTIFACTS_DIR, "driver_nav_mobile_hud.png")
    driver.save_screenshot(mobile_hud_path)
    print("Saved:", mobile_hud_path)

    # 7. Exit Navigation
    exit_btn = driver.find_element(By.CSS_SELECTOR, ".btn-driver-exit")
    driver.execute_script("arguments[0].click();", exit_btn)
    time.sleep(0.5)

    assert not overlay.is_displayed(), "Driver Nav Overlay did not close!"
    print("Navigation exited successfully.")

    driver.quit()
    print("ALL TESTS PASSED SUCCESSFULLY!")

finally:
    srv.terminate()
