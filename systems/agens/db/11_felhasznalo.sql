-- A portál asszisztens-oldala (17. fázis kiegészítés): a futás a bejelentkezett felhasználóhoz tartozik, így mindenki
-- csak a saját beszélgetéseit látja és folytathatja (a parancssori futásoknál üres).
alter table agens.futas add column if not exists felhasznalo uuid;
create index if not exists futas_felhasznalo_idx on agens.futas (felhasznalo, indult desc);
