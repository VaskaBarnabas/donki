-- Időzített feladatok (pg_cron, UTC).
-- Az inventory-worker ütemezése a raktári fázisban, a worker függvénnyel együtt kerül be.

-- Számlázás: naponta 02:15-kor a lejárt, nem fizetett számlák megjelölése
select cron.schedule('billing-lejart', '15 2 * * *', 'select billing.jelol_lejart()');

-- Rendelések: a szállítási állapotok léptetése percenként (fuvarozó szimuláció)
select cron.schedule('orders-szallitas-szimulacio', '* * * * *', 'select orders.leptet_szallitasok()');
