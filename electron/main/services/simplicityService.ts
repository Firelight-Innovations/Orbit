/* Simplicity — Orbit's search backend.
 *
 * Simplicity is a Next.js server app, not a library, so it can't be imported;
 * it has to run. This service owns that lifecycle inside Orbit:
 *
 *   1. start SearXNG (Simplicity's own retrieval backend) on a loopback port
 *   2. seed its config so it comes up already pointed at OpenRouter, with no
 *      onboarding screen and no local-model options
 *   3. spawn its standalone server on another loopback port
 *   4. keep both alive, and tear them down with the app
 *
 * The SearXNG half is delegated to Simplicity's own desktop/searxng.mjs rather
 * than reimplemented — it carries hard-won platform fixes (Windows has no
 * `pwd` module, SearXNG's version.py shells out to git) that we'd otherwise
 * have to rediscover and would then have to maintain against his updates.
 *
 * Everything lives under <userData>/simplicity, so removing that directory
 * fully resets search.
 */

import { spawn, ChildProcess } from 'child_process'
import crypto from 'crypto'
import fs from 'fs'
import net from 'net'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import { is } from '@electron-toolkit/utils'

/* Chat models offered in Simplicity's model picker. OpenRouter exposes
   hundreds; this is a deliberately short, current list rather than a mirror of
   their catalog, which would go stale the moment it was written. Anything the
   user's OpenRouter account can reach can still be added from the settings UI.

   Simplicity's OpenAI provider returns NO default models when baseURL isn't
   api.openai.com (see providers/openai/index.ts getDefaultModels), so without
   seeding these the model picker would be empty and no search could run. */
const OPENROUTER_CHAT_MODELS = [
  { name: 'Claude Sonnet 4.5', key: 'anthropic/claude-sonnet-4.5' },
  { name: 'Claude Opus 4.1', key: 'anthropic/claude-opus-4.1' },
  { name: 'GPT-5.1', key: 'openai/gpt-5.1' },
  { name: 'GPT-5 mini', key: 'openai/gpt-5-mini' },
  { name: 'Gemini 2.5 Pro', key: 'google/gemini-2.5-pro' },
  { name: 'Gemini 2.5 Flash', key: 'google/gemini-2.5-flash' },
  { name: 'Llama 4 Maverick', key: 'meta-llama/llama-4-maverick' },
]

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/* Every env var Simplicity's ConfigManager auto-configures a provider from
   (src/lib/config/index.ts initializeFromEnv, via each provider's `env` field).
   These are stripped from the child's environment: a developer with
   ANTHROPIC_API_KEY or OPENAI_API_KEY already exported would otherwise get
   silent extra providers in the model picker, billed to a key Orbit never
   chose. Orbit decides what search talks to, not the ambient shell. */
const PROVIDER_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'LEMONADE_API_KEY',
  'LEMONADE_BASE_URL',
  'LM_STUDIO_BASE_URL',
  'OLLAMA_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'SEARXNG_API_URL',
  'XAI_API_KEY',
]

/* Mirrors Simplicity's src/lib/utils/hash.ts. Its ConfigManager dedupes
   providers by this hash on every boot, so matching the algorithm exactly is
   what stops it appending a second copy of our provider each launch. */
const hashObj = (obj: Record<string, unknown>): string =>
  crypto.createHash('sha256').update(JSON.stringify(obj, Object.keys(obj).sort())).digest('hex')

/* Orbit's OpenRouter key lives in backend/.env — that's the file the Python
   side loads (app/main.py calls load_dotenv on it), so it's where a configured
   machine actually keeps the key. The main process never loads it, so reading
   it here is what makes "the same key as the rest of Orbit" literally true
   rather than a second place to configure. A real environment variable still
   wins, so CI and one-off overrides work.

   Minimal parser on purpose: this reads one known key out of a file Orbit
   itself wrote, not arbitrary dotenv syntax. */
