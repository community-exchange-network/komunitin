import type { MaybeRefOrGetter} from "@vueuse/shared";
import { toValue } from "@vueuse/shared"
import { config } from "src/utils/config"
import { useStore } from "vuex"
import { checkFetchResponse } from "../KError"

// Extract filename from simple Content-Disposition header: attachment; filename="<name>"
function attachmentFilename(res: Response, filename?: string): string {
  if (!filename) {
    const header = res.headers.get("content-disposition")
    const match = header.match(/attachment;\s*filename="?([^";]+)"?/i)
    filename = match?.[1] || "download.csv"
  }
  return filename
}

/**
 * Download a file from a URL using a Bearer token.
 */
export async function downloadFile(url: string, token: string, filename?: string): Promise<void> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  })

  await checkFetchResponse(res)
  filename = attachmentFilename(res, filename)

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
    a.download = filename
    a.style.display = "none"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const filterParams = (params: URLSearchParams, filter: Record<string, string | string[]> | undefined): URLSearchParams => {
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      if (!(value === undefined || value === null || value === "")) {
        if (Array.isArray(value)) { 
          value = value.join(",") 
        } 
        params.set(`filter[${key}]`, value) 
      }
    })
  }
  return params
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
    const base = config.ACCOUNTING_URL
    const params = new URLSearchParams()

    const code = toValue(opts.code)
    const filter = {
      from: toValue(opts.from)?.toISOString(),
      to: toValue(opts.to)?.toISOString(),
      search: toValue(opts.query),
      account: toValue(opts.account)
    }
    filterParams(params, filter)

    const url = `${base}/${code}/transfers.csv` + (params.size > 0 ? `?${params.toString()}` : "")
    const token = store.getters.accessToken
    await downloadFile(url, token, "transfers.csv")
  }

  return { download }
}

export const useAccountsCsv = (opts: {
  code: MaybeRefOrGetter<string>,
  filter?: MaybeRefOrGetter<Record<string, string | string[]>>
}) => {
  const store = useStore()

  const download = async () => {
    const base = config.ACCOUNTING_URL
    const code = toValue(opts.code)
    
    const params = new URLSearchParams()
    filterParams(params, toValue(opts.filter))

    const url = `${base}/${code}/accounts.csv` + (params.size > 0 ? `?${params.toString()}` : "")
    const token = store.getters.accessToken
    await downloadFile(url, token, "accounts.csv")
  }

  return { download }
}
