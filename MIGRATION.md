# ICES → Auth/Social migration TODO

Run from the new Komunitin repository root. The [public stack](README.md#public-deployment) must be running with the existing/restored Accounting data. Do not rerun Accounting migration or reset its database.

Pause ICES writes/cron, back up its database and uploads, and keep its API/files reachable until import finishes. Keep notification delivery disabled during import. Reuse the root `.env`:

- Source: `ICES_DATABASE_URL`, `ICES_ADMIN_EMAIL`, `ICES_ADMIN_PASSWORD` (ICES administrator).
- Destination: `KOMUNITIN_AUTH_URL`, `KOMUNITIN_SOCIAL_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (a dedicated superadmin absent from ICES).
- Accounting repairs use the destination container's existing configuration.

## 1. Prepare source images

Run on the machine holding the uploads. Requires Bash, ImageMagick 6/7, `file` and GNU coreutils/findutils.

```sh
sudo apt-get install imagemagick file
ICES_FILES=/path/to/komunitin-deploy/ices/drupal/sites/default/files
bash shared/cli/migration/ices/prepare-images.sh "$ICES_FILES"
sudo bash shared/cli/migration/ices/prepare-images.sh --apply "$ICES_FILES"
```

The script includes subdirectories, including `styles`. It leaves files ≤1,000,000 bytes unchanged. Unsupported files/animations are reported intact; exit 1 means some oversized files were not processed.

## 2. Repair ICES records

Uses the same `ICES_DATABASE_URL` as bundle generation; apply requires UPDATE access to `ces_account` and `ces_accountuser`.

```sh
./shared/cli/komunitin admin repair ices
./shared/cli/komunitin admin repair ices --apply
```

This fixes XLCC0004's owner privilege and COOP2369's pending state. COOP2369's absence from Accounting was established in the reviewed dump; this command cannot recheck live Accounting.

## 3. Repair destination Accounting references

Copy the private [owner manifest](tmp/accounting-owner-repairs.json) to `tmp/accounting-owner-repairs.json` in the executing checkout. It covers SNGS0019, XLCC0003 and XLCC0013.

```sh
docker compose cp tmp/accounting-owner-repairs.json accounting:/tmp/accounting-owner-repairs.json
docker compose exec -T accounting pnpm exec tsx scripts/repair-account-owners.ts --input /tmp/accounting-owner-repairs.json
docker compose exec -T accounting pnpm exec tsx scripts/repair-account-owners.ts --input /tmp/accounting-owner-repairs.json --apply
docker compose exec -T accounting pnpm exec tsx scripts/repair-ices-account-links.ts --source https://integralces.net/ces/api/accounting
docker compose exec -T accounting pnpm exec tsx scripts/repair-ices-account-links.ts --source https://integralces.net/ces/api/accounting --apply
```

## 4. Optional source database query caching

Cache tuning is not required for migration. On a small VPS, leave `innodb_buffer_pool_size` unchanged. A 1 GiB buffer pool plus a 128 MiB query cache needs 1,152 MiB before other MariaDB allocations, PHP, the OS and other services. Size against available memory and any container limit; see [MariaDB memory allocation](https://mariadb.com/docs/server/ha-and-performance/mariadb-memory-allocation).

Check `free -h` and, for containers, `docker stats --no-stream` on the source host. Connect to the source MariaDB server identified by `ICES_DATABASE_URL` and record its current settings before changing them:

```sql
SELECT VERSION(), @@GLOBAL.innodb_buffer_pool_size,
       @@GLOBAL.query_cache_size, @@GLOBAL.query_cache_type;
```

If caching is currently disabled and memory headroom allows it, a small 16 MiB trial may help repeated identical API queries. As a database administrator:

```sql
SET GLOBAL query_cache_size = 16777216;
SET GLOBAL query_cache_type = 1;
```

Reconnect the ICES web/PHP database sessions after enabling caching. If MariaDB reports that caching cannot be enabled at runtime, skip this optional step. Monitor memory and export time; skip tuning if memory is tight. Restore the recorded settings after export and reconnect PHP sessions again. Runtime settings also revert to the startup configuration when MariaDB restarts. See [query cache behavior](https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/buffers-caches-and-threads/query-cache).

## 5. Generate fresh bundles

Use an unused private output directory. These are the 19 active groups in the reviewed snapshot, ordered HORA first. `--all` also includes inactive groups.

```sh
umask 077
MIGRATION_GROUP_CODES='HORA CBA3 COOP CUFC ECOS FGTM FLOC GOTA GREE GRTX HERA NGI1 SNGS SUDO TEST TIME UCAS XLCC ZOQT'
mkdir -m 700 bundles-test
for code in $MIGRATION_GROUP_CODES; do
  ./shared/cli/komunitin admin bundle ices --url https://integralces.net --code "$code" --output "bundles-test/$code.zip" || exit 1
done
```

Generic data sanitization is automatic. Bundles contain password hashes; keep them private.

## 6. Import and verify

After all 19 exports succeed, run in the same shell against one destination:

```sh
for code in $MIGRATION_GROUP_CODES; do
  ./shared/cli/komunitin admin migrate "bundles-test/$code.zip" || exit 1
done
```

Require all 19 imports to complete. Unsupported documents and broken image downloads are expected warnings and do not require manual repair.

Before enabling user access, verify representative logins, profiles/posts and wallet links: HORA, XLCC0004, SNGS0019 and pending COOP2369. For the unchanged reviewed snapshot, expected totals are 5,624 migrated identities (excluding the superadmin), 5,939 members, 5,892 posts and 224 categories. Then enable notification delivery and user access.
