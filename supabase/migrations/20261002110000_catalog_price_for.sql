-- Ár lekérdezése egy termékre egy adott ügyfélcsoportnak: listaár - ügyfélcsoport-kedvezmény.
-- (A tétel- és mennyiségi kedvezmény az ajánlatmotor TypeScript kódjában van, nem itt.)
-- PostgREST: POST /rest/v1/rpc/price_for, Content-Profile: catalog
--            {"product_code": "TK-00001", "customer_group": "TORZS"}
-- Hibák: ismeretlen termékkód -> HTTP 404, ismeretlen ügyfélcsoport -> HTTP 400.
-- Inaktív termékre is ad árat, az active mező jelzi.

create type catalog.price_info as (
  product_code   text,
  name           text,
  category_id    text,
  customer_group text,
  list_price     numeric(12,2),
  discount_pct   numeric(5,2),
  price          numeric(12,2),
  active         boolean
);

create function catalog.price_for(product_code text, customer_group text)
returns catalog.price_info
language plpgsql
stable
set search_path = ''
as $$
declare
  p   catalog.products%rowtype;
  pct numeric(5,2);
  r   catalog.price_info;
begin
  if price_for.customer_group is null
     or price_for.customer_group not in ('NORMAL', 'TORZS', 'VISZONTELADO', 'KIEMELT') then
    raise exception 'Ismeretlen ugyfelcsoport: %', price_for.customer_group
      using errcode = 'PT400',
            hint = 'Ervenyes ertekek: NORMAL, TORZS, VISZONTELADO, KIEMELT';
  end if;

  select * into p from catalog.products where code = price_for.product_code;
  if not found then
    raise exception 'Ismeretlen termekkod: %', price_for.product_code
      using errcode = 'PT404';
  end if;

  select d.discount_pct into pct
    from catalog.customer_group_discounts d
   where d.customer_group = price_for.customer_group
     and d.category_id = p.category_id;

  r.product_code   := p.code;
  r.name           := p.name;
  r.category_id    := p.category_id;
  r.customer_group := price_for.customer_group;
  r.list_price     := p.list_price;
  r.discount_pct   := coalesce(pct, 0);
  r.price          := round(p.list_price * (1 - coalesce(pct, 0) / 100), 2);
  r.active         := p.active;
  return r;
end;
$$;

revoke execute on function catalog.price_for(text, text) from public, anon;
grant execute on function catalog.price_for(text, text) to authenticated, service_role;
