import { defineConfig } from 'vitest/config'
import path from 'path'
import vue from '@vitejs/plugin-vue'
import { vitePluginFlavorAssets } from './build-tools/vite-plugin-flavor-assets'

const FLAVOR = process.env.FLAVOR || 'komunitin'

export default defineConfig({
  plugins: [
    vue(),
    vitePluginFlavorAssets({ flavor: FLAVOR }),
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
    setupFiles: ['./test/vitest/setup.ts'],
    include: [
      'src/**/__tests__/*.spec.ts',
      'src/**/__tests__/*.test.ts',
      'test/vitest/__tests__/**/*.spec.ts',
      'test/vitest/__tests__/**/*.test.ts',
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
