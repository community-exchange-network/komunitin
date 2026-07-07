# Komunitin

Open System for Exchange Communities

[![Build](https://github.com/community-exchange-network/komunitin/actions/workflows/build.yml/badge.svg?branch=master)](https://github.com/community-exchange-network/komunitin/actions/workflows/build.yml)

Komunitin is an app featuring a local community currency wallet and a marketplace allowing these local communities to easily trade between themselves and other communities. It effectively facilitates trade between a decentralized set of local community currencies.

## Demo
Quickly check Komunitin in action at [demo.komunitin.org](https://demo.komunitin.org).

You can find the credentials at the docs page [docs.komunitin.org/readme/demo](https://docs.komunitin.org/readme/demo).

## System structure
The Komunitin system is made of several microservices:
 - Komunitin app: The client application with user interface. See the [app](app/) folder.
 - Notifications service: The backend service for the messaging system including mails and push notifications. See the [notifications-ts](notifications-ts/) folder.
 - Accounting service: The decentralized backend for the accounting API based on the [Stellar](https://stellar.org) blockchain. See the [accounting](accounting) folder.
 - IntegralCES: The current backend for the social APIs based on the legacy project built on Drupal. See the [ices project](https://drupal.org/project/ices). This will be rewritten to a new service.
 - Social service: [TODO] The new decentralized backend for the social API.

## Development with Docker
### Requirements
Before starting, be sure you have:
 - [docker](https://docs.docker.com/engine/install/)
 - the cli util [jq](https://jqlang.org/)

Clone Komunitin and its peer dependency IntegralCES **side by side in the same parent folder**:

```bash
cd /your/projects/folder
git clone https://github.com/komunitin/komunitin.git
git clone https://git.drupalcode.org/project/ices.git
cd komunitin
```

### Configuration

Copy the `.env.dev.template` to `.env`:

```bash
cp .env.dev.template .env
```

In order to have everything working (mailing, push notifications, backups, analytics...) you need to carefully configure the environment variables in the `.env` file. You can find more details about the configuration in the `.env.public.template` file.

### Start
Then you can run the start script with the options `--up` to start the containers, `--ices` to install the IntegralCES site, `--dev` to start the debuggers and other development utils and `--demo` to seed the system with demo data.

```bash
./start.sh --up --ices --dev --demo
```

> The first build downloads and compiles everything from scratch — expect it to take some minutes.

After installing for the first time, if you want just to start the containers in `dev` mode without re-installing you can run:

```bash
docker compose -f compose.yml -f compose.dev.yml up -d
```

The published services are:
 - Komunitin app: [https://localhost:2030](https://localhost:2030)
 - Accounting service: [http://localhost:2025](http://localhost:2025)
 - Notifications service: [http://localhost:2023](http://localhost:2023)
 - IntegralCES: [http://localhost:2029](http://localhost:2029)

Node debugger ports mirror the service HTTP ports: notifications-ts uses `9223`,
accounting uses `9225`, auth uses `9226`, and social uses `9228`.

You can now try Komunitin at [https://localhost:2030](https://localhost:2030) with the email `noether@komunitin.org` and password `komunitin`.

### Flavors

The app supports flavors (e.g. `komunitin`, `ces`) configured via `KOMUNITIN_FLAVOR` in `.env`. Changing the flavor requires rebuilding the app image:

```bash
docker compose -f compose.yml -f compose.dev.yml build app
docker compose -f compose.yml -f compose.dev.yml up -d app
```

## Public deployment
See the [DEPLOYMENT.md](DEPLOYMENT.md) file for instructions about deploying Komunitin in production.
