import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ARTIFACT_DIR = "/root/.gemini/antigravity-cli/brain/d65bb738-4a77-47a0-8d8f-6ea110515598"
BASE_URL = "http://192.168.1.100:8011"

def get_driver(width=1380, height=920):
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.binary_location = "/usr/bin/chromium"
    options.add_argument(f"--window-size={width},{height}")
    service = Service("/usr/bin/chromedriver")
    return webdriver.Chrome(service=service, options=options)

def main():
    print("Starting visual verification of Auckland Test Routes...")
    driver = get_driver(1380, 950)
    try:
        driver.get(BASE_URL)
        time.sleep(1)

        # Authenticate via localStorage
        driver.execute_script("localStorage.setItem('nz_roadcode_token', 'sarah-demo-token-12345');")
        driver.get(BASE_URL)
        time.sleep(2)

        # 1. Switch to Routes tab
        print("Clicking Test Routes nav button...")
        routes_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "nav-routes"))
        )
        routes_btn.click()
        time.sleep(2)

        # Capture Desktop Overview
        shot1 = os.path.join(ARTIFACT_DIR, "routes_desktop_overview.png")
        driver.save_screenshot(shot1)
        print("Saved:", shot1)

        # 2. Filter by West Auckland
        print("Clicking West Auckland area pill...")
        west_pill = driver.find_element(By.CSS_SELECTOR, ".area-pill-btn[data-area='West Auckland']")
        west_pill.click()
        time.sleep(1)

        shot2 = os.path.join(ARTIFACT_DIR, "routes_westgate_filtered.png")
        driver.save_screenshot(shot2)
        print("Saved:", shot2)

        # 3. Open Turn-by-Turn Steps Modal for Westgate Restricted Circuit 1
        print("Opening turn-by-turn modal...")
        detail_btn = driver.find_element(By.CSS_SELECTOR, "#card-westgate-restricted-1 .btn-route-details")
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", detail_btn)
        time.sleep(0.5)
        detail_btn.click()
        time.sleep(1.5)

        shot3 = os.path.join(ARTIFACT_DIR, "routes_turn_by_turn_modal.png")
        driver.save_screenshot(shot3)
        print("Saved:", shot3)

        # Close modal
        close_btn = driver.find_element(By.CSS_SELECTOR, "#routeModal .dialog-close-btn")
        close_btn.click()
        time.sleep(0.5)

    finally:
        driver.quit()

    # 4. Mobile responsive check
    print("Starting mobile viewport check...")
    mob_driver = get_driver(390, 844)
    try:
        mob_driver.get(BASE_URL)
        time.sleep(1)
        mob_driver.execute_script("localStorage.setItem('nz_roadcode_token', 'sarah-demo-token-12345');")
        mob_driver.get(BASE_URL)
        time.sleep(2)

        mob_btn = WebDriverWait(mob_driver, 10).until(
            EC.element_to_be_clickable((By.ID, "mob-nav-routes"))
        )
        mob_btn.click()
        time.sleep(2)

        shot4 = os.path.join(ARTIFACT_DIR, "routes_mobile_view.png")
        mob_driver.save_screenshot(shot4)
        print("Saved:", shot4)

    finally:
        mob_driver.quit()

    print("All screenshots captured successfully!")

if __name__ == "__main__":
    main()
