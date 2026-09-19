# Community migration bundles

This directory contains the data-only input contract for importing one new Komunitin community. The [Social offline parser](../../social/src/features/migrations/bundle/) validates directories and ZIPs and produces an import plan. Import execution is not implemented yet.

- [FORMAT.md](FORMAT.md) defines the exact files, headers, denormalized values, relationships and validation invariants.
- [example/](example/) is a tiny complete bundle and the header reference for every CSV file, with two global users, member-user preferences, combined member/account records, marketplace content, image URLs and one committed transfer.

The example is self-balancing: Alice pays Bob `5.00`, so their declared balances are `-5.00` and `5.00`. Production bundles must likewise contain complete committed history, total zero and use a destination community code that does not already exist.

Images have no separate source keys. The plan records their owner and position, preserving URL order and duplicates.

The offline Social parser reads only the bundle. It does not check deployed communities; upload staging performs that read-only existence check, and execution repeats it immediately before import.

`users.csv` holds global identities, including optional `passwordHash` values in Auth's bcrypt format. `member-users.csv` links users by email to members and carries per-membership preferences without a `settings.` prefix. Membership rows also determine account ownership. Compatible hashes preserve passwords; unsupported legacy hashes require a password reset or separate Auth support. See [the credential rules](FORMAT.md#userscsv).
