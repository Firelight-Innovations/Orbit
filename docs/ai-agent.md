# AI Web Agent (LangChain + OpenRouter + Live Electron Browser)

## What it is
- A new `backend/ai/` module that reuses Fi tools but runs a LangChain ReAct agent backed by OpenRouter models.
- It attaches to the user’s live Electron Chromium instance via CDP (`remote-debugging-port` already set to 9222) instead of launching headless Playwright.
- It can capture DOM snapshots using `dom_snapshot.js` for ref-based actions.

## How it works (flow)
1) Electron starts with `--remote-debugging-port=9222` (see `electron/main/index.ts`).
2) Backend calls `playwright.chromium.connect_over_cdp` to attach to the running browser (see `backend/ai/runtime/browser.py`).
3) Tools operate on the connected page (click/type/navigate/tabs) and can inject `dom_snapshot.js` to get an AI-ready snapshot (see `backend/ai/runtime/snapshot.py`).
4) LangChain ReAct agent orchestrates tools using OpenRouter LLM (see `backend/ai/agent.py`).
5) FastAPI exposes `/api/ai/*` endpoints for connect/run/snapshot/disconnect (see `backend/ai/router.py`).

## Endpoints
- `POST /api/ai/connect` `{ "port": 9222? }` – attach to browser.
- `POST /api/ai/run` `{ "task": "describe the page" }` – run agent.
- `GET /api/ai/snapshot` – return YAML snapshot of current page.
- `POST /api/ai/disconnect` – close the CDP connection.

## Configuration
- Env:
  - `OPENROUTER_API_KEY` – required.
  - `OPENROUTER_MODEL` – e.g. `anthropic/claude-3.5-sonnet`.
  - `AI_CDP_PORT` – defaults to `9222`.
  - `AI_HEADLESS` – defaults to false (unused for CDP attach, but reserved).
  - `AI_SNAPSHOT_CONFIG` – override snapshot config path if needed.
- Files:
  - `backend/ai/config/snapshot.json` – snapshot settings.
  - `backend/fi/static/dom_snapshot.js` – injected into pages.

## Directory map
- `backend/ai/runtime/` – config, registry, CDP attach, snapshot injector.
- `backend/ai/tools/` – LangChain tool wrappers (click/type/navigate/tabs/snapshot).
- `backend/ai/agent.py` – LangChain agent using OpenRouter.
- `backend/ai/router.py` – FastAPI endpoints.
- `docs/ai-agent*.md` – docs set.

## Quickstart (dev)
1) Ensure Electron runs with remote debugging (already set in `index.ts`).
2) Export `OPENROUTER_API_KEY` and optionally `OPENROUTER_MODEL`.
3) Start backend (`uvicorn backend.app.main:app --reload`).
4) Call `POST /api/ai/connect`.
5) Call `GET /api/ai/snapshot` to verify DOM snapshot works.
6) Call `POST /api/ai/run` with a simple task, e.g. “list the links on the page”.

## Troubleshooting
- “Snapshot runtime unavailable”: the page blocked injection (CSP/Trusted Types). Try navigating again so `add_init_script` runs before load, or fall back to IPC-based injection if needed.
- “Tab index not found”: ensure the target tab exists; use `browser_list_tabs` tool to see indexes.
- Empty snapshot: the page may be blank or cross-origin iframes are blocking access.

## Extending
- Add new tools in `backend/ai/tools/` and export them via `get_all_tools()`.
- Update docs in `docs/ai-agent-tools.md` and `docs/ai-agent-extending.md` when adding tools.

