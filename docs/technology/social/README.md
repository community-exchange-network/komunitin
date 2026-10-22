# Social

The social service manages communities, member profiles, offers, needs and categories. It provides the marketplace [API](api/README.md) used by the app. The source is in the [social folder](https://github.com/komunitin/komunitin/tree/master/social).

## Data and community isolation

The service uses TypeScript, Node.js and Express, with Prisma and PostgreSQL for data storage. Each community is a tenant, identified by its community code.

PostgreSQL row-level security (RLS) keeps queries within the current tenant, so communities can share a database while keeping their data separate. Explicit privileged operations support cross-community features such as listing communities. The service also checks resource visibility, ownership and community roles: tenant isolation and permission checks work together.

## Search and distance

The PostgreSQL `pg_trgm` extension supports text search by comparing similar words in normalized names and descriptions. Results can be ranked by relevance.

The PostGIS extension stores geographic locations and supports ordering communities, members, offers and needs by distance from a supplied point.

## Files

Images and other uploaded files are stored in S3-compatible object storage. PostgreSQL keeps file metadata and links to the resources that use them. The service validates uploads and cleans up unused files. Marketplace images are served through public URLs; resource privacy settings do not make those URLs private.

## Other services

The [auth service](../auth/README.md) owns login credentials and issues access tokens. Social stores the links between users and member profiles, along with community roles and preferences.

The [accounting service](../accounting/README.md) manages currencies, accounts and transfers. Social coordinates currency and account creation as communities and members are activated. It sends social events to the [notifications service](../notifications.md) for member messages and community updates.
