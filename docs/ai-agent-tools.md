# AI Agent Tool Reference

Tools are LangChain `@tool` wrappers over the live Electron browser (via CDP).

## Available tools
- `browser_click(ref_id, intent?)` – Click element by `ref` from DOM snapshot.
- `browser_type(ref_id, text, submit=False)` – Fill text by `ref`; optionally press Enter.
- `browser_key_press(key)` – Press a key on the active page.
- `browser_navigate(url, timeout_ms=30000)` – Navigate active page.
- `browser_list_tabs()` – List open tabs (index, title, URL).
- `browser_new_tab(url="https://google.com")` – Open a new tab.
- `browser_select_tab(index=0)` – Focus tab by index.
- `browser_close_tab(index=0)` – Close tab by index.
- `snapshot_page()` – Return YAML DOM snapshot (uses injected `dom_snapshot.js`).

## Usage guidance
- Prefer `ref` values from snapshots for reliable targeting.
- Call `snapshot_page()` before acting if the DOM changed since the last action.
- Navigation sets the active page; if multiple contexts exist, `browser_select_tab` sets `conn.page` used by other tools.
- Timeouts: `browser_navigate` uses `wait_until="load"`; heavy pages may still be loading resources—re-snapshot if needed.

## Common flows
- Inspect page: `snapshot_page` → LLM summarizes → choose refs → `browser_click`/`browser_type`.
- Multi-tab: `browser_list_tabs` → `browser_select_tab` → `snapshot_page` → act.
- Recovery: If a tool returns “ref not found”, re-run `snapshot_page` to refresh references.

## Limits / caveats
- CSP/Trusted Types pages may block runtime injection; retry after navigation so `add_init_script` runs earlier. If still blocked, consider adding an IPC-based snapshot path in Electron preload.
- Cross-origin iframes may not be fully captured by the snapshot script.

