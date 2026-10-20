#!/bin/sh
# A Flowable folyamatmotor a rendeléskezelő része: a saját "flowable" adatbázisában, ugyanezen a szerveren.
# A táblákat (ACT_*, FLW_*) a Flowable maga hozza létre induláskor.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
create role flowable login password '$FLOWABLE_DB_PASSWORD';
create database flowable owner flowable;
SQL
