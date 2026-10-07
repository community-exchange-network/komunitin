# CES migration: remaining steps

Run in Bash, stopping on errors. Never use `--reset`, `--demo` or `down -v` on production. Keep the same shell for the variables below.

## 1. Save configuration and update production code

```sh
cd /opt/app.ces.community/komunitin
umask 077
export MIGRATION_BACKUP="$HOME/ces2-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -m 700 "$MIGRATION_BACKUP"
docker run --rm -v /opt/app.ces.community:/source:ro alpine:3 \
  tar -czf - -C /source komunitin ices > "$MIGRATION_BACKUP/production-checkouts.tar.gz"
cp /opt/ces2-deployment/compose.yml "$MIGRATION_BACKUP/proxy-compose.yml"
docker exec traefik cat /letsencrypt/acme.json > "$MIGRATION_BACKUP/acme.json"
git diff > "$MIGRATION_BACKUP/production.patch"

git switch master
git pull --ff-only origin master
nano .env
```

Merge `.env.public.template` into the existing environment. Set:

```dotenv
COMPOSE_PROJECT_NAME=ces2-prod
COMPOSE_FILE=compose.yml:compose.public.yml
KOMUNITIN_DOMAIN=app.ces.community
KOMUNITIN_FLAVOR=ces
KOMUNITIN_AUTH_URL=https://auth.app.ces.community
KOMUNITIN_SOCIAL_URL=https://social.app.ces.community
KOMUNITIN_ACCOUNTING_URL=https://accounting.app.ces.community
ICES_DATABASE_URL='mysql://USER:URL_ENCODED_PASSWORD@db-integralces:3306/DATABASE'
```

Fill in the source database credentials and these new settings:

- `AUTH_POSTGRES_PASSWORD`, `AUTH_POSTGRES_APP_PASSWORD`, `SOCIAL_POSTGRES_PASSWORD`, `SOCIAL_POSTGRES_APP_PASSWORD`.
- `KOMUNITIN_AUTH_CLIENT_SECRET`, `KOMUNITIN_SOCIAL_SECRET`, `KOMUNITIN_ACCOUNTING_CLIENT_SECRET`; retain `KOMUNITIN_NOTIFICATIONS_SECRET`.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: migration superadmin absent from ICES.
- `ICES_ADMIN_EMAIL` / `ICES_ADMIN_PASSWORD`: source administrator.
- Copy old `NOTIFICATIONS_TS_POSTGRES_*` values to `NOTIFICATIONS_POSTGRES_*`, if renamed.

Keep Accounting secrets, Stellar settings, VAPID keys, SMTP and S3 settings. Configure public access to `${S3_PREFIX}/uploads` and `UPLOAD_PUBLIC_URL` if needed.

Use literal URLs and secrets in `.env`: the CLI reads it directly and does not expand `${VARIABLE}` references or receive exported shell variables.

```sh
docker compose config -q
docker compose build
docker build -t ces2-migration-cli -f shared/cli/Dockerfile .
docker pull alpine:3
docker build -t ces2-migration-images - <<'DOCKERFILE'
FROM alpine:3
RUN apk add --no-cache bash imagemagick file coreutils findutils grep
ENTRYPOINT ["bash", "/prepare-images.sh"]
DOCKERFILE
cp .env "$MIGRATION_BACKUP/new.env"
```

The normal CLI wrapper uses Docker's default network. For production migration, use this function to join the existing production network, where `db-integralces` and Traefik's domain aliases are reachable. Run it from the production repository root and keep this shell open:

```sh
migration_cli() {
  docker run --rm \
    --network app.ces.community \
    --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$PWD/.env,dst=/app/.env,readonly" \
    -v "$PWD:$PWD" -w "$PWD" \
    ces2-migration-cli "$@"
}
docker inspect ces2-prod-db-integralces-1 --format '{{json .NetworkSettings.Networks}}'
docker inspect traefik --format '{{json .NetworkSettings.Networks}}'
```

Confirm both containers are attached to `app.ces.community`, with the source database alias `db-integralces`. If the production network has another name, use that name in the function.

Do not run `start.sh` until step 7: it would remove ICES and start notifications.

## 2. Update the shared proxy

Point these DNS names to the server:

- `auth.app.ces.community`
- `social.app.ces.community`
- `auth.ces2demo.community-exchange.org`
- `social.ces2demo.community-exchange.org`

```sh
cd /opt/ces2-deployment
nano compose.yml
```

Add the two aliases under each existing `services.traefik.networks` entry:

```yaml
      ces2-demo:
        aliases:
          - ces2demo.community-exchange.org
          - accounting.ces2demo.community-exchange.org
          - notifications.ces2demo.community-exchange.org
          - integralces.ces2demo.community-exchange.org
          - auth.ces2demo.community-exchange.org
          - social.ces2demo.community-exchange.org
      ces2-prod:
        aliases:
          - app.ces.community
          - accounting.app.ces.community
          - notifications.app.ces.community
          - integralces.app.ces.community
          - auth.app.ces.community
          - social.app.ces.community
```

This briefly interrupts both sites:

```sh
docker compose config -q
docker compose up -d --pull never traefik
docker compose logs --tail 30 traefik
```

## 3. Back up data

Disable any external ICES cron jobs. The following commands briefly stop production services for consistent backups; services become publicly available as they are restarted.

```sh
docker exec ces2-prod-integralces-1 drush vset cron_safe_threshold 0 -y
docker stop ces2-prod-app-1 ces2-prod-accounting-1 ces2-prod-notifications-ts-1 ces2-prod-integralces-1
docker exec ces2-prod-db-notifications-1 redis-cli SAVE
docker stop ces2-prod-db-accounting-1 ces2-prod-db-notifications-ts-1 ces2-prod-db-notifications-1 ces2-prod-db-integralces-1

for volume in db-accounting db-notifications-ts db-notifications db-integralces integralces-sites; do
  docker run --rm \
    -v "ces2-prod_${volume}:/data:ro" \
    alpine:3 tar -czf - -C /data . > "$MIGRATION_BACKUP/${volume}.tar.gz" || break
done
```

