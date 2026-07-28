# Social/Auth Migration Todos

- Implement `POST /change-password/authenticated` in the real auth service with bearer authentication and `{ "currentPassword": "...", "password": "..." }`. Mirage and the frontend profile control already use this contract.
- Decide how repeated unverified registrations prove ownership. The current Auth endpoint replaces the password and issues a fresh single-use verification journey; it should not expose whether an unverified identity already exists.
- Add a way to grant the existing `superadmin` scope to another user through the real Auth service; the configured admin email is currently the only grant source.
