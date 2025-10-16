import { existsSync } from "fs"
import { dirname, resolve, sep } from "path"
import { type Plugin } from "vite"

interface FlavorAssetsOptions {
  flavor: string
}
export const vitePluginFlavorAssets = (options: FlavorAssetsOptions): Plugin => {
  return {
    name: 'vite-plugin-flavor-assets',
    enforce: 'pre',
    
    resolveId(id, importer) {
      // id never just starts with assets/ because assets/* are aliased to src/assets/*
      if (id.includes("/assets/")) {
        const basePath = importer ? dirname(importer) : process.cwd()
        const absolutePath = resolve(basePath, id)

        const flavourAbsolutePath = absolutePath.replace(`${sep}assets${sep}`, `${sep}assets${sep}flavors${sep}${options.flavor}${sep}`)
        if (existsSync(flavourAbsolutePath)) {
          //console.log(`✓ Found flavor-specific asset: ${flavourAbsolutePath}`)
          return flavourAbsolutePath
        }
      }
      return null
    }
  }

}