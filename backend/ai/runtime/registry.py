"""
Lightweight in-process registry for shared singletons (browser, settings, etc.).
"""

_store: dict[str, object] = {}


def get(key: str):
    return _store.get(key)


def set(key: str, value: object) -> None:
    _store[key] = value

