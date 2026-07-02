# Auth Service Agent Instructions

## Scope

This folder contains the Komunitin auth service: a Node.js 24, TypeScript, Express, Prisma, PostgreSQL, and `oidc-provider` identity provider.

Simplicity is part of the security model here.

## Service Boundary

Auth owns:

- Identity records and canonical auth user UUIDs.
- OAuth/OIDC token issuance and JWKS signing keys.
- Email, password hash, email verification, and auth account status.
- Password reset, and email change action tokens.

Auth does not own:

- Social profiles, group memberships, posts, onboarding state, or user preferences.
- Email sending (emails are sent by the notifications service).

## Commands

Run commands from `auth/` unless stated otherwise.

```bash
pnpm install
docker compose up -d db-auth
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
```

Checks:

```bash
pnpm typecheck
pnpm test
pnpm test-one test/auth.test.ts
pnpm build
```

## Coding Patterns

- Keep route handlers in `src/routes`.
- Keep `oidc-provider` integration in `src/oidc`.
- Keep reusable credential/action-token helpers in `src/services`.
- Use `src/utils/error.ts` helpers so non-OAuth endpoints return JSON:API-style errors.
- Update `openapi/openapi.yml` when changing public endpoints or payloads.
- Add/update tests at `test/` for any new or changed behavior.
- Prefer tests that use the public API rather than reaching into internal details.
- Run `pnpm prisma generate` after schema changes.
- Create Prisma migrations for schema changes.

## Security Rules
- Email links must remain purpose-specific single-use action tokens redeemed at dedicated endpoints.
- Keep password reset responses generic so they do not reveal whether an email exists.
- If adding Authorization Code flow for the PWA later, require PKCE and keep it separate from emailed action tokens.

## Migration Context

The legacy implementation lives in `../ices` and includes Drupal OAuth endpoints such as `/oauth2/get-auth-code`, old `komunitin_*` scopes, and social API behavior that mixed credentials with profile updates.

The new direction is:

- Make the auth service a pure identity provider with no social or profile state.
- Social and Accounting services store a projection keyed by the auth UUID.
- Notifications service uses auth-generated action tokens for password reset, validation emails, etc.
- Services validate the new issuer, audience, JWKS, and scope vocabulary.

Read `MIGRATE.md` before changing migration-sensitive auth, social, notifications, or frontend behavior.
