# Social/Auth Consumer Migration Plan

This is a staged migration plan for moving the frontend and dependent services
from legacy IntegralCES/Drupal social/auth behavior to the new `social` and
`auth` services.

The stages are ordered so each one leaves a testable slice. The frontend does
not need to preserve compatibility with the old APIs; prefer deleting legacy
paths over keeping adapters. Use the new service shapes to simplify consumers,
especially by separating auth-owned credentials from social-owned profile and
membership data.

## Stage 0: Wire The New Services Through Configuration

Goal: make the local stack and consumers point at the new service URLs without
changing business flows yet.

- Add or verify env vars for app, accounting, notifications, and social:
  `AUTH_URL`, `SOCIAL_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`,
  `AUTH_JWKS_URL`, `NOTIFICATIONS_CLIENT_ID`, `NOTIFICATIONS_CLIENT_SECRET`,
  and the matching social client secret where needed.
- Point development config to new auth on port `2026` and new social on the
  social service port, not IntegralCES.
- Make sure app passthrough/proxy config allows the new auth and social URLs.
- Keep migration/import tooling that explicitly reads IntegralCES separate from
  runtime config.
- Do not add frontend compatibility switches for old social/auth APIs.

Verification:

- Full dev stack starts with app, auth, social, accounting, notifications, and
  dependencies.
- `GET /health` works for new services.
- App can reach the configured auth/social URLs through its runtime config.
- Runtime services no longer need IntegralCES to answer auth/social API calls.

## Stage 1: Establish The New Auth Trust Baseline

Goal: make services trust tokens issued by the new auth service.

- Update JWT validation in social, accounting, and notifications to the new
  issuer, JWKS, and audience `app`.
- Replace legacy service scopes with the new scope vocabulary:
  `email`, `social:read`, `social:write`, `accounting:read`,
  `accounting:write`, and any newly agreed admin/read-all scopes.
- Update notifications client credentials to request only scopes allowed for
  `komunitin-notifications`, currently `email social:read accounting:read`.
- Update social service credentials to use `komunitin-social` for delegated
  accounting calls and unsubscribe token redemption.
- Remove legacy issuer-prefix, null-subject, and numeric Drupal-subject handling
  from runtime paths unless a specific import window still requires it.
- Decide and implement the replacement for `komunitin_superadmin` before
  migrating admin and activation screens.

Verification:

- A seeded auth user can get an app token with password grant.
- Refresh token grant returns a usable app JWT.
- Notifications and social can obtain client-credentials tokens.
- Social/accounting/notifications accept new tokens and reject legacy-scope-only
  assumptions.

## Stage 2: Simplify The Frontend Auth Client And Boot Guard

Goal: make app sessions use only the new auth contract.

- In `app/src/plugins/Auth.ts`, replace legacy scopes with the new app scopes.
- Delete `authorizeWithCode()` and all `authorization_code` handling.
- Change auth management calls to JSON: `resetPassword`, `resendValidation`,
  `changePassword`, `changeEmail`, and `confirmEmail`.
- Keep `/token` requests as form-encoded OAuth requests.
- In `app/src/boot/auth.ts`, remove global `?token=` magic login behavior.
- Treat email links as public action-token pages, not login/session links.
- Keep token refresh inside the auth client layer.
- Simplify route guards: public pages stay public; private pages require stored
  or refreshed app credentials.

Verification:

- Login works with email/password and new scopes.
- Refresh works after reload.
- Visiting a URL with `?token=` does not silently create a session.
- Public pages do not attempt to authorize unless they need private data.

## Stage 3: Bootstrap Current User With New Social Shapes

Goal: let a logged-in user load app state through the new social API.

- Replace `GET /users/me?include=members,members.group,settings` with:
  `GET /users/me?include=settings` and
  `GET /users/me/members?include=group,group.currency,account&page[size]=1`.
- Add a dedicated store action/client method for `/users/me/members` instead of
  forcing it through the generic `/users/me` resource endpoint.
- Derive `myMember`, `myAccount`, `myCurrency`, and `myGroup` from normalized
  member/account/group/currency stores, not from embedded `user.members`.
- Remove code that expects to-many relationships under a user include.
- Keep the current-member selection simple at first: load page size `1` until
  the product defines multi-membership switching.
- Convert location list queries from `geo-position=<lng>,<lat>&sort=location`
  to `near=<lat>,<lng>&sort=distance`.

Verification:

- Reload after login reconstructs current user, current member, account, group,
  currency, permissions, and location.
- Home, settings, profile, and basic group pages render without embedded user
  members.
- Nearby group/resource ordering works through `near` and `sort=distance`.

## Stage 4: Create A First Group Through New Auth And Social

