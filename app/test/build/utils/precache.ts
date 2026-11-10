import assert from 'node:assert/strict'
import { parse } from 'acorn'
import type { AnyNode, ObjectExpression, Property } from 'acorn'

function propertyValue(node: ObjectExpression, name: string) {
  return node.properties.find((property): property is Property =>
    property.type === 'Property' && (
      (property.key.type === 'Identifier' && property.key.name === name) ||
      (property.key.type === 'Literal' && property.key.value === name)
    )
  )?.value
}

function isPrecacheEntry(node: AnyNode | null): node is ObjectExpression {
  return node?.type === 'ObjectExpression'
    && propertyValue(node, 'url') !== undefined
    && propertyValue(node, 'revision') !== undefined
}

/** Read injected Workbox { url, revision } entries without depending on minified names. */
export function precacheUrls(source: string) {
  const entries: ObjectExpression[] = []
  function visit(value: unknown) {
    if (value && typeof value === 'object') {
      const node = value as AnyNode
      if (node.type === 'ArrayExpression' && node.elements.every(isPrecacheEntry)) {
        entries.push(...node.elements)
      }
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(visit)
        else visit(child)
      }
    }
  }
  visit(parse(source, { ecmaVersion: 'latest' }))
  assert.ok(entries.length > 0, 'No injected Workbox precache entries found')

  return entries.map(entry => {
    const value = propertyValue(entry, 'url')
    assert.ok(value?.type === 'Literal' || (value?.type === 'TemplateLiteral' && value.expressions.length === 0),
      'Expected a static precache URL')
    const url = value.type === 'Literal' ? value.value : value.quasis[0].value.cooked
    assert.ok(typeof url === 'string', 'Expected a string precache URL')
    return url
  })
}
