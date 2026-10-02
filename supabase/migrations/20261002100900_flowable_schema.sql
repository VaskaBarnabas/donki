-- A Flowable folyamatmotor sémája. A táblákat (ACT_*, FLW_*) a Flowable maga hozza létre
-- és kezeli; migráció, seed vagy db diff ne nyúljon hozzájuk. PostgREST-en nem exposed.

create schema if not exists flowable;

revoke all on schema flowable from public;
revoke all on schema flowable from anon, authenticated;
