from agents import function_tool
from typing import Dict, Set, Optional
import asyncio
import time

from src.core import queue
from ._internal import snapshot
from src.cli.console_formatter import formatter

# importing the tools
from .browser import keyboard
from .browser import mouse
from .browser import navigate
from .browser import tabs
from . import output
from .browser import playwright_executor

####################
# Turn Tracking    #
####################

async def _execute_tool(
    tool_name: str, 
    **kwargs
) -> str:
    """
    Execute a tool.
    """
    _queue = queue.get_tool_queue()
    return await _queue.add_tool_call(tool_name, **kwargs)

def _handle_intent(intent: str = None) -> None:
    if intent:
        print(f'\n{formatter.create_task_box(intent)}')

#########
# MOUSE #
#########

@function_tool
async def browser_click(
    intent: str = None,
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
        await browser_click(ref_id="e12")
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_click',
        ref_id=ref_id,
        timeout=timeout,
        wait_for_network=wait_for_network,
        apply_stealth=apply_stealth
    )

@function_tool
async def browser_hover(
    intent: str = None,
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
    
    Examples:
        await browser_hover(ref_id="e15")
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_hover',
        ref_id=ref_id,
        timeout=timeout,
        maintain_position=maintain_position,
        apply_stealth=apply_stealth
    )

@function_tool
async def browser_dropdown_select_option(
    intent: str = None,
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
    
    Examples:
        await browser_dropdown_select_option(ref_id="e33", values=["English"]) 
        
        # Select multiple options from multi-select
        await browser_dropdown_select_option(
            ref_id="e45", 
            values=["Technology", "Science"]
        )
        
        await browser_dropdown_select_option(ref_id="e77", values=["United States"]) 
        await browser_dropdown_select_option(ref_id="e90", values=["January"]) 
    """
    _handle_intent(intent=intent)
    
    return await _execute_tool(
        'browser_dropdown_select_option',
        ref_id=ref_id,
        values=values,
        timeout=timeout,
        wait_for_network=wait_for_network,
        apply_stealth=apply_stealth
    )

@function_tool
async def browser_calendar_select_option(
    intent: str = None,
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
    
    Examples:
        await browser_calendar_select_option(ref_id="e101", year=1995, month=6, day=15)
        await browser_calendar_select_option(ref_id="e202", year=2024, month=12, day=25)
        await browser_calendar_select_option(ref_id="e303", year=2024, month=3, day=10)
        await browser_calendar_select_option(ref_id="e404", year=2024, month=8, day=31)
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_calendar_select_option',
        ref_id=ref_id,
        year=year,
        month=month,
        day=day,
        timeout=timeout,
        wait_for_network=wait_for_network,
        apply_stealth=apply_stealth
    )

############
# KEYBOARD #
############

@function_tool
async def browser_type(
    intent: str = None,
    ref_id: str = None,
    text: str = "",
    submit: bool = False,
    slowly: bool = False,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """Type text into an element using its ref attribute from the snapshot.
    Maintains natural typing behavior and stealth capabilities for human-like interaction.
    
    Args:
        ref_id: The `ref` attribute value assigned in the snapshot (e.g., "e123").
        text: Text to type into the element
        submit: Whether to submit entered text (press Enter after)
        slowly: Whether to type one character at a time for triggering key handlers
        timeout: Maximum time to wait for the element (default: 30 seconds)
        wait_for_network: Whether to wait for network idle after typing
        apply_stealth: Whether to apply stealth measures (natural delays)
    
    Returns:
        Success/error message string
    
    Examples:
        # Type in Gmail search box
        await browser_type(ref_id="e12", text="linkedin jobs")
        
        # Type in subject field and submit
        await browser_type(ref_id="e21", text="Follow up", submit=True)
        
        # Type slowly in form field (triggers validation)
        await browser_type(ref_id="e34", text="user@example.com", slowly=True)
        
        # Partial name matching for dynamic labels
        await browser_type(ref_id="e55", text="Hello!")
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_type',
        ref_id=ref_id,
        text=text,
        submit=submit,
        slowly=slowly,
        timeout=timeout,
        wait_for_network=wait_for_network,
        apply_stealth=apply_stealth
    )

@function_tool
async def browser_key_press(
    intent: str = None,
    key: str = None,
    timeout: int = 30000,
    wait_for_network: bool = True,
    apply_stealth: bool = True
) -> str:
    """Press key."""
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_key_press',
        key=key,
        timeout=timeout,
        wait_for_network=wait_for_network,
        apply_stealth=apply_stealth
    )

##############
# NAVIGATION #
##############

@function_tool
async def browser_navigate(
    intent: str = None,
    url: str = None, 
    timeout: float = 30000, 
    max_retries: int = 3, 
    retry_delay: float = 2.0
) -> str:
    """Navigate to URL."""
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_navigate',
        url=url,
        timeout=timeout,
        max_retries=max_retries,
        retry_delay=retry_delay
    )

@function_tool
async def browser_navigate_back(
    intent: str = None,
    timeout: float = 30000, 
    max_retries: int = 3,
    retry_delay: float = 2.0
) -> str:
    """Navigate back."""
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_navigate_back',
        timeout=timeout,
        max_retries=max_retries,
        retry_delay=retry_delay
    )

@function_tool
async def browser_navigate_forward(
    intent: str = None,
    timeout: float = 30000, 
    max_retries: int = 3, 
    retry_delay: float = 2.0
) -> str:
    """Navigate forward."""
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_navigate_forward',
        timeout=timeout,
        max_retries=max_retries,
        retry_delay=retry_delay
    )

