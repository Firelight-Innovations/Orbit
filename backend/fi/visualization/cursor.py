import asyncio
import json
import math
from typing import Dict, Any, Optional, Tuple, List
from playwright.async_api import Page, ElementHandle
import logging

logger = logging.getLogger(__name__)

# Glide timing. A fixed duration makes short hops crawl and long sweeps look
# rushed, so the travel time scales with distance between these bounds.
MIN_MOVE_MS = 220
MAX_MOVE_MS = 900
PIXELS_PER_MS = 1.6


class PlaywrightBotCursor:
    """
    Integration class for controlling the bot cursor visual indicator
    from Playwright automation scripts with add_init_script() injection.
    """

    def __init__(self, page: Page):
        self.page = page
        self.is_initialized = False
        self.last_known_position = {"x": 0, "y": 0}
        self._script_injected = False

    def _duration_for(self, x: float, y: float) -> int:
        """Travel time for a glide to (x, y), scaled by how far it has to go."""
        dx = x - self.last_known_position.get("x", 0)
        dy = y - self.last_known_position.get("y", 0)
        distance = math.hypot(dx, dy)
        return int(max(MIN_MOVE_MS, min(MAX_MOVE_MS, distance / PIXELS_PER_MS)))

    async def initialize(self):
        """Initialize the cursor system"""
        try:
            # Check if botCursorAPI is available
            result = await self.page.evaluate("typeof window.botCursorAPI !== 'undefined'")
            self.is_initialized = result
            return self.is_initialized
        except Exception as e:
            logger.error(f"Cursor initialization failed: {e}")
            self.is_initialized = False
            return False

    async def ensure_cursor_ready(self, max_retries: int = 3) -> bool:
        """
        Ensure the cursor system is ready, with retries.
        
        Args:
            max_retries: Number of times to retry initialization
            
        Returns:
            True if cursor is ready, False otherwise
        """
        for attempt in range(max_retries):
            if await self.initialize():
                return True
            await asyncio.sleep(0.1 * (attempt + 1))
        return False

    async def set_cursor_position(self, x: float, y: float, createTrail: bool = False) -> bool:
        """Set cursor position directly (alias for set_position)."""
        await self.set_position(x, y)
        return True
    
    async def set_position(self, x: float, y: float, suppress_duration: int = 150):
        """Set cursor position with automatic suppression"""
        if not self.is_initialized:
            await self.initialize()
            
        try:
            self.last_known_position = {"x": x, "y": y}
            await self.page.evaluate("""
                (coords) => {
                    if (window.botCursorAPI) {
                        window.botCursorAPI.setCursorPosition(coords.x, coords.y, {
                            type: 'programmatic',
                            suppressDuration: coords.suppressDuration
                        });
                    }
                }
            """, {"x": x, "y": y, "suppressDuration": suppress_duration})
        except Exception as e:
            logger.error(f"Error setting cursor position: {e}")
    
    async def animate_to_position(self, x: float, y: float, duration: int | None = None,
                                show_trail: bool = False, suppress_duration: int = 200):
        """Glide the cursor to a position with eased motion.

        `duration` defaults to a distance-scaled travel time so the cursor
        visibly moves from where it is to the target instead of jumping.
        """
        if not self.is_initialized:
            await self.initialize()

        if duration is None:
            duration = self._duration_for(x, y)

        try:
            self.last_known_position = {"x": x, "y": y}
            result = await self.page.evaluate("""
                async (params) => {
                    if (window.botCursorAPI) {
                        return await window.botCursorAPI.animateToPosition(
                            params.x, 
                            params.y, 
                            params.duration, 
                            {
                                showTrail: params.showTrail,
                                suppressDuration: params.suppressDuration
                            }
                        );
                    }
                    return null;
                }
            """, {
                "x": x, 
                "y": y, 
                "duration": duration, 
                "showTrail": show_trail,
                "suppressDuration": suppress_duration
            })
            return result
        except Exception as e:
            logger.error(f"Error animating cursor: {e}")
            return None
    
    async def suppress_mouse_following(self, suppress: bool, duration: int = 0):
        """Manually control mouse following suppression"""
        if not self.is_initialized:
            await self.initialize()
            
        try:
            await self.page.evaluate("""
                (params) => {
                    if (window.botCursorAPI) {
                        window.botCursorAPI.suppressMouseFollowing(params.suppress, params.duration);
                    }
                }
            """, {"suppress": suppress, "duration": duration})
        except Exception as e:
            logger.error(f"Error controlling mouse suppression: {e}")
    
    async def get_current_position(self):
        """Get current cursor position"""
        if not self.is_initialized:
            await self.initialize()
            
        try:
            position = await self.page.evaluate("""
                () => {
                    if (window.botCursorAPI) {
                        return window.botCursorAPI.getCurrentPosition();
                    }
                    return {x: 0, y: 0, timestamp: 0, type: 'unknown'};
                }
            """)
            if position and position.get('x') is not None:
                self.last_known_position = {"x": position['x'], "y": position['y']}
            return position
        except Exception as e:
            logger.error(f"Error getting cursor position: {e}")
            return {"x": self.last_known_position['x'], "y": self.last_known_position['y'], "timestamp": 0, "type": "unknown"}
    
    async def set_cursor_state(self, state: str):
        """Set cursor visual state"""
        if not self.is_initialized:
            await self.initialize()
            
        try:
            await self.page.evaluate("""
                (state) => {
                    if (window.botCursorAPI) {
                        window.botCursorAPI.setCursorState(state);
                    }
                }
            """, state)
        except Exception as e:
            logger.error(f"Error setting cursor state: {e}")
    
    async def trigger_click_feedback(self):
        """Trigger click animation"""
        if not self.is_initialized:
            await self.initialize()
            
        try:
            await self.page.evaluate("""
                () => {
                    if (window.botCursorAPI) {
                        window.botCursorAPI.triggerClick();
                    }
                }
            """)
        except Exception as e:
            logger.error(f"Error triggering click feedback: {e}")
    
    async def clear_trail(self):
        """Clear cursor trail"""
        if not self.is_initialized:
            await self.initialize()
            
        try:
            await self.page.evaluate("""
                () => {
                    if (window.botCursorAPI) {
                        window.botCursorAPI.clearTrail();
                    }
                }
            """)
        except Exception as e:
            logger.error(f"Error clearing trail: {e}")

    async def click_at_position(self, x: float, y: float, animate: bool = True) -> bool:
        """Move cursor and perform click with visual feedback"""
        try:
            # Move to position (with or without animation)
            if animate:
                await self.animate_to_position(x, y)
            else:
                await self.set_position(x, y)

            # Trigger visual click feedback
            await self.trigger_click_feedback()
            
            # Perform actual click
            await self.page.mouse.click(x, y)
            
            return True
        except Exception as e:
            logger.error(f"Error clicking at position: {e}")
            return False

    async def set_visibility(self, visible: bool) -> bool:
        """Show or hide the cursor"""
        if not self.is_initialized:
            await self.initialize()

        try:
            await self.page.evaluate("""
                (visible) => {
                    if (window.botCursorAPI) {
                        window.botCursorAPI.setVisibility(visible);
                    }
                }
            """, visible)
            return True
        except Exception as e:
            logger.error(f"Error setting cursor visibility: {e}")
            return False

    # --- Element-based operations ---
    
    async def move_to_element(self, locator, animate: bool = True) -> Dict[str, float]:
        """Move cursor to the center of an element"""
        try:
            # Get element bounding box
            element = self.page.locator(locator)
            bounds = await element.bounding_box()
            
            if not bounds:
                logger.warning(f"Could not get bounds for element: {locator}")
                return self.last_known_position
                
            # Calculate center position
            center_x = bounds['x'] + bounds['width'] / 2
            center_y = bounds['y'] + bounds['height'] / 2
            
            # Move cursor
            if animate:
                return await self.animate_to_position(center_x, center_y)
            else:
                await self.set_position(center_x, center_y)
                return {"x": center_x, "y": center_y}
                
        except Exception as e:
            logger.error(f"Error moving to element: {e}")
            return self.last_known_position
    
    async def click_element(self, locator, animate: bool = True) -> bool:
        """Click an element with cursor animation"""
        try:
            # Move to element
            position = await self.move_to_element(locator, animate)
            
            # Set hovering state
            await self.set_cursor_state('hovering')
            await asyncio.sleep(0.2)
            
            # Click with feedback
            await self.trigger_click_feedback()
            await self.page.locator(locator).click()
            
            # Reset state
            await self.set_cursor_state('normal')
            
            return True
        except Exception as e:
            logger.error(f"Error clicking element: {e}")
            return False
    
    async def type_in_element(self, locator, text: str, animate: bool = True) -> bool:
        """Type in an element with cursor animation and typing state"""
        try:
            # Move to element and click
            await self.move_to_element(locator, animate)
            await self.click_element(locator, animate=False)
            
            # Set typing state
            await self.set_cursor_state('typing')
            
            # Type text
            await self.page.locator(locator).fill(text)
            
            # Reset state
            await self.set_cursor_state('normal')
            
            return True
        except Exception as e:
            logger.error(f"Error typing in element: {e}")
            return False
    
    # --- Context manager support ---
    
    async def __aenter__(self):
        """Async context manager entry"""
        await self.initialize()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.set_visibility(False)


# --- Usage Examples ---
'''
async def example_usage():
    """Example of how to use the EnhancedCursor"""
    from playwright.async_api import async_playwright
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        # Initialize bot cursor
        cursor = EnhancedCursor(page)
        
        # In a real scenario, the bot cursor script is injected via add_init_script
        # For standalone example, you might need to inject it manually.
        
        # Navigate to a page
        await page.goto("https://example.com")
        
        # Use the cursor
        async with cursor:
            # Get current position
            pos = await cursor.get_current_position()
            print(f"Current position: {pos}")
            
            # Animate to a position
            await cursor.animate_to_position(300, 200, duration=1000, show_trail=True)
            
            # Click an element
            await cursor.click_element("h1")
            
            # Suppress mouse following for 2 seconds
            await cursor.suppress_mouse_following(True, 2000)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(example_usage())
'''