# API

The Social API provides access to communities, member profiles, offers, needs, categories and member preferences. Currencies, accounts and transfers are handled by the separate [Accounting API](../../accounting/api/README.md).

The [OpenAPI source](https://github.com/komunitin/komunitin/blob/master/social/openapi.yml) lives alongside the service code. Browse it using Swagger:

{% embed url="https://petstore.swagger.io/?url=https://raw.githubusercontent.com/komunitin/komunitin/refs/heads/master/social/openapi.yml" %}

## Format and resources

The marketplace endpoints use JSON:API 1.1, with `application/vnd.api+json` request and response bodies. Resources have a UUID `id`, a `type`, attributes and relationships. Clients should follow response links and use UUIDs as stable identifiers.

Most endpoints start with a community code, for example `/{code}/members`. The main resources are:

* **Communities**: listed at `/groups`, with details and settings under `/{code}`. Each community links to its currency in Accounting.
* **Members**: profiles linked to community currency accounts.
* **Offers and needs**: both use `/{code}/posts`, with the resource type `offers` or `needs`. Each publication belongs to a member and can have a category.
* **Categories**: community-specific categories for offers and needs.
* **Users**: social records linked to Auth identities. `/users/me` returns the current user and `/users/{id}/members` lists their member profiles across communities.
* **Member-user links**: connect users to member profiles and store their notification and email preferences.

Contact details are attributes of communities and members. Locations use GeoJSON points with coordinates in longitude, latitude order. Dates use RFC 3339 timestamps.

## Search, filtering and ordering

Collection endpoints accept supported `filter`, `sort`, `page` and `include` parameters. The specification lists the fields available on each endpoint.

* `filter[search]` searches text using trigram word similarity. Search results are ordered by relevance unless an explicit sort is supplied.
* Filters such as `filter[category]` and `filter[member]` narrow the posts collection. `filter[type]=offers` selects offers and `filter[type]=needs` selects needs.
* Date comparisons use `filter[field][operator]=value`, with `gt`, `gte`, `lt` or `lte`. Posts support `created` and `expires`; members support `created`. Multiple comparisons are combined with `AND`.
* `sort=-created` puts newer resources first. `sort=distance&near=longitude,latitude` puts nearby resources first on collections that support location ordering.

Pagination uses `page[size]` (up to 200) and a numeric offset in `page[after]`. Responses include pagination links and the total count in `meta.count`. Follow those links to request further pages.

The `include` parameter loads supported to-one relationships, including selected nested relationships. To-many relationships provide links to their collections instead.

## Access and privacy

The `access` attribute has three values:

* `public`: visible without signing in, subject to community visibility and resource status.
* `group`: community visibility, with full profiles and publications available to active members of the same community.
* `private`: profiles and publications are restricted to their owners, administrators and authorized service access.

Ownership, community roles and lifecycle status also affect access. Draft, hidden and expired publications are not part of the marketplace visible to other members. Community settings control anonymous access to member lists, and member responses may contain only a minimal profile when full access is unavailable.

Public reads do not require a token. Authenticated reads require `social:read` and writes require `social:write`, together with the relevant resource permissions. See [authentication and authorization](../../auth/README.md) for login and inter-service tokens.

## Files and other services

`POST /{code}/files/upload` accepts a multipart image upload and its resource type. The service stores the file in S3-compatible storage and returns a file resource with a URL to use in a profile or publication. These image URLs are public; they do not inherit the visibility of the resource that uses them.

Relationships to currencies and accounts point to the Accounting API. Login credentials and email actions belong to Auth. Social also exposes a token-based newsletter unsubscribe endpoint and administrator-only import endpoints; their formats are described in the specification.
