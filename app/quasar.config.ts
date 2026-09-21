// Configuration for your app
import { defineConfig } from "#q-app"
import { readFileSync } from "node:fs"
import vitePluginChecker from 'vite-plugin-checker'
import { vitePluginFlavorPublic } from './build-tools/vite-plugin-flavor-public'
import { vitePluginFlavorAssets } from './build-tools/vite-plugin-flavor-assets'
import { vitePluginFlavorOverrideSassVariables } from './build-tools/vite-plugin-flavor-override-sass-variables'
import { vitePluginFlavorOverrideI18n } from "./build-tools/vite-plugin-flavor-override-i18n"
import { getThemeColors } from "./build-tools/manifest-utils"
import { loadEnvironment } from './build-tools/environment'

export default defineConfig((ctx) => {
  const environment = loadEnvironment()
  const { FLAVOR } = environment
  const isPwa = "pwa" in ctx.mode && ctx.mode.pwa
  const isSpa = "spa" in ctx.mode && ctx.mode.spa

  return {
    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://quasar.dev/quasar-cli/cli-documentation/boot-files
    boot: [
      { path: "errors", server: false },
      "i18n",
      { path: "auth", server: false },
      "store",
      { path: "push-notifications", server: false },
      ...(environment.FEAT_GTM === "true" ? [{ path: "gtm", server: false as const }] : []),
      ...(environment.FEAT_MATOMO === "true" ? [{ path: "matomo", server: false as const }] : []),
      ...(environment.MOCK_ENABLE === "true" ? [{ path: "mirage", server: false as const }] : [])
    ],

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-css
    css: [
      "app.sass",
    ],

    // https://github.com/quasarframework/quasar/tree/dev/extras
    extras: [
      // 'ionicons-v4',
      // 'mdi-v4',
      // 'fontawesome-v5',
      // 'eva-icons',
      // 'themify',
      // 'roboto-font-latin-ext', // this or either 'roboto-font', NEVER both!

      "roboto-font", // optional, you are not bound to it
      "material-icons" // optional, you are not bound to it
    ],

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-framework
    framework: {
      iconSet: "material-icons", // Quasar icon set
      lang: "en-US", // Quasar language pack


      // Quasar plugins
      plugins: ["Notify", "LocalStorage", "Loading"],
      config: {
        notify: {
          /* Notify defaults */
        }
      }
    },

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-build
    build: {
      
      vueRouterMode: "history", // available values: 'hash', 'history'
      // Existing Options API components still need Vue's runtime support.
      vueOptionsAPI: true,
      sourcemap: true,      
      defineEnv: environment,
      vitePlugins: [
        ctx.prod ? ['rollup-plugin-visualizer', { filename: 'dist/stats.html', gzipSize: true }, { server: false }] : null,
        [vitePluginChecker, {
          eslint: {
            lintCommand: 'eslint "./src*/**/*.{ts,js,mjs,cjs,vue}"',
            useFlatConfig: true,
            watchPath: ['./src', './src-pwa']
          }
        }, {server: false}],
        [vitePluginFlavorPublic, {
          flavor: FLAVOR
        }, { server: false }],
        [vitePluginFlavorAssets, {
          flavor: FLAVOR
        }],
        [vitePluginFlavorOverrideSassVariables, {
          flavor: FLAVOR
        }],
        [vitePluginFlavorOverrideI18n, {
          flavor: FLAVOR
        }]
      ]
    },

    htmlVariables: {
      configStamp: Date.now(),
      productName: environment.PRODUCT_NAME,
      productDescription: environment.PRODUCT_DESCRIPTION
    },


    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-devServer
    // Only define the dev server when on dev mode, since otherwise we don't need to configure
    // local certificates.
    devServer: ctx.dev ? {
      host: "0.0.0.0",
      port: isPwa ? 2030 : (isSpa ? 2031 : 2032),
      open: true,
      https: {
        key: readFileSync("./tmp/certs/localhost-key.pem"),
        cert: readFileSync("./tmp/certs/localhost.pem"),
        ca: readFileSync(process.env.LOCAL_CA_ROOT ?? environment.LOCAL_CA_ROOT ?? "~/.local/share/mkcert/rootCA.pem")
      },
      // Disable auto updating when checking PWA update process.
      // hot: false,
      // liveReload: false
    } : {},

    // animations: 'all', // --- includes all animations
    // https://quasar.dev/options/animations
    animations: [
      "fadeInDown",
      "fadeOutUp"
    ],

    ssg: {
      pwa: true,
      error404HtmlFilename: false,
      pwaOfflineHtmlFilename: 'csr.html',
      clientSideRenderingRoutes: ['/?*', '/?*/**'],
      extendSSGInjectManifestOptions(options) {
        // Exclude temporary renderer files, which Quasar deletes after generation.
        options.globIgnores!.push('__ssg__/**/*')
      }
    },

    // https://quasar.dev/quasar-cli/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'InjectManifest', // 'GenerateSW' or 'InjectManifest'

      extendPWACustomSWConf() {
        // Rolldown leaves unset env accesses as {}.env.KEY, which throws on startup.
        return { transform: { define: { 'import.meta.env': '{}' } } }
      },

      extendPWAManifestJson(manifest) {
        manifest.name = environment.PRODUCT_NAME || "Komunitin"
        manifest.short_name = environment.PRODUCT_NAME
        manifest.description = environment.PRODUCT_DESCRIPTION
        const colors = getThemeColors(FLAVOR)
        manifest.theme_color = colors.primary
        manifest.background_color = colors.background
      }
    },
  };
});
