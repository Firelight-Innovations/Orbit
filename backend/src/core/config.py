"""
Configuration module for the Fi agent.

Provides configuration loading and access.
"""

import os
from dataclasses import dataclass, field
from typing import Any

# Cached config instance
_config: "WeaveConfig | None" = None


@dataclass
class ModelEscalation:
    """Model escalation configuration."""
    default_level: str = "standard"
    levels: dict[str, dict[str, Any]] = field(default_factory=lambda: {
        "standard": {
            "model": "anthropic/claude-sonnet-4-20250514",
            "max_tokens": 4096,
        },
        "advanced": {
            "model": "anthropic/claude-sonnet-4-20250514",
            "max_tokens": 8192,
        }
    })


@dataclass
class SnapshotConfig:
    """DOM snapshot configuration."""
    max_depth: int = 50
    include_hidden: bool = False
    include_scripts: bool = False
    include_styles: bool = False
    selector_types: list[str] = field(default_factory=lambda: [
        "landmarks", "inputs", "buttons", "links", "selects"
    ])


@dataclass
class WeaveConfig:
    """Main configuration for the Fi agent."""
    model_escalation: ModelEscalation = field(default_factory=ModelEscalation)
    snapshot: SnapshotConfig = field(default_factory=SnapshotConfig)
    cdp_port: int = 9222
    openrouter_api_key: str = ""
    debug: bool = False
    
    def __post_init__(self):
        # Load API key from environment
        self.openrouter_api_key = os.environ.get("OPENROUTER_API_KEY", "")


def get_weave_config() -> WeaveConfig:
    """Get the global configuration instance."""
    global _config
    if _config is None:
        _config = WeaveConfig()
    return _config


def reload_config() -> WeaveConfig:
    """Reload configuration from environment."""
    global _config
    _config = WeaveConfig()
    return _config
