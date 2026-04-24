import type { Plugin, ResolvedConfig } from 'vite'
import fs from 'fs'
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
const INDEX_ROUTE_RE = /\bindex\b/g

function isDynamic(route: string): boolean {
  return /[:*?[\]]/.test(route)
}

function normalizeRoute(route: string): string {
  // strip trailing slash except for root
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

function walkDir(dir: string, exts: string[], results: string[] = []): string[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git', '.cache', 'coverage'].includes(entry.name)) continue
      walkDir(full, exts, results)
    } else if (entry.isFile() && exts.includes(path.extname(entry.name))) {
      results.push(full)
    }
  }
  return results
}

// ─── HTML Generation ─────────────────────────────────────────────────────────

function writeRouteHtml(outDir: string, route: string, indexHtml: string, verbose: boolean): void {
  // /about         → {outDir}/about/index.html
  // /blog/my-post  → {outDir}/blog/my-post/index.html
  const segments = route.replace(/^\//, '').split('/')
  const dir = path.join(outDir, ...segments)

  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, 'index.html')
  fs.writeFileSync(dest, indexHtml, 'utf-8')

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

  let resolvedConfig: ResolvedConfig

  return {
    name: 'vite-pages',
    apply: 'build',

    configResolved(config) {
      resolvedConfig = config
    },

    closeBundle() {
      const outDir = resolvedConfig.build?.outDir ?? 'dist'
      const root = resolvedConfig.root ?? process.cwd()
      const absOut = path.resolve(root, outDir)
      const absSrc = path.resolve(root, srcDir)

      // ── 1. Collect all routes ─────────────────────────────────────────────
      const routeSet = new Set<string>()

      if (!disableAutoScan) {
        const files = walkDir(absSrc, extensions)
        for (const file of files) {
          let content: string
          try {
            content = fs.readFileSync(file, 'utf-8')
          } catch {
            continue
          }
          for (const r of extractRoutesFromContent(content)) {
            routeSet.add(r)
          }
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

      // ── 2. Read index.html from dist ──────────────────────────────────────
      const indexPath = path.join(absOut, 'index.html')
      if (!fs.existsSync(indexPath)) {
        console.warn('[vite-pages] ⚠  dist/index.html not found – skipping HTML generation.')
        return
      }
      const indexHtml = fs.readFileSync(indexPath, 'utf-8')

      // ── 3. Generate one HTML file per route ───────────────────────────────
      if (verbose) {
        console.log(`\n[vite-pages] Generating HTML for ${routeSet.size} route(s):`)
      }

      for (const route of routeSet) {
        writeRouteHtml(absOut, route, indexHtml, verbose)
      }

      console.log(
        `[vite-pages] ✅  Generated HTML for ${routeSet.size} route(s) – no more 404s on refresh!`,
      )
    },
  }
}

