-- 18. fázis: az eseményvezérelt kivételkezelő (háttérfigyelő) jelzései. A figyelő az eseménysorokból és időzített
-- MCP-lekérdezésekből észleli a kivételeket (J1–J9), mindegyikről egy jelzést készít a kivételkezelő ágens
-- elemzésével és javaslatával; a portálon a megfelelő szerepkör látja. A figyelő semmit nem módosít.

create table agens.jelzes (
  id               bigint generated always as identity primary key,
  kulcs            text not null,                     -- duplikáció: pl. rendeles:100123:keszlethiany
  szabaly          text not null check (szabaly ~ '^J[0-9]+$'),
  sulyossag        text not null check (sulyossag in ('alacsony', 'kozepes', 'magas')),
  szerepek         text[] not null,                   -- kik látják (az admin mindet)
  cim              text not null,                     -- rövid, géppel összeállított cím
  allapot          text not null default 'UJ' check (allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN', 'MEGOLDVA', 'ELVETVE')),
  forras           jsonb not null,                    -- a nyers esemény vagy lekérdezési tétel
  hivatkozas       jsonb not null default '{}',       -- a lezárás ellenőrzéséhez: pl. {"orderId": "RND-100123", "status": "received"}
  elemzes          text,
  javaslat         text,
  ajanlott_keres   text,                              -- a „Megoldás az asszisztensben” gomb előre kitöltött kérése
  elemzes_modell   boolean not null default false,    -- true: az ágens írta; false: sablonszöveg (a modell nem volt elérhető)
  elemzes_probak   integer not null default 0,
  kovetkezo_elemzes timestamptz,                      -- mikor próbálja újra az elemzést (ha a modell hibázott)
  futas_id         uuid references agens.futas (id) on delete set null,  -- az elemző ágensfutás (lépések idővonala)
  thread_id        text,                              -- ha valaki megnyitotta az asszisztensben
  eszlelesek       integer not null default 1,
  letrejott        timestamptz not null default now(),
  utoljara_eszlelve timestamptz not null default now(),
  lezarva          timestamptz,
  lezarta          text,                              -- felhasználó azonosítója, vagy 'figyelo' (magától)
  lezaras_oka      text
);
-- egy kulcsra egyszerre legfeljebb egy nyitott jelzés – a duplikáció-szűrés alapja, több folyamat esetén is
create unique index jelzes_nyitott_kulcs_idx on agens.jelzes (kulcs) where allapot in ('UJ', 'NYITOTT', 'FOLYAMATBAN');
create index jelzes_allapot_idx on agens.jelzes (allapot, letrejott desc);

-- A figyelő állapota és kapcsolója (a Rendszerek oldalon látszik és kapcsolható); egyetlen sor.
create table agens.figyelo (
  id               boolean primary key default true check (id),
  bekapcsolva      boolean not null default true,
  utolso_kor       timestamptz,
  utolso_hiba      text,
  korok            integer not null default 0,
  feldolgozott_esemeny integer not null default 0
);
insert into agens.figyelo default values;

-- Az időzített szabályok első észlelési ideje (pl. mióta vár egy ajánlat jóváhagyásra – az ajánlat listája
-- nem ad létrehozási időt): kulcs → első észlelés. A már nem észlelt kulcsok törlődnek.
create table agens.megfigyeles (
  kulcs            text primary key,
  elso             timestamptz not null default now(),
  utolso           timestamptz not null default now()
);
