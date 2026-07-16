# Social/Auth Consumer Migration Plan

This is a staged migration plan for moving the frontend and dependent services
from legacy IntegralCES/Drupal social/auth behavior to the new `social` and
`auth` services.

The stages are ordered so each one leaves a testable slice. First migrate the
frontend's MirageJS server to the new auth and social API shapes, then migrate
the frontend against those mocks before connecting it to the real services. The
frontend does not need to preserve compatibility with the old APIs; prefer
deleting legacy paths over keeping adapters. Use the new service shapes to
simplify consumers, especially by separating auth-owned credentials from
social-owned profile and membership data.

The remaining work is deliberately service-first. Migrate accounting completely,
then migrate and verify social against auth and accounting, then migrate
notifications against all three services. Only after those service boundaries
are stable should end-to-end user workflows be debugged. This keeps workflow
failures from being obscured by several partially migrated backend consumers at
once.

If you find needing changes out of the scope of current stage, just note them in this plan document and we'll implement that later. You can even add additional stages if needed.

If you find missing features in social or auth services, please note that in `.github/prompts/social-auth-todos.md` and we'll implement that later.

## Stage 0: Wire The New Services Through Configuration (DONE)

Goal: make the local stack and consumers point at the new service URLs without
changing business flows yet.

- Add or verify env vars for app, accounting, notifications, and social:
  `AUTH_URL`, `SOCIAL_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`,
  `AUTH_JWKS_URL`, `NOTIFICATIONS_CLIENT_ID`, `NOTIFICATIONS_CLIENT_SECRET`,
  and the matching social client secret where needed.
- Point development config to new auth on port `2026` and new social on the
  social service port, not IntegralCES.
- Point the app `FILES_URL` runtime config at the new social service base URL;
  keep upload consumer shape changes for the later frontend API migration stage.
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

## Stage 1: Migrate Frontend MirageJS Server To New Service Shapes (DONE)

Goal: make the frontend test/mocking layer behave like the new `auth` and
`social` services before any real-service integration work.

- Audit the app MirageJS server, factories, fixtures, serializers, and test
  helpers for legacy IntegralCES/Drupal auth and social assumptions.
- Model auth-owned data separately from social-owned data:
  credentials, OAuth tokens, refresh tokens, action tokens, and email
  verification belong to auth; profiles, settings, groups, members,
  currencies, accounts, contacts, locations, offers, needs, categories, files,
  and newsletter preferences belong to social.
- Update Mirage auth endpoints to the new contracts:
  `POST /token` remains form-encoded OAuth; credential/account management
  endpoints such as `register`, `resetPassword`, `resendValidation`,
  `changePassword`, `changeEmail`, and `confirmEmail` use JSON bodies.
- Add action-token behavior for email verification, password reset, email
  change, onboarding continuation where needed, and unsubscribe links without
  creating app sessions from those tokens.
- Update Mirage social endpoints to return the new resource shapes and allowed
  includes, including `/users/me?include=settings`,
  `/users/:id/members?include=group,group.currency,account&page[size]=1`,
  `/groups`, `/:code/members`, settings, uploads, marketplace resources, and
  strict `filter`, `sort`, `page`, and `near` query params.
- Note: the current social service exposes `/users/:id/members`, not
  `/users/me/members`; load `/users/me` first and use the concrete user id for
  membership requests.
- Remove mocked legacy conveniences that would hide frontend migration work:
  embedded `user.members`, magic `?token=` login, social password fields,
  `authorization_code`, `geo-position`, `sort=location`, and unsupported nested
  to-many includes.
- Keep the Mirage fixtures realistic enough to cover the main product journeys:
  logged-out browsing, login/reload, group creation, activation visibility,
  member signup/onboarding, email confirmation, password/email changes,
  marketplace browsing, uploads, notifications links, and unsubscribe.

Verification:

- Frontend tests that only exercise Mirage continue to run against the new mock
  contracts.
- Test fixtures expose failures when the frontend sends old request shapes.
- Mirage responses match the documented new auth/social API ownership and JSON
  shapes closely enough that frontend migration can happen without real
  services.

## Stage 2: Migrate Frontend In Isolation Against Mirage (DONE)

Goal: move the app to the new auth and social contracts while all frontend tests
still run only against MirageJS.

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
- Replace `GET /users/me?include=members,members.group,settings` with:
  `GET /users/me?include=settings` and
  `GET /users/:id/members?include=group,group.currency,account&page[size]=1`.
