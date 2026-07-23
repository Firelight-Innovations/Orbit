# Orbit Search (Simplicity)

Orbit's search is [Simplicity](https://github.com/Blueturboguy07/Simplicity), embedded and run
locally. It replaces the previous multi-engine scraper (`aiSearchService.ts`), which drove hidden
Playwright tabs against Google/Bing/DuckDuckGo and parsed their result HTML.

## Why it's vendored, not copied

Simplicity is a separate project on its own release cadence. Orbit tracks it rather than absorbing
it: **nothing from that repo is committed here.** `vendor/` is gitignored, so a clone of Orbit
carries no copy of his code — only the URL and the commit we last built.

`scripts/sync-simplicity.mjs` runs on `postinstall`, so `npm install` always pulls his latest:

1. clone (or fast-forward) `vendor/simplicity` from the `desktop` branch
2. disable the local-model providers (see below)
3. `yarn install && yarn build:desktop`, producing `.next/standalone`

Step 3 is skipped when the built tree already matches the checked-out commit, so repeat installs
are fast. `ORBIT_SKIP_SIMPLICITY=1` bypasses the whole thing; `npm run sync:simplicity` runs it on
demand. An install that can't reach GitHub keeps the previously built tree rather than failing.

> **First `npm install` takes several minutes** and pulls a few hundred MB of `node_modules`.
> The first *launch* then downloads ~150MB more (see SearXNG below). Both are one-time.

### Why the install uses `--ignore-scripts`

This is load-bearing, not caution. `better-sqlite3` ships prebuilt N-API binaries in `prebuilds/`
and needs no compilation — but it also ships a `binding.gyp` and declares no install script, and
npm/yarn treat that combination as an implicit `node-gyp rebuild`. That compile needs a full C++
toolchain (Visual Studio on Windows), which end users won't have, and **its failure aborts the
entire install even though the binary it would produce is already in the package.**

Skipping scripts is safe because every native dependency here carries its own binaries:
`better-sqlite3` in `prebuilds/`, `onnxruntime-node` (the embedding runtime) in `bin/napi-v3/`,
`esbuild` and `sharp` via their per-platform optional packages. What's left are funding notices.

Do **not** "fix" a failed install by retrying with `yarn --force`. That flag makes yarn rebuild all
packages, which forces exactly the `node-gyp` compile described above and turns a transient
network failure into a hard one.

## Runtime shape

Two child processes, both on loopback ports, both owned by Orbit's main process
(`electron/main/services/simplicityService.ts`):

| Process | What it is | Started by |
|---|---|---|
| SearXNG | Python/Flask meta-search — Simplicity's retrieval backend | his `desktop/searxng.mjs`, called by us |
| Simplicity | Next.js standalone server (`server.js`) | us, via `ELECTRON_RUN_AS_NODE` |

SearXNG's lifecycle is delegated to **his** `desktop/searxng.mjs` rather than reimplemented. That
module carries platform fixes we'd otherwise have to rediscover and then maintain against his
updates — Windows has no `pwd` module, SearXNG's `version.py` shells out to `git`. It needs no
Docker and nothing on `PATH`: it downloads a relocatable CPython and pip-installs SearXNG into
`<userData>/simplicity/searxng` on first run (the ~150MB above).

Electron ships no separate `node` binary, so the Next server is spawned by re-exec'ing Electron
itself with `ELECTRON_RUN_AS_NODE=1`.

Everything lives under `<userData>/simplicity`, so **deleting that directory fully resets search.**

## UI integration

`orbit://search` is the only internal page backed by a real `WebContentsView` — every other
`orbit://` page is a React route. The view is created per-window in `createWindow`, sits at the
same layer as tab views (below the UI chrome), and is reconciled by `syncSearchView()`, which is
called from `showTabView` / `hideAllTabViews` so every navigation path stays consistent.

The omnibox already builds `orbit://search?q=<query>` (`config/searchEngines.ts`). That `q` maps
straight onto Simplicity's own `/?q=` deep link, which its `ChatProvider` auto-submits — so typing
in the address bar lands on results, not an empty prompt.

In the renderer, `App.tsx` treats `orbit://search` as *not* internal, so it renders the same
click-to-focus placeholder used for external pages and clicks reach the view underneath.

Links clicked inside search open as real Orbit tabs rather than popup windows.

## Inference: OpenRouter only

Orbit owns inference. On every launch `seedConfig()` writes
`<userData>/simplicity/data/config.json` with:

