# Copilot Coding Agent Instructions for Komunitin

## Project Overview

Komunitin is an open-source system for community exchange currencies. It is a **monorepo** containing four microservices and shared Docker Compose orchestration:

| Service | Directory | Language | Runtime | Port |
|---|---|---|---|---|
| **App** (PWA frontend) | `app/` | TypeScript + Vue 3 | Quasar/Vite | 2030 |
| **Accounting** | `accounting/` | TypeScript | Node.js 22, Express, Prisma, Stellar blockchain | 2025 |
| **Notifications (TS)** | `notifications-ts/` | TypeScript | Node.js 24, Express, Prisma, BullMQ, Redis | 2023 |
| **Notifications (Go, legacy)** | `notifications/` | Go 1.24 | gorilla/mux, Redis | 2028 |

An external dependency **IntegralCES** (Drupal, cloned separately) provides the social/auth API at port 2029.

## Package Manager

All TypeScript/Node.js projects use **pnpm**. Do **not** use npm or yarn.

Each project has its own `pnpm-workspace.yaml` with approved native packages. Dependencies must be explicitly listed in `package.json` (strict hoisting, no phantom dependencies).

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

- **Linting**: ESLint flat config at `eslint.config.js` with Vue, TypeScript, and Quasar plugins.
- **Testing**: Vitest with jsdom. Config in `vitest.config.ts`. Setup and mocks in `test/vitest/setup.ts`.
  - Test files: `src/**/__tests__/*.{spec,test}.ts` and `test/vitest/__tests__/**/*.{spec,test}.ts`
  - Test timeout: 30 seconds.
  - Uses `@vue/test-utils` for component testing.
  - Uses MirageJS for API mocking.
  - Test utilities in `test/vitest/utils/index.ts` provide `mountComponent()` and `waitFor()`.
  - **Important**: 
    - Create "e2e-ish" tests simulating user interactions using `mountComponent(App)`. Avoid shallow unit tests unless they test really complex logic.
    - Use `waitFor(fn, expected, message?, timeout?)` for async assertions. Never use arbitrary delays.
    
- **Environment**: Copy `.env.test` to `.env` for standalone dev. Tests load `.env.test` automatically. In production the environment is set via Docker compose.
- **Flavor system**: The app supports flavors (e.g., `komunitin`, `ces`) via `FLAVOR` env var. Flavors can override translations, styles, env vars, assets and public files.

### Accounting (`accounting/`)

```bash
cd accounting
pnpm install
pnpm test               # runs unit + ledger + server tests sequentially
pnpm test-unit          # tsx --test test/unit/*.ts
pnpm test-ledger        # tsx --test test/ledger/*.ts  (needs local Stellar)
pnpm test-server        # resets DB then runs API tests (needs DB + Stellar)
pnpm test-one <file>    # run a single test file
pnpm run build          # esbuild bundle
pnpm run dev            # tsx watch with debugger
```

- **Testing**: Uses Node.js built-in test runner (`tsx --test`).
- **Database**: PostgreSQL with Prisma ORM. Schema in `prisma/schema.prisma`.
- **Local dev dependencies**: Start DB and local Stellar via `cp .env.test .env && docker compose up -d`.
- **Reset DB**: `pnpm reset-db` (runs `prisma migrate reset --force`).

### Notifications Go (`notifications/`)

This service is still receiving events and sending transactional emails, but these features will be migrated to the TypeScript version (`notifications-ts/`) and this Go service will be deprecated. No new features should be added here.

### Notifications TS (`notifications-ts/`)

```bash
cd notifications-ts
pnpm install
pnpm typecheck          # check typings
pnpm test               # run all tests
pnpm test-one <pattern> # run selected test file(s)
pnpm run build          # tsc + unbuild
pnpm run dev            # tsx watch with debugger
```

- **Testing**: Uses Node.js built-in test runner with `--experimental-test-module-mocks`.
- **Database**: PostgreSQL with Prisma ORM + Redis for BullMQ queues.
- **Local dev dependencies**: Start DB and Redis with `cp .env.test .env && docker compose up -d`

## CI / GitHub Actions

The single CI workflow is `.github/workflows/build.yml`. It runs on every push to `master` and every PR. Four parallel build jobs:

1. **build-app**: Docker build → lint → test → Docker image → publish.
2. **build-notifications**: Docker build → `go test ./...` → Docker image → publish.
3. **build-notifications-ts**: Docker compose for DB services → pnpm install → `pnpm typecheck && pnpm test` → Docker image → publish.
4. **build-accounting**: Docker compose for DB → pnpm install → `pnpm reset-db && pnpm test` → Docker image → publish.

