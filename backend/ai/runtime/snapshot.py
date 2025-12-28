import json
import os
from typing import Any, Dict

import yaml
from playwright.async_api import Page

from .config import get_settings


def _dom_snapshot_js() -> str:
    base = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "fi", "static", "dom_snapshot.js")
    )
    with open(base, "r", encoding="utf-8") as f:
        return f.read()


def _load_snapshot_config() -> Dict[str, Any]:
    settings = get_settings()
    with open(settings.snapshot_config_path, "r", encoding="utf-8") as f:
        return json.load(f)


async def inject_snapshot_runtime(page: Page) -> None:
    """
    Ensure the dom snapshot runtime is available on the page.
    Uses both add_init_script (persistent) and a one-shot evaluate for the current page.
    """
    dom_js = _dom_snapshot_js()
    try:
        await page.context.add_init_script(dom_js)
    except Exception:
        pass
    try:
        await page.evaluate(dom_js)
    except Exception:
        # Some pages (CSP) may block this; best-effort
        pass


async def take_snapshot_yaml(page: Page) -> str:
    """
    Take an accessibility-oriented snapshot and return YAML for LLM consumption.
    """
    await inject_snapshot_runtime(page)

    has_fn = False
    try:
        has_fn = await page.evaluate("() => typeof window.__weaveDomSnapshot === 'function'")
    except Exception:
        has_fn = False

    if not has_fn:
        return "Snapshot runtime unavailable on page."

    cfg = _load_snapshot_config()
    data = await page.evaluate("window.__weaveDomSnapshot", cfg)
    formatted = yaml.dump(data, sort_keys=False, default_flow_style=False)
    return f"```yaml\n{formatted}```"

