import asyncio
import os
import pathlib
import platform
import random
import logging
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async
from src.visualization.cursor import PlaywrightBotCursor
from src.browser.auto_scroll import AutoScrollManager
from typing import List

logger = logging.getLogger(__name__)

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
            version = await self.browser.version()
            return version is not None
        except Exception:
            return False

    def _get_user_data_dir(self):
        """Get realistic user data directory based on OS"""
        system = platform.system()
        if system == "Windows":
            base_dir = os.environ.get('LOCALAPPDATA', os.path.expanduser('~\AppData\Local'))
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
        await stealth_async(self.page)
        
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
            return await self.cursor.animate_to_position(x, y, duration=300, showTrail=True)
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
