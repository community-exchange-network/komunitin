# Authentication and authorization

The auth service manages user identities, email addresses, password hashes and email verification. It issues OAuth2 tokens for the app and backend services. It uses TypeScript, Express and `oidc-provider`, with Prisma and PostgreSQL for storage. See the [source](https://github.com/komunitin/komunitin/tree/master/auth) and [API specification](https://github.com/komunitin/komunitin/blob/master/auth/openapi/openapi.yml).

Browse the API specification:

{% embed url="https://petstore.swagger.io/?url=https://raw.githubusercontent.com/komunitin/komunitin/refs/heads/master/auth/openapi/openapi.yml" %}

## Signing in

The app signs in with an email and password through the OAuth2 password grant. Auth returns a signed JWT access token and, when requested with `offline_access`, a refresh token. The app uses the access token to call the APIs and the refresh token to renew access without asking for the password again.

A user's UUID is shared across services. Social links that identity to one or more member profiles; Accounting links it to the corresponding account permissions. Auth does not store community memberships or profiles.

## Permissions

Each service validates the token's signature, issuer, audience and expiry using Auth's published signing keys (JWKS). OAuth2 scopes, such as `social:read` or `accounting:write`, limit the operations a token can request.

The receiving service then checks its own permissions, such as resource ownership, active membership or community administrator status. A write scope alone does not grant access to every resource. The configured platform administrator can receive the separate `superadmin` scope.

## Between services

Backend services have their own OAuth2 client credentials and allowed scopes. They use the client credentials grant for work performed as a service, such as publishing notification events or reading data for a newsletter. These tokens identify the service rather than a member.

For work on behalf of a user, a service can exchange the user's access token for a token with a limited set of scopes. For example, Social requests an Accounting token when coordinating an account update. The exchanged token keeps the user's identity and cannot gain scopes beyond those allowed by both the original token and the calling service.

## Email actions

Email verification, password resets, email changes and unsubscribe links use purpose-specific action tokens. These are separate from OAuth access tokens and do not create a login session. Auth creates and validates them, Notifications delivers the emails, and the service responsible for the action applies the change.
