# Auth Migration Plan

This document is the implementation plan for migrating from the legacy Drupal-based auth service (`/oauth2` plus custom endpoints such as `/get-auth-code`) to the new `auth` service in this repository.

## Relevant paths

It is intentionally concrete and code-driven. The recommendations below come from the current consumers in:

- `app/src/plugins/Auth.ts`
- `app/src/boot/auth.ts`
- `app/src/pages/members/ChangeEmailBtn.vue`
- `app/src/pages/members/ChangePasswordBtn.vue`
- `app/src/pages/members/SetPassword.vue`
- `app/src/pages/settings/Unsubscribe.vue`
- `notifications-ts/src/clients/komunitin/AuthProvider.ts`
- `notifications-ts/src/clients/komunitin/getAuthCode.ts`
- `notifications-ts/src/notifications/handlers/user.ts`
- `notifications-ts/src/newsletter/service.ts`
- `notifications-ts/src/notifications/emails/user.ts`
- `accounting/src/server/auth.ts`
- `social/src/server/auth.ts`
- `notifications-ts/src/server/auth.ts`
- `auth/src/oidc/provider.ts`
- `auth/src/oidc/clients.ts`
- `auth/src/services/notifications.ts`

## Executive Summary

The new auth service is not a drop-in replacement for the legacy Drupal OAuth server.

What already works in the new auth service:

- Password grant for the public app client.
- Refresh tokens for the public app client.
- Client credentials for backend services.
- Token exchange for delegated backend calls when a user token already exists.
- Password reset request / password reset confirm.
- Email change request / email confirm.
- Resend validation.

What does not migrate directly:

- Legacy `authorization_code` login via emailed `?token=...` links.
- Legacy `/get-auth-code` and `/get-auth-token` workflows.
- Legacy scope names such as `komunitin_social` and `komunitin_accounting`.
- Legacy service scopes such as `komunitin_social_read_all`, `komunitin_accounting_read_all`, and `komunitin_auth_impersonate_all`.
- Legacy JWT audience assumptions such as `komunitin-app`.
- Current app profile flows that mutate password/email through the social user resource instead of auth.

## Current Contract Of The New Auth Service

### Supported OAuth flows

The new auth service supports:

- `password`
- `refresh_token`
- `client_credentials`
- `urn:ietf:params:oauth:grant-type:token-exchange`

It does not support the legacy app behavior of exchanging emailed codes through `grant_type=authorization_code`.

### Current clients

- `komunitin-app`
  - public client
  - `password`
  - `refresh_token`
- `komunitin-social`
  - confidential client
  - `client_credentials`
  - `token-exchange`
- `komunitin-notifications`
  - confidential client
  - `client_credentials`
  - `token-exchange`

### Current scope vocabulary

The new auth service currently recognizes:

- `email`
- `offline_access`
- `social:read`
- `social:write`
- `accounting:read`
- `accounting:write`

It does not recognize legacy `komunitin_*` scope names.

### Password and email endpoints

- `POST /reset-password`
- `POST /change-password`
  - reset-token based
- `POST /change-email`
  - authenticated bearer token required
- `POST /change-email/confirm`
  - email-token based
- `POST /resend-validation`

These auth API endpoints accept plain `application/json` request bodies only.
Legacy `application/x-www-form-urlencoded` and `application/vnd.api+json`
payloads must be migrated. The OAuth `/token` endpoint remains
`application/x-www-form-urlencoded`.

## Main Incompatibilities Found In Current Consumers

### Frontend

The app still assumes legacy auth semantics in several places:

- `app/src/plugins/Auth.ts`
  - requests legacy scopes
  - still exposes `authorizeWithCode()` using `authorization_code`
- `app/src/boot/auth.ts`
  - auto-logs-in from `?token=` for every public magic link except unsubscribe
- `app/src/pages/members/SetPassword.vue`
  - assumes the email link logs the user in first, then updates the user through the app store
- `app/src/pages/members/ChangeEmailBtn.vue`
  - updates the user resource instead of calling auth
- `app/src/pages/members/ChangePasswordBtn.vue`
  - updates the user resource instead of calling auth

### Notifications

Notifications currently uses auth in two very different ways that must be split apart:

- `notifications-ts/src/clients/komunitin/getAuthCode.ts`
  - calls legacy `/get-auth-code`
- `notifications-ts/src/notifications/handlers/user.ts`
  - calls `/get-auth-code` to create legacy login codes for auth-generated email links
- `notifications-ts/src/newsletter/service.ts`
  - uses `/get-auth-code` to create one-click unsubscribe links

These are not the same use case and must not share the same replacement.

### Service JWT validation

