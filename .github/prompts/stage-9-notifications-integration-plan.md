# Stage 9: Notifications Integration Plan

## Objective

Notifications accepts user JWTs issued by the new Auth service, consumes Auth,
Social, and Accounting through their current service APIs, emits only
purpose-bound public links, and no longer depends on IntegralCES identifiers,
routes, payloads, or authorization behavior.

Stage 9 is a strict service-boundary migration. It is not a second
implementation of work already present, nor the complete end-to-end migration
verification covered by Stage 13.

## Current State and Recommended Scope

| Area | Current reality | Stage 9 action |
| --- | --- | --- |
| Browser Notifications API | Still accepts legacy issuer prefixes and numeric Drupal identities | Require scoped Auth JWTs and UUID user subjects |
| Event ingestion | `/events` uses shared Basic credentials | Replace Basic auth with `notifications:write` service tokens and an approved publisher subject check |
| Outbound service token | Client credentials and exact scopes already exist | Retain, centralize, and test |
| Auth action links | `/action-token` and purpose mappings already exist | Verify and harden rather than reimplement |
| Frontend action pages | `/confirm-email`, `/set-password`, and `/unsubscribe` already exist | Boundary-test them; do not rebuild them in Stage 9 |
| Social integration | Routes, resource shapes, admins, membership, and filters are stale | Make this the principal implementation work |
| Accounting integration | Mostly current | Fix transfer-state filtering and pagination |
| Unsubscribe | Purpose-bound, but generic 24-hour and single-use semantics are unsuitable | Add a long-lived, replayable policy and make the mutation idempotent |
| End-to-end journeys | Covered again in Stage 13 | Keep Stage 9 to service boundaries; leave complete journeys and reliability to Stage 13 |

The Stage 9 verification sentence in the main migration plan should not refer
generically to "new event tokens." The user-facing Notifications API accepts
scoped Auth user JWTs, while `/events` accepts scoped Auth service JWTs with a
stricter publisher-subject policy.

Recommended replacement:

> Notifications' user-facing API accepts new Auth user JWTs, and its service
> event endpoint accepts canonical events from approved migrated services using
> scoped Auth service tokens.

## Decisions and Challenges to the Main Migration Plan

### Add `notifications:read` and `notifications:write`

Notifications should follow the resource-scope model already used by Social and
Accounting.

- `notifications:read` authorizes a regular app user to list their own
  notifications.
- `notifications:write` authorizes a regular app user to mark their own
  notifications as read and manage their own push subscriptions.
- `notifications:write` also authorizes trusted services to publish events, but
  scope alone is not sufficient for `/events`.

Auth should grant both scopes to `komunitin-app`. Notifications must still
require an app client identity, a canonical UUID subject, and exact resource
ownership on user-facing routes.

Auth should grant only `notifications:write` to the Auth, Social, and Accounting
publisher clients. The Notifications service itself does not need either scope
because it does not call its own API.

### Require an Approved Service Subject on `/events`

An app user also has `notifications:write`, so checking only the scope would
allow an app token to reach event publication. `/events` must require all of:

- Exact Auth issuer, audience, signature, and expiry validation.
- The `notifications:write` scope.
- A client-credentials token whose `sub` equals its `client_id` (Same pattern to the isService context flag already present in Social).

Auth, Social, and Accounting should replace their shared Basic credentials with
cached client-credentials tokens. This gives each publisher a separately
revocable identity while keeping authorization centralized in Auth.

### Give Unsubscribe Tokens Purpose-Specific Semantics

Auth currently gives all action tokens a 24-hour TTL, replaces an earlier
pending token on creation, and consumes all other pending tokens of the same
purpose.

This creates two problems:

- Sending a new newsletter invalidates unsubscribe links in older newsletters.
- Auth consumes the token before Social changes the preference. If the Social
  operation fails, the unsubscribe cannot be retried.

Recommended behavior:

- Keep password reset, verification, and email-change tokens short-lived and
  replacement-based.
- Give unsubscribe tokens a lifetime at least as long as retained newsletters.
  Use one year if there is no existing product policy.
- Allow multiple unsubscribe tokens for a user.
- Do not consume unsubscribe tokens. Resolve them idempotently and keep them
  usable until expiry so Social can retry after a partial failure.
