import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

ARTIFACT_DIR = "/root/.gemini/antigravity-cli/brain/d65bb738-4a77-47a0-8d8f-6ea110515598"
BASE_URL = "http://127.0.0.1:8011"
TOKEN = "4tKMdzka1QyjMZVy7ECh4vKyEoWGmOZX912dQULr2xY"

def get_driver(width=390, height=844):
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
    print("Testing live in-app navigation engine on Class 1R - Route 2...")
    driver = get_driver(390, 844) # Mobile viewport
    try:
        driver.get(f"{BASE_URL}/?token={TOKEN}&view=routes")
        time.sleep(3)

        # Launch navigation for Westgate Class 1R - Route 2 directly
        print("Launching live navigation on Westgate Class 1R - Route 2...")
        driver.execute_script("launchDriverNav('westgate-restricted-2', false);")
        time.sleep(2)

        # Capture Live Navigation Initial Viewport
        shot1 = os.path.join(ARTIFACT_DIR, "live_nav_initial_hud.png")
        driver.save_screenshot(shot1)
        print("Saved:", shot1)

        # Simulate driving along the route (passing GPS updates)
        print("Simulating real car GPS driving along Westgate Route 2...")
        # Step 1 -> Step 2 transition
        driver.execute_script("""
            // Car moves along route to Maki St
            processVehiclePosition(-36.814337, 174.611286, 48, 320);
        """)
        time.sleep(1.5)

        # Capture HUD after step progression
        shot2 = os.path.join(ARTIFACT_DIR, "live_nav_driving_step_advanced.png")
        driver.save_screenshot(shot2)
        print("Saved:", shot2)

        # Test Heading-Up Mode
        print("Testing Heading-Up compass toggle...")
        driver.execute_script("toggleDriverCompass();")
        time.sleep(1)
        shot3 = os.path.join(ARTIFACT_DIR, "live_nav_heading_up_view.png")
        driver.save_screenshot(shot3)
        print("Saved:", shot3)

        # Test Demo Simulation
        print("Testing Demo Simulation playback...")
        driver.execute_script("startDriverDemoSimulation();")
        time.sleep(3.5)
        shot4 = os.path.join(ARTIFACT_DIR, "live_nav_demo_simulating.png")
        driver.save_screenshot(shot4)
        print("Saved:", shot4)

        driver.execute_script("exitDriverNavigation();")
        time.sleep(1)

    finally:
        driver.quit()

    print("Live navigation verification completed successfully!")

if __name__ == "__main__":
    main()
