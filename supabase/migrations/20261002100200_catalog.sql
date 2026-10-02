-- Termékkatalógus: kategóriák, termékek, ügyfélcsoport-kedvezmények.
-- Azonosító: TK-00042 (text PK), pénz: numeric(12,2).
-- Kívülről PostgREST-en érhető el (Accept-Profile: catalog).

create schema if not exists catalog;

create sequence catalog.product_code_seq;

create function catalog.next_product_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'TK-' || lpad(nextval('catalog.product_code_seq')::text, 5, '0');
$$;

create table catalog.categories (
  id   text primary key,
  name text not null
);

create table catalog.products (
  code            text primary key default catalog.next_product_code()
                  check (code ~ '^TK-[0-9]{5}$'),
  name            text not null,
  category_id     text not null references catalog.categories (id),
  list_price      numeric(12,2) not null check (list_price >= 0),
  unit            text not null default 'db',
  warranty_months integer not null default 12 check (warranty_months >= 0),
  -- raktári cikkszám az inventory modulban; szándékosan nincs FK (másik modul)
  raktari_kod     integer,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index products_category_id_idx on catalog.products (category_id);

create table catalog.customer_group_discounts (
  customer_group text not null
                 check (customer_group in ('NORMAL', 'TORZS', 'VISZONTELADO', 'KIEMELT')),
  category_id    text not null references catalog.categories (id),
  discount_pct   numeric(5,2) not null check (discount_pct between 0 and 100),
  primary key (customer_group, category_id)
);

grant usage on schema catalog to service_role, authenticated;
grant all on all tables in schema catalog to service_role;
grant all on all sequences in schema catalog to service_role;
grant select, insert, update, delete on all tables in schema catalog to authenticated;
grant usage on sequence catalog.product_code_seq to authenticated;
alter default privileges in schema catalog grant all on tables to service_role;
alter default privileges in schema catalog grant all on sequences to service_role;
alter default privileges in schema catalog grant execute on functions to service_role;

alter table catalog.categories               enable row level security;
alter table catalog.products                 enable row level security;
alter table catalog.customer_group_discounts enable row level security;

create policy categories_authenticated_all on catalog.categories
  for all to authenticated using (true) with check (true);
create policy products_authenticated_all on catalog.products
  for all to authenticated using (true) with check (true);
create policy customer_group_discounts_authenticated_all on catalog.customer_group_discounts
  for all to authenticated using (true) with check (true);
