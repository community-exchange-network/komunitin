import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'

type ErrorResponse = {
  errors?: Array<{ detail?: string }>
  error_description?: string
}

type RegisterResponse = { id: string }
type TokenResponse = { access_token: string, scope: string }
type ActionTokenResponse = { token: string }

const requiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  // remove quotes
  return value.replace(/^"|"$/g, '')
}

const publicApiUrl = (name: string) => {
  const url = new URL(requiredEnv(name))
  if (url.hostname === 'localhost') url.hostname = 'host.docker.internal'
  return url.toString()
}

const parseMailbox = (value: string) => {
  const address = value.trim()
  const match = address.match(/^(.*?)<([^<>]+)>$/)
  const email = (match?.[2] ?? address).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`ADMIN_EMAIL must contain a valid email address, got "${value}"`)
  }

  const name = match?.[1].trim().replace(/^"|"$/g, '') || 'Superadmin'
  return { email, name }
}

const responseError = async (response: Response) => {
  const payload = await response.json().catch(() => undefined) as ErrorResponse | undefined
  return payload?.errors?.[0]?.detail
    ?? payload?.error_description
    ?? `${response.status} ${response.statusText}`
}

const requestJson = async <T>(description: string, url: URL, init: RequestInit) => {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`${description}: ${await responseError(response)}`)
  }
  return await response.json() as T
}

const tokenRequest = (authUrl: string, body: Record<string, string>) => requestJson<TokenResponse>(
  'Could not obtain access token',
  new URL('/token', authUrl),
  { method: 'POST', body: new URLSearchParams(body) },
)

const verifyUser = async (authUrl: string, clientSecret: string, userId: string) => {
  const serviceToken = await tokenRequest(authUrl, {
    grant_type: 'client_credentials',
    client_id: 'komunitin-notifications',
    client_secret: clientSecret,
    scope: 'email',
  })
  const actionToken = await requestJson<ActionTokenResponse>(
    'Could not create verification token',
    new URL('/action-token', authUrl),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceToken.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, purpose: 'emailVerification' }),
    },
  )
  await requestJson(
    'Could not verify superadmin',
    new URL('/email/confirm', authUrl),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: actionToken.token }),
    },
  )
}

export const bootstrapAdmin = async (args: string[]) => {
  const { values } = parseArgs({
    args,
    options: { password: { type: 'string' } },
    strict: true,
  })
  if (values.password === '') throw new Error('--password cannot be empty')

  const { email, name } = parseMailbox(requiredEnv('ADMIN_EMAIL'))
  const configuredPassword = process.env.ADMIN_PASSWORD || undefined
  const password = values.password ?? configuredPassword ?? randomBytes(32).toString('base64url')
  const hasKnownPassword = values.password !== undefined || configuredPassword !== undefined
  const authUrl = publicApiUrl('KOMUNITIN_AUTH_URL')
  const response = await fetch(new URL('/register', authUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      signup: {
        type: 'group',
        name,
        language: 'en',
      },
    }),
  })

  if (response.status === 409) {
    if (!hasKnownPassword) {
      console.log(`Superadmin ${email} already exists`)
      return
    }
  } else if (!response.ok) {
    throw new Error(`Could not register superadmin ${email}: ${await responseError(response)}`)
  } else {
    const user = await response.json() as RegisterResponse
    await verifyUser(authUrl, requiredEnv('KOMUNITIN_NOTIFICATIONS_SECRET'), user.id)
  }

  const userToken = await tokenRequest(authUrl, {
    grant_type: 'password',
    client_id: 'komunitin-app',
    username: email,
    password,
    scope: 'email social:write superadmin',
  })
  if (!userToken.scope.split(' ').includes('superadmin')) {
    throw new Error(`Auth did not grant superadmin scope to ${email}`)
  }

  await requestJson(
    'Could not provision Social user',
    new URL('/users', publicApiUrl('KOMUNITIN_SOCIAL_URL')),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          type: 'users',
          attributes: { email },
        },
      }),
    },
  )

  console.log(`Superadmin ${email} bootstrapped in Auth and Social`)
}
