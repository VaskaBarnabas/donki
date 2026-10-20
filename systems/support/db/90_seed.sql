-- Seed – a rendszer saját adatai (a korábbi közös supabase/seed.sql szakasza).
-- Az adatbázis első indulásakor fut le; visszaállítás: npm run stack:reset

-- ================================================================ support
insert into support.tickets (id, partner_tax_number, order_no, product_code, leiras, statusz, created_at, updated_at) values
  ('HJ-000317', '33461751-2-04', 100041, 'TK-00002', 'A szines lezernyomtato rendszeresen papirelakadast jelez a 2. talcabol.', 'FOLYAMATBAN', '2026-09-28 08:30:00+00', '2026-09-28 08:30:00+00'),
  ('HJ-000318', '22231165-2-02', 100034, 'TK-00038', 'Tobb hallasvedo fultok pantja eltort hasznalat kozben.', 'UJ', '2026-09-30 13:10:00+00', '2026-09-30 13:10:00+00'),
  ('HJ-000319', '14692352-2-06', 100043, 'TK-00013', 'Ugyfel jelzi: a szunetmentes tapegysegek meg nem erkeztek meg, garancialis kerdes.', 'VARAKOZIK', '2026-10-01 09:45:00+00', '2026-10-01 09:45:00+00'),
  ('HJ-000320', '11423230-2-41', 100999, 'TK-00001', 'Nyomtato nem kapcsol be. Rendelesszam az ugyfel szerint 100999.', 'UJ', '2026-10-01 16:00:00+00', '2026-10-01 16:00:00+00'),
  ('HJ-000321', '32038523-2-19', 100035, 'TK-00008', 'Az asztali szamitogep nem indul, tapegyseg hiba gyanu.', 'FOLYAMATBAN', '2026-09-22 10:20:00+00', '2026-09-22 10:20:00+00');

insert into support.rma (id, ticket_id, tipus, statusz, csere_cikk, created_at) values
  ('RMA-2026-0012', 'HJ-000321', 'CSERE', 'NYITOTT', 4708, '2026-09-23 09:00:00+00');


-- sorszámok a seedelt azonosítók fölé
select setval('support.hibajegy_seq', 321);
select setval('support.rma_seq', 12);
