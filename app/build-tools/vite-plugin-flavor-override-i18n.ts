import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { sep } from "path"
import type { Plugin } from "vite"

interface FlavorOverrideI18nOptions {
  flavor: string
}

export const vitePluginFlavorOverrideI18n = (options: FlavorOverrideI18nOptions): Plugin => {
  return {
    name: 'vite-plugin-flavor-override-i18n',
    
    async load(id) {
      if (id.includes('/i18n/') && id.endsWith('.json')) {
        const baseContent = await readFile(id, 'utf8')
        const baseMessages = JSON.parse(baseContent)
        
        // Use same pattern as assets plugin for path building
        const flavorOverridePath = id.replace(`${sep}i18n${sep}`, `${sep}i18n${sep}flavors${sep}${options.flavor}${sep}`)
        
        if (existsSync(flavorOverridePath)) {
          const overrideContent = await readFile(flavorOverridePath, 'utf8')
          const overrideMessages = JSON.parse(overrideContent)
          const merged = { ...baseMessages, ...overrideMessages }
          
          console.log(`📝 Merging i18n overrides at ${flavorOverridePath}`)
          return JSON.stringify(merged, null, 2)
        }
        
        // Return original JSON if no overrides
        return baseContent
      }
      
      return null
    },
    
    configureServer(server) {
      // Watch for override changes in dev mode      
      server.watcher.on('change', (file) => {
        if (file.includes('/i18n/flavors/') && file.endsWith('.json')) {
          console.log(`🔄 i18n override changed: ${file}`)
          
          // Find the corresponding base file to invalidate
          const basePath = file.replace(/\/flavors\/[^/]+\//, '/')
          const module = server.moduleGraph.getModuleById(basePath)
          if (module) {
            server.reloadModule(module)
          }
        }
      })
    }
  }
}