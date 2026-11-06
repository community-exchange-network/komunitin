import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { loadEnvironment } from '../../build-tools/environment.ts'
import { precacheUrls } from './utils/precache.ts'

const dist = resolve('dist/ssg')
const origin = 'https://ssg.test'
const read = (file: string) => readFileSync(resolve(dist, file), 'utf8')
// JSDOM does not execute scripts: these assertions inspect the deployed HTML only.
const home = new JSDOM(read('index.html'), { url: `${origin}/` }).window.document
const shell = new JSDOM(read('csr.html'), { url: `${origin}/groups/example` }).window.document
const { FLAVOR: flavor, PRODUCT_NAME: productName } = loadEnvironment()
const messages = JSON.parse(readFileSync('src/i18n/en-us/index.json', 'utf8')) as Record<string, string>
const overrides = `src/i18n/flavors/${flavor}/en-us/index.json`
if (existsSync(overrides)) Object.assign(messages, JSON.parse(readFileSync(overrides, 'utf8')) as Record<string, string>)

function assertBuiltAsset(url: string) {
  const asset = new URL(url, origin)
  if (asset.origin === origin) {
    assert.ok(statSync(resolve(dist, asset.pathname.slice(1))).isFile(), `Expected a built file: ${url}`)
  }
}

test('the landing page contains English content and navigation without JavaScript', () => {
  assert.equal(home.documentElement.lang.toLowerCase(), 'en-us')
  assert.equal(home.title, productName)
  assert.ok(home.body.textContent.includes(messages.openSystemForExchangeCommunities))
  assert.ok(home.querySelector('a[href="/groups"]')?.textContent.includes(messages.findYourLocalGroup))
  assert.ok(home.querySelector('a[href="/login-mail"]')?.textContent.includes(messages.logIn))
})

test('the landing page references built styles and images', () => {
  const styles = [...home.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
  const images = [...home.querySelectorAll<HTMLImageElement>('img')]
  assert.ok(styles.length > 0, 'The static page needs styles before the app starts')
  assert.ok(images.length > 0, 'The static page should include its logo')
  for (const style of styles) assertBuiltAsset(style.href)
  for (const image of images) assertBuiltAsset(image.src)
})

test('the PWA manifest uses the same colors as the built app', () => {
  for (const document of [home, shell]) {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    assert.ok(link, 'The app needs a PWA manifest')
    const manifest = JSON.parse(read(new URL(link.href).pathname.slice(1)))
    const css = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
      .map(style => read(new URL(style.href).pathname.slice(1))).join('\n')
    const primary = css.match(/--q-primary:\s*([^;}]+)/)?.[1]
    const background = css.match(/\.bg-background\s*\{\s*background:\s*([^;}]+)/)?.[1]

    assert.ok(primary, 'The built app needs a primary color')
    assert.ok(background, 'The built app needs a background color')
    assert.equal(manifest.theme_color.toLowerCase(), primary.toLowerCase())
    assert.equal(manifest.background_color.toLowerCase(), background.toLowerCase())
  }
})

test('both entry pages include the app and runtime configuration', () => {
  for (const [name, document] of [['landing page', home], ['fallback shell', shell]] as const) {
    assert.ok(document.querySelector('#q-app'), `${name}: missing app container`)
    const entry = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
    assert.ok(entry, `${name}: missing app script`)
    assertBuiltAsset(entry.src)
    const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[src]')]
    // config.js is created at container startup, so it is not a built asset.
    assert.ok(scripts.some(script => new URL(script.src).pathname === '/config.js'),
      `${name}: missing runtime configuration`)
  }
})

test('the fallback shell has no prerendered page and the HTML opts out of hydration', () => {
  assert.equal(shell.querySelector('#q-app')?.textContent.trim(), '')
  // This HTML marker is the Quasar contract used by our custom SSG renderer.
  // Actual mounting and locale/session restoration require a browser test.
  for (const document of [home, shell]) {
    assert.equal(document.body.hasAttribute('data-server-rendered'), false)
  }
})

test('static generation does not add JavaScript preloads for the default language or page', () => {
  const preloads = (document: Document) => [...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')]
    .map(link => link.href)
  const shellPreloads = new Set(preloads(shell))
  for (const url of preloads(home)) {
    assert.ok(shellPreloads.has(url), `Static generation added a JavaScript preload: ${url}`)
  }
})

test('the service worker precaches the fallback shell and only deployed assets', () => {
  const urls = precacheUrls(read('sw.js'))
  assert.ok(urls.includes('csr.html'), 'Offline navigation needs the fallback shell')
  assert.ok(!urls.includes('index.html'), 'Controlled root navigation must use the fallback shell')
  assert.equal(existsSync(resolve(dist, '__ssg__')), false, 'Temporary renderer files should not be deployed')
  for (const url of urls) {
    assert.ok(!url.startsWith('__ssg__/'), `Renderer files should not be precached: ${url}`)
    assertBuiltAsset(url)
    assert.ok(!url.endsWith('.map'), `Source maps should not consume offline storage: ${url}`)
  }
})
