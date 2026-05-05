# Plan: Social Service Rewrite (Remaining Roadmap)

## TL;DR

Keep rewriting the legacy PHP/Drupal social service as a standalone TypeScript microservice (`social/`) using the same stack as `accounting/` and `notifications-ts/` (Node.js, Express, Prisma, PostgreSQL with RLS, Zod, ts-japi). The remaining work is no longer project scaffolding or initial database setup: those foundations already exist. The work ahead is to finish the service behavior, API surface, auth integration, frontend migration, and deployment wiring.

The key boundary is:

- **Auth service owns identity and credentials**: registration, password storage, email verification, password reset, token issuance, email uniqueness, and auth-related emails.
- **Social service owns the user projection and domain relations**: name, email mirror, settings, members, group admin links, access control, and all group-scoped social data.

`social` must never accept or persist credentials. It only trusts the JWT subject (`sub`) as the canonical user id and maintains a local user projection for domain use.

---

## Current Baseline

These items are already in place and are intentionally **not** tracked as remaining tasks in this plan:

- `social/` workspace exists with `src/`, `test/`, `prisma/`, `package.json`, `tsconfig.json`, `pnpm-workspace.yaml`, and compose for local DB dependencies.
- Initial Express app exists with config loading, middleware skeleton, logging, error handling, and a health endpoint.
- Prisma schema exists for `User`, `Group`, `GroupAdminUser`, `Member`, `MemberUser`, `Category`, and `Post`.
- Initial migrations already cover base schema, PostGIS computed location columns, and row-level security groundwork.
- Basic test wiring exists with at least a health test.

This roadmap starts from that baseline.

---

## Auth / Social Boundary

### Auth Service Responsibilities

- Create identities from email and password.
- Enforce email uniqueness and password policy.
- Send verification and password reset emails.
- Verify email ownership.
- Issue and refresh JWTs.
- Expose auth-specific flows such as register, login, reset password, resend validation, and token exchange.

### Social Service Responsibilities

- Maintain a local `User` projection keyed by auth `sub`.
- Store non-credential user data: `name`, `email` mirror, `settings`.
- Manage `Member`, `MemberUser`, and `GroupAdminUser` relations.
- Enforce tenant-scoped access to group data.
- Expose social onboarding flows after the user is authenticated.

### Hard Rules For The Boundary

- Social endpoints must not accept `password`, password reset tokens, validation tokens, or any other credential material.
- Social does not create identities anonymously.
- Auth remains the source of truth for whether a person exists as an authenticated identity.
- Social mirrors user email only as domain data needed for the app and notifications.
- `User.id` in social must equal the JWT `sub` claim.

### Recommended User Lifecycle

**Member signup**

1. Frontend calls the **auth service** to register an identity with `email` and `password`.
2. Auth sends the validation email.
3. User validates the email and obtains a token through the auth flow.
4. Frontend calls an authenticated **social** bootstrap endpoint to create or upsert the social `User` projection from the JWT subject.
5. Frontend calls social to create a draft `Member` in the selected group.
6. User fills profile data.
7. User applies by moving the member from `draft` to `pending`.
8. Admin approves by moving the member from `pending` to `active`.

**Group founder signup**

1. Frontend calls the **auth service** to register the founder identity.
2. User verifies the email and authenticates.
3. Frontend bootstraps the social `User` projection.
4. Frontend calls social to create a pending group request and attach the founder as the initial admin user relation.
5. Founder member creation remains optional and should be an explicit social step, not an implicit auth side effect.

### API Consequences

- Remove public social signup via `POST /users`.
- Add an authenticated idempotent bootstrap endpoint such as `POST /users/me/bootstrap`.
- Keep `GET /users/me`, `GET /users/:id`, and `PATCH /users/:id` for social profile and settings only.
- Keep member creation and onboarding in social as authenticated domain operations.
- Move password reset and validation-email events out of social. If those events are needed in notifications, they should originate from auth or from an auth-to-notifications integration.

---

## Remaining Phase 1: Service Foundation Completion

### 1.1 — Complete Runtime Wiring

