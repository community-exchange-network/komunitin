import { existsSync } from "fs"
import { resolve } from "path"
import { Plugin } from "vite"

interface FlavorAssetsOptions {
  flavor: string
}
export const vitePluginFlavorAssets = (options: FlavorAssetsOptions): Plugin => {
  return {
    name: 'vite-plugin-flavor-assets',
    enforce: 'pre',
    
    resolveId(id, importer) {
      if (id.indexOf("/assets/") !== -1) {
        const absolutePath = resolve(importer ?? process.cwd(), id)
        const flavourAbsolutePath = absolutePath.replace("/assets/", `/assets/flavors/${options.flavor}/`)
        if (existsSync(flavourAbsolutePath)) {
          //console.log(`✓ Found flavor-specific asset: ${flavourAbsolutePath}`)
          return flavourAbsolutePath
        }
      }
      return null
    }
  }

}