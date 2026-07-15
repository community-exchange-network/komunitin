# Social and Auth Migration Inventory

This file is not a migration plan. It is a prompt/inventory of calls, contracts,
and code patterns that must be considered when migrating consumers from
IntegralCES/Drupal social and auth behavior to the new `social` and `auth`
services in this repository.

## Auth Service Contracts To Use

- Use the new auth base URL directly, with OAuth token requests sent to `POST /token`; do not use legacy `/oauth2/token`, `/get-auth-code`, or `/get-auth-token`.
- `POST /token` still uses `application/x-www-form-urlencoded`; the auth management endpoints use JSON bodies.
- Supported OAuth grants in the new auth service are `password`, `refresh_token`, `client_credentials`, and `urn:ietf:params:oauth:grant-type:token-exchange`.
- Do not use `authorization_code`; the new auth service intentionally does not exchange emailed `?token=...` links for app sessions.
- The public app client is `komunitin-app` and supports `password` and `refresh_token`.
- Confidential service clients currently implemented in auth are `komunitin-social` and `komunitin-notifications`; both support `client_credentials` and token exchange.
- App login scopes must move from `komunitin_social komunitin_accounting email offline_access openid profile` to the new scope vocabulary, such as `email offline_access social:read social:write accounting:read accounting:write`.
- The new auth service does not issue ID tokens and does not expose `openid` or `profile` scopes.
- Legacy scopes such as `komunitin_social`, `komunitin_accounting`, `komunitin_social_read_all`, `komunitin_accounting_read_all`, `komunitin_auth_impersonate_all`, and `komunitin_superadmin` must not be requested from the new auth service.
- Current new auth access tokens use audience `app`; consumers that validate JWTs must update issuer, audience, and JWKS configuration away from legacy Drupal defaults.
- Prefer OIDC issuer metadata/JWKS from the new auth service where possible; avoid hardcoded legacy `/.well-known/jwks.json` and `/oauth2` paths.
- Frontend refresh must remain a token endpoint form request with `grant_type=refresh_token`, `client_id=komunitin-app`, and `refresh_token=<stored refresh token>`.
- Backend service tokens must use `grant_type=client_credentials`, `client_id=<service client>`, `client_secret=<service secret>`, and an explicit allowed new scope set.
- Token exchange is only for backend calls made on behalf of an already-authenticated frontend user; it requires a real user access token as `subject_token` and can only down-scope from that subject token.
- Token exchange must not be used as a replacement for emailed links, unsubscribe links, or arbitrary impersonation.
- Auth JSON endpoints to migrate to are `POST /reset-password` with `{ "email": "..." }`, `POST /change-password` with `{ "token": "...", "password": "..." }`, `POST /change-email` with bearer auth and `{ "email": "..." }`, `POST /email/confirm` with `{ "token": "..." }`, and `POST /resend-validation` with `{ "email": "..." }`.
- Auth-generated action tokens are purpose-bound and are not OAuth tokens; they must never be sent to `POST /token`.
- Notifications can request purpose-bound action tokens via `POST /action-token` as `komunitin-notifications`.
- `POST /action-token` accepts `{ "purpose": "passwordReset" | "emailVerification" | "unsubscribe", "userId": "<uuid>" }` or `{ "purpose": "emailChange", "userId": "<uuid>", "email": "new@example.org" }`.
- Social can redeem unsubscribe action tokens through auth `POST /redeem-action-token` as `komunitin-social`, with `{ "token": "...", "purpose": "unsubscribe" }`.
- `POST /redeem-action-token` consumes the token once and returns `{ "userId": "<uuid>", "email": "...", "purpose": "unsubscribe" }` on success.
- Social must not decode, verify, persist, or locally trust raw action tokens; it must ask auth to redeem them.

## Social Service Contracts To Use

- User resource includes are now limited to to-one relationships; `GET /users/me?include=members,members.group,settings` must be replaced.
- Bootstrap the current user with `GET /users/me?include=settings` plus `GET /users/me/members?include=group,account&page[size]=1`.
- If the bootstrap flow needs currency data, use `GET /users/me/members?include=group,group.currency,account&page[size]=1`.
- The current member, account, group, and currency should be derived from the members collection/store, not from `user.members` embedded in the user resource.
- The new `/users/:id/members` collection is paginated; consumers must handle `links.next`/page metadata or explicitly request a small current-member page where appropriate.
- The social request parser now validates include, filter, sort, page, and route params strictly; unsupported include paths should be treated as migration failures, not ignored compatibility behavior.
- Use only allowed includes per route: users support `settings`; user members support `group`, `group.currency`, and `account`; tenant members support `group` and `account`; groups support `settings` and `currency`.
- To-many relationships should be fetched through collections/subcollections instead of nested `include` paths.
- Location sorting must move from the old app pattern `geo-position=<lng>,<lat>` plus `sort=location` to the new social pattern `near=<lat>,<lng>` plus `sort=distance`.
- The app stores locations as `[longitude, latitude]`; convert order before sending the new `near` parameter, which expects latitude first and longitude second.
- The social service still uses JSON:API payload shapes for resources and settings; auth management endpoints use plain JSON, so do not reuse JSON:API request builders for auth endpoints.
- Social user resources no longer own password or primary email mutation; password/email flows belong to auth.
- Social `PATCH /users/:id/settings` remains the place for user preferences such as language, notification settings, and newsletter email settings.
- Social currently still checks legacy `komunitin_superadmin` and `komunitin_social_read_all` scopes in `social/src/server/context.ts`; those authorization checks need a new-scope replacement before relying fully on new auth tokens.

