# Komunitin CLI

The shared TypeScript CLI contains administrative commands that coordinate Komunitin services. Run it from the repository root through the CLI wrapper:

```sh
./shared/cli/komunitin admin migrate ./community.zip
./shared/cli/komunitin admin bundle ices --url https://ices.example.org --code ABCD --output ABCD.zip
./shared/cli/komunitin admin bootstrap
./shared/cli/komunitin accounting trust NET1 NET2 100
./shared/cli/komunitin accounting create-credit-commons-node NET1 https://credit-commons.example.org
```

## Commands

`admin migrate <bundle.zip> [--email <email>] [--password <password>]` uploads a CSV ZIP to Social and streams durable progress. It requires a superadmin and existing Accounting data. Credentials default to `ADMIN_EMAIL`/`ADMIN_PASSWORD`; the bundle can default to `MIGRATION_BUNDLE`. A disconnect does not stop the worker. Fix failures and re-upload to retry. The Docker wrapper mounts the invoking directory read-only, so place the bundle there (or use native Node 24 for other paths). See the [migration API and retry policy](../../social/src/features/migrations/README.md).

`admin bundle ices --url <site> (--code <CODE> | --all) --output <path>` generates ICES bundles and enriches identities from the source database. Set `ICES_ADMIN_EMAIL`, `ICES_ADMIN_PASSWORD`, and `ICES_DATABASE_URL`, then run `pnpm install` in `shared/cli`. See the [ICES export guide](migration/ices/README.md). This command uses local Node 24 because the generator uses CLI dependencies and writes private ZIPs to the requested path.

`admin bootstrap [--password <password>]` creates and verifies the configured superadmin in Auth, then provisions the corresponding Social user. It reads `ADMIN_EMAIL`, optionally reads `ADMIN_PASSWORD`, and uses `KOMUNITIN_NOTIFICATIONS_SECRET` to verify a newly registered user.

`accounting trust <currency-code> <trusted-code> <amount>` creates a trustline. The amount is expressed in currency units and may have up to six decimal places.

`accounting create-credit-commons-node <currency-code> <node-url>` finds the administrator's account for the currency through Social and uses it as the Credit Commons `vostro` account.

Both accounting commands accept `--email` and `--password`. They default to `ADMIN_EMAIL` and `ADMIN_PASSWORD` and request only the OAuth scopes needed by the command.

## Environment

Docker-backed commands load the root `.env` file. Bundle generation loads it when present and reads exported ICES credentials and `ICES_DATABASE_URL`. The commands use:

- `KOMUNITIN_AUTH_URL`
- `KOMUNITIN_SOCIAL_URL` for migrations and Credit Commons account discovery
- `KOMUNITIN_ACCOUNTING_URL`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` as default credentials

URLs containing `localhost` are translated to `host.docker.internal` so the containerized CLI can reach services running on the host. The CLI never prints credentials or tokens.

The obsolete IntegralCES shell migration is not part of this CLI.

## Development

```sh
cd shared/cli
pnpm install
pnpm typecheck
pnpm test
```

The CLI uses Node's built-in TypeScript support for its administrative commands. ICES generation uses the same CLI package and its installed dependencies.
