import { existsSync, watch, cpSync, writeFileSync } from "fs"
import { resolve } from "path"
import { type Plugin } from "vite"

interface FlavorOverrideOptions {
  flavor: string
}

export const vitePluginFlavorOverrideSass = (options: FlavorOverrideOptions): Plugin => {
  const sourcePath = resolve(process.cwd(), `src/css/flavors/${options.flavor}/override.sass`)
  const destPath = resolve(process.cwd(), "src/css/override.sass")
  
  const copyOverrideFile = () => {
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, destPath, {force: true})
      console.log(`✓ Copied flavor override: ${sourcePath} → ${destPath}`)
    } else {
      // Create an empty override.sass as a safe fallback  
      writeFileSync(destPath, '')
      console.warn(`⚠ Flavor override file not found: ${sourcePath}`)
    }
  }

  return {
    name: 'vite-plugin-flavor-override',
    enforce: 'pre',
    
    buildStart() {
      copyOverrideFile()
    },

    configureServer(server) {
      if (existsSync(sourcePath)) {
        const watcher = watch(sourcePath, (eventType) => {
          if (eventType === 'change') {
            copyOverrideFile()
          }
        })
        
        server.httpServer?.on('close', () => {
          watcher.close()
        })
      }
    }
  }
}