## Frontend App Patterns To Migrate

- `app/src/plugins/Auth.ts` still requests legacy scopes and exposes `authorizeWithCode()` using `grant_type=authorization_code`; both patterns must be removed or replaced.
- `app/src/plugins/Auth.ts` currently sends `resetPassword()` and `resendValidationEmail()` as `application/x-www-form-urlencoded`; migrate those to JSON bodies for the new auth service.
- `app/src/boot/auth.ts` auto-logs-in from any `?token=` except `/unsubscribe`; remove that global magic-login behavior.
- Email-link routes must redeem purpose-specific action tokens directly and must not create app sessions.
- `/set-password` currently assumes the token first logs the user in and then updates `newPassword` through the social user resource; it must become a public reset-token page that calls auth `POST /change-password` with `{ token, password }` and then redirects to login.
- The `/set-password` route is currently not marked public; under the new flow it must be publicly reachable without the boot guard trying stored-token login first.
- `app/src/pages/members/ChangePasswordBtn.vue` updates the social user resource with `password` and `newPassword`; it needs an auth-owned replacement endpoint for logged-in password changes.
- `app/src/pages/members/ChangeEmailBtn.vue` updates the social user resource with `email` and optional password; it must call auth `POST /change-email` with bearer auth and then rely on a confirmation email.
- Add or reuse a public email confirmation page that calls auth `POST /email/confirm` with `{ token }`; do not auto-login from the email token.
- `app/src/pages/settings/Unsubscribe.vue` posts directly to `${SOCIAL_URL}/users/me/unsubscribe?token=...`; the target social endpoint must redeem the raw token through auth and update newsletter settings without requiring app login.
- `app/src/store/me.ts` bootstraps with `users/load` and `include: "members,members.group,settings"`; replace this with separate user and user-members loads.
- `app/src/store/me.ts` getters `myMember`, `myAccount`, and `myCurrency` currently read nested data under `myUser`; migrate them to derive from the members/account/currency stores after the new bootstrap calls.
- `app/src/store/resources.ts` currently emits `geo-position` and default `sort=location` when `payload.location` exists; migrate the query builder to emit `near=<lat>,<lng>` and default `sort=distance` for new social endpoints.
- `app/src/store/index.ts` has `users.resourceEndpoint(..., id?)` mapping no-id calls to `/users/me`; user-members subcollection loading likely needs a dedicated resource action or specialized endpoint because the generic user resource module does not express `/users/me/members`.
- `app/src/router/routes.ts` currently treats `/groups/new` and `/groups/:code/signup-member` as logged-in continuation routes for email validation links; those flows must be reviewed because validation action tokens do not authenticate.
- Tests and mocks that expect magic-login `?token=` behavior, legacy scopes, or embedded user members need to be updated alongside app changes.

## Notifications Service Patterns To Migrate