The services still assume legacy issuer/audience/scope behavior:

- `accounting/src/server/auth.ts`
  - accepts legacy audience defaults like `komunitin-app`
  - still uses legacy scope enum names
  - contains temporary Drupal numeric-id compatibility logic
- `social/src/server/auth.ts`
  - still defaults audience to `komunitin-app`
- `notifications-ts/src/server/auth.ts`
  - still defaults audience to `komunitin-app,komunitin-notifications`

## Frontend Migration

### 1. Replace legacy scope names

Current app request:

```text
komunitin_social komunitin_accounting email offline_access openid profile
```

Target request to the new auth service must use the new scope names.

Recommended target for the normal app session:

```text
email offline_access social:read social:write accounting:read accounting:write
```

Notes:

- Do not switch the app scope string until the downstream services accept the new names.
- The new auth service does not issue ID tokens and does not currently expose `openid` or `profile` scopes.
- Admin and superadmin authorization should be modeled deliberately before adding auth scopes for it. There is currently no direct replacement for `komunitin_superadmin`.

### 2. Stop using `authorization_code` for emailed links

Current behavior:

- `app/src/boot/auth.ts` sees `?token=` and calls `authorizeWithCode()`.
- `app/src/plugins/Auth.ts` sends `grant_type=authorization_code`.

This must be removed.

The new auth service does not issue app-login codes by email, and this is a good thing. Email links for password reset and email validation should redeem purpose-specific one-time tokens, not create sessions.

Action items:

- Remove `authorizeWithCode()` from `app/src/plugins/Auth.ts`.
- Remove the boot-time `?token=` auto-login logic from `app/src/boot/auth.ts`.
- Introduce public pages that redeem email tokens explicitly.

### 3. Token refresh

Frontend refresh must use:

```text
POST /token
grant_type=refresh_token
client_id=komunitin-app
refresh_token=<refresh token>
```

Notes:

- This branch fixes the auth-side refresh bug so the response remains usable for audience `app`.
- The frontend must treat refresh as an auth concern only and keep all credential refresh logic inside the auth client layer.
- Do not use legacy `/oauth2/token` URLs.

### 4. Forgot password flow

Current app behavior:

- `ForgotPassword.vue` already calls `POST /reset-password` through `Auth.resetPassword()`.

This part can stay, with the base URL switched to the new auth service.

What must change is the email target page.

Current wrong model:

- reset email points to `/set-password?token=<legacy auth code>`
- page assumes that token logs the user in
- page updates `newPassword` through the user resource

Target model:

- reset email points to a public route such as `/set-password?token=<auth reset token>`
- that page does not log the user in
- the page sends `POST /change-password` with `{ token, password }` directly to auth
- on success, redirect to login

This is the correct use of the new auth service and removes the legacy dependency on magic-login codes.

### 5. Logged-in password change

Current app behavior:

- `ChangePasswordBtn.vue` updates the user resource with `password` and `newPassword`

The new auth service does not currently expose an authenticated self-service password-change endpoint. It only supports reset-token based password changes.

Required auth-side gap to close before app migration is complete:

- add an authenticated endpoint for changing the current user password using bearer auth
- recommended shape:

```text
POST /change-password/authenticated
Authorization: Bearer <user access token>
{ currentPassword, newPassword }
```

Security expectations:

- validate the current password
- hash with bcrypt
- ideally revoke existing refresh-token chains for that user after change

Until this exists, the current logged-in change-password UI cannot be migrated cleanly.

### 6. Logged-in email change

Current app behavior:

- `ChangeEmailBtn.vue` updates the user resource with `email`

Target model:

- `POST /change-email` on auth with bearer token and the new email address
- auth sends validation email
- validation page calls `POST /change-email/confirm` with the email token

Recommended frontend route:

- add a public `/confirm-email?token=...` route
- call `POST /change-email/confirm`
- redirect to login or the appropriate onboarding page after success

Do not auto-login the user from the email token.

### 7. Signup / onboarding email links

Current behavior in notifications emails:

- validation email CTA points to `/groups/:code/signup-member?token=...`
- group-creation validation points to `/groups/new?token=...`

Those routes only work today because the app still assumes legacy auth-code login.

Target model:

- validation email confirms the email address by redeeming the auth token
- onboarding state is handled separately by the social domain

Recommendation:

- use auth token only for email confirmation
- after success, redirect to login or to a public onboarding page
- if the product still requires link-driven continuation without login, add a separate social-owned invite/onboarding token

Do not reintroduce `/get-auth-code` semantics into the new auth service just to keep these flows alive.

## Other Services Migration

### Common JWT validation changes

All services must move to the new auth issuer metadata.

