-- 17. fázis: az ágens réteg saját adatbázisa. A LangGraph checkpointer a saját tábláit a `langgraph` sémában maga
-- hozza létre (PostgresSaver.setup()); itt az ágens futásainak és lépéseinek naplója van (a 19. fázis mérésének alapja).
create schema agens;
create schema langgraph;

create table agens.futas (
  id            uuid primary key,
  thread_id     text not null,                       -- a LangGraph beszélgetés (checkpointer) azonosítója
  indult        timestamptz not null default now(),
  vege          timestamptz,
  szerep        text not null,                       -- a felhasználó szerepköre, akinek a nevében fut
  keres         text not null,
  modell        text not null,
  agens         text,                                -- a front-desk döntése (melyik szakágens)
  eredmeny      text check (eredmeny in ('kesz', 'visszakerdezett', 'jovahagyasra_var', 'megszakitva', 'hiba')),
  valasz        text,
  token_be      integer not null default 0,
  token_ki      integer not null default 0,
  ido_ms        integer,
  hiba          text
);
create index futas_indult_idx on agens.futas (indult);
create index futas_thread_idx on agens.futas (thread_id);

create table agens.lepes (
  id            bigint generated always as identity primary key,
  futas_id      uuid not null references agens.futas (id) on delete cascade,
  ido           timestamptz not null default now(),
  agens         text not null,                       -- frontdesk | ertekesites | rendeles | ugyfelszolgalat | kivetel
  tipus         text not null check (tipus in ('modell', 'eszkoz', 'jovahagyas', 'skill')),
  eszkoz        text,
  kockazat      text,                                -- read | write | financial | irreversible
  jovahagyas    text check (jovahagyas in ('nem_kell', 'jovahagyva', 'elutasitva')),
  ok            boolean not null default true,
  hibakod       text,
  token_be      integer not null default 0,
  token_ki      integer not null default 0,
  ido_ms        integer not null default 0
);
create index lepes_futas_idx on agens.lepes (futas_id);
