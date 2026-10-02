-- Üzenetsorok (Supabase Queues / pgmq)
select pgmq.create('inventory_commands');
select pgmq.create('inventory_replies');
select pgmq.create('inventory_alerts');
select pgmq.create('order_events');
select pgmq.create('payment_events');
