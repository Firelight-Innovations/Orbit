"""
Tool execution queue for the Fi agent.

This module manages the execution of browser tools, providing
a queue-based system for tool calls.
"""

import asyncio
import logging
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

# Global tool queue instance
_tool_queue: "ToolQueue | None" = None


class ToolQueue:
    """Queue for managing tool execution with callbacks."""
    
    def __init__(self):
        self._tools: dict[str, Callable[..., Coroutine[Any, Any, Any]]] = {}
        self._lock = asyncio.Lock()
    
    def register_tool(self, name: str, func: Callable[..., Coroutine[Any, Any, Any]]) -> None:
        """Register a tool function by name."""
        self._tools[name] = func
        logger.debug(f"Registered tool: {name}")
    
    async def add_tool_call(self, tool_name: str, **kwargs) -> str:
        """
        Execute a tool and return its result.
        
        Args:
            tool_name: Name of the registered tool
            **kwargs: Arguments to pass to the tool
            
        Returns:
            Tool execution result as a string
        """
        async with self._lock:
            if tool_name not in self._tools:
                return f"Error: Tool '{tool_name}' not registered"
            
            try:
                tool_func = self._tools[tool_name]
                result = await tool_func(**kwargs)
                return str(result) if result is not None else "Success"
            except Exception as e:
                logger.error(f"Tool '{tool_name}' failed: {e}")
                return f"Error executing {tool_name}: {e}"
    
    def get_registered_tools(self) -> list[str]:
        """Get list of registered tool names."""
        return list(self._tools.keys())


async def initialize_tool_queue() -> ToolQueue:
    """Initialize and return the global tool queue."""
    global _tool_queue
    if _tool_queue is None:
        _tool_queue = ToolQueue()
    return _tool_queue


def get_tool_queue() -> ToolQueue:
    """Get the global tool queue instance."""
    global _tool_queue
    if _tool_queue is None:
        _tool_queue = ToolQueue()
    return _tool_queue