- Add a dedicated store action/client method for `/users/:id/members` instead of
  forcing it through the generic `/users/me` resource endpoint.
- Derive `myMember`, `myAccount`, `myCurrency`, and `myGroup` from normalized
  member/account/group/currency stores, not from embedded `user.members`.
- Convert location list queries from `geo-position=<lng>,<lat>&sort=location`
  to `near=<lat>,<lng>&sort=distance`.
- Update first-group and member-signup frontend flows to create auth
  credentials first, then log in, then create social users/groups/members
  without sending passwords to social.
- Add or update public action-token pages for email confirmation, password
  reset, email change confirmation, and unsubscribe status where the frontend
  owns the page.
- Update account-management UI so password and primary email changes call auth
  endpoints, while profile/settings changes call social endpoints.
- Audit every frontend `include` and resource query; remove unsupported nested
  to-many includes and update marketplace/profile/group/member/upload consumers
  to the new social shapes.
- Prefer small route-specific client/store methods where the generic resource
  module would need awkward endpoint overrides.

Verification:

- App unit/component/e2e tests that run against Mirage pass.
- Login, refresh after reload, current-user bootstrap, public browsing,
  group creation, member signup, onboarding continuation, email confirmation,
  password reset/change, email change, profile/settings updates, marketplace
  reads/writes, uploads, maps, and unsubscribe all pass in frontend isolation.
- Frontend tests fail if an old IntegralCES request shape is reintroduced.

## Stage 3: Establish The New Auth Trust Baseline (DONE)

Goal: make services trust tokens issued by the new auth service.

- Update JWT validation in social, accounting, and notifications to the new
  issuer, JWKS, and audience `urn:komunitin:api`.
- Replace legacy service scopes with the new scope vocabulary:
  `email`, `social:read`, `social:write`, `accounting:read`,
  `accounting:write`, and `superadmin`.
- Update notifications client credentials to request only scopes allowed for
  `komunitin-notifications`, currently `email social:read accounting:read`.
- Update social service credentials to use `komunitin-social` for delegated
  accounting calls and unsubscribe token redemption.
- Remove legacy issuer-prefix, null-subject, and numeric Drupal-subject handling
  from runtime paths unless a specific import window still requires it.
- Check the `superadmin` scope is used everywhere needed.

Verification:

- A seeded auth user can get an app token with password grant.
- Refresh token grant returns a usable app JWT.
- Notifications and social can obtain client-credentials tokens.
- Social/accounting/notifications accept new tokens and reject legacy-scope-only
  assumptions.

## Stage 4: Integrate Frontend Auth With The Real Auth Service (DONE)

Goal: prove the already-migrated frontend session model works against real auth.

- Point app runtime/dev config at the real auth service instead of Mirage for
  auth endpoints.
- Verify the real auth service supports the exact request/response shapes used
  by the migrated frontend.
- Fix real auth gaps discovered by frontend integration without adding frontend
  compatibility branches for legacy IntegralCES behavior.
- Keep social calls mocked or isolated until the social integration stages.

Verification:

- Login works with email/password and new scopes.
- Refresh works after reload.
- Visiting a URL with `?token=` does not silently create a session.
- Public pages do not attempt to authorize unless they need private data.

## Stage 5: Bootstrap Current User With Real Social Shapes (DONE)

Goal: prove the migrated app bootstrap works against the real social API.

- Point app runtime/dev config at the real social service for user bootstrap
  endpoints.
- Verify `GET /users/me?include=settings` and
  `GET /users/:id/members?include=group,group.currency,account&page[size]=1`
  match the Mirage contract used in Stage 2.
- Ensure normalized member/account/group/currency stores populate correctly
  from real social responses.
- Keep the current-member selection simple at first: load page size `1` until
  the product defines multi-membership switching.
- Verify real social location queries use `near=<lat>,<lng>&sort=distance`.

Verification:

- Reload after login reconstructs current user, current member, account, group,
  currency, permissions, and location.
- Home, settings, profile, and basic group pages render without embedded user
  members.
- Nearby group/resource ordering works through `near` and `sort=distance`.

## Stage 6: Create A First Group Through Real Auth And Social (DONE)

Goal: support the first fully new group request flow.

