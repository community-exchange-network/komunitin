# Repair ICES account links

`repair-ices-account-links.ts` updates existing `ExternalResource.href` values from
the supplied legacy accounting base URL to the accounting container's
`API_BASE_URL`. It only changes account links with a four-character currency code
and an account ID matching the stored ID. Cached data is preserved; the destination
account does not need to exist yet.

Deploy an accounting image containing the script and the import fix first. From
the repository root on the host, preview the changes:

```sh
docker compose exec -T accounting pnpm exec tsx scripts/repair-ices-account-links.ts \
  --source https://ices.example.org/ces/api/accounting
```

Replace the source with the exact legacy accounting base URL stored in the links.
Use the same Compose files, project name and environment file as your running
deployment (for example, `docker compose -f compose.yml -f compose.public.yml exec ...`).
The script uses the container's `DATABASE_URL` and `API_BASE_URL`.

Check the destination URL, per-tenant counts and sample links, then apply:

```sh
docker compose exec -T accounting pnpm exec tsx scripts/repair-ices-account-links.ts \
  --source https://ices.example.org/ces/api/accounting --apply
```

Re-run the preview to confirm no matching links remain. Unexpected paths or IDs
are skipped and counted. Updates commit per tenant; if a later tenant fails,
earlier commits remain and the command can safely be re-run. Links changed
concurrently are left untouched and counted separately. No rollback manifest is
created.
