-- 18. fázis: a háttérfigyelő ezzel a szerepkörrel olvassa a rendszer eseménysorát (order_events): CSAK az üzenetsort
-- (pgmq_public), a rendszer tábláit nem – a raktár sor_kliens szerepkörének mintájára. A hozzá tartozó kulcsot a
-- stack:secrets állítja ki (ORDERS_SOR_KEY).
create role sor_kliens nologin;
grant sor_kliens to authenticator;
grant usage on schema pgmq_public to sor_kliens;
grant execute on all functions in schema pgmq_public to sor_kliens;
grant usage on schema pgmq to sor_kliens;
grant select, insert, update, delete on all tables in schema pgmq to sor_kliens;
grant usage, select on all sequences in schema pgmq to sor_kliens;
alter default privileges in schema pgmq grant select, insert, update, delete on tables to sor_kliens;
alter default privileges in schema pgmq grant usage, select on sequences to sor_kliens;
