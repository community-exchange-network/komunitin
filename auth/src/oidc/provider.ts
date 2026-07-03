import Provider, {
  type AccessToken,
  type ClaimsParameterMember,
  type Client,
  type ClientCredentials,
  type Configuration,
  type KoaContextWithOIDC,
  type ResourceServer,
} from 'oidc-provider'
import { config } from '../config'
import { adapterFactory } from './adapter'
import { findAccount, authenticate } from './account'
import { apiScopes, clients } from './clients'
import { verifySignedToken } from './token-verifier'
import { getJwks } from './jwks'
import { isUuid } from '../utils/uuid'

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60
const APP_RESOURCE_INDICATOR = 'urn:komunitin:app'

const oidcScopes = new Set(['email', 'offline_access'])
const allowedScopes = new Set(apiScopes)

const appResourceServer = {
  audience: 'app',
  scope: apiScopes.join(' '),
  accessTokenFormat: 'jwt',
  accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
  identifier: () => APP_RESOURCE_INDICATOR,
} satisfies ResourceServer & { identifier: () => string }

const EMPTY_REQUESTED_CLAIMS: { [key: string]: null | ClaimsParameterMember } = {}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getStringParam = (params: Record<string, unknown>, key: string) => {
  const value = params[key]
  return typeof value === 'string' ? value : undefined
}

const requireStringParam = (
  ctx: KoaContextWithOIDC,
  params: Record<string, unknown>,
  key: string,
  errorDescription: string,
) => {
  const value = getStringParam(params, key)
  if (!value) {
    ctx.throw(400, 'invalid_request', { error_description: errorDescription })
  }
  return value
}

const requireClient = (ctx: KoaContextWithOIDC): Client => {
  const client = ctx.oidc.client
  if (!client) {
    ctx.throw(400, 'invalid_client', { error_description: 'Missing OAuth client' })
  }
  return client
}

const getParams = (ctx: KoaContextWithOIDC) => {
  return isRecord(ctx.oidc.params) ? ctx.oidc.params : {}
}

const hasAccountId = (token: AccessToken | ClientCredentials): token is AccessToken => {
  return 'accountId' in token && typeof token.accountId === 'string'
}

const getRequestedScopes = (scope: unknown, fallback: string[] = []) => {
  if (typeof scope !== 'string' || scope.trim() === '') {
    return [...fallback]
  }

  return scope.split(/\s+/).filter(Boolean)
}

const clientScopeSet = (client: Client) => {
  return client.scope ? new Set(splitScope(client.scope)) : allowedScopes
}

const ensureClientScopesAllowed = (
  ctx: KoaContextWithOIDC,
  client: Client,
  requestedScopes: string[],
) => {
  if (!client.scope) {
    return
  }

  const clientScopes = clientScopeSet(client)
  const disallowedScope = requestedScopes.find((scope) => allowedScopes.has(scope) && !clientScopes.has(scope))

  if (disallowedScope) {
    ctx.throw(400, 'invalid_scope', {
      error_description: 'requested scope is not allowed',
      scope: disallowedScope,
    })
  }
}

const filterAllowedScopes = (scopes: string[], client: Client) => {
  const clientScopes = clientScopeSet(client)
  return [...new Set(scopes.filter((scope) => allowedScopes.has(scope) && clientScopes.has(scope)))]
}

const serializeScope = (scopes: string[]) => scopes.join(' ')

const splitScope = (scope: string) => scope.split(' ').filter(Boolean)

const assignGrantScopes = (grant: any, scope: string) => {
  const scopes = splitScope(scope)
  const standardScopes = scopes.filter((candidate) => oidcScopes.has(candidate))
  const resourceScopes = scopes.filter((candidate) => !oidcScopes.has(candidate))

  if (standardScopes.length > 0) {
    grant.addOIDCScope(serializeScope(standardScopes))
  }

  if (resourceScopes.length > 0) {
    grant.addResourceScope(APP_RESOURCE_INDICATOR, serializeScope(resourceScopes))
  }
}