- Use the same recipient token for the application status/result flow and the
  RFC 8058 direct POST.
- Make the Social preference mutation idempotent and return success when the
  user is already unsubscribed.
- Delete expired unsubscribe records opportunistically or through the existing
  cleanup mechanism.

This treats unsubscribe as a replay-safe, purpose-bound capability while
keeping password and email actions single-use.

### Add Allowlisted Generic Comparison Filters to Social

Social already centralizes collection parsing and SQL generation and uses
endpoint-specific allowlists for equality filters and sort fields. Extend that
design with generic comparison operators rather than making Notifications scan
sorted pages and apply date boundaries locally.

Support the nested syntax `filter[field][operator]=value` for:

- `gt`
- `gte`
- `lt`
- `lte`

The mechanism is generic, but its public exposure is not. Each route must
explicitly allow a comparison field and provide its value schema. Stage 9
should enable only:

- `created` and `expires` on posts.
- `created` on members.

Parse RFC 3339 date values into `Date` objects before building SQL. Keep
comparison conditions separate from existing equality filters internally so
special filters such as `search` and `expired` retain their current shapes and
behavior. Combine multiple comparison conditions with `AND`.

The SQL builder must map validated operator names through a fixed internal
table, resolve fields only through the endpoint's SQL column map, and
parameterize every value. Unknown fields, unknown operators, malformed dates,
arrays, and mixed flat/nested values must return `400`.

Use the canonical Social field name `expires`; do not add an `expire`
compatibility alias for Notifications' stale query. This remains a controlled
public API addition rather than an unrestricted query language.

### Keep Types Local Instead of Building a Shared SDK

The Notifications client is stale, but a generated or shared SDK would turn
Stage 9 into a broader repository architecture project. Keep
Notifications-local types contract-faithful and refactor only enough to remove
duplication in authenticated requests and pagination.

## Phase 0: Codify the Boundary and Stabilize the Baseline

**Status: Done.**

1. Update Stage 9 in `social-auth-migration-plan.md`:

   - Mark client credentials, action-token purposes, frontend pages, and RFC
     headers as present work that must be verified and hardened.
   - Correct the event-token wording.
   - Add the missing Social resource-shape, pagination, membership, and filter
     work.
   - Document the allowlisted Social comparison-filter syntax and fields.
   - Document the `notifications:read` and `notifications:write` route matrix
     and the approved event-publisher subjects.
   - Document the unsubscribe lifetime and replayable one-token decision.
   - State explicitly that full journeys and exactly-once behavior remain in
     Stage 13.

2. Make Notifications tests deterministic before changing behavior.

Current baseline:

- `pnpm typecheck` passes.
- Focused test files pass.
- The complete suite passes serially: 163 of 163 tests.
- The default parallel run fails at file level in ten files, while those files
  pass independently. This is consistent with shared ports or process-level
  fixtures.

Set the Notifications test command to run with
`--test-concurrency=1`. Test-resource isolation can be optimized separately.

### Acceptance

- Typecheck and the complete serial test suite provide a clean baseline.
- The main migration document accurately describes the real boundaries.

## Phase 1: Enforce Scoped Auth and Remove Legacy Inbound Compatibility

**Status: Done.**

1. Add the scopes and publisher clients in Auth:

   - Add `notifications:read` and `notifications:write` to the recognized API
     scopes.
   - Allow `komunitin-app` to request both scopes.
   - Allow `komunitin-social` to request `notifications:write`.
   - Register confidential `komunitin-auth` and `komunitin-accounting` clients
     that can request only `notifications:write`.
   - Add their secrets to validated configuration, environment templates,
     Compose, and deployment secrets.
   - Do not add Notifications scopes to the `komunitin-notifications` client.

2. Add both scopes to the app's requested token scopes. Plan the production
   rollout around existing refresh tokens, which must not silently gain a new
   scope:

   - Force a new login when scope enforcement is enabled, or
   - Keep a short, explicit compatibility window until active sessions have
     renewed.

3. Replace issuer-prefix matching with standard exact JWT verification:

   - Exact `iss`.
   - One configured audience: `urn:komunitin:api`.
   - Configured Auth JWKS URL.
   - Signature and expiry validation.
   - Parsed `scope`, `sub`, and `client_id` claims.

