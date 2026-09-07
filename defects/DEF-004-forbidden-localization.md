# DEF-004 — Forbidden mutations display a translation key

**P3 · SMK-015 · Implemented**

Suspended-member transfer confirmation and offer preview correctly fail with 403, but show `ErrorForbidden`. See the [report](../artifacts/smoke/20260831-184943-408f86f/report.md#def-004--forbidden-suspended-account-mutations-render-an-untranslated-errorforbidden-toast) and the [transfer](../artifacts/smoke/20260831-184943-408f86f/network/SMK-015-suspended-transfer-blocked.log) / [post](../artifacts/smoke/20260831-184943-408f86f/network/SMK-015-suspended-post-blocked.log) captures.

## Underlying cause and confidence

**Confirmed catalog omission.** [KError.ts](../app/src/KError.ts) recognizes the backend `Forbidden` code and `getTranslationKey()` constructs `ErrorForbidden`. The [global error handler](../app/src/boot/errors.ts) translates that key directly. None of the five base locale catalogs defines it; there is no corresponding CES override. Both services already reject the operation correctly.

## Implemented approach

Add `ErrorForbidden` alongside the shared errors in all five always-loaded base catalogs. English reads “You do not have permission to perform this action.” Other languages carry the same generic meaning. CES inherits these messages because there are no flavor-specific terms.

The `Forbidden` API code, KError mapping, global error handler, and server authorization are unchanged. No new error abstraction or locale test framework is needed.

## Verification

- Checked JSON validity and the new key in English, Catalan, Spanish, French, and Italian; checked CES has no overriding entry.
- Existing transfer, offer, and want interaction suites pass.
- App lint and production build pass.
- Real-service forbidden-action browser smoke checks were not performed.
