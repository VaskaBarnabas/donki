-- Ügyfélszolgálat: hibajegyek és RMA-k.
-- Azonosítók: HJ-000321, RMA-2026-0012. Idő: timestamptz, a protokollban xsd:dateTime.
-- Kívülről csak SOAP-on keresztül érhető el.

create schema if not exists support;

create sequence support.hibajegy_seq;
create sequence support.rma_seq;

create function support.next_ticket_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'HJ-' || lpad(nextval('support.hibajegy_seq')::text, 6, '0');
$$;

create function support.next_rma_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'RMA-' || to_char(current_date, 'YYYY') || '-'
         || lpad(nextval('support.rma_seq')::text, 4, '0');
$$;

create table support.tickets (
  id                 text primary key default support.next_ticket_id(),
  partner_tax_number text not null,
  order_no           bigint,
  product_code       text,
  leiras             text not null,
  statusz            text not null default 'UJ'
                     check (statusz in ('UJ', 'FOLYAMATBAN', 'VARAKOZIK', 'LEZART')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table support.rma (
  id         text primary key default support.next_rma_id(),
  ticket_id  text not null references support.tickets (id),
  tipus      text not null check (tipus in ('CSERE', 'JAVITAS')),
  statusz    text not null default 'NYITOTT'
             check (statusz in ('NYITOTT', 'BEERKEZETT', 'LEZART')),
  csere_cikk integer,
  created_at timestamptz not null default now()
);

create index rma_ticket_id_idx on support.rma (ticket_id);

grant usage on schema support to service_role;
grant all on all tables in schema support to service_role;
grant all on all sequences in schema support to service_role;
alter default privileges in schema support grant all on tables to service_role;
alter default privileges in schema support grant all on sequences to service_role;
alter default privileges in schema support grant execute on functions to service_role;

alter table support.tickets enable row level security;
alter table support.rma     enable row level security;
