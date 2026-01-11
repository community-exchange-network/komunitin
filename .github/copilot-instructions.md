# Komunitin Copilot Instructions

This document provides guidance for coding agents working on the Komunitin project - an open system for exchange communities featuring local community currency wallets and marketplace functionality.

## Repository Overview

Komunitin is a **monorepo** containing multiple microservices that work together:

- **app/** - Vue.js/Quasar PWA frontend (TypeScript, npm)
- **accounting/** - Stellar blockchain-based accounting service (TypeScript, Node.js, pnpm, Prisma, PostgreSQL)
- **notifications/** - Push notifications and email service in Go (legacy, being replaced)
- **notifications-ts/** - New TypeScript-based notifications service (TypeScript, Node.js, pnpm, Prisma, PostgreSQL)
- **ices** (external dependency) - IntegralCES Drupal backend for social APIs (must be cloned as sibling directory)

## Tech Stack Summary

| Service | Language | Framework/Runtime | Package Manager | Database | Key Dependencies |
|---------|----------|-------------------|-----------------|----------|------------------|
| app | TypeScript | Vue 3 + Quasar | npm | - | Vuex, Vue Router, Jest |
| accounting | TypeScript | Node.js + Express | pnpm | PostgreSQL | Prisma, Stellar SDK, tsx |
| notifications | Go | - | go mod | Redis | Firebase, MailerSend |
| notifications-ts | TypeScript | Node.js | pnpm | PostgreSQL | Prisma, Handlebars, i18next |

## Development Environment Setup

### Prerequisites
- Docker and Docker Compose (required for development and deployment)
- [jq](https://jqlang.org/) CLI utility (required for demo data setup)
- Git

### Initial Setup
```bash
# Clone the main repository
git clone https://github.com/community-exchange-network/komunitin.git
cd komunitin

# Clone the IntegralCES dependency as a sibling directory
cd ..
git clone https://git.drupalcode.org/project/ices.git
cd komunitin

# Copy environment configuration
cp .env.dev.template .env

# Start the full development environment with demo data
./start.sh --up --ices --dev --demo
```

### Service URLs (Development)
- App: https://localhost:2030 (credentials: noether@komunitin.org / komunitin)
- Accounting: http://localhost:2025
- Notifications: http://localhost:2028
- IntegralCES: http://localhost:2029

## Building, Testing, and Linting

### App (Vue.js/Quasar)

**Directory:** `app/`

**Install dependencies:**
```bash
npm install
```

**Development:**
```bash
# Standalone with mocked APIs
cp .env.test .env
npm run dev

# With local services
cp .env.local .env
npm run dev  # Then stop the 'app' docker container
```

**Testing:**
```bash
npm test        # Run Jest tests
npm run lint    # ESLint
npm run testAll # TypeScript check + tests + lint
```

**Build:**
```bash
npm run build
```

**Important patterns:**
- Uses `<script setup>` Vue composition API
- Error handling via custom `KError` object
- Async code uses `async/await` pattern, not Promises API
- Components in `src/components/`, pages in `src/pages/`, layouts in `src/layouts/`
- State management with Vuex
- Minimal custom CSS - relies on Quasar utility classes
- Scoped SCSS for component-specific styles
- Material Design guidelines followed

**Testing approach:**
- Functional tests in `/test/jest/__tests__/` using custom `mountComponent` utility
- Unit tests in `__tests__/` folders next to tested files
- Use `@vue/test-utils` for unit tests (lighter than `mountComponent`)

### Accounting (TypeScript + Stellar)

**Directory:** `accounting/`

**Install dependencies:**
```bash
pnpm install
```

**Development:**
```bash
# Standalone with local DB and Stellar
cp .env.test .env
docker compose up -d
pnpm dev

# With local services (testnet Stellar)
cp .env.local .env
pnpm dev  # Then stop the 'accounting' container and update integralces URL
```

**Testing:**
```bash
pnpm test           # All tests
pnpm test-unit      # Unit tests only
pnpm test-ledger    # Stellar integration tests
pnpm test-server    # Full service tests
pnpm test-one <file> # Single test file
pnpm reset-db       # Reset Prisma database
```

**Build:**
```bash
pnpm run build
```

**Important patterns:**
- Uses Prisma with PostgreSQL
- Always run `pnpm prisma generate` after schema changes
- Multi-tenancy via Prisma RLS (Row Level Security)
- Stellar blockchain for currency, accounts, and transfers
- TypeScript with Node.js built-in test runner (`--test` flag)
- Tests run with `--test-concurrency=1` for sequential execution

**Prisma commands:**
```bash
pnpm prisma generate    # Generate client after schema changes
pnpm prisma migrate dev # Create and apply migrations
pnpm reset-db          # Reset database (useful for tests)
```

### Notifications (Go)

**Directory:** `notifications/`

**Testing:**
```bash
go test ./...
```

**Development:**
```bash
docker compose --profile dev up --build
# Then attach VS Code debugger
```

**Note:** This service is being replaced by notifications-ts. Minimize changes here.

### Notifications-TS (TypeScript)

**Directory:** `notifications-ts/`

**Install dependencies:**
```bash
pnpm install
```

**Development:**
```bash
cp .env.local .env
pnpm dev
```

**Testing:**
```bash
pnpm reset-db
pnpm test
pnpm typecheck
```

**Build:**
```bash
pnpm build
```

**Important patterns:**
- Uses Prisma with PostgreSQL
- i18next for internationalization
- Handlebars for email templates
- Similar patterns to accounting service

## Code Style and Conventions

### General
- **Indentation:** 2 spaces (enforced by `.editorconfig`)
- **Line endings:** LF
- **Charset:** UTF-8
- **Final newline:** Required
- **Trailing whitespace:** Trimmed

### TypeScript/JavaScript
- ESLint configurations in place - always run linters before committing
- TypeScript strict mode enabled
- Use `async/await` over Promise chains
- Minimal comments unless explaining complex logic

### Vue Components (app/)
- Use `<script setup>` composition API
- Define components with TypeScript
- Follow Quasar/Material Design patterns
- Keep components small and focused

### Error Handling (app/)
- Use `KError` with `KErrorCode` enumeration
- Use injected `$handleError` function from `boot/errors.ts`
- Either throw errors or log and recover

### Database (accounting/, notifications-ts/)
- Prisma schema changes require migration
- Always generate Prisma client after schema changes
- Use transaction patterns for data consistency
- Row Level Security (RLS) enforced for multi-tenancy

## Docker and Deployment

### Development
```bash
./start.sh --up --ices --dev --demo
```

### Production
See [DEPLOYMENT.md](../DEPLOYMENT.md) for full production deployment instructions.

```bash
./start.sh --up --ices --public
```

### Compose Files
- `compose.yml` - Base configuration
- `compose.dev.yml` - Development overrides (debuggers, hot reload)
- `compose.public.yml` - Production configuration with Traefik
- `compose.proxy.yml` - Standalone Traefik setup

### Docker Commands
```bash
# Build specific service
docker build -t komunitin/komunitin-app ./app

# View logs
docker compose logs -f <service-name>

# Execute commands in containers
docker exec -it <container-name> /bin/bash

# Clean up
docker compose down -v           # Stop and remove volumes
docker system prune -f           # Clean unused resources
```

## Flavors (Multi-Tenant UI Customization)

The app supports "flavors" for customization via the `KOMUNITIN_FLAVOR` or `FLAVOR` environment variable.

**Flavor customization locations:**
1. `.env.flavor.[FLAVOR_NAME]` - Environment variables
2. `app/assets/flavors/[FLAVOR_NAME]/` - Assets (logos, images)
3. `app/public/flavors/[FLAVOR_NAME]/` - Public files (favicon, etc.)
4. `app/src/css/flavors/[FLAVOR_NAME]/override.variables.sass` - Quasar variable overrides
5. `app/src/i18n/flavors/[FLAVOR_NAME]/[LANGUAGE_CODE]/` - Language string overrides

## Internationalization (i18n)

### App translations
- `app/src/i18n/[LANGUAGE_CODE]/index.json` - User-facing strings
- `app/src/i18n/[LANGUAGE_CODE]/admin.json` - Admin interface strings
- `app/src-pwa/i18n/[LANGUAGE_CODE].json` - Push message strings

### Email translations
- `notifications/i18n/messages/[LANGUAGE_CODE].json` - Go service
- `notifications-ts/` uses i18next with filesystem backend

### Adding a new language
1. Add translation files in appropriate directories
2. Add entry to `app/src/i18n/index.ts` langs record
3. Import and add to `app/src-pwa/i18n/index.ts` languages array

## GitHub Actions CI/CD

**Workflow file:** `.github/workflows/build.yml`

### CI Pipeline
Each service has its own build job:
1. **build-app** - Builds Docker image, runs linter and tests
2. **build-accounting** - Sets up pnpm, runs tests, builds image
3. **build-notifications** - Builds Go service, runs tests
4. **build-notifications-ts** - Sets up pnpm, runs typecheck and tests

### After Successful Build (master branch only)
- Docker images pushed to Docker Hub
- Demo servers automatically updated (demo.komunitin.org, staging.komunitin.org)

### PR Builds
- Preview deployed to preview.komunitin.org for PR branches

**Important:** Always ensure tests pass locally before pushing to avoid CI failures.

## Common Development Tasks

### Running Tests Locally
```bash
# App
cd app && npm test

# Accounting
cd accounting && pnpm test

# Notifications
cd notifications && go test ./...

# Notifications-TS
cd notifications-ts && pnpm test
```

### Database Migrations (Prisma)
```bash
# Create migration
cd accounting  # or notifications-ts
pnpm prisma migrate dev --name description_of_changes

# Apply migrations
pnpm prisma migrate deploy

# Reset database (dev/test only)
pnpm reset-db
```

### Debugging
- **App:** Use browser DevTools or VS Code launch configuration in `.vscode/launch.json`
- **Accounting/Notifications-TS:** Use `--inspect` flag (already in `dev` scripts), attach VS Code debugger
- **Go Notifications:** Use VS Code Go debugger configuration

### Working with Credit Commons Protocol
The accounting service includes Credit Commons integration for cross-system transactions. See `accounting/README.md` for detailed setup and testing instructions.

**Known limitations:**
- Only `_C-` workflow supported (immediate completion)
- Manual setup required for currency admins
- QR code workflow only for UI transactions
- Not recommended for production yet

## Known Issues and Workarounds

### Windows WSL2 Development
When running accounting service from WSL2 and accessing from Docker containers:
- The `host.docker.internal` in `compose.yml` must point to WSL2 IP instead of Windows host IP
- Replace `host.docker.internal: host-gateway` entry with actual WSL2 IP address

### Prisma Client Generation
After pulling changes that modify Prisma schemas:
```bash
cd accounting  # or notifications-ts
pnpm prisma generate
```

### Docker Compose "DUPLICATE ENTRY" Errors
If you see duplicate entry errors after restart:
```bash
docker compose down -v
docker ps -a          # Verify all stopped
docker volume ls      # Check for unnamed volumes
# Remove any unnamed volumes manually
```

### IntegralCES URL Configuration
When running accounting service outside Docker (local dev):
```bash
docker compose exec integralces drush vset ces_komunitin_accounting_url_internal http://host.docker.internal:2025
```

### Self-Signed Certificate Warnings (Local Dev)
The app uses mkcert for local HTTPS. Your browser will warn about self-signed certs - accept them to proceed.

## Architecture and Key Concepts

### Stellar Blockchain Integration
The accounting service uses Stellar for:
- **Currencies** - Each community currency is a Stellar asset (4-char code, requires authorization)
- **Accounts** - Each user has a Stellar account sponsored by a global sponsor account
- **Transfers** - Payments are Stellar transactions
- **Credit Commons** - Cross-community transactions via external HOUR assets

**Key Stellar accounts per currency:**
1. **Issuer** - Mints the currency
2. **Credit** - Handles credit to users
3. **Admin** - Administrative signer for user accounts
4. **External Issuer** - Mints HOUR asset for cross-community trade
5. **External Trader** - Manages exchange offers between currencies

### Multi-Tenancy
Both accounting and notifications-ts services support multi-tenancy:
- Enforced via Prisma Row Level Security (RLS)
- `tenantId` field on all relevant models
- Set via PostgreSQL session variable `app.current_tenant_id`

### State Management (App)
- **Vuex** for centralized state
- Resources loaded via Vuex actions
- Relationships auto-bound using JavaScript getters
- Modules per resource type

## Best Practices

### Before Making Changes
1. Understand existing patterns by reviewing similar code
2. Check if linting/testing infrastructure exists
3. Run existing tests to establish baseline

### Making Changes
1. **Keep changes minimal** - only modify what's necessary
2. **Run linters and tests early** - catch issues quickly
3. **Follow existing conventions** - don't introduce new patterns without reason
4. **Update tests** - add tests for new functionality
5. **Don't fix unrelated issues** - stay focused on your task

### Dependencies
1. **Always check for vulnerabilities** before adding new dependencies
2. **Prefer existing libraries** - only add new ones when necessary
3. **Use package manager commands** - `npm install`, `pnpm install`
4. **Don't update versions** unless required for your task

### Testing
1. Run relevant tests after making changes
2. Don't remove or modify unrelated tests
3. Follow existing test patterns (Jest for app, Node.js test runner for accounting/notifications-ts, Go test for notifications)

### Documentation
Update documentation only if directly related to your changes.

## Special Notes for Coding Agents

### Package Managers
- **app/** uses **npm** (NOT yarn or pnpm) - `package-lock.json` present
- **accounting/** and **notifications-ts/** use **pnpm** - `pnpm-lock.yaml` present
- **notifications/** uses **Go modules** - `go.mod` and `go.sum`

### Test Execution
- **App:** Jest with jsdom environment
- **Accounting/Notifications-TS:** Node.js built-in test runner with `--test` flag
- **Notifications:** Go standard testing with `go test ./...`

### Build Artifacts to Ignore
Add to `.gitignore` if not already present:
- `node_modules/`
- `dist/`
- `bundle/`
- `.env` (environment-specific)
- `*.log`
- `.vscode/settings.json` (personal settings)
- Firebase credentials files

### Firebase Credentials
Do NOT commit these files (they should be in `.gitignore`):
- `notifications/komunitin-project-firebase-adminsdk.json`
- `accounting/komunitin-project-backup-credentials.json`

### Environment Files
- `.env` files are gitignored
- Templates provided: `.env.dev.template`, `.env.public.template`
- Service-specific: `.env.test`, `.env.local` in service directories

## Getting Help

- **Main README:** [README.md](../README.md) - Overview and quick start
- **Contributing:** [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute
- **Deployment:** [DEPLOYMENT.md](../DEPLOYMENT.md) - Production deployment
- **App Development:** [app/DEVELOP.md](../app/DEVELOP.md) - Detailed app development guide
- **Service-specific READMEs:** Each service directory has its own README with specific instructions

## Quick Reference Commands

```bash
# Full dev environment
./start.sh --up --ices --dev --demo

# App only
cd app && npm install && npm run dev

# Accounting only
cd accounting && pnpm install && pnpm dev

# Run all tests
cd app && npm test
cd accounting && pnpm test
cd notifications && go test ./...
cd notifications-ts && pnpm test

# Lint
cd app && npm run lint

# Build Docker images
docker build -t komunitin/komunitin-app ./app
docker build -t komunitin/komunitin-accounting ./accounting
docker build -t komunitin/komunitin-notifications ./notifications
docker build -t komunitin/komunitin-notifications-ts ./notifications-ts

# Database reset (dev/test)
cd accounting && pnpm reset-db
cd notifications-ts && pnpm reset-db
```

---

**Last Updated:** 2026-01-11  
**Komunitin Version:** 1.2.0  
**Maintained by:** Komunitin Community
