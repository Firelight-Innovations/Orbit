import asyncio
import json
import random
import time
from src.core.config import get_weave_config

from playwright_stealth import stealth_async

from src.core import registry
from src.browser.instance import BrowserInstance
from src.core import memory


def _parse_delay_range(delay_range: str) -> (float, float):
    """Parses a delay range string like "0.5-2.0s" into a tuple of floats."""
    delay_range = delay_range.replace("s", "")
    min_delay, max_delay = map(float, delay_range.split('-'))
    return min_delay, max_delay


async def _human_like_scroll(page, start_x, start_y, target_x, target_y):
    """Perform human-like scrolling with gradual movement"""
    steps = random.randint(8, 15)
    for i in range(steps):
        progress = (i + 1) / steps
        # Use easing for more natural movement
        eased_progress = 1 - (1 - progress) ** 2
        
        current_x = start_x + (target_x - start_x) * eased_progress
        current_y = start_y + (target_y - start_y) * eased_progress
        
        await page.evaluate(f"window.scrollTo({current_x}, {current_y})")
        await asyncio.sleep(random.uniform(0.02, 0.08))


async def _human_like_mouse_movement(page, start_x, start_y, target_x, target_y):
    """Create curved, human-like mouse movement"""
    config = get_weave_config()
    timing_config = config.interaction_timing
    speed_multiplier = timing_config.speed_multiplier

    steps = random.randint(12, 25)
    
    # Add some curve to the movement
    control_x = (start_x + target_x) / 2 + random.uniform(-50, 50)
    control_y = (start_y + target_y) / 2 + random.uniform(-30, 30)
    
    for i in range(steps):
        t = (i + 1) / steps
        
        # Quadratic Bezier curve for natural movement
        current_x = (1-t)**2 * start_x + 2*(1-t)*t * control_x + t**2 * target_x
        current_y = (1-t)**2 * start_y + 2*(1-t)*t * control_y + t**2 * target_y
        
        _instance: BrowserInstance = registry.get('browser_instance')

        await _instance.scroll_if_needed(current_x, current_y)
        await page.mouse.move(current_x, current_y)
        await asyncio.sleep(random.uniform(0.008, 0.025) / speed_multiplier)