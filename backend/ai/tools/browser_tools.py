from langchain_core.tools import tool
from playwright.async_api import TimeoutError

from backend.ai.runtime.browser import get_browser


async def _get_page():
    conn = await get_browser()
    if not conn.page:
        conn.page = await conn.browser.new_page()  # type: ignore[arg-type]
    return conn.page


@tool
async def browser_click(ref_id: str, intent: str | None = None) -> str:
    """
    Click an element using its ref attribute from the injected DOM snapshot.
    """
    page = await _get_page()
    locator = page.locator(f'[ref="{ref_id}"]').first
    if await locator.count() == 0:
        return f"Element with ref '{ref_id}' not found"
    await locator.click()
    return f"Clicked element ref={ref_id}"


@tool
async def browser_type(ref_id: str, text: str, submit: bool = False) -> str:
    """
    Type text into an element using its ref attribute.
    """
    page = await _get_page()
    locator = page.locator(f'[ref="{ref_id}"]').first
    if await locator.count() == 0:
        return f"Element with ref '{ref_id}' not found"
    await locator.click()
    await locator.fill(text)
    if submit:
        await locator.press("Enter")
    return f'Typed "{text}" into ref={ref_id}'


@tool
async def browser_key_press(key: str) -> str:
    """
    Press a keyboard key on the active page.
    """
    page = await _get_page()
    await page.keyboard.press(key)
    return f'Pressed key "{key}"'


@tool
async def browser_navigate(url: str, timeout_ms: int = 30000) -> str:
    """
    Navigate the active page to a URL.
    """
    page = await _get_page()
    try:
        await page.goto(url, timeout=timeout_ms, wait_until="load")
        return f"Navigated to {url}"
    except TimeoutError:
        return f"Navigation to {url} timed out after {timeout_ms}ms"


@tool
async def browser_list_tabs() -> str:
    """
    List open pages in the connected browser context.
    """
    conn = await get_browser()
    tabs = []
    for ctx in conn.browser.contexts:  # type: ignore[union-attr]
        for idx, p in enumerate(ctx.pages):
            tabs.append(f"[{idx}] {p.title()} - {p.url}")
    return "\n".join(tabs) if tabs else "No tabs found"


@tool
async def browser_new_tab(url: str = "https://google.com") -> str:
    """
    Open a new tab and navigate to the given URL.
    """
    conn = await get_browser()
    ctx = conn.browser.contexts[0] if conn.browser.contexts else await conn.browser.new_context()  # type: ignore[union-attr]
    page = await ctx.new_page()
    await page.goto(url)
    return f"Opened new tab at {url}"


@tool
async def browser_select_tab(index: int = 0) -> str:
    """
    Select (focus) a tab by index across contexts.
    """
    conn = await get_browser()
    for ctx in conn.browser.contexts:  # type: ignore[union-attr]
        pages = ctx.pages
        if 0 <= index < len(pages):
            conn.page = pages[index]
            await pages[index].bring_to_front()
            return f"Selected tab {index} -> {pages[index].url}"
    return f"Tab index {index} not found"


@tool
async def browser_close_tab(index: int = 0) -> str:
    """
    Close a tab by index.
    """
    conn = await get_browser()
    for ctx in conn.browser.contexts:  # type: ignore[union-attr]
        pages = ctx.pages
        if 0 <= index < len(pages):
            await pages[index].close()
            return f"Closed tab {index}"
    return f"Tab index {index} not found"

