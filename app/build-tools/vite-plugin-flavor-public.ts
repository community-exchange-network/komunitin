import fs from 'fs'
import path from 'path'
import { type Plugin } from "vite"


interface FlavorPublicOptions {
  flavor: string
}

export function vitePluginFlavorPublic(options: FlavorPublicOptions): Plugin {
  const flavor = options.flavor
  let destDir = 'dist'

  const copyFlavorPublicFiles = () => {
    const flavorDir = path.join('public', 'flavors', flavor)
    // Copy flavor assets to public root
    console.log(`📁 Copying ${flavor} public files`)
    fs.cpSync(flavorDir, destDir, { recursive: true, force: true })
    
    // Remove flavors directory
    console.log(`🗑️  Removing unnecessary flavor files`)
    fs.rmSync(path.join(destDir, 'flavors'), { recursive: true, force: true })
  }

  return {
    name: 'vite-plugin-flavor-public',
    configResolved(config) {
      destDir = config.build.outDir
    },
    buildStart() {
      copyFlavorPublicFiles()
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (fs.existsSync(path.join('public', 'flavors', flavor, req.url || ''))) {
          req.url = `/${req.url}`.replace(`/${req.url}`, `/flavors/${flavor}/${req.url}`)
        }
        next()
      })
    }

  }
}
