// Adatelérés a független rendszerekben (15. fázis): minden rendszer a SAJÁT adatbázisát éri el, a mellette futó
// belső PostgREST-en keresztül, a saját JWT-titkával. A Supabase-ben a modulok adatai többé nincsenek.
//
//   createServiceClient()  – a rendszer saját adatbázisa   (RENDSZER_DB_URL, RENDSZER_DB_JWT_SECRET)
//   crmKliens()            – a CRM és katalógus hivatalos PostgREST interfésze (CRM_API_URL, CRM_API_KEY)
//   raktarSorKliens()      – a raktár üzenetsora (pgmq_public), a raktár PostgREST-jén (INVENTORY_API_URL, INVENTORY_API_KEY)
//
// A más rendszerek felé NEM a JWT-titok, hanem egy előre kiállított API-kulcs (JWT) kerül a hívóhoz: így nem tud
// magának más jogú tokent kiállítani. A raktár kulcsa csak az üzenetsort éri el (sor_kliens szerepkör).
//
// A kliens a Supabase kliensével azonos módon használható: .schema('x').from(…) / .rpc(…).
// (A számlázó PDF-tárhelye külön modul: lib/rendszer/tarhely.ts.)

import { PostgrestClient } from '@supabase/postgrest-js'
import { szolgaltatasJwt } from './jwt'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- séma-típusok nélkül dolgozunk, ahogy eddig is
export type Adatkliens = PostgrestClient<any, any, any>

function kotelezo(nev: string): string {
  const v = process.env[nev]
  if (!v) throw new Error(`Hianyzo kornyezeti valtozo: ${nev}`)
  return v
}

function kliens(url: string, token: string): Adatkliens {
  return new PostgrestClient(url, { headers: { Authorization: `Bearer ${token}` } })
}

/** A rendszer saját adatbázisa (service_role szerepkörrel, a rendszer saját JWT-titkából). */
export function createServiceClient(): Adatkliens {
  return kliens(kotelezo('RENDSZER_DB_URL'), szolgaltatasJwt(kotelezo('RENDSZER_DB_JWT_SECRET')))
}

/** A CRM és katalógus rendszer PostgREST interfésze. */
export function crmKliens(): Adatkliens {
  return kliens(kotelezo('CRM_API_URL'), kotelezo('CRM_API_KEY'))
}

/** A raktárrendszer üzenetsora (pgmq_public.send/read/delete). */
export function raktarSorKliens(): Adatkliens {
  return kliens(kotelezo('INVENTORY_API_URL'), kotelezo('INVENTORY_API_KEY'))
}
