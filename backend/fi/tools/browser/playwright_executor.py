from playwright.async_api import TimeoutError
import asyncio

from playwright_stealth import stealth_async

from src.core import registry
from src.browser.instance import BrowserInstance

import asyncio
import json
import traceback
from typing import Any, Dict, Optional, Union
from playwright.async_api import Page, Browser, BrowserContext
from playwright_stealth import stealth_async
from pydantic import BaseModel, Field

#function_tool
async def execute_playwright_code(
    code: str,
    description: str,
    timeout: float = 30000,
    max_retries: int = 3,
    retry_delay: float = 2.0,
    action_type: str = "custom",
    selector: Optional[str] = None,
    text: Optional[str] = None
) -> str:
    """Execute Playwright automation code on the current webpage with retry logic."""
    _instance: BrowserInstance = registry.get('browser_instance')
    page = _instance.page
    context = _instance.context
    browser = _instance.browser
    
    retries = 0
    
    while retries <= max_retries:
        try:
            # Handle predefined actions first
            if action_type != "custom":
                result = await _execute_predefined_action(
                    page, action_type, selector, text, timeout, description
                )
                return result
            
            # Set up execution environment for custom code
            execution_globals = {
                'page': page,
                'context': context,
                'browser': browser,
                'asyncio': asyncio,
                'json': json,
                'stealth_async': stealth_async,
            }
            
            # Prepare code execution with timeout
            exec_code = f"""import asyncio
                import json
                from playwright.async_api import expect
                from playwright_stealth import stealth_async
                
                async def _execute_user_code():
                    {code}
                    
                result = await asyncio.wait_for(_execute_user_code(), timeout={timeout/1000})"""
            
            # Execute code with timeout
            exec(exec_code, execution_globals)
            result = execution_globals.get('result')
            
            current_url = await page.url
            page_title = await page.title()
            
            return f"Successfully executed: {description}. Result: {result}. Current URL: {current_url}, Title: {page_title}"
            
        except TimeoutError as e:
            retries += 1
            if retries > max_retries:
                return f"Code execution '{description}' timed out after {timeout}ms. All {max_retries} retries exhausted."
            else:
                print(f"Execution timeout (attempt {retries}/{max_retries}). Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                
        except Exception as e:
            retries += 1
            if retries > max_retries:
                error_traceback = traceback.format_exc()
                return f"Failed to execute '{description}' after {max_retries} attempts: {e}. Traceback: {error_traceback}"
            else:
                print(f"Execution failed (attempt {retries}/{max_retries}): {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)

async def _execute_predefined_action(
    page: Page,
    action_type: str,
    selector: Optional[str],
    text: Optional[str],
    timeout: float,
    description: str
) -> str:
    """Execute predefined Playwright actions with proper error handling."""
    try:
        if action_type == "click":
            await page.click(selector, timeout=timeout)
            return f"Successfully clicked element: {selector}. Action: {description}"
            
        elif action_type == "type":
            await page.fill(selector, text)
            return f"Successfully typed '{text}' into {selector}. Action: {description}"
            
        elif action_type == "extract_text":
            element = await page.query_selector(selector)
            result = await element.text_content() if element else None
            return f"Successfully extracted text from {selector}: {result}. Action: {description}"
            
        elif action_type == "extract_links":
            links = await page.query_selector_all(selector or "a")
            result = []
            for link in links:
                href = await link.get_attribute("href")
                link_text = await link.text_content()
                result.append({"href": href, "text": link_text.strip() if link_text else ""})
            return f"Successfully extracted {len(result)} links. Action: {description}. Data: {json.dumps(result[:5])}"
                
        elif action_type == "scroll":
            await page.evaluate(f"document.querySelector('{selector}').scrollIntoView()")
            return f"Successfully scrolled to element: {selector}. Action: {description}"
            
        elif action_type == "wait":
            await page.wait_for_selector(selector, timeout=timeout)
            return f"Successfully waited for element: {selector}. Action: {description}"
            
        elif action_type == "screenshot":
            screenshot_path = f"/tmp/screenshot_{asyncio.get_event_loop().time():.0f}.png"
            await page.screenshot(path=screenshot_path)
            return f"Successfully saved screenshot to: {screenshot_path}. Action: {description}"
        
        else:
            return f"Unknown action type: {action_type}. Action: {description}"
            
    except Exception as e:
        raise Exception(f"Predefined action '{action_type}' failed: {e}")

#function_tool
async def browser_extract_data(
    selectors: Dict[str, str],
    timeout: float = 30000,
    max_retries: int = 3,
    retry_delay: float = 2.0
) -> str:
    """Extract data from multiple elements using CSS selectors with retry logic."""
    _instance: BrowserInstance = registry.get('browser_instance')
    page = _instance.page
    
    retries = 0
    
    while retries <= max_retries:
        try:
            extracted_data = {}
            
            for key, selector in selectors.items():
                elements = await page.query_selector_all(selector)
                extracted_data[key] = []
                
                for element in elements:
                    text_content = await element.text_content()
                    href = await element.get_attribute("href")
                    extracted_data[key].append({
                        "text": text_content.strip() if text_content else "",
                        "href": href
                    })
            
            return f"Successfully extracted data: {json.dumps(extracted_data, indent=2)}"
            
        except TimeoutError as e:
            retries += 1
            if retries > max_retries:
                return f"Data extraction timed out after {timeout}ms. All {max_retries} retries exhausted."
            else:
                print(f"Extraction timeout (attempt {retries}/{max_retries}). Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                
        except Exception as e:
            retries += 1
            if retries > max_retries:
                return f"Failed to extract data after {max_retries} attempts: {e}"
            else:
                print(f"Extraction failed (attempt {retries}/{max_retries}): {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
