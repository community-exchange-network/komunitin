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

## Database Backups

Both the accounting and notifications databases support automated backups using [WAL-G](https://github.com/wal-g/wal-g) with any S3-compatible storage provider (AWS S3, Google Cloud Storage, MinIO, etc.).

### How it works
- **Continuous WAL archiving**: All PostgreSQL Write-Ahead Log (WAL) files are continuously pushed to S3 storage, enabling point-in-time recovery.
- **Daily full backups**: A cron job creates a full backup every day at 2:02 AM.
- **Automatic cleanup**: Old backups are pruned daily at 3:03 AM, retaining the 7 most recent full backups.
- **Single bucket**: Both databases share the same S3 bucket, organized in separate folders (`db-accounting/` and `db-notifications/`).

### Configuration

Set the following variables in your `.env` file (see `.env.public.template` for descriptions):

```
DB_BACKUP_ENABLE=true
S3_BACKUP_BUCKET=s3://your-bucket-name
S3_ACCESS_KEY=your-hmac-access-key
S3_SECRET_KEY=your-hmac-secret-key
S3_ENDPOINT=https://storage.googleapis.com
S3_REGION=auto
```

The `S3_ENDPOINT` and `S3_REGION` values depend on your provider:
- **Google Cloud Storage**: `S3_ENDPOINT=https://storage.googleapis.com`, `S3_REGION=auto`
- **AWS S3**: `S3_ENDPOINT=https://s3.<region>.amazonaws.com`, `S3_REGION=<region>` (e.g., `us-east-1`)
- **MinIO**: `S3_ENDPOINT=http://your-minio-host:9000`, `S3_REGION=us-east-1`

### Restoring a backup

To restore the latest backup for the accounting database:

```bash
docker compose run --user postgres --entrypoint /bin/bash db-accounting /usr/local/bin/restore_backup.sh
```

To restore with point-in-time recovery to a specific timestamp:

```bash
docker compose run --user postgres --entrypoint /bin/bash db-accounting /usr/local/bin/restore_backup.sh "2025-07-09 10:25:00"
```

The same commands work for `db-notifications-ts` by replacing the service name.

### Manual backup

To manually trigger a full backup:

```bash
docker compose exec db-accounting su -c "/usr/local/bin/create_backup.sh" postgres
```
