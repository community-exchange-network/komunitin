// Configuration for your app
import { defineConfig } from "#q-app/wrappers"
import { existsSync, readFileSync } from "fs"
import vitePluginChecker from 'vite-plugin-checker'
import { vitePluginFlavorPublic } from './build-tools/vite-plugin-flavor-public'
import { vitePluginFlavorAssets } from './build-tools/vite-plugin-flavor-assets'
import { vitePluginFlavorOverrideSassVariables } from './build-tools/vite-plugin-flavor-override-sass-variables'

// Quasar loads .env files, but they are not available in quasar.config.ts. They are only
// available in the app code. So we need to load them ourselves here. Also, we pass the 
// loaded env variables to the app UI code via the build.env property below because otherwise
// Quasar converts "true" to true and this is not consistent with runtime replacement.
// See issue https://github.com/quasarframework/quasar/issues/17917
import { config } from "dotenv"
import { vitePluginFlavorOverrideI18n } from "./build-tools/vite-plugin-flavor-override-i18n"
config()

const APP_VERSION = process.env.npm_package_version || "0.0.0"
const FLAVOR = process.env.FLAVOR || "komunitin"

if (existsSync(`.env.flavor.${FLAVOR}`)) {
  config({ path: `.env.flavor.${FLAVOR}` })
} else {
  console.warn(`⚠ Flavor-specific .env file not found: .env.flavor.${FLAVOR}`)
}

console.log(`App version: ${APP_VERSION}`)
console.log(`App flavor: ${FLAVOR}`)
//console.log(process.env)

export default defineConfig((ctx) => {
  const isPwa = "pwa" in ctx.mode && ctx.mode.pwa
  const isSpa = "spa" in ctx.mode && ctx.mode.spa

  return {
    // app boot file (/src/boot)
    // --> boot files are part of "main.js"
    // https://quasar.dev/quasar-cli/cli-documentation/boot-files
    boot: [
      "errors",
      "i18n",
      "auth",
      "gtm",
      "store",
      ...(process.env.MOCK_ENABLE === "true" ? ["mirage"]: [])
    ],

    // https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-css
    css: [
      "app.sass",
    ],

    vendor: {
      remove: ['@quasar/quasar-ui-qiconpicker']
    },

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
      all: "auto",
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

    supportTS: {
      tsCheckerConfig: {
        eslint: {
          enabled: true,
          files: './src/**/*.{ts,tsx,js,jsx,vue}'
        }
      }
    },

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-build
    build: {
      
      vueRouterMode: "history", // available values: 'hash', 'history'
      analyze: true,
      // Quasar overrides boolean true to 'inline' internally, we use the string to 
      // bypass that. See https://github.com/quasarframework/quasar/issues/14589.
      sourcemap: "true" as unknown as boolean,      
      env: {
        // Although quasar reads .env file, it does not pass the runtime environment variables.
        // In production this values will be overridden at runtime by the config.js file created
        // by the docker entrypoint script.
        ...process.env,
        APP_VERSION,
      },
      vitePlugins: [
        [vitePluginChecker, {
          eslint: {
            lintCommand: 'eslint "./src*/**/*.{ts,js,mjs,cjs,vue}"',
            useFlatConfig: true,
            watchPath: ['./src', './src-pwa']
          }
        }, {server: false}],
        [vitePluginFlavorPublic, {
          flavor: FLAVOR
        }],
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
      productName: process.env.PRODUCT_NAME,
      productDescription: process.env.PRODUCT_DESCRIPTION
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
        ca: readFileSync(process.env.LOCAL_CA_ROOT ?? "~/.local/share/mkcert/rootCA.pem")
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

    // https://quasar.dev/quasar-cli/developing-pwa/configuring-pwa
    pwa: {
      workboxMode: 'InjectManifest', // 'GenerateSW' or 'InjectManifest'
      
    },
  };
});
