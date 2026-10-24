-- 16. fázis: a bizonylatok gazdája a Számlázz.hu (Számla Agent). A számlázó saját adatbázisa a hivatkozást és a
-- szinkron állapotát tartja; a gazda által visszaadott összeg felülírja a sajátot (a Számlázz.hu forintban egészre kerekít).
--   szamlazz_szam        – a Számlázz.hu sorszáma (D-TST-…, E-TST-…)
--   szamlazz_kulso_azon  – a Számlázz.hu-ban rögzített külső azonosító: <saját sorszám>@<adatbázis-példány>
--   szinkron_allapot     – NINCS (még nincs a Számlázz.hu-ban) | OK | ELTERES | HIANYZIK
alter table billing.szamlak
  add column szamlazz_szam       text unique,
  add column szamlazz_kulso_azon text unique,
  add column szinkron_allapot    text not null default 'NINCS' check (szinkron_allapot in ('NINCS', 'OK', 'ELTERES', 'HIANYZIK')),
  add column szinkron_reszlet    text,
  add column szinkron_ido        timestamptz;

-- Az adatbázis-példány azonosítója: egy stack:reset után új, így a Számlázz.hu külső azonosítói nem keverednek.
create table billing.peldany (
  id         text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at timestamptz not null default now()
);
insert into billing.peldany default values;

alter table billing.peldany enable row level security;
grant select on billing.peldany to service_role;
