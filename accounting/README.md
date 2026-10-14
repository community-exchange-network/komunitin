# Komunitin accounting service

This service uses the [Stellar](https://stellar.org) blockchain to define the currencies, accounts, and transfers of the community.

## Build

Run commands from `accounting/` unless stated otherwise.

```bash
pnpm install
```

## Run dev server standalone (with DB and local Stellar)

This is the right environment to develop the service and execute tests. Start the dependency services (database and local Stellar network) and the Komunitin Accounting service at http://localhost:2025.

```bash
cp .env.test .env
docker compose up -d
pnpm reset-db
pnpm dev
```

Stellar Horizon and Friendbot can take a few seconds to start. `pnpm reset-db` deletes the configured database contents.

## Run dev server with local services (with testnet Stellar)

This is the right environment to develop the integration of this service with the app and other services.

- Start the Komunitin services following the instructions in the [main README](../README.md). The development stack already runs Accounting with hot reload.
- To run Accounting on the host instead, stop the `accounting` container, expose its database port, and point Social and Notifications to `http://host.docker.internal:2025`.
- Copy `.env.local` to `.env`, align its configuration with the running stack, and start the service:

```bash
cp .env.local .env
pnpm dev
```

Note for developers on WSL2: `host.docker.internal` must resolve to the WSL2 host running Accounting. You may need to replace the `host.docker.internal:host-gateway` mapping in `compose.yml` with the WSL2 IP.

## Test

Execute all the tests using the standalone setup above. Server tests reset the database, so keep `.env` and `.env.test` pointed at the test database.

```bash
pnpm test
```

### Unit tests

```bash
pnpm test-unit
```

### Ledger tests

Tests involving only the Stellar integration but not the server.

```bash
pnpm test-ledger
```

### Server tests

Tests involving the whole service, including Credit Commons and contributions.

```bash
pnpm test-server
```

### Run just one test

```bash
pnpm test-one <test-file>
```

## Stellar

### Local model

- Each community currency has its own asset. Assets have the following properties:
  - The asset code is a 4-character string.
  - The asset requires authorisation: only accounts authorised by the community can hold it.
  - The asset is revocable and clawbackable: the issuer can revoke authorisation and claw back the asset from any account.

- Each currency has three main Stellar accounts:
  - The issuer account. This is the account that mints the community currency. It only transfers the currency to the credit account.
  - The credit account. Transfers from this account are accounted as credit to the member. For example, if an account has a Stellar balance of 80 units, but its allocated credit is 100 units, then it has a Komunitin balance of -20 units.
  - The admin account. This is an account for administrative purposes and its key is a signer of all other member accounts.

- All XLM base reserves and transaction fees are sponsored by a single global sponsor account.

### External model

Trade between communities uses the following model:

- Each currency has two additional distinguished Stellar accounts:
  - The external issuer account. Mints a permissionless asset with code HOUR. Each currency has its own issuer.
  - The external trader account. Defines sell offers between the local asset and the HOUR asset, and between the HOUR asset from this currency and the HOUR assets from other currencies.
- Initially, the trader account is funded with sufficient HOUR balance and sets an offer to convert the local asset to HOUR.
- If the trader is configured to hold an initial balance of the local asset, it also sets an offer to convert HOUR to the local asset.
- The currency administration may choose to trust another currency up to a limit. This means that the currency will accept the HOUR asset from the other currency for incoming transfers. This is reflected by creating a trustline to the external HOUR asset and a sell offer to convert the currency's HOUR asset to the external HOUR asset.
- Whenever an incoming external transfer is received, the trader account creates or updates the sell offer to convert the current balance of external HOUR assets to local HOUR assets.

## Credit Commons protocol integration

[Credit Commons](https://creditcommons.net/) is a protocol for enabling transfers between different servers and systems.

Accounting administration commands, including trustline and Credit Commons node setup, live in the [shared TypeScript CLI](../shared/cli/README.md). They authenticate through Auth and use Social for current-user membership discovery.

### Known issues

Komunitin's Credit Commons API is incomplete:

- Incoming transfers complete immediately with a POST. Updating their state with PATCH is not implemented, so request-and-approve workflows are not supported yet.
- Transfers from the UI are only supported using the QR code workflow.
- Community administrators still need to configure connections and settings manually.
- This functionality has only been tested in development and test environments; enabling it in production is not yet recommended.
- The implementation waits for Stellar to commit the transfer, which [may not be the best design](https://github.com/komunitin/komunitin/pull/367#discussion_r2032891494). A subsequent remote failure does not roll back the local transfer.
- When interpreting an amount from a receive QR code, the app assumes a 1:1 conversion rate from the destination currency to the sender's local currency.

### Main setup

From the repository root, start the development stack with demo data:

```sh
cp .env.dev.template .env
./start.sh --up --dev --demo
```

The demo now contains the single Bramblewick community (`BRAM`). Log in at https://localhost:2030 as `mabel@bramblewick.example` (administrator) or `tom@bramblewick.example` (member), with password `komunitin`. See the [demo guide](../shared/demo/README.md) for the full data and login details.

The Credit Commons test node at http://localhost:2024 has a `BRAM` peer. Connect Accounting to it using:

```bash
./shared/cli/komunitin accounting create-credit-commons-node BRAM http://cc/ \
  --email mabel@bramblewick.example --password komunitin
```

This uses Mabel's account as the `vostro` account. If Accounting runs on the host, use `http://localhost:2024/` instead of `http://cc/`. Cross-community tests require another community or remote account and matching configuration on the Credit Commons node; the demo does not create these automatically.

### Sending a transfer from Komunitin

After connecting the participating communities:

1. Log in as the sending community's administrator (Mabel for `BRAM`). Enable Credit Commons transfers and disable Stellar external transfers in the community settings. The sending account must also allow external transfers.
2. Log in as the recipient in the other community and generate a receive QR code for an amount within the sender's available balance and credit, allowing for any fees.
3. To test on one computer, take a photo of the QR code with your phone; there is no need to scan it with the phone.
4. Log out and log in as the sender (Tom for `BRAM`). Open Send → QR and show the photo to the computer's camera.
5. Confirm the transfer to send it through Credit Commons.

### Connecting with docker exec

Useful commands from the repository root:

```sh
docker ps
docker compose -f compose.yml -f compose.dev.yml exec cc mysql credcom_twig
docker compose -f compose.yml -f compose.dev.yml exec cc curl -i http://accounting:2025/
docker compose -f compose.yml -f compose.dev.yml exec db-accounting psql -U accounting -d accounting
```

In psql, execute `SELECT set_config('app.bypass_rls', 'on', false);` to bypass Row Level Security, then `\d+` to list tables or `SELECT * FROM "Transfer";` to inspect transfers.
