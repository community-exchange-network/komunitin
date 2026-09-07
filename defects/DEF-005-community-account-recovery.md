# DEF-005 — Recover accounts when re-enabling a community

**P2 · SMK-016 · Implemented**

## Decision

Disabling a currency releases Accounting ledger resources. Social membership statuses remain unchanged and remember each member’s status before disabling. Re-enabling the community automatically wakes disabled Accounting accounts belonging to active Social members. It does not lift Accounting suspensions or restore deleted accounts.

## Implementation

- Explicit group status PATCH requests reconcile the currency even when the requested status already matches Social.
- After currency activation, iterate over non-deleted active Social members with account IDs and call the existing `syncAccountStatus`, limited to the Accounting source status `disabled`.
- The optional source status prevents provisioning missing accounts during recovery and preserves independent Accounting restrictions. Existing onboarding calls retain their behavior.
- Synchronization is sequential and non-atomic. Errors reach the caller; completed remote work remains. Retrying `status: active` resumes recovery, including when the currency or group is already active. Profile-only edits do not synchronize accounts.
- Existing group authorization and delegated Accounting authorization apply. Social membership statuses and notification behavior are unchanged.
- Update the disabled-status explanation and disable/enable confirmation in all base languages and CES English, plus the app and Social Accounting mocks. No new account status UI or manual recovery action is introduced.

## Verification

- Social group/member HTTP suites cover disable/re-enable, retained Social statuses, disabled/suspended/draft/pending/deleted cases, isolation from other communities, failure after currency activation, successful retry, same-status recovery, and no-op repeat enables.
- Social typecheck/build and app lint pass. Existing app Groups and CommunitySettings interaction suites and production build pass.
- Real blockchain/browser smoke checks were not performed; Social HTTP tests use PostgreSQL and mocked Accounting/Auth services.
