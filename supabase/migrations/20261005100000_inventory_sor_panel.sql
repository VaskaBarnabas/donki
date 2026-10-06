-- Az admin felület raktári sorpanelje: pgmq metrikák és a sorok tartalmába „belenézés”.
-- A pgmq.read nem használható erre, mert növeli a read_ct-t (az inventory_commands sornál egy
-- betekintés így dead letterbe juttathatna egy üzenetet). Ezek a függvények csak olvassák a sortáblákat.

create function inventory.sor_metrikak()
returns table (
  sor              text,
  hossz            bigint,
  legregebbi_mp    integer,
  legujabb_mp      integer,
  osszes_uzenet    bigint,
  archivalt        bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  for m in select * from pgmq.metrics_all() loop
    sor := m.queue_name;
    hossz := m.queue_length;
    legregebbi_mp := m.oldest_msg_age_sec;
    legujabb_mp := m.newest_msg_age_sec;
    osszes_uzenet := m.total_messages;
    execute format('select count(*) from pgmq.%I', 'a_' || m.queue_name) into archivalt;
    return next;
  end loop;
end;
$$;

create function inventory.sor_tartalom(p_sor text, p_archiv boolean default false, p_n integer default 20)
returns table (msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_sor not in ('inventory_commands', 'inventory_replies', 'inventory_alerts', 'order_events', 'payment_events') then
    raise exception 'Ismeretlen sor: %', p_sor using errcode = 'PT400';
  end if;
  if p_archiv then
    return query execute format(
      'select msg_id, read_ct, enqueued_at, vt, message from pgmq.%I order by msg_id desc limit %s',
      'a_' || p_sor, least(greatest(p_n, 1), 200));
  else
    return query execute format(
      'select msg_id, read_ct, enqueued_at, vt, message from pgmq.%I order by msg_id desc limit %s',
      'q_' || p_sor, least(greatest(p_n, 1), 200));
  end if;
end;
$$;

revoke execute on function inventory.sor_metrikak() from public;
revoke execute on function inventory.sor_tartalom(text, boolean, integer) from public;
grant execute on function inventory.sor_metrikak() to service_role;
grant execute on function inventory.sor_tartalom(text, boolean, integer) to service_role;
