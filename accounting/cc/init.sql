-- The demo seeds one community. Add peers separately for cross-community tests.
insert into accounts (acc_id, min, max, url) values ('BRAM', -1000000, +1000000, 'http://accounting:2025/BRAM/cc');
insert into hash_history (acc_id, txid, hash, source) values ('BRAM', 0, 'trunk', 'BRAM');
