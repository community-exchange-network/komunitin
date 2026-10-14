import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope: string
}

type ErrorResponse = {
  errors?: Array<string | { detail?: string, title?: string }>
  error?: string
  error_description?: string
}

type CredentialOptions = {
  email?: string
  password?: string
}

export const parseCredentialArgs = (args: string[]) => parseArgs({
  args,
  allowPositionals: true,
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
  },
  strict: true,
})

export const requiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value.replace(/^"|"$/g, '')
}

export const apiUrl = (value: string) => {
  const url = new URL(value)
  if (process.env.KOMUNITIN_CLI_DOCKER === 'true' && url.hostname === 'localhost') url.hostname = 'host.docker.internal'
  return url.toString()
}

export const publicApiUrl = (name: string) => apiUrl(requiredEnv(name))

export const parseMailbox = (value: string, source = 'ADMIN_EMAIL') => {
  const address = value.trim()
  const match = address.match(/^(.*?)<([^<>]+)>$/)
  const email = (match?.[2] ?? address).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${source} must contain a valid email address, got "${value}"`)
  }

  const name = match?.[1].trim().replace(/^"|"$/g, '') || 'Superadmin'
  return { email, name }
}

export const responseError = async (response: Response) => {
  const payload = await response.json().catch(() => undefined) as ErrorResponse | undefined
  const firstError = payload?.errors?.[0]
  const jsonApiError = typeof firstError === 'string'
    ? firstError
    : firstError?.detail ?? firstError?.title

  return jsonApiError
    ?? payload?.error_description
    ?? payload?.error
    ?? `${response.status} ${response.statusText}`
}

export const request = async (description: string, url: URL, init: RequestInit = {}) => {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`${description}: ${await responseError(response)}`)
  }
  return response
}

export const requestJson = async <T>(description: string, url: URL, init: RequestInit = {}) =>
  await (await request(description, url, init)).json() as T

/** Bound the entire JSON response and retry timed-out reads without replaying writes. */
export const requestJsonWithTimeout = async (
  description: string, url: URL, init: RequestInit, timeoutMs: number, onProgress: (message: string) => void,
) => {
  const attempts = (init.method ?? 'GET') === 'GET' ? 3 : 1
  for (let attempt = 1; ; attempt++) {
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const response = await fetch(url, { ...init, signal })
      if (!response.ok) throw new Error(`${description} returned HTTP ${response.status}`)
      return await response.json() as unknown
    } catch (error) {
      if (!signal.aborted) throw error
      const message = `${description} timed out after ${timeoutMs / 1000}s (attempt ${attempt}/${attempts})`
      if (attempt === attempts) throw new Error(message)
      onProgress(`${message}; retrying in ${attempt}s`)
      await delay(attempt * 1000)
    }
  }
}

export const tokenRequest = (authUrl: string, body: Record<string, string>) => requestJson<TokenResponse>(
  'Could not obtain access token',
  new URL('/token', authUrl),
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  },
)

export const userToken = async (options: CredentialOptions, scope: string) => {
  const mailbox = options.email ?? requiredEnv('ADMIN_EMAIL')
  const { email } = parseMailbox(mailbox, options.email === undefined ? 'ADMIN_EMAIL' : '--email')
  const password = options.password ?? requiredEnv('ADMIN_PASSWORD')
  if (!password) throw new Error(options.password === undefined ? 'ADMIN_PASSWORD is required' : '--password cannot be empty')

  return await tokenRequest(publicApiUrl('KOMUNITIN_AUTH_URL'), {
    grant_type: 'password',
    client_id: 'komunitin-app',
    username: email,
    password,
    scope,
  })
}

export const bearerJsonRequest = <T>(
  description: string,
  url: URL,
  accessToken: string | undefined,
  init: Omit<RequestInit, 'body' | 'headers'> & { body?: unknown } = {},
) => requestJson<T>(description, url, {
  ...init,
  headers: {
    ...(accessToken === undefined ? {} : { Authorization: `Bearer ${accessToken}` }),
    ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
  },
  body: init.body === undefined ? undefined : JSON.stringify(init.body),
})
