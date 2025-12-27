import asyncio
import random
import string
from playwright.async_api import Page, Error
from src.core.config import get_weave_config
from typing import Tuple

def _parse_typing_speed(typing_speed: str) -> Tuple[float, float]:
    """Parses a typing speed string like "50-150ms_per_char" into a tuple of floats."""
    typing_speed = typing_speed.replace("ms_per_char", "")
    min_speed, max_speed = map(float, typing_speed.split('-'))
    return min_speed, max_speed

async def human_like_typing(
    page: Page,
    selector: str,
    text: str,
    base_delay: float = 0.08,
    variation_factor: float = 0.6,
    word_pause_chance: float = 0.15,
    thinking_pause_chance: float = 0.05,
) -> None:
    """
    Types `text` into the element with human-like timing patterns to avoid bot detection.
    
    Optimized for performance while maintaining natural typing behavior including:
    - Variable typing speeds based on character type
    - Occasional word pauses and thinking pauses
    - Realistic keystroke timing variations
    
    Args
    ----
    page : Page
        A Playwright ``Page`` object that is already on the desired URL.
    selector : str
        Any selector Playwright understands (CSS, text, XPath, etc.).
    text : str
        The text to type.
    base_delay : float, optional
        Base delay (seconds) between keystrokes. Default = 0.08.
    variation_factor : float, optional
        Factor for delay variation (0-1). Higher = more variation. Default = 0.6.
    word_pause_chance : float, optional
        Probability (0-1) of pausing after completing a word. Default = 0.15.
    thinking_pause_chance : float, optional
        Probability (0-1) of longer thinking pauses. Default = 0.05.
    
    Raises
    ------
    ValueError
        If parameters are invalid or the element cannot be found.
    """
    config = get_weave_config()
    timing_config = config.interaction_timing
    speed_multiplier = timing_config.speed_multiplier
    
    # Get typing speed from config
    typing_speed = timing_config.base_delays["typing_speed"]
    min_speed, max_speed = _parse_typing_speed(typing_speed)
    
    # Apply humanization level
    if timing_config.humanization_level == "none":
        # Type instantly
        delay_per_char = 0
    else:
        # Use config-based timing
        delay_per_char = (random.uniform(min_speed, max_speed) / 1000) / speed_multiplier  # Convert ms to seconds
    
    # Validate parameters
    if base_delay < 0:
        raise ValueError("base_delay must be non-negative.")
    if not (0 <= variation_factor <= 1):
        raise ValueError("variation_factor must be between 0 and 1.")
    if not (0 <= word_pause_chance <= 1):
        raise ValueError("word_pause_chance must be between 0 and 1.")
    if not (0 <= thinking_pause_chance <= 1):
        raise ValueError("thinking_pause_chance must be between 0 and 1.")

    if not text:
        return

    # Use Playwright's optimized locator approach
    locator = page.locator(selector)
    
    # Verify element exists and is visible
    try:
        await locator.wait_for(state="visible", timeout=3000)
    except Exception:
        raise ValueError(f"Element with selector '{selector}' not found or not visible.")

    # Pre-calculate character-specific delays for better performance
    def get_char_delay(char: str, base: float) -> float:
        """Calculate delay based on character type for realistic typing"""
        if char in string.punctuation:
            # Punctuation typically typed slower
            multiplier = random.uniform(1.2, 1.8)
        elif char.isdigit():
            # Numbers typed at moderate speed
            multiplier = random.uniform(0.9, 1.3)
        elif char.isupper():
            # Capital letters (with shift) take slightly longer  
            multiplier = random.uniform(1.1, 1.4)
        elif char == ' ':
            # Spaces are quick but have word pause potential
            multiplier = random.uniform(0.3, 0.7)
        else:
            # Regular lowercase letters
            multiplier = random.uniform(0.8, 1.2)
        
        # Apply variation factor
        variation = random.uniform(-variation_factor, variation_factor)
        return base * multiplier * (1 + variation)

    # Use Playwright's pressSequentially for better performance with chunking
    # Process text in chunks to balance performance with human-like behavior
    chunk_size = min(len(text), 10)  # Process up to 10 characters at once
    i = 0
    
    while i < len(text):
        # Determine chunk end (break at word boundaries when possible)
        chunk_end = min(i + chunk_size, len(text))
        
        # Try to break at word boundary for more natural pauses
        if chunk_end < len(text) and not text[chunk_end-1].isspace():
            # Look for nearest space within reasonable distance
            for j in range(chunk_end-1, max(i, chunk_end-5), -1):
                if text[j].isspace():
                    chunk_end = j + 1
                    break
        
        chunk = text[i:chunk_end]
        
        # Calculate average delay for this chunk
        avg_delay = sum(get_char_delay(char, delay_per_char) for char in chunk) / len(chunk)
        
        # Use pressSequentially for the chunk (much faster than character-by-character)
        await locator.press_sequentially(
            chunk, 
            delay=int(avg_delay * 1000)  # Convert to milliseconds
        )
        
        # Add human-like pauses after chunks
        if chunk_end < len(text):
            # Check for word completion pause
            if chunk.endswith(' ') and random.random() < word_pause_chance:
                await asyncio.sleep(random.uniform(0.1, 0.3) / speed_multiplier)
            
            # Occasional thinking pause
            elif random.random() < thinking_pause_chance:
                await asyncio.sleep(random.uniform(0.2, 0.8) / speed_multiplier)
            
            # Small inter-chunk delay
            else:
                await asyncio.sleep(random.uniform(0.01, 0.05) / speed_multiplier)
        
        i = chunk_end