export async function createProvider() {
  const jwks = await getJwks()

  const oidcConfig: Configuration = {
    adapter: adapterFactory,
    findAccount,
    clients,
    scopes: apiScopes,
    jwks,
    features: {
      devInteractions: { enabled: false },
      clientCredentials: { enabled: true },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => APP_RESOURCE_INDICATOR,
        getResourceServerInfo: async () => appResourceServer
      },
    },
    extraTokenClaims: async (ctx, token) => {
      if (hasAccountId(token)) {
        const account = await findAccount(ctx, token.accountId)
        if (account) {
          const claims = await account.claims('access_token', token.scope ?? '', EMPTY_REQUESTED_CLAIMS, [])
          const { sub, ...extraClaims } = claims
          return {
            ...extraClaims,
          }
        }
      }
      return {}
    },
    ttl: {
      AccessToken: () => ACCESS_TOKEN_TTL_SECONDS,
      ClientCredentials: () => ACCESS_TOKEN_TTL_SECONDS,
      Grant: () => REFRESH_TOKEN_TTL_SECONDS,
      RefreshToken: () => REFRESH_TOKEN_TTL_SECONDS,
    },
  }

  const provider = new Provider(config.ISSUER_URL, oidcConfig)

  const issueTokenResponse = async (
    ctx: any,
    grantType: string,
    accountId: string,
    scope: string,
    grantId: string,
  ) => {
    const { AccessToken, RefreshToken } = ctx.oidc.provider
    const { client } = ctx.oidc

    const accessToken = new AccessToken({
      accountId,
      client,
      grantId,
      scope,
    })
    accessToken.gty = grantType
    accessToken.resourceServer = appResourceServer
    ctx.oidc.entity('AccessToken', accessToken)
    const accessTokenValue = await accessToken.save()

    const response: Record<string, unknown> = {
      access_token: accessTokenValue,
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      token_type: accessToken.tokenType,
      scope: accessToken.scope,
    }

    if (client.grantTypeAllowed('refresh_token') && splitScope(scope).includes('offline_access')) {
      const refreshToken = new RefreshToken({
        accountId,
        client,
        grantId,
        resource: APP_RESOURCE_INDICATOR,
        scope,
      })
      refreshToken.gty = grantType
      ctx.oidc.entity('RefreshToken', refreshToken)
      response.refresh_token = await refreshToken.save()
    }

    ctx.body = response
  }

  provider.registerGrantType(
    'password',
    async (ctx, next) => {
      const params = getParams(ctx)
      const username = requireStringParam(ctx, params, 'username', 'Missing username or password')
      const password = requireStringParam(ctx, params, 'password', 'Missing username or password')
      const scope = getStringParam(params, 'scope')

      let user
      try {
        user = await authenticate(username, password)
      } catch (err: any) {
        ctx.throw(400, 'invalid_grant', { error_description: err.message || 'Authentication failed' })
      }

      if (!user) {
        ctx.throw(400, 'invalid_grant', { error_description: 'Invalid credentials' })
      }

      const accountId = user.id
      const client = requireClient(ctx)
      const clientId = client.clientId

      const grant = new ctx.oidc.provider.Grant({
        accountId,
        clientId,
      })

      const requestedScopes = getRequestedScopes(scope, ['email'])
      ensureClientScopesAllowed(ctx, client, requestedScopes)
      const grantedScopes = filterAllowedScopes(requestedScopes, client)
      const scopeValue = serializeScope(grantedScopes)

      assignGrantScopes(grant, scopeValue)

      await grant.save()

      ctx.oidc.entity('Grant', grant)

      await issueTokenResponse(ctx, 'password', accountId, scopeValue, grant.jti)
      await next()
    },
    ['username', 'password', 'scope']
  )

  provider.registerGrantType(
    'urn:ietf:params:oauth:grant-type:token-exchange',
    async (ctx, next) => {
      const params = getParams(ctx)
      const subjectToken = requireStringParam(ctx, params, 'subject_token', 'Missing subject_token')
      const subjectTokenType = getStringParam(params, 'subject_token_type')
      const scope = getStringParam(params, 'scope')

      if (subjectTokenType !== 'urn:ietf:params:oauth:token-type:access_token') {
        ctx.throw(400, 'invalid_request', { error_description: 'Unsupported subject_token_type' })
      }

      const verified = await verifySignedToken(subjectToken, {
        issuer: config.ISSUER_URL,
        audience: 'app',
      }).catch(() => undefined)

      if (!verified) {
        ctx.throw(400, 'invalid_grant', { error_description: 'Invalid subject_token' })
      }
      const tokenPayload = verified!.payload

      if (tokenPayload.gty === 'client_credentials') {
        ctx.throw(400, 'invalid_grant', { error_description: 'Subject token must represent a user' })
      }

      const accountId = tokenPayload.accountId
        ?? tokenPayload.sub
      if (typeof accountId !== 'string' || !isUuid(accountId)) {
        ctx.throw(400, 'invalid_grant', { error_description: 'Subject token has no associated account' })
      }
      const subjectAccountId = accountId as string

      const subjectAccount = await findAccount(ctx, subjectAccountId)
      if (!subjectAccount) {
        ctx.throw(400, 'invalid_grant', { error_description: 'Invalid subject_token' })
      }

      const client = requireClient(ctx)
      const clientId = client.clientId

      const grant = new ctx.oidc.provider.Grant({
        accountId: subjectAccountId,
        clientId,
      })

      const subjectScope = typeof tokenPayload.scope === 'string' ? tokenPayload.scope : ''
      const requestedScopes = getRequestedScopes(scope, splitScope(subjectScope))
      const subjectScopes = new Set(splitScope(subjectScope))
      if (scope) {
        ensureClientScopesAllowed(ctx, client, requestedScopes)
      }
      const grantedScopes = filterAllowedScopes(
        requestedScopes.filter((candidate) => subjectScopes.has(candidate)),
        client,
      )

      if (requestedScopes.length > 0 && grantedScopes.length === 0) {
        ctx.throw(400, 'invalid_scope', { error_description: 'No requested scopes were granted' })
      }

      const scopeValue = serializeScope(grantedScopes)

      assignGrantScopes(grant, scopeValue)

      await grant.save()

      ctx.oidc.entity('Grant', grant)

      await issueTokenResponse(ctx, 'token-exchange', subjectAccountId, scopeValue, String(grant.jti))
      await next()
    },
    ['subject_token', 'subject_token_type', 'scope']
  )

  return provider
}
