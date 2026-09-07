# DEF-008 — Delete the identity after its last membership

**P3 · SMK-021 · Implemented**

## Decision

Social orchestrates this operation because it owns membership authorization and can count memberships across communities. The browser must not decide whether another membership exists or directly delete another person’s identity.

## Implementation

- After the zero-balance check and Accounting account deletion, soft-delete the Social membership. For each linked user, count all non-deleted memberships across tenants, including draft, pending, disabled, and suspended memberships. Delete the Auth identity only when that count is zero.
- Auth exposes idempotent `DELETE /users/:id`, restricted to the existing Social client-credentials principal. App tokens, delegated Social user tokens, and other service principals are rejected. Auth removes credentials and action tokens and revokes persisted OAuth sessions in a transaction.
- After Auth succeeds, anonymize the Social user’s email/name/language while retaining historical relations. The unique Social email must be released so a later registration can create a different identity.
- A failed Auth call fails the Social DELETE. Only this deletion path accepts a previously deleted member, with the same owner/admin authorization, allowing cleanup to be retried even in a private community. Normal reads still hide deleted members and posts. Accounting deletion is not repeated during cleanup retries.
- Keep orchestration in Social. The UI clears its selected session after self-deletion, including administrator self-deletion. Password confirmation refreshes credentials without reloading the membership, allowing a retry after Social deletion has already succeeded.
- Qualify the existing login warning for the last membership and remove the blanket data-erasure promise in all base languages. CES uses Community Standing. Shared memberships and administrator deletion use neutral confirmation wording.
- Match the app mocks to soft-deleted memberships, retained/anonymized projections, retained login with another membership, and credential rejection after the last deletion.

## Verification

- Social member HTTP suite: 53 tests pass. Coverage includes shared identities, another community’s draft membership, administrator deletion, private-community retry, authorization on deleted rows, zero-balance enforcement, hidden posts, and freeing the original email.
- Auth HTTP suites: 48 tests pass, including service-principal restrictions, old-password/refresh rejection, action-token invalidation, idempotency, and isolation of another identity.
- Full app suite: 37 files / 136 tests pass. The deletion interaction covers retained sign-in with another membership, last-membership deletion, and retry after an Auth cleanup failure.
- Auth and Social typechecks/builds and app lint/build pass. App typecheck has the same pre-existing errors as the base.

## Limits and deployment

Deploy Auth before Social. Cross-service cleanup is sequential and retryable, not a distributed transaction or background job. Concurrent new-membership creation during orphan cleanup is not serialized across services. Existing self-contained access JWTs expire normally at downstream services; deleted credentials and refresh sessions cannot create a new login. Real email/blockchain/browser smoke verification was not performed.