########
# TABS #
########

@function_tool
async def browser_list_tabs(
    intent: str = None,
) -> str:
    """
    List all browser tabs with their titles, URLs, and active status.
    
    Returns:
        str: Formatted list of all browser tabs with details
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_list_tabs',
    )

@function_tool
async def browser_new_tab(
    intent: str = None,
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
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_new_tab',
        url=url,
        timeout=timeout,
        wait_for_network=wait_for_network,
        return_snapshot=return_snapshot,
        apply_stealth=apply_stealth
    )

@function_tool
async def browser_select_tab(
    intent: str = None,
    index: int = None,
    title: str = None,
    timeout: int = 30000,
    apply_stealth: bool = True
) -> str:
    """
    Select a tab by index or title with enhanced stealth capabilities.
    
    Args:
        index: Tab index to select (1-based, e.g., 1 for first tab)
        title: Tab title to select (partial match supported)
        timeout: Maximum time to wait for tab switch (default: 30 seconds)
        apply_stealth: Whether to apply stealth measures (default: True)
    
    Returns:
        str: Success message with tab selection confirmation and optional page snapshot
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_select_tab',
        index=index,
        title=title,
        timeout=timeout,
        return_snapshot=False,
        apply_stealth=apply_stealth
    )

@function_tool
async def browser_close_tab(
    intent: str = None,
    index: int = None,
    title: str = None,
    timeout: int = 30000,
    apply_stealth: bool = True
) -> str:
    """
    Close a browser tab by index or title with enhanced stealth capabilities.
    
    Args:
        index: Tab index to close (1-based, matching browser_list_tabs output). Takes priority if both index and title provided.
        title: Tab title to close (partial match supported). Used if index not provided.
        timeout: Maximum time to wait for the operation (default: 30 seconds)
        apply_stealth: Whether to apply stealth measures (default: True)
    
    Returns:
        str: Success message with close confirmation and optional page snapshot
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_close_tab',
        index=index,
        title=title,
        timeout=timeout,
        return_snapshot=False,
        apply_stealth=apply_stealth
    )

##################
# CODE EXECUTION #
##################

@function_tool
async def execute_playwright_code(
    intent: str = None,
    code: str = None,
    description: str = None,
    timeout: float = 30000,
    max_retries: int = 3,
    retry_delay: float = 2.0,
    action_type: str = "custom",
    selector: Optional[str] = None,
    text: Optional[str] = None
) -> str:
    """
    Execute Python Playwright automation code on the current webpage with retry logic.

    This is what your code is executed within:
    `import asyncio
    import json
    from playwright.async_api import expect
    from playwright_stealth import stealth_async
    
    async def _execute_user_code():
        {code}
        
    result = await asyncio.wait_for(_execute_user_code(), timeout={timeout/1000})`

    Do not define your own function, only the code that would go within _execute_user_code()
    Uses Python with async/await syntax
    """
    _handle_intent(intent=intent)

    return await _execute_tool(
        'execute_playwright_code',
        code=code,
        description=description,
        timeout=timeout,
        max_retries=max_retries,
        retry_delay=retry_delay,
        action_type=action_type,
        selector=selector,
        text=text
    )

@function_tool(strict_mode=False)
async def browser_extract_data(
    intent: str = None,
    selectors: Dict[str, str] = None,
    timeout: float = 30000,
    max_retries: int = 3,
    retry_delay: float = 2.0
) -> str:
    """Extract data from multiple elements using CSS selectors with retry logic."""
    _handle_intent(intent=intent)

    return await _execute_tool(
        'browser_extract_data',
        selectors=selectors,
        timeout=timeout,
        max_retries=max_retries,
        retry_delay=retry_delay
    )

##########
# OUTPUT #
##########

@function_tool
async def browser_print(
    text: str
) -> bool:
    """Prints text to the console for the user to see."""
    _queue = queue.get_tool_queue()
    return await _queue.add_tool_call(
        'browser_print', 
        text=text
    )

####################
# Setup Functions  #
####################

async def setup_weave():   
    """Initialize the weave system."""
    _queue = await queue.initialize_tool_queue()
    
    # mouse
    _queue.register_tool('browser_click', mouse.browser_click)
    _queue.register_tool('browser_hover', mouse.browser_hover)
    _queue.register_tool('browser_dropdown_select_option', mouse.browser_dropdown_select_option)
    _queue.register_tool('browser_calendar_select_option', mouse.browser_calendar_select_option)

    # keyboard
    _queue.register_tool('browser_type', keyboard.browser_type)
    _queue.register_tool('browser_key_press', keyboard.browser_key_press)

    # navigation 
    _queue.register_tool('browser_navigate', navigate.browser_navigate)
    _queue.register_tool('browser_navigate_back', navigate.browser_navigate_back)
    _queue.register_tool('browser_navigate_forward', navigate.browser_navigate_forward)

    # tabs
    _queue.register_tool('browser_list_tabs', tabs.browser_list_tabs)
    _queue.register_tool('browser_new_tab', tabs.browser_new_tab)
    _queue.register_tool('browser_select_tab', tabs.browser_select_tab)
    _queue.register_tool('browser_close_tab', tabs.browser_close_tab)

    # output
    _queue.register_tool('browser_print', output.browser_print)

    # code executor
    _queue.register_tool('execute_playwright_code', playwright_executor.execute_playwright_code)
    _queue.register_tool('browser_extract_data', playwright_executor.browser_extract_data)

    return _queue
