# DEF-005 — Recover accounts when re-enabling a community

**P2 · SMK-016 · Implemented**

## Decision

Disabling a currency releases Accounting ledger resources. Social membership statuses remain unchanged and remember each member’s status before disabling. Re-enabling the community synchronizes accounts belonging to active Social members to active, including accounts suspended in Accounting. Social status takes precedence; members suspended in Social are excluded from recovery.

## Implementation

- Group status transitions synchronize the currency. Requests matching the current Social status do not synchronize Accounting.
- After currency activation, iterate over non-deleted active Social members with account IDs and call the existing `syncAccountStatus` with target status `active`.
- Recovery uses existing account IDs, whose lookup fails if the account is missing. Accounting rejects activation of deleted accounts; this failure reaches the caller and leaves Social group status unchanged. Existing onboarding calls retain their behavior.
- Synchronization is sequential and non-atomic. Errors reach the caller; completed remote work remains. Social group status is updated only after account recovery succeeds, so retrying `status: active` resumes recovery even when the currency is already active. Profile-only edits do not synchronize accounts.
- Existing group authorization and delegated Accounting authorization apply. Social membership statuses and notification behavior are unchanged.
- Update the disabled-status explanation and disable/enable confirmation in all base languages and CES English, plus the app and Social Accounting mocks. No new account status UI or manual recovery action is introduced.

## Verification

- Social group/member HTTP suites cover disable/re-enable, retained Social statuses, disabled/suspended/draft/pending/deleted cases, isolation from other communities, failure after currency activation, successful retry, and no-op same-status requests.
- Social typecheck/build and app lint pass. Existing app Groups and CommunitySettings interaction suites and production build pass.
- Real blockchain/browser smoke checks were not performed; Social HTTP tests use PostgreSQL and mocked Accounting/Auth services.
