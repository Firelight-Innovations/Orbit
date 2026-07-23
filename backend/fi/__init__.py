# Fi Agent package
# Lazy import to avoid startup failures

__all__ = ["agent", "run"]


def __getattr__(name):
    """Lazy import to avoid import errors at startup."""
    if name == "agent":
        from . import agent as _agent
        return _agent
    elif name == "run":
        from .agent import run as _run
        return _run
    raise AttributeError(f"module 'fi' has no attribute '{name}'")

