import fs, { existsSync } from 'fs'
import {join} from 'path'
import { type Plugin } from "vite"


interface FlavorPublicOptions {
  flavor: string
}

export function vitePluginFlavorPublic(options: FlavorPublicOptions): Plugin {
  const flavor = options.flavor
  let destDir = 'dist'

  const copyFlavorPublicFiles = () => {
    const flavorDir = join('public', 'flavors', flavor)
    if (existsSync(flavorDir)) {
      // Copy flavor assets to public root
      console.log(`📁 Copying ${flavor} public files`)
      fs.cpSync(flavorDir, destDir, { recursive: true, force: true })
    } else {
      console.warn(`⚠ Flavor public directory not found`)
    }
    // Remove flavors directory
    console.log(`🗑️ Removing unnecessary flavor files`)
    fs.rmSync(join(destDir, 'flavors'), { recursive: true, force: true })
  }

  return {
    name: 'vite-plugin-flavor-public',
    configResolved(config) {
      destDir = config.build.outDir
    },
    writeBundle() {
      copyFlavorPublicFiles()
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) {
          return next()
        }
        const [pathname] = req.url.split('?')
        if (fs.existsSync(join('public', 'flavors', flavor, pathname))) {
          // Rewrite request to serve flavor-specific file
          req.url = `/flavors/${flavor}/${pathname}`
        }
        next()
      })
    }

  }
}