4. Add route-specific scope and identity enforcement:

   - `GET /:code/notifications` requires `notifications:read`.
   - Mark-read and subscription mutation routes require
     `notifications:write`.
   - User routes require `client_id === "komunitin-app"` and a canonical UUID
     `sub`.
   - User routes enforce exact ownership after authentication.
   - `/events` requires `notifications:write`, `sub === client_id`.

5. Remove legacy defaults from production-facing configuration:

   - No `https://komunitin.org` issuer fallback.
   - No comma-separated legacy audience.
   - No legacy public JWKS fallback.
   - Fail at startup when required Auth values are missing.

6. Delete numeric-user compatibility:

   - Remove `USER_ID_FIXED_PREFIX`.
   - Remove database lookups that translate numeric Drupal IDs.
   - Replace nullable user extraction with a non-null authenticated UUID.
   - Compare authenticated and requested user IDs directly.

7. Update all user-facing Notifications controllers:

   - List and read operations must not silently return an empty result for an
     unrecognized legacy identity.
   - Subscription ownership uses exact UUID equality.
   - Service-token subjects are rejected from user endpoints by the client and
     subject checks.

8. Replace event publisher Basic authentication:

   - Give Auth, Social, and Accounting a small cached client-credentials token
     provider requesting exactly `notifications:write`.
   - Send `Authorization: Bearer <token>` to `/events`.
   - Retry once with a refreshed token after `401`.
   - Remove publisher usernames, passwords, Basic-auth construction, and their
     environment variables after the rollout window.

9. Tighten the event HTTP schema:

   - Require UUID user, member, post, transfer, account, payer, and payee
     identifiers where applicable.
   - Keep group codes as codes.
   - Use discriminated event schemas instead of broad strings plus handler
     casts.
   - Restrict the public `/events` union to events emitted by Auth, Social, and
     Accounting. Scheduled and synthetic events should continue to enter
     through internal functions rather than HTTP.

### Tests

- Accept an app JWT with the new exact issuer, audience, UUID subject, and
  route-appropriate scope.
- Reject issuer prefixes, old audiences, numeric subjects, missing subjects,
  missing scopes, and service-client subjects on user routes.
- Reject a requested user different from the token subject.
- Accept `/events` from each approved service subject with
  `notifications:write`.
- Reject `/events` from an app subject, an unapproved service subject, a token
  without `notifications:write`, and a token whose `sub` differs from
  `client_id`.
- Reject events containing legacy numeric resource IDs.
- Remove the Basic-auth event-ingestion tests.

## Phase 2: Consolidate Outbound Auth Authentication

1. Retain the existing client-credentials flow and exact scope set:

   - `email`
   - `social:read`
   - `accounting:read`

   These are the scopes used by Notifications when calling other services.
   Notifications must not request `notifications:read` or
   `notifications:write` for itself.

2. Extract one small authenticated-request helper used by both the Komunitin
   API client and action-token requests.

3. The helper should:

   - Reuse the cached token.
   - Deduplicate concurrent refreshes.
   - Refresh before expiry.
   - On one `401`, force-refresh and retry exactly once.
   - Report the destination service, status, and safe response context on
     failure.

4. Keep action-token request types discriminated:

   - `passwordReset`
   - `emailVerification`
   - `emailChange`
   - `unsubscribe`

5. Preserve the current event mapping:

   - Password reset to `passwordReset`.
   - Initial validation or signup to `emailVerification`.
   - Address change to `emailChange`, including the target email.

6. Remove any remaining legacy auth-code terminology from code, mocks, tests,
   and snapshots.

### Tests

- Assert the exact token request scopes.
- Test caching, concurrent refresh, and one-time `401` retry.
- Assert every purpose-specific `/action-token` body.
- Verify that no request is made to a legacy get-auth-code endpoint.

## Phase 3: Correct Unsubscribe Resolution and Delivery

1. Add purpose-specific action-token policy in Auth:

   - Existing semantics remain unchanged for password and email actions.
   - Unsubscribe receives the long-lived TTL.
   - Creating an unsubscribe token does not delete other unsubscribe tokens.
   - Resolving an unsubscribe token validates its purpose and expiry but does
     not consume it.
   - Repeated resolution returns the same user identity until expiry.
   - Expired records are cleaned safely.

