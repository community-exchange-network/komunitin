# Komunitin accounting service

This service uses the [Stellar](https://stellar.org) blockchain to define the currencies, accounts, and transactions of the community.

## Build
```bash
$ pnpm install
```

## Run dev server standalone (with DB and local Stellar)
This is the right environment to develop the service and execute tests. Start the dependecy services (database and local Stellar Network) and the Komunitin Accounting service at http://localhost:2025.
```bash
$ cp .env.test .env
$ docker compose up -d
$ pnpm dev
```

## Run dev server with local services (with testnet Stellar)
This is the right environment to develop the integration of this service with the app and other services. 
- Start the Komunitin services following the instructions in the [main README](../README.md).
- Stop the `accounting` container
- Run the accounting service with the local services:
```bash
$ cp .env.local .env
$ pnpm dev
```
- Change the internal accounting url in integralces service:
```bash
$ cd ..
$ docker compose exec integralces drush vset ces_komunitin_accounting_url_internal http://host.docker.internal:2025 
```

Note for devs on WSL (Windows): when runnning the accounting service from WSL2 and wanting to access it from a docker container (eg from integralces or notifications), the host.docker.internal must point to the WSL2 IP instead of the Windows host IP, so the `host.docker.internal: host-gateway` entry in the `docker-compose.yml` file must be replaced by the WSL2 IP.

## Test
Execute all the tests:
```bash
$ pnpm test
```
### Unit tests
```bash
$ pnpm test-unit
```

### Ledger tests
Tests involving only the Stellar integration but not the server.
```bash
$ pnpm test-ledger
```
### Server tests
Tests involving the whole service
```bash
$ pnpm test-server
```

### Run just one test
```bash
$ pnpm test-one <test-file>
```

## Stellar


### Local model
 - Each community currency has its own asset. Assets have the following properties:
   - The asset code is a 4-character string.
   - The asset requires authorisation: no random user in the internet can hold the asset, but only users authorised by the community.
   - The asset is revocable and clawbackable: the issuer can revoke the asset from any user and clawback the asset from any user.

 - Each currency has 3 distinguished Stellar accounts:
   - The issuer account. Is the account that mints the community currency. It only transfers the currency to the credit account.
   - The credit account. Payments from this account are accounted as credit to the user. So for example, if an account has a Stellar balance of 80 units, but the sum of payments from the credit account is 100 units, then the user has a Komunitin balance of -20 units.
   - The admin account. This is an account for administrative purposes and its key is a signer of all other user accounts.

- All XLM base reserves and transaction fees are sponsored by a single global sponsor account.

### External model
In order to feature trade between communities, the following model is proposed:
  - Each currency has two additional distinguished Stellar accounts:
    - The external issuer account. Mints an asset with code HOUR (for all currencies). This asset is permissionless.
    - The external trader account. This account defines sell offers between the local asset and the HOUR asset, and also between the HOUR asset from this currency and the HOUR asset from other currencies.
  - Initially, the trader account is funded with sufficient HOUR balance and sets an offer to convert the local asset to HOUR.
  - If the trader is configured to hold and initial balance of local asset, then it also sets an offer to convert HOUR to the local asset.
  - The currency andministration may choose to trust another currency up to a limit. This means that the currency will accept the HOUR asset from the other currency as payment. This is reflected by creating a trustline to the external HOUR asset and a sell offer to convert the currency HOUR asset to the external HOUR asset.
  - Whenever an incoming external payment is received, the trader account creates or updates the sell offer to convert the current balance of external HOUR assets to local HOUR assets.

## Credit Commons protocol integration
The [Credit Commons](https://creditcommons.net/) is a protocol for enabling transactions between different servers and sytems.

### Known issues
Komunitin's Credit Commons API is a recent addition, it's not complete, and there are a few known issues:
* The only [CC workflow](https://gitlab.com/credit-commons/cc-node/-/blob/0.9.x/doc/developers.md?ref_type=heads#workflow) that is currently supported is `_C-`, meaning the payer sends money and it completes immediately (just a POST, no PATCH).
* In the future we also want to implement `_P+PC-` meaning the payee sends a payment request over Credit Commons with a POST, and the payer approves it with a PATCH.
* Transactions from the UI are only supported using the QR code workflow.
* [FIXME](https://github.com/community-exchange-network/komunitin/blob/0fb7c66bf16954b894e5d6e64712b31a15ef1f6c/app/src/pages/transactions/CreateTransactionSendQR.vue#L92) and even that will stop working!
* There is quite some manual setup required from currency admins.
* This functionality has so far only been tested in testing and development environments, enabling it in production is not yet recommended.
* The current implementation waits for Stellar to commit the transaction, which [may not be the best design](https://github.com/komunitin/komunitin/pull/367#discussion_r2032891494).
* When interpreting the amount from a payment request QR code, the GUI incorrectly assumes a 1:1 conversion rate from the receiver's currency to the sender's local currency.

### Main setup
To test the CC integration, you can go to the repo root, make sure you have https://github.com/michielbdejong/ices checked out next to it, and do:
```sh
cp .env.template .env
./start.sh --up --ices --dev --demo
```

### Sending a transaction from Komunitin
1. Log in to https://localhost:2030 (notice it's https, not http, and tell your browser to accept the self-signed cert) as `euclides@komunitin.org` / `komunitin`
2. Go to transactions -> receive -> QR, and generate a QR code for a value of more than 1 (to cover the transaction fee) but less than 19 (so that Noether's balance is enough).
3. With your phone, make a photo of your laptop screen (no need to scan the QR code with your phone, just take a photo of it).
4. Log out (top left dropdown)
5. Log in as `noether@komunitin.org` / `komunitin`, go to transactions -> send -> QR, and show your phone with the photo to the camera of your laptop.
6. Click 'Confirm', and the payment should go through, via Credit Commons.

### Connecting with docker exec
You can interact with the various containers and databases through docker, here is a little cheat sheet with some oneliners that might be useful for that:
```sh
docker ps
docker exec -it komunitin-cc-1 mysql credcom_twig
docker exec -it komunitin-cc-1 /bin/bash -c "curl -i http://accounting:2025/"
docker exec -it komunitin-integralces-1 mysql -u integralces -pintegralces -h komunitin-db-integralces-1 integralces
docker exec -it komunitin-db-accounting-1 psql postgresql://accounting:accounting@localhost:5432/accounting
```
In psql, execute `SELECT set_config('app.bypass_rls', 'on', false);` to bypass Row Level Security, then `\d+` to see a list of tables, and e.g. `select * from "Transfer";` to see the contents of the Transfers table.

### Reset
To  restart from scratch, do `docker compose down -v`. Make sure with `docker ps -a` and `docker volume ls` that all relevant containers are stopped and removed, and repeat if necessary. There might also be an unnamed volume that you need to remove. If see `DUPLICATE ENTRY` errors on the next run then you know it wasn't removed completely.