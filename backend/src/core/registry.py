"""
Lightweight in-process registry for shared singletons (browser, settings, etc.).

This module provides a simple key-value store for sharing objects across
the agent system, particularly the BrowserInstance.
"""

from typing import Any

_store: dict[str, Any] = {}


def get(key: str) -> Any:
    """Get a value from the registry."""
    return _store.get(key)


def set(key: str, value: Any) -> None:
    """Set a value in the registry."""
    _store[key] = value


def has(key: str) -> bool:
    """Check if a key exists in the registry."""
    return key in _store


def delete(key: str) -> bool:
    """Delete a key from the registry. Returns True if key existed."""
    if key in _store:
        del _store[key]
        return True
    return False


def clear() -> None:
    """Clear all entries from the registry."""
    _store.clear()