2. Request one unsubscribe token when constructing a newsletter recipient:

   - `unsubscribeToken`

3. Carry that meaning explicitly through newsletter types rather than a
   generic `token` field.

4. Build links as follows:

   - Email body:
     `/unsubscribe?token=<unsubscribeToken>` on the public application.
   - `List-Unsubscribe`:
     `/users/unsubscribe?token=<unsubscribeToken>` on the public Social
     service.
   - `List-Unsubscribe-Post`:
     `List-Unsubscribe=One-Click`.

5. Keep Social as the mutation owner:

   - Social resolves the Auth token.
   - Social sets the user's group email preference to `never`.
   - Repeating the operation for an already-unsubscribed user returns success.
   - Notifications never edits Social data directly.

### Tests

- A new newsletter does not invalidate an earlier unsubscribe token.
- The same token works through the RFC endpoint and the application flow.
- Repeating either flow succeeds idempotently.
- An injected failure after Auth resolution can be retried with the same token.
- Resolving one newsletter's token does not invalidate another newsletter's
  token or alter settings other than the group email preference.
- Wrong-purpose and expired tokens fail.
- Both URLs and both mail headers are asserted semantically before snapshots
  are updated.

## Phase 4: Add Allowlisted Comparison Filters to Social

1. Extend Social's shared collection request contract:

   - Add `gt`, `gte`, `lt`, and `lte` as the complete comparison operator set.
   - Parse `filter[field][operator]` independently from existing flat equality
     filters.
   - Store normalized comparison conditions separately from equality filters
     in collection parameters.
   - Let each route allow comparison fields with a value schema rather than
     accepting arbitrary sortable or database fields.
   - Use an RFC 3339 date schema for the Stage 9 fields and convert successful
     values to `Date`.
   - Combine comparisons on the same or different fields with `AND`.

2. Extend Social's shared raw-SQL collection query:

   - Map validated operators to fixed SQL fragments:
     `gt` to `>`, `gte` to `>=`, `lt` to `<`, and `lte` to `<=`.
   - Resolve fields through the existing per-resource SQL column map.
   - Parameterize comparison values.
   - Apply comparisons with visibility, equality, search, count, sorting, and
     pagination in the same database query.
   - Preserve normal SQL null behavior; nullable `expires` values do not match
     a date comparison.

3. Enable only the fields needed by Notifications:

   - Posts: `created` and `expires`.
   - Members: `created`.
   - Do not enable comparisons on groups, categories, users, strings, UUIDs, or
     every sortable field merely because the generic mechanism exists.
   - Do not accept the stale singular field `expire`.

4. Document the syntax, supported operators, enabled fields, `AND` semantics,
   date format, and `400` behavior in the Social API documentation.

5. Keep index work evidence-based:

   - The existing tenant/expiry post index already supports expiry filtering.
   - Comparison-filter correctness does not require a migration.
   - Inspect representative query plans before adding tenant/created indexes
     for posts or members as a separate performance optimization.

### Tests

- Parse multiple comparison operators alongside existing equality filters.
- Reject unknown comparison fields and operators, malformed dates,
  comma-separated comparison values, and mixed equality/comparison shapes.
- Verify posts honor strict and inclusive creation and expiration boundaries,
  exclude null expirations from date comparisons, preserve visibility rules,
  and return the filtered `meta.count`.
- Verify members combine `filter[created][gt]` with
  `filter[status]=active`.
- Run Social typecheck, focused request/post/member tests, and the complete
  Social test suite.

### Acceptance

- Social supports:
  - `filter[created][gt]` on post and member collections.
  - `filter[expires][lt]` on post collections.
- Unsupported comparison fields, operators, and values fail with `400`.
- Existing equality, search, expired, visibility, sorting, and pagination
  behavior remains unchanged.
- No database migration or unrestricted comparison surface is introduced.

## Phase 5: Migrate Social and Accounting Client Contracts

### Social Routes

Replace:

- `/:code/offers`
- `/:code/offers/:id`
- `/:code/needs`
- `/:code/needs/:id`

With:

- `/:code/posts?filter[type]=offers`
- `/:code/posts?filter[type]=needs`
- `/:code/posts/:id`

