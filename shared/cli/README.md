# Komunitin CLI

The shared TypeScript CLI contains administrative commands that coordinate Komunitin services. Run it from the repository root through the CLI wrapper:

```sh
./shared/cli/komunitin admin migrate ./community.zip
./shared/cli/komunitin admin bundle ices --url https://ices.example.org --code ABCD --output ABCD.zip
./shared/cli/komunitin admin bundle demo bramblewick.zip
./shared/cli/komunitin admin bootstrap
./shared/cli/komunitin accounting trust NET1 NET2 100
./shared/cli/komunitin accounting create-credit-commons-node NET1 https://credit-commons.example.org
```

## Commands

`admin migrate <bundle.zip> [--email <email>] [--password <password>]` uploads a CSV ZIP to Social and streams durable progress. It requires a superadmin and imports Auth, Accounting and Social data, creating or reconciling the currency and accounts. Credentials default to `ADMIN_EMAIL`/`ADMIN_PASSWORD`; the bundle can default to `MIGRATION_BUNDLE`. A disconnect does not stop the worker. Fix failures and re-upload to retry. Run the wrapper from the directory containing the bundle. See the [migration API and retry policy](../../social/src/features/migrations/README.md).

`admin bundle ices --url <site> (--code <CODE> | --all) --output <path>` generates ICES bundles and enriches identities from the source database. Set `ICES_ADMIN_EMAIL`, `ICES_ADMIN_PASSWORD`, and `ICES_DATABASE_URL` in the root `.env`. The wrapper mounts the invoking directory writable for output. Use an output path within that directory. No host Node.js or pnpm installation is needed. See the [ICES export guide](migration/ices/README.md).

`admin repair ices [--apply]` previews or applies the two reviewed ICES source fixes using `ICES_DATABASE_URL`. See the [migration TODO](../../MIGRATION.md).

`admin bootstrap [--password <password>]` creates and verifies the configured superadmin in Auth, then provisions the corresponding Social user. It reads `ADMIN_EMAIL`, optionally reads `ADMIN_PASSWORD`, and uses `KOMUNITIN_NOTIFICATIONS_SECRET` to verify a newly registered user.

`admin bundle demo <output.zip>` packages the checked-in [Bramblewick CSV bundle](../demo/README.md), adding deterministic Stellar keys from `DEMO_RANDOM_SEED` or, when unset or empty, `KOMUNITIN_DOMAIN`. It uses the same import API as other community bundles.

`accounting trust <currency-code> <trusted-code> <amount>` creates a trustline. The amount is expressed in currency units and may have up to six decimal places.

`accounting create-credit-commons-node <currency-code> <node-url>` finds the administrator's account for the currency through Social and uses it as the Credit Commons `vostro` account.

The trustline and Credit Commons commands accept `--email` and `--password`. They default to `ADMIN_EMAIL` and `ADMIN_PASSWORD` and request only the OAuth scopes needed by the command.

## Environment

The wrapper builds `shared/cli/Dockerfile` and runs the CLI with the repository root `.env` and the current directory mounted. Node reads `.env` directly, including quoted values. Shell environment variables are not forwarded. Configure these values in `.env`:

- `KOMUNITIN_AUTH_URL`
- `KOMUNITIN_SOCIAL_URL` for migrations and Credit Commons account discovery
- `KOMUNITIN_ACCOUNTING_URL`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` as default credentials
- `KOMUNITIN_NOTIFICATIONS_SECRET` for superadmin bootstrap
- `ICES_ADMIN_EMAIL`, `ICES_ADMIN_PASSWORD`, and `ICES_DATABASE_URL` for the migration source
- `DEMO_RANDOM_SEED` (optional) or `KOMUNITIN_DOMAIN` for demo keys; use a distinct seed for installations sharing a domain

API URLs and `ICES_DATABASE_URL` containing `localhost` are translated to `host.docker.internal` so the containerized CLI can reach services running on the host. The CLI never prints credentials or tokens.

`./start.sh --up --dev --demo` resets the service databases, bootstraps the superadmin and imports Bramblewick. The demo script writes `shared/demo/tmp/bramblewick.zip`. Stellar is left intact: keeping the same demo seed lets subsequent imports reuse its accounts. IntegralCES is only needed when explicitly exporting from an externally managed installation.

## Development

```sh
cd shared/cli
pnpm install
pnpm typecheck
pnpm test
```

The CLI uses Node's built-in TypeScript support for its administrative commands. ICES generation uses the same CLI package and its installed dependencies.
