"""
Auto-scroll manager for ensuring elements are visible.

This is a stub implementation - the full version would handle
automatic scrolling during cursor movements.
"""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from playwright.async_api import Page

logger = logging.getLogger(__name__)


class AutoScrollManager:
    """Manages automatic scrolling to keep elements visible."""
    
    def __init__(self, page: "Page"):
        self.page = page
        self._enabled = True
        self._margin = 100  # Pixels from edge before scrolling
    
    async def scroll_to_ensure_visibility(self, x: float, y: float) -> bool:
        """
        Scroll the page if necessary to ensure the coordinates are visible.
        
        Args:
            x: X coordinate
            y: Y coordinate
            
        Returns:
            True if scrolling was performed
        """
        if not self._enabled:
            return False
        
        try:
            viewport = await self.page.evaluate("""
                () => ({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    scrollX: window.scrollX,
                    scrollY: window.scrollY
                })
            """)
            
            scroll_x = viewport["scrollX"]
            scroll_y = viewport["scrollY"]
            needs_scroll = False
            
            # Check if we need to scroll horizontally
            if x < scroll_x + self._margin:
                scroll_x = max(0, x - self._margin)
                needs_scroll = True
            elif x > scroll_x + viewport["width"] - self._margin:
                scroll_x = x - viewport["width"] + self._margin
                needs_scroll = True
            
            # Check if we need to scroll vertically
            if y < scroll_y + self._margin:
                scroll_y = max(0, y - self._margin)
                needs_scroll = True
            elif y > scroll_y + viewport["height"] - self._margin:
                scroll_y = y - viewport["height"] + self._margin
                needs_scroll = True
            
            if needs_scroll:
                await self.page.evaluate(f"window.scrollTo({scroll_x}, {scroll_y})")
                return True
            
            return False
            
        except Exception as e:
            logger.warning(f"Auto-scroll failed: {e}")
            return False
    
    def set_enabled(self, enabled: bool) -> None:
        """Enable or disable auto-scrolling."""
        self._enabled = enabled
    
    def set_margin(self, margin: int) -> None:
        """Set the margin from edge before scrolling triggers."""
        self._margin = margin
