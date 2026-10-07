# ICES migration tools

Follow the ordered commands in [MIGRATION.md](../../../../MIGRATION.md).

- `prepare-images.sh [--apply] DIRECTORY`: prepare source uploads.
- `komunitin admin repair ices [--apply]`: repair the two reviewed ICES records.
- `komunitin admin bundle ices --url URL --code CODE --output CODE.zip`: generate a validated Auth/Social bundle using the root `.env`.

For the CSV contract, see [FORMAT.md](../../../migration/FORMAT.md). For generic imports, see the [Social migration guide](../../../../social/src/features/migrations/README.md).

Development checks, from `shared/cli/`:

```sh
pnpm typecheck
pnpm test
```

The HTTP fixture tests legacy filtering, pagination, auth, field mapping, ZIP validation and failures without a database. For a live smoke test, export a community from an isolated, externally managed ICES instance with existing Accounting data, using a small page size. The Komunitin startup script seeds its own CSV demo and no longer provisions an ICES source.
