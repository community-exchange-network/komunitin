import { globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { FontIo, Ot } from 'ot-builder'
import subsetFont from 'subset-font'
import quasarIcons from 'quasar/icon-set/material-symbols-rounded.js'
import marketplaceIcons from '../src/assets/fonts/marketplace-icons.json' with { type: 'json' }

const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789_'
const variationAxes = { FILL: 1, GRAD: 0, opsz: 40, wght: 700 }
const fontAlias = 'komunitin-material-symbols.woff2'

async function buildFont(sourcePath: string, outputDir: string) {
  const missing = new Set(marketplaceIcons)
  for (const match of JSON.stringify(quasarIcons).matchAll(/"sym_r_([a-z0-9_]+)"/g)) missing.add(match[1])
  const candidates = new Set(missing)
  // Includes Vue attributes, bindings and names returned by computed properties.
  for (const file of globSync('src/**/*.{vue,ts,js}', { exclude: ['**/__tests__/**'] })) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/(["'`])(?:sym_r_)?([a-z0-9_]+)\1/g)) candidates.add(match[2])
  }

  const source = readFileSync(sourcePath)
  const instance = await subsetFont(source, alphabet, { targetFormat: 'sfnt', variationAxes })
  const sfnt = FontIo.readSfntOtf(instance)
  const font = FontIo.readFont(sfnt, Ot.ListGlyphStoreFactory)
  const letters = new Map([...alphabet].map(c => [font.cmap.unicode.get(c.charCodeAt(0)), c]))

  // Subsetting by letters alone retains every icon: they all use the same alphabet.
  // Keep only the selected name-to-glyph substitutions before removing unused glyphs.
  for (const lookup of font.gsub.lookups) {
    if (lookup instanceof Ot.Gsub.Ligature) {
      lookup.mapping = lookup.mapping.filter(({ from }) => {
        const name = from.map(glyph => letters.get(glyph)).join('')
        missing.delete(name)
        return candidates.has(name)
      })
    }
  }
  if (missing.size) throw new Error(`Missing Material Symbols Rounded ligatures: ${[...missing].join(', ')}`)

  // Replace only the substitutions table, preserving the other font tables.
  sfnt.tables.set('GSUB', FontIo.writeFont(font).tables.get('GSUB'))
  const subset = await subsetFont(FontIo.writeSfntOtf(sfnt), alphabet, { targetFormat: 'woff2' })
  const output = join(outputDir, 'material-symbols-rounded.woff2')
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(output, subset)
  return output
}

/** Subset the icons font to the icons used in the app and a predefined marketplace catalog. */
export function vitePluginMaterialSymbols(outputDir: string): Plugin {
  // Quasar configures both the SSG client and server in parallel.
  let build: Promise<string> | undefined
  return {
    name: 'komunitin-material-symbols',
    async config(_, { command }) {
      const extras = dirname(fileURLToPath(import.meta.resolve('@quasar/extras/material-symbols-rounded')))
      const [woff2] = globSync('web-font/*.woff2', { cwd: extras })
      const source = join(extras, woff2)
      // Use the full font file in development (command === serve)
      const path = command === 'serve' ? source : await (build ??= buildFont(source, outputDir))
      return { resolve: { alias: { [fontAlias]: path } } }
    }
  }
}