Required changes:

- issuer must be the new auth issuer, not the Drupal `/oauth2` issuer
- audience must match the new auth access tokens
  - current auth access tokens use audience `app`
- JWKS are published by the new auth service at `/.well-known/jwks.json`
- prefer issuer metadata over hardcoded legacy URLs when possible

Best practice:

- use the auth issuer metadata and the returned `jwks_uri`
- do not hardcode the legacy `/oauth2/token` path

### Client credentials

Backend services should use:

```text
POST /token
grant_type=client_credentials
client_id=<service client>
client_secret=<service secret>
scope=<explicit service scopes>
```

Current client IDs in auth:

- `komunitin-notifications`
- `komunitin-social`

Do not request legacy scopes like:

- `komunitin_social_read_all`
- `komunitin_accounting_read_all`
- `komunitin_auth_impersonate_all`

Those do not exist in the new auth service.

### Token delegation

Use token exchange only when a backend already has a real user access token from the frontend.

Flow:

```text
POST /token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
client_id=<service client>
client_secret=<service secret>
subject_token=<frontend user access token>
subject_token_type=urn:ietf:params:oauth:token-type:access_token
scope=<subset of the user scopes>
```

Properties of the current implementation:

- it only down-scopes from the subject token
- it does not allow arbitrary impersonation
- it is the correct replacement for backend-to-backend calls made on behalf of a logged-in user

It is not the correct replacement for emailed links, because email sending time does not come with a user access token.

## Notifications-ts: How To Replace `/get-auth-code`

This must be split into two migrations.

### A. Auth-generated validation and password-reset emails

Current auth behavior:

- `auth/src/services/notifications.ts` sends auth-generated email-link events with the destination email, but without raw action tokens

Current notifications behavior:

- `notifications-ts/src/notifications/handlers/user.ts` calls `/get-auth-code` and puts a legacy login code into the email

Architecture note:

- All auth-generated email-link cases must move from legacy `/get-auth-code` to `POST /action-token`.
- The current cases are password reset, email verification, email change, and newsletter unsubscribe.

Target behavior:

- notifications must stop calling `/get-auth-code`
- it should call auth `POST /action-token` as the notifications service client
- it should pass `userId`, the explicit action `purpose`, and the destination `email` when the purpose is `emailChange`
- email templates should keep building CTA links, but those links must point to new public frontend routes that redeem auth tokens directly

Resulting flow:

1. auth emits an email-link event
2. notifications calls `POST /action-token` with the user id, action purpose, and the new email when changing email
3. auth returns a purpose-bound action token
4. notifications sends email with that raw action token
5. frontend public page calls auth endpoint directly
6. no login session is minted from the email link

### B. Newsletter unsubscribe / one-click unsubscribe

Current behavior:

- `newsletter/service.ts` asks auth for `/get-auth-code`
- links point to `/unsubscribe?token=...` in the app and to `/users/me/unsubscribe?token=...` in social public URLs

This should not be migrated to token exchange.

This should also not be migrated to a general access token or a user impersonation token.

Notifications should replace the `/get-auth-code` call with `POST /action-token`
and the explicit `unsubscribe` purpose. The token must still be purpose-bound
and must not be accepted by `/token`.

Recommended design:

1. Notifications calls auth `POST /action-token` with purpose `unsubscribe`.
2. Auth returns a purpose-bound unsubscribe action token.
3. The public unsubscribe endpoint consumes that token and updates the social email settings.
4. The token is marked as used.
5. The endpoint returns a simple success page or redirect target.

Why this is the right design:

- unsubscribe is not authentication
- notifications does not have a user token at send time
- token exchange cannot help here
- issuing login-capable tokens for unsubscribe is unnecessary and unsafe
- the token can still be minted through the same auth `/action-token` service-to-service workflow as password reset and email verification

#### Social redemption via `POST /redeem-action-token`

Step 3 above is served by a dedicated auth endpoint. The social service must
not read or trust the raw action token itself; it must ask auth to validate and
consume it.

Auth contract:

```text
POST /redeem-action-token
Authorization: Bearer <komunitin-social client_credentials token>
Content-Type: application/json
{ "token": "<raw unsubscribe token>", "purpose": "unsubscribe" }
```

Success response:

```json
{ "userId": "<uuid>", "email": "<user email>", "purpose": "unsubscribe" }
```

Properties:

- authenticated as the `komunitin-social` service client (client credentials)
- `purpose` is restricted to `unsubscribe`; social cannot redeem password-reset,
  email-change, or email-verification tokens
- the token is single-use: auth marks it used on success, so a second redemption
  of the same token returns `400`
- invalid, expired, wrong-purpose, or already-used tokens return `400`

