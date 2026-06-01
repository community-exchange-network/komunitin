# Komunitin Identity Provider (Auth Service)

The `auth` service is a security-critical component of the Komunitin ecosystem. It serves as the central identity provider (IdP) and OpenID Connect (OIDC) compliant authorization server for all microservices in the architecture.

## Main Features

- **OpenID Connect Provider**: Powered by `oidc-provider`, delivering standard JWT tokens (access, id, and refresh tokens).
- **Signing Keys**: Generates RSA signing keys automatically and persists them in the auth database instead of relying on a checked-in `jwks.json` file.
- **Authentication**: Custom authentication flows using the Resource Owner Password Credentials (ROPC) grant type for the PWA and Token Exchange/Client Credentials for inter-service communication.
- **Microservices Trust**: Validates and facilitates token exchanges securely among backend services without escalating scopes.
- **Account Management**: Endpoints for password resets, changing passwords, and updating emails (with double-verification mechanisms via the `notifications-ts` service). Email-delivered tokens are single-use action tokens redeemed at dedicated endpoints, not OAuth codes redeemable at `POST /token`.
- **Security-focused**: Features built-in memory-based rate limiting, Helmet for HTTP headers, isolated PostgreSQL database, and password hashing using bcrypt.

## Interaction with Other Services

The `auth` service acts as the source of truth for identities. All backend services expect `Bearer` tokens signed by this service. 

### Frontend (`komunitin-app`)
The frontend is a public client (`client_id: komunitin-app`).
- **Login**: Acquires tokens by sending a `POST /token` request with `grant_type=password`, exchanging the user's email and password for an access, refresh, and id token.
- **Refresh**: Refreshes expired sessions via `grant_type=refresh_token`.
- **Email Actions**: Password reset and email confirmation links must call `POST /change-password` or `POST /change-email/confirm` with the emailed token. These flows do not mint access tokens or refresh tokens.
- **Management**: Communicates directly with endpoints like `/change-password` or `/change-email` using its emitted token in the `Authorization: Bearer <token>` header where necessary.

### Backend Microservices (`accounting`, `social`, `notifications-ts`)
Backends interact with `auth` via two main modes:
1. **Machine-to-Machine (M2M)**: Services can fetch a token using `grant_type=client_credentials` to perform autonomous background operations.
2. **Delegation (Token Exchange)**: Using `urn:ietf:params:oauth:grant-type:token-exchange`, a service can submit the user's access token (which it received from the frontend) and obtain a new token scaled down or configured appropriately for its context. This is highly recommended to maintain user-context securely between chains of internal API calls.

## Development Quickstart

Ensure you have your environment correctly configured. Use Node 24 and `pnpm`.

### Prerequisites

1. Copy `.env.test` to `.env` if developing locally.
2. Stand up the required database (Docker Compose is recommended):
   ```bash
   cd ..
   docker compose up -d db-auth
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Push the schema to the database (and run migrations):
   ```bash
   pnpm prisma migrate dev
   # or `pnpm prisma db push` if you are in a quick test setup
   ```
5. Start the development server (runs with hot-reload via `tsx`):
   ```bash
   pnpm dev
   ```
The service will be mapped and available at `http://localhost:2026/`.

## JWKS Rotation

Signing keys are generated automatically on first boot and persisted in the auth database. By default, the service rotates the active signing key every 90 days on startup and keeps retired keys published for 24 hours so already-issued access tokens can continue to validate while clients refresh their JWKS cache.

The long-lived frontend refresh token does not require the old signing key to stay published for 30 days. In this service, refresh tokens are opaque values stored and looked up server-side, while the JWKS is only used to validate signed JWTs such as access tokens and id tokens. Those signed tokens currently live for 1 hour, so a 24 hour overlap is already conservative. If signed token lifetimes are increased in the future, `JWKS_RETENTION_HOURS` should be increased to at least match the longest signed JWT lifetime plus a small cache-refresh margin.

This service does not hot-rotate keys inside a running `oidc-provider` instance. Rotation is therefore designed around normal restarts or deployments, which keeps the implementation simple and avoids provider reinitialization logic. The cadence can be adjusted with `JWKS_ROTATION_INTERVAL_DAYS` and `JWKS_RETENTION_HOURS`.

## Running Tests

Tests use the native Node.js test runner (`node --test`). Since it interacts directly with the DB, make sure you don't run tests pointing to your production or important staging databases! It uses `.env.test` by default and resets data between runs.

```bash
# Run the entire test suite
pnpm test

# Run tests with coverage included (works on Node.js 22+)
pnpm test --experimental-test-coverage

# Run a specific test file
pnpm test-one test/auth.test.ts 
```

**Note**: Before running tests, ensure the local development database service defined in `compose.yml` (`db-auth`) is running. The test suite automatically cleans the database before running each scenario using Prisma's reset utilities.

## Architecture & Code Principles

- **Controller & Routing**: Express routing wrapped in custom middleware and standard error handlers avoiding `try/catch` repetition where possible.
- **Error Handling**: Use the `KError` class (from `src/utils/error.ts`) such as `badRequest()` or `unauthorized()` so errors are consistently formatted as JSON:API error objects.
- **Prisma**: Do not place business logic in Prisma models. Keep database interaction limited to `src/utils/prisma.ts` or scoped module queries.
- **Testing**: End-to-end integration tests overriding `fetch` to mock external webhook/email calls.

