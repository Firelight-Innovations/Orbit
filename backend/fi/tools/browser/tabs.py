import asyncio
import random
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from fi_interaction.tools._internal import snapshot
from src.core import registry
from src.browser.instance import BrowserInstance

#function_tool
async def browser_list_tabs() -> str:
    """
    List all browser tabs with their titles, URLs, and active status.
    
    Returns:
        str: Formatted list of all browser tabs with details
    """
    
    try:
        # Get current browser instance from registry
        _instance: BrowserInstance = registry.get('browser_instance')
        
        if not _instance:
            return "Error: No browser instance found in registry"
        
        # Get the browser context to access all pages/tabs
        context = _instance.context
        current_page = _instance.page
        
        if not context:
            return "Error: No browser context available"
        
        # Get all pages (tabs) from the context
        pages = context.pages
        
        if not pages:
            return "No tabs found in the current browser session"
        
        # Build tab information
        tab_list = []
        for i, page in enumerate(pages, 1):
            try:
                # Get page title and URL
                title = await page.title()
                url = page.url
                
                # Check if this is the currently active page
                is_active = page == current_page
                active_indicator = " [ACTIVE]" if is_active else ""
                
                # Format tab info
                tab_info = f"Tab {i}{active_indicator}:\n  Title: {title}\n  URL: {url}"
                tab_list.append(tab_info)
                
            except Exception as tab_error:
                # Handle individual tab errors gracefully
                tab_info = f"Tab {i}: Error retrieving tab information - {str(tab_error)}"
                tab_list.append(tab_info)
        
        # Format final response
        total_tabs = len(pages)
        header = f"Browser has {total_tabs} tab{'s' if total_tabs != 1 else ''}:\n\n"
        tabs_formatted = "\n\n".join(tab_list)
        
        return f"{header}{tabs_formatted}"
        
    except Exception as e:
        error_msg = f"Error listing browser tabs: {str(e)}"
        return error_msg

#function_tool
async def browser_new_tab(
    url: str = 'https://google.com',
    timeout: int = 30000,
    wait_for_network: bool = False,
    return_snapshot: bool = True,
    apply_stealth: bool = True
) -> str:
    """
    Open a new tab and optionally navigate to a URL.
    
    Args:
        url: The URL to navigate to in the new tab. If not provided, the new tab will be blank.
        timeout: Maximum time to wait for navigation (default: 30 seconds)
        wait_for_network: Whether to wait for network idle after navigation
        return_snapshot: Whether to return a page snapshot after opening tab
        apply_stealth: Whether to apply stealth measures (default: True)
    
    Returns:
        str: Success message with new tab confirmation and optional page snapshot
    """
    
    try:
        # Get current browser instance from registry
        _instance: BrowserInstance = registry.get('browser_instance')
        current_page = _instance.page
        context = current_page.context
        
        # Enhanced stealth measures
        if apply_stealth:
            # Random delay before opening tab
            await asyncio.sleep(0.1 + (0.4 * random.random()))
        
        # Step 1: Create new tab (following MCP pattern: context.newTab())
        new_page = await context.new_page()
        
        # Wait for new tab to be ready
        await new_page.wait_for_load_state("domcontentloaded")
        
        # Update browser instance to use new tab immediately
        _instance.page = new_page
        
        # Step 2: Navigate to URL if provided (following MCP pattern: currentTabOrDie().navigate())
        if url:
            if apply_stealth:
                # Additional delay before navigation
                await asyncio.sleep(0.2 + (0.3 * random.random()))
            
            try:
                # Navigate using the current (new) tab
                await new_page.goto(url, timeout=timeout, wait_until="domcontentloaded")
                
                # Enhanced wait handling for navigation
                if wait_for_network:
                    try:
                        await new_page.wait_for_load_state("networkidle", timeout=5000)
                    except PlaywrightTimeoutError:
                        pass  # Continue if network doesn't idle
                
            except PlaywrightTimeoutError:
                return f"Error: Failed to navigate to '{url}' within {timeout}ms"
            except Exception as e:
                return f"Error navigating to '{url}': {str(e)}"
        
        # Additional wait for page to stabilize
        if apply_stealth:
            await asyncio.sleep(0.3 + (0.2 * random.random()))
        
        # Return result with optional snapshot
        if return_snapshot:
            snap = await snapshot.snapshot()
            if url:
                return f'Successfully opened new tab and navigated to "{url}". \n{snap}'
            else:
                return f'Successfully opened new blank tab. \n{snap}'
        else:
            if url:
                return f'Successfully opened new tab and navigated to "{url}".'
            else:
                return f'Successfully opened new blank tab.'
            
    except Exception as e:
        return f"Error opening new tab: \n{str(e)}"