Goal: support the first fully new group request flow.

- Add the missing auth-side public registration primitive for new users. The
  frontend should create credentials in auth first; social should not receive or
  store passwords.
- Recommended auth registration shape:
  `POST /register` with `{ "email": "...", "password": "..." }`, creating the
  canonical auth UUID, hashing the password, setting `emailVerified: false`,
  and emitting an email-verification event.
- After registration, the app logs in with password grant and creates the social
  user via `POST /users` using the bearer token; social should use `ctx.userId`
  as the canonical id.
- Simplify `SignupGroup.vue`: separate credentials/account creation from group
  creation, stop sending `password` to social, and stop relying on
  `/groups/new?token=...`.
- Create the group through `POST /groups` with the new group body shape:
  group attributes in `data.attributes`, settings/currency in `included`, and
  no embedded contacts relationship if the new social schema stores contacts as
  attributes.
- Navigate directly from successful admin account creation to group details or
  `/groups/new` under the authenticated session; do not wait for a magic login
  email.

Verification:

- A fresh user can register, log in, create their social user, request a group,
  and see the pending-group confirmation.
- No frontend request sends a password to social.
- The created auth user id and social user id are the same UUID.
- The group appears in social with status `pending` and the requested currency
  and settings.

## Stage 5: Activate And Administer The First Group

Goal: make the first pending group activatable in the new stack.

- Implement the agreed new admin/superadmin authorization scope or role before
  migrating activation UI.
- Update app superadmin/admin route guards to use the new admin signal.
- Update social group patch authorization so an authorized admin can set group
  status from `pending` to `active`.
- Update accounting creation side effects for group/currency activation if they
  are not already handled by social/accounting integration.
- Remove old `komunitin_superadmin` checks from frontend and services once the
  replacement is in place.

Verification:

- A pending group can be activated using only new auth tokens.
- An unauthorized regular user cannot activate groups.
- Once active, the group is visible to public group listing and join flows.

## Stage 6: Migrate Group Member Registration

Goal: support a new user joining an existing active group.

- Update `/groups/:code/signup` to create auth credentials first, then log in,
  then create the social user/settings if needed.
- Create the member through `POST /:code/members` using the authenticated user,
  not by embedding members inside `POST /users`.
- Use the new member shape directly: member profile fields in
  `data.attributes`; user settings through `/users/:id/settings`; no password or
  primary email in social.
- Keep member initial status as `draft` or the new service default, then move to
  `pending` after onboarding profile/offers are complete.
- Remove any dependency on `/groups/:code/signup-member?token=...` as an
  authenticated continuation link.

Verification:

- A fresh user can sign up for an active group, create an auth account, social
  user, and draft member.
- Reload after signup uses normal stored credentials and the new bootstrap flow.
- Completing profile/offers moves the member to `pending`.

## Stage 7: Migrate Email Verification And Onboarding Continuation

Goal: replace email magic login with explicit action-token redemption.

- Update notifications user-email enrichment to call auth `POST /action-token`
  with `purpose: "emailVerification"`.
- Change validation email CTAs away from login-token routes. Use a public route
  such as `/confirm-email?token=...&next=...`.
- Add a frontend public confirmation page that calls
  `POST /change-email/confirm` with `{ token }`.
- After confirmation, redirect to login or to a public onboarding landing page;
  if a logged-in session already exists, route to the appropriate continuation.
- Keep onboarding state in social/member data, not in auth action tokens.

Verification:

- Email verification marks auth `emailVerified` true.
- Reusing the same token fails.
- Confirmation does not create a session by itself.
- A logged-in draft member can continue onboarding after confirming email.

## Stage 8: Migrate Password And Email Account Management

Goal: move all credential mutation out of social user updates.

- Update forgot-password email flow to use `POST /reset-password`, action-token
  email, and public `/set-password?token=...`.
- Make `/set-password` public and call `POST /change-password` with
  `{ token, password }`.
- Add the missing authenticated password-change auth endpoint, then migrate
  `ChangePasswordBtn.vue` to it.
- Migrate `ChangeEmailBtn.vue` to `POST /change-email` with bearer auth and
  email confirmation through `POST /change-email/confirm`.
- Delete social user updates carrying `password`, `newPassword`, or primary
  `email`.

Verification:

- Forgot password works without login.
- Logged-in password change validates the current password and changes future
  login credentials.
- Logged-in email change sends a confirmation email and only changes auth email
  after confirmation.
- Social user profile/settings updates no longer accept credential fields.

## Stage 9: Migrate Core Marketplace And Profile Reads/Writes

Goal: move normal app usage to strict new social query and resource shapes.

