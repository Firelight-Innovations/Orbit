/* Pull Simplicity into vendor/ and build it.
 *
 * Simplicity is a separate project with its own release cadence, so Orbit
 * tracks it rather than absorbing it: nothing from that repo is committed
 * here, and every `npm install` re-pulls whatever its default branch has.
 * `vendor/` is gitignored, so a clone of Orbit carries no copy of his code —
 * only the URL and the commit we last built.
 *
 * Steps, all idempotent:
 *   1. clone (or fast-forward) vendor/simplicity from UPSTREAM
 *   2. disable the local-model providers — Orbit routes inference through
 *      OpenRouter, and local runtimes are an unsupported path for now
 *   3. yarn install && yarn build:desktop, producing .next/standalone
 *
 * Step 3 is expensive (minutes, and a few hundred MB of node_modules), so it
 * is skipped when the built tree already matches the checked-out commit and
 * the patch set. Set ORBIT_SKIP_SIMPLICITY=1 to bypass the whole thing.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPSTREAM = 'https://github.com/Blueturboguy07/Simplicity.git';
const BRANCH = 'desktop';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'vendor', 'simplicity');
const stampFile = path.join(dir, '.orbit-build-stamp');

const log = (msg) => console.log(`[simplicity] ${msg}`);

/* Local-model providers. Orbit sends all chat traffic to OpenRouter, so these
   runtimes have no key path and would only surface as dead options in the
   settings UI we embed. `transformers` deliberately stays: it is the
   in-process embedding model the search pipeline reranks with, and OpenRouter
   serves no embeddings endpoint. */
const DISABLED_PROVIDERS = ['ollama', 'lemonade', 'lmstudio', 'claudecode'];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

/* Yarn isn't a given on a machine that only ever ran npm, and Simplicity ships
   a yarn.lock — installing it with npm would resolve a different tree. Prefer
   a real yarn, fall back to the one Corepack/npm can fetch on demand. */
function yarn(args) {
  const direct = spawnSync('yarn', ['--version'], { shell: true, stdio: 'ignore' });
  if (direct.status === 0) return run('yarn', args, { cwd: dir, shell: true });
  log('yarn not on PATH — using `npx yarn`');
  return run('npx', ['--yes', 'yarn', ...args], { cwd: dir, shell: true });
}

/* `--ignore-scripts` is load-bearing, not caution.
 *
 * better-sqlite3 ships prebuilt N-API binaries in `prebuilds/` and needs no
 * compilation — but it also ships a binding.gyp and declares no install
 * script, and npm/yarn treat that combination as an implicit
 * `node-gyp rebuild`. That compile needs a full C++ toolchain (Visual Studio
 * on Windows), which end users don't have, and its failure aborts the entire
 * install even though the binary it would produce is already in the package.
 *
 * Skipping scripts is safe here because every native dependency in this tree
 * carries its own binaries: better-sqlite3 in `prebuilds/`, onnxruntime-node
 * (the embedding runtime) in `bin/napi-v3/`, esbuild and sharp via their
 * per-platform optional packages. The remaining scripts are funding notices.
 *
 * The long network timeout is unrelated but worth keeping: yarn v1 writes its
 * global cache non-atomically, so a stall mid-write leaves an entry with no
 * .yarn-metadata.json and every later install dies on that ENOENT.
 */
function install() {
  try {
    yarn(['install', '--frozen-lockfile', '--ignore-scripts', '--network-timeout', '600000']);
  } catch (err) {
    log('');
    log('Dependency install failed. If the error mentions .yarn-metadata.json,');
    log('a cached package is corrupt — delete the named folder under the yarn');
    log('cache directory and re-run. Do NOT retry with --force: that triggers a');
    log('node-gyp rebuild of better-sqlite3, which needs C++ build tools and is');
    log('not needed at all (the package ships prebuilt binaries).');
    throw err;
  }
}

function sync() {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    log(`cloning ${UPSTREAM} (${BRANCH})`);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    run('git', ['clone', '--depth', '1', '--branch', BRANCH, UPSTREAM, dir]);
    return;
  }

  log(`updating to latest ${BRANCH}`);
  /* Hard reset rather than pull: the working tree carries our patches, so a
     merge would conflict every time. Ignored paths (node_modules, .next) are
     left alone, which is what makes the build cache below worth having. */
  run('git', ['fetch', '--depth', '1', 'origin', BRANCH], { cwd: dir });
  run('git', ['reset', '--hard', `origin/${BRANCH}`], { cwd: dir });
  run('git', ['clean', '-fd'], { cwd: dir });
}

/* Drop the local runtimes from the provider registry.
 *
 * Surgical edit rather than a checked-in patch file or a rewritten module:
 * `git apply` breaks whenever upstream touches an adjacent line, and
 * regenerating the file would silently drop anything new he exports from it.
 * Removing entries from the object literal survives both. The imports are left
 * in place — they are inert once unreferenced, and deleting them is one more
 * thing to get wrong. */
