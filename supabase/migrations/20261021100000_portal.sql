-- 16. fázis: a portál saját adatai a Supabase-ben (a felhasználók mellett):
--   integrations – a bekötött rendszerek (cím + AES-256-GCM-mel titkosított hozzáférési kulcs; a titkosító kulcs csak
--                  a portál szerverén van, így a táblából kiolvasva sem használható)
--   control_log  – a rendszerek ki/be kapcsolásának naplója
-- A szerepkör-ellenőrzés security definer függvényekben van, így a portálnak nem kell a Supabase service kulcsa.

-- ---------------------------------------------------------------- szerepkör-segédek

create function public.sajat_szerepkor()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function public.admin_e()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false)
$$;

-- Felhasználók listája (csak admin): profil + e-mail + regisztráció
create function public.felhasznalok_lista()
returns table (id uuid, email text, display_name text, role text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.admin_e() then
    raise exception 'Csak admin listazhatja a felhasznalokat' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.role, u.created_at, u.last_sign_in_at
      from public.profiles p join auth.users u on u.id = p.id
     order by u.created_at;
end;
$$;

-- Szerepkör beállítása (csak admin; a saját admin szerepkörét senki nem veheti el – így mindig marad admin)
create function public.szerepkor_beallitas(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.admin_e() then
    raise exception 'Csak admin allithat szerepkort' using errcode = '42501';
  end if;
  if p_role not in ('viewer', 'sales', 'logistics', 'finance', 'sales_manager', 'admin') then
    raise exception 'Ismeretlen szerepkor: %', p_role using errcode = '22023';
  end if;
  if p_user = (select auth.uid()) and p_role <> 'admin' then
    raise exception 'A sajat admin szerepkort nem lehet elvenni' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then
    raise exception 'Nincs ilyen felhasznalo' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.felhasznalok_lista() from public, anon;
revoke execute on function public.szerepkor_beallitas(uuid, text) from public, anon;
revoke execute on function public.sajat_szerepkor() from public, anon;
revoke execute on function public.admin_e() from public, anon;
grant execute on function public.felhasznalok_lista() to authenticated;
grant execute on function public.szerepkor_beallitas(uuid, text) to authenticated;
grant execute on function public.sajat_szerepkor() to authenticated;
grant execute on function public.admin_e() to authenticated;

-- ---------------------------------------------------------------- integrációk

create table public.integrations (
  system        text primary key check (system in ('crm', 'quote', 'orders', 'inventory', 'billing', 'payments', 'support')),
  base_url      text not null,
  secret_enc    text not null,
  status        text not null default 'nem_tesztelt' check (status in ('ok', 'hiba', 'nem_tesztelt')),
  last_test_at  timestamptz,
  last_test_msg text,
  configured_by uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);

alter table public.integrations enable row level security;

-- Olvasni minden bejelentkezett felhasználó tudja (a portál szervere az ő munkamenetével kérdez; a kulcsot csak a
-- szerver tudja visszafejteni). Írni csak admin.
create policy integrations_olvasas on public.integrations for select to authenticated using (true);
create policy integrations_iras on public.integrations for all to authenticated
  using ((select public.admin_e())) with check ((select public.admin_e()));

revoke all on public.integrations from anon;
grant select, insert, update, delete on public.integrations to authenticated;
grant all on public.integrations to service_role;

-- ---------------------------------------------------------------- vezérlési napló

create table public.control_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  email   text,
  system  text not null,
  action  text not null check (action in ('start', 'stop', 'restart')),
  result  text not null
);

alter table public.control_log enable row level security;
create policy control_log_admin on public.control_log for all to authenticated
  using ((select public.admin_e())) with check ((select public.admin_e()));

revoke all on public.control_log from anon;
grant select, insert on public.control_log to authenticated;
grant all on public.control_log to service_role;
