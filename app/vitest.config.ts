import { defineConfig } from 'vitest/config'
import path from 'path'
import { existsSync } from 'fs'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'

const FLAVOR = process.env.FLAVOR || 'komunitin'

// Resolve 'assets/' imports with flavor-specific override support, 
// replicating what vitePluginFlavorAssets does in the Quasar build.
const assetsResolvePlugin = (): Plugin => ({
  name: 'vitest-assets-resolve',
  enforce: 'pre',
  resolveId(id, importer) {
    // Handle bare 'assets/' prefix (used in component imports)
    if (id.startsWith('assets/')) {
      const resolved = path.resolve(__dirname, './src', id)
      const flavorPath = resolved.replace(`${path.sep}assets${path.sep}`, `${path.sep}assets${path.sep}flavors${path.sep}${FLAVOR}${path.sep}`)
      if (existsSync(flavorPath)) {
        return flavorPath
      }
      if (existsSync(resolved)) {
        return resolved
      }
    }
    // Handle absolute paths containing /assets/ (used by other imports)
    if (id.includes('/assets/') && !id.includes('/flavors/')) {
      const flavorPath = id.replace(`${path.sep}assets${path.sep}`, `${path.sep}assets${path.sep}flavors${path.sep}${FLAVOR}${path.sep}`)
      if (existsSync(flavorPath)) {
        return flavorPath
      }
    }
    return null
  }
})

export default defineConfig({
  plugins: [
    vue(),
    assetsResolvePlugin(),
  ],
  resolve: {
    alias: [
      { find: /^quasar$/, replacement: path.resolve(__dirname, './node_modules/quasar/dist/quasar.client.js') },
      { find: 'src', replacement: path.resolve(__dirname, './src') },
      { find: 'app', replacement: path.resolve(__dirname, '.') },
      { find: 'components', replacement: path.resolve(__dirname, './src/components') },
      { find: 'layouts', replacement: path.resolve(__dirname, './src/layouts') },
      { find: 'pages', replacement: path.resolve(__dirname, './src/pages') },
      { find: 'assets', replacement: path.resolve(__dirname, './src/assets') },
      { find: 'boot', replacement: path.resolve(__dirname, './src/boot') },
    ]
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/jest/jest.env.ts'],
    include: [
      'src/**/__tests__/*.spec.ts',
      'src/**/__tests__/*.test.ts',
      'test/jest/__tests__/**/*.spec.ts',
      'test/jest/__tests__/**/*.test.ts',
    ],
    testTimeout: 30000,
    css: false,
    server: {
      deps: {
        inline: ['quasar'],
      }
    },
  },
})
