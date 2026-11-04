import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ARTIFACT_DIR = "/root/.gemini/antigravity-cli/brain/d65bb738-4a77-47a0-8d8f-6ea110515598"
DOCS_DIR = "/root/nz-dirving/docs/screenshots"
BASE_URL = "http://127.0.0.1:8011"
TOKEN = "tcuEf5a6nkiZhqBytlZPHS5g0S4990I9hF6aOmCsT_A"

os.makedirs(ARTIFACT_DIR, exist_ok=True)
os.makedirs(DOCS_DIR, exist_ok=True)

def get_driver(width=1280, height=900):
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.binary_location = "/usr/bin/chromium"
    options.add_argument(f"--window-size={width},{height}")
    service = Service("/usr/bin/chromedriver")
    return webdriver.Chrome(service=service, options=options)

def main():
    print("Beginning Waze Export verification...")
    driver = get_driver(1280, 950) # Desktop viewport
    wait = WebDriverWait(driver, 15)
    try:
        driver.get(f"{BASE_URL}/?token={TOKEN}&view=routes")
        time.sleep(2.5)

        # 1. Switch to Routes view
        nav_routes = wait.until(EC.element_to_be_clickable((By.ID, "nav-routes")))
        driver.execute_script("arguments[0].click();", nav_routes)

        # Wait for centre cards to render
        wait.until(EC.presence_of_element_located((By.CLASS_NAME, "center-card")))
        time.sleep(1)

        # Expand centres so route cards are visible
        driver.execute_script("expandAllCenters();")
        time.sleep(1)

        # Find Waze button on route card
        waze_card_btn = driver.find_element(By.CSS_SELECTOR, ".route-actions-row .btn-waze-secondary")
        card_waze_href = waze_card_btn.get_attribute("href")
        print("Route Card Waze Button href:", card_waze_href)
        assert "waze.com/ul" in card_waze_href, "Card Waze button missing waze.com/ul link"

        shot1 = os.path.join(DOCS_DIR, "waze_route_card_desktop.png")
        driver.save_screenshot(shot1)
        driver.save_screenshot(os.path.join(ARTIFACT_DIR, "waze_route_card_desktop.png"))
        print("Captured desktop route card screenshot.")

        # 2. Open Route Details Modal for Highbrook Restricted 2
        print("Opening Route Details Modal for highbrook-restricted-2...")
        driver.execute_script("openRouteModal('highbrook-restricted-2');")
        time.sleep(1.5)

        # Verify Header Waze Button
        modal_waze_btn = driver.find_element(By.ID, "routeModalWazeBtn")
        modal_waze_href = modal_waze_btn.get_attribute("href")
        print("Route Modal Header Waze href:", modal_waze_href)
        assert "waze.com/ul" in modal_waze_href, "Modal Waze button missing waze.com/ul link"
        assert modal_waze_btn.is_displayed(), "Modal Waze button should be visible"

        # Verify Footer Waze Button
        modal_footer_waze_btn = driver.find_element(By.ID, "routeModalFooterWazeBtn")
        footer_waze_href = modal_footer_waze_btn.get_attribute("href")
        print("Route Modal Footer Waze href:", footer_waze_href)
        assert "waze.com/ul" in footer_waze_href, "Footer Waze button missing waze.com/ul link"

        # Verify Step Waze buttons
        step_waze_btns = driver.find_elements(By.CSS_SELECTOR, ".route-step-row .btn-step-waze")
        print(f"Found {len(step_waze_btns)} step-by-step Waze navigation buttons in turn-by-turn directions.")
        assert len(step_waze_btns) > 0, "No step-by-step Waze navigation buttons found"
        for i, s_btn in enumerate(step_waze_btns[:3]):
            step_href = s_btn.get_attribute("href")
            print(f"  Step {i+1} Waze href: {step_href}")
            assert "waze.com/ul" in step_href, f"Step {i+1} Waze link invalid"

        shot2 = os.path.join(DOCS_DIR, "waze_route_modal_desktop.png")
        driver.save_screenshot(shot2)
        driver.save_screenshot(os.path.join(ARTIFACT_DIR, "waze_route_modal_desktop.png"))
        print("Captured desktop route modal screenshot.")

        # Scroll modal down to show turn-by-turn steps with Waze buttons
        driver.execute_script("document.getElementById('routeModalStepsList').scrollIntoView();")
        time.sleep(0.5)
        shot3 = os.path.join(DOCS_DIR, "waze_route_steps_desktop.png")
        driver.save_screenshot(shot3)
        driver.save_screenshot(os.path.join(ARTIFACT_DIR, "waze_route_steps_desktop.png"))
        print("Captured desktop route steps screenshot.")

        # 3. Mobile Viewport Verification
        driver.quit()
        print("Testing mobile viewport (390 x 844)...")
        driver = get_driver(390, 844)
        wait_m = WebDriverWait(driver, 15)
        driver.get(f"{BASE_URL}/?token={TOKEN}&view=routes")
        time.sleep(2.5)
        driver.execute_script("switchView('routes');")
        wait_m.until(EC.presence_of_element_located((By.CLASS_NAME, "center-card")))
        time.sleep(1)
        driver.execute_script("openRouteModal('highbrook-restricted-2');")
        time.sleep(1.5)

        shot4 = os.path.join(DOCS_DIR, "waze_route_modal_mobile.png")
        driver.save_screenshot(shot4)
        driver.save_screenshot(os.path.join(ARTIFACT_DIR, "waze_route_modal_mobile.png"))
        print("Captured mobile route modal screenshot.")

        # Scroll to steps on mobile
        driver.execute_script("document.getElementById('routeModalStepsList').scrollIntoView();")
        time.sleep(0.5)
        shot5 = os.path.join(DOCS_DIR, "waze_route_steps_mobile.png")
        driver.save_screenshot(shot5)
        driver.save_screenshot(os.path.join(ARTIFACT_DIR, "waze_route_steps_mobile.png"))
        print("Captured mobile route steps screenshot.")

        print("ALL WAZE EXPORT VERIFICATIONS PASSED SUCCESSFULLY.")

    finally:
        driver.quit()

if __name__ == "__main__":
    main()
