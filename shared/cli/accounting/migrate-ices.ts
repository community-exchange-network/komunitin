import { setTimeout } from 'node:timers/promises'
import { apiUrl, bearerJsonRequest, parseCredentialArgs, publicApiUrl, request, requestJson, requiredEnv, userToken, type TokenResponse } from '../utils.ts'

type MigrationDocument = {
  data: { id: string, attributes: { status: 'new' | 'started' | 'completed' | 'failed' } }
}

/** Authorize at the destination with Auth, and give Accounting separate ICES source credentials. */
export const migrateIcesAccounting = async (args: string[]) => {
  const { values, positionals } = parseCredentialArgs(args)
  if (positionals.length !== 2) throw new Error('Usage: komunitin accounting migrate-ices <currency-code> <ices-url> [--email <email>] [--password <password>]')
  const [code, url] = positionals
  const sourceUrl = apiUrl(url).replace(/\/$/, '')
  const token = await userToken(values, 'superadmin')
  const sourceToken = await requestJson<TokenResponse>('Could not obtain ICES access token', new URL(`${sourceUrl}/oauth2/token`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password', client_id: 'komunitin-app',
      username: requiredEnv('ICES_ADMIN_EMAIL'), password: requiredEnv('ICES_ADMIN_PASSWORD'),
      scope: 'komunitin_social komunitin_accounting komunitin_superadmin offline_access',
    }),
  })
  const accountingUrl = publicApiUrl('KOMUNITIN_ACCOUNTING_URL')
  const migration = await bearerJsonRequest<MigrationDocument>('Could not create accounting migration', new URL('/migrations', accountingUrl), token.access_token, {
    method: 'POST',
    body: { data: { type: 'migrations', attributes: {
      code, name: `${code} migration`, kind: 'integralces-accounting',
      data: { source: { url: sourceUrl, tokens: {
        accessToken: sourceToken.access_token,
        refreshToken: sourceToken.refresh_token,
        expiresAt: new Date(Date.now() + (sourceToken.expires_in ?? 3600) * 1000).toISOString(),
      } } },
    } } },
  })
  const migrationUrl = new URL(`/migrations/${migration.data.id}`, accountingUrl)
  await request('Could not start accounting migration', new URL(`${migrationUrl}/play`), {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}` },
  })

  const deadline = Date.now() + 300_000
  let status = migration.data.attributes.status
  while (status === 'new' || status === 'started') {
    if (Date.now() >= deadline) throw new Error(`Accounting migration ${migration.data.id} timed out. Inspect ${migrationUrl} before retrying.`)
    await setTimeout(2000)
    const current = await bearerJsonRequest<MigrationDocument>('Could not read accounting migration', migrationUrl, token.access_token)
    status = current.data.attributes.status
    console.log(`${code} accounting migration: ${status}`)
  }
  if (status !== 'completed') throw new Error(`Accounting migration ${migration.data.id} ${status}. Inspect ${migrationUrl}/logs/stream before retrying.`)
}