function disableLocalProviders() {
  const file = path.join(dir, 'src', 'lib', 'models', 'providers', 'index.ts');
  const before = fs.readFileSync(file, 'utf8');

  let after = before;
  const removed = [];
  for (const key of DISABLED_PROVIDERS) {
    /* Line-anchored and CRLF-tolerant — the upstream checkout has CRLF endings
       on Windows, and a `\s*`-based tail would happily swallow blank lines. */
    const entry = new RegExp(`^[ \\t]*${key}:[ \\t]*\\w+,[ \\t]*\\r?\\n`, 'm');
    if (entry.test(after)) {
      after = after.replace(entry, '');
      removed.push(key);
    }
  }

  if (!/\bopenai:/.test(after) || !/\btransformers:/.test(after)) {
    throw new Error(
      'Refusing to patch: the openai or transformers provider is missing from ' +
        `${path.relative(root, file)}. Upstream changed shape — re-check the patch.`,
    );
  }

  fs.writeFileSync(file, after);
  log(removed.length ? `disabled local providers: ${removed.join(', ')}` : 'no local providers to disable');
}

/* Stop `next build` from type-checking and linting Simplicity's own source.
 *
 * We consume Simplicity as a built artifact; we don't develop it. Type-checking
 * a dependency at install time means any type error upstream ships — or any
 * type collision caused by vendor/ living inside Orbit's own tree, where
 * TypeScript resolves types differently than it would in a standalone
 * checkout — breaks `npm install` for everyone. That already happened once:
 * MessageActions/Download.tsx failed on `window.open(...).document` while the
 * build itself reported "Compiled successfully".
 *
 * This changes no emitted code. Type errors don't affect the JavaScript Next
 * produces, so skipping the check costs us nothing at runtime. Real breakage
 * still surfaces — as a compile error, which is not suppressed. */
function relaxBuildChecks() {
  const file = path.join(dir, 'next.config.mjs');
  const before = fs.readFileSync(file, 'utf8');
  if (before.includes('ignoreBuildErrors')) return;

  const anchor = 'const nextConfig = {';
  if (!before.includes(anchor)) {
    throw new Error(
      `Refusing to patch: no "${anchor}" in ${path.relative(root, file)}. Upstream changed shape.`,
    );
  }

  /* We insert at the top of the literal, so an `experimental` upstream already
     declares would come later and silently win — leaving the build racing
     again with nothing to show why. Fail loudly instead of merging blind. */
  if (/^\s*experimental\s*:/m.test(before)) {
    throw new Error(
      `Refusing to patch: ${path.relative(root, file)} already sets "experimental". ` +
        'Merge it with the settings in relaxBuildChecks() by hand.',
    );
  }

  const after = before.replace(
    anchor,
    `${anchor}\n  /* injected by Orbit's scripts/sync-simplicity.mjs */\n` +
      /* No `eslint` key: Next 16 dropped it from next.config and warns
         "Unrecognized key(s) in object: 'eslint'". It no longer lints during
         build, so there is nothing to turn off. */
      '  typescript: { ignoreBuildErrors: true },\n' +
      /* Single-worker build. Simplicity's ConfigManager is a module-level
         singleton, so every build worker that touches an API route constructs
         it, and each construction ends in a write of data/config.json via
         write-temp-then-rename. Upstream already hit this race and made the
         temp name pid-unique, which fixes the POSIX symptom (one worker
         renames the temp away, the next ENOENTs) — but on Windows a rename
         onto a file another process holds open fails outright with EPERM, and
         the build dies with "Failed to collect page data". One worker means no
         concurrent construction and no race. Costs build time, not runtime. */
      '  experimental: { cpus: 1, workerThreads: false },',
  );
  fs.writeFileSync(file, after);
  log('relaxed build checks and forced a single build worker');
}

/* A build is reusable only if both the source commit and the patch set that
   produced it are unchanged. */
function stamp() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  const patchSet = crypto.createHash('sha256').update(DISABLED_PROVIDERS.join(',')).digest('hex').slice(0, 12);
  return `${commit}:${patchSet}`;
}

function isBuilt(expected) {
  try {
    if (!fs.existsSync(path.join(dir, '.next', 'standalone', 'server.js'))) return false;
    return fs.readFileSync(stampFile, 'utf8').trim() === expected;
  } catch {
    return false;
  }
}

function main() {
  if (process.env.ORBIT_SKIP_SIMPLICITY === '1') {
    log('ORBIT_SKIP_SIMPLICITY=1 — skipping');
    return;
  }

  try {
    sync();
  } catch (err) {
    /* An offline install shouldn't be fatal when a usable tree is already
       here — Orbit just runs against the Simplicity it pulled last time. */
    if (fs.existsSync(path.join(dir, '.next', 'standalone', 'server.js'))) {
      log(`couldn't reach upstream (${err.message.split('\n')[0]}) — keeping the existing build`);
      return;
    }
    throw err;
  }

  disableLocalProviders();
  relaxBuildChecks();

  const expected = stamp();
  if (isBuilt(expected)) {
    log('already built at this commit — skipping build');
    return;
  }

  log('installing dependencies (this takes a few minutes on first run)');
  install();

  log('building');
  yarn(['build:desktop']);

  fs.writeFileSync(stampFile, expected);
  log('ready');
}

main();
