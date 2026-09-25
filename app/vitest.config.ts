import { defineConfig } from 'vitest/config'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { vitePluginFlavorAssets } from './build-tools/vite-plugin-flavor-assets.ts'
import { loadEnvironment } from './build-tools/environment.ts'

const environment = loadEnvironment('.env.test')
const { FLAVOR } = environment

export default defineConfig({
  plugins: [
    vue(),
    vitePluginFlavorAssets({ flavor: FLAVOR }),
  ],
  resolve: {
    alias: [
      { find: /^quasar$/, replacement: path.resolve(import.meta.dirname, './node_modules/quasar/dist/quasar.client.js') },
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      { find: '#q-app', replacement: '@quasar/app-vite' },
    ]
  },
  test: {
    globals: true,
    environment: 'jsdom',
    env: {
      ...environment,
      MOCK_ENVIRONMENT: 'test',
      // Leave QUASAR_DEV and QUASAR_SERVER unset: test.env values are strings.
      QUASAR_MODE: 'pwa',
      QUASAR_VUE_ROUTER_MODE: 'history',
      QUASAR_VUE_ROUTER_BASE: '/',
    },
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