- Audit every `include` sent by frontend resource modules and pages; remove
  unsupported nested to-many includes.
- Use allowed route includes only: users `settings`; user members
  `group,group.currency,account`; groups `settings,currency`; members
  `group,account`.
- Normalize store data from collection/subcollection responses instead of
  depending on deeply embedded resources.
- Update profile/member forms to send contacts, location, image, address, and
  metadata in the new member/group attribute shapes.
- Update group/resource search and ordering to use strict `filter`, `sort`,
  `page`, and `near` params.
- Prefer small route-specific client methods where the generic resource module
  would need awkward endpoint overrides.

Verification:

- Group list, group detail, member list, member profile, offers, needs,
  categories, settings, and maps work against the new social service.
- Unsupported includes are gone from frontend tests and mocks.
- Pagination and next-page loading still work.

## Stage 10: Migrate Notifications, Newsletter, And Unsubscribe

Goal: remove `/get-auth-code` from notifications and make email links
purpose-bound.

- Replace `notifications-ts/src/clients/komunitin/getAuthCode.ts` with an
  action-token client for `POST /action-token`.
- Split user-event token purposes: `passwordReset`, `emailVerification`,
  `emailChange`, and `unsubscribe`.
- Update newsletter generation to request `purpose: "unsubscribe"` action
  tokens.
- Implement the public social unsubscribe endpoint if missing. It should accept
  the raw token, obtain a `komunitin-social` client-credentials token, call auth
  `POST /redeem-action-token`, and update the user's newsletter/email settings.
- Keep app `/unsubscribe?token=...` as a public status page if useful, but make
  it call the new social unsubscribe endpoint.
- Update RFC 8058 `List-Unsubscribe` headers to point at the working public
  unsubscribe endpoint.

Verification:

- No notifications code calls `/get-auth-code`.
- Password reset, validation, and newsletter emails contain action tokens, not
  OAuth/login codes.
- One-click unsubscribe consumes the token once and updates social settings.
- Newsletter snapshots and mocks reflect the new links.

## Stage 11: Migrate Accounting And Cross-Service Calls

Goal: make accounting and dependent service calls use new auth identities and
scopes.

- Replace accounting legacy scope enum values with the final new accounting
  scopes.
- Update accounting audience config to `app` and new JWKS/issuer values.
- Remove numeric Drupal user-id compatibility from runtime user resolution after
  imported users use canonical UUIDs.
- Update notifications calls to accounting so client-credentials tokens carry
  only new allowed scopes.
- Update accounting CLI scripts that are meant for the new stack to use new
  auth `/token`, new scopes, and new social `/users/me/members` bootstrap.
- Keep IntegralCES token refresh only inside explicit migration/import tooling.

Verification:

- Accounting API accepts app user tokens and notifications service tokens from
  new auth.
- Current user/account resolution works from canonical UUID subjects.
- Transfers, accounts, stats, and notification-derived accounting reads still
  work.

## Stage 12: Remove Legacy Frontend And Service Paths

Goal: finish the cutover by deleting old assumptions.

- Delete frontend `authorization_code`, magic `?token=` login, old scope names,
  old user-member include paths, and social credential updates.
- Delete notifications `/get-auth-code` mocks/tests/helpers.
- Delete service JWT compatibility for old issuer quirks, null service `sub`,
  and Drupal numeric user ids unless still isolated in import tooling.
- Delete old CLI assumptions or mark old scripts explicitly as IntegralCES-only.
- Search the repo for `/oauth2`, `/get-auth-code`, `/get-auth-token`,
  `authorization_code`, `komunitin_social`, `komunitin_accounting`,
  `komunitin_auth`, `komunitin_superadmin`, `include=members`, `geo-position`,
  and `sort=location`.

Verification:

- The legacy search terms appear only in docs, tests for migration tooling, or
  explicitly named IntegralCES import code.
- App, accounting, social, auth, and notifications test suites pass.
- A full manual journey works: create group, activate group, register member,
  confirm email, complete onboarding, create offer/need, receive notification,
  change email/password, unsubscribe from newsletter.

## Notes On Simplification

- Keep auth and social client code separate. Auth owns credentials, OAuth,
  action tokens, and email verification; social owns users, settings, groups,
  members, posts, and newsletter preferences.
- Prefer explicit route-specific client/store methods over teaching the generic
  resource module every special subcollection path.
- Normalize data after each request and derive current app state from stores;
  avoid rebuilding the old embedded `user.members[0].group.currency.account`
  shape in compatibility code.
- Use action-token pages as public pages with one job each: redeem a token,
  show result, and redirect if appropriate.
- Do not design new frontend code around dual old/new API support. If a flow is
  migrated, remove the old request shape in that flow.
