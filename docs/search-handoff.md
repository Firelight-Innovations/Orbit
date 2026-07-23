# Simplicity search integration — handoff

Landed in PR #7 (merged **last**, after `simplicity-theme` and `agent-tool-events`). Full design
rationale lives in [`search.md`](./search.md); this file is the punch list.

## What changed

- Orbit's search (a Playwright scraper over Google/Bing/DuckDuckGo) is gone. `orbit://search` now
  renders [Simplicity](https://github.com/Blueturboguy07/Simplicity) in a `WebContentsView`.
- Simplicity is **tracked, not copied**: `vendor/` is gitignored, `scripts/sync-simplicity.mjs`
  re-pulls it on every `postinstall`. Nothing of his is committed here.
- Two sidecar processes on loopback ports: SearXNG (via *his* `desktop/searxng.mjs`) and his
  Next.js standalone server. Both owned by `electron/main/services/simplicityService.ts`.
- Inference pinned to OpenRouter; key read from `OPENROUTER_API_KEY` or `backend/.env`.
- Orbit upgraded Electron 31 → 37.
- Deleted: `services/aiSearchService.ts`, `components/Search/SearchPage.tsx`, `docs/ai-search.md`,
  the `aiSearch:run` IPC handler and its preload bridge.

## To do

### 1. Resolve the `simplicity-theme` collision — decision, not a mechanical merge
That branch rethemes `components/Search/SearchPage.tsx` (52 lines); this PR deletes it. Since PR #7
merges last, the file will be **back** in the tree by then. Deleting it is still correct —
`orbit://search` is a view, not a React route, so the component is unreachable dead code. Confirm
nothing else imports it, then delete. Both branches also touch `App.tsx`.

### 2. Verify a packaged build — never tested
Only `npm run dev` was exercised. `package.json` maps three paths out of `vendor/simplicity` into
`resources/simplicity` (`.next/standalone`, `drizzle`, `desktop`); `simplicityService.rootDir`
expects exactly that layout. Run `npm run build:win` and confirm search still starts.

### 3. Verify search actually answers — never tested
No OpenRouter key existed in the dev environment. Everything up to the LLM call is proven
(retrieval reaches "Searching the web"; `/api/providers` returns 7 OpenRouter models + transformers
embeddings, no local providers). Put a real key in `backend/.env` and confirm an answer streams.

### 4. Fix the Python backend — pre-existing, unrelated to search
`backend/app/routers/api.py` dies at import:
`TypeError: Router.__init__() got an unexpected keyword argument 'on_startup'` (Starlette dropped
it). The assistant/agent features are broken, and `PythonBackend.start()` burns its full 90s
timeout on every launch, delaying window creation.

### 5. Fix `tabs:transfer` — pre-existing
`electron/main/ipc.ts:287` calls `findWindowFromWebContents`, which is not defined anywhere. Throws
at runtime. Also `index.ts` has a long-standing `insertCSS(...).catch` type error.

### 6. Optional: unpin Electron
Electron is pinned to **37 from both directions** (see `search.md`): floor is Simplicity's N-API 10
requirement, ceiling is Orbit's own `better-sqlite3@12` prebuilt availability (ABI 136). Migrating
Orbit's SQLite usage to Node 24's built-in `node:sqlite` drops the native dependency and frees the
version entirely.

## Traps — please don't undo these

Each cost real debugging time; all have a comment at the site explaining why.

- **Never leave a `WebContentsView` without a document.** A page target with no document never
  answers `Page.enable`/`Runtime.enable`, and `connect_over_cdp()` auto-attaches to every target
  and blocks on it — hanging *the AI agent's* browser connection, with no symptom anywhere near the
  view that caused it. The search view loads a blank `data:` doc at creation for this reason, same
  as the root window.
- **Don't "fix" a failed vendored install with `yarn --force`.** It triggers a full rebuild, which
  runs `node-gyp` on `better-sqlite3` and needs a C++ toolchain end users don't have. The install
  uses `--ignore-scripts` deliberately: every native dep there ships its own binaries.
- **The build stamp must stay outside the clone.** `sync()` runs `git clean -fd`; a stamp inside
  the tree gets deleted every sync, silently disabling the build cache (symptom: every
  `npm install` rebuilds, ~2min, with no error).
- **Three patches are applied to his tree on each pull** (provider registry, type-check off,
  single build worker). Each fails loudly rather than silently doing nothing. His `desktop` branch
  moves fast, so expect occasional maintenance — that's the cost of tracking upstream live.
- **Server readiness allows 180s.** Not padding: Next binds the port and prints "Ready" *before*
  Drizzle runs migrations through synchronous `better-sqlite3`, so it's bound but unresponsive
  meanwhile. 60s lost that race on a cold machine.

## First-run costs (expected, not bugs)

`npm install` builds his Next app (minutes, few hundred MB). First *launch* provisions a
relocatable CPython + SearXNG (~150MB) into `userData`. Both one-time; deleting
`<userData>/simplicity` fully resets search.
