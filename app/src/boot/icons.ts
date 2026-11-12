import { boot } from 'quasar/wrappers'

export default boot(({ app }) => {
  // Templates and category records use bare ligatures. Quasar uses sym_r_ for this font.
  app.config.globalProperties.$q.iconMapFn = (name: string) => {
    if (/^[a-z0-9_]+$/.test(name) && !name.startsWith('sym_')) {
      return { icon: `sym_r_${name}` }
    }
  }
})