After all four jobs pass, `update-server` deploys to demo/staging/preview servers.

## Docker / Docker Compose

### Running the full stack with Docker

```bash
cp .env.dev.template .env
./start.sh --up --ices --dev --demo
```
This builds all containers, installs IntegralCES, seeds demo data, and starts dev mode with hot reloading.

### Default dev credentials
- Email: `euclides@komunitin.org`, Password: `komunitin` (regular user)
- Email: `riemann@komunitin.org`, Password: `komunitin` (admin)

### Global Compose files
`compose.yml` (base), `compose.dev.yml` (dev overrides), `compose.public.yml` (production), `compose.proxy.yml` (Traefik).

### Service-specific Compose files
Each service has its own `Dockerfile` and may have a standalone `compose.yaml`/`compose.yml` for local dev-only dependencies (DB, Stellar, Redis).

## Project Architecture & Key Patterns

### App (Vue 3 + Quasar)

- **Framework**: Quasar v2 with Vite, built as PWA.
- **State management**: Vuex store with modules per resource type.
- **Routing**: Vue Router with lazy-loaded route components.
- **Components**: Use `<script setup>` composition API style.
- **Error handling**: Custom `KError` class (in `src/KError.ts`) with `KErrorCode` enum. Throw `KError` for expected errors; use `$handleError` injected function for recoverable errors.
- **Async**: Always use `async/await`, not raw Promises.
- **CSS**: Prefer Quasar utility classes over custom CSS. Custom styles use scoped SCSS. Color variables defined in `src/css/quasar.variables.sass`.
- **i18n**: vue-i18n. Language files in `src/i18n/<lang>/`.  Flavor overrides in `src/i18n/flavors/<flavor>/<lang>/`. Terminology guidelines in `src/i18n/README.md` for the whole project. Must be read and followed for baseline lang strings, flavors may override them.
- **Type imports**: Use `import type { ... }` for type-only imports (enforced by ESLint rule `@typescript-eslint/consistent-type-imports`).
- **Testing**: Don't use browser tests nor unit tests, but simulate user interactions in node using jsdom on the full app.

### Accounting

- **API style**: JSON:API (using `ts-japi` serializer), endpoints prefixed with community code (e.g., `/:code/accounts`).
- **Blockchain**: Stellar SDK for ledger operations (local network for dev/test, testnet for staging).
- **Auth**: OAuth2 JWT bearer tokens validated via `express-oauth2-jwt-bearer`.
- **DB**: Prisma with PostgreSQL. Row Level Security (RLS) is used for isolating communities (=tenants).

### Notifications TS

- **API style**: Express with Zod validation.
- **Queue**: BullMQ with Redis for async job processing.
- **Email**: Nodemailer with Handlebars templates.
- **Push**: web-push for browser push notifications.
- **Auth**: OAuth2 JWT bearer tokens.
- **i18n**: i18next with filesystem backend.

### Notifications Go
Deprecated

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
│   └── openapi/           # Generated OpenAPI spec
├── notifications/         # Go notifications service
├── notifications-ts/      # TypeScript notifications service
│   ├── src/               # Service source
│   |   ├── newsletter/    # Newsletter service
│   |   ├── notifications/ # Notifications service
│   |   └── ...            # utils, clients, i18n, mocks, etc.
│   └── prisma/            # Prisma schema and migrations
├── docs/                  # GitBook documentation
├── compose.yml            # Main Docker Compose
├── compose.dev.yml        # Dev overrides
├── compose.public.yml     # Production overrides
└── start.sh               # Orchestration script
```

## Troubleshooting / Known Workarounds

- **Vitest needs `.quasar/tsconfig.json`**: This file is generated by `quasar build`. If tests fail with resolution errors, run `pnpm run build` first.
- **Prisma client not generated**: Run `pnpm prisma generate` after `pnpm install` in `accounting/` and `notifications-ts/`.
- **Stellar local network**: Accounting tests need the local Stellar quickstart container running (`docker compose up -d` from `accounting/`). It may take a bit to start.
- **Docker compose version**: Use `docker compose` (v2, no hyphen), not `docker-compose`.
- **Node.js version**: Use Node.js 22 in app and accounting, use Node.js 24 in notifications-ts.
- **PostgreSQL RLS**: When manually debugging the DB with `psql`, execute `SELECT set_config('app.bypass_rls', 'on', false);` to bypass Row Level Security and see all data.
