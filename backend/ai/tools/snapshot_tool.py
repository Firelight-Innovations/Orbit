from langchain_core.tools import tool

from backend.ai.runtime.browser import get_browser
from backend.ai.runtime.snapshot import take_snapshot_yaml


@tool
async def snapshot_page() -> str:
    """
    Capture an AI-ready DOM snapshot of the active page as YAML.
    """
    conn = await get_browser()
    if not conn.page:
        return "No active page to snapshot."
    return await take_snapshot_yaml(conn.page)

