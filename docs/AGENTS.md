# Docs Agent Instructions

## Scope

`docs/` is the GitBook documentation for product overview, features, technology, and project pages.

## Structure

- `README.md` is the public overview page.
- `SUMMARY.md` is the GitBook table of contents. Update it when adding, moving, or renaming documentation pages.
- `features/` describes user-facing and admin-facing behavior, intended for community administrators.
- `technology/` describes implementation overview and API surfaces.
- `.gitbook/assets/` stores images referenced by the docs.

## Content Rules

- Keep user-facing terminology aligned with `../app/src/i18n/README.md`.
- When documenting notifications or newsletters, cross-check `../notifications-ts/src/notifications/README.md` and `../notifications-ts/src/newsletter/README.md`.
- Preserve GitBook front matter blocks and embed syntax when editing existing pages.

## Flavors

- Currently the documentation uses the default `komunitin` flavor for terminology.