- Expand `src/config.ts` to include all required runtime env vars:
  - `DATABASE_URL`, `PORT`, `API_BASE_URL`
  - `AUTH_JWKS_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`
  - `NOTIFICATIONS_API_URL`, `NOTIFICATIONS_EVENTS_USERNAME`, `NOTIFICATIONS_EVENTS_PASSWORD`
  - `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`
  - `FILES_MAX_SIZE`, `FILES_ALLOWED_TYPES`
- Add Prisma client initialization and request-scoped DB helpers.
- Add the production `Dockerfile` and bundle flow.

### 1.2 — Complete Server Middleware And Auth

- Reuse the same effective middleware stack as `accounting/src/server/app.ts`:
  - `helmet()`
  - `cors()`
  - `express.json({ type: ['application/vnd.api+json', 'application/json'] })`
  - `qs` query parser with comma support
  - Pino HTTP logger
  - JSON:API content type on responses
  - global JSON:API error handler
- Add JWT middleware using `express-oauth2-jwt-bearer`.
- Add helpers equivalent to `userAuth()`, `noAuth()`, and `anyAuth()`.
- Add request context extraction with at least `{ type, userId, scopes }` derived from the JWT.

### 1.3 — Complete Multi-Tenant DB Access

- Implement `tenantDb()`, `privilegedDb()`, `bypassRLS()`, and `forTenant()` in `src/server/multitenant.ts`.
- Scope tenant-aware requests from `/:code/*` using the group code as tenant id.
- Ensure cross-tenant reads are allowed only for privileged scopes and explicit internal flows.

### 1.4 — Complete Shared Utilities

- Add JSON:API parse helpers.
- Add ts-japi serializer definitions.
- Add Zod-based request validation helpers.
- Normalize error mapping to stable JSON:API error objects.

### 1.5 — Complete Test Foundation

- Expand `test/` to include shared setup, DB reset helpers, JWT fixtures, and app boot helpers.
- Keep the existing health test and extend the suite around real routes.

---

## Remaining Phase 2: User Projection And Auth Integration

### 2.1 — User Model Contract

The social `User` record is a projection of an authenticated identity and must contain only:

- `id` = auth `sub`
- `email`
- `name`
- `settings`
- timestamps

No credential data belongs in the model.

### 2.2 — User Endpoints

Implement:

- `POST /users/me/bootstrap`
  - authenticated
  - idempotent
  - creates or updates the local `User` projection from JWT claims and optional onboarding payload such as `name`, `language`, or initial settings
- `GET /users/me`
- `GET /users/:id`
- `PATCH /users/:id`

Constraints:

- `PATCH /users/:id` only updates social-owned fields such as `name` and `settings`.
- Email changes should not be handled directly in social unless there is an explicit synchronized flow with auth. Prefer auth as the initiator of email changes.

### 2.3 — User Access Rules

- Regular users can read and edit their own social user record.
- Group admins can read user records for users who have memberships in their groups.
- Service accounts with read-all scope can read across tenants.
- Only privileged internal flows may upsert arbitrary users.

### 2.4 — Schema And Validation Cleanup

- Remove `password` from all social request schemas.
- Replace `CreateUserSchema` with `BootstrapUserSchema` and `UpdateUserSchema`.
- Ensure the Prisma schema and serializers reflect the social-only user contract.

---

## Remaining Phase 3: Groups And Categories

### 3.1 — Groups

- Implement `GET /groups` for active public groups with pagination and filters.
- Implement `GET /:code` for a single group.
- Implement `PATCH /:code` for admin-managed group updates.
- Implement group settings updates within the same admin-owned flow or a dedicated settings relation.

### 3.2 — Categories

- Implement `GET /:code/categories`.
- Implement admin CRUD for categories.
- Add serializers and validation for category payloads.

### 3.3 — Founder / Group Request Flow

- Define the group request flow explicitly in social.
- Decide whether pending group requests are represented as `Group(status='pending')` directly or through a separate request record.
- Attach the founder through `GroupAdminUser` after the authenticated bootstrap step.

