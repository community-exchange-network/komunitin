# Production migration: ICES → Auth/Social

Start with the legacy application at `/opt/komunitin.org`, this repository at `/opt/komunitin-new`, and the proxy/maintenance files in `/opt/komunitin-deploy`. Reuse the existing PostgreSQL and Redis volumes. Execute the commands by hand, stopping if anything fails. Never use `--reset`, `--demo` or `down -v` on production.

Finish with production at `/opt/komunitin.org`, demo unchanged at `/opt/demo.komunitin.org`, and proxy/maintenance at `/opt/komunitin-deploy`. Use a current Docker Compose version supporting inline configs and `!reset`.

## 0. Prepare the new checkout

```sh
cd /opt/komunitin-new
cp .env.public.template .env
nano .env
```

In the new `.env`, select the existing project and public Compose files:

```dotenv
COMPOSE_PROJECT_NAME=komunitin-prod
COMPOSE_FILE=compose.yml:compose.public.yml
KOMUNITIN_DOMAIN=komunitin.org
STELLAR_NETWORK=public
ICES_DATABASE_URL='mysql://c13ces:URL_ENCODED_PASSWORD@localhost:3307/c13ices_prod'
```

Copy the existing `ACCOUNTING_POSTGRES_*`, Accounting encryption password/salt/sponsor key, Horizon, VAPID, SMTP, S3 and app settings from the old `.env`. Copy the existing notifications database passwords into `NOTIFICATIONS_POSTGRES_*` (renamed from `NOTIFICATIONS_TS_POSTGRES_*`). Configure `AUTH_POSTGRES_*` and `SOCIAL_POSTGRES_*`, the new Auth/Social URLs and service secrets, ICES administrator credentials, and a dedicated `ADMIN_EMAIL`/`ADMIN_PASSWORD` absent from ICES. Check DNS for `auth.komunitin.org` and `social.komunitin.org`, and public S3 upload access. Keep the existing `migration-mysql` bridge running.

```sh
docker compose build
docker pull alpine:3
mkdir -m 700 /opt/komunitin-backup
```

## 1. Switch the shared proxy and enable maintenance

Use `/opt/komunitin-deploy/proxy/compose.yml` and `/opt/komunitin-deploy/maintenance/compose.yml`, each with its own `.env`. Compose uses the folder names as project names.

```sh
cd /opt/komunitin-deploy/proxy
docker inspect traefik --format '{{json .Mounts}}'
cp .env.template .env
nano .env
```

Set `TRAEFIK_ACME_VOLUME` to the volume mounted at `/letsencrypt` (normally `proxy_letsencrypt`). Then configure maintenance:

```sh
cd /opt/komunitin-deploy/maintenance
docker network inspect komunitin.org --format '{{json .IPAM.Config}}'
cp .env.template .env
nano .env
```

Keep the template's production domains. Set `MAINTENANCE_BYPASS` using the operator/server IPs and the subnet shown above:

```dotenv
MAINTENANCE_BYPASS='ClientIP(`203.0.113.10`) || ClientIP(`203.0.113.20`) || ClientIP(`172.20.0.0/16`)'
```

```sh
docker compose up -d
docker stop traefik
docker cp traefik:/letsencrypt/acme.json /opt/komunitin-backup/acme.json
docker rm traefik

cd /opt/komunitin-deploy/proxy
docker compose up -d
```

Verify demo still works and production/ICES return `503` from a non-exempt connection. The proxy restart briefly interrupts both sites.

## 2. Freeze and back up the source

