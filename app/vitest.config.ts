import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';
import tsconfigPaths from 'vite-tsconfig-paths';
import { vitePluginFlavorAssets } from './build-tools/vite-plugin-flavor-assets';
import { vitePluginFlavorPublic } from './build-tools/vite-plugin-flavor-public';
import { vitePluginFlavorOverrideSassVariables } from './build-tools/vite-plugin-flavor-override-sass-variables';

const FLAVOR = process.env.FLAVOR || "komunitin";

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: 'test/vitest/vitest.setup.ts',
    include: [
      // Match all spec and test files in src and test/vitest
      'src/**/__tests__/*.{spec,test}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'test/vitest/__tests__/**/*.{spec,test}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['html', 'text', 'text-summary'],
      reportsDirectory: './test/vitest/coverage',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['**/*.d.ts', '**/node_modules/**']
    },
    testTimeout: 30000,
  },
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    quasar({
      sassVariables: 'src/css/quasar-variables.sass',
    }),
    vitePluginFlavorPublic({
      flavor: FLAVOR
    }),
    vitePluginFlavorAssets({
      flavor: FLAVOR
    }),
    vitePluginFlavorOverrideSassVariables({
      flavor: FLAVOR
    }),
    tsconfigPaths(),
  ],
});