---

## Remaining Phase 4: Members And Onboarding

### 4.1 — Member CRUD

- Implement authenticated member creation under `/:code/members`.
- Implement `GET /:code/members/:id`, `PATCH /:code/members/:id`, and admin delete/disable flows.
- Support ownership and admin checks through `MemberUser` and `GroupAdminUser`.

### 4.2 — Member State Machine

- `draft` → `pending`: user self-apply
- `pending` → `active`: admin approve
- `pending` → `disabled`: admin reject
- `active` → `suspended`: admin
- `active` → `disabled`: admin
- `suspended` → `active`: admin
- `disabled` → `active`: admin re-enable
- `active` → `deleted`: admin or self

### 4.3 — Member Onboarding Flow

Implement the social part of onboarding only after auth bootstrap:

1. `POST /users/me/bootstrap`
2. `POST /:code/members` to create draft member
3. `PATCH /:code/members/:id` for profile completion
4. `PATCH /:code/members/:id` with `state: "pending"` to apply
5. Admin approval to `active`

### 4.4 — Member Queries

- Public member listing subject to `allowAnonymousMemberList`.
- Authenticated member detail with access-controlled fields.
- Geolocation filtering and sorting using PostGIS.

---

## Remaining Phase 5: Offers, Needs, And Categories Integration

### 5.1 — Post CRUD

- Implement unified post controller logic over `Post` with `type` discriminator.
- Expose backward-compatible `/offers` and `/needs` endpoints.
- Support create, update, delete, list, search, filter, include, and pagination.

### 5.2 — Query Features

- `page[size]`, `page[after]`
- `filter[code]`, `filter[state]`, `filter[search]`, `filter[category]`, `filter[member]`
- `sort=field`, `sort=-field`, `sort=location`
- `geo-position=lon,lat`
- `include=group,account`

### 5.3 — Geolocation Queries

- Use PostGIS distance queries for sort and proximity filters.
- Use Prisma raw SQL only where Prisma query builder is insufficient.

---

## Remaining Phase 6: Files And Notifications

### 6.1 — File Uploads

- Implement `POST /files` with bearer auth.
- Validate allowed image types and file size.
- Upload to S3-compatible storage.
- Return stable file reference objects.

### 6.2 — Social Domain Events

The social service should emit only social-domain events such as:

- `MemberRequested`
- `MemberJoined`
- `MemberDisabled`
- `MemberSuspended`
- `OfferPublished`
- `NeedPublished`
- `OfferExpired`
- `NeedExpired`
- `GroupActivated`

Do **not** emit auth-owned events such as:

- `ValidationEmailRequested`
- `PasswordResetRequested`

Those belong to auth or a separate integration owned by auth.

### 6.3 — Event Delivery

- POST to `{NOTIFICATIONS_API_URL}/events` with Basic auth.
- Keep event payloads JSON:API-shaped and anchored on social resource ids.

---

## Remaining Phase 7: Testing, Frontend Migration, And Deployment

### 7.1 — API And Access Tests

- Add test suites for groups, categories, members, offers, needs, users, files, access rules, and events.
- Add explicit tests for user bootstrap and auth/social boundary behavior.
- Add RLS isolation tests across group tenants.

### 7.2 — Frontend Migration

- Refactor frontend signup so credentials go only to auth.
- Remove flows where the app sends `password` through generic social `users/create` calls.
- Update the app to call social bootstrap after verified auth.
- Keep or adapt the existing member onboarding UI so it starts after authenticated bootstrap.

### 7.3 — Deployment Wiring

- Add the `social` service to root `compose.yml` and `compose.dev.yml`.
- Wire env vars, networks, health checks, and dependencies.
- Update `start.sh`.
- Add `build-social` to `.github/workflows/build.yml`.

### 7.4 — Data Migration

- Add `cli/migrate.sh` to import legacy Drupal data.
- Map legacy identifiers to stable UUIDs.
- Migrate file references to S3.

---

## Relevant Files (Reference Patterns)

### Accounting (primary template)

