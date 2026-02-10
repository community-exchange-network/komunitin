# Copilot Coding Agent Instructions for Komunitin

## Project Overview

Komunitin is an open-source system for community exchange currencies. It is a **monorepo** containing four microservices and shared Docker Compose orchestration:

| Service | Directory | Language | Runtime | Port |
|---|---|---|---|---|
| **App** (PWA frontend) | `app/` | TypeScript + Vue 3 | Quasar/Vite | 2030 |
| **Accounting** | `accounting/` | TypeScript | Node.js 22, Express, Prisma, Stellar blockchain | 2025 |
| **Notifications (Go)** | `notifications/` | Go 1.24 | gorilla/mux, Firebase | 2028 |
| **Notifications (TS)** | `notifications-ts/` | TypeScript | Node.js 24, Express, Prisma, BullMQ, Redis | 2023 |

An external dependency **IntegralCES** (Drupal, cloned separately) provides the social/auth API at port 2029.

## Package Manager

All TypeScript/Node.js projects use **pnpm** (version 10.26.1, specified in `packageManager` field of each `package.json`). Do **not** use npm or yarn. In CI and Docker, pnpm is enabled via `corepack enable && corepack prepare pnpm@10.26.1 --activate`.

Each project has its own `pnpm-workspace.yaml` with `onlyBuiltDependencies` for native modules. Dependencies must be explicitly listed in `package.json` (strict hoisting, no phantom dependencies).

## Build, Lint, and Test Commands

### App (`app/`)

```bash
cd app
pnpm install
pnpm run build          # quasar build -m pwa
pnpm run lint           # eslint with --max-warnings 0
pnpm test               # vitest run
pnpm run dev            # quasar dev -m pwa (needs .env file, see below)
```

- **Linting**: ESLint flat config at `eslint.config.js` with Vue, TypeScript, and Quasar plugins. Zero warnings policy (`--max-warnings 0`).
- **Testing**: Vitest with jsdom. Config in `vitest.config.ts`. Setup in `test/vitest/setup.ts`.
  - Test files: `src/**/__tests__/*.{spec,test}.ts` and `test/vitest/__tests__/**/*.{spec,test}.ts`
  - Test timeout: 30 seconds.
  - Uses `@vue/test-utils` for component testing.
  - Uses MirageJS for API mocking.
  - Test utilities in `test/vitest/utils/index.ts` provide `mountComponent()` and `waitFor()`.
  - **Important**: Use `waitFor(fn, expected, message?, timeout?)` for async assertions. Never use arbitrary delays.
  - Quasar must be aliased to its client build in vitest config (already configured).
- **Environment**: Copy `.env.test` to `.env` for standalone dev. Tests load `.env.test` automatically.
- **Flavor system**: The app supports flavors (e.g., `komunitin`, `ces`) via `FLAVOR` env var. Flavor-specific env files: `.env.flavor.<name>`.

### Accounting (`accounting/`)

```bash
cd accounting
pnpm install
pnpm test               # runs unit + ledger + server tests sequentially
pnpm test-unit          # tsx --test test/unit/*.ts
pnpm test-ledger        # tsx --test test/ledger/*.ts  (needs local Stellar)
pnpm test-server        # resets DB then runs API/credcom/topup tests (needs DB + Stellar)
pnpm test-one <file>    # run a single test file
pnpm run build          # esbuild bundle
pnpm run dev            # tsx watch with debugger
```

- **Testing**: Uses Node.js built-in test runner (`tsx --test`), not Vitest or Jest.
- **Database**: PostgreSQL with Prisma ORM. Schema in `prisma/schema.prisma`.
- **Local dev dependencies**: Start DB and local Stellar via `cp .env.test .env && docker compose up -d`.
- **Reset DB**: `pnpm reset-db` (runs `prisma migrate reset --force`).
- **CI workflow**: In GitHub Actions, accounting tests run with `pnpm reset-db && pnpm test` after starting Docker services.

### Notifications Go (`notifications/`)

```bash
cd notifications
go test ./...           # run all tests
go build -o main .      # build
```

- Standard Go project. Tests use Go's built-in testing framework.
- Docker build uses multi-stage: `notifications-build` → `notifications-dev` (with delve debugger) → `notifications` (production).

### Notifications TS (`notifications-ts/`)

```bash
cd notifications-ts
pnpm install
pnpm prisma generate    # generate Prisma client
pnpm typecheck          # tsc --noEmit
pnpm test               # node --experimental-test-module-mocks --test
pnpm test-one <file>    # run a single test file
pnpm run build          # tsc + unbuild
pnpm run dev            # tsx watch with debugger
```

- **Testing**: Uses Node.js built-in test runner with `--experimental-test-module-mocks`.
- **Database**: PostgreSQL with Prisma ORM + Redis for BullMQ queues.
- **Local dev dependencies**: `cp .env.test .env && docker compose up -d` (starts Postgres on port 5433 and Redis on 6379).
- **CI workflow**: Starts Docker services, installs deps, runs `pnpm typecheck && pnpm test`.

## CI / GitHub Actions

The single CI workflow is `.github/workflows/build.yml`. It runs on every push to `master` and every PR. Four parallel build jobs:

1. **build-app**: Docker build → lint → test → production image → publish.
2. **build-notifications**: Docker build → `go test ./...` → production image → publish.
3. **build-notifications-ts**: Docker compose for DB services → pnpm install → `pnpm typecheck && pnpm test` → Docker image → publish.
4. **build-accounting**: Docker compose for DB → pnpm install → `pnpm reset-db && pnpm test` → Docker images → publish.

After all four jobs pass, `update-server` deploys to demo/staging/preview servers.

Published Docker images go to Docker Hub under the `komunitin/` namespace.

