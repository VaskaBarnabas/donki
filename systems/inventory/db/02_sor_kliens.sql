-- A raktár ügyfelei (rendeléskezelő, helpdesk, MCP) ezzel a szerepkörrel érik el a raktárt: CSAK az üzenetsort
-- (pgmq_public), a raktár tábláit nem. A hozzá tartozó API-kulcsot a stack:secrets állítja ki (INVENTORY_API_KEY).
create role sor_kliens nologin;
grant sor_kliens to authenticator;
grant usage on schema pgmq_public to sor_kliens;
grant execute on all functions in schema pgmq_public to sor_kliens;
grant usage on schema pgmq to sor_kliens;
grant select, insert, update, delete on all tables in schema pgmq to sor_kliens;
grant usage, select on all sequences in schema pgmq to sor_kliens;
alter default privileges in schema pgmq grant select, insert, update, delete on tables to sor_kliens;
alter default privileges in schema pgmq grant usage, select on sequences to sor_kliens;