- Add or verify the auth-side public registration primitive for new users. The
  frontend creates credentials in auth first; social must not receive or store
  passwords.
- Recommended auth registration shape:
  `POST /register` with `{ "email": "...", "password": "..." }`, creating the
  canonical auth UUID, hashing the password, setting `emailVerified: false`,
  and emitting an email-verification event.
- After registration, the app waits for email verification. Auth stores the
  signup continuation on the purpose-bound verification token and Notifications
  links to `/confirm-email?token=...`.
- Email confirmation returns the signup continuation without creating a
  session. The confirmation page asks for the password, logs in with the normal
  password grant, and creates the social user via `POST /users`; social uses
  `ctx.userId` as the canonical id.
- Simplify `SignupGroup.vue`: separate credentials/account creation from group
  creation, stop sending `password` to social, and stop relying on
  `/groups/new?token=...`.
- Create the group through `POST /groups` with the new group body shape:
  group attributes in `data.attributes`, settings/currency in `included`, and
  no embedded contacts relationship if the new social schema stores contacts as
  attributes.
- Navigate to `/groups/new` under the authenticated session after email
  verification and password login; do not treat the email action token as a
  login credential.

Verification:

- A fresh user can register, verify their email, log in, create their social
  user, request a group, and see the pending-group confirmation.
- Password login is rejected before email verification.
- No frontend request sends a password to social.
- The created auth user id and social user id are the same UUID.
- The group appears in social with status `pending` and the requested currency
  and settings.

## Stage 7: Migrate The Accounting Service (DONE)

Goal: complete the accounting cutover before changing its upstream consumers.

- Replace legacy accounting scope enum values and authorization checks with
  `accounting:read`, `accounting:write`, and `superadmin` as appropriate.
- Validate tokens against the exact new auth issuer, JWKS, and audience
  `urn:komunitin:api`; remove IntegralCES issuer-prefix and null-subject
  compatibility from accounting runtime auth.
- Resolve users and account ownership from canonical UUID subjects. Remove the
  numeric Drupal user-id lookup from normal request handling while keeping any
  required conversion inside explicit IntegralCES migration tooling.
- Audit currency, account, transfer, stats, notification-facing, top-up, and
  admin endpoints so each one requires the narrowest new scope that supports
  its operation.
- Update accounting OpenAPI declarations, test token helpers, fixtures, and
  service tests to use the new audience, subjects, and scope names.
- Move accounting administration commands for the new stack into the shared
  TypeScript CLI. Use auth `POST /token`, the new scopes, and social
  `GET /users/:id/members` where current-member discovery is needed.
- Delete the service-local shell CLI, including the obsolete IntegralCES
  migration script; do not retain legacy paths in normal accounting clients.

Verification:

- Accounting accepts app user tokens and appropriately downscoped service
  tokens issued by new auth, and rejects legacy issuer/audience/scope shapes.
- Current-user and account resolution work from canonical UUID subjects only.
- Currency/account provisioning, transfers, balances, history, stats, top-ups,
  and notification-facing reads pass accounting API tests.
- Explicit IntegralCES import/migration tests remain isolated from runtime auth.

## Stage 8: Migrate And Verify The Social Service

Goal: make social a complete consumer of new auth and the migrated accounting
service before debugging frontend workflows.

- Audit social JWT authorization and request context against the exact new
  issuer, audience, canonical UUID subject, `social:read`, `social:write`, and
  `superadmin` semantics. Remove remaining IntegralCES runtime identity
  assumptions.
- Verify social's delegated accounting client exchanges the user's token through
  new auth and requests only `accounting:read` or `accounting:write` for the
  operation being performed.
- Verify `GET /users/me?include=settings`,
  `GET /users/:id/members?include=group,group.currency,account&page[size]=1`,
  groups, settings, currencies, accounts, members, categories, offers, needs,
  locations, contacts, and files against the contracts already represented by
  Mirage and consumed by the frontend.
- Complete group lifecycle behavior: create a pending group, authorize
  superadmin activation, provision its accounting currency/accounts through the
  migrated accounting boundary, and make active groups available to public
  listing and joining.
- Make member provisioning idempotent per authenticated user and group, keep
  onboarding state in social, and enforce the intended `draft` to `pending`
  status transition.
- Resolve the remaining relationship metadata and group-admin endpoint gaps
  recorded in `social-auth-todos.md` so real responses expose the permissions
  and counts expected by the frontend.