- an **OpenRouter** provider — Simplicity's OpenAI-compatible provider pointed at
  `https://openrouter.ai/api/v1`, using the same key as the rest of Orbit. The key is read from
  `OPENROUTER_API_KEY` if exported, otherwise from **`backend/.env`**, which is the file the Python
  side already loads (`app/main.py` calls `load_dotenv` on it). Search is not a second place to
  configure a key
- a curated chat-model list. Simplicity's OpenAI provider returns *no* default models when the
  base URL isn't `api.openai.com`, so without this the model picker would be empty and no search
  could run
- `setupComplete: true`, so his onboarding screen never appears

Providers are reconciled by hash (matching his `hashObj`) rather than appended, so a rotated key
replaces the old provider instead of stacking a second one beside it. Models and settings the user
changes in the embedded UI survive the next launch.

The child process's environment is also **scrubbed of every provider env var** Simplicity
auto-configures from (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, …).
Without that, a developer with one of those already exported would silently get extra providers in
the model picker, billed to a key Orbit never chose. `OPENAI_API_KEY`/`OPENAI_BASE_URL` are then
re-asserted as OpenRouter so his config init recognizes our provider instead of adding a second.

### Local models are disabled

`sync-simplicity.mjs` removes `ollama`, `lemonade`, `lmstudio`, and `claudecode` from his provider
registry (`src/lib/models/providers/index.ts`) after each pull. This is a surgical edit to the
object literal rather than a checked-in patch file: `git apply` breaks whenever upstream touches an
adjacent line, and regenerating the module would silently drop anything new he exports from it. The
patch refuses to apply if `openai` or `transformers` has gone missing, which is the signal that
upstream changed shape and the edit needs re-checking.

**`transformers` deliberately stays.** OpenRouter serves no embeddings endpoint, and Simplicity's
search pipeline needs one to rerank results — without it every result scores equal and ranking is
lost. That provider runs a small embedding model in-process, so it is the one local model in the
stack. It is an embedding model only; no local *chat* inference happens.

## The other two patches, and why they exist

`sync-simplicity.mjs` also injects two settings into his `next.config.mjs`. Both work around real
upstream problems that surface on a clean Windows build; neither changes emitted code.

**`typescript: { ignoreBuildErrors: true }`** — we consume Simplicity as a built artifact, we don't
develop it. Type-checking a dependency during `npm install` means any type error upstream ships
breaks install for everyone. This is not hypothetical: `MessageActions/Download.tsx` fails on
`window.open(...).document` (`Property 'document' does not exist on type 'BrowserWindowProxy'`)
while the build itself reports "Compiled successfully". The cause is an ambient `@types`
collision — setting `"types": []` makes it vanish — likely from `vendor/` living inside Orbit's
tree, where TypeScript resolves types differently than in a standalone checkout. Real breakage
still surfaces as a compile error, which is *not* suppressed.

**`experimental: { cpus: 1, workerThreads: false }`** — his `ConfigManager` is a module-level
singleton, so every build worker importing an API route constructs it, and each construction ends
in a write-temp-then-rename of `data/config.json`. Upstream already hit this race and made temp
names pid-unique, which fixes the POSIX symptom (one worker renames the temp away, the next
`ENOENT`s). On Windows, though, renaming onto a file another process holds open fails outright
with `EPERM`, and the build dies with `Failed to collect page data for /api/providers`. One worker
means no concurrent construction. Costs build time, not runtime.

The patch refuses to apply if upstream has since added its own `experimental` key — inserting at
the top of the object literal would let theirs win silently and put the race back with nothing to
explain why.

## Packaging

`electron-builder` copies three paths out of `vendor/simplicity` into `resources/simplicity`:
`.next/standalone`, `drizzle`, and `desktop`. `node_modules` is not among them — the standalone
build already carries its traced dependencies.

## Known trade-offs

- **Install cost.** Tracking his repo means building his app. There is no npm package to depend on.
- **Upstream drift.** Three patches are applied to his tree on every pull, so they're the places
  that can break on an upstream refactor. Each fails loudly rather than silently doing nothing —
  the provider patch in particular refuses to apply rather than risk shipping local models. His
  `desktop` branch is actively in flux (HEAD is *"finish Windows fresh-install support"*), so
  expect these to need occasional attention.
- **His UI, his branding.** We embed his frontend wholesale, so his settings page is reachable.
  Local model providers are absent from it, but the rest of his surface (Discover, Library, file
  upload) comes along.