Require all five archives before restarting the source:

```sh
for volume in db-accounting db-notifications-ts db-notifications db-integralces integralces-sites; do
  tar -tzf "$MIGRATION_BACKUP/${volume}.tar.gz" > /dev/null || break
done
sha256sum "$MIGRATION_BACKUP/"*.tar.gz > "$MIGRATION_BACKUP/SHA256SUMS"
docker start ces2-prod-db-integralces-1
docker start ces2-prod-integralces-1
```

Keep source cron disabled and notifications stopped.

## 4. Prepare images

Use the Docker image built in step 1. Preview and review oversized/unsupported files:

```sh
cd /opt/app.ces.community/komunitin
prepare_images() {
  docker run --rm \
    -v ces2-prod_integralces-sites:/sites \
    -v "$PWD/shared/cli/migration/ices/prepare-images.sh:/prepare-images.sh:ro" \
    ces2-migration-images "$@" /sites/default/files
}
prepare_images
```

```sh
prepare_images --apply
prepare_images
```

Resolve remaining oversized images (exit 1). The limit is 1,000,000 bytes.

## 5. Start new services

```sh
cd /opt/app.ces.community/komunitin
docker compose up -d db-auth db-social db-accounting db-notifications-ts db-notifications
docker compose logs --tail 20 db-auth db-social db-accounting db-notifications-ts
```

Once databases are ready:

```sh
docker compose run --rm --no-deps auth pnpm prisma migrate deploy
docker compose run --rm --no-deps social pnpm prisma migrate deploy
docker compose run --rm --no-deps accounting pnpm prisma migrate deploy
docker compose run --rm --no-deps notifications-ts pnpm prisma migrate deploy
docker compose up -d auth social accounting app
docker compose logs --tail 20 auth social accounting
```

Once services are ready:

```sh
migration_cli admin bootstrap
```

## 6. Export, import and check integrity

Enter the production community codes to migrate, separated by spaces. Do not run the old installation's `admin repair ices` fixes or rerun Accounting migration.

```sh
read -r -p 'Production community codes: ' MIGRATION_GROUP_CODES
mkdir -m 700 bundles-production
for code in $MIGRATION_GROUP_CODES; do
  migration_cli admin bundle ices \
    --url https://integralces.app.ces.community \
    --code "$code" --output "bundles-production/$code.zip" \
    > "bundles-production/$code-export.json" \
    2> "bundles-production/$code-export.log" || break
done
```

Review all export summaries/logs. Require one successful export per selected community. Before import, record source identity/member/post/category totals and Accounting account UUIDs, owners, balances and transfer counts for comparison. Reconcile any user activity since the backups and exports before retiring ICES.

```sh
for code in $MIGRATION_GROUP_CODES; do
  migration_cli admin migrate "bundles-production/$code.zip" || break
done
```

After importing:

- Require a completed import for every community; resolve each warning or document an accepted exclusion.
- Compare source/bundle/destination identities, members by status, offers/wants and categories; exclude the new superadmin from identity totals.
- Verify Auth/Social UUIDs, member ownership and Accounting links. Compare Accounting balances/history and notification history/subscriptions, accounting for live activity.
- Check destination images and resolve failed downloads.
- Test existing passwords, administrator access, multi-community users, disabled/pending members and wallet history.

## 7. Retire ICES and enable notifications

After the integrity checks pass:

```sh
docker stop ces2-prod-integralces-1 ces2-prod-db-integralces-1
docker rm ces2-prod-integralces-1 ces2-prod-db-integralces-1

cd /opt/app.ces.community/komunitin
./start.sh --up --public
docker compose logs --tail 30 auth social accounting notifications-ts
```

Test login and notifications, then check demo still works. Keep source volumes and backups.

## 8. Reinstall demo

```sh
cd /opt/ces2demo.community-exchange.org/komunitin
cp .env .env.before-auth-social
git switch master
git pull --ff-only origin master
nano .env
```

Merge the new settings from step 1, using demo credentials/S3 prefix and:

```dotenv
COMPOSE_PROJECT_NAME=ces2-demo
COMPOSE_FILE=compose.yml:compose.public.yml
KOMUNITIN_DOMAIN=ces2demo.community-exchange.org
KOMUNITIN_FLAVOR=ces
KOMUNITIN_AUTH_URL=https://auth.ces2demo.community-exchange.org
KOMUNITIN_SOCIAL_URL=https://social.ces2demo.community-exchange.org
KOMUNITIN_ACCOUNTING_URL=https://accounting.ces2demo.community-exchange.org
```

Set a nonempty `ADMIN_PASSWORD` and temporary-source `ICES_ADMIN_EMAIL`, `ICES_ADMIN_PASSWORD`, `ICES_MYSQL_PASSWORD`, `ICES_DATABASE_URL` as in the public template. Use available host ports (defaults 2029/3307). Set `ICES_PATH` if the checkout is not `../ices`.

Update the demo ICES checkout from master, then reinstall:

```sh
cd ../ices
git switch master
git pull --ff-only origin master

cd ../komunitin
docker compose config -q
./start.sh --up --public --demo
```

Test demo login, images and a transfer. Persist these environment settings in the demo redeployment configuration.

## Rollback

Stop production writers and reconcile activity since the backups before restoring any snapshot. Restore the five volume archives and the old checkouts/configuration from `$MIGRATION_BACKUP`. Restart the legacy stack only after restoring its matching databases.
