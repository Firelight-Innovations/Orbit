from playwright.async_api import TimeoutError
import asyncio

from playwright_stealth import stealth_async

from src.core import registry
from src.browser.instance import BrowserInstance

#function_tool
async def browser_navigate(
    url: str, 
    timeout: float = 30000, 
    max_retries: int = 3, 
    retry_delay: float = 2.0
) -> str:
    """Navigate to a URL using Playwright."""
    _instance: BrowserInstance = registry.get('browser_instance')
    page = _instance.page
    
    retries = 0
    
    while retries <= max_retries:
        try:
            # Navigate with basic load wait
            response = await page.goto(url, timeout=timeout, wait_until='load')
            await stealth_async(page)
            
            # Wait for DOM to be ready instead of networkidle
            await page.wait_for_load_state('domcontentloaded', timeout=5000)
            
            # Verify page is interactive
            await page.wait_for_function('document.readyState === "complete"', timeout=5000)
            
            return f'Successfully navigated to {url}.'
            
        except TimeoutError as e:
            retries += 1
            if retries > max_retries:
                return f"Navigation to {url} timed out after {timeout}ms. All {max_retries} retries exhausted."
            else:
                print(f"Navigation timeout (attempt {retries}/{max_retries}). Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                
        except Exception as e:
            retries += 1
            if retries > max_retries:
                return f"Failed to navigate to {url} after {max_retries} attempts: {e}"
            else:
                print(f"Navigation failed (attempt {retries}/{max_retries}): {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)

#function_tool
async def browser_navigate_back(
    timeout: float = 30000, 
    max_retries: int = 3,
    retry_delay: float = 2.0
) -> str:
    """
    Go back to the previous page using Playwright.
    
    Args:
        return_snapshot (bool): Returns a snapshot of the page for additional context
        timeout (float): Maximum wait time in milliseconds (default: 30000)
        max_retries (int): Maximum number of retry attempts (default: 3)
        retry_delay (float): Delay between retries in seconds (default: 2.0)
    
    Returns:
        str: Success message with optional page snapshot
    """
    _instance: BrowserInstance = registry.get('browser_instance')
    page = _instance.page
    
    retries = 0
    
    while retries <= max_retries:
        try:
            # Go back to the previous page
            await page.go_back(timeout=timeout, wait_until='load')
            
            # Wait for the page to fully load
            await page.wait_for_load_state('networkidle', timeout=timeout)
            
            # If we reach here, navigation was successful
            return f'Successfully navigated back to previous page.'
            
        except TimeoutError as e:
            retries += 1
            if retries > max_retries:
                return f"Navigate back timed out after {timeout}ms. All {max_retries} retries exhausted."
            else:
                print(f"Navigate back timeout (attempt {retries}/{max_retries}). Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                
        except Exception as e:
            retries += 1
            if retries > max_retries:
                return f"Failed to navigate back after {max_retries} attempts: {e}"
            else:
                print(f"Navigate back failed (attempt {retries}/{max_retries}): {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)

#function_tool
async def browser_navigate_forward(
    timeout: float = 30000, 
    max_retries: int = 3, 
    retry_delay: float = 2.0
    ) -> str:
    """
    Go forward to the next page using Playwright.
    
    Args:
        return_snapshot (bool): Returns a snapshot of the page for additional context
        timeout (float): Maximum wait time in milliseconds (default: 30000)
        max_retries (int): Maximum number of retry attempts (default: 3)
        retry_delay (float): Delay between retries in seconds (default: 2.0)
    
    Returns:
        str: Success message with optional page snapshot
    """
    _instance: BrowserInstance = registry.get('browser_instance')
    page = _instance.page
    
    retries = 0
    
    while retries <= max_retries:
        try:
            # Go forward to the next page
            await page.go_forward(timeout=timeout, wait_until='load')
            
            # Wait for the page to fully load
            await page.wait_for_load_state('networkidle', timeout=timeout)
            
            # If we reach here, navigation was successful
            return f'Successfully navigated forward to next page.'
            
        except TimeoutError as e:
            retries += 1
            if retries > max_retries:
                return f"Navigate forward timed out after {timeout}ms. All {max_retries} retries exhausted."
            else:
                print(f"Navigate forward timeout (attempt {retries}/{max_retries}). Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                
        except Exception as e:
            retries += 1
            if retries > max_retries:
                return f"Failed to navigate forward after {max_retries} attempts: {e}"
            else:
                print(f"Navigate forward failed (attempt {retries}/{max_retries}): {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