## Docker / Docker Compose

- **Full stack dev**: `cp .env.dev.template .env && ./start.sh --up --dev --ices --demo`
- **Compose files**: `compose.yml` (base), `compose.dev.yml` (dev overrides), `compose.public.yml` (production), `compose.proxy.yml` (Traefik).
- Each service has its own `Dockerfile` and may have a standalone `compose.yaml`/`compose.yml` for local dev dependencies (DB, Stellar, Redis).

## Project Architecture & Key Patterns

### App (Vue 3 + Quasar)

- **Framework**: Quasar v2 with Vite, built as PWA.
- **State management**: Vuex store with modules per resource type.
- **Routing**: Vue Router with lazy-loaded route components.
- **Components**: Use `<script setup>` composition API style.
- **Error handling**: Custom `KError` class (in `src/KError.ts`) with `KErrorCode` enum. Throw `KError` for expected errors; use `$handleError` injected function for recoverable errors.
- **Async**: Always use `async/await`, not raw Promises.
- **CSS**: Prefer Quasar utility classes over custom CSS. Custom styles use scoped SCSS. Color variables defined in `src/css/quasar.variables.sass`.
- **i18n**: vue-i18n. Language files in `src/i18n/<lang>/`. Flavor overrides in `src/i18n/flavors/<flavor>/<lang>/`.
- **Type imports**: Use `import type { ... }` for type-only imports (enforced by ESLint rule `@typescript-eslint/consistent-type-imports`).

### Accounting

- **API style**: JSON:API (using `ts-japi` serializer).
- **Blockchain**: Stellar SDK for ledger operations (local network for dev/test, testnet for staging).
- **Auth**: OAuth2 JWT bearer tokens validated via `express-oauth2-jwt-bearer`.
- **DB**: Prisma with PostgreSQL. Row Level Security (RLS) is used.

### Notifications TS

- **API style**: Express with Zod validation.
- **Queue**: BullMQ with Redis for async job processing.
- **Email**: Nodemailer with Handlebars templates.
- **Push**: web-push for browser push notifications.
- **Auth**: OAuth2 JWT bearer tokens.
- **i18n**: i18next with filesystem backend.

### Notifications Go

- **API**: gorilla/mux router.
- **Push**: Firebase Cloud Messaging.
- **Email**: MailerSend API + SMTP fallback.
- **i18n**: go-i18n.

## Directory Structure

```
komunitin/
├── .github/               # CI workflows, CODEOWNERS
├── app/                   # Vue 3 + Quasar PWA frontend
│   ├── src/               # Application source
│   │   ├── boot/          # Boot files (auth, i18n, store, etc.)
│   │   ├── components/    # Reusable Vue components
│   │   ├── composables/   # Vue composables
│   │   ├── css/           # Styles and Quasar variables
│   │   ├── features/      # Feature modules
│   │   ├── i18n/          # Translations
│   │   ├── layouts/       # Layout components (use <q-layout>)
│   │   ├── pages/         # Route page components
│   │   ├── plugins/       # Vue plugins
│   │   ├── router/        # Vue Router config
│   │   ├── server/        # Server-side API clients
│   │   ├── store/         # Vuex store modules
│   │   └── types/         # TypeScript type definitions
│   ├── test/vitest/       # Test setup, utils, and functional tests
│   ├── build-tools/       # Vite plugins for flavor support
│   └── src-pwa/           # PWA service worker
├── accounting/            # TypeScript accounting service
│   ├── src/               # Service source
│   ├── test/              # Tests (unit, ledger, server, creditcommons, topup)
│   ├── prisma/            # Prisma schema and migrations
│   ├── cli/               # CLI scripts (migration, trust setup)
│   └── openapi/           # OpenAPI spec
├── notifications/         # Go notifications service
│   ├── api/               # HTTP handlers
│   ├── service/           # Business logic
│   ├── store/             # Data store
│   ├── events/            # Event handling
│   ├── i18n/              # Translations
│   └── mails/             # Email templates
├── notifications-ts/      # TypeScript notifications service
│   ├── src/               # Service source
│   └── prisma/            # Prisma schema and migrations
├── docs/                  # GitBook documentation
├── compose.yml            # Main Docker Compose
├── compose.dev.yml        # Dev overrides
├── compose.public.yml     # Production overrides
└── start.sh               # Orchestration script
```

## Common Development Workflows

### Running a single service locally (without Docker)

For each TypeScript service, the pattern is:
1. `cd <service>/`
2. `cp .env.test .env` (or `.env.local` for connecting to local Docker services)
3. Start dependencies: `docker compose up -d` (if the service has a local `compose.yaml`)
4. `pnpm install`
5. `pnpm dev`

### Running the full stack with Docker

```bash
cp .env.dev.template .env
./start.sh --up --ices --dev --demo
```

This builds all containers, installs IntegralCES, seeds demo data, and starts dev mode with hot reloading.

### Default dev credentials

- Email: `noether@komunitin.org`, Password: `komunitin`

## Troubleshooting / Known Workarounds

- **Vitest needs `.quasar/tsconfig.json`**: This file is generated by `quasar build`. If tests fail with resolution errors, run `pnpm run build` first.
- **Prisma client not generated**: Run `pnpm prisma generate` after `pnpm install` in `accounting/` and `notifications-ts/`.
- **Stellar local network**: Accounting tests need the local Stellar quickstart container running (`docker compose up -d` from `accounting/`).
- **pnpm strict dependencies**: If you add a new import, make sure the package is explicitly listed in `package.json` dependencies. Phantom-hoisted packages won't work with pnpm's strict isolation.
- **Docker compose version**: Use `docker compose` (v2, no hyphen), not `docker-compose`.
