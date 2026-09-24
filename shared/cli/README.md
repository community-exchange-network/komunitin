# Komunitin CLI

The shared TypeScript CLI contains administrative commands that coordinate Komunitin services. Run it from the repository root through the Node 24 Docker wrapper:

```sh
./shared/cli/komunitin admin bootstrap
./shared/cli/komunitin accounting trust NET1 NET2 100
./shared/cli/komunitin accounting create-credit-commons-node NET1 https://credit-commons.example.org
```

## Commands

`admin bootstrap [--password <password>]` creates and verifies the configured superadmin in Auth, then provisions the corresponding Social user. It reads `ADMIN_EMAIL`, optionally reads `ADMIN_PASSWORD`, and uses `KOMUNITIN_NOTIFICATIONS_SECRET` to verify a newly registered user.

`accounting trust <currency-code> <trusted-code> <amount>` creates a trustline. The amount is expressed in currency units and may have up to six decimal places.

`accounting create-credit-commons-node <currency-code> <node-url>` finds the administrator's account for the currency through Social and uses it as the Credit Commons `vostro` account.

Both accounting commands accept `--email` and `--password`. They default to `ADMIN_EMAIL` and `ADMIN_PASSWORD` and request only the OAuth scopes needed by the command.

## Environment

The wrapper loads the root `.env` file. The accounting commands use:

- `KOMUNITIN_AUTH_URL`
- `KOMUNITIN_SOCIAL_URL` for Credit Commons account discovery
- `KOMUNITIN_ACCOUNTING_URL`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` as default credentials

URLs containing `localhost` are translated to `host.docker.internal` so the containerized CLI can reach services running on the host. The CLI never prints credentials or tokens.

The obsolete IntegralCES shell migration is not part of this CLI.

## Development

```sh
cd shared/cli
pnpm install
pnpm typecheck
```

Production execution uses Node's built-in TypeScript support and has no runtime package dependencies.
