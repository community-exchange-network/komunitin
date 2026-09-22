import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { parse } from 'acorn'
import { JSDOM } from 'jsdom'
import { loadEnvironment } from '../../build-tools/environment.ts'

const dist = resolve('dist/ssg')
const read = file => readFileSync(resolve(dist, file), 'utf8')
const rootHtml = read('index.html')
const shellHtml = read('csr.html')
const root = new JSDOM(rootHtml).window.document
const shell = new JSDOM(shellHtml).window.document
const { FLAVOR: flavor, PRODUCT_NAME: productName } = loadEnvironment()
const messages = JSON.parse(readFileSync('src/i18n/en-us/index.json', 'utf8'))
const overrides = `src/i18n/flavors/${flavor}/en-us/index.json`
if (existsSync(overrides)) Object.assign(messages, JSON.parse(readFileSync(overrides, 'utf8')))

test('root is readable and styled without executing JavaScript', () => {
  assert.equal(root.documentElement.lang.toLowerCase(), 'en-us')
  assert.equal(root.title, productName)
  assert.equal(root.querySelector('.q-layout').style.minHeight, '100vh')
  assert.equal(root.querySelector('#slogan').textContent.trim(), messages.openSystemForExchangeCommunities)
  assert.equal(root.querySelector('#explore').getAttribute('href'), '/groups')
  assert.ok(root.querySelector('#explore').textContent.includes(messages.findYourLocalGroup))
  assert.equal(root.querySelector('#login').getAttribute('href'), '/login-mail')
  assert.ok(root.querySelector('#login').textContent.includes(messages.logIn))
  const logo = root.querySelector('img.logo').getAttribute('src')
  assert.ok(logo.startsWith('data:image/') || existsSync(resolve(dist, logo.replace(/^\//, ''))))
  const styles = [...root.querySelectorAll('link[rel="stylesheet"]')]
  assert.ok(styles.length > 0)
  for (const link of styles) assert.ok(existsSync(resolve(dist, link.getAttribute('href').replace(/^\//, ''))))
})

test('both documents mount normally and only root contains generated content', () => {
  assert.equal(shell.querySelector('#q-app').innerHTML, '')
  for (const [document, html] of [[root, rootHtml], [shell, shellHtml]]) {
    assert.equal(document.body.hasAttribute('data-server-rendered'), false)
    assert.ok(!html.includes('__INITIAL_STATE__'))
    const entry = document.querySelector('script[type="module"][src]')
    assert.ok(entry)
    assert.ok(existsSync(resolve(dist, entry.getAttribute('src').replace(/^\//, ''))))
    assert.ok(document.querySelector('script[src^="/config.js?"]'))
  }
  // SSG must not add JS preloads (notably English) beyond the CSR shell's own.
  const preloads = document => [...document.querySelectorAll('link[rel="modulepreload"]')].map(link => link.href).sort()
  assert.deepEqual(preloads(root), preloads(shell))
  assert.equal(existsSync(resolve(dist, '404.html')), false)
  assert.equal(existsSync(resolve(dist, '__ssg__')), false)
})

test('Quasar still selects normal mounting when the hydration marker is absent', () => {
  // This deliberate dependency on Quasar internals must be reviewed on upgrades.
  const appEntry = readFileSync('.quasar/prod-ssg/app.js', 'utf8')
  const clientEntry = readFileSync('.quasar/prod-ssg/client-entry.js', 'utf8')
  assert.match(appEntry, /isClientSideRenderedPage\s*=\s*typeof window !== 'undefined' &&\s*document\.body\.getAttribute\('data-server-rendered'\) === null/)
  assert.match(clientEntry, /isClientSideRenderedPage \? createApp : createSSRApp/)
})

test('service worker precaches the CSR shell and only deployed files', () => {
  // Read the actual compiled manifest, independently of minified identifier names.
  const manifests = []
  const visit = node => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ArrayExpression' && node.elements.length && node.elements.every(element =>
      element?.type === 'ObjectExpression' && element.properties.some(property =>
        (property.key.name || property.key.value) === 'revision'
      )
    )) manifests.push(node.elements)
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else visit(value)
    }
  }
  visit(parse(read('sw.js'), { ecmaVersion: 'latest' }))
  assert.equal(manifests.length, 1)
  const urls = manifests[0].map(entry => {
    const value = entry.properties.find(property => (property.key.name || property.key.value) === 'url').value
    return value.type === 'TemplateLiteral' ? value.quasis[0].value.cooked : value.value
  })
  assert.ok(urls.includes('csr.html'))
  assert.ok(!urls.includes('index.html'))
  for (const url of urls) {
    assert.ok(!url.startsWith('__ssg__/'), url)
    assert.ok(existsSync(resolve(dist, url)), url)
  }
})
