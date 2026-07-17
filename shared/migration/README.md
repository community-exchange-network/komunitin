# Community migration bundles

This directory contains the data-only input contract for importing one new Komunitin community. Runtime parsing and import code are intentionally not included yet.

- [FORMAT.md](FORMAT.md) defines the exact files, headers, denormalized values, relationships and validation invariants.
- [example/](example/) is a tiny complete bundle and the header reference for every CSV file, with two users, combined member/account records, marketplace content, image URLs and one committed transfer.

The example is self-balancing: Alice pays Bob `5.00`, so their declared balances are `-5.00` and `5.00`. Production bundles must likewise contain complete committed history, total zero and use a destination community code that does not already exist.