- `notifications-ts/src/clients/komunitin/AuthProvider.ts` currently requests legacy service scopes `komunitin_social_read_all komunitin_accounting_read_all komunitin_auth_impersonate_all`; replace with the new allowed scopes for `komunitin-notifications`, currently `email social:read accounting:read`.
- `notifications-ts/src/clients/komunitin/getAuthCode.ts` calls legacy `/get-auth-code`; remove this helper or replace it with an action-token client that calls auth `POST /action-token`.
- `notifications-ts/src/notifications/handlers/user.ts` calls `getAuthCode()` for all user email events; split by action purpose and request the correct action token purpose from auth.
- Password reset email tokens should be `passwordReset` action tokens and should lead to the public frontend password reset page.
- Email validation tokens should be `emailVerification` action tokens and should lead to a public frontend confirmation/onboarding route that redeems the token explicitly.
- Email change tokens should be `emailChange` action tokens and must include the destination email when requesting `POST /action-token`.
- Newsletter unsubscribe tokens should use `purpose: "unsubscribe"` action tokens, not login-capable auth codes.
- `notifications-ts/src/newsletter/service.ts` currently calls `getAuthCode(user.id, ["komunitin_social"])`; replace with the unsubscribe action-token purpose.
- `notifications-ts/src/newsletter/template.ts` builds app unsubscribe links as `/unsubscribe?token=...`; this can stay as the app-facing URL if the app posts to the new social redemption endpoint.
- `notifications-ts/src/clients/email/mailer.ts` builds RFC 8058 `List-Unsubscribe` URLs as `${KOMUNITIN_SOCIAL_PUBLIC_URL}/users/me/unsubscribe?token=...`; this endpoint must be backed by the new social/auth redemption flow or the URL must change.
- `notifications-ts/src/notifications/emails/user.ts` currently creates validation CTAs to `/groups/:code/signup-member?token=...` or `/groups/new?token=...`; those links must stop relying on boot-time magic login.
- `notifications-ts/src/clients/komunitin/client.ts` uses client-credentials tokens for social/accounting API reads; after scope migration, verify every called endpoint accepts the new scopes and token audience.
- Notification mocks and snapshot tests still return or assert `mock-unsubscribe-token` from `/get-auth-code`; update them to the action-token contract.

## Accounting Service Patterns To Migrate

- `accounting/src/server/auth.ts` still defines legacy `Scope.Accounting`, `Scope.AccountingReadAll`, and `Scope.Superadmin`; replace these with the final new accounting scope matrix.
- `accounting/src/config.ts` defaults `AUTH_JWT_AUDIENCE` to `komunitin-app,komunitin-notifications`; the new auth service currently issues audience `app`.
- `accounting/src/server/auth.ts` contains legacy JWT validators for null `sub` and issuer prefixes caused by IntegralCES; keep only if needed during compatibility, then delete.
- `accounting/src/controller/user-controller.ts` supports numeric Drupal user IDs by mapping them to UUID-like ids; this must be temporary and removed once all token subjects are canonical UUIDs.
- `accounting/src/migration/integralces-migration.ts` refreshes source tokens through `${source.url}/oauth2/token`; keep that only for import-from-Drupal migration tooling, not runtime auth.
- `accounting/cli/access.sh` requests legacy scopes from `$ICES_URL/oauth2/token`; add a new-auth variant or update it when the CLI is meant to target the new stack.
- `accounting/cli/create_credit_commons_node.sh` fetches legacy `/ces/api/social/users/me?include=members`; update it to the new split `users/me` plus `users/me/members` calls if it must work after social cutover.
- Accounting tests that mint or expect legacy `komunitin_*` scopes need new-scope equivalents.

## Cross-Service Data And Identity Patterns

- The same canonical Komunitin UUID must be used everywhere: auth `User.id`, social `User.id`, notifications user relationships, accounting user/account relations, and future internal references.
- Do not let auth and social create different UUIDs for the same imported person.
- User import must preserve or build a mapping from legacy Drupal numeric user ids to canonical UUIDs and then stop using numeric ids at runtime.
- Imported password handling must be explicitly decided before migration: temporary Drupal hash verification with rehash-on-login, or forced password reset.
- Imported `emailVerified` and account status must be mapped intentionally from Drupal/IntegralCES signals.
- Do not migrate legacy access tokens or refresh tokens; they belong to the old issuer.

## Unclear Or Not Yet Fully Implemented Paths

- There is no authenticated self-service password-change endpoint in auth yet; current app logged-in password change cannot be migrated cleanly until a bearer-auth endpoint such as `POST /change-password/authenticated` exists or another explicit contract is chosen.
- The permanent replacement for `komunitin_superadmin` is not defined; app superadmin login, route guards, social privileged reads, and accounting admin behavior still depend on this concept.
- The final new scope matrix for social read-all, social admin, accounting read-all, accounting write/admin, notifications service reads, and superadmin-like operations is not fully clear.
- Social has the auth-side `POST /redeem-action-token` contract available, but a public social endpoint for `/users/me/unsubscribe?token=...` and a social client-credentials auth client were not found in `social/`; this path needs implementation or a different endpoint.
- Link-driven signup/onboarding after email verification is not fully defined: validation tokens confirm email, but they do not authenticate or carry social onboarding state.
- The target frontend route after email verification is not settled for group-member signup versus new-group creation; current `/groups/:code/signup-member?token=...` and `/groups/new?token=...` links depend on magic login.
- It is unclear whether app bootstrap should keep only the first member with `page[size]=1` or support multi-membership selection now that `/users/me/members` is paginated.
- It is unclear whether the app should continue deriving the accounting API base URL from HATEOAS currency links after the social/auth migration, or whether the new stack should rely on configured service URLs.
- It is unclear which legacy compatibility validators for JWT issuer prefix, null `sub`, and numeric user subjects must remain during a staged rollout and when each should be removed.
