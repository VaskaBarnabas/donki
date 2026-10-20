-- 15. fázis: a Supabase-ben csak a felhasználók maradnak (a modulok adatai a független rendszerek saját
-- adatbázisaiba költöztek). Felhasználói profil a hat szerepkör egyikével – a portál ebből dönti el, ki mit tehet
-- (pl. rendszerek ki/be kapcsolása: csak admin); a 17. fázisban az ágensek MCP-szerepköre is ebből jön.

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role         text not null default 'viewer'
               check (role in ('viewer', 'sales', 'logistics', 'finance', 'sales_manager', 'admin')),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A felhasználó a saját profilját olvashatja; szerepkört csak a service role állíthat.
create policy profiles_sajat_olvasas on public.profiles
  for select to authenticated using (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Új felhasználó → profil viewer szerepkörrel
create function public.uj_felhasznalo_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email));
  return new;
end;
$$;

create trigger uj_felhasznalo_profil
  after insert on auth.users
  for each row execute function public.uj_felhasznalo_profil();

-- A meglévő felhasználók a rendszer gazdái: admin
insert into public.profiles (id, display_name, role)
select id, email, 'admin' from auth.users
on conflict (id) do nothing;
