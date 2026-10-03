-- Számlázás: kiállítás és sztornó egy tranzakcióban, PDF tárolás a Számlázz.hu helyett.
--
-- A Számlázz.hu adapter helyett a modul maga állít elő PDF bizonylatot, és a Supabase Storage
-- privát "szamlak" bucketjébe teszi. A szamlazz_id oszlop helyére a PDF útvonala kerül.
--
-- Hibák (sajat SQLSTATE, a TypeScript kód ezeket fordítja protokoll-hibakódra):
--   BL107 – vevő nem található (-> E107), BL108 – számla nem található / nem sztornózható (-> E108)

alter table billing.szamlak rename column szamlazz_id to pdf_utvonal;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('szamlak', 'szamlak', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

-- Számla vagy díjbekérő kiállítása. p_tetelek: [{"megnevezes":…, "mennyiseg":…, "egysegar":…}]
-- (egységár nettó, ÁFA fix 27%). Visszaad: {"szam","netto","afa","brutto","hatarido"}
create function billing.szamla_keszit(
  p_tipus        text,
  p_vevo_kod     text,
  p_rendeles_ref text,
  p_kelt         date,
  p_hatarido_nap integer,
  p_tetelek      jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_szam     text;
  v_netto    numeric(14,2);
  v_afa      numeric(14,2);
  v_hatarido date := p_kelt + p_hatarido_nap;
begin
  if p_tipus not in ('SZAMLA', 'DIJBEKERO') then
    raise exception 'Ervenytelen bizonylattipus: %', p_tipus;
  end if;
  if not exists (select 1 from billing.vevok where kod = p_vevo_kod) then
    raise exception 'Vevo nem talalhato: %', p_vevo_kod using errcode = 'BL107';
  end if;

  v_szam := case p_tipus when 'SZAMLA' then billing.kovetkezo_szamlaszam()
                         else billing.kovetkezo_dijbekero_szam() end;

  select coalesce(sum(round((t->>'mennyiseg')::numeric * (t->>'egysegar')::numeric, 2)), 0)
    into v_netto
    from jsonb_array_elements(p_tetelek) as t;
  v_afa := round(v_netto * 0.27, 2);

  insert into billing.szamlak (szam, tipus, vevo_kod, rendeles_ref, kelt, hatarido, netto, afa, brutto)
  values (v_szam, p_tipus, p_vevo_kod, nullif(p_rendeles_ref, ''), p_kelt, v_hatarido, v_netto, v_afa, v_netto + v_afa);

  insert into billing.szamla_tetelek (szam, sor, megnevezes, mennyiseg, egysegar)
  select v_szam, t.ord::integer, t.v->>'megnevezes', (t.v->>'mennyiseg')::numeric, (t.v->>'egysegar')::numeric
    from jsonb_array_elements(p_tetelek) with ordinality as t(v, ord);

  insert into billing.nav_log (szam, muvelet, statusz, uzenet)
  values (v_szam, 'CREATE', case p_tipus when 'SZAMLA' then 'DONE' else 'NEM_KOTELES' end,
          'Szimulalt adatszolgaltatas (mock)');

  return jsonb_build_object('szam', v_szam, 'netto', v_netto, 'afa', v_afa,
                            'brutto', v_netto + v_afa, 'hatarido', v_hatarido);
end;
$$;

-- Számla sztornózása: negatív összegű STORNO számla, az eredeti sztornozva = true.
-- Már sztornózott számlánál a meglévő sztornó számát adja vissza ("uj": false).
create function billing.szamla_storno(p_szam text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  e        billing.szamlak%rowtype;
  v_storno text;
begin
  select * into e from billing.szamlak where szam = p_szam for update;
  if not found or e.tipus <> 'SZAMLA' then
    raise exception 'Szamla nem talalhato vagy nem sztornozhato: %', p_szam using errcode = 'BL108';
  end if;

  if e.sztornozva then
    select szam into v_storno from billing.szamlak where eredeti_szam = p_szam and tipus = 'STORNO';
    return jsonb_build_object('szam', v_storno, 'uj', false);
  end if;

  v_storno := billing.kovetkezo_szamlaszam();

  insert into billing.szamlak (szam, tipus, vevo_kod, rendeles_ref, kelt, hatarido, netto, afa, brutto, eredeti_szam)
  values (v_storno, 'STORNO', e.vevo_kod, e.rendeles_ref, current_date, current_date,
          -e.netto, -e.afa, -e.brutto, e.szam);

  insert into billing.szamla_tetelek (szam, sor, megnevezes, mennyiseg, egysegar, afa_kulcs)
  select v_storno, sor, megnevezes, -mennyiseg, egysegar, afa_kulcs
    from billing.szamla_tetelek where szam = p_szam;

  update billing.szamlak set sztornozva = true where szam = p_szam;

  insert into billing.nav_log (szam, muvelet, statusz, uzenet)
  values (v_storno, 'STORNO', 'DONE', 'Szimulalt adatszolgaltatas (mock), eredeti: ' || p_szam);

  return jsonb_build_object('szam', v_storno, 'uj', true);
end;
$$;

revoke execute on function billing.szamla_keszit(text, text, text, date, integer, jsonb) from public;
revoke execute on function billing.szamla_storno(text) from public;
grant execute on function billing.szamla_keszit(text, text, text, date, integer, jsonb) to service_role;
grant execute on function billing.szamla_storno(text) to service_role;
