# @kingironman2011/vite-pages

> **Never get a 404 on page refresh again.**  
> A Vite plugin that auto-generates an `index.html` for every route detected in your React Router app — perfect for GitHub Pages, Netlify static, and any host that doesn't support server-side routing.

---

## The problem

When you deploy a React SPA (with `react-router-dom`) to a static host like GitHub Pages, visiting `/about` directly or refreshing on it causes a **404**. The host looks for `/about/index.html` on disk — which doesn't exist.

## The solution

`@kingironman2011/vite-pages` hooks into your Vite build. After the bundle is written it:

1. Scans your source files for every route path registered in `react-router-dom` (JSX `<Route path="…">` and `createBrowserRouter` object syntax)
2. Creates `{route}/index.html` inside your `dist` folder — a copy of `dist/index.html`
3. Done. The host finds the file, serves it, and React Router takes over client-side.

---

## Installation

```bash
npm install -D @kingironman2011/vite-pages
# or
pnpm add -D @kingironman2011/vite-pages
# or
yarn add -D @kingironman2011/vite-pages
```

---

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { vitePages } from '@kingironman2011/vite-pages'

export default defineConfig({
  plugins: [
    react(),
    vitePages(),          // ← drop it in, zero config needed
  ],
})
```

That's it. Run `vite build` and every detected route gets its own `index.html`.

---

## Options

```ts
vitePages({
  /**
   * Source directory to scan for route definitions.
   * @default 'src'
   */
  srcDir: 'src',

  /**
   * File extensions to include in the scan.
   * @default ['.tsx', '.ts', '.jsx', '.js']
   */
  extensions: ['.tsx', '.ts', '.jsx', '.js'],

  /**
   * Routes to always generate HTML for, regardless of auto-detection.
   * Useful for routes defined in config files outside the src folder.
   */
  additionalRoutes: ['/404', '/maintenance'],

  /**
   * Turn off automatic scanning entirely.
   * Only additionalRoutes will be used.
   * @default false
   */
  disableAutoScan: false,

  /**
   * Log detected routes and generated files to the console.
   * @default false
   */
  verbose: true,
})
```

---

## Route detection

The plugin scans every `.tsx/.ts/.jsx/.js` file in your `srcDir` and extracts paths from:

| Pattern | Example |
|---|---|
| JSX attribute | `<Route path="/about" …/>` |
| Object literal | `{ path: '/dashboard', element: … }` |

**What is intentionally skipped:**
- Dynamic segments: `/user/:id`, `/post/:slug`
- Wildcard routes: `*`, `/404/*`
- Template literals (not statically knowable)
- The root `/` (already `dist/index.html`)

For routes with dynamic segments use `additionalRoutes` to manually list the static shells you want, e.g. `/user`.

---

## GitHub Pages quick setup

1. Add the plugin (see above)
2. Set `base` in `vite.config.ts` to your repo name:
   ```ts
   base: '/my-repo-name/',
   ```
3. Build and deploy the `dist` folder
4. ✅ Refresh anywhere — no more 404s

---

## Vite compatibility

| Vite version | Supported |
|---|---|
| 7.x | ✅ |
| 8.x | ✅ |

---

## License

MIT © KingIronMan2011
