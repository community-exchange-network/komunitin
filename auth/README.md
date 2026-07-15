# Komunitin Auth Service

The `auth` service is the Komunitin identity provider. It owns identity records, password hashes, email verification state, password reset tokens, email-change tokens, OAuth token issuance, and signing keys.

This service is part of the migration away from the legacy Drupal/IntegralCES auth API. It is intentionally not a drop-in replacement for IntegralCES `/oauth2`.

## Service Boundary

Auth owns:

- User identity: UUID, email, password hash, email verification, and auth status.
- OAuth access and refresh tokens for first-party clients and backend services.
- Password reset, email verification, and email change action tokens.
- JWKS signing key persistence and rotation.

Auth does not own:

- Social profiles, memberships, groups, onboarding state, posts, or newsletter preferences.
- Generic magic-login links.
- Social/domain action tokens such as one-click unsubscribe tokens.
- Legacy IntegralCES `/get-auth-code` or `/get-auth-token` compatibility.

If a flow needs product-domain state after the user verifies an email, keep the auth token limited to email verification and put the continuation/invite token in the owning service, normally `social`.

## Runtime

- Node.js 24
- TypeScript
- Express 5
- `oidc-provider`
- Prisma 7 with PostgreSQL
- `pnpm`
- Local service port: `2026`
- Local database port: `5435`

## OAuth

Supported grants:

- `password`
- `refresh_token`
- `client_credentials`
- `urn:ietf:params:oauth:grant-type:token-exchange`

Unsupported by design:

- `authorization_code`
- Legacy emailed OAuth login codes.
- Legacy `/get-auth-code` and `/get-auth-token`.

Current clients:

| Client | Type | Grants | Allowed scopes |
| --- | --- | --- | --- |
| `komunitin-app` | Public PWA client | `password`, `refresh_token` | `email`, `offline_access`, `social:read`, `social:write`, `accounting:read`, `accounting:write`, `superadmin` |
| `komunitin-social` | Confidential service client | `client_credentials`, token exchange | `accounting:read`, `accounting:write` |
| `komunitin-notifications` | Confidential service client | `client_credentials`, token exchange | `email`, `social:read`, `accounting:read` |

Current scopes:

- `email`
- `offline_access`
- `social:read`
- `social:write`
- `accounting:read`
- `accounting:write`
- `superadmin` (granted only when the authenticated user matches `ADMIN_EMAIL`)

Access tokens are signed JWTs with audience `urn:komunitin:api` by default, configurable through `JWT_AUDIENCE`. They identify the OAuth client through `client_id`. User and exchanged tokens use the canonical user UUID as `sub`; client-credentials tokens use the client id. Refresh tokens are opaque server-side records stored by `oidc-provider`.

## HTTP API

The OpenAPI contract lives at `openapi/openapi.yml`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Checks database connectivity. |
| `POST /register` | Creates an unverified auth identity and emits a validation email event. |
| `POST /token` | OAuth token endpoint. |
| `POST /reset-password` | Creates a password reset action token and emits a notification event if the user exists. |
| `POST /change-password` | Consumes a password reset action token and updates the password. |
| `POST /change-email` | Authenticated endpoint that creates an email-change action token and emits a validation email event. |
| `POST /change-email/confirm` | Consumes an email-change or email-verification action token. |
| `POST /resend-validation` | Re-sends validation for an existing unverified user or pending email change. |

Action tokens are not OAuth tokens and are not accepted at `POST /token`.

## Local Development

From `auth/`:

```bash
pnpm install
docker compose up -d db-auth
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

The service listens at:

```text
http://localhost:2026
```

For the full stack, use the root compose flow documented in the repository `AGENTS.md`.


## Tests And Checks

From `auth/`:

```bash
docker compose up -d
pnpm prisma migrate deploy
pnpm typecheck
pnpm test
pnpm build
```

Run one test file:

```bash
pnpm test-one test/auth.test.ts
```

The tests use Node's native test runner with `--test-concurrency=1` and `.env.test`. They reset auth tables between scenarios. Never point `.env.test` at production or shared staging data.

## JWKS Persistence And Rotation

Signing keys are generated on first boot and stored in the auth database. The service rotates the active signing key on startup when the active key is older than `JWKS_ROTATION_INTERVAL_DAYS`.

Retired keys stay published for `JWKS_RETENTION_HOURS`, so already-issued access tokens can validate while clients refresh JWKS caches. Current signed token lifetime is 1 hour, so the default 24-hour overlap is intentionally conservative.

Refresh tokens are opaque database-backed records. They do not require old signing keys to stay published.


## Known Gaps

These are the main auth-side gaps to resolve before the new service fully replaces IntegralCES auth:

- Add authenticated self-service password change with current-password verification.
- Revoke or rotate refresh-token grants after password changes, account disablement, and other high-risk account events.
- Define per-client allowed scopes so service clients cannot request scopes outside their role.
- Decide whether unverified users may log in. If not, enforce the `pending`/`emailVerified` state consistently.
- Canonicalize and validate emails at write boundaries, ideally with case-insensitive uniqueness.
- Reject invalid requested scopes instead of silently dropping unknown scopes once the migration is ready.
- Add production-grade rate limiting and account-level throttling for password and action-token endpoints.
- Add token/session management endpoints if users need logout-all-devices or administrators need forced revocation.
- Add operational cleanup for expired `OidcPayload` and `UserActionToken` rows.

See `MIGRATE.md` for the broader frontend, notifications, accounting, social, and IntegralCES migration plan.
