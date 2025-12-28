import os
from dataclasses import dataclass


@dataclass
class Settings:
    openrouter_api_key: str
    model: str
    cdp_port: int
    headless: bool
    snapshot_config_path: str


_settings: Settings | None = None


def _bool_env(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"1", "true", "yes", "on"}


def get_settings() -> Settings:
    global _settings
    if _settings:
        return _settings

    _settings = Settings(
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY", ""),
        model=os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet"),
        cdp_port=int(os.getenv("AI_CDP_PORT", "9222")),
        headless=_bool_env("AI_HEADLESS", False),
        snapshot_config_path=os.getenv(
            "AI_SNAPSHOT_CONFIG",
            os.path.abspath(
                os.path.join(
                    os.path.dirname(__file__),
                    "..",
                    "config",
                    "snapshot.json",
                )
            ),
        ),
    )
    return _settings

