import { ClientMetadata } from 'oidc-provider'
import { config } from '../config'

export const clients: ClientMetadata[] = [
  {
    client_id: 'komunitin-app',
    token_endpoint_auth_method: 'none',
    grant_types: ['password', 'refresh_token'],
    redirect_uris: ['http://localhost:2030/callback', 'https://localhost:2030/callback'],
    response_types: [],
  },
  {
    client_id: 'komunitin-notifications',
    client_secret: config.NOTIFICATIONS_CLIENT_SECRET,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
    redirect_uris: ['http://localhost/unused'],
    response_types: [],
  },
  {
    client_id: 'komunitin-social',
    client_secret: config.SOCIAL_CLIENT_SECRET,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
    redirect_uris: ['http://localhost/unused'],
    response_types: [],
  },
  {
    client_id: 'komunitin-accounting',
    client_secret: config.ACCOUNTING_CLIENT_SECRET,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
    redirect_uris: ['http://localhost/unused'],
    response_types: [],
  },
]
