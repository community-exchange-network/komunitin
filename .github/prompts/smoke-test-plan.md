# Browser-Driven Full-Stack Smoke-Test Runbook

## Summary

Run a comprehensive smoke test against a reset local Docker stack with mocks disabled. Exercise the Vue app through the browser while verifying the Auth → Social → Accounting → Notifications integration chain.

No application or API changes are required. The output is a test report, evidence bundle, and actionable defect list.

## Preparation

- Start from a clean stack with `./start.sh --up --dev --reset` and confirm `KOMUNITIN_APP_MOCK=false`.
- Record commit SHA, environment configuration, browser/version, viewport, start time, and run ID.
- The development TLS certificate is issued by an `mkcert` CA created inside the
  app image, so host browser automation does not trust it by default. Use a
  disposable localhost-only browser context with certificate validation disabled.
  For Playwright, `ignoreHTTPSErrors` alone is insufficient because the service
  worker still rejects the certificate; apply the bypass at browser/CDP level too:

  ```ts
  const browserSession = await browser.newBrowserCDPSession()
  await browserSession.send("Security.setIgnoreCertificateErrors", { ignore: true })
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  ```

  Do not reuse this certificate bypass for non-local targets.
- Verify:
  - App loads at `https://localhost:2030`.
  - Auth, Social, and Notifications `/health` endpoints return success.
  - The PWA service worker installs and controls the page.
  - No unexpected browser console errors or failed startup requests.
    The exact `GET /config.js?<cache-buster>` HTTP 404 and its console message are
    expected in development; record it once as environment noise. Do not classify
    it as a defect or suppress any other failed request.
  - `DEV_SAVE_EMAILS=true`; retrieve action links from `notifications-ts/tmp/emails`, then open them in the browser.
  - Image uploads go through the Social API. Verify that the returned
    `https://localhost:9191/komunitin/uploads/...` S3Mock URL loads in the browser.
- Use isolated browser contexts for Anonymous, Superadmin, Group Admin, and Member.
- Test data:
  - Unique run ID, emails, and unused four-character group code.
  - Superadmin: `info@komunitin.org` / `komunitin`.
  - Configure the test group to require terms, one initial offer, a usable payment credit limit, and a dedicated smoke-test category.
  - Keep credentials and action tokens out of reports and screenshots.

## Smoke-Test Matrix

### Community and identity lifecycle

- **SMK-001 — Anonymous access**
  - Explore communities, search, open a public community, and inspect its public details.
  - Opening a protected route must redirect to login and preserve the intended destination.

- **SMK-002 — Group-administrator signup**
  - Start “new community” signup, validate required credentials, register, and request email resend.
  - Confirm a verification email is produced.
  - Open its link in the browser and verify confirmation does not create a session.
  - Log in and resume automatically at the community creation form.

- **SMK-003 — Community request**
  - Enter identity, address, coordinates, contacts, and currency information.
  - Submit and verify the community is `pending`, absent from anonymous results, and owned by the requesting administrator.
  - Verify the appropriate group-request notification/email is produced.

- **SMK-004 — Superadmin activation**
  - Verify a non-superadmin cannot access `/superadmin`.
  - Log in as superadmin, locate the pending community, and activate it.
  - Verify it becomes public and active, Accounting currency data becomes available, and the administrator receives the activation email.
  - Verify the administrator has a member record with an active Accounting account and the configured defaults.

- **SMK-005 — Community configuration**
  - As superadmin, edit the community description/contact information.
  - Configure terms, minimum offers, initial limits, email defaults, and a smoke-test category.
  - Reload each page and confirm persisted values.

- **SMK-006 — Group-administrator member and account provisioning**
  - Log in as the community creator as its group administrator.
  - Confirm the group-admin menu, account balance, limits, and transaction actions are available.
  - Verify the Social member update and Accounting account creation both succeed without an unexpected `4xx/5xx` response.
  - Verify the member is active with an active Accounting account linked to the member, owned by the administrator identity, and initialized with the configured defaults.

- **SMK-007 — Ordinary member signup**
  - In a fresh anonymous context, join the community using a second identity.
  - Confirm email, log in, finish profile and required offer, and submit.
  - Verify the member sees a pending/inactive state and the group administrator receives the request notification.

- **SMK-008 — Member acceptance**
  - As group admin, find the request under account management and accept it.
  - Verify the member becomes active, an Accounting account with configured defaults appears, and welcome notifications are generated.
  - Verify search, sorting, pagination, and CSV download produce the member.

### Member and marketplace operations

- **SMK-009 — Login, session, and navigation**
  - Log in as the member, reload the browser, navigate through Home, profile, community, transactions, and logout.
  - Verify session restoration, balances, browser back navigation, and post-login redirect.

- **SMK-010 — Profile and settings**
  - Update name, description, location, contacts, and profile image.
  - Change account, notification, and email preferences.
  - Reload and verify persistence; confirm the administrator sees the updated profile.
  - Verify the browser sends the image to the Social API and can load the returned
    S3Mock HTTPS URL; it must not upload directly to S3Mock.

- **SMK-011 — Offer lifecycle**
  - Create an offer with category, description, value, expiry, and image; preview and publish it.
  - Find it through home/community search and another user’s browser.
  - Edit it, hide it, verify it disappears publicly, republish it, then delete it.
  - Verify ownership and admin edit permissions while unrelated members cannot mutate it.

