import asyncio
import random
import re
from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from fi_interaction.tools._internal import snapshot
from src.core import registry
from src.browser.instance import BrowserInstance
from fi_interaction.tools._internal import move_mouse

#function_tool
async def browser_type(
    ref_id: str = None,
    text: str = "",
    submit: bool = False,
    slowly: bool = False,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """Type text into an element using its ref attribute from the snapshot.

    Uses the Weave `ref` attribute to locate elements reliably and maintains
    natural typing behavior and stealth capabilities for human-like interaction.

    Args:
        ref_id: The `ref` attribute value assigned in the snapshot (e.g., "e123").
        text: Text to type into the element.
        submit: Whether to press Enter after typing.
        slowly: Whether to type one character at a time.
        timeout: Maximum time to wait for the element (ms).
        wait_for_network: Whether to wait for network idle after submitting.
        apply_stealth: Whether to apply human-like delays.

    Returns:
        Success/error message string

    Examples:
        # Type in a search box
        await browser_type(ref_id="e42", text="linkedin jobs")
        
        # Type in a field and submit
        await browser_type(ref_id="e17", text="Follow up", submit=True)
        
        # Type slowly to trigger validation
        await browser_type(ref_id="e88", text="user@example.com", slowly=True)
    """
    
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        cursor = _instance.cursor
        
        if not ref_id:
            return "Error: Must specify ref_id to locate element"
        
        # Locate element by ref attribute
        locator = page.locator(f'[ref="{ref_id}"]').first
        count = await locator.count()
        if count == 0:
            return f"Error: Could not locate element with ref='{ref_id}'"
        
        # Verify element is actionable
        try:
            await locator.wait_for(state="visible", timeout=5000)
            
            # Check if element is disabled
            is_disabled = await locator.get_attribute('disabled')
            if is_disabled:
                await asyncio.sleep(2)
                is_disabled = await locator.get_attribute('disabled')
                if is_disabled:
                    return f"Error: Element is disabled - possible bot detection"
        except Exception as e:
            return f"Error: Element not actionable - {str(e)}"
        
        # Focus the element by clicking on it with stealth behavior
        try:
            if cursor and cursor.is_initialized and apply_stealth:
                await cursor.trigger_click_feedback()
                await locator.click(timeout=timeout, force=False)
                await cursor.set_cursor_state('normal')
            else:
                await locator.click(timeout=timeout, force=False)
        except Exception as e:
            # Fallback to force click
            await locator.click(timeout=timeout, force=True)
        
        # Clear existing content
        await locator.clear()
        
        # Type the text based on slowly parameter
        if slowly:
            # Type one character at a time with human-like delays
            for char in text:
                await locator.type(char)
                if apply_stealth:
                    # Random delay between characters (30-150ms)
                    await asyncio.sleep(0.03 + (0.12 * random.random()))
        else:
            # Fill in the entire text at once
            await locator.fill(text)
        
        # Submit if requested (press Enter)
        if submit:
            await locator.press('Enter')
        
        # Enhanced wait handling for form submissions
        if wait_for_network and submit:
            try:
                # Wait for network idle with shorter timeout for Google services
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeoutError:
                pass  # Continue if network doesn't idle
        
        # Additional wait for processing
        await asyncio.sleep(0.3 + (0.2 * random.random()))
        
        # Return result
        action_description = f'typed "{text}"'
        if submit:
            action_description += ' and submitted'
        
        element_desc = f"ref='{ref_id}'"
        return f'Successfully {action_description} into element with {element_desc}'
            
    except PlaywrightTimeoutError:
        return f"Error: Element was not found or not typeable within {timeout}ms"
    except Exception as e:
        return f"Error typing into element: {str(e)}"


#function_tool
async def browser_key_press(
    key: str,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """
    Press a key on the keyboard with enhanced stealth capabilities.
    
    Args:
        key: Name of the key to press or a character to generate (e.g., "ArrowLeft", "Enter", "a", "A")
        timeout: Maximum time to wait for operation (default: 30 seconds)
        wait_for_network: Whether to wait for network idle after key press
        return_snapshot: Whether to return a page snapshot after key press
        apply_stealth: Whether to apply stealth measures (default: True)
    
    Returns:
        str: Success message with key press confirmation and optional page snapshot
    """
    
    try:
        # Get current page from your context 
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        
        # Enhanced stealth measures for Google services
        if apply_stealth:
            # Random delay between 50ms and 300ms (shorter than click since key presses are faster)
            await asyncio.sleep(0.05 + (0.25 * random.random()))
            
            # Simulate human-like typing rhythm variations
            # Humans don't press keys at perfectly consistent intervals
            if len(key) == 1:  # Single character
                # Shorter delay for regular characters
                await asyncio.sleep(0.02 + (0.08 * random.random()))
            else:  # Special keys like Arrow keys, Enter, etc.
                # Slightly longer delay for special keys
                await asyncio.sleep(0.05 + (0.15 * random.random()))
        
        # Validate key parameter
        if not key or not isinstance(key, str):
            return f"Error: Invalid key parameter. Must be a non-empty string."
        
        # Perform the key press
        try:
            await page.keyboard.press(key, delay=random.randint(50, 150) if apply_stealth else 0)
        except Exception as e:
            return f"Error: Failed to press key '{key}'. {str(e)}"
        
        # Enhanced wait handling for Google services
        if wait_for_network:
            try:
                # Wait for network idle with shorter timeout for Google services
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeoutError:
                pass  # Continue if network doesn't idle
        
        # Additional wait for Google services to process the key press
        if apply_stealth:
            await asyncio.sleep(0.1 + (0.2 * random.random()))
        
        # Return result with optional snapshot
        return f'Successfully pressed key "{key}".'
            
    except PlaywrightTimeoutError:
        return f"Error: Key press operation for '{key}' timed out after {timeout}ms"
    except Exception as e:
        return f"Error pressing key '{key}': \n{str(e)}"
