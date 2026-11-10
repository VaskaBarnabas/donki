-- 19. fázis: a mérés eredményei (docs/FAZIS19_TERV.md). Futásonként egy sor: feladat × változat × modell × ismétlés,
-- egy méréscímke alatt (pl. 2026-11-03). A riport (scripts/ertekeles/riport.ts) ebből bármikor újragenerálható, és egy
-- megszakadt mérés folytatható (a már meglévő sorokat a futtató kihagyja).

create schema ertekeles;

create table ertekeles.futas (
  id               bigint generated always as identity primary key,
  meres            text not null,
  feladat          text not null,
  valtozat         text not null check (valtozat in ('nyers', 'mcp')),
  modell           text not null,
  ismetles         integer not null,
  eredmeny         text not null check (eredmeny in ('siker', 'reszben', 'sikertelen', 'hiba')),
  megjegyzes       text,
  keres            text,
  valasz           text,
  agens_futas      uuid,                -- agens.futas (a lépések és a tokenek)
  ido_ms           integer,             -- a kéréstől a válaszig (a jóváhagyások gépi idejével együtt)
  modell_hivas     integer,
  eszkoz_hivas     integer,
  hibas_eszkoz     integer,
  token_be         integer,
  token_ki         integer,
  jovahagyas       integer,             -- elvárt író lépés, amelyet a futtató jóváhagyott (emberi beavatkozás)
  nem_vart_iras    integer,             -- nem várt író lépés (elutasítva, hibának számít)
  visszakerdezett  boolean,
  letrejott        timestamptz not null default now(),
  unique (meres, feladat, valtozat, modell, ismetles)
);
