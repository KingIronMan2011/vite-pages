import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  external: ['vite'],
  banner: {
    js: '// @kingironman2011/vite-pages – https://github.com/KingIronMan2011/vite-pages',
  },
})
