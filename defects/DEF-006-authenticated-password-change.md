# DEF-006 — Change passwords through email validation

**P2 · SMK-018 · Implemented**

## Decision

Use the existing email-validated password reset flow for signed-in users too. Do not restore the authenticated current-password/new-password endpoint.

## Implementation

- The profile’s Change password button sends `POST /reset-password` with the current Social user’s email. Explain that the user will receive a link, show loading while requesting it, and show inbox instructions only after success. A failed request leaves the button available to retry.
- Reuse the public `/set-password?token=...` page and Auth’s dedicated, single-use `passwordReset` action token. Notifications already sends this link. The page submits `{ token, password }` to `/change-password`.
- On success, clear the password field and browser session and replace the route with sign-in. Auth already revokes refresh sessions when changing the password.
- Invalid, consumed, expired, or missing links display a localized message and a link to request another email. Unexpected request failures remain retryable through the existing error handler.
- Remove the obsolete authenticated client method and Mirage endpoint. Update the migration plan and all five base languages; CES inherits the neutral identity wording. No production Auth endpoint or Social mutation changes.

## Verification

- LoggedIn app suite: 6 tests pass, including requesting the email from the profile, validating the actual request payloads, changing the password via the emitted token, signing out, and rejecting reuse of the link.
- Auth HTTP suite: 46 tests pass, including reset-token lifecycle, old/new password login, and refresh-session revocation.
- Full app suite: 37 files / 136 tests pass. App lint and production build pass. App typecheck has the same pre-existing errors as the base.
- Real email delivery/browser smoke verification was not performed; the app uses Mirage and Auth HTTP tests mock Notifications.
