import { defineSsgGetPages, defineSsgRenderPreloadTag } from '#q-app'

export const getSsgPages = defineSsgGetPages(() => [{
  route: '/',
  // Quasar selects normal client mounting when this body attribute is absent.
  // The static English page is replaced using the visitor's language and session.
  transformHtml: html => html.replace(/\sdata-server-rendered(?:="[^"]*")?/, '')
}])

// Filter out js files from the preload tags, only include CSS.
export const renderPreloadTag = defineSsgRenderPreloadTag(file =>
  file.endsWith('.css') ? `<link rel="stylesheet" href="${file}" crossorigin>` : ''
)