#function_tool
async def browser_select_tab(
    index: int = None,
    title: str = None,
    timeout: int = 30000,
    return_snapshot: bool = True,
    apply_stealth: bool = True
) -> str:
    """
    Select a tab by index or title with enhanced stealth capabilities.
    
    Args:
        index: Tab index to select (1-based, e.g., 1 for first tab)
        title: Tab title to select (partial match supported)
        timeout: Maximum time to wait for tab switch (default: 30 seconds)
        return_snapshot: Whether to return a page snapshot after selection
        apply_stealth: Whether to apply stealth measures (default: True)
    
    Returns:
        str: Success message with tab selection confirmation and optional page snapshot
    """
    
    try:
        # Get current browser instance
        _instance: BrowserInstance = registry.get('browser_instance')
        context = _instance.context
        current_page = _instance.page
        
        # Enhanced stealth measures
        if apply_stealth:
            # Random delay between 100ms and 500ms (tab switching should be faster)
            await asyncio.sleep(0.1 + (0.4 * random.random()))
        
        # Get all tabs (pages) from the browser context
        all_pages = context.pages
        
        if not all_pages:
            return "Error: No tabs found in browser"
        
        target_page = None
        
        # Select by index (1-based)
        if index is not None:
            if index < 1 or index > len(all_pages):
                return f"Error: Tab index {index} is out of range. Available tabs: 1-{len(all_pages)}"
            
            target_page = all_pages[index - 1]  # Convert to 0-based index
            selection_method = f"index {index}"
            
        # Select by title (partial match)
        elif title is not None:
            for page in all_pages:
                try:
                    page_title = await page.title()
                    if title.lower() in page_title.lower():
                        target_page = page
                        selection_method = f"title '{title}' (matched: '{page_title}')"
                        break
                except:
                    # Skip pages that can't provide title
                    continue
            
            if not target_page:
                available_titles = []
                for page in all_pages:
                    try:
                        page_title = await page.title()
                        available_titles.append(page_title)
                    except:
                        available_titles.append("[Unable to get title]")
                
                return f"Error: No tab found with title containing '{title}'. Available titles: {available_titles}"
        
        else:
            return "Error: Either 'index' or 'title' parameter must be provided"
        
        # Check if target page is already active
        if target_page == current_page:
            if return_snapshot:
                snap = await snapshot.snapshot()
                return f'Tab {selection_method} is already active.\n{snap}'
            else:
                return f'Tab {selection_method} is already active.'
        
        # Apply stealth delay before switching
        if apply_stealth:
            await asyncio.sleep(0.05 + (0.1 * random.random()))
        
        # Switch to the target tab
        try:
            await target_page.bring_to_front()
            
            # Wait for the page to be fully loaded
            await target_page.wait_for_load_state("domcontentloaded", timeout=timeout)
            
            # Update the browser instance's current page reference
            _instance.page = target_page
            
        except PlaywrightTimeoutError:
            return f"Error: Tab switch timed out after {timeout}ms"
        except Exception as e:
            return f"Error switching to tab {selection_method}: {str(e)}"
        
        # Additional stealth delay after switching
        if apply_stealth:
            await asyncio.sleep(0.2 + (0.3 * random.random()))
        
        # Get tab information for confirmation
        try:
            new_title = await target_page.title()
            new_url = target_page.url
        except:
            new_title = "[Unable to get title]"
            new_url = "[Unable to get URL]"
        
        # Return result with optional snapshot
        if return_snapshot:
            snap = await snapshot.snapshot()
            return f'Successfully selected tab {selection_method}.\nNew active tab: "{new_title}" ({new_url})\n{snap}'
        else:
            return f'Successfully selected tab {selection_method}.\nNew active tab: "{new_title}" ({new_url})'
            
    except Exception as e:
        return f"Error selecting tab: {str(e)}"
    
