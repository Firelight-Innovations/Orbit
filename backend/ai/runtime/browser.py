from typing import Optional

from playwright.async_api import async_playwright, Browser, Page, Playwright

from .config import get_settings
from . import registry


class BrowserConnection:
    """
    Manages a connection to the live Electron Chromium instance via CDP.
    """

    def __init__(self) -> None:
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None

    async def connect(self, port: Optional[int] = None) -> Page:
        settings = get_settings()
        target_port = port or settings.cdp_port

        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.connect_over_cdp(
            f"http://localhost:{target_port}"
        )

        # Prefer the first existing page; otherwise create one.
        contexts = self.browser.contexts
        for ctx in contexts:
            pages = ctx.pages
            if pages:
                self.page = pages[0]
                break

        if not self.page and contexts:
            self.page = await contexts[0].new_page()

        if not self.page:
            # As a last resort, open a new context/page
            ctx = await self.browser.new_context()
            self.page = await ctx.new_page()

        return self.page

    async def close(self) -> None:
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()


async def get_browser() -> BrowserConnection:
    existing = registry.get("browser")
    if isinstance(existing, BrowserConnection):
        return existing
    conn = BrowserConnection()
    await conn.connect()
    registry.set("browser", conn)
    return conn

