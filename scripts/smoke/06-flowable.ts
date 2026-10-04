/**
 * 6. fázis füstteszt: Flowable konténer a Supabase Postgres-en, REST kliens, BPMN telepítés és futtatás.
 * Futó Flowable konténert igényel (npm run flowable:up).
 *
 * Futtatás: npx tsx scripts/smoke/06-flowable.ts
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  aktivFeladatok,
  feladatKeres,
  feladatLezaras,
  folyamatInditas,
  folyamatPeldany,
  folyamatValtozok,
  motorVerzio,
  telepit,
  uzenetKuldes,
} from '../../lib/flowable/client'

process.loadEnvFile('.env.local')

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)}`}`)
}

// A Supabase CLI néha telemetria-időtúllépéssel lép ki (plusz {"_tag":"Error"…} sor), pedig a lekérdezés lefutott.
function sqlQuery(sql: string): Record<string, unknown>[] {
  let out: string
  try {
    out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? ''
    if (!out.includes('"rows"')) throw e
  }
  return (JSON.parse(out.slice(0, out.indexOf('\n{"_tag"') + 1 || undefined)) as { rows: Record<string, unknown>[] }).rows
}

async function main() {
  console.log(`6. fázis füstteszt – Flowable (${process.env.FLOWABLE_REST_URL})\n`)

  // Motor és hozzáférés
  const verzio = await motorVerzio()
  check(`motor elérhető, verzió: ${verzio}`, verzio.startsWith('7.'), verzio)

  const alap = await fetch(`${process.env.FLOWABLE_REST_URL}/management/engine`, {
    headers: { Authorization: `Basic ${Buffer.from('rest-admin:test').toString('base64')}` },
  })
  check('beépített rest-admin/test letiltva → 401', alap.status === 401, alap.status)

  // Táblák a flowable sémában, a public-ban nincs
  const tablak = sqlQuery(
    `select table_schema, count(*)::int as db from information_schema.tables
      where table_name ilike 'act\\_%' or table_name ilike 'flw\\_%' group by 1`
  )
  const flowable = tablak.find((t) => t.table_schema === 'flowable')
  check('Flowable táblák a flowable sémában', Number(flowable?.db) > 50, tablak)
  check('nincs Flowable tábla más sémában', tablak.every((t) => t.table_schema === 'flowable'), tablak)

  // Próba BPMN: telepítés, indítás business key-jel, user task, üzenet, befejezés
  const d = await telepit('proba_folyamat.bpmn20.xml', readFileSync('flowable/test/proba_folyamat.bpmn20.xml', 'utf8'))
  check('próba BPMN telepítve', !!d.id, d)

  const businessKey = `SMOKE-${Date.now()}`
  const p = await folyamatInditas('proba_folyamat', businessKey, { appBaseUrl: 'http://host.docker.internal:3000', proba: 42 })
  check('folyamat elindítva business key-jel', p.businessKey === businessKey && !p.ended, p)

  const valtozok = await folyamatValtozok(p.id)
  check('folyamatváltozók átadva (appBaseUrl, proba)', valtozok.appBaseUrl === 'http://host.docker.internal:3000' && valtozok.proba === 42, valtozok)

  const feladatok = await aktivFeladatok(p.id)
  check('aktív user task: proba_feladat', feladatok.length === 1 && feladatok[0].taskDefinitionKey === 'proba_feladat', feladatok)

  check('üzenet a user task alatt → nem vár rá (false)', (await uzenetKuldes(p.id, 'ProbaUzenet')) === false, null)

  const feladat = await feladatKeres(p.id, 'proba_feladat')
  await feladatLezaras(feladat!.id, { jovahagyta: 'smoke' })
  check('user task lezárva, nincs több aktív feladat', (await aktivFeladatok(p.id)).length === 0, null)

  check('ProbaUzenet elküldve', (await uzenetKuldes(p.id, 'ProbaUzenet')) === true, null)
  check('folyamat befejeződött', (await folyamatPeldany(p.id)) === null, null)

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni (fut a Flowable konténer?): ${e.message}`)
  process.exit(1)
})
