# Community migration bundles

This directory contains the data-only input contract for importing one new Komunitin community. Runtime parsing and import code are intentionally not included yet.

- [FORMAT.md](FORMAT.md) defines the exact files, headers, denormalized values, relationships and validation invariants.
- [example/](example/) is a tiny complete bundle and the header reference for every CSV file, with two users, combined member/account records, marketplace content, image URLs and one committed transfer.

The example is self-balancing: Alice pays Bob `5.00`, so their declared balances are `-5.00` and `5.00`. Production bundles must likewise contain complete committed history, total zero and use a destination community code that does not already exist.

Image source keys are derived by the importer from the owning resource type, its stable source key and a zero-based position. Post image order is therefore identity-bearing: changing the order changes the derived key associated with each URL. Stable retries require retaining both resource source keys and `imageUrls` ordering.

The offline Social parser reads only the bundle. It does not check deployed communities; upload staging performs that read-only existence check, and execution repeats it immediately before import.
