# DEF-001 — First-login bootstrap exposes unresolved relationships

**P2 · SMK-006, SMK-007 · Implemented**

First login produces a null-`relationships` exception and an unknown-script toast; a reload succeeds. See the [report](../artifacts/smoke/20260831-184943-408f86f/report.md#def-001--first-authenticated-route-after-login-raises-a-null-relationship-client-error), [administrator network capture](../artifacts/smoke/20260831-184943-408f86f/network/SMK-006-login-null-relationships.log), and [console capture](../artifacts/smoke/20260831-184943-408f86f/console-2026-08-31T17-53-34-399Z.log).

## Underlying cause and confidence

The current code contains a concrete ordering defect:

1. [me.ts](../app/src/store/me.ts), `loadUser`, commits `myUserId` immediately after loading the Social user. Valid tokens are already published, so `isLoggedIn` becomes true.
2. It commits `myMemberId` before loading member-user preferences and the Accounting account/currency. Social's external relationship identifiers do not themselves load Accounting resources.
3. [resources.ts](../app/src/store/resources.ts), `relatedGetters` / `one`, returns `null` for related objects not yet cached. `myCurrency` can therefore be `null` during bootstrap.
4. `isLegacyAccounting` checks only `!== undefined` and dereferences `.relationships`. The [i18n watcher](../app/src/boot/i18n.ts), through `getUserLocaleState`, evaluates `isAdmin`, which evaluates this getter during reactive updates.

This establishes a code path matching the captured exception and successful API responses. The saved stack does not isolate the original dereference to a source line; confirm the watcher sequence with delayed responses during implementation. A warm persisted cache is a plausible explanation for reload success, not proof that reload ordering is inherently safe.

## Implemented approach

Stage member and member-user IDs while loading the required account/currency. Publish them with the existing mutations, with `myUserId` last and no asynchronous gap. Use staged token scopes for the superadmin case, and initialize location from the staged member. Draft/pending and membership-free identities retain their existing bootstrap paths.

`myCurrency` explicitly permits unresolved values; `isLegacyAccounting` checks both null and undefined. A changed token object cancels publication after logout or replacement authorization. An authorization failure clears credentials only if they still belong to that attempt; a delayed older load cannot log out a newer session. Notifications remain non-blocking. Routing and refresh cache behavior are unchanged.

## Verification

- Login and signup interaction suites: 15 tests pass, including delayed Accounting success, failure/retry, logout before the response completes, and overlapping authorizations; existing draft and membership-free signup/superadmin paths pass.
- Full app suite: 37 files / 140 tests pass.
- App lint and production PWA build pass.
- `pnpm testAll` stops at pre-existing TypeScript errors. Comparing error messages against the untouched base found no new errors.
- The existing superadmin test logs a ManageGroups missing-meta render error on the untouched base too; this is separate from the first-login relationship defect.
- Real-stack browser smoke verification was not performed; coverage uses the full app and Mirage APIs.
