"""
Memory module for the Fi agent.

Provides simple in-memory storage for agent state.
"""

from typing import Any

_memory: dict[str, Any] = {}


def get(key: str, default: Any = None) -> Any:
    """Get a value from memory."""
    return _memory.get(key, default)


def set(key: str, value: Any) -> None:
    """Set a value in memory."""
    _memory[key] = value


def has(key: str) -> bool:
    """Check if a key exists in memory."""
    return key in _memory


def delete(key: str) -> bool:
    """Delete a key from memory."""
    if key in _memory:
        del _memory[key]
        return True
    return False


def clear() -> None:
    """Clear all memory."""
    _memory.clear()


def get_all() -> dict[str, Any]:
    """Get all memory contents."""
    return _memory.copy()
