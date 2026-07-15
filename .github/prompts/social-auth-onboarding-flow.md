# Social/Auth Onboarding Flow

This is the frontend/Mirage contract for onboarding. Real-service gaps are tracked in `social-auth-todos.md`.

## Shared registration and email verification

1. The app collects `name`, `email`, `password`, and the current `language`.
2. The app calls Auth:

   ```http
   POST /register
   Content-Type: application/json

   {
     "email": "user@example.org",
     "password": "...",
     "signup": {
       "type": "<group-or-member>",
       "name": "User Name",
       "language": "en-us",
       "groupCode": "GRP0"
     }
   }
   ```

   `groupCode` is present only for signup in an existing group.
3. Auth creates the canonical user UUID, stores the password hash, and sets `emailVerified: false`. The temporary `signup` object is not stored on the Auth user.
4. Auth emits `ValidationEmailRequested` with the signup context for the token request.
5. Notifications requests a purpose-bound token from Auth. Auth stores `signup` on this temporary token record:

   ```http
   POST /action-token
   Authorization: <notifications service credentials>
   Content-Type: application/json

   {
     "purpose": "emailVerification",
     "userId": "<auth-user-uuid>",
     "signup": { "type": "...", "name": "...", "language": "..." }
   }
   ```

6. Notifications sends the verification email containing:

   ```text
   <APP_URL>/confirm-email?token=<email-verification-token>
   ```

7. The user follows the link. The public confirmation page calls:

   ```http
   POST /email/confirm
   Content-Type: application/json

   { "token": "<email-verification-token>" }
   ```

8. Auth marks the token used, sets `emailVerified: true`, and returns the Auth user plus the token's `signup` context. A used email-verification token remains readable until expiry so reopening the link resumes the flow without repeating the email mutation.
9. The confirmation page offers login while holding the returned signup context in memory.
10. The app requests OAuth tokens:

    ```http
    POST /token
    Content-Type: application/x-www-form-urlencoded

    grant_type=password&username=<email>&password=<password>&scope=<app-scopes>
    ```

    Auth rejects this call until the email is verified.
11. The app stores the access token, refresh token, expiry, and scopes under browser key `auth-session`.
12. If confirmation is interrupted before Social provisioning, the user can reopen the same verification link or submit `/register` again with the same email and password. Re-registration issues a fresh verification token with the newly submitted signup context; a wrong password is rejected.

## 1. Signup and request a new group

The Auth `signup` value is:

```json
{
  "type": "group",
  "name": "User Name",
  "language": "en-us"
}
```

After login:

1. The app creates or updates the Social user and settings:

   ```http
   POST <SOCIAL_URL>/users
   Authorization: Bearer <access-token>
   Content-Type: application/vnd.api+json

   {
     "data": {
       "type": "users",
       "attributes": {
         "name": "User Name",
         "email": "user@example.org"
       }
     },
     "included": [{
       "type": "user-settings",
       "id": "<temporary-uuid>",
       "attributes": { "language": "en-us" }
     }]
   }
   ```

   Social uses the bearer-token subject as the Social user ID.
2. Normal bootstrap runs:

   ```http
   GET <SOCIAL_URL>/users/me?include=settings
   GET <SOCIAL_URL>/users/<user-id>/members?include=group,group.currency,account&page[size]=1
   ```

   The membership collection is empty.
3. The app navigates to `/groups/new`.
4. The user fills in the group and currency form. Until submission, this data exists only in Vue component state.
5. The app requests the group:

   ```http
   POST <SOCIAL_URL>/groups
   Authorization: Bearer <access-token>
   Content-Type: application/vnd.api+json

   {
     "data": {
       "type": "groups",
       "attributes": {
         "name": "...",
         "code": "...",
         "description": "...",
         "contacts": []
       }
     },
     "included": [{
       "type": "currencies",
       "id": "<temporary-uuid>",
       "attributes": { "...": "..." }
     }]
   }
   ```

6. Social stores the group as `pending`, assigns the authenticated user as an admin, and stores the requested currency association.
7. Social emits `GroupRequested`; Notifications emails the superadmin recipients. The applicant remains on the pending-group confirmation view.

## 2. Signup in an existing group

The Auth `signup` value is:

```json
{
  "type": "member",
  "name": "User Name",
  "language": "en-us",
  "groupCode": "GRP0"
}
```

After login:

1. The app creates or updates the Social user and settings through `POST <SOCIAL_URL>/users`, as in the new-group flow.
2. The app creates the draft membership:

   ```http
   POST <SOCIAL_URL>/GRP0/members
   Authorization: Bearer <access-token>
   Content-Type: application/vnd.api+json

   {
     "data": {
       "type": "members",
       "attributes": { "name": "User Name" }
     }
   }
   ```

   Social links the member to the authenticated user and stores it with status `draft`. Retrying the same provisioning request returns the existing user/group membership.
3. Normal bootstrap loads the Social user and the new member, group, external currency, and account relationship.
4. The app navigates to `/groups/GRP0/signup-member`.
5. The onboarding page loads:

   ```http
   GET <SOCIAL_URL>/GRP0?include=settings
   GET <SOCIAL_URL>/GRP0/members/<member-id>
   GET <SOCIAL_URL>/GRP0/posts?filter[member]=<member-id>&filter[type]=offers&include=category
   ```

6. Saving the profile calls:

   ```http
   PATCH <SOCIAL_URL>/GRP0/members/<member-id>
   Authorization: Bearer <access-token>
   ```

7. Each required initial offer is created or updated through the group posts endpoint with resource type `offers`.
8. Completing onboarding requests approval:

   ```http
   PATCH <SOCIAL_URL>/GRP0/members/<member-id>
   Authorization: Bearer <access-token>

   {
     "data": {
       "type": "members",
       "id": "<member-id>",
       "attributes": { "status": "pending" }
     }
   }
   ```

9. Social emits `MemberRequested`; Notifications emails the group administrators.
10. When an administrator later activates the member, Social emits `MemberJoined`; Notifications sends the member welcome email.

## Information ownership

| Information | Storage | Lifetime |
| --- | --- | --- |
| Form name/email/password | Vue component state | Until registration finishes or the page closes |
| Password | Auth password hash only | Auth user lifetime; never sent to Social |
| Auth user UUID and email verification state | Auth user record | Auth user lifetime |
| `signup` context | Email-verification action-token record | Token expiry; readable after first use for recovery |
| Email verification token | Hashed Auth action-token record; raw value only in the email link | Email mutation is single use; confirmation response is replayable until expiry |
| OAuth access/refresh tokens | Browser `auth-session` storage; Auth token/grant state | Session/refresh lifetime |
| Confirmed Auth user response | Confirmation page memory | Until navigation or page close |
| Social user/profile/settings | Social database | Social user lifetime |
| Draft/pending membership | Social database | Membership lifetime |
| Pending group/admin/currency request | Social database and related Accounting workflow | Group lifetime |
| Normalized current user/member/group/currency/account | Vuex resource stores | App cache/session lifetime |
