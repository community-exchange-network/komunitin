# Komunitin

Open System for Exchange Communities

![build status](https://github.com/komunitin/komunitin/workflows/Build/badge.svg)

Komunitin is an app featuring a local community currency wallet and a marketplace allowing these local communities to easily trade between themselves and other communities. It effectively facilitates trade between a decentralized set of local community currencies.

## Demo
Quickly check Komunitin in action at [demo.komunitin.org](https://demo.komunitin.org). 

Login credentials:

* user: noether@komunitin.org
* password: komunitin

## System structure
The Komunitin system is made of several microservices:
 - Komunitin app: The client application with user interface. See the [app](app/) folder.
 - Notifications service: The backend service for the messaging system including mails and push notifications. See the [notifications](notifications/) folder.
 - Accounting service: The decentralized backend for the accounting API based on the [Stellar](https://stellar.org) blockchain. See the [accounting](accounting) folder.
 - IntegralCES: The current backend for the social APIs based on the legacy project built on Drupal. See the [ices project](https://drupal.org/project/ices). This will be rewritten to a new service.
 - Social service: [TODO] The new decentralized backend for the social API.

## Development run with Docker
Before starting, be sure you have [docker](https://docs.docker.com/engine/install/) and the cli util [jq](https://jqlang.org/) installed. 

You need the peer dependency IntegralCES. Clone it in the same parent folder as Komunitin.

```bash
git clone https://github.com/komunitin/komunitin.git
git clone https://git.drupalcode.org/project/ices.git
```

Copy the `.env.template` to `.env`. That should be enough for quickly starting a dev environment, but you need to check all varaibles and copy the file `komunitin-project-firebase-adminsdk.json` in the `notifications` folder with the firebase admin sdk credentials to have everything working.

Then you can run the start script with the options `--up` to start the containers, `--ices` to install the IntegralCES site, `--dev` to start the debuggers and other development utils and `--demo` to seed the system with demo data.

```bash
./start.sh --up --ices --dev --demo
```

After installing for the first time, if you want just to start the containers in `dev` mode without re-installing you can run:
  
```bash
docker compose -f compose.yml -f compose.dev.yml up -d
```

The published services are:
 - Komunitin app: [https://localhost:2030](https://localhost:2030)
 - IntegralCES: [http://localhost:2029](http://localhost:2029)
 - Notifications service: [http://localhost:2028](http://localhost:2028)
 - Accounting service: [http://localhost:2025](http://localhost:2025)

You can now try Komunitin at [http://localhost:2030](http://localhost:2030) with the email `noether@komunitin.org` and password `komunitin`.

## Public deployment
The public deployment uses the [Traefik](https://traefik.io) reverse proxy to forward the traffic to the different services. The proxy is provided separately because its configuration may vary depending on the server setup. You need to start the reverse proxy first with:

```bash
docker compose -f docker-compose.proxy.yml up -d
```
Then you should to add the flag `--public` to the start script. For example:

```bash
./start.sh --up --ices --public
```
