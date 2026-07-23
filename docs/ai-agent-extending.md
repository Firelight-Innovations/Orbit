# Extending the AI Agent

## Add a new tool
1) Implement in `backend/ai/tools/your_tool.py` (use `@tool`).
2) Import and export it from `backend/ai/tools/__init__.py` via `get_all_tools()`.
3) Document it in `docs/ai-agent-tools.md`.
4) (Optional) Add tests or a dry-run script that exercises the tool against a known page.

Example skeleton:
```python
from langchain_core.tools import tool
from backend.ai.runtime.browser import get_browser

@tool
async def browser_scroll(pixels: int = 500) -> str:
    conn = await get_browser()
    if not conn.page:
        return "No active page"
    await conn.page.evaluate(f"window.scrollBy(0, {pixels});")
    return f"Scrolled by {pixels}px"
```

## Add model/provider options
- Update `backend/ai/runtime/config.py` to read new env vars.
- In `backend/ai/agent.py`, branch model creation based on provider (e.g., OpenRouter vs Azure).

## Snapshot changes
- Adjust `backend/ai/config/snapshot.json` for filtering behavior.
- If the DOM script needs changes, edit `backend/fi/static/dom_snapshot.js`; rebuild if needed.

## When to consider IPC instead of CDP
- If CSP blocks injection even with `add_init_script`, add an IPC handler in Electron preload to run `window.__weaveDomSnapshot` and return data, then call that IPC from a new backend tool.

