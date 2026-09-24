# Komunitin

Open System for Exchange Communities

[![Build](https://github.com/community-exchange-network/komunitin/actions/workflows/build.yml/badge.svg?branch=master)](https://github.com/community-exchange-network/komunitin/actions/workflows/build.yml)

Komunitin is an app featuring a local community currency wallet and a marketplace allowing these local communities to easily trade between themselves and other communities. It effectively facilitates trade between a decentralized set of local community currencies.

## Demo
Quickly check Komunitin in action at [demo.komunitin.org](https://demo.komunitin.org).

## System structure
The Komunitin system is made of several microservices:
 - Komunitin app: The client application with user interface. See the [app](app/) folder.
 - Auth service: Identity, login, registration and service authentication. See the [auth](auth/) folder.
 - Social service: Communities, marketplace, members and preferences. See the [social](social/) folder.
 - Notifications service: The backend service for the messaging system including mails and push notifications. See the [notifications-ts](notifications-ts/) folder.
 - Accounting service: The decentralized backend for the accounting API based on the [Stellar](https://stellar.org) blockchain. See the [accounting](accounting) folder.

## Development with Docker
### Requirements
Before starting, be sure you have:
 - [docker](https://docs.docker.com/engine/install/)
 - the cli util [jq](https://jqlang.org/)

Clone Komunitin:

```bash
git clone https://github.com/komunitin/komunitin.git
cd komunitin
```

### Configuration

Copy the `.env.dev.template` to `.env`:

```bash
cp .env.dev.template .env
```

In order to have everything working (mailing, push notifications, backups, analytics...) you need to carefully configure the environment variables in the `.env` file. You can find more details about the configuration in the `.env.public.template` file.

### Start
Run the start script with `--up` to build and start the containers, `--dev` to
enable hot reload, debuggers and development utilities, and `--reset` to reset
the service databases before applying migrations. The configured superadmin is
bootstrapped after migration.

```bash
./start.sh --up --dev --reset
```

> The first build downloads and compiles everything from scratch — expect it to take some minutes.

Docker resources are preserved by default. Pass `--prune` explicitly if you
want to remove unused Docker resources after startup.

After installing for the first time, if you want to start the containers in
development mode without running migrations and bootstrapping again, run:

```bash
docker compose -f compose.yml -f compose.dev.yml up -d
```

The published services are:
 - Komunitin app: [https://localhost:2030](https://localhost:2030)
 - Auth service: [http://localhost:2026](http://localhost:2026)
 - Accounting service: [http://localhost:2025](http://localhost:2025)
 - Social service: [http://localhost:2028](http://localhost:2028)
 - Notifications service: [http://localhost:2023](http://localhost:2023)

Node debugger ports mirror the service HTTP ports: notifications-ts uses `9223`,
accounting uses `9225`, auth uses `9226`, and social uses `9228`.

Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in `.env`. The
development template defaults to `info@komunitin.org` and `komunitin`.

With `DEV_SAVE_EMAILS=true`, Notifications saves rendered emails under
`notifications-ts/tmp/emails` for local inspection.

### Flavors

The app supports flavors (e.g. `komunitin`, `ces`) configured via `KOMUNITIN_FLAVOR` in `.env`. Changing the flavor requires rebuilding the app image:

```bash
docker compose -f compose.yml -f compose.dev.yml build app
docker compose -f compose.yml -f compose.dev.yml up -d app
```

## Public deployment
See the [DEPLOYMENT.md](DEPLOYMENT.md) file for instructions about deploying Komunitin in production.
