import { ClientMetadata } from 'oidc-provider'
import { config } from '../config'

export const apiScopes: string[] = [
  'email',
  'offline_access',
  'social:read',
  'social:write',
  'accounting:read',
  'accounting:write',
]

const notificationsScopes = [
  'email',
  'social:read',
  'accounting:read',
] as const

const socialScopes = [
  'accounting:read',
  'accounting:write',
] as const

const scopeString = (scopes: readonly string[]) => scopes.join(' ')

// oidc-provider requires redirect/response metadata even for token-only clients.
// Empty arrays keep authorization-code flows unavailable.
export const clients: ClientMetadata[] = [
  {
    client_id: 'komunitin-app',
    token_endpoint_auth_method: 'none',
    grant_types: ['password', 'refresh_token'],
    redirect_uris: [],
    response_types: [],
    scope: scopeString(apiScopes),
  },
  {
    client_id: 'komunitin-notifications',
    client_secret: config.NOTIFICATIONS_CLIENT_SECRET,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
    redirect_uris: [],
    response_types: [],
    scope: scopeString(notificationsScopes),
  },
  {
    client_id: 'komunitin-social',
    client_secret: config.SOCIAL_CLIENT_SECRET,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
    redirect_uris: [],
    response_types: [],
    scope: scopeString(socialScopes),
  },
]
