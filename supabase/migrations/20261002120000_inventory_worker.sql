-- Raktári worker: az inventory_commands sor feldolgozása, válasz az inventory_replies sorra,
-- minimumkészlet-figyelmeztetés az inventory_alerts sorra, dead letter: pgmq archívum.
--
-- Üzenet:  {"cmd":"FOGLAL","corr":"c-8f21","cikk":4711,"db":5,"ref":"RND-100045"}
-- Válasz:  {"corr":"c-8f21","status":"NOK","hibakod":"R-03","uzenet":"NINCS ELEG KESZLET","szabad":2,"ts":1790845200}
-- Hibakódok: R-01 ismeretlen cikk, R-02 hibás parancs, R-03 nincs elég készlet,
--            R-04 foglalás nem található, R-99 belső hiba.
--
-- Hibakezelés: az üzleti hibák (R-01..R-04) választ kapnak és az üzenet törlődik. Váratlan kivétel
-- (pl. "cikk":"abc") esetén nincs válasz és nincs törlés: az üzenet 30 mp múlva újra látható.
-- Ha read_ct > 3, az üzenet archívba kerül (dead letter), és egy R-99 válasz megy ki.

create function inventory.nok(p_hibakod text, p_uzenet text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('status', 'NOK', 'hibakod', p_hibakod, 'uzenet', p_uzenet);
$$;

create function inventory.valaszol(p_corr text, p_valasz jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pgmq.send(
    'inventory_replies',
    jsonb_build_object('corr', p_corr) || p_valasz || jsonb_build_object('ts', inventory.most_epoch())
  );
end;
$$;

-- Figyelmeztetés, amikor a fizikai készlet a minimumszint alá csökken (csak az átlépéskor).
create function inventory.ellenoriz_minimum(p_cikk integer, p_regi integer, p_uj integer, p_min integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_regi >= p_min and p_uj < p_min then
    perform pgmq.send(
      'inventory_alerts',
      jsonb_build_object('tipus', 'MIN_KESZLET_ALATT', 'cikk', p_cikk, 'keszlet', p_uj,
                         'min', p_min, 'ts', inventory.most_epoch())
    );
  end if;
end;
$$;

-- FOGLAL {cikk, db, ref}
create function inventory.cmd_foglal(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cikk   integer := (msg->>'cikk')::integer;
  v_db     integer := (msg->>'db')::integer;
  v_ref    text    := msg->>'ref';
  it       inventory.items%rowtype;
  v_szabad integer;
  v_id     integer;
begin
  if v_cikk is null or v_db is null or v_ref is null or v_db <= 0 then
    return inventory.nok('R-02', 'HIBAS PARANCS: CIKK, DB, REF KOTELEZO');
  end if;

  select * into it from inventory.items where cikk = v_cikk for update;
  if not found then
    return inventory.nok('R-01', 'ISMERETLEN CIKK') || jsonb_build_object('cikk', v_cikk);
  end if;

  v_szabad := it.keszlet - it.foglalt;
  if v_szabad < v_db then
    return inventory.nok('R-03', 'NINCS ELEG KESZLET') || jsonb_build_object('cikk', v_cikk, 'szabad', v_szabad);
  end if;

  insert into inventory.reservations (cikk, db, ref) values (v_cikk, v_db, v_ref) returning id into v_id;
  update inventory.items
     set foglalt = foglalt + v_db, updated_epoch = inventory.most_epoch()
   where cikk = v_cikk;

  return jsonb_build_object('status', 'OK', 'uzenet', 'FOGLALVA', 'foglalas', v_id,
                            'cikk', v_cikk, 'db', v_db, 'szabad', v_szabad - v_db);
end;
$$;

-- FELOLD {ref}: a ref összes aktív foglalása
create function inventory.cmd_felold(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ref    text := msg->>'ref';
  v_darab  integer;
  v_db     integer;
begin
  if v_ref is null then
    return inventory.nok('R-02', 'HIBAS PARANCS: REF KOTELEZO');
  end if;

  with f as (
    update inventory.reservations
       set statusz = 'FELOLDVA'
     where ref = v_ref and statusz = 'AKTIV'
    returning cikk, db
  ), u as (
    update inventory.items i
       set foglalt = i.foglalt - s.db, updated_epoch = inventory.most_epoch()
      from (select cikk, sum(db)::integer as db from f group by cikk) s
     where i.cikk = s.cikk
    returning i.cikk
  )
  select count(*), coalesce(sum(db), 0) into v_darab, v_db from f;

  if v_darab = 0 then
    return inventory.nok('R-04', 'FOGLALAS NEM TALALHATO') || jsonb_build_object('ref', v_ref);
  end if;

  return jsonb_build_object('status', 'OK', 'uzenet', 'FELOLDVA', 'ref', v_ref,
                            'feloldott', v_darab, 'db', v_db);
end;
$$;

-- MOZGAS {cikk, tipus, db, ref?}: BE / KI / VISSZARU / KORREKCIO (előjeles db)
-- KI esetén a ref-hez tartozó aktív foglalás KIADVA lesz.
create function inventory.cmd_mozgas(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cikk    integer := (msg->>'cikk')::integer;
  v_tipus   text    := msg->>'tipus';
  v_db      integer := (msg->>'db')::integer;
  v_ref     text    := msg->>'ref';
  it        inventory.items%rowtype;
  v_kiadott integer := 0;
  v_uj      integer;
begin
  if v_cikk is null or v_db is null or v_tipus is null
     or v_tipus not in ('BE', 'KI', 'VISSZARU', 'KORREKCIO')
     or (v_tipus <> 'KORREKCIO' and v_db <= 0) or v_db = 0 then
    return inventory.nok('R-02', 'HIBAS PARANCS: CIKK, TIPUS (BE|KI|VISSZARU|KORREKCIO), DB KOTELEZO');
  end if;

  select * into it from inventory.items where cikk = v_cikk for update;
  if not found then
    return inventory.nok('R-01', 'ISMERETLEN CIKK') || jsonb_build_object('cikk', v_cikk);
  end if;

  if v_tipus = 'KI' then
    if v_ref is not null then
      select coalesce(sum(db), 0)::integer into v_kiadott
        from inventory.reservations
       where ref = v_ref and cikk = v_cikk and statusz = 'AKTIV';
    end if;
    -- más foglalását nem adhatja ki
    if v_db > it.keszlet - (it.foglalt - v_kiadott) then
      return inventory.nok('R-03', 'NINCS ELEG KESZLET')
             || jsonb_build_object('cikk', v_cikk, 'szabad', it.keszlet - it.foglalt);
    end if;
    update inventory.reservations
       set statusz = 'KIADVA'
     where ref = v_ref and cikk = v_cikk and statusz = 'AKTIV';
    v_uj := it.keszlet - v_db;
  else
    v_uj := it.keszlet + v_db;
    if v_uj < 0 then
      return inventory.nok('R-03', 'NINCS ELEG KESZLET')
             || jsonb_build_object('cikk', v_cikk, 'szabad', it.keszlet - it.foglalt);
    end if;
  end if;

  insert into inventory.movements (cikk, db, tipus, ref) values (v_cikk, v_db, v_tipus, v_ref);
  update inventory.items
     set keszlet = v_uj, foglalt = foglalt - v_kiadott, updated_epoch = inventory.most_epoch()
   where cikk = v_cikk;
  perform inventory.ellenoriz_minimum(v_cikk, it.keszlet, v_uj, it.min_keszlet);

  return jsonb_build_object('status', 'OK', 'uzenet', 'MOZGAS ROGZITVE', 'cikk', v_cikk, 'tipus', v_tipus,
                            'keszlet', v_uj, 'szabad', v_uj - (it.foglalt - v_kiadott));
end;
$$;

-- LEKERDEZ {cikk} vagy {cikkek: [...]}
create function inventory.cmd_lekerdez(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cikk    integer;
  v_cikkek  integer[];
  it        inventory.items%rowtype;
  v_tetelek jsonb;
  v_ismeretlen jsonb;
begin
  if jsonb_typeof(msg->'cikkek') = 'array' then
    select array_agg(x::integer) into v_cikkek from jsonb_array_elements_text(msg->'cikkek') as x;
    select coalesce(jsonb_agg(jsonb_build_object(
             'cikk', i.cikk, 'megnevezes', i.megnevezes, 'keszlet', i.keszlet, 'foglalt', i.foglalt,
             'szabad', i.keszlet - i.foglalt, 'min', i.min_keszlet) order by i.cikk), '[]'::jsonb)
      into v_tetelek
      from inventory.items i
     where i.cikk = any(v_cikkek);
    select coalesce(jsonb_agg(c), '[]'::jsonb) into v_ismeretlen
      from unnest(v_cikkek) as c
     where not exists (select 1 from inventory.items i where i.cikk = c);
    return jsonb_build_object('status', 'OK', 'tetelek', v_tetelek, 'ismeretlen', v_ismeretlen);
  end if;

  v_cikk := (msg->>'cikk')::integer;
  if v_cikk is null then
    return inventory.nok('R-02', 'HIBAS PARANCS: CIKK VAGY CIKKEK KOTELEZO');
  end if;

  select * into it from inventory.items where cikk = v_cikk;
  if not found then
    return inventory.nok('R-01', 'ISMERETLEN CIKK') || jsonb_build_object('cikk', v_cikk);
  end if;

  return jsonb_build_object('status', 'OK', 'cikk', it.cikk, 'megnevezes', it.megnevezes,
                            'keszlet', it.keszlet, 'foglalt', it.foglalt,
                            'szabad', it.keszlet - it.foglalt, 'min', it.min_keszlet);
end;
$$;

-- VISSZARU_BE {cikk, db, ref}: visszáru bevételezése (RMA javítás)
create function inventory.cmd_visszaru_be(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cikk integer := (msg->>'cikk')::integer;
  v_db   integer := (msg->>'db')::integer;
  v_ref  text    := msg->>'ref';
  v_uj   integer;
begin
  if v_cikk is null or v_db is null or v_ref is null or v_db <= 0 then
    return inventory.nok('R-02', 'HIBAS PARANCS: CIKK, DB, REF KOTELEZO');
  end if;

  update inventory.items
     set keszlet = keszlet + v_db, updated_epoch = inventory.most_epoch()
   where cikk = v_cikk
  returning keszlet into v_uj;
  if not found then
    return inventory.nok('R-01', 'ISMERETLEN CIKK') || jsonb_build_object('cikk', v_cikk);
  end if;

  insert into inventory.movements (cikk, db, tipus, ref) values (v_cikk, v_db, 'VISSZARU', v_ref);

  return jsonb_build_object('status', 'OK', 'uzenet', 'VISSZARU BEVETELEZVE', 'cikk', v_cikk, 'keszlet', v_uj);
end;
$$;

create function inventory.vegrehajt(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  case msg->>'cmd'
    when 'FOGLAL'      then return inventory.cmd_foglal(msg);
    when 'FELOLD'      then return inventory.cmd_felold(msg);
    when 'MOZGAS'      then return inventory.cmd_mozgas(msg);
    when 'LEKERDEZ'    then return inventory.cmd_lekerdez(msg);
    when 'VISSZARU_BE' then return inventory.cmd_visszaru_be(msg);
    else return inventory.nok('R-02', 'ISMERETLEN PARANCS');
  end case;
end;
$$;

-- A worker: pg_cron hívja 5 másodpercenként.
create function inventory.process_commands()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  m        record;
  v_valasz jsonb;
  n        integer := 0;
begin
  for m in select * from pgmq.read('inventory_commands', 30, 20) loop
    if m.read_ct > 3 then
      perform pgmq.archive('inventory_commands', m.msg_id);
      perform inventory.valaszol(m.message->>'corr', inventory.nok('R-99', 'BELSO HIBA'));
      continue;
    end if;

    begin
      v_valasz := inventory.vegrehajt(m.message);
      perform inventory.valaszol(m.message->>'corr', v_valasz);
      perform pgmq.delete('inventory_commands', m.msg_id);
      n := n + 1;
    exception when others then
      raise warning 'inventory_commands % feldolgozasa sikertelen (read_ct=%): %', m.msg_id, m.read_ct, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke execute on all functions in schema inventory from public;
grant execute on all functions in schema inventory to service_role;

select cron.schedule('inventory-worker', '5 seconds', 'select inventory.process_commands()');
