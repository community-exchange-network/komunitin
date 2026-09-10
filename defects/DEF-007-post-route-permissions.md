# DEF-007 — Guard post edit pages

**P3 · SMK-017 · Implemented**

## Decision

Keep the fix at the edit pages. Load the requested post, check ownership or administration, and redirect to the existing 404 route before mounting an unauthorized editor. Do not introduce a permission framework, a new denial page, or refactor public detail pages and map rendering.

## Implementation

- Share a small post permission check: selected member ownership, selected community administration only when the route community matches, or superadmin.
- Both editors check access before applying query parameters or assigning form data. NotFound and Forbidden produce `/404` without a duplicate error toast. Unexpected load errors still reach the global handler.
- Watch the route identifiers, clear the old editor while loading, and ignore a load after navigation or unmount.
- The offer editor loads and passes the target community’s currency. This preserves superadmin editing without a personal membership and prevents the form from reading an absent personal currency. Creation retains its existing currency behavior.
- Server authorization and public detail/card controls are unchanged. Broader membership selection and detail-cache/map work are outside this scoped fix.

## Verification

- 12 edit-route interaction tests pass for both post types: owner, unrelated identity without membership, other-community admin, target-community admin, superadmin, and missing resource. Unauthorized routes mount no form and send no PATCH; authorized editors display Save, and offer currency symbols resolve.
- Existing Offers and Needs suites pass (11 tests), including owner deletion.
- Social post HTTP suite passes (46 tests), preserving server permission enforcement.
- App lint and production PWA build pass.
- Real-service browser smoke verification was not performed.
