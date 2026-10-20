-- Seed – a rendszer saját adatai (a korábbi közös supabase/seed.sql szakasza).
-- Az adatbázis első indulásakor fut le; visszaállítás: npm run stack:reset
-- A nyitott ajánlatok (AJ-2026-0040…0042) érvényessége 2027.03.31: a lusta lejárat miatt egy korábbi dátum a
-- bemutatót és a teszteket a naptártól tenné függővé.

-- ================================================================ quote
insert into quote.templates (id, nev, fejlec, lablec, ervenyesseg_nap) values
  (1, 'Általános ajánlat', 'Tisztelt Partnerünk! Az alábbiakban küldjük árajánlatunkat.', 'Az árak nettó árak, az ÁFA mértéke 27%. Az ajánlat a megadott dátumig érvényes.', 30),
  (2, 'Viszonteladói ajánlat', 'Viszonteladói árajánlat – bizalmas.', 'Viszonteladói kondíciók, továbbértékesítésre. Fizetési határidő: 15 nap.', 15);

insert into quote.quotes (id, partner_id, template_id, created_on, valid_until, status, total_net, total_discount_pct, approval_reason, approved_by, approved_on, order_ref) values
  ('AJ-2026-0035', '10000000-0000-4000-8000-000000000003', 1, '2026-01-29', '2026-02-28', 'ELFOGADVA', 4210328, 8.82, null, null, null, 'RND-100035'),
  ('AJ-2026-0036', '10000000-0000-4000-8000-000000000005', 1, '2026-04-10', '2026-05-10', 'ELUTASITVA', 514300, 0.00, null, null, null, null),
  ('AJ-2026-0037', '10000000-0000-4000-8000-000000000008', 1, '2026-08-01', '2026-08-31', 'LEJART', 1618800, 0.00, null, null, null, null),
  ('AJ-2026-0038', '10000000-0000-4000-8000-000000000015', 1, '2026-09-01', '2026-10-01', 'ELFOGADVA', 582860, 9.38, null, null, null, 'RND-100040'),
  ('AJ-2026-0039', '10000000-0000-4000-8000-000000000017', 2, '2026-09-09', '2026-09-24', 'ELFOGADVA', 6397771, 15.22, 'Viszonteladói projekt, versenyajánlat', 'Horváth Zoltán', '2026-09-11', 'RND-100042'),
  ('AJ-2026-0040', '10000000-0000-4000-8000-000000000018', 1, '2026-09-26', '2027-03-31', 'JOVAHAGYOTT', 1066018, 15.29, 'Éves keretszerződés része', 'Horváth Zoltán', '2026-09-29', null),
  ('AJ-2026-0041', '10000000-0000-4000-8000-000000000025', 2, '2026-09-30', '2027-03-31', 'JOVAHAGYASRA_VAR', 2507503, 17.86, 'Nagy tételes viszonteladói rendelés, konkurens ajánlat 18%', null, null, null),
  ('AJ-2026-0042', '10000000-0000-4000-8000-000000000023', 1, '2026-10-01', '2027-03-31', 'PISZKOZAT', 0, 0, null, null, null, null);

insert into quote.quote_lines (quote_id, product_code, qty, unit_price, line_discount_pct, line_net) values
  ('AJ-2026-0035', 'TK-00008', 12, 289900, 0, 3171970),
  ('AJ-2026-0035', 'TK-00011', 12, 94900, 0, 1038358),
  ('AJ-2026-0036', 'TK-00028', 5, 54900, 0, 274500),
  ('AJ-2026-0036', 'TK-00030', 2, 119900, 0, 239800),
  ('AJ-2026-0037', 'TK-00016', 6, 189900, 0, 1139400),
  ('AJ-2026-0037', 'TK-00015', 6, 79900, 0, 479400),
  ('AJ-2026-0038', 'TK-00001', 3, 89900, 0, 256215),
  ('AJ-2026-0038', 'TK-00022', 15, 24900, 2, 326645),
  ('AJ-2026-0039', 'TK-00009', 15, 429900, 5, 5466909),
  ('AJ-2026-0039', 'TK-00010', 20, 54900, 5, 930862),
  ('AJ-2026-0040', 'TK-00032', 4, 149900, 8, 507501),
  ('AJ-2026-0040', 'TK-00028', 12, 54900, 5, 558517),
  ('AJ-2026-0041', 'TK-00029', 60, 32900, 5, 1603382),
  ('AJ-2026-0041', 'TK-00031', 12, 89900, 4, 904121),
  ('AJ-2026-0042', 'TK-00010', 8, 54900, 0, null),
  ('AJ-2026-0042', 'TK-00008', 8, 289900, 0, null);


-- sorszámok a seedelt azonosítók fölé
select setval('quote.quote_seq', 42);
select setval(pg_get_serial_sequence('quote.templates', 'id'), 2);
