-- A régi modulsémák törlése (15. fázis óta minden rendszer a saját konténerében, saját adatbázissal fut;
-- a Supabase-ben csak a felhasználók maradnak: Auth, public.profiles, integrations, control_log).
-- Mentés a törlés előtt: ../supabase-mentes-2026-11-02/ (semak.sql, adatok.sql).

-- 1. Az időzített feladatok (a régi sémákon dolgoztak, az inventory-worker 5 másodpercenként)
select cron.unschedule(jobname) from cron.job
 where jobname in ('billing-lejart', 'orders-szallitas-szimulacio', 'inventory-worker');

-- 2. Az üzenetsorok (a raktár és a rendeléskezelő a saját adatbázisában tartja őket)
select pgmq.drop_queue(queue_name) from pgmq.list_queues()
 where queue_name in ('inventory_commands', 'inventory_replies', 'inventory_alerts', 'order_events', 'payment_events');

-- 3. A modulsémák (a Flowable a rendeléskezelő adatbázisában, az MCP napló az MCP saját adatbázisában)
drop schema if exists crm, catalog, quote, orders, inventory, billing, payment, support, flowable, mcp cascade;