function resolveOpenRouterKey(): string {
  const fromEnv = process.env.OPENROUTER_API_KEY
  if (fromEnv) return fromEnv

  const backendDir = is.dev
    ? join(process.cwd(), 'backend')
    : join(process.resourcesPath ?? '', 'backend')

  try {
    const contents = fs.readFileSync(join(backendDir, '.env'), 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      return match[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    /* no .env — fall through to empty, which is warned about by the caller */
  }

  return ''
}

interface SearxngModule {
  start(dataDir: string, onLog?: (msg: string) => void): Promise<string>
  shutdown(): void
}

export class SimplicityService {
  private serverProcess: ChildProcess | null = null
  private searxng: SearxngModule | null = null
  private port: number | null = null
  private starting: Promise<string> | null = null
  private stopped = false

  /* Simplicity's payload: the repo in dev, resources/simplicity once packaged
     (see the electron-builder extraResources entry). */
  private get rootDir(): string {
    const packaged = join(process.resourcesPath ?? '', 'simplicity')
    return is.dev || !fs.existsSync(packaged) ? join(process.cwd(), 'vendor', 'simplicity') : packaged
  }

  private get dataDir(): string {
    return join(app.getPath('userData'), 'simplicity')
  }

  private get standaloneDir(): string {
    return join(this.rootDir, '.next', 'standalone')
  }

  isInstalled(): boolean {
    return fs.existsSync(join(this.standaloneDir, 'server.js'))
  }

  getPort(): number | null {
    return this.port
  }

  getBaseUrl(): string | null {
    return this.port ? `http://127.0.0.1:${this.port}` : null
  }

  /* The URL Orbit points a search view at. `q` is picked up by Simplicity's
     ChatProvider (useChat.tsx reads searchParams 'q') and auto-submitted, so
     the omnibox flow lands directly on results rather than an empty prompt. */
  getSearchUrl(query?: string): string | null {
    const base = this.getBaseUrl()
    if (!base) return null
    return query ? `${base}/?q=${encodeURIComponent(query)}` : `${base}/`
  }

  async start(): Promise<string> {
    if (this.starting) return this.starting
    this.starting = this._start()
    return this.starting
  }

  private async _start(): Promise<string> {
    if (!this.isInstalled()) {
      throw new Error(
        `Simplicity isn't built at ${this.standaloneDir}. Run \`node scripts/sync-simplicity.mjs\`.`,
      )
    }

    /* Search backend first: Simplicity reads its config per request, so having
       the SearXNG URL on disk before the server boots means the first query
       already works instead of failing once and recovering. */
    const searxngURL = await this.startSearxng()
    this.seedConfig(searxngURL)

    return this.startServer()
  }

  private async startSearxng(): Promise<string> {
    const modulePath = join(this.rootDir, 'desktop', 'searxng.mjs')
    if (!fs.existsSync(modulePath)) {
      throw new Error(`Simplicity's SearXNG manager is missing at ${modulePath}.`)
    }

    /* @vite-ignore: this path is resolved at runtime from the vendored tree,
       which electron-vite must not try to follow and bundle at build time. */
    this.searxng = (await import(/* @vite-ignore */ pathToFileURL(modulePath).href)) as SearxngModule

    console.log('[Simplicity] starting SearXNG (first run downloads ~150MB)...')
    const restorePath = preferSystemTar()
    try {
      const url = await this.searxng.start(this.dataDir, (msg) =>
        console.log(`[Simplicity/SearXNG] ${msg}`),
      )
      console.log(`[Simplicity] SearXNG ready at ${url}`)
      return url
    } finally {
      restorePath()
    }
  }

  /* Lay out DATA_DIR the way Simplicity's server expects, and pre-answer its
     onboarding so the embedded UI opens straight into search.
     Existing values are preserved — anything the user changes in the settings
     UI has to survive the next launch. */
  private seedConfig(searxngURL: string): void {
    fs.mkdirSync(join(this.dataDir, 'data'), { recursive: true })

    /* Simplicity's migrate step reads migrations from DATA_DIR/drizzle. Copied
       every launch so they track whatever version we just pulled. */
    fs.cpSync(join(this.rootDir, 'drizzle'), join(this.dataDir, 'drizzle'), { recursive: true })

    const configPath = join(this.dataDir, 'data', 'config.json')
    let config: Record<string, any>
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch {
      config = { version: 1, setupComplete: false, preferences: {}, personalization: {}, modelProviders: [] }
    }

    config.modelProviders = Array.isArray(config.modelProviders) ? config.modelProviders : []
    config.search = { ...(config.search ?? {}), searxngURL }

    /* Orbit owns inference: Simplicity talks to OpenRouter through its
       OpenAI-compatible provider, using the same key as the rest of the app.
       Reconciled by hash rather than appended, so a rotated key replaces the
       old provider instead of stacking a second one beside it. */
    const apiKey = resolveOpenRouterKey()
    const openrouterConfig = { apiKey, baseURL: OPENROUTER_BASE_URL }
    const openrouterHash = hashObj(openrouterConfig)

    const existing = config.modelProviders.find((p: any) => p.type === 'openai')
    if (existing) {
      existing.name = 'OpenRouter'
      existing.config = openrouterConfig
      existing.hash = openrouterHash
      /* Only seed the catalog when empty — models the user added stay. */
      if (!existing.chatModels?.length) existing.chatModels = [...OPENROUTER_CHAT_MODELS]
    } else {
      config.modelProviders.push({
        id: crypto.randomUUID(),
        name: 'OpenRouter',
        type: 'openai',
        config: openrouterConfig,
        chatModels: [...OPENROUTER_CHAT_MODELS],
        embeddingModels: [],
        hash: openrouterHash,
      })
    }

    /* Embeddings run in-process via transformers. OpenRouter serves no
       embeddings endpoint, and the search pipeline needs one to rerank
       results — without it every result scores equal and ranking is lost.
       Its default models come from the provider itself, so an empty list here
       is correct. The hash must match hashObj({}) or Simplicity's env-based
       initialization appends a duplicate on every boot. */
    if (!config.modelProviders.some((p: any) => p.type === 'transformers')) {
      config.modelProviders.push({
        id: crypto.randomUUID(),
        name: 'Transformers',
        type: 'transformers',
        config: {},
        chatModels: [],
        embeddingModels: [],
        hash: hashObj({}),
      })
    }

    config.setupComplete = true
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    if (!apiKey) {
      console.warn(
        '[Simplicity] No OpenRouter key found. Set OPENROUTER_API_KEY in backend/.env ' +
          '(or the environment) — search will load but cannot answer until you do.',
      )
    }
  }

  private async startServer(): Promise<string> {
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`

    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const key of PROVIDER_ENV_VARS) delete env[key]

    /* Re-assert the OpenAI-compatible pair as OpenRouter. Simplicity's
       config init dedupes providers by hash, so handing it the same values
       seedConfig wrote means it recognizes ours instead of appending a second
       provider — and search still comes up correctly if config.json is ever
       deleted. */
    env.OPENAI_API_KEY = resolveOpenRouterKey()
    env.OPENAI_BASE_URL = OPENROUTER_BASE_URL

    /* Electron ships no separate node binary, so re-exec ourselves as Node.
     *
     * This requires Electron >= 37 and package.json pins it there. Simplicity
     * depends on better-sqlite3 13, whose prebuilt binary is N-API — runtime
     * agnostic, but only against **N-API version 10** (Node 22+). Electron 31
     * provided N-API 9, and loading that binary segfaulted the server the
     * moment it opened the database (0xC0000005, mid-migration) rather than
     * failing to load with a readable error. Electron 37 carries Node 22.21 /
     * N-API 10, which also clears Next 16's >=20.9 floor.
     *
     * 37 specifically, not later: it is the highest Electron ABI (136) for
     * which better-sqlite3 12 — the copy *Orbit itself* uses — publishes a
     * prebuilt. Going further makes Orbit's own install need a C++ toolchain.
     * See docs/search.md. */
    this.serverProcess = spawn(process.execPath, [join(this.standaloneDir, 'server.js')], {
      cwd: this.standaloneDir,
      env: {
        ...env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_ENV: 'production',
        DATA_DIR: this.dataDir,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
    })

    console.log(`[Simplicity] starting server on ${url}`)

    this.serverProcess.stdout?.on('data', (d: Buffer) => console.log(`[Simplicity] ${d.toString().trim()}`))
    this.serverProcess.stderr?.on('data', (d: Buffer) => console.error(`[Simplicity] ${d.toString().trim()}`))
    this.serverProcess.on('exit', (code) => {
      if (!this.stopped) console.error(`[Simplicity] server exited unexpectedly (code ${code})`)
      this.serverProcess = null
      this.port = null
    })

    /* Generous, because "bound" and "answering" are far apart on a first run.
       Next binds the port and prints "Ready" immediately, then Drizzle runs
       its migrations through better-sqlite3 — whose API is synchronous, so the
       event loop is blocked and nothing is served until they finish. On a cold
       machine also busy starting Electron, Vite and the Python backend, that
       overran a 60s budget by seconds and the whole start was abandoned even
       though the server came up fine moments later. */
    const deadline = Date.now() + 180_000
    while (Date.now() < deadline) {
      if (this.stopped) {
        this.killServerProcess()
        throw new Error('Simplicity was shut down during startup.')
      }
      if (await isServing(url)) {
        this.port = port
        console.log(`[Simplicity] ready at ${url}`)
        return url
      }
      await delay(400)
    }

    /* Give up on a child that is still running: it holds its port, and every
       later attempt picks a new one, so without this each failed start leaks
       another server process for the rest of the session. */
    this.killServerProcess()
    throw new Error(`Simplicity's server started but isn't responding at ${url}.`)
  }

  /* Terminate the spawned server. The standalone server starts its own
     workers, and on Windows only a tree kill reliably takes them with it —
     otherwise the port stays held by an orphan. */
  private killServerProcess(): void {
    const proc = this.serverProcess
    this.serverProcess = null
    this.port = null
    if (!proc?.pid) return

    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'])
      } else {
        proc.kill('SIGTERM')
      }
    } catch {
      /* already gone */
    }
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.starting = null

    try {
      this.searxng?.shutdown()
    } catch {
      /* already gone */
    }
    this.searxng = null

    const proc = this.serverProcess
    this.serverProcess = null
    this.port = null
    if (!proc?.pid) return

    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve())

      /* The standalone server spawns its own workers; on Windows only a tree
         kill reliably takes them with it, otherwise the port stays held. */
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'])
      } else {
        proc.kill('SIGTERM')
        setTimeout(() => proc.kill('SIGKILL'), 5000)
      }

      setTimeout(resolve, 8000)
    })
  }
}

/* Make `tar` resolve to the bsdtar Windows ships in System32, for as long as
   provisioning runs.
 *
 * Simplicity's provisioner unpacks the Python runtime with a bare `tar`,
 * assuming the Windows one — bsdtar understands `C:\...` paths. Git for
 * Windows also installs a GNU tar, and whenever Orbit is launched from a shell
 * carrying Git's usr/bin (Git Bash, most dev setups) that one wins the PATH
 * lookup. GNU tar parses `C:\Users\...` as a host:path remote spec and tries
 * to reach a machine called "C", failing with:
 *
 *   tar (child): Cannot connect to C: resolve failed
 *   gzip: stdin: unexpected end of file
 *
 * Reordering PATH fixes it for his child process without editing his code —
 * one less patch to carry across his updates. Restored immediately after, so
 * nothing else in the app inherits the change. */
function preferSystemTar(): () => void {
  if (process.platform !== 'win32') return () => {}

  const system32 = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')
  if (!fs.existsSync(join(system32, 'tar.exe'))) return () => {}

  const original = process.env.PATH
  process.env.PATH = `${system32};${original ?? ''}`
  return () => {
    process.env.PATH = original
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

async function isServing(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let service: SimplicityService | null = null

export function getSimplicityService(): SimplicityService {
  if (!service) service = new SimplicityService()
  return service
}

export async function closeSimplicityService(): Promise<void> {
  if (!service) return
  await service.stop()
  service = null
}
