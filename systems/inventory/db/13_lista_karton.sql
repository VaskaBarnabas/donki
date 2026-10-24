-- 16. fázis: két új, csak olvasó raktári parancs a portál számára (a raktár továbbra is CSAK üzenetsoron érhető el):
--   {"cmd":"LISTA"}               → minden cikk (cikkszám, megnevezés, készlet, foglalt, szabad, min, utolsó változás)
--   {"cmd":"KARTON","cikk":4701}  → egy cikk kartonja: a cikk + az utolsó 50 foglalás és 50 mozgás
-- A válasz formátuma a raktár meglévő stílusa (magyar mezőnevek, epoch idő).

create function inventory.cmd_lista(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  return jsonb_build_object('status', 'OK', 'tetelek', coalesce((
    select jsonb_agg(jsonb_build_object(
             'cikk', i.cikk, 'megnevezes', i.megnevezes, 'keszlet', i.keszlet, 'foglalt', i.foglalt,
             'szabad', i.keszlet - i.foglalt, 'min', i.min_keszlet, 'valtozas', i.updated_epoch) order by i.cikk)
      from inventory.items i), '[]'::jsonb));
end;
$$;

create function inventory.cmd_karton(msg jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_cikk integer := (msg->>'cikk')::integer;
  it     inventory.items%rowtype;
begin
  if v_cikk is null then
    return inventory.nok('R-02', 'HIBAS PARANCS: CIKK KOTELEZO');
  end if;
  select * into it from inventory.items where cikk = v_cikk;
  if not found then
    return inventory.nok('R-01', 'ISMERETLEN CIKK') || jsonb_build_object('cikk', v_cikk);
  end if;
  return jsonb_build_object(
    'status', 'OK', 'cikk', it.cikk, 'megnevezes', it.megnevezes, 'keszlet', it.keszlet, 'foglalt', it.foglalt,
    'szabad', it.keszlet - it.foglalt, 'min', it.min_keszlet, 'valtozas', it.updated_epoch,
    'foglalasok', coalesce((select jsonb_agg(f) from (
        select id, db, ref, statusz, created_epoch as ido from inventory.reservations where cikk = v_cikk order by id desc limit 50) f), '[]'::jsonb),
    'mozgasok', coalesce((select jsonb_agg(m) from (
        select id, db, tipus, ref, epoch as ido from inventory.movements where cikk = v_cikk order by id desc limit 50) m), '[]'::jsonb));
end;
$$;

create or replace function inventory.vegrehajt(msg jsonb)
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
    when 'LISTA'       then return inventory.cmd_lista(msg);
    when 'KARTON'      then return inventory.cmd_karton(msg);
    else return inventory.nok('R-02', 'ISMERETLEN PARANCS');
  end case;
end;
$$;
