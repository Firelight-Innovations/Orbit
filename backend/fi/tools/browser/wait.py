import asyncio
from agents import function_tool

@function_tool
async def wait(milliseconds: int) -> bool:
    """
    Waits for the specified number of milliseconds.
    
    Args:
        milliseconds (int): Number of milliseconds to wait

    Returns:
        bool: Returns True when done waiting.
    """
    # Convert milliseconds to seconds since asyncio.sleep() expects seconds
    seconds = milliseconds / 1000
    await asyncio.sleep(seconds)
    return True
