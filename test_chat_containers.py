
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

def inspect_foundry_chat_containers():
    """
    Opens a headless Chrome browser, navigates to FoundryVTT, logs in as gamemaster,
    clicks the Simulacrum scene control button, inspects chat container elements,
    and prints their CSS properties and dimensions.
    """
    driver = None
    try:
        # Setup Chrome options for headless mode
        chrome_options = webdriver.ChromeOptions()
        # chrome_options.add_argument("--headless") # Temporarily commented out for debugging
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080") # Ensure a consistent window size

        # Initialize WebDriver
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        print("Simulacrum | WebDriver initialized successfully.")

        # 1. Open headless browser to localhost:30000
        foundry_url = "http://localhost:30000"
        driver.get(foundry_url)
        print(f"Simulacrum | Navigated to {foundry_url}")

        # Wait for the world selection screen to load
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "world-select"))
        )
        print("Simulacrum | World selection screen loaded.")

        # 2. Navigates to testania world
        # Select 'testania' from the world dropdown
        world_select = driver.find_element(By.ID, "world-select")
        world_select.send_keys("testania") # Assuming 'testania' is an option value or visible text

        # Click the "Join Game" button
        join_game_button = driver.find_element(By.ID, "join-game")
        join_game_button.click()
        print("Simulacrum | Selected 'testania' and clicked 'Join Game'.")

        # 3. Logs in as gamemaster (no password)
        # Wait for the login screen
        WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.ID, "login-form"))
        )
        print("Simulacrum | Login form loaded.")

        # Enter gamemaster username
        username_input = driver.find_element(By.ID, "username")
        username_input.send_keys("gamemaster")

        # Click "Join Session"
        join_session_button = driver.find_element(By.ID, "join-session")
        join_session_button.click()
        print("Simulacrum | Logged in as 'gamemaster'.")

        # Wait for the game to load (e.g., for the chat log to appear)
        WebDriverWait(driver, 60).until(
            EC.presence_of_element_located((By.ID, "chat-log"))
        )
        print("Simulacrum | Game loaded successfully.")

        # 4. Clicks simulacrum scene control button
        # This selector might need adjustment based on actual FoundryVTT HTML
        # Look for a button within #scene-controls that has a specific ID, class, or title/tooltip
        # Example: Assuming a button with title "Simulacrum" or a specific ID
        try:
            simulacrum_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, '#scene-controls a[data-tooltip="Simulacrum"]'))
            )
            simulacrum_button.click()
            print("Simulacrum | Clicked Simulacrum scene control button.")
        except Exception as e:
            print(f"Simulacrum | Could not find or click Simulacrum scene control button: {e}")
            print("Simulacrum | Attempting to proceed without clicking the button, assuming chat is visible.")

        # Give some time for any UI changes after clicking the button
        time.sleep(2)

        # 5. Inspects foundry-im chat-messages-container and chat-messages message-list chat-log elements
        elements_to_inspect = {
            "foundry-im chat-messages-container": '.foundry-im.chat-messages-container',
            "chat-messages message-list chat-log": '#chat-log.chat-messages.message-list' # Assuming chat-log is the ID
        }

        inspection_results = {}

        for name, selector in elements_to_inspect.items():
            try:
                element = WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, selector))
                )
                print(f"Simulacrum | Found element: {name}")

                # Get CSS properties
                css_properties = driver.execute_script(
                    "var s = window.getComputedStyle(arguments[0]);"
                    "var o = {};"
                    "for (var i = 0; i < s.length; i++) { o[s.item(i)] = s.getPropertyValue(s.item(i)); }"
                    "return o;",
                    element
                )

                # Get dimensions
                dimensions = {
                    "width": element.size['width'],
                    "height": element.size['height'],
                    "x": element.location['x'],
                    "y": element.location['y']
                }

                inspection_results[name] = {
                    "css_properties": css_properties,
                    "dimensions": dimensions
                }
            except Exception as e:
                print(f"Simulacrum | Could not inspect element '{name}' with selector '{selector}': {e}")
                inspection_results[name] = {"error": str(e)}

        # 6. Prints inspection results
        print("\n--- Inspection Results ---")
        for name, result in inspection_results.items():
            print(f"\nElement: {name}")
            if "error" in result:
                print(f"  Error: {result['error']}")
            else:
                print("  Dimensions:")
                for key, value in result['dimensions'].items():
                    print(f"    {key}: {value}")
                print("  CSS Properties (partial, showing first 10):")
                # Print a subset of CSS properties for brevity
                for i, (prop, value) in enumerate(result['css_properties'].items()):
                    if i >= 10:
                        break
                    print(f"    {prop}: {value}")
                if len(result['css_properties']) > 10:
                    print("    ...")

    except Exception as e:
        print(f"Simulacrum | An error occurred during automation: {e}")
    finally:
        if driver:
            driver.quit()
            print("Simulacrum | WebDriver closed.")

if __name__ == "__main__":
    inspect_foundry_chat_containers()