- **SMK-012 — Need lifecycle**
  - Create, preview, publish, search, edit, hide/republish, and delete a need.
  - Verify public visibility and permissions after every state change.

- **SMK-013 — Accounting transaction**
  - Send a small payment from the ordinary member to the administrator.
  - Review the confirmation before committing.
  - Verify committed status, description, both account balances, transaction histories, and the group-admin transaction list.
  - Reload both sessions to prove persistence; balances must change by equal and opposite amounts.

- **SMK-014 — Notifications**
  - Check notifications resulting from group request/activation, member request/acceptance, post publication, and payment.
  - Verify intended non-actor recipients, unread badge, notification links, mark-as-read behavior, and relevant saved emails.
  - Actor also has his own publish notifications in the notifications page, but in-app live notification is suppressed and own posts don't appear in mails or digested notifications. Actor could receive publish push notification in the edge case he/she closes the browser between publish and the event, as a confirmation.
  - Poll asynchronous delivery for up to 60 seconds rather than using fixed sleeps.

### Administration, permissions, and recovery

- **SMK-015 — Member administration**
  - Edit the ordinary member’s profile and account limits.
  - Suspend the account and verify the member sees an inactive banner and cannot transact or publish.
  - Resume it and verify normal operation returns.
  - Disable and re-enable the account, checking Social and Accounting status remain synchronized.

- **SMK-016 — Community administration**
  - Edit group information and category/settings values as group admin.
  - Disable the community and verify it disappears from anonymous discovery and operations are blocked.
  - Re-enable it and verify public browsing and member operations recover.

- **SMK-017 — Authorization boundaries**
  - As an ordinary member, directly open group-admin URLs: no admin data or mutations may be allowed.
  - As group admin, directly open superadmin URLs: the app must redirect through logout/login and deny access.
  - As anonymous user, hidden posts, pending members, pending groups, and private administration data must remain inaccessible.
  - Treat any client-side exposure backed by a successful unauthorized API response as a release-blocking security defect.

- **SMK-018 — Authenticated password change**
  - Enter an incorrect current password and verify a controlled validation error.
  - Change it with the correct password, log out, verify the old password fails, and verify the new password succeeds.

- **SMK-019 — Email change**
  - Request a new email, verify the saved confirmation message, and open its link.
  - Confirmation must log the user out.
  - Verify the old email no longer authenticates, the new email does, and the Social profile reflects the confirmed Auth email.

- **SMK-020 — Password reset**
  - Request reset for both a known and unknown email; the visible response must not reveal account existence.
  - Open the known account’s reset link, set a new password, and verify no session is created automatically.
  - Verify the previous password fails, the new password succeeds, and the reset token cannot change the password again.

- **SMK-021 — Member deletion**
  - Return the member’s balance to zero, then delete the membership using the current password.
  - Verify the Social member and posts disappear, the Accounting account is removed, but the Auth identity can still log in and start a new membership.

- **SMK-022 — Pending-community rejection**
  - Create a second minimal pending community with another identity.
  - Delete it as superadmin and verify it disappears while the creator’s Auth identity remains usable.
  - Run this destructive case last.

- **SMK-023 — Responsive spot check**
  - Repeat anonymous discovery, login, member home, profile menu, offer creation, and transaction history at approximately `390×844`.
  - Check for blocked controls, clipped dialogs, inaccessible menus, and unusable scrolling.

## Evidence and Defect Process

- Create `artifacts/smoke/<run-id>/` containing:
  - `report.md` with every case marked Pass, Fail, Blocked, or Skipped.
  - `screenshots/`, sanitized network evidence, console output, and relevant service logs.
  - A test-data manifest containing identifiers but no passwords or action tokens.
- Capture screenshots at major lifecycle checkpoints and every failure. Name them `SMK-###-<step>-<short-description>.png`.
- A toast alone is not proof: reload and verify through another page or persona after every cross-service mutation.
- On failure:
  1. Capture the current UI, URL, console, and failed network request before retrying.
  2. Redact authorization headers, cookies, passwords, and action-token query strings.
  3. Retry once using a reload or fresh browser context.
  4. If reproducible, capture the owning service logs and file a defect; never silently retry until it passes.
- Defect records must contain title, severity, run/environment, case ID, prerequisites, exact steps, expected/actual result, reproducibility, screenshot, sanitized request/response, relevant logs, suspected service boundary, and workaround.
- Severity:
  - **P0:** security breach, data corruption, or stack-wide outage; stop the run.
  - **P1:** signup, activation, acceptance, login, or payment path broken.
  - **P2:** important user/admin operation degraded with a workaround.
  - **P3:** visual, wording, or minor usability issue.
- Record non-bug findings separately: unclear UX, flaky timing, missing observability, configuration gaps, and documentation problems.
- Preserve failed state until evidence is collected. Reset test data only after the report and defects are complete.
- Update the report.md and other files on-the-go at least after each test, so we can stop and resume the session without losing progress. Don't wait to finish the entire run before reporting.

## Acceptance and Assumptions

- The run is green only if all non-optional cases pass, there are no P0/P1 defects, no unauthorized access, no unexplained browser errors, and no unexpected API `4xx/5xx` responses.
- Default target is a reset local stack with saved HTML emails and comprehensive coverage because no environment preference was supplied.
- Optional external SMTP delivery, push permission/device delivery, NFC hardware, top-ups, Credit Commons transfers, and IntegralCES migration are outside this core run unless their dependencies are explicitly configured.