#function_tool
async def browser_close_tab(
    index: int = None,
    title: str = None,
    timeout: int = 30000,
    return_snapshot: bool = True,
    apply_stealth: bool = True
) -> str:
    """
    Close a browser tab by index or title with enhanced stealth capabilities.
    
    Args:
        index: Tab index to close (1-based, matching browser_list_tabs output). Takes priority if both index and title provided.
        title: Tab title to close (partial match supported). Used if index not provided.
        timeout: Maximum time to wait for the operation (default: 30 seconds)
        return_snapshot: Whether to return a page snapshot after closing tab
        apply_stealth: Whether to apply stealth measures (default: True)
    
    Returns:
        str: Success message with close confirmation and optional page snapshot
    """
    
    try:
        # Validate parameters
        if index is None and title is None:
            # Default behavior: close current active tab
            pass
        elif index is not None and title is not None:
            # Both provided - prioritize index but mention both in logs
            pass
        
        # Get current browser instance
        _instance: BrowserInstance = registry.get('browser_instance')
        page = _instance.page
        context = page.context
        
        # Enhanced stealth measures
        if apply_stealth:
            # Random delay between 100ms and 500ms before action
            await asyncio.sleep(0.1 + (0.4 * random.random()))
        
        # Get all pages (tabs) in the context
        all_pages = context.pages
        
        if not all_pages:
            return "Error: No tabs available to close"
        
        # Check if this would close the last tab
        if len(all_pages) == 1:
            return "Error: Cannot close the last remaining tab. Browser would be left with no tabs."
        
        # Determine which tab to close
        target_page = None
        tab_info = ""
        close_method = ""
        
        if index is not None:
            # Close by index (1-based) - this takes priority
            if index < 1 or index > len(all_pages):
                return f"Error: Tab index {index} is out of range. Available tabs: 1-{len(all_pages)}"
            
            target_page = all_pages[index - 1]  # Convert to 0-based index
            tab_info = f"tab {index}"
            close_method = f"index {index}"
            
            # If title was also provided, mention it in the response
            if title is not None:
                close_method += f" (title '{title}' was also provided but index took priority)"
                
        elif title is not None:
            # Close by title matching
            for i, p in enumerate(all_pages):
                try:
                    page_title = await p.title()
                    if title.lower() in page_title.lower():
                        target_page = p
                        tab_info = f"tab {i + 1}"
                        close_method = f"title match '{title}'"
                        break
                except:
                    continue
            
            if not target_page:
                return f"Error: No tab found with title containing '{title}'"
                
        else:
            # Default: Close current active tab
            target_page = page
            try:
                current_index = all_pages.index(page) + 1  # Convert to 1-based
                tab_info = f"current tab (tab {current_index})"
                close_method = "current active tab (default)"
            except ValueError:
                tab_info = "current tab"
                close_method = "current active tab (default)"
        
        # Get tab details for confirmation message
        try:
            tab_title = await target_page.title()
            if not tab_title.strip():
                tab_title = "Untitled"
        except:
            tab_title = "Unknown"
        
        try:
            tab_url = target_page.url
        except:
            tab_url = "about:blank"
        
        # If we're closing the current active tab, we need to switch to another tab first
        if target_page == page:
            # Find another page to switch to (prefer the next tab, or previous if at end)
            remaining_pages = [p for p in all_pages if p != target_page]
            if remaining_pages:
                # Try to select a logical next tab
                current_index = all_pages.index(target_page)
                if current_index < len(remaining_pages):
                    new_active_page = remaining_pages[current_index]
                else:
                    new_active_page = remaining_pages[0]
                
                await new_active_page.bring_to_front()
                # Update the browser instance to point to the new active page
                _instance.page = new_active_page
        
        # Close the target tab
        await target_page.close()
        
        # Additional stealth delay after closing
        if apply_stealth:
            await asyncio.sleep(0.1 + (0.2 * random.random()))
        
        # Prepare success message
        success_msg = f'Successfully closed {tab_info} by {close_method}.\nClosed tab details:\n  Title: {tab_title}\n  URL: {tab_url}'
        
        # Return result with optional snapshot
        if return_snapshot:
            # Wait a moment for the UI to update after tab close
            await asyncio.sleep(0.3)
            snap = await snapshot.snapshot()
            return f'{success_msg}\n\n{snap}'
        else:
            return success_msg
            
    except PlaywrightTimeoutError:
        return f"Error: Tab close operation timed out after {timeout}ms"
    except Exception as e:
        return f"Error closing tab: {str(e)}"
    