How social must adapt:

1. Obtain a `komunitin-social` client-credentials access token from auth.
2. On the public unsubscribe request, POST the raw token to
   `POST /redeem-action-token` with `purpose: "unsubscribe"`.
3. Use the returned `userId` (and/or `email`) to update the newsletter/email
   settings for that user.
4. Do not decode, verify, or persist the raw token locally, and do not attempt
   to redeem it through `/token`.

If a generic cross-service email-action mechanism is still desired, build purpose-bound action tokens with explicit `purpose`, `audience`, `sub`, and single-use storage. Do not revive `/get-auth-code`.

## User Data Migration From Drupal

The new auth service has a very small user model:

- `id`
- `email`
- `passwordHash`
- `emailVerified`
- `status`

The social service also stores users separately and uses the same UUID as the cross-service user identifier.

### Core rule

There must be one canonical Komunitin user UUID used everywhere:

- auth `User.id`
- social `User.id`
- notifications user relationships
- any future internal references

Do not let auth and social generate separate user IDs during import.

### Migration plan

1. Extract users from Drupal / IntegralCES.
2. Build a canonical mapping table:

```text
legacy_drupal_user_id -> komunitin_user_uuid
```

3. Reuse existing UUIDs already present in migrated social/accounting data when possible.
4. Import auth rows using those UUIDs.
5. Import social rows using the same UUIDs.
6. Reconnect memberships, admin relationships, settings, and notifications references using the canonical UUID.
7. Validate that no runtime path still depends on numeric Drupal IDs.

### Password migration strategy

This repo currently only supports bcrypt password hashes in auth.

The migration must choose one of these two strategies:

#### Option 1. Temporary legacy password verification

Preferred for user experience.

- auth accepts imported Drupal password hashes temporarily
- on first successful login, auth rehashes to bcrypt and removes the legacy hash
- after the migration window, remove legacy-hash support

#### Option 2. Force password reset

Simpler to implement, higher user-friction.

- import users without usable passwords
- mark them for password reset
- send reset emails after cutover

Do not attempt to migrate legacy access tokens or refresh tokens. They belong to the old issuer and should not survive the cutover.

### Email verification and status mapping

Recommended rules:

- active Drupal account -> auth `active`
- blocked / disabled Drupal account -> auth `disabled`
- import `emailVerified` only if the source signal is trustworthy
- if it is not trustworthy, choose one of:
  - mark imported users unverified and revalidate
  - or accept active imported users as verified as a one-time policy decision

This decision must be made explicitly before migration day.

### Accounting compatibility cleanup

`accounting/src/controller/user-controller.ts` still contains compatibility logic for numeric Drupal user IDs in legacy tokens.

That logic should remain only as temporary backward compatibility during the migration window.

The target state is:

- every user token comes from the new auth service
- every token subject is the canonical UUID
- numeric Drupal subject compatibility is deleted

## Recommended Rollout Order

1. Finish auth-side gaps.
   - still missing: authenticated self-service password change
   - still missing outside auth: replacement for legacy magic-link onboarding and unsubscribe tokens
2. Update service JWT validation to the new issuer, audience, and JWKS/discovery.
3. Decide the new scope matrix and any temporary compatibility strategy.
4. Migrate the app auth client.
   - remove `authorization_code`
   - remove boot auto-login from `?token=`
   - switch to new scopes
   - move password/email flows to auth endpoints
5. Migrate notifications.
   - call auth `POST /action-token` for validation, reset, email-change, and unsubscribe emails
   - stop using `/get-auth-code` for email links
6. Import user data from Drupal with canonical UUID mapping.
7. Cut traffic over to the new auth service.
8. Remove all legacy compatibility code and endpoints.

## Verification Checklist

- login works with `password`
- refresh works with `refresh_token`
- refreshed app tokens are JWTs for audience `app`
- backend services validate the new issuer and audience
- no service still calls `/oauth2/token`
- no service still calls `/get-auth-code` or `/get-auth-token`
- password reset emails use raw auth reset tokens
- validation emails use raw auth confirmation tokens
- frontend no longer auto-logs-in from `?token=`
- logged-in email change goes through auth only
- logged-in password change goes through auth only
- newsletter unsubscribe uses dedicated unsubscribe tokens, not login tokens
- imported users have the same UUID in auth and social
- no runtime path still depends on numeric Drupal user IDs

## Open Decisions

These need explicit decisions before the migration can be considered complete:

- What is the permanent replacement for `komunitin_superadmin`?
- Will passwords be migrated with temporary legacy-hash verification or forced reset?
- What is the final scope matrix for read/write/admin operations in accounting and social?