Add:

- `/:code/admins`
- Explicit `filter[status]` on scheduled collection reads.
- `filter[created][gt]` for digest posts and recently created members.
- `filter[expires][lt]` for upcoming post expiration.
- Existing `/users?filter[members]=...&include=settings` for member-to-user
  lookup.

Use `expires`, not `expire`, in Notifications request parameters. Keep the
comparison keys explicit in Notifications-local request types or helpers so
the stale singular spelling cannot reappear.

### Resource Types

Update Notifications-local types to the current Social JSON:API contract:

- Posts use `title` and `description`, not `name` and `content`.
- Images are `{ url, alt? }`, not strings.
- `expires` is nullable.
- Group and member images are nullable image objects.
- Group admins are exposed through the admins endpoint or link, not embedded
  `relationships.admins.data`.
- Users do not contain a `members` relationship.

Do not add compatibility unions such as `string | Image`. Update callers to the
new contract directly, using a small `imageUrl()` presentation helper only if
it removes meaningful repetition.

### Membership Ownership

Digest selection currently infers membership from a nonexistent user
relationship. Replace it with an explicit index derived from
`MemberWithUsers` results:

```text
Map<UserId, Set<MemberId>>
```

Use that index to decide which posts belong to each recipient. Do not restore
or synthesize a legacy `user.relationships.members` shape.

### Pagination

Social and Accounting generate pagination links using their public base URL,
while Notifications may reach them through Docker service names. Following
`links.next` verbatim can leave the internal network or incorrectly hit
localhost.

Change pagination so it:

- Parses `links.next`.
- Retains its path and query.
- Rebuilds the URL using the configured internal service origin.
- Never follows an arbitrary origin supplied by a response.
- Uses `page[size]=200` unless a caller needs a smaller page.

Add a multipage test where `links.next` contains a public origin and assert that
the second request uses the configured internal origin.

### Accounting

Keep the current Accounting endpoints, but stop relying on unsupported
`filter[state]=committed`.

- Query using supported account and date filters.
- Filter returned transfers to `attributes.state === "committed"` before
  newsletter totals and summaries are calculated.
- Reuse the service-pinned pagination implementation.

Adding an Accounting state filter is reasonable later, but unnecessary to
complete Stage 9.

## Phase 6: Update Enrichment, Scheduled Jobs, and Presentation

Use only supported filters:

| Workflow | Server-side query | Local boundary |
| --- | --- | --- |
| Newsletter groups | `filter[status]=active` | None |
| Newsletter members | `filter[status]=active` | None |
| Current offers and needs | Type, `status=published`, `expired=false` | Render the canonical fields |
| Digest posts | Type, `status=published`, `expired=false`, `filter[created][gt]=<cutoff>`, `sort=-created` | Exclude urgent posts and select recipients |
| Recently created members | `status=active`, `filter[created][gt]=<cutoff>`, `sort=-created` | None |
| Upcoming expiration | Type, `status=published`, `expired=false`, `filter[expires][lt]=<horizon>`, `sort=expires` | Schedule notifications |
| Already expired offers | Offers, member, `status=published`, `expired=true` | None |

Then update each consumer:

1. Newsletter processing:

   - Use post `title` and `description`.
   - Render `image.url`.
   - Include only committed transfers.
   - Use active groups and members and published posts.

2. Digest generation:

   - Use the explicit user/member ownership index.
   - Send the lookback cutoff through `filter[created][gt]`.
   - Do not expect member relationships on user resources.

3. Expiration jobs:

   - Treat `expires: null` as non-expiring.
   - Use supported expired, status, and `filter[expires][lt]` filters.
   - Preserve the nullable Social type and narrow before scheduling even though
     the comparison predicate excludes null values.

4. Immediate post handlers:

   - Fetch `/:code/posts/:id?include=member`.
   - Validate that the returned resource type matches the event.

5. Admin recipients:

   - Fetch `/:code/admins`, followed by user settings as needed.
   - Fetch admins for `GroupActivated` and `MemberRequested`.
   - Do not fetch group admins for `GroupRequested`, because that email goes to
     the configured `ADMIN_EMAIL`.

6. Email and push presenters:

   - Use current title and description fields.
   - Convert image objects at the presentation boundary.
   - Preserve the existing public application routes.

