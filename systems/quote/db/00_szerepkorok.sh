#!/bin/sh
# A PostgREST szerepkörei (a Supabase-ben ezek eleve megvannak; itt létre kell hozni őket).
#   authenticator – ezzel lép be a PostgREST, és a JWT "role" mezője szerint vált
#   service_role  – a rendszer saját szolgáltatása (megkerüli az RLS-t, ahogy a Supabase-ben)
#   anon          – token nélküli kérés: semmihez nincs joga
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password '$AUTHENTICATOR_PASSWORD';
grant anon, authenticated, service_role to authenticator;
SQL
