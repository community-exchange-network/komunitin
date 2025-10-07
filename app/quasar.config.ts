// Configuration for your app
import { defineConfig } from "#q-app/wrappers"
import fs from "fs"

// Quasar loads .env files, but they are not available in quasar.config.ts. They are only
// available in the app code. So we need to load them ourselves here. Also, we pass the 
// loaded env variables to the app UI code via the build.env property below because otherwise
// Quasar converts "true" to true and this is not consistent with runtime replacement.
// See issue https://github.com/quasarframework/quasar/issues/17917
import { config } from "dotenv"
config()

const version = process.env.npm_package_version || "0.0.0"
console.log(`App version: ${version}`)
//console.log(process.env)

export default defineConfig((ctx) => {
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
    css: ["app.sass"],

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
      transpile: false,
      scopeHoisting: true,
      vueRouterMode: "history", // available values: 'hash', 'history'
      showProgress: true,
      gzip: false,
      analyze: false,
      sourceMap: true,
      // Options below are automatically set depending on the env, set them if you want to override
      // preloadChunks: false,
      // extractCSS: false,

     
      // Create complete source maps to enable debugging from VSCode.
      // https://quasar.dev/start/vs-code-configuration#Debugging-a-Quasar-project-in-VS-Code
      devtool: "source-map",
      env: {
        ...(ctx.dev ? process.env : {}),
        APP_VERSION: version
      },
    },

    // Full list of options: https://quasar.dev/quasar-cli/quasar-conf-js#Property%3A-devServer
    // Only define the dev server when on dev mode, since otherwise we don't need to configure
    // local certificates.
    devServer: ctx.dev ? {
      host: "0.0.0.0",
      port: ctx.mode.pwa ? 2030 : (ctx.mode.spa ? 2031 : 2032),
      open: true,
      https: {
        key: fs.readFileSync("./tmp/certs/localhost-key.pem"),
        cert: fs.readFileSync("./tmp/certs/localhost.pem"),
        ca: fs.readFileSync(process.env.LOCAL_CA_ROOT ?? "~/.local/share/mkcert/rootCA.pem")
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
      workboxMode: 'InjectManifest',//"InjectManifest", // 'GenerateSW' or 'InjectManifest'
      
    },
  };
});
