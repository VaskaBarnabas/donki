-- Fizetés: Stripe Checkout alapú fizetések.
-- Azonosító: belső UUID + Stripe ID-k, idő: timestamptz (ISO), összeg: bigint fillér (Stripe minor unit).
-- Kívülről REST + Stripe webhook.

create schema if not exists payment;

create table payment.payments (
  id                    uuid primary key default gen_random_uuid(),
  invoice_ref           text not null,
  stripe_session_id     text unique,
  stripe_payment_intent text,
  checkout_url          text,
  amount_minor          bigint not null check (amount_minor >= 0),
  currency              text not null default 'huf',
  status                text not null default 'CREATED'
                        check (status in ('CREATED', 'SUCCEEDED', 'FAILED', 'EXPIRED')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index payments_invoice_ref_idx on payment.payments (invoice_ref);

grant usage on schema payment to service_role;
grant all on all tables in schema payment to service_role;
alter default privileges in schema payment grant all on tables to service_role;
alter default privileges in schema payment grant all on sequences to service_role;
alter default privileges in schema payment grant execute on functions to service_role;

alter table payment.payments enable row level security;
