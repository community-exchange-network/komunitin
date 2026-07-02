# Accounting Agent Instructions

## Scope

`accounting/` is the TypeScript accounting service: Node.js 22, Express, Prisma/PostgreSQL, JSON:API serialization, OAuth2 JWT auth, tenant isolation, Stellar ledger operations, Credit Commons integration, and top-up support.

## Commands

```bash
pnpm install
cp .env.test .env
docker compose up -d
pnpm reset-db
pnpm dev
pnpm typecheck
pnpm test-unit
pnpm test-ledger
pnpm test-server
pnpm test-one <test-file>
pnpm test
pnpm build
```

- `docker compose up -d` in this folder starts PostgreSQL on port 5432 and Stellar quickstart on port 8000. Stellar friendbot service may take a few minutes to start.
- `pnpm test` runs unit, ledger, and server tests sequentially. Ledger tests need local Stellar; server tests reset the database. The full test suite takes ~5 minutes to run.
- If stellar friendbot fails, try recreating the Stellar container.

## Service Boundaries

- Express route definitions live in `src/server/routes.ts`. Responses should stay JSON:API through serializers in `src/server/serialize.ts`.
- Tenant-scoped APIs are prefixed with `/:code`; obtain request context with `context(req)` and keep community isolation intact.
- Service/domain orchestration lives in `src/controller/`; database models and input types live in `src/model/`.
- Stellar-specific behavior lives under `src/ledger/stellar/`; do not mix Stellar SDK calls into HTTP route handlers.
- Prisma schema and migrations live in `prisma/`. Tenant fields use `current_setting('app.current_tenant_id')`; be careful with manual SQL and RLS changes.
- Expected errors should be `KError` values from `src/utils/error.ts`; the Express error handler converts them to JSON:API error objects.

## Domain Notes

- Currency amounts are integer-backed values; preserve `BigInt` handling and scale/decimal conversions.
- Currency setup includes issuer, credit, admin, optional external issuer/trader, disabled-account pool, sponsor, and optional channel accounts. Changes in this area usually need ledger and server tests.
- Credit Commons code lives under `src/creditcommons/` and has dedicated tests under `test/creditcommons/`.
- Top-up code lives under `src/topup/` and has tests under `test/topup/`.
- `openapi/openapi.json` is generated from the server test suite; update generated API specs when endpoint behavior changes.
