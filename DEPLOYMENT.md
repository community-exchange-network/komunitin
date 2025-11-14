# Public deployment
This file describes how to deploy Komunitin in a production environment.

## System requirements
To deploy Komunitin in production you need a linux server with:
 - Docker and Docker Compose installed.
 - Git installed.
 - [`jq`](https://jqlang.org/) CLI util installed (only required if adding demo data).

There are no specified minimum hardware requirements, but a minimal VPS server has proven to work as a starting point (eg: 1CPU, 2GB RAM, 20GB HDD).

## Networking
You need to have a domain name pointing to your server IP address. You will need to configure DNS records for the following subdomains:
 - The main app (eg: `example.com`)
 - The accounting service (eg: `accounting.example.com`)
 - The notifications service (eg: `notifications.example.com`)
 - IntegralCES (eg: `integralces.example.com`)

With most providers you can use a wildcard DNS record to cover all subdomains with a single record.

## Get the code
Clone the Komunitin repository and the IntegralCES repository in the same parent folder.
```bash
git clone https://github.com/community-exchange-network/komunitin.git
git clone https://git.drupalcode.org/project/ices.git
```
## Configuration
 - Change directory to the komunitin folder.
 - Copy the file `.env.public.template` to `.env` and edit all the variables to match your setup.
 - Copy your Firebase service account credentials file to `notifications/komunitin-project-firebase-adminsdk.json` for push notifications through Firebase Cloud Messaging.
 - Copy your Firebase service account credentials file to `accounting/komunitin-project-backup-credentials.json` for accounting backups to Google Cloud Storage.

## Reverse proxy 
The public deployment uses the [Traefik](https://traefik.io) reverse proxy to forward the traffic to the different services. The proxy is provided separately because its configuration may vary depending on the server setup.

If you are using only Komunitin in the server you can use the provided `docker-compose.proxy.yml` file to start Traefik. 

```bash
docker compose -f compose.proxy.yml up -d
```

Otherwise you can use it as a template to create your own Traefik setup.

## Install the system

In order to install and start the system for first time run:

```bash
./start.sh --up --ices --public
```

This command builds and starts all the containers with the production network configuration and installs IntegralCES.

### Demo
If you want to seed the system with demo data you can add the `--demo` option:

```bash
./start.sh --up --ices --public --demo
```

## Update the system

To update the system to the latest version, upgrade the code and rebuild and restart the containers:

```bash
git pull
cd ices
git pull
cd ..
./start.sh --up --public
```

### Demo
If you want to wipe up and reseed the demo data you can reinstall the system on each update:

```bash
git pull
cd ices
git pull
cd ..
./start.sh --up --ices --public --demo
```

## Clean up
To clean up unused docker resources you can run after updating the system:

```bash
docker system prune -f
```
