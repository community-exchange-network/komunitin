import type { RequestHandler } from 'express'
import cron from 'node-cron'
import logger from '../utils/logger'
import { getJwks, resetJwksCache, type Jwks } from './jwks'
import { createProvider } from './provider'

const JWKS_RELOAD_CRON = '0 0 * * *'
const JWKS_ROTATION_JOB_NAME = 'auth-jwks-rotation'

let providerHandler: RequestHandler | undefined
let providerKeyIds: string[] = []

const keyIds = (jwks: Jwks) => jwks.keys.map((key) => String(key.kid))

const sameKeyIds = (first: string[], second: string[]) => JSON.stringify(first) === JSON.stringify(second)

async function mountProvider(jwks: Jwks) {
  const provider = await createProvider(jwks)
  const callback = provider.callback()
  providerHandler = (req, res) => callback(req, res)
  providerKeyIds = keyIds(jwks)
}

export async function oidcProviderMiddleware(): Promise<RequestHandler> {
  await refreshOidcProvider()

  return (req, res, next) => {
    if (!providerHandler) {
      next(new Error('OIDC provider is not initialized'))
      return
    }

    providerHandler(req, res, next)
  }
}

export async function refreshOidcProvider() {
  resetJwksCache()
  const jwks = await getJwks()
  const nextKeyIds = keyIds(jwks)

  if (sameKeyIds(providerKeyIds, nextKeyIds)) {
    return false
  }

  await mountProvider(jwks)
  logger.info({ keyIds: nextKeyIds }, 'Reloaded OIDC provider JWKS')
  return true
}

export const startJwksRotationJob = () => {
  const task = cron.schedule(JWKS_RELOAD_CRON, () => {
    refreshOidcProvider().catch((err) => {
      logger.error(err, 'Failed to reload OIDC provider JWKS')
    })
  }, {
    name: JWKS_ROTATION_JOB_NAME,
    timezone: 'UTC',
  })

  return () => {
    task.stop()
  }
}
