-- Rendelések: rögzítés és tételcsere egy tranzakcióban, részletes hibaok a folyamattörténetben.
-- A tételek: [{"productCode": "TK-00001", "qty": 3, "unitPrice": 85405.00}, …]

alter table orders.process_history add column detail text;

create function orders.rendeles_rogzit(p_quote_ref text, p_partner_id uuid, p_tetelek jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_order_no bigint;
begin
  insert into orders.orders (quote_ref, partner_id)
  values (nullif(p_quote_ref, ''), p_partner_id)
  returning order_no into v_order_no;

  insert into orders.order_lines (order_no, product_code, qty, unit_price)
  select v_order_no, t->>'productCode', (t->>'qty')::integer, (t->>'unitPrice')::numeric
    from jsonb_array_elements(p_tetelek) as t;

  return v_order_no;
end;
$$;

create function orders.tetelek_csere(p_order_no bigint, p_tetelek jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from orders.order_lines where order_no = p_order_no;

  insert into orders.order_lines (order_no, product_code, qty, unit_price)
  select p_order_no, t->>'productCode', (t->>'qty')::integer, (t->>'unitPrice')::numeric
    from jsonb_array_elements(p_tetelek) as t;

  update orders.orders set updated_at = now() where order_no = p_order_no;
end;
$$;

revoke execute on function orders.rendeles_rogzit(text, uuid, jsonb) from public;
revoke execute on function orders.tetelek_csere(bigint, jsonb) from public;
grant execute on function orders.rendeles_rogzit(text, uuid, jsonb) to service_role;
grant execute on function orders.tetelek_csere(bigint, jsonb) to service_role;