- `accounting/src/server/app.ts` — Express setup and middleware stack
- `accounting/src/server/auth.ts` — JWT auth middleware helpers
- `accounting/src/server/serialize.ts` — ts-japi serializer definitions
- `accounting/src/server/parse.ts` — JSON:API deserialization helpers
- `accounting/src/controller/multitenant.ts` — Prisma RLS helpers
- `accounting/src/controller/features/notificatons.ts` — event publishing to notifications
- `accounting/src/utils/error.ts` — `KError`, `KErrorCode`
- `accounting/src/utils/context.ts` — auth context extraction

### Notifications-TS (secondary reference)

- `notifications-ts/src/config.ts` — Zod config validation pattern
- `notifications-ts/src/server.ts` — Express 5 setup
- `notifications-ts/src/utils/prisma.ts` — PrismaPg adapter usage

### Frontend (API contracts and migration points)

- `app/src/store/model.ts` — API contracts the new service must satisfy
- `app/src/store/resources.ts` — generic JSON:API client used by current flows
- `app/src/store/index.ts` — store module definitions with endpoint patterns
- `app/src/plugins/Auth.ts` — current auth boundary and likely place for new auth registration/bootstrap sequencing
- `app/src/pages/members/Signup.vue` — current member signup entry point to refactor away from social password posting
- `app/src/pages/groups/SignupGroup.vue` — current founder signup entry point to refactor away from social password posting

### PHP Legacy (behavior reference)

- `ices/ces_komunitin/ces_komunitin.api.social.inc` — endpoint routing and access control
- `ices/ces_komunitin/includes/Member.php` — member data shape and state machine
- `ices/ces_komunitin/ces_komunitin.notifications.inc` — legacy event types and payloads

---

## Verification

1. `pnpm run typecheck` passes in `social/`.
2. `pnpm test` passes in `social/`.
3. User bootstrap tests prove social never accepts credentials and uses JWT `sub` as `User.id`.
4. API tests cover CRUD, filters, pagination, geo queries, includes, and error cases.
5. Access tests cover anonymous, user, admin, service account, and superadmin flows.
6. RLS tests prove tenant isolation.
7. Frontend smoke tests verify member signup, group founder signup, and profile completion against the new boundary.
8. CI passes with `build-social` enabled.

---

## Decisions

- **Post table unification**: Offers and Needs share a single `Post` table with a `type` discriminator.
- **Auth-first signup**: Signup begins in auth, not in social.
- **User is a social projection**: Social stores a domain projection of the authenticated identity, not the identity itself.
- **JWT subject is canonical**: `User.id` equals auth `sub`.
- **Credentials never enter social**: Passwords, reset tokens, and validation tokens are out of scope for this service.
- **User is cross-tenant**: A user may have memberships in multiple groups; access is controlled by self/admin rules, not by tenant ownership alone.
- **PostGIS for geo**: Use PostGIS for spatial indexing and distance queries.
- **S3 for files**: Use S3-compatible storage instead of local filesystem.
- **Zod over express-validator**: Use Zod for validation consistency with `notifications-ts`.

---

## Iteration Roadmap

**Iteration 1 — Runtime Completion**: Finish auth middleware, context extraction, multi-tenant Prisma helpers, serializers, validation, Dockerfile, and test setup. Goal: authenticated and tenant-aware empty route skeletons work end to end.

**Iteration 2 — User Projection And Group Basics**: Implement user bootstrap, `GET /users/me`, `PATCH /users/:id`, groups listing/detail/update, and categories. Goal: verified auth can bootstrap a social user and read group data.

**Iteration 3 — Members And Onboarding**: Implement member CRUD, state machine, onboarding flow, and access rules. Goal: auth-first signup reaches a draft member and admin approval flow.

**Iteration 4 — Posts**: Implement offers and needs CRUD, filters, pagination, search, and geo queries. Goal: public and authenticated post flows work.

**Iteration 5 — Files, Events, And Integration**: Implement file uploads, domain events, frontend migration, compose wiring, CI, and data migration script. Goal: end-to-end replacement path is viable.