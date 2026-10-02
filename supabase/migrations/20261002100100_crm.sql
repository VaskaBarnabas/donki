-- CRM törzs: partnerek, kapcsolattartók, értékesítési lehetőségek, tevékenységek.
-- Azonosító: UUID, idő: timestamptz (ISO 8601), pénz: numeric(14,2).
-- Kívülről PostgREST-en érhető el (Accept-Profile: crm).

create schema if not exists crm;

create table crm.partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  tax_number     text not null unique
                 check (tax_number ~ '^[0-9]{8}-[1-5]-[0-9]{2}$'),
  address        text,
  customer_group text not null default 'NORMAL'
                 check (customer_group in ('NORMAL', 'TORZS', 'VISZONTELADO', 'KIEMELT')),
  owner_name     text,
  created_at     timestamptz not null default now()
);

create table crm.contacts (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references crm.partners (id) on delete cascade,
  name       text not null,
  email      text,
  phone      text,
  role       text
);

create index contacts_partner_id_idx on crm.contacts (partner_id);

create table crm.deals (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references crm.partners (id) on delete cascade,
  title          text not null,
  stage          text not null default 'erdeklodo'
                 check (stage in ('erdeklodo', 'ajanlat', 'megrendeles', 'lezart')),
  value          numeric(14,2),
  expected_close timestamptz,
  quote_ref      text,
  order_ref      text,
  created_at     timestamptz not null default now()
);

create index deals_partner_id_idx on crm.deals (partner_id);

create table crm.activities (
  id         uuid primary key default gen_random_uuid(),
  partner_id uuid not null references crm.partners (id) on delete cascade,
  deal_id    uuid references crm.deals (id) on delete set null,
  type       text not null
             check (type in ('hivas', 'email', 'megbeszeles', 'statusz_valtas', 'megjegyzes')),
  note       text,
  created_at timestamptz not null default now()
);

create index activities_partner_id_idx on crm.activities (partner_id);
create index activities_deal_id_idx on crm.activities (deal_id);

-- Jogosultságok: service_role mindent, authenticated egyszerű policyval (prototípus).
grant usage on schema crm to service_role, authenticated;
grant all on all tables in schema crm to service_role;
grant select, insert, update, delete on all tables in schema crm to authenticated;
alter default privileges in schema crm grant all on tables to service_role;
alter default privileges in schema crm grant all on sequences to service_role;
alter default privileges in schema crm grant execute on functions to service_role;

alter table crm.partners   enable row level security;
alter table crm.contacts   enable row level security;
alter table crm.deals      enable row level security;
alter table crm.activities enable row level security;

create policy partners_authenticated_all on crm.partners
  for all to authenticated using (true) with check (true);
create policy contacts_authenticated_all on crm.contacts
  for all to authenticated using (true) with check (true);
create policy deals_authenticated_all on crm.deals
  for all to authenticated using (true) with check (true);
create policy activities_authenticated_all on crm.activities
  for all to authenticated using (true) with check (true);
