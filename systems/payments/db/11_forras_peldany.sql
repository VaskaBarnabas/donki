-- 16. fázis: a kártyás fizetések gazdája a Stripe; a fizetési rendszer ehhez egyeztet.
--   source: STRIPE (a Stripe-ban létező fizetés) | LEGACY_IMPORT (korábbi rendszerből átvett, Stripe nélküli tétel –
--           ezek a Stripe-ban nem léteznek, ezért az egyeztetés nem keresi őket ott)
--   payment.peldany: az adatbázis-példány azonosítója; a Stripe metaadataiba kerül (systemInstance), így a Stripe teszt
--           fiókban maradt, korábbi (eldobott) adatbázisokhoz tartozó fizetések nem keverednek az egyeztetésbe.
alter table payment.payments
  add column source text not null default 'STRIPE' check (source in ('STRIPE', 'LEGACY_IMPORT'));

create table payment.peldany (
  id         text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at timestamptz not null default now()
);
insert into payment.peldany default values;
alter table payment.peldany enable row level security;
grant select on payment.peldany to service_role;