- Verify strict `filter`, `sort`, `page`, `include`, and `near` handling for
  groups, members, offers, and needs. Settle the coordinate-order contract and
  use it consistently in social, Mirage, and frontend consumers.
- Verify `POST /:code/files/upload` accepts one file and the required
  `resourceType` (`members`, `groups`, `offers`, or `needs`) without any legacy
  Drupal file endpoint.
- Implement the public social unsubscribe endpoint: redeem an auth
  `unsubscribe` action token with the social service credentials and update the
  user's newsletter preferences.
- Run the social service boundary tests with mocked auth, accounting,
  notifications, and storage dependencies before starting full-stack workflow
  debugging.

Verification:

- Social accepts new user/service tokens, enforces the new scopes and
  superadmin rules, and contains no runtime numeric Drupal identity path.
- Its user bootstrap, group lifecycle, member lifecycle, marketplace, location,
  relationship metadata, upload, and unsubscribe API tests pass.
- Delegated accounting reads/writes work through new auth against migrated
  accounting and never use IntegralCES tokens.
- Real social response and error shapes match the migrated frontend/Mirage
  contract.

## Stage 9: Migrate The Notifications Service

Goal: make notifications consume new auth, social, and accounting contracts and
emit purpose-bound links.

- Validate inbound tokens against the exact new issuer, JWKS, and audience
  `urn:komunitin:api`; remove IntegralCES issuer-prefix, null-subject, and
  numeric-user-id compatibility from notifications runtime auth and event
  handling.
- Obtain a notifications client-credentials token from new auth with only
  `email social:read accounting:read`, and use canonical UUIDs for all social
  and accounting enrichment calls.
- Replace any remaining `/get-auth-code` or OAuth-code helper with the
  `POST /action-token` client.
- Map each email flow to its explicit token purpose: `passwordReset`,
  `emailVerification`, `emailChange`, or `unsubscribe`.
- Point validation and account-management CTAs at their public frontend
  action-token pages; do not create sessions from email links.
- Generate newsletter unsubscribe tokens with purpose `unsubscribe`, point the
  application status page at the social unsubscribe endpoint, and update RFC
  8058 `List-Unsubscribe` headers to the working public endpoint.
- Update notifications mocks, fixtures, snapshots, and tests to the new auth,
  social, accounting, and link contracts.

Verification:

- Notifications accepts new event tokens and rejects legacy auth shapes.
- No notifications code calls `/get-auth-code` or relies on IntegralCES user-id
  lookup.
- Social/accounting enrichment works with the narrowly scoped notifications
  client token.
- Password reset, validation, email-change, and newsletter emails contain the
  correct single-purpose action tokens and links.
- Notifications typecheck, API/unit tests, and email snapshots pass.

## Stage 10: Debug Group Administration And Member Onboarding Workflows

Goal: debug the primary registration journeys end to end now that the service
boundaries are migrated.

- Re-run the first-group journey from Stage 6 against the fully migrated stack:
  register credentials, verify email, log in, create the social user, and
  create a pending group.
- Grant and expose the new `superadmin` signal, update frontend admin route
  guards, and activate the pending group through social. Verify the migrated
  accounting side effects before exposing the group publicly.
- Debug `/groups/:code/signup` so it creates auth credentials first, verifies
  email, logs in normally, creates social user/settings if needed, and creates
  the member through `POST /:code/members`.
- Send member profile fields in `data.attributes`, user settings through
  `/users/:id/settings`, and no password or primary email to social.
- Remove dependencies on `/groups/:code/signup-member?token=...`; email
  confirmation is a public action-token flow and onboarding resumes from
  persisted social/member state after normal login.
- Verify public `/confirm-email?token=...&next=...` calls
  `POST /email/confirm` with `{ token }`, shows the result, and directs the user
  to normal login or the appropriate onboarding continuation.
- Verify reloads during both journeys reconstruct current user, member, account,
  group, currency, permissions, and onboarding status from normalized stores.

Verification:

- A pending group can be activated by an authorized superadmin but not by a
  regular user; once active, it appears in public listings and join flows.
- A fresh user can join that group, create one idempotent draft member, reload,
  complete profile/offers, and move the member to `pending`.
- Email confirmation is single-use, marks auth `emailVerified`, and never
  creates an app session itself.
