import { boot } from 'quasar/wrappers'

// Boot file to set up a custom icon mapping function for Quasar. This allows us to use Material Symbols Rounded icons
// without needing to prefix them with 'sym_r_' in our templates. For example, we can use 'home' instead of 'sym_r_home'.
export default boot(({ app }) => {
  app.config.globalProperties.$q.iconMapFn = (iconName:string) => {
    // If the icon name doesn't already have a known prefix
    // and doesn't start with 'sym_r_', add it automatically.
    if (iconName && !iconName.startsWith('sym_r_') && !iconName.includes(' ')) {
      return {
        cls: 'material-symbols-rounded', // The CSS class for the font
        content: iconName                // The original ligated name
      }
    }
  }
})