## Phase 8: Hardcode client ids and remove CLIENT_ID env vars
   - Remove `CLIENT_ID`s vars from services. They should be hardcoded in the service code and not configurable.
   - However, they should be defined in a single place in each service, and not scattered throughout the codebase as strings.

## Phase 7: Replace Permissive Mocks with Contract Mocks

1. Rewrite mock factories with:

   - UUID identifiers.
   - Post `title` and `description`.
   - Image objects.
   - Nullable expirations.
   - Admin links and metadata.
   - Users without member relationships.
   - A separate membership/user join fixture.

2. Replace `/offers` and `/needs` mock handlers with `/posts`.

3. Implement strict handlers for:

   - Posts and post filters, including creation and expiration comparisons.
   - Admins.
   - User settings and member-user filtering.
   - Auth client token, publisher token, and action-token bodies.
   - Accounting filters and pagination.

4. Make mocks reject:

   - Unsupported routes.
   - Unsupported filters.
   - Unsupported comparison fields, operators, and values.
   - Unexpected scopes or purposes.
   - Unhandled requests to internal service hosts.

5. Keep external test-server bypasses explicit rather than globally permitting
   unhandled traffic.

6. Update snapshots only after behavioral assertions cover recipients, URLs,
   headers, titles, images, and transfer totals.

## Real-Stack Verification

Run a controlled stack smoke test without IntegralCES:

1. Start Auth, Social, Accounting, Notifications, their databases and Redis,
   and a captured or test SMTP service.

2. Obtain a real user token from Auth and verify:

   - A token with `notifications:read` can list notifications.
   - A token with `notifications:write` can mark the user's notifications as
     read and manage the user's subscriptions.
   - Missing and incorrect scopes are rejected.
   - Subscription endpoints enforce exact ownership.
   - A legacy issuer, audience, or numeric subject is rejected.

3. Let Notifications obtain its outbound service token and call:

   - Social groups, members, posts, users/settings, and admins.
   - Social post/member comparison filters with representative boundary dates.
   - Accounting account, transfer, currency, and statistics endpoints.
   - Auth `/action-token`.

4. Obtain `notifications:write` client-credentials tokens for Auth, Social, and
   Accounting. Submit representative events using each publisher's Bearer
   token:

   - Password reset.
   - Verification and email change.
   - Group activated.
   - Member requested.
   - Offer and need published.
   - Transfer committed.

5. Verify that `/events` rejects an app token, an unapproved service subject,
   and a service token without `notifications:write`.

6. Inspect captured email and push payloads:

   - Correct recipients.
   - Current post fields and images.
   - Correct application CTA routes.
   - No legacy auth or session code.
   - Correct unsubscribe page and RFC URLs.

7. Exercise the unsubscribe token through both paths:

   - POST it directly to Social through the one-click flow.
   - Use it through the application flow afterward.
   - Repeat the request after a simulated mutation failure.
   - Verify the Social preference is `never`.

8. Confirm through configuration and request logs that:

   - Notifications made no request to IntegralCES or port 2029.
   - Event publishers made no Basic-auth request.

## Definition of Done

Stage 9 is complete when:

- No legacy issuer-prefix or numeric-user compatibility remains.
- User routes require the appropriate Notifications scope, an app client, a
  UUID subject, and exact ownership.
- `/events` requires `notifications:write`, a client-credentials subject from
  the approved publisher set, and canonical event identifiers.
- Auth, Social, and Accounting publish with independently identifiable Auth
  service tokens; no event Basic credentials remain.
- All outbound calls use new Auth client credentials with the exact scopes.
- No legacy `/offers`, `/needs`, get-auth-code, or embedded-admin assumptions
  remain.
- All scheduled jobs use allowlisted Social equality and comparison filters
  with canonical resource shapes and field names.
- Pagination stays on configured internal service origins.
- Newsletter accounting excludes non-committed transfers.
- Unsubscribe links remain replayable for the documented lifetime and Social
  applies them idempotently.
- Typecheck and the deterministic complete test suite pass.
- A real-service smoke test succeeds without IntegralCES.

Full cross-service user journeys, retry and idempotency guarantees, and
exactly-once notification behavior remain in Stage 13.