- Both workflows use canonical UUIDs and no request sends credentials to social.

## Stage 11: Debug Account Management Workflows

Goal: verify every credential mutation stays in auth while profile and
preferences stay in social.

- Debug forgot-password through auth `POST /reset-password`, its purpose-bound
  email, and public `/set-password?token=...` calling
  `POST /change-password` with `{ token, password }`.
- Implement the missing authenticated password-change auth endpoint and verify
  `ChangePasswordBtn.vue` sends the current and new passwords only to auth.
- Verify `ChangeEmailBtn.vue` calls auth `POST /change-email` with bearer auth
  and completes the change through `POST /email/confirm`.
- Verify social profile/settings updates contain no `password`, `newPassword`,
  or primary `email` fields.

Verification:

- Forgot password works without a session and its token cannot be reused.
- Logged-in password change validates the current password and changes future
  login credentials.
- Logged-in email change updates the auth email only after confirmation.
- Profile, settings, and newsletter preferences remain independently editable
  through social.

## Stage 12: Debug Marketplace, Profile, And Location Workflows

Goal: verify normal app usage against strict real social resources after the
service migrations.

- Exercise group list/detail, member list/profile, contacts, categories,
  offers, needs, settings, maps, and upload flows against real social.
- Audit every frontend `include`; retain only route-supported includes and
  normalize collection/subcollection responses instead of relying on deeply
  embedded resources. In particular, use users `settings`, user members
  `group,group.currency,account`, groups `settings,currency`, and members
  `group,account`.
- Verify profile/member forms send contacts, location, image, address, and
  metadata in the new member/group attribute shapes.
- Verify uploads use social `POST /:code/files/upload` with one file and the
  correct `resourceType` multipart field.
- Verify search, filtering, explicit distance ordering, pagination, and
  next-page loading use the strict `filter`, `sort`, `page`, and `near`
  contracts established in Stage 8.
- Prefer small route-specific client methods where the generic resource module
  would otherwise need endpoint-specific compatibility behavior.

Verification:

- Core marketplace and profile reads/writes work against real social.
- Unsupported includes and the legacy Drupal upload path are absent from
  frontend requests, tests, and mocks.
- Location ordering, pagination, and next-page loading match real social.

## Stage 13: Debug Notification, Newsletter, And Unsubscribe Workflows

Goal: verify the migrated notifications service in real user journeys.

- Trigger verification, password-reset, email-change, marketplace, transfer,
  and newsletter notifications from the relevant real service boundaries.
- Verify email enrichment reads canonical user/member/account data from auth,
  social, and accounting with the notifications service token.
- Exercise the public app action-token pages and confirm each accepts only its
  matching token purpose.
- Exercise one-click newsletter unsubscribe through the public social endpoint
  from the app's public `/unsubscribe?token=...` status page, and reflect the
  updated preference in the app.

Verification:

- Relevant social and accounting events produce the expected emails exactly
  once.
- Every action link completes its intended public flow without silently logging
  the user in.
- One-click unsubscribe consumes its token once, updates social settings, and
  is reflected by subsequent newsletter selection.

## Stage 14: Remove Legacy Paths And Run Full Regression

Goal: finish the cutover after the migrated workflows are proven.

- Delete frontend `authorization_code`, magic `?token=` login, old scope names,
  old user-member include paths, legacy upload/location params, and social
  credential updates.
- Delete notifications `/get-auth-code` mocks, tests, and helpers.
- Delete service JWT compatibility for old issuer quirks, null service `sub`,
  and Drupal numeric user ids unless isolated in explicitly named IntegralCES
  import tooling.
- Delete old CLI assumptions or mark old scripts explicitly as
  IntegralCES-only.
- Search the repo for `/oauth2`, `/get-auth-code`, `/get-auth-token`,
  `authorization_code`, legacy `komunitin_*` scope names, `include=members`,
  `geo-position`, and `sort=location`.

Verification:

- Legacy search terms appear only in documentation, migration-tooling tests, or
  explicitly named IntegralCES import code.
- App, auth, accounting, social, and notifications lint, typecheck, and test
  suites pass.
- A full manual journey works: create and activate a group, register a member,
  confirm email, complete onboarding, create an offer/need, make a transfer,
  receive notifications, change email/password, and unsubscribe from the
  newsletter.

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
