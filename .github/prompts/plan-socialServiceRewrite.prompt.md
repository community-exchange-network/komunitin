# Plan: Social Service Rewrite (Roadmap)

## TL;DR

Rewrite the legacy PHP/Drupal social service as a standalone TypeScript microservice (`social/`) using the same stack as `accounting/` and `notifications-ts/` (Node.js, Express, Prisma, PostgreSQL with RLS, Zod, ts-japi). The service manages groups, members, offers/needs/posts, categories, contacts, users, and user/group settings — exposing a JSON:API-compliant REST API. Multi-tenancy is enforced via Postgres Row Level Security keyed on group code. File storage uses S3-compatible object storage. Events are published to the notifications service. All API endpoints are thoroughly tested.

---

## Phase 1: Project Scaffolding & Infrastructure

### 1.1 — Initialize `social/` directory
- Create `social/` at repo root with same layout as `accounting/`:
  - `src/`, `test/`, `prisma/`, `Dockerfile`, `compose.yaml`, `package.json`, `tsconfig.json`, `pnpm-workspace.yaml`
- `package.json` dependencies (mirror `notifications-ts`): `express@5`, `@prisma/client`, `@prisma/adapter-pg`, `helmet`, `cors`, `pino`, `pino-http`, `qs`, `zod`, `express-oauth2-jwt-bearer`, `ts-japi`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`
- Dev dependencies: `tsx`, `typescript`, `supertest`, `@types/express`, `@types/supertest`, `@types/cors`, `msw` (optional), `esbuild`
- `tsconfig.json` — strict mode, ESM, same as `accounting/tsconfig.json`
- `pnpm-workspace.yaml` with approved native packages

### 1.2 — Docker & Compose
- `Dockerfile` — Node.js 24 (align with `notifications-ts`), pnpm, prisma generate, esbuild bundle
- `compose.yaml` — PostgreSQL (with PostGIS extension for geo queries) + MinIO (S3-compatible) for local dev
- Add `social` service block to root `compose.yml`, `compose.dev.yml`
- Port: **2028** (next available after accounting=2025)

### 1.3 — Config (`src/config.ts`)
- Zod-validated env schema (pattern from `notifications-ts/src/config.ts`):
  - `DATABASE_URL`, `PORT`, `API_BASE_URL`
  - `AUTH_JWKS_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`
  - `NOTIFICATIONS_API_URL`, `NOTIFICATIONS_EVENTS_USERNAME`, `NOTIFICATIONS_EVENTS_PASSWORD`
  - `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`
  - `FILES_MAX_SIZE` (default 2MB), `FILES_ALLOWED_TYPES`
  
### 1.4 — Express Server (`src/server.ts`, `src/app.ts`)
- Reuse exact middleware stack from `accounting/src/server/app.ts`:
  - `helmet()`, `cors()`, `express.json({ type: ['application/vnd.api+json', 'application/json'] })`
  - Custom query parser with `qs.parse({ comma: true })`
  - Pino HTTP logger
  - JSON:API content-type on response
  - Global error handler → JSON:API error format
- Auth middleware: `express-oauth2-jwt-bearer` with same `userAuth()`, `noAuth()`, `anyAuth()` helpers from accounting
- Context extraction: `context(req)` → `{ type, userId }` (pattern from `accounting/src/utils/context.ts`)

### 1.5 — Multi-Tenancy via RLS (`src/server/multitenant.ts`)
- Copy `tenantDb()`, `privilegedDb()`, `bypassRLS()`, `forTenant()` from `accounting/src/controller/multitenant.ts` — same Prisma extension pattern
- Tenant = group code (4-char, e.g., "GRP0")
- Each request scoped via `/:code/*` route param → `tenantDb(prisma, code)`

### 1.6 — Shared Utilities
- `src/utils/error.ts` — `KError`, `KErrorCode` enum, `errorHandler`, `asyncHandler` (reuse from accounting)
- `src/utils/logger.ts` — Pino logger
- `src/utils/parse.ts` — JSON:API `mount()` / `input()` for deserialization
- `src/server/serialize.ts` — ts-japi serializer definitions
- `src/server/validation.ts` — Zod schemas for request validation (unlike accounting that uses express-validator, we use Zod like notifications-ts)

---

## Phase 2: Data Model (Prisma Schema)

### 2.1 — Prisma Schema (`prisma/schema.prisma`)

All models include `tenantId` with RLS default. The tenant is the group code.

Obs: user is the person (authentication identity), member is the profile within a group, a user can have multiple members in different groups. There is a 1-to-1 relationship between member and account from accounting service.

**Group** — The community. This is also the "tenant" definition.
```
Group {
  id          String @id @default(uuid())
  tenantId    String @default(dbgenerated) @db.VarChar(31) 
  // Group "code" is the tenant id, so we don't need a separate code field.
  name        String @db.VarChar(255)
  description String @db.Text
  status      String @default("pending") @db.VarChar(31) // 'pending', 'active', 'disabled', 'deleted'
  image       Json?        // S3 URL { key, url, mime }
  access      String @default("public") @db.VarChar(31)  // 'public', 'group', 'private'
  
  // Explicit latitude/longitude for easy Prisma writes, PostGIS indexed column created via raw SQL
  // ADD COLUMN location geography(Point, 4326) GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)) STORED;
  latitude    Float?
  longitude   Float?
  
  address     Json?        // Structured address: { street, postalCode, city, region, country }
  settings    Json?        // GroupSettings: { requireAcceptTerms, minOffers, minNeeds, allowAnonymousMemberList, enableGroupEmail, defaultGroupEmailFrequency }
  contacts    Json?        // Embedded contacts array: [{ type: 'whatsapp', value: '+34...' }]
  
  created     DateTime @default(now())
  updated     DateTime @updatedAt
  
  members     Member[]
  categories  Category[]
  posts       Post[]
  admins      GroupAdminUser[]
}
```

**User** — The person (authentication identity).
```
User {
  id       String @id  // matches auth provider's sub claim (UUID)
  name     String
  email    String @unique
  settings Json?       // UserSettings: { language, komunitin, notifyMyAccount, notifyGroup, emailMyAccount, emailGroup }
  created  DateTime @default(now())
  updated  DateTime @updatedAt
  
  members  Member[]
}
```
Note: This table is global (cross-tenant) because a single user can have multiple memberships in different groups. Regular users can only see their own record. Admins can see all users that have a membership in their group(s).

**GroupAdminUser** — Junction for group ↔ user admin relationship
```
GroupAdminUser {
  tenantId String @default(dbgenerated) @db.VarChar(31)
  groupId  String
  userId   String
  role     String @default("admin") @db.VarChar(31)
  
  group Group @relation(...)
  user  User  @relation(...)
  
  @@id([groupId, userId])
}
```

**Member** — The participant in a group. Managed by one or more users.
```
Member {
  id          String @id @default(uuid())
  tenantId    String @default(dbgenerated) @db.VarChar(31)
  code        String @db.VarChar(63)
  name        String @db.VarChar(255)
  type        String @default("personal") @db.VarChar(31) // 'personal', 'business', 'public'
  status      String @default("draft") @db.VarChar(31)    // 'draft', 'pending', 'active', 'disabled', 'suspended', 'deleted'
  access      String @default("public") @db.VarChar(31)   // 'public', 'group', 'private'
  description String? @db.Text
  image       Json?        // S3 URL { key, url, mime }
  
  // Explicit latitude/longitude for easy Prisma writes, PostGIS indexed column created via raw SQL
  // ADD COLUMN location geography(Point, 4326) GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)) STORED;
  latitude    Float?
  longitude   Float?
  
  address     Json?        // Structured address: { street, postalCode, city, region, country }
  contacts    Json?        // Embedded contacts array: [{ type: 'whatsapp', value: '+34...' }]
  
  created     DateTime @default(now())
  updated     DateTime @updatedAt
  
  groupId     String
  group       Group @relation(...)
  posts       Post[]
  users       MemberUser[]
  
  @@unique([tenantId, code])
}
```

**MemberUser** — Junction for member ↔ user relationship
```
MemberUser {
  tenantId  String @default(dbgenerated) @db.VarChar(31)
  memberId  String
  userId    String
  role      String @default("admin") @db.VarChar(31)
  
  member Member @relation(...)
  user   User   @relation(...)
  
  @@id([memberId, userId])
}
```

**Post** — Unified table for offers, needs, events, announcements (future)
```
Post {
  id          String @id @default(uuid())
  tenantId    String @default(dbgenerated) @db.VarChar(31)

  type        String @db.VarChar(31)      // Discriminator: 'offer', 'need' (extensible via Zod)
  code        String @db.VarChar(63)
  title       String? @db.VarChar(255)    // Offers have title, needs may not
  content     String? @db.Text
  images      Json?                       // Array of S3 URLs { key, url, mime }
  state       String @default("published") @db.VarChar(31) // 'hidden', 'published', 'deleted'
  access      String @default("public") @db.VarChar(31)    // 'public', 'group', 'private'
  expires     DateTime?

  // Explicit latitude/longitude for easy Prisma writes, PostGIS indexed column created via raw SQL
  // ADD COLUMN location geography(Point, 4326) GENERATED ALWAYS AS (ST_MakePoint(longitude, latitude)) STORED;
  latitude    Float?
  longitude   Float?
  data        Json?      // Flexible JSON field for future extensions

  created     DateTime @default(now())
  updated     DateTime @updatedAt

  memberId    String
  member      Member @relation(...)
  categoryId  String?
  category    Category? @relation(...)
  groupId     String
  group       Group @relation(...)
  
  @@unique([tenantId, code])
  @@index([tenantId, type])
  @@index([tenantId, type, categoryId])
  @@index([tenantId, memberId])
}
```

Note: Offers and Needs are the same model `Post` with a `type` discriminator. The API exposes them as separate resource types `/offers` and `/needs` for backward compat.

**Category**
```
Category {
  id          String @id @default(uuid())
  tenantId    String @default(dbgenerated) @db.VarChar(31)
  code        String @db.VarChar(63)
  name        String @db.VarChar(255)
  description String? @db.Text
  icon        String? @db.VarChar(63)
  access      String @default("public") @db.VarChar(31) // 'public', 'group', 'private'
  created     DateTime @default(now())
  updated     DateTime @updatedAt
  
  groupId     String
  group       Group @relation(...)
  posts       Post[]
  
  @@unique([tenantId, code])
}
```

### 2.2 — PostGIS Spatial Index
- Enable PostGIS and pgvector during DB bootstrap in the social DB container (superuser-only step), not from app-run migrations.
- Keep social migrations assuming extensions already exist; optionally add a migration precondition check.
- Create spatial index on `Member.location` and `Group.location` columns
- Raw SQL for distance queries: `ST_DWithin()`, `ST_Distance()`, `ORDER BY geography <-> point`

### 2.3 — RLS Migration
- Apply same pattern as `accounting/prisma/migrations/20240711163943_row_level_security/migration.sql`:
  - `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables
  - `tenant_isolation_policy`: `USING ("tenantId" = current_setting('app.current_tenant_id', TRUE)::text)`
  - `bypass_rls_policy`: `USING (current_setting('app.bypass_rls', TRUE)::text = 'on')`
- **User** table is cross-tenant. Regular users can only see their own record. Group Admins can see all users that have a membership in their group(s).
  - `user_isolation_policy`: `USING (id = current_setting('app.current_user_id', TRUE)::uuid)`
  - `admin_tenant_isolation_policy`: check if target user has a membership in any group where current user is admin
  

### 2.4 — Application-Level Enums
Instead of using inflexible PostgreSQL `ENUM` types, all state and type fields (e.g. `PostType`, `MemberState`) are modeled as `String @db.VarChar(31)`.
The actual enum boundaries and constraints are strictly enforced in the application layer using Zod schemas (`src/server/validation.ts`). This allows adding new types (like `event` or `announcement`) without requiring database schema migrations.

---

## Phase 3: JSON:API Serialization & Validation

### 3.1 — ts-japi Serializers (`src/server/serialize.ts`)
Define serializers for each resource type matching the frontend `model.ts` contracts:

- `GroupSerializer` — type "groups", attributes: code, name, status, description, image, website, access, latitude, longitude, address, settings, contacts, created, updated. Relations: members (collection with count), categories (collection), offers (collection), needs (collection), currency (external link to accounting), posts (collection).
- `MemberSerializer` — type "members", attributes: code, name, type, state, access, description, image, latitude, longitude, address, contacts, created, updated, deletedAt. Relations: group (to-one), offers (collection), needs (collection), account (external link to accounting).
- `OfferSerializer` — type "offers" (backed by Post where type=offer). Attributes: code, name, content, images, price, state, access, expires, latitude, longitude, data, created, updated, deletedAt. Relations: category (to-one), member (to-one).
- `NeedSerializer` — type "needs" (backed by Post where type=need). Attributes: code, content, images, state, access, expires, latitude, longitude, data, created, updated, deletedAt. Relations: category (to-one), member (to-one).
- `CategorySerializer` — type "categories". Attributes: code, name, description, icon, cpa, access, created, updated. Relations: group (to-one), offers (collection), needs (collection).
- `UserSerializer` — type "users". Attributes: email, settings, created, updated. Relations: members (embedded links).

### 3.2 — Zod Request Schemas (`src/server/validation.ts`)
Define input validation schemas using Zod:

- `CreateGroupSchema` — validates group creation input (code, name, description, etc.)
- `UpdateGroupSchema` — partial update (all optional)
- `CreateMemberSchema` — name, type, contacts, group relationship
- `UpdateMemberSchema` — partial
- `CreatePostSchema` — type, content, images, category relationship, member relationship
- `UpdatePostSchema` — partial
- `CreateCategorySchema` — code, name, icon
- `CreateUserSchema` — email, password(forwarded to auth), member relationship
- `UpdateUserSchema` — settings
- `PaginationSchema` — `page[size]`, `page[after]`
- `FilterSchema` — `filter[field]` → parsed into Prisma `where` clauses
- `GeoPositionSchema` — `geo-position=lon,lat` → validated coordinates

---

## Phase 4: API Endpoints

### 4.1 — Route Structure (`src/server/routes.ts`)

All group-scoped routes under `/:code/*`. Auth context extracted per request.

**Public (no auth)**:
- `GET /groups` — list active groups (paginated, filterable by status)
- `GET /:code` — get single group (by code)
- `GET /:code/members` — list members (if `allowAnonymousMemberList`, returns minimal data)
- `GET /:code/categories` — list categories
- `GET /:code/offers` — list published offers (paginated, geo-sorted, filterable)
- `GET /:code/needs` — list published needs
- `POST /users` — signup (create user + member draft)

**Authenticated (bearer JWT, scope `komunitin_social`)**:
- `GET /users/me` — current user with included members
- `GET /users/:id` — get user (self or admin)
- `PATCH /users/:id` — update user (including settings)
- `GET /:code/members/:id` — get member details
- `POST /:code/members` — create member (admin only, or via signup)
- `PATCH /:code/members/:id` — update member (self or admin)
- `DELETE /:code/members/:id` — delete member (admin)
- `POST /:code/offers` — create offer
- `PATCH /:code/offers/:id` — update offer (owner or admin)
- `DELETE /:code/offers/:id` — delete offer
- `POST /:code/needs` — create need
- `PATCH /:code/needs/:id` — update need
- `DELETE /:code/needs/:id` — delete need
- `POST /:code/categories` — create category (admin)
- `PATCH /:code/categories/:id` — update category (admin)
- `DELETE /:code/categories/:id` — delete category (admin)
- `PATCH /:code` — update group (including settings, admin)

**Service-to-service (scope `komunitin_social_read_all`)**:
- All GET endpoints with full data access across tenants

**File uploads**:
- `POST /files` — upload image(s) to S3, returns file JSON references. Bearer auth. Multipart form-data. Validates size, type, dimensions.

### 4.2 — Query Parameters (matching frontend expectations)
- **Pagination**: `page[size]=20` (default), `page[after]=N` (cursor offset)
- **Filtering**: `filter[code]=X`, `filter[state]=active`, `filter[search]=text`, `filter[category]=catId`, `filter[member]=memberId`
- **Sorting**: `sort=field` or `sort=-field` (descending). Special: `sort=location` with `geo-position`
- **Geolocation**: `geo-position=lon,lat` — triggers PostGIS distance calculation, auto-sorts by distance if no explicit sort
- **Includes**: `include=group,account` — relationships to embed in response
- **Search**: `filter[search]=term` — full-text search on name, description, address fields using `ILIKE` for simplicity initially.

### 4.3 — Access Control Logic (`src/server/access.ts`)
- **Anonymous**: Read public groups, categories, published offers/needs, member list (if allowed by group settings)
- **Authenticated user**: Read own full data, update own member/settings, CRUD own offers/needs, change own member state (draft→pending)
- **Group admin**: Full CRUD on members/categories/settings/group, approve members (pending→active), disable members
- **Superadmin**: Full access (scope `komunitin_superadmin`)
- **Service accounts**: Read-all scope for notifications/accounting service integration

---

## Phase 5: Controller / Business Logic

### 5.1 — Service Architecture (`src/controller/`)
Follow accounting's pattern:

```
src/controller/
  base-service.ts       — Interface & factory (createService)
  group-controller.ts   — Group CRUD, settings
  member-controller.ts  — Member CRUD, state transitions, signup
  post-controller.ts    — Offer/Need CRUD (unified, filtered by type)
  category-controller.ts
  user-controller.ts    — User CRUD, settings
  file-controller.ts    — S3 upload, image processing
  events.ts             — Event emission to notifications
```

### 5.2 — Member State Machine
State transitions with authorization:
- `draft` → `pending`: user (self-apply)
- `pending` → `active`: admin (approve)
- `pending` → `disabled`: admin (reject)
- `active` → `suspended`: admin
- `active` → `disabled`: admin
- `suspended` → `active`: admin
- `disabled` → `active`: admin (re-enable)
- `active` → `deleted`: admin or self

### 5.3 — Signup Flow
1. `POST /users` — creates User (email + password forwarded to auth service) + Member (state=draft) + triggers `ValidationEmailRequested` event
2. User validates email via auth service
3. `PATCH /:code/members/:id` — user fills profile
4. `PATCH /:code/members/:id` with `state: "pending"` — user applies
5. Event `MemberRequested` sent to notifications
6. Admin `PATCH /:code/members/:id` with `state: "active"` — approved
7. Event `MemberJoined` sent

### 5.4 — Events to Notifications (`src/controller/events.ts`)
Pattern from `accounting/src/controller/features/notificatons.ts`:
- HTTP POST to `{NOTIFICATIONS_API_URL}/events` with Basic auth
- Event types: `MemberJoined`, `MemberRequested`, `OfferPublished`, `NeedPublished`, `OfferExpired`, `NeedExpired`, `GroupActivated`, `ValidationEmailRequested`, `PasswordResetRequested`, `MemberDisabled`, `MemberSuspended`
- Event payload: JSON:API document with `{ name, source, code, data: { member?, offer?, need? }, relationships: { user } }`

### 5.5 — File Upload (`src/controller/file-controller.ts`)
- Accept multipart form-data (use `multer` or `busboy`)
- Validate: file size ≤ 2MB, image types (jpeg, png, gif, webp)
- Upload to S3 bucket with path: `{groupCode}/{resourceType}/{uuid}.{ext}`
- Return file reference JSON: `{ "key": "path/uuid.jpg", "url": "https://...", "mime": "image/jpeg" }`
- Optional: generate thumbnails (future)

### 5.6 — Geolocation Queries
- Store as PostGIS `geography(Point, 4326)` column
- Distance query: `SELECT *, ST_Distance(location, ST_MakePoint($lon, $lat)::geography) AS distance FROM "Member" ORDER BY distance`
- Use Prisma `$queryRaw` for geo queries, then map results back to Prisma types
- Create spatial index: `CREATE INDEX member_location_idx ON "Member" USING GIST (location)`

---

## Phase 6: Testing

### 6.1 — Test Infrastructure (`test/`)
- Node.js built-in test runner (same as `notifications-ts` and `accounting`)
- `test/setup.ts` — shared test setup:
  - Spin up Express app with in-memory config
  - `clearDb()` — reset database between test suites
  - Mock JWT auth (generate test tokens with configurable claims/scopes)
  - Mock S3 client (intercept uploads, return fake URLs)
  - Mock notifications endpoint (capture sent events)
- `supertest` for HTTP assertions

### 6.2 — Test Suites
- `test/groups.ts` — CRUD groups, embedded settings, admin management
- `test/members.ts` — CRUD, state transitions, signup flow, geolocation filtering/sorting
- `test/offers.ts` — CRUD offers, pagination, filtering by category/member/search
- `test/needs.ts` — CRUD needs
- `test/categories.ts` — CRUD categories
- `test/users.ts` — Signup, get user, update embedded settings
- `test/files.ts` — Image upload, validation, S3 integration
- `test/access.ts` — Authorization tests (anonymous, user, admin, service)
- `test/events.ts` — Verify correct events sent for each state change

### 6.3 — CI Integration
- Add `build-social` job to `.github/workflows/build.yml`
- Docker compose for DB (Postgres+PostGIS) + MinIO
- `pnpm install && pnpm reset-db && pnpm test`

---

## Phase 7: Integration & Deployment

### 7.1 — Frontend Migration
- Update `app/.env*` to point `SOCIAL_URL` to new service
- Update `app/src/server/` if any endpoint contracts change (goal: minimize changes)
- The file upload endpoint should match the existing contract (`POST /files` with `files[file]` field) or the app uploader composable must be updated

### 7.2 — Docker Compose Integration
- Add `social` service to root `compose.yml`
- Wire up environment variables, network, health checks
- Update `start.sh` for social service initialization

### 7.3 — Data Migration (from Drupal)
- `cli/migrate.sh` script to extract data from Drupal MySQL/MariaDB and import into new PostgreSQL schema
- Map Drupal pseudo-UUIDs to real UUIDs
- Migrate file references from Drupal filesystem to S3

---

## Relevant Files (Reference Patterns)

### Accounting (primary template)
- `accounting/src/server/app.ts` — Express setup, middleware stack
- `accounting/src/server/routes.ts` — Route handler factories (`currencyResourceHandler`, `currencyCollectionHandler`)
- `accounting/src/server/auth.ts` — JWT auth middleware (`userAuth`, `noAuth`, `anyAuth`)
- `accounting/src/server/serialize.ts` — ts-japi serializer definitions
- `accounting/src/server/parse.ts` — JSON:API deserialization (`mount()`, `input()`)
- `accounting/src/controller/multitenant.ts` — RLS via Prisma extensions (`tenantDb()`, `privilegedDb()`)
- `accounting/src/controller/features/notificatons.ts` — Event publishing to notifications
- `accounting/src/utils/error.ts` — `KError`, `KErrorCode`
- `accounting/src/utils/context.ts` — Auth context extraction
- `accounting/prisma/schema.prisma` — RLS-enabled schema
- `accounting/prisma/migrations/20240711163943_row_level_security/migration.sql` — RLS SQL template

### Notifications-TS (secondary reference)
- `notifications-ts/src/config.ts` — Zod config validation pattern
- `notifications-ts/src/server.ts` — Express 5 setup
- `notifications-ts/src/utils/prisma.ts` — PrismaPg adapter usage

### Frontend (API contracts)
- `app/src/store/model.ts` — All TypeScript interfaces the API must match
- `app/src/store/resources.ts` — Generic JSON:API client (pagination, filtering, includes)
- `app/src/store/index.ts` — Store module definitions with endpoint patterns
- `app/src/composables/uploader.ts` — File upload contract

### PHP Legacy (behavior reference)
- `ices/ces_komunitin/ces_komunitin.api.social.inc` — Endpoint routing, access control
- `ices/ces_komunitin/includes/Member.php` — Member data shape, state machine
- `ices/ces_komunitin/ces_komunitin.notifications.inc` — Event types and payloads

---

## Verification

1. **Lint**: `pnpm run lint` passes with 0 warnings (ESLint strict)
2. **Typecheck**: `pnpm run typecheck` passes
3. **Unit tests**: Each controller function tested in isolation
4. **API tests**: Full endpoint coverage with supertest — CRUD for all resources, pagination, filtering, geo queries, auth, access control, error cases
5. **Event tests**: Verify notifications service receives correct events on state changes
6. **File tests**: Upload, size/type validation, S3 mock
7. **RLS tests**: Verify tenant isolation — group A cannot see group B's data
8. **Frontend smoke test**: Point app at new service, verify member list, offers, signup flow work
9. **CI**: `build-social` job green on PR

---

## Decisions

- **Post table unification**: Offers and Needs share a single `Post` table with `type` discriminator. API exposes them as separate `/offers` and `/needs` endpoints for backward compatibility. Future types (Events, Announcements) just add enum values.
- **User is cross-tenant**: The `User` and `UserSettings` tables are NOT under RLS — a user exists globally and can have members in multiple groups.
- **PostGIS for geo**: Use PostGIS extension for proper spatial indexing and distance queries, rather than application-level Haversine math. This enables `geo-position` query parameter with server-side distance sorting.
- **S3 for files**: Use S3-compatible storage (MinIO in dev, AWS S3 or equivalent in production) instead of local filesystem. This supports horizontal scaling.
- **Zod over express-validator**: Use Zod for request validation (consistent with `notifications-ts`) rather than `express-validator` (used in `accounting`). Zod schemas can be shared between validation and TypeScript types.
- **Node.js 24**: Use same runtime as `notifications-ts` for latest features.
- **Auth is external**: No password storage. Auth service (separate) handles credentials, issues JWTs. Social service only validates JWTs.
- **MemberUser junction**: Supports the one-user-many-members and one-member-many-users pattern. Primary use: a user owns their personal member, but could also manage a business member.
- **Contact as separate table**: Contacts are embedded in the member/group JSON:API response but stored in a separate table for proper normalization. This matches the current frontend model.

---

## Future Considerations (Architecture Prep, Not Implemented Now)

1. **ActivityPub Federation**: The `Post` model with unified schema maps well to ActivityPub `Note`/`Article` objects. `Member` maps to `Actor`. The `code` on groups enables addressing (`@member@group.komunitin.org`). Consider adding an `apId` (ActivityPub ID) nullable field to Post, Member, Group now to avoid migrations later.
2. **Semantic Search with Embeddings**: The `Post.content` and `Member.description` fields can later have PGVector embeddings added as a parallel column. Consider installing `pgvector` extension alongside PostGIS in the dev compose. The search implementation can start with `ILIKE`/`tsvector` and be upgraded to vector similarity search later.
3. **File processing pipeline**: Initial implementation does direct S3 upload. Future: add a processing queue (BullMQ) for image resizing, thumbnail generation, EXIF stripping, and content validation.

---

## Iteration Roadmap

This plan is too large to implement in one shot. Suggested iteration order:

**Iteration 1 — Foundation**: Phases 1.1–1.5, 2.1–2.4, 4.1 (route skeleton), 6.1 (test setup). Goal: Express server boots, connects to DB with RLS, serves empty JSON:API responses.

**Iteration 2 — Groups & Categories**: Group CRUD + settings + categories CRUD + serialization + tests. Goal: `GET /groups`, `GET /:code`, `GET /:code/categories` work.

**Iteration 3 — Members**: Member CRUD + state machine + contacts + geolocation + tests. Goal: Full member lifecycle including geo queries.

**Iteration 4 — Offers & Needs**: Post CRUD (offers/needs) + filtering + pagination + search + tests. Goal: Full CRUD with pagination and filtering.

**Iteration 5 — Users & Auth**: User/settings endpoints + signup flow + access control + tests. Goal: Complete auth integration.

**Iteration 6 — Files & Events**: S3 file upload + event publishing + tests. Goal: Image upload works, notifications receive events.

**Iteration 7 — Integration**: Frontend migration, Docker compose, CI, data migration script. Goal: End-to-end working system.
