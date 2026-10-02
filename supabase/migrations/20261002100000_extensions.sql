-- Bővítmények: üzenetsorok (Supabase Queues / pgmq) és időzített feladatok (pg_cron)
create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;
