import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import {
  bearerJsonRequest,
  parseMailbox,
  publicApiUrl,
  requiredEnv,
  responseError,
  tokenRequest,
} from '../utils.ts'

type RegisterResponse = { id: string }
type ActionTokenResponse = { token: string }

const verifyUser = async (authUrl: string, clientSecret: string, userId: string) => {
  const serviceToken = await tokenRequest(authUrl, {
    grant_type: 'client_credentials',
    client_id: 'komunitin-notifications',
    client_secret: clientSecret,
    scope: 'email',
  })
  const actionToken = await bearerJsonRequest<ActionTokenResponse>(
    'Could not create verification token',
    new URL('/action-token', authUrl),
    serviceToken.access_token,
    {
      method: 'POST',
      body: { userId, purpose: 'emailVerification' },
    },
  )
  await bearerJsonRequest(
    'Could not verify superadmin',
    new URL('/email/confirm', authUrl),
    undefined,
    {
      method: 'POST',
      body: { token: actionToken.token },
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

  await bearerJsonRequest(
    'Could not provision Social user',
    new URL('/users', publicApiUrl('KOMUNITIN_SOCIAL_URL')),
    userToken.access_token,
    {
      method: 'POST',
      body: {
        data: {
          type: 'users',
          attributes: { email },
        },
      },
    },
  )

  console.log(`Superadmin ${email} bootstrapped in Auth and Social`)
}
