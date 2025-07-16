insert into accounts (acc_id, min, max, url) values ('NET1', -1000000, +1000000, 'http://accounting:2025/NET1/cc');
insert into accounts (acc_id, min, max, url) values ('NET2', -1000000, +1000000, 'http://accounting:2025/NET2/cc');
insert into hash_history (acc_id, txid, hash, source) values ('NET1', 0, 'trunk', 'NET1');
insert into hash_history (acc_id, txid, hash, source) values ('NET2', 0, 'trunk', 'NET2');
