import asyncio
import random
import re
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from datetime import date

from src.core import registry
from src.browser.instance import BrowserInstance
from fi_interaction.tools._internal import move_mouse


#function_tool
async def browser_click(
    ref_id: str = None,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """Click an element using its ref attribute from the snapshot.
    
    Args:
        ref_id: The `ref` attribute value assigned in the snapshot (e.g., "e123").
        timeout: Maximum wait time in milliseconds
        wait_for_network: Wait for network idle after click
        apply_stealth: Use natural cursor movement and timing
    
    Returns:
        Success/error message string
    
    Examples:
        # Click compose button
        await browser_click(ref_id="e12")
    """
    
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        cursor = _instance.cursor
        
        if not ref_id:
            return "Error: Must specify ref_id to locate element"
        
        # Locate element by ref attribute
        locator = page.locator(f'[ref="{ref_id}"]').first
        if await locator.count() == 0:
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
                    return f"Error: Element is disabled"
        except Exception as e:
            return f"Error: Element not actionable - {str(e)}"
        
        # Perform click with stealth behavior
        if cursor and cursor.is_initialized and apply_stealth:
            # Natural movement timing
            await asyncio.sleep(0.1 + (0.1 * random.random()))
            await cursor.trigger_click_feedback()
            await locator.click(timeout=timeout, force=False)
            await cursor.set_cursor_state('normal')
        else:
            # Simple click without cursor
            await asyncio.sleep(0.05 + (0.1 * random.random()))
            await locator.click(timeout=timeout, force=False)
        
        # Wait for network if requested
        if wait_for_network:
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeoutError:
                pass
        
        # Post-click processing wait
        await asyncio.sleep(0.5 + (0.3 * random.random()))
        
        element_desc = f"ref='{ref_id}'"
        return f'Successfully clicked element with {element_desc}'
    
    except Exception as e:
        return f"Error clicking element: {str(e)}"


#function_tool
async def browser_hover(
    ref_id: str = None,
    timeout: int = 30000,
    maintain_position: bool = True,
    apply_stealth: bool = True
) -> str:
    """Hover over an element using its ref attribute from the snapshot.
    
    Args:
        ref_id: The `ref` attribute value assigned in the snapshot (e.g., "e123").
        timeout: Maximum wait time in milliseconds
        maintain_position: Whether to maintain hover position after action
        apply_stealth: Use natural cursor movement and timing
    
    Returns:
        Success/error message string
    """
    
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        cursor = _instance.cursor
        
        if not ref_id:
            return "Error: Must specify ref_id to locate element"
        
        # Locate element by ref attribute
        locator = page.locator(f'[ref="{ref_id}"]').first
        if await locator.count() == 0:
            return f"Error: Could not locate element with ref='{ref_id}'"
        
        # Verify element is visible for hovering
        try:
            await locator.wait_for(state="visible", timeout=5000)
        except Exception as e:
            return f"Error: Element not visible for hover - {str(e)}"
        
        # Perform hover with stealth behavior
        if cursor and cursor.is_initialized and apply_stealth:
            # Natural hover with cursor movement
            await locator.hover()
            await asyncio.sleep(0.3 + (0.2 * random.random()))
        else:
            # Simple hover without cursor
            await locator.hover()
            await asyncio.sleep(0.3)
        
        # Maintain position if requested
        if maintain_position:
            # Keep hovering for a natural duration
            additional_wait = 0.5 + (0.3 * random.random()) if apply_stealth else 0.5
            await asyncio.sleep(additional_wait)
        
        hover_message = "with suppressed natural movement" if cursor and cursor.is_initialized else "with standard mouse"
        element_desc = f"ref='{ref_id}'"
        
        return f'Successfully hovering over element with {element_desc} {hover_message}'
        
    except PlaywrightTimeoutError:
        return f"Error: Element was not found or not hoverable within {timeout}ms"
    except Exception as e:
        return f"Error hovering over element: {str(e)}"


#sfunction_tool
async def browser_dropdown_select_option(
    ref_id: str = None,
    values: list[str] = None,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """Select option(s) from dropdown using the element's ref attribute.
    
    Handles both native HTML select elements and custom JavaScript dropdowns.
    
    Args:
        ref_id: The `ref` attribute value assigned in the snapshot (e.g., "e123").
        values: Array of values to select (single value or multiple for multi-select)
        timeout: Maximum time to wait for operations
        wait_for_network: Whether to wait for network idle after selection
        apply_stealth: Whether to apply stealth movements and timing
    
    Returns:
        Success/error message string
    """
    
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        cursor = _instance.cursor
        
        if not ref_id:
            return "Error: Must specify ref_id to locate element"
        
        if not values:
            return "Error: Must specify values to select"
        
        # Locate element by ref attribute
        locator = page.locator(f'[ref="{ref_id}"]').first
        if await locator.count() == 0:
            return f"Error: Could not locate dropdown with ref='{ref_id}'"
        
        # Verify element is actionable
        try:
            await locator.wait_for(state="visible", timeout=5000)
            
            # Check if element is disabled
            is_disabled = await locator.get_attribute('disabled')
            if is_disabled:
                await asyncio.sleep(1)
                is_disabled = await locator.get_attribute('disabled')
                if is_disabled:
                    return f"Error: Dropdown element is disabled"
        except Exception as e:
            return f"Error: Element not actionable - {str(e)}"
        
        # Determine dropdown type and handle accordingly
        tag_name = await locator.evaluate('el => el.tagName.toLowerCase()')
        
        if tag_name == 'select':
            # Handle native HTML select element
            result = await _handle_native_select(locator, values, cursor, apply_stealth)
        else:
            # Handle custom dropdown (div, button, etc.)
            result = await _handle_custom_dropdown(locator, values, cursor, page, apply_stealth, timeout)
        
        if "Error:" in result:
            return result
        
        # Wait for network if requested
        if wait_for_network:
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeoutError:
                pass
        
        # Final wait for UI updates
        await asyncio.sleep(0.5 + (0.3 * random.random()) if apply_stealth else 0.5)
        
        # Reset cursor state
        if cursor and cursor.is_initialized:
            await cursor.set_cursor_state('normal')
        
        selected_text = ", ".join([str(v) for v in values])
        element_desc = f"ref='{ref_id}'"
        return f'Successfully selected "{selected_text}" from dropdown with {element_desc}'
    
    except Exception as e:
        return f"Error selecting option from dropdown: {str(e)}"


# Helper functions
async def _handle_native_select(locator, values, cursor, apply_stealth):
    """Handle native HTML select elements."""
    try:
        # Click to open if needed
        if cursor and cursor.is_initialized and apply_stealth:
            await locator.click()
            await asyncio.sleep(0.1 + (0.1 * random.random()))
        else:
            await locator.click()
        
        # Select each value
        for value in values:
            try:
                await locator.select_option(value)
                if apply_stealth:
                    await asyncio.sleep(0.1 + (0.05 * random.random()))
            except Exception:
                # Try selecting by text if value selection fails
                await locator.select_option(label=value)
                if apply_stealth:
                    await asyncio.sleep(0.1 + (0.05 * random.random()))
        
        return "Success"
        
    except Exception as e:
        return f"Error: Failed to select from native dropdown - {str(e)}"


#function_tool
async def browser_calendar_select_option(
    ref_id: str = None,
    year: int = None,
    month: int = None,
    day: int = None,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """Select date from calendar using the element's ref attribute.
    
    Handles native HTML date inputs, custom calendar widgets, and spinbutton date pickers.
    
    Args:
        ref_id: The `ref` attribute value assigned in the snapshot (e.g., "e123").
        year: Year to select (e.g., 2024)
        month: Month to select (1-12)
        day: Day to select (1-31)
        timeout: Maximum time to wait for operations
        wait_for_network: Whether to wait for network idle after selection
        apply_stealth: Whether to apply stealth movements and timing
    
    Returns:
        Success/error message string
    """
    
    try:
        # Validate inputs
        if not all([year, month, day]):
            return "Error: Must specify year, month, and day"
        
        # Validate date inputs
        try:
            target_date = date(year, month, day)
        except ValueError as e:
            return f"Error: Invalid date {year}-{month}-{day}: {str(e)}"
        
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        cursor = _instance.cursor
        
        # Check if this is a spinbutton-based date picker first
        month_spinbutton = page.locator("spinbutton").filter(has_text="Month").or_(
            page.locator("*[aria-label*='Month']")
        ).first
        day_spinbutton = page.locator("spinbutton").filter(has_text="Day").or_(
            page.locator("*[aria-label*='Day']")
        ).first
        year_spinbutton = page.locator("spinbutton").filter(has_text="Year").or_(
            page.locator("*[aria-label*='Year']")
        ).first
        
        if (await month_spinbutton.count() > 0 and 
            await day_spinbutton.count() > 0 and 
            await year_spinbutton.count() > 0):
            
            # Handle spinbutton date picker
            result = await _handle_custom_calendar_spinbuttons(
                None, target_date, cursor, page, apply_stealth, timeout
            )
        else:
            if not ref_id:
                return "Error: Must specify ref_id to locate calendar element"
            
            # Locate element using ref attribute
            locator = page.locator(f'[ref="{ref_id}"]').first
            if await locator.count() == 0:
                return f"Error: Could not locate calendar with ref='{ref_id}'"
            
            # Verify element is actionable
            try:
                await locator.wait_for(state="visible", timeout=5000)
                
                # Check if element is disabled
                is_disabled = await locator.get_attribute('disabled')
                if is_disabled:
                    await asyncio.sleep(1)
                    is_disabled = await locator.get_attribute('disabled')
                    if is_disabled:
                        return f"Error: Calendar element is disabled"
            except Exception as e:
                return f"Error: Element not actionable - {str(e)}"
            
            # Determine calendar type and handle accordingly
            tag_name = await locator.evaluate('el => el.tagName.toLowerCase()')
            input_type = await locator.get_attribute('type') if tag_name == 'input' else None
            
            if tag_name == 'input' and input_type == 'date':
                # Handle native HTML date input
                result = await _handle_native_date_input(locator, target_date, cursor, apply_stealth)
            else:
                # Handle custom calendar widget
                result = await _handle_custom_calendar(locator, target_date, cursor, page, apply_stealth, timeout)
        
        if "Error:" in result:
            return result
        
        # Wait for network if requested
        if wait_for_network:
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except PlaywrightTimeoutError:
                pass
        
        # Final wait for UI updates
        await asyncio.sleep(0.5 + (0.3 * random.random()) if apply_stealth else 0.5)
        
        # Reset cursor state
        if cursor and cursor.is_initialized:
            await cursor.set_cursor_state('normal')
        
        formatted_date = target_date.strftime("%Y-%m-%d")
        element_desc = f"ref='{ref_id}'" if ref_id else "ref='spinbutton-group'"
        return f'Successfully selected date "{formatted_date}" from calendar with {element_desc}'
    
    except Exception as e:
        return f"Error selecting date from calendar: {str(e)}"


# Helper functions (keep existing implementations but remove ref dependencies)
async def _handle_native_date_input(locator, target_date, cursor, apply_stealth):
    """Handle native HTML date input elements."""
    try:
        # Click to focus if needed
        if cursor and cursor.is_initialized and apply_stealth:
            await locator.click()
            await asyncio.sleep(0.1 + (0.1 * random.random()))
        else:
            await locator.click()
        
        # Set the date value directly
        date_string = target_date.strftime("%Y-%m-%d")
        await locator.fill(date_string)
        
        if apply_stealth:
            await asyncio.sleep(0.2 + (0.1 * random.random()))
        
        return "Success"
        
    except Exception as e:
        return f"Error: Failed to set native date input - {str(e)}"


async def _handle_custom_calendar(locator, target_date, cursor, page, apply_stealth, timeout):
    """Handle custom calendar widget implementations."""
    try:
        # Click to open calendar
        if cursor and cursor.is_initialized and apply_stealth:
            await locator.click()
            await asyncio.sleep(0.3 + (0.2 * random.random()))
        else:
            await locator.click()
            await asyncio.sleep(0.3)
        
        # Wait for calendar to appear
        await asyncio.sleep(0.5)
        
        # Try to navigate to correct month/year first
        result = await _navigate_calendar_to_target_month(page, target_date, apply_stealth)
        if "Error:" in result:
            return result
        
        # Find and click the target day
        day_selectors = [
            f'[role="button"]:has-text("{target_date.day}")',
            f'[aria-label*="{target_date.day}"]',
            f'.calendar-day:has-text("{target_date.day}")',
            f'button:has-text("{target_date.day}")',
            f'td:has-text("{target_date.day}") button',
            f'*:has-text("{target_date.day}")'
        ]
        
        day_clicked = False
        for selector in day_selectors:
            try:
                day_button = page.locator(selector).first
                if await day_button.count() > 0 and await day_button.is_visible():
                    await day_button.click()
                    day_clicked = True
                    if apply_stealth:
                        await asyncio.sleep(0.1 + (0.05 * random.random()))
                    break
            except Exception:
                continue
        
        if not day_clicked:
            return f"Error: Could not find day {target_date.day} in calendar"
        
        return "Success"
        
    except Exception as e:
        return f"Error: Failed to select from custom calendar - {str(e)}"


async def _handle_custom_calendar_spinbuttons(locator, target_date, cursor, page, apply_stealth, timeout):
    """Handle spinbutton-based date pickers."""
    try:
        # Set month
        month_spinbutton = page.locator("spinbutton").filter(has_text="Month").or_(
            page.locator("*[aria-label*='Month']")
        ).first
        
        if await month_spinbutton.count() > 0:
            await month_spinbutton.fill(str(target_date.month))
            if apply_stealth:
                await asyncio.sleep(0.1 + (0.05 * random.random()))
        
        # Set day
        day_spinbutton = page.locator("spinbutton").filter(has_text="Day").or_(
            page.locator("*[aria-label*='Day']")
        ).first
        
        if await day_spinbutton.count() > 0:
            await day_spinbutton.fill(str(target_date.day))
            if apply_stealth:
                await asyncio.sleep(0.1 + (0.05 * random.random()))
        
        # Set year
        year_spinbutton = page.locator("spinbutton").filter(has_text="Year").or_(
            page.locator("*[aria-label*='Year']")
        ).first
        
        if await year_spinbutton.count() > 0:
            await year_spinbutton.fill(str(target_date.year))
            if apply_stealth:
                await asyncio.sleep(0.1 + (0.05 * random.random()))
        
        return "Success"
        
    except Exception as e:
        return f"Error: Failed to set spinbutton date picker - {str(e)}"


async def _navigate_calendar_to_target_month(page, target_date, apply_stealth):
    """Navigate calendar widget to the target month/year."""
    try:
        # This is a simplified implementation - you may need to enhance
        # based on specific calendar widget patterns you encounter
        
        # Look for month/year navigation elements
        month_year_text = f"{target_date.strftime('%B')} {target_date.year}"
        
        # Try to find current month display and navigate if needed
        current_month_elements = [
            page.locator(".calendar-header"),
            page.locator("[role='heading']"),
            page.locator(".month-year")
        ]
        
        for element in current_month_elements:
            if await element.count() > 0:
                current_text = await element.text_content()
                if month_year_text.lower() in current_text.lower():
                    return "Success"  # Already on correct month
        
        # If navigation is needed, this would require more specific logic
        # based on the calendar implementation
        
        return "Success"  # Assume success for now
        
    except Exception as e:
        return f"Error: Failed to navigate calendar - {str(e)}"


async def _handle_native_select(locator, values, cursor, apply_stealth):
    """Handle native HTML select elements."""
    try:
        # For native select, we can use Playwright's built-in select_option
        if len(values) == 1:
            # Single selection
            value = str(values[0])
            
            # Try different selection strategies
            try:
                # Try by value first
                await locator.select_option(value=value)
            except:
                try:
                    # Try by text content
                    await locator.select_option(label=value)
                except:
                    # Try by index if it's a number
                    if value.isdigit():
                        await locator.select_option(index=int(value))
                    else:
                        return f"Error: Could not find option '{value}' in select dropdown"
        else:
            # Multiple selection
            string_values = [str(v) for v in values]
            try:
                await locator.select_option(value=string_values)
            except:
                try:
                    await locator.select_option(label=string_values)
                except:
                    return f"Error: Could not select multiple options {string_values} in select dropdown"
        
        # Add natural delay
        if apply_stealth:
            await asyncio.sleep(0.2 + (0.2 * random.random()))
        
        return "Success"
        
    except Exception as e:
        return f"Error: Failed to select from native dropdown - {str(e)}"


async def _handle_custom_dropdown(locator, values, cursor, page, apply_stealth, timeout):
    """Handle custom dropdown implementations (divs, buttons, etc.)."""
    try:
        # First, click to open the dropdown
        if cursor and cursor.is_initialized:
            await asyncio.sleep(0.1 + (0.1 * random.random()) if apply_stealth else 0.1)
            await cursor.trigger_click_feedback()
            await locator.click(timeout=timeout, force=False)
        else:
            await asyncio.sleep(0.05 + (0.1 * random.random()) if apply_stealth else 0.05)
            await locator.click(timeout=timeout, force=False)
        
        # Wait for dropdown to open
        await asyncio.sleep(0.3 + (0.2 * random.random()) if apply_stealth else 0.3)
        
        # For each value, try to find and select the option
        for value in values:
            option_found = False
            value_str = str(value)
            
            # Try multiple selectors to find the option
            option_selectors = [
                f"[role='option']:has-text('{value_str}')",
                f"li:has-text('{value_str}')",
                f"div:has-text('{value_str}')",
                f"span:has-text('{value_str}')",
                f"a:has-text('{value_str}')",
                f"[data-value='{value_str}']",
                f"[value='{value_str}']",
                # Partial text matches
                f"[role='option'] >> text=/{value_str}/i",
                f"li >> text=/{value_str}/i",
                f"div >> text=/{value_str}/i"
            ]
            
            for selector in option_selectors:
                try:
                    option_locator = page.locator(selector).first
                    if await option_locator.count() > 0 and await option_locator.is_visible():
                        # Move to the option naturally
                        box = await option_locator.bounding_box()
                        if box:
                            if cursor and cursor.is_initialized:
                                # Move cursor to option
                                target_x = box['x'] + box['width'] / 2
                                target_y = box['y'] + box['height'] / 2
                                await cursor.move_to_position(target_x, target_y, 
                                                            suppress_duration=150 if apply_stealth else 0)
                                await asyncio.sleep(0.1 + (0.1 * random.random()) if apply_stealth else 0.1)
                                await cursor.trigger_click_feedback()
                            
                            # Click the option
                            await option_locator.click(timeout=5000)
                            option_found = True
                            
                            # Add delay between selections for multi-select
                            if len(values) > 1:
                                await asyncio.sleep(0.2 + (0.2 * random.random()) if apply_stealth else 0.2)
                            
                            break
                except:
                    continue
            
            if not option_found:
                return f"Error: Could not find option '{value_str}' in custom dropdown"
        
        # Wait for selection to process
        await asyncio.sleep(0.3 + (0.2 * random.random()) if apply_stealth else 0.3)
        
        return "Success"
        
    except Exception as e:
        return f"Error: Failed to handle custom dropdown - {str(e)}"


def add_refs_to_tree(node, counter=None):
    """Add ref attributes to accessibility tree nodes."""
    if counter is None:
        counter = {'count': 0}
    
    if isinstance(node, dict):
        counter['count'] += 1
        node['ref'] = f'e{counter["count"]}'
        
        if 'children' in node:
            for child in node['children']:
                add_refs_to_tree(child, counter)
    elif isinstance(node, list):
        for item in node:
            add_refs_to_tree(item, counter)
    
    return node


async def set_cursor_state(state: str) -> str:
    """Set the visual cursor state for better user feedback."""
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        cursor = _instance.cursor
        
        if cursor and cursor.is_initialized:
            await cursor.set_cursor_state(state)
            return f"Cursor state set to '{state}'"
        else:
            return "Cursor system not available"
    except Exception as e:
        return f"Error setting cursor state: {str(e)}"


async def get_cursor_position() -> str:
    """Get the current cursor position for debugging or coordination."""
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        cursor = _instance.cursor
        
        if cursor and cursor.is_initialized:
            pos = await cursor.get_current_position()
            return f"Current cursor position: x={pos.get('x', 0)}, y={pos.get('y', 0)}, type={pos.get('type', 'unknown')}"
        else:
            return "Cursor system not available - using standard mouse"
    except Exception as e:
        return f"Error getting cursor position: {str(e)}"


async def clear_cursor_trail() -> str:
    """Clear the cursor trail dots for a cleaner visual appearance."""
    try:
        _instance: BrowserInstance = registry.get('browser_instance')
        cursor = _instance.cursor
        
        if cursor and cursor.is_initialized:
            await cursor.clear_trail()
            return "Cursor trail cleared"
        else:
            return "Cursor system not available"
    except Exception as e:
        return f"Error clearing cursor trail: {str(e)}"
