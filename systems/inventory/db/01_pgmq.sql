-- Üzenetsor-bővítmény (pgmq) és a Supabase-ből ismert pgmq_public burkoló függvények, változatlan névvel,
-- hogy a sorokat használó kód (send / read / delete / archive) ne változzon.
create extension if not exists pgmq;

create schema if not exists pgmq_public;

create function pgmq_public.send(queue_name text, message jsonb, sleep_seconds integer default 0)
returns setof bigint language sql as $$ select * from pgmq.send(queue_name, message, sleep_seconds) $$;

create function pgmq_public.read(queue_name text, sleep_seconds integer, n integer)
returns setof pgmq.message_record language sql as $$ select * from pgmq.read(queue_name, sleep_seconds, n) $$;

create function pgmq_public.pop(queue_name text)
returns setof pgmq.message_record language sql as $$ select * from pgmq.pop(queue_name) $$;

create function pgmq_public.delete(queue_name text, message_id bigint)
returns boolean language sql as $$ select pgmq.delete(queue_name, message_id) $$;

create function pgmq_public.archive(queue_name text, message_id bigint)
returns boolean language sql as $$ select pgmq.archive(queue_name, message_id) $$;

grant usage on schema pgmq_public to service_role;
grant execute on all functions in schema pgmq_public to service_role;
grant usage on schema pgmq to service_role;
grant all on all tables in schema pgmq to service_role;
grant all on all sequences in schema pgmq to service_role;
alter default privileges in schema pgmq grant all on tables to service_role;
alter default privileges in schema pgmq grant all on sequences to service_role;

-- A rendszer saját üzenetsorai
select pgmq.create('inventory_commands');
select pgmq.create('inventory_replies');
select pgmq.create('inventory_alerts');
