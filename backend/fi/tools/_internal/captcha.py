from selenium.webdriver.common.by import By
import undetected_chromedriver as uc
#from selenium_recaptcha_solver import RecaptchaSolver
#from selenium_recaptcha_solver import RecaptchaSolver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.events import AbstractEventListener

def is_captcha_present(driver: uc.Chrome) -> bool:
    # reCAPTCHA V2 checkbox or invisible badge
    if driver.find_elements(By.CSS_SELECTOR, "iframe[src*='recaptcha']"):
        return True
    
    # hCaptcha widget
    if driver.find_elements(By.CSS_SELECTOR, "iframe[src*='hcaptcha']"):
        return True
    
    # Slider captchas often present a div with 'captcha' in its class
    if driver.find_elements(By.CSS_SELECTOR, "div[class*='captcha']"):
        return True
    
    return False

def solve_captcha(driver: uc.Chrome, timeout: float=30) -> bool:
    """
    Detects and solves a ReCAPTCHA v2 on the current page using the audio challenge flow.

    Args:
        driver: Selenium WebDriver instance (e.g., undetected-chromedriver Chrome).
        timeout: Maximum time (in seconds) to wait for each step.

    Returns:
        True if a captcha was found and solved, False otherwise.
    """
    solver = RecaptchaSolver(driver)

    try:
        # Wait for the reCAPTCHA iframe and switch into it
        WebDriverWait(driver, timeout).until(
            EC.frame_to_be_available_and_switch_to_it(
                (By.XPATH, "//iframe[contains(@title,'reCAPTCHA')]")
            )
        )

        # Click the checkbox and solve via audio challenge
        solver.click_recaptcha_v2()

        # Return to the main document
        driver.switch_to.default_content()

        # Wait until the reCAPTCHA iframe is gone (solved)
        WebDriverWait(driver, timeout).until_not(
            EC.presence_of_element_located(
                (By.XPATH, "//iframe[contains(@title,'reCAPTCHA')]")
            )
        )
        return True

    except Exception:
        # No reCAPTCHA found or solve failed
        driver.switch_to.default_content()
        return False

class CaptchaListener(AbstractEventListener):
    def __init__(self, timeout=30):
        self.timeout = timeout

    def _handle(self, driver):
        # If a CAPTCHA appears, attempt to solve it
        if is_captcha_present(driver):
            print("CAPTCHA detected – attempting to solve…")
            success = solve_captcha(driver, timeout=self.timeout)
            if not success:
                raise RuntimeError("CAPTCHA solve failed or timed out")

    def after_navigate_to(self, url, driver):
        self._handle(driver)

    def after_click(self, element, driver):
        self._handle(driver)