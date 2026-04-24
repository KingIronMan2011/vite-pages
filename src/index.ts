import type { Plugin, ResolvedConfig } from 'vite'
import fs, { type Dirent } from 'fs'
import path from 'path'

export interface VitePagesOptions {
  /**
   * Source directory to scan for route definitions.
   * @default 'src'
   */
  srcDir?: string

  /**
   * File extensions to include in the scan.
   * @default ['.tsx', '.ts', '.jsx', '.js']
   */
  extensions?: string[]

  /**
   * Additional routes to always generate HTML for, regardless of detection.
   */
  additionalRoutes?: string[]

  /**
   * Disable automatic route scanning. Only additionalRoutes will be used.
   * @default false
   */
  disableAutoScan?: boolean

  /**
   * Log detected routes and generated files to the console.
   * @default false
   */
  verbose?: boolean
}

// ─── Route Extraction ────────────────────────────────────────────────────────

const JSX_PATH_RE = /\bpath=\{?["'`]([^"'`{}*?[\]]+)["'`]\}?/g
const OBJ_PATH_RE = /\bpath:\s*["'`]([^"'`{}*?[\]]+)["'`]/g

function isDynamic(route: string): boolean {
  return /[:*?[\]]/.test(route)
}

function normalizeRoute(route: string): string {
  return route.length > 1 ? route.replace(/\/$/, '') : route
}

function extractRoutesFromContent(content: string): string[] {
  const found = new Set<string>()
  for (const re of [JSX_PATH_RE, OBJ_PATH_RE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      const raw = m[1].trim()
      if (!raw || raw === '/') continue
      if (isDynamic(raw)) continue
      found.add(normalizeRoute(raw.startsWith('/') ? raw : `/${raw}`))
    }
  }
  return [...found]
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.cache', 'coverage', '.vite'])

// Async parallel directory walk — never blocks the event loop
async function walkDir(dir: string, exts: Set<string>): Promise<string[]> {
  let entries: Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }

  const batches = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return SKIP_DIRS.has(entry.name) ? Promise.resolve([]) : walkDir(full, exts)
      }
      return Promise.resolve(
        entry.isFile() && exts.has(path.extname(entry.name)) ? [full] : [],
      )
    }),
  )

  return batches.flat()
}

// ─── HTML Generation ─────────────────────────────────────────────────────────

async function writeRouteHtml(
  outDir: string,
  route: string,
  indexHtml: string,
  verbose: boolean,
): Promise<void> {
  const segments = route.replace(/^\//, '').split('/')
  const dir = path.join(outDir, ...segments)

  await fs.promises.mkdir(dir, { recursive: true })
  const dest = path.join(dir, 'index.html')
  await fs.promises.writeFile(dest, indexHtml, 'utf-8')

  if (verbose) {
    console.log(`  [vite-pages] ✔  ${route}  →  ${path.relative(process.cwd(), dest)}`)
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function vitePages(options: VitePagesOptions = {}): Plugin {
  const {
    srcDir = 'src',
    extensions = ['.tsx', '.ts', '.jsx', '.js'],
    additionalRoutes = [],
    disableAutoScan = false,
    verbose = false,
  } = options

  const extSet = new Set(extensions)
  let resolvedConfig: ResolvedConfig

  return {
    name: 'vite-pages',
    apply: 'build',

    configResolved(config) {
      resolvedConfig = config
    },

    async closeBundle() {
      const outDir = resolvedConfig.build?.outDir ?? 'dist'
      const root = resolvedConfig.root ?? process.cwd()
      const absOut = path.resolve(root, outDir)
      const absSrc = path.resolve(root, srcDir)

      // ── 1. Walk source files and read them all in parallel ────────────────
      const routeSet = new Set<string>()

      if (!disableAutoScan) {
        const files = await walkDir(absSrc, extSet)
        const routeLists = await Promise.all(
          files.map(file =>
            fs.promises
              .readFile(file, 'utf-8')
              .then(extractRoutesFromContent)
              .catch(() => [] as string[]),
          ),
        )
        for (const routes of routeLists) {
          for (const r of routes) routeSet.add(r)
        }
      }

      for (const r of additionalRoutes) {
        const norm = normalizeRoute(r.startsWith('/') ? r : `/${r}`)
        if (!isDynamic(norm)) routeSet.add(norm)
      }

      if (routeSet.size === 0) {
        if (verbose) console.log('[vite-pages] No routes detected – nothing to do.')
        return
      }

      // ── 2. Read index.html ────────────────────────────────────────────────
      const indexPath = path.join(absOut, 'index.html')
      let indexHtml: string
      try {
        indexHtml = await fs.promises.readFile(indexPath, 'utf-8')
      } catch {
        console.warn('[vite-pages] ⚠  dist/index.html not found – skipping HTML generation.')
        return
      }

      // ── 3. Write all route HTML files in parallel ─────────────────────────
      if (verbose) {
        console.log(`\n[vite-pages] Generating HTML for ${routeSet.size} route(s):`)
      }

      await Promise.all(
        [...routeSet].map(route => writeRouteHtml(absOut, route, indexHtml, verbose)),
      )

      console.log(
        `[vite-pages] ✅  Generated HTML for ${routeSet.size} route(s) – no more 404s on refresh!`,
      )
    },
  }
}
