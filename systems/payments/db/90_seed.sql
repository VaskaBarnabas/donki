-- Seed – a rendszer saját adatai (a korábbi közös supabase/seed.sql szakasza).
-- Az adatbázis első indulásakor fut le; visszaállítás: npm run stack:reset

-- ================================================================ payment
insert into payment.payments (id, invoice_ref, stripe_session_id, stripe_payment_intent, checkout_url, amount_minor, currency, status, created_at, updated_at) values
  ('30000000-0000-4000-8000-000000000001', 'SZ-2026-000180', 'cs_test_seed0001aaaaaaaaaaaaaaaaaaaa', 'pi_seed0001bbbbbbbbbbbbbbbb', null, 37616130, 'huf', 'SUCCEEDED', '2026-02-10 14:58:00+00', '2026-02-10 15:12:00+00'),
  ('30000000-0000-4000-8000-000000000002', 'SZ-2026-000181', 'cs_test_seed0002aaaaaaaaaaaaaaaaaaaa', 'pi_seed0002bbbbbbbbbbbbbbbb', null, 534711646, 'huf', 'SUCCEEDED', '2026-03-01 10:40:00+00', '2026-03-01 11:02:00+00'),
  ('30000000-0000-4000-8000-000000000003', 'SZ-2026-000186', 'cs_test_seed0003aaaaaaaaaaaaaaaaaaaa', null, null, 95937324, 'huf', 'EXPIRED', '2026-08-12 09:00:00+00', '2026-08-13 09:00:00+00'),
  ('30000000-0000-4000-8000-000000000004', 'SZ-2026-000187', 'cs_test_seed0004aaaaaaaaaaaaaaaaaaaa', 'pi_seed0004bbbbbbbbbbbbbbbb', null, 367695480, 'huf', 'FAILED', '2026-09-05 13:20:00+00', '2026-09-05 13:24:00+00');


-- sorszámok a seedelt azonosítók fölé

-- A seedelt fizetések a korábbi rendszerből átvett tételek: a Stripe-ban nem léteznek (kitalált azonosítók helyett nincs).
update payment.payments
   set source = 'LEGACY_IMPORT', stripe_session_id = null, stripe_payment_intent = null
 where id::text like '30000000-%';
