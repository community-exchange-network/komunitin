# Social Agent Instructions

## Scope

`social/` is the standalone TypeScript social service: Node.js 24, Express 5, Prisma 7/PostgreSQL, row-level security, PostGIS, pg_trgm search, JSON:API serialization with ts-japi, OAuth2 JWT bearer auth, Zod validation, S3-compatible uploads, groups, categories, members, offers/needs, files, and a local user projection.

This service is replacing the legacy IntegralCES social API. It owns social and marketplace domain data, not identity credentials.

## Commands

```bash
pnpm install
cp .env.test .env
pnpm prisma generate
docker compose up -d
pnpm prisma migrate deploy
pnpm typecheck
pnpm test-one <test-file-or-pattern>
pnpm test
pnpm build
pnpm dev
pnpm start
```

- The local compose file starts PostgreSQL on host port 5434 with PostGIS, pgvector, pg_trgm, btree_gin, and unaccent enabled. Run migrations after the database is available.
- The service listens on port 2028 by default.
- Tests use Node's built-in test runner with `--experimental-test-module-mocks`, `.env.test`, `tsx`, and `--test-concurrency=1`.
- Tests require the database schema to be migrated; test data is reset through helpers in `test/mocks/seed.ts`.
- Tests mock JWKS, accounting, notifications, and S3-compatible uploads through MSW handlers in `test/mocks/handlers.ts`.
- Docker builds use Node.js 24, run `pnpm prisma generate`, and build with unbuild.

## Runtime Shape

- `src/index.ts` starts the service and handles SIGTERM/SIGINT shutdown.
- `src/app.ts` wires Express middleware, JSON:API content type, `/health`, top-level routes, tenant routes, and the shared error handler.
- Feature modules live under `src/features/<domain>/`. Keep the local split: `routes.ts` for route/auth/validation wiring, `controller.ts` for HTTP request handling, `service.ts` for domain and database behavior, `schema.ts` for Zod JSON:API contracts, `serialize.ts` or `serializer.ts` for JSON:API responses, and `sql.ts` for raw SQL collection queries when needed.
- Shared request parsing, pagination, filtering, sorting, includes, and geo params live in `src/server/request.ts`.
- Expected errors should be `KError` values from `src/utils/error.ts`; `src/server/errors.ts` converts them to JSON:API error objects.
- Environment variables are validated in `src/config.ts`. Add new runtime config there and update `.env.test` plus deployment/compose files when needed.

## Data, Tenancy, and Auth

- Prisma schema and migrations live in `prisma/`. The generated client in `src/generated/prisma/` and build output in `dist/` are generated; do not edit them by hand.
- Row-level security uses `current_setting('app.current_tenant_id')` and `app.bypass_rls`. Use `tenantDb(prisma, code)` for tenant-scoped data and `privilegedDb(prisma)` only for explicit cross-tenant or system flows.
- Group code is the tenant id. Be especially careful with manual SQL, transactions, and RLS changes; use the tenant client's `transaction` helper when a transaction must preserve tenant context.
- `User` is a cross-tenant projection of the authenticated identity. `User.id` must equal the JWT `sub` claim.

## Domain Notes

- Groups, members, categories, and posts enforce visibility in service code and raw SQL list queries. Preserve anonymous, owner, group-member, group-admin, read-all, and superadmin access paths.
- Group activation/disabling may sync accounting currencies and emit social notification events.
- Member status transitions may create or update accounting accounts and emit member notification events.
- Offers and needs share the `Post` table with a `type` discriminator; type-specific fields live in the JSON `data` column.
- Resources are soft-deleted with `deleted`; keep list/detail queries excluding deleted rows.
- Search uses SQL-generated normalized `search` columns and trigram operators. Geo sorting uses latitude/longitude plus SQL-generated PostGIS `location` columns.
- File uploads validate content by detected MIME type, store objects in S3-compatible storage, create `File` rows, and link or unlink resources by URL through `syncResourceFiles`.
- Keep file resource types aligned with the social resources that reference them: `groups`, `members`, `offers`, and `needs`.

## External Integrations

- `src/clients/accounting.ts` forwards the user's JWT to accounting. Accounting failures are treated as unexpected social-service errors.
- `src/clients/notifications.ts` posts JSON:API social-domain events to `/events` with Basic auth and logs failures without failing the social operation.
- Social events must stay social-domain events such as group, member, offer, and need lifecycle events. Auth-owned events belong to the auth service or an auth-owned integration.

## Tests

- API tests live in `test/*.test.ts` and use supertest against the real Express app.
- Unit tests live in `test/unit/`.
- Shared test setup, JWT fixtures, MSW handlers, seed helpers, and deterministic UUID helpers live in `test/mocks/`.
- When changing routes, schemas, access control, status transitions, accounting sync, notification events, search/filter/sort/pagination, RLS behavior, or uploads, add focused tests in the matching suite.
- Prefer full HTTP JSON:API behavior tests plus database side-effect assertions for user-visible behavior. Avoid arbitrary sleeps.
