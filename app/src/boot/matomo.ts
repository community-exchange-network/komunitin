import { boot } from "quasar/wrappers"
import { config } from "src/utils/config"

type MatomoCommand = [string, ...unknown[]]

declare global {
  interface Window {
    _paq?: MatomoCommand[]
  }
}

const createMatomoScript = (baseUrl: string) => {
  if (document.getElementById("matomo-tracker-script")) {
    return
  }

  const script = document.createElement("script")
  script.id = "matomo-tracker-script"
  script.async = true
  script.src = `${baseUrl}/matomo.js`
  document.head.appendChild(script)
}

const trackPageView = (path: string) => {
  window._paq?.push(["setCustomUrl", path])
  window._paq?.push(["setDocumentTitle", document.title])
  window._paq?.push(["trackPageView"])
}

/**
 * Add Matomo analytics to the app and track page views on route changes.
 */
export default boot(({ router }) => {
  const matomoUrl = config.MATOMO_URL
  const matomoSiteId = config.MATOMO_SITE_ID

  if (!matomoUrl || !matomoSiteId) {
    return
  }

  const baseUrl = matomoUrl.replace(/\/+$/, "")
  window._paq = window._paq || []

  window._paq.push(["setTrackerUrl", `${baseUrl}/matomo.php`])
  window._paq.push(["setSiteId", matomoSiteId])
  window._paq.push(["enableLinkTracking"])

  trackPageView(router.currentRoute.value.fullPath)
  router.afterEach((to) => trackPageView(to.fullPath))

  createMatomoScript(baseUrl)
})
