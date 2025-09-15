import { MaybeRefOrGetter, toValue } from "@vueuse/shared"
import { KOptions } from "../boot/koptions"
import { useStore } from "vuex"
import { checkFetchResponse } from "../KError"

// Extract filename from simple Content-Disposition header: attachment; filename="<name>"
function attachmentFilename(res: Response, defaultName: string): string {
  const header = res.headers.get("content-disposition")
  if (!header) return defaultName
  const match = header.match(/attachment;\s*filename="?([^";]+)"?/i)
  return match?.[1] || defaultName
}

/**
 * Download a file from a URL using a Bearer token.
 */
export async function downloadFile(url: string, token: string, defaultName = "download"): Promise<void> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  })

  await checkFetchResponse(res)
  const suggestedName = attachmentFilename(res, defaultName)

  const blob = await res.blob()

  // I've experimented with streaming to disk via File System Access API,
  // (see https://developer.mozilla.org/en-US/docs/Web/API/FileSystemWritableFileStream/write)
  // which is large-file friendly, but then the file is not visible in the browser's
  // downloads list and the overall UX is different from traditional downloads.
  // So for now we just use Blob + object URL.

  const objectUrl = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = suggestedName || defaultName
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export const useTransfersCsv = (opts: {
    code: MaybeRefOrGetter<string>,
    from?: MaybeRefOrGetter<Date | null>,
    to?: MaybeRefOrGetter<Date | null>,
    query?: MaybeRefOrGetter<string | null>,
    account?: MaybeRefOrGetter<string | null>
  }) => {
  const store = useStore()

  const download = async () => {
    const base = KOptions.url.accounting
    const params = new URLSearchParams()

    const code = toValue(opts.code)
    const from = toValue(opts.from)
    const to = toValue(opts.to)
    const query = toValue(opts.query)
    const account = toValue(opts.account)

    if (from) params.set("filter[from]", from.toISOString())
    if (to) params.set("filter[to]", to.toISOString())
    if (query) params.set("filter[search]", query)
    if (account) params.set("filter[account]", account)

    const url = `${base}/${code}/transfers.csv?${params.toString()}`
    const token = store.getters.accessToken
    await downloadFile(url, token, "transfers.csv")
  }

  return { download }
}