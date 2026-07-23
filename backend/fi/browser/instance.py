import asyncio
import os
import pathlib
import platform
import random
import logging
from playwright.async_api import async_playwright, Page, Browser, BrowserContext
from typing import List

logger = logging.getLogger(__name__)

# Optional imports - these may not be available in all environments
try:
    from playwright_stealth import stealth_async
    HAS_STEALTH = True
except ImportError:
    # Try alternate import
    try:
        from playwright_stealth import Stealth
        async def stealth_async(page):
            stealth = Stealth()
            await stealth.apply(page)
        HAS_STEALTH = True
    except ImportError:
        HAS_STEALTH = False
        stealth_async = None
        logger.warning("playwright_stealth not available - stealth measures disabled")

try:
    from fi.visualization.cursor import PlaywrightBotCursor
    HAS_CURSOR = True
except ImportError:
    HAS_CURSOR = False
    PlaywrightBotCursor = None
    logger.warning("PlaywrightBotCursor not available - cursor visualization disabled")

# AutoScrollManager is not essential, make it optional
HAS_AUTO_SCROLL = False
AutoScrollManager = None

# Default CDP port matching Electron's remote-debugging-port
DEFAULT_CDP_PORT = 9222

class BrowserInstance:
    def __init__(self):
        self.browser = None
        self.context = None
        self.page = None
        self.playwright = None
        self.cursor = None  # Add cursor controller
        self.auto_scroll_manager = None

    async def create_new_session(self) -> bool:
        # This method can be used to launch a new browser instance with remote debugging enabled
        # For simplicity, we will just call initialize with the appropriate args
        await self.initialize(args=['--remote-debugging-port=9222'])
        return True

    async def validate_cdp_connection(self) -> bool:
        if not self.browser or not self.browser.is_connected():
            return False
        
        # The browser is connected via CDP, so we can try to get the version
        try:
            version = self.browser.version
            return version is not None
        except Exception:
            return False

    async def connect_via_cdp(
        self,
        cdp_url: str | None = None,
        port: int | None = None,
        max_retries: int = 3,
        retry_delay: float = 1.0
    ) -> Page:
        """
        Connect to an existing browser (e.g., Electron) via Chrome DevTools Protocol.
        
        This allows the agent to control an already-running browser instead of
        launching a new one.
        
        Args:
            cdp_url: Full CDP endpoint URL (e.g., "http://localhost:9222")
            port: CDP port number (used if cdp_url not provided)
            max_retries: Maximum number of connection attempts
            retry_delay: Delay between retries in seconds
            
        Returns:
            The active Page object
            
        Raises:
            ConnectionError: If unable to connect after all retries
        """
        if cdp_url is None:
            target_port = port or DEFAULT_CDP_PORT
            # Use 127.0.0.1 explicitly instead of localhost to avoid IPv6 resolution issues
            cdp_url = f"http://127.0.0.1:{target_port}"
        
        last_error: Exception | None = None

        for attempt in range(max_retries):
            try:
                logger.info(f"Connecting to browser via CDP at {cdp_url} (attempt {attempt + 1}/{max_retries})")

                # Start Playwright if not already started
                if not self.playwright:
                    self.playwright = await async_playwright().start()

                # Connect to existing browser via CDP (with 15 second timeout)
                self.browser = await self.playwright.chromium.connect_over_cdp(cdp_url, timeout=15000)
                
                # Get existing context/page from the browser
                contexts = self.browser.contexts
                if contexts:
                    self.context = contexts[0]
                    pages = self.context.pages
                    if pages:
                        # Prefer a real web page over Orbit's own renderers (the
                        # UI view, the sidebar, and the window-root blank doc are
                        # all in this context). resolve_active_page() refines this
                        # per-request from the foreground tab URL.
                        web_pages = [p for p in pages if not self._is_internal_url(p.url)]
                        # Deliberately leave self.page as None when only Orbit's
                        # own renderers are open. Falling back to pages[0] here
                        # handed the agent the assistant sidebar, and it went on
                        # to type into its own chat box and click its own
                        # buttons. Tools refuse without a page, and navigate_to
                        # opens a real tab through the Orbit bridge, so "no page
                        # yet" is a recoverable state rather than a dead end.
                        self.page = web_pages[0] if web_pages else None
                        if self.page is not None:
                            logger.info(f"Connected to existing page: {self.page.url}")
                        else:
                            logger.info(
                                "No web page open (only Orbit's own views); "
                                "agent must navigate before it can act."
                            )
                    else:
                        # No pages exist, create one
                        self.page = await self.context.new_page()
                        logger.info("Created new page in existing context")
                else:
                    # No contexts exist, create one
                    self.context = await self.browser.new_context()
                    self.page = await self.context.new_page()
                    logger.info("Created new context and page")
                
                # All of this is per-page setup, so it only applies once there is
                # a real page. _on_new_page runs the same steps for the tab the
                # agent opens later.
                if self.page is not None:
                    await self._inject_scripts_to_page(self.page)

                    # Apply stealth measures
                    if HAS_STEALTH and stealth_async:
                        try:
                            await stealth_async(self.page)
                        except Exception as e:
                            logger.warning(f"Could not apply stealth measures: {e}")

                    # Initialize cursor controller
                    if HAS_CURSOR and PlaywrightBotCursor:
                        self.cursor = PlaywrightBotCursor(self.page)

                    # Repoint self.page if this tab closes
                    self.page.on("close", self._on_page_close)

                # Listen for new pages (tabs) in the context
                self.context.on("page", self._on_new_page)

                logger.info(
                    "CDP connection established. Active page: "
                    f"{self.page.url if self.page is not None else 'none yet'}"
                )
                return self.page
                
            except Exception as e:
                last_error = e
                logger.warning(f"CDP connection attempt {attempt + 1} failed: {e}")
                
                # Clean up failed attempt
                if self.playwright:
                    try:
                        await self.playwright.stop()
                    except Exception:
                        pass
                    self.playwright = None
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (attempt + 1))
        
        # All retries failed
        error_msg = f"Failed to connect to browser via CDP after {max_retries} attempts"
        if last_error:
            error_msg += f": {last_error}"
        raise ConnectionError(error_msg)

    def _on_new_page(self, page: Page) -> None:
        """Handle new pages (tabs) created in the browser context.

        Follow the new tab (OAuth/login popups, redirect-to-new-tab mid-run).
        resolve_active_page() re-corrects on the next turn if the foreground
        tab is actually a different one.
        """
        async def setup_page():
            try:
                await self._inject_scripts_to_page(page)
                self.page = page
                if HAS_CURSOR and PlaywrightBotCursor:
                    self.cursor = PlaywrightBotCursor(page)
                logger.info(f"Followed new page: {page.url}")
            except Exception as e:
                logger.warning(f"Failed to set up new page: {e}")

        # Repoint self.page if this tab closes
        page.on("close", self._on_page_close)

        # Schedule the async setup
        asyncio.create_task(setup_page())

    def _on_page_close(self, page: Page) -> None:
        """Handle a page (tab) closing; repoint self.page to a surviving tab."""
        if page is not self.page:
            return
        surviving = None
        if self.context:
            surviving = [p for p in self.context.pages if p is not page and not p.is_closed()]
        if surviving:
            self.page = surviving[-1]
            if HAS_CURSOR and PlaywrightBotCursor:
                self.cursor = PlaywrightBotCursor(self.page)
            logger.info(f"Active tab closed; repointed to: {self.page.url}")
        else:
            self.page = None
            self.cursor = None
            logger.info("Active tab closed; no surviving pages")

    @staticmethod
    def _is_internal_url(url: str | None) -> bool:
        """True for Orbit's own renderers/blank targets (not drivable web pages).

        Covers the UI view and sidebar (localhost:5173 in dev, file:// in prod),
        the window-root blank data: doc, and browser-internal schemes.
        """
        if not url:
            return True
        u = url.lower()
        if u.startswith(("about:", "data:", "chrome:", "devtools:", "orbit://", "file://")):
            return True
        if "localhost:5173" in u or "/sidebar.html" in u or "/index.html" in u:
            return True
        return False

    @staticmethod
    def _normalize_url(url: str | None) -> str:
        """Normalize a URL for comparison: strip fragment and trailing slash."""
        if not url:
            return ""
        normalized = url.split("#", 1)[0]
        if normalized.endswith("/"):
            normalized = normalized[:-1]
        return normalized

    async def resolve_active_page(self, url: str | None) -> Page | None:
        """Point self.page at the foreground tab matching the given URL.

        Matches page_context.url (the Electron active tab) against the pages in
        the CDP context. Exact match first, then host+path prefix. No match
        leaves the current page untouched (self-heals next turn).
        """
        if not url or not self.context:
            return self.page

        target = self._normalize_url(url)
        if not target:
            return self.page

        candidates = [
            p for p in self.context.pages
            if not p.is_closed() and p.url and not p.url.startswith("about:blank")
        ]

        match = None
        # Exact normalized match
        for p in candidates:
            if self._normalize_url(p.url) == target:
                match = p
                break
        # Prefix match (handles post-load redirects / query differences)
        if match is None:
            for p in candidates:
                pu = self._normalize_url(p.url)
                if pu.startswith(target) or target.startswith(pu):
                    match = p
                    break

        if match is not None and match is not self.page:
            await self.switch_to_page(match)
        return self.page

    async def _find_orbit_bridge_page(self) -> Page | None:
        """Find an Orbit renderer page that exposes window.electronAPI.

        The UI view and the sidebar both load Orbit's preload, so either can be
        used to drive Orbit's own tab IPC. Real web pages and the blank root do
        not have electronAPI and are skipped.
        """
        if not self.context:
            return None
        for p in self.context.pages:
            if p.is_closed():
                continue
            try:
                has_api = await p.evaluate(
                    "() => !!(window.electronAPI"
                    " && window.electronAPI.navigate"
                    " && window.electronAPI.getTabState)"
                )
            except Exception:
                has_api = False
            if has_api:
                return p
        return None

    async def _await_navigated_page(self, url: str, timeout: float = 15.0) -> Page | None:
        """Wait for the real tab that Orbit navigated to `url` to appear/settle.

        Prefers a non-internal page whose host matches the target; otherwise
        returns the most recently seen web page. Returns None if none appears.
        """
        target = self._normalize_url(url)
        thost = target.split("://")[-1].split("/")[0]
        if thost.startswith("www."):
            thost = thost[4:]
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        newest: Page | None = None
        while loop.time() < deadline:
            web_pages = [
                p for p in self.context.pages
                if not p.is_closed() and not self._is_internal_url(p.url)
            ]
            for p in web_pages:
                if thost and thost in self._normalize_url(p.url):
                    return p
            if web_pages:
                newest = web_pages[-1]
            await asyncio.sleep(0.25)
        return newest

    async def navigate_active_tab(self, url: str) -> Page:
        """Navigate Orbit's active tab to `url` through Orbit's own tab IPC.

        This drives the real browser tab (creating a tab view if the active tab
        is an internal page like orbit://newtab), rather than doing page.goto on
        a raw CDP target that may be an Orbit renderer (the sidebar/UI). After
        navigating, self.page is repointed to the resulting web tab so later
        tools act on the right page.
        """
        bridge = await self._find_orbit_bridge_page()
        if bridge is None:
            # No Orbit bridge; only safe to navigate if we're already on a real
            # web page (never navigate an Orbit renderer).
            if self.page and not self._is_internal_url(self.page.url):
                await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
                return self.page
            raise RuntimeError("Could not reach Orbit's tab controls to navigate.")

        await bridge.evaluate(
            """async (u) => {
                const state = await window.electronAPI.getTabState();
                const id = state && state.activeTabId;
                if (!id) throw new Error('no active tab');
                await window.electronAPI.navigate(id, u);
                return id;
            }""",
            url,
        )

        page = await self._await_navigated_page(url)
        if page is not None and page is not self.page:
            await self.switch_to_page(page)
        return self.page

    async def _inject_scripts_to_page(self, page: Page) -> None:
        """
        Inject required scripts into a specific page.

        Used for CDP connections where we can't use context.add_init_script()
        for existing pages.
        """
        # Never inject automation scripts into Orbit's own renderers (the UI
        # view, the assistant sidebar, the blank window-root). botIndicators.js
        # and botCursor.js paint position:fixed, full-window overlays -- on the
        # UI view that covers the whole screen, and on the sidebar it hides the
        # chat. The agent-active visuals belong only on the real web page it
        # controls.
        if self._is_internal_url(page.url):
            logger.debug(f"Skipping script injection for internal page: {page.url}")
            return

        static_dir = pathlib.Path(__file__).parent.parent.joinpath("static")
        
        # Inject DOM snapshot script (critical for element targeting)
        try:
            dom_snapshot_path = static_dir.joinpath("dom_snapshot.js")
            if dom_snapshot_path.exists():
                dom_snapshot_script = dom_snapshot_path.read_text()
                await page.evaluate(dom_snapshot_script)
                # Also add as init script for future navigations
                await page.add_init_script(dom_snapshot_script)
                logger.debug("DOM snapshot script injected")
        except Exception as e:
            logger.warning(f"Failed to inject DOM snapshot script: {e}")
        
        # Inject bot cursor script
        try:
            cursor_script_path = static_dir.joinpath("botCursor.js")
            if cursor_script_path.exists():
                cursor_script = cursor_script_path.read_text()
                await page.evaluate(cursor_script)
                await page.add_init_script(cursor_script)
                logger.debug("Bot cursor script injected")
        except Exception as e:
            logger.warning(f"Failed to inject bot cursor script: {e}")
        
        # Inject bot indicators script
        try:
            indicator_script_path = static_dir.joinpath("botIndicators.js")
            if indicator_script_path.exists():
                indicator_script = indicator_script_path.read_text()
                await page.evaluate(indicator_script)
                await page.add_init_script(indicator_script)
                logger.debug("Bot indicators script injected")
        except Exception as e:
            logger.warning(f"Failed to inject bot indicators script: {e}")
        
        # Add stealth measures
        stealth_script = """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """
        try:
            await page.evaluate(stealth_script)
            await page.add_init_script(stealth_script)
        except Exception as e:
            logger.warning(f"Failed to inject stealth script: {e}")

    async def switch_to_page(self, page: Page) -> None:
        """
        Switch agent focus to a different page (tab).
        
        Args:
            page: The Page object to switch to
        """
        self.page = page
        await self._inject_scripts_to_page(page)
        if HAS_CURSOR and PlaywrightBotCursor:
            self.cursor = PlaywrightBotCursor(page)
        logger.info(f"Switched to page: {page.url}")

    async def switch_to_page_by_index(self, index: int) -> Page | None:
        """
        Switch to a page by its index in the context.
        
        Args:
            index: Zero-based index of the page
            
        Returns:
            The Page object if found, None otherwise
        """
        if not self.context:
            logger.error("No browser context available")
            return None
        
        pages = self.context.pages
        if 0 <= index < len(pages):
            await self.switch_to_page(pages[index])
            return self.page
        else:
            logger.error(f"Page index {index} out of range (0-{len(pages)-1})")
            return None

    async def get_all_pages(self) -> list[Page]:
        """Get all pages (tabs) in the current context."""
        if not self.context:
            return []
        return self.context.pages

    async def disconnect(self) -> None:
        """
        Disconnect from the CDP browser without closing it.
        
        Unlike close(), this leaves the browser running.
        """
        if self.cursor:
            try:
                await self.cursor.set_visibility(False)
            except Exception:
                pass
        
        if self.browser:
            try:
                # Disconnect without closing the browser
                await self.browser.close()
            except Exception as e:
                logger.warning(f"Error during disconnect: {e}")
        
        if self.playwright:
            await self.playwright.stop()
        
        self.browser = None
        self.context = None
        self.page = None
        self.playwright = None
        self.cursor = None
        
        logger.info("Disconnected from CDP browser")

    def _get_user_data_dir(self):
        """Get realistic user data directory based on OS"""
        system = platform.system()
        if system == "Windows":
            base_dir = os.environ.get('LOCALAPPDATA', os.path.expanduser(r'~\AppData\Local'))
            return os.path.join(base_dir, 'ms-playwright', 'mcp-chromium-profile')
        elif system == "Darwin":
            return os.path.expanduser('~/Library/Caches/ms-playwright/mcp-chromium-profile')
        else:
            return os.path.expanduser('~/.cache/ms-playwright/mcp-chromium-profile')

    async def initialize(self, headless=False, user_data_dir=None, args: List[str] = None):
        """Initialize browser with comprehensive stealth measures and cursor tracking"""
        self.playwright = await async_playwright().start()
        
        if user_data_dir is None:
            user_data_dir = self._get_user_data_dir()
        
        os.makedirs(user_data_dir, exist_ok=True)
        
        # Enhanced user agents - use most current
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ]
        
        selected_user_agent = random.choice(user_agents)
        
        launch_options = {
            'headless': headless,
            'channel': 'chrome',
            'args': [
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-infobars',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-field-trial-config',
                '--disable-back-forward-cache',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--metrics-recording-only',
                '--no-report-upload',
                '--safebrowsing-disable-auto-update',
                '--password-store=basic',
                '--use-mock-keychain'
            ],
            'user_agent': selected_user_agent,
            'locale': 'en-US',
            'timezone_id': 'America/New_York',
            'geolocation': {'longitude': -74.006, 'latitude': 40.7128},
            'permissions': ['geolocation', 'notifications'],
            'color_scheme': 'light',
            'reduced_motion': 'no-preference',
            'forced_colors': 'none',
            'device_scale_factor': 1,
            'ignore_https_errors': False
        }
        
        if args:
            launch_options['args'].extend(args)
        
        if os.environ.get('DOCKER_CONTAINER') or os.environ.get('CI'):
            launch_options['args'].extend(['--no-sandbox', '--disable-setuid-sandbox'])
        
        self.context = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=user_data_dir,
            **launch_options
        )
        
        # Load and inject antibot script
        script_path = pathlib.Path(__file__).parent.parent.joinpath("static", "antibot.js")
        antibot_script = (script_path.read_text())
        antibot_script = antibot_script.replace("{selected_user_agent}", selected_user_agent)
        await self.context.add_init_script(antibot_script)
        
        # Load and inject the bot indicators
        indicator_script_path = pathlib.Path(__file__).parent.parent.joinpath("static", "botIndicators.js")
        indicator_script = (indicator_script_path.read_text())
        await self.context.add_init_script(indicator_script)

        # Load and inject the bot cursor
        cursor_script_path = pathlib.Path(__file__).parent.parent.joinpath("static", "botCursor.js")
        cursor_script = (cursor_script_path.read_text())
        await self.context.add_init_script(cursor_script)
        
        # Load and inject the DOM snapshot runtime so it's available on page creation
        try:
            dom_snapshot_path = pathlib.Path(__file__).parent.parent.joinpath("static", "dom_snapshot.js")
            if dom_snapshot_path.exists():
                dom_snapshot_script = dom_snapshot_path.read_text()
                await self.context.add_init_script(dom_snapshot_script)
        except Exception:
            # Non-fatal: snapshot tool will attempt page-level injection as a fallback
            pass

        self.page = await self.context.new_page()
        
        # Apply stealth if available
        if HAS_STEALTH and stealth_async:
            try:
                await stealth_async(self.page)
            except Exception as e:
                logger.warning(f"Could not apply stealth measures: {e}")
        
        # Add additional stealth measures at page level
        await self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)
        
        # Page height and scroll debug
        await self.page.add_init_script("""
            window.addEventListener('load', () => {
                const metrics = {
                    innerHeight: window.innerHeight,
                    scrollHeight: document.body.scrollHeight,
                    bodyOverflow: getComputedStyle(document.body).overflow,
                    htmlOverflow: getComputedStyle(document.documentElement).overflow
                };
                console.log('LAYOUT_METRICS ' + JSON.stringify(metrics));
            });
        """)
        
        self.browser = self.context.browser
        
        # Initialize cursor controller
        if HAS_CURSOR and PlaywrightBotCursor:
            self.cursor = PlaywrightBotCursor(self.page)
        #self.auto_scroll_manager = AutoScrollManager(self.page)
        
        return self.page

    async def navigate_to(self, url: str):
        """Navigate to URL and ensure cursor system is ready"""
        if not self.page:
            raise RuntimeError("Browser not initialized. Call initialize() first.")
        
        await self.page.goto(url)
        
        # Wait for cursor system to be ready after navigation
        if self.cursor:
            await self.cursor.ensure_cursor_ready()
            logger.info(f"Navigated to {url} - cursor system ready")

    # Cursor control methods
    async def get_cursor_position(self):
        """Get current cursor position"""
        if not self.cursor:
            return {"x": 0, "y": 0}
        return await self.cursor.get_current_position()

    async def move_cursor_to(self, x: float, y: float, animate: bool = True):
        """Move cursor to specific coordinates"""
        if not self.cursor:
            return False
        
        if animate:
            return await self.cursor.animate_to_position(x, y)
        else:
            return await self.cursor.set_cursor_position(x, y, createTrail=True)

    async def click_with_cursor(self, x: float, y: float, animate: bool = True):
        """Click at position with cursor animation"""
        if not self.cursor:
            await self.page.mouse.click(x, y)
            return True
            
        return await self.cursor.click_at_position(x, y, animate)

    async def click_element_with_cursor(self, locator: str, animate: bool = True):
        """Click element with cursor animation"""
        if not self.cursor:
            await self.page.locator(locator).click()
            return True
            
        return await self.cursor.click_element(locator, animate)

    async def type_in_element_with_cursor(self, locator: str, text: str, animate: bool = True):
        """Type in element with cursor animation and visual feedback"""
        if not self.cursor:
            await self.page.locator(locator).fill(text)
            return True
            
        return await self.cursor.type_in_element(locator, text, animate)

    async def set_cursor_state(self, state: str):
        """Set cursor visual state (normal, typing, hovering, clicked)"""
        if self.cursor:
            return await self.cursor.set_cursor_state(state)
        return False

    async def show_cursor(self, visible: bool = True):
        """Show or hide the cursor"""
        if self.cursor:
            return await self.cursor.set_visibility(visible)
        return False

    async def clear_cursor_trail(self):
        """Clear cursor trail dots"""
        if self.cursor:
            return await self.cursor.clear_trail()
        return False

    # Enhanced mouse actions with cursor tracking
    async def hover_element(self, locator: str, animate: bool = True):
        """Hover over element with cursor animation"""
        if not self.cursor:
            await self.page.locator(locator).hover()
            return True
        
        try:
            # Move cursor to element
            await self.cursor.move_to_element(locator, animate)
            
            # Set hovering state
            await self.cursor.set_cursor_state('hovering')
            
            # Perform hover
            await self.page.locator(locator).hover()
            
            return True
        except Exception as e:
            logger.error(f"Error hovering element: {e}")
            return False

    async def scroll_if_needed(self, x: float, y: float):
        """Scroll the page if the cursor is near the edge of the viewport."""
        if self.auto_scroll_manager:
            await self.auto_scroll_manager.scroll_to_ensure_visibility(x, y)

    # Context manager support
    async def __aenter__(self):
        """Async context manager entry"""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()

    async def close(self):
        """Clean shutdown"""
        if self.cursor:
            await self.cursor.set_visibility(False)
        
        if self.context:
            await self.context.close()
        if self.playwright:
            await self.playwright.stop()