Disable any host/external ICES cron jobs as well as [Drupal automatic cron](https://api.drupal.org/api/drupal/modules%21system%21system.admin.inc/function/system_cron_settings/7.x). Let in-flight requests finish before stopping services.

```sh
cd /opt/komunitin.org
docker compose exec integralces drush vset cron_safe_threshold 0 -y
docker compose stop app accounting notifications-ts phpmyadmin integralces
docker compose exec db-notifications redis-cli SAVE
docker compose stop db-accounting db-notifications-ts db-notifications db-integralces
```

Archive each stopped database volume and the ICES files:

```sh
docker run --rm -v komunitin-prod_db-accounting:/data:ro -v /opt/komunitin-backup:/backup alpine:3 tar -czf /backup/accounting.tar.gz -C /data .
docker run --rm -v komunitin-prod_db-notifications-ts:/data:ro -v /opt/komunitin-backup:/backup alpine:3 tar -czf /backup/notifications.tar.gz -C /data .
docker run --rm -v komunitin-prod_db-notifications:/data:ro -v /opt/komunitin-backup:/backup alpine:3 tar -czf /backup/redis.tar.gz -C /data .
docker run --rm -v komunitin-prod_db-integralces:/data:ro -v /opt/komunitin-backup:/backup alpine:3 tar -czf /backup/ices-db.tar.gz -C /data .
sudo tar -czf /opt/komunitin-backup/ices-files.tar.gz -C /opt/komunitin.org .env ices
cp /opt/komunitin-new/.env /opt/komunitin-backup/new.env

docker compose start db-integralces integralces
```

Keep ICES and its database available for export and image downloads until import finishes.

## 3. Reuse volumes and start the new services

Do not run `start.sh` yet: its `--remove-orphans` would remove ICES, and it would start notification delivery.

```sh
cd /opt/komunitin-new
docker compose up -d db-auth db-social db-accounting db-notifications-ts db-notifications
docker compose logs --tail 20 db-auth db-social db-accounting db-notifications-ts
```

Once the databases report they are ready, apply migrations and start the app services:

```sh
docker compose run --rm --no-deps auth pnpm prisma migrate deploy
docker compose run --rm --no-deps social pnpm prisma migrate deploy
docker compose run --rm --no-deps accounting pnpm prisma migrate deploy
docker compose run --rm --no-deps notifications-ts pnpm prisma migrate deploy
docker compose up -d auth social accounting app
docker compose logs --tail 20 auth social accounting
```

Once the services are ready, create the superadmin:

```sh
./shared/cli/komunitin admin bootstrap
```

Keep `notifications-ts` stopped. Do not run the legacy checkout's `up` or `down` after this point: both checkouts now control the same project. Do not rerun the ICES → Accounting data migration.

## 4. Prepare source images

Run on the machine holding the uploads. Requires Bash, ImageMagick 6/7, `file` and GNU coreutils/findutils.

```sh
sudo apt-get install imagemagick file
ICES_FILES=/opt/komunitin.org/ices/drupal/sites/default/files
bash shared/cli/migration/ices/prepare-images.sh "$ICES_FILES"
sudo bash shared/cli/migration/ices/prepare-images.sh --apply "$ICES_FILES"
```

The script includes subdirectories, including `styles`. It leaves files ≤1,000,000 bytes unchanged. Unsupported files/animations are reported intact; exit 1 means some oversized files were not processed.

## 5. Repair ICES records

Uses the same `ICES_DATABASE_URL` as bundle generation; apply requires UPDATE access to `ces_account` and `ces_accountuser`.

```sh
./shared/cli/komunitin admin repair ices
./shared/cli/komunitin admin repair ices --apply
```

This fixes XLCC0004's owner privilege and COOP2369's pending state. COOP2369's absence from Accounting was established in the reviewed dump; this command cannot recheck live Accounting.

## 6. Repair destination Accounting references

Copy the private [owner manifest](tmp/accounting-owner-repairs.json) to `tmp/accounting-owner-repairs.json` in the executing checkout. It covers SNGS0019, XLCC0003 and XLCC0013.

```sh
docker compose cp tmp/accounting-owner-repairs.json accounting:/tmp/accounting-owner-repairs.json
docker compose exec accounting pnpm exec tsx scripts/repair-account-owners.ts --input /tmp/accounting-owner-repairs.json
docker compose exec accounting pnpm exec tsx scripts/repair-account-owners.ts --input /tmp/accounting-owner-repairs.json --apply
docker compose exec accounting pnpm exec tsx scripts/repair-ices-account-links.ts --source https://integralces.net/ces/api/accounting
docker compose exec accounting pnpm exec tsx scripts/repair-ices-account-links.ts --source https://integralces.net/ces/api/accounting --apply
```

## 7. Generate fresh bundles

Use an unused private output directory. These are the 19 active groups in the reviewed snapshot, ordered HORA first. `--all` also includes inactive groups.

```sh
umask 077
MIGRATION_GROUP_CODES='HORA CBA3 COOP CUFC ECOS FGTM FLOC GOTA GREE GRTX HERA NGI1 SNGS SUDO TEST TIME UCAS XLCC ZOQT'
mkdir -m 700 bundles-test
for code in $MIGRATION_GROUP_CODES; do
  ./shared/cli/komunitin admin bundle ices --url https://integralces.net --code "$code" --output "bundles-test/$code.zip" || break
done
```

Generic data sanitization is automatic. Bundles contain password hashes; keep them private.

## 8. Import and verify

After all 19 exports succeed, run in the same shell against one destination:

```sh
for code in $MIGRATION_GROUP_CODES; do
  ./shared/cli/komunitin admin migrate "bundles-test/$code.zip" || break
done
```

Require all 19 imports to complete. Unsupported documents and broken image downloads are expected warnings and do not require manual repair.

Before enabling user access, verify representative logins, profiles/posts and wallet links: HORA, XLCC0004, SNGS0019 and pending COOP2369. For the unchanged reviewed snapshot, expected totals are 5,624 migrated identities (excluding the superadmin), 5,939 members, 5,892 posts and 224 categories. Check preserved notification history/subscriptions and any remaining ICES image links before retiring the source.

## 9. Retire ICES and swap directories

Only after all checks pass:

```sh
cd /opt/komunitin.org
docker compose stop integralces db-integralces phpmyadmin
docker compose rm -f integralces db-integralces phpmyadmin
docker stop migration-mysql
docker rm migration-mysql

cd /opt
mv komunitin.org komunitin-backup/legacy-checkout
mv komunitin-new komunitin.org

cd /opt/komunitin.org
./start.sh --up --public
```

This enables production notification delivery. Proxy and maintenance keep running from `/opt/komunitin-deploy`. Keep the backups and old ICES volume; do not run the archived legacy checkout's `compose.yml` again.

## 10. Reopen production

Verify production logins, notifications and demo, then remove the gate:

```sh
cd /opt/komunitin-deploy/maintenance
docker compose down
```

Future production updates run `./start.sh --up --public` from `/opt/komunitin.org`. Manage the shared proxy with `docker compose` from `/opt/komunitin-deploy/proxy`; leave demo's checkout and project unchanged.
