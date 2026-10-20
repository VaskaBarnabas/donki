/**
 * 6. fázis füstteszt: Flowable konténer, REST kliens, BPMN telepítés és futtatás.
 * A 15. fázis óta a Flowable a rendeléskezelő része: a saját "flowable" adatbázisában, az orders-db szerverén.
 * Előfeltétel: npm run stack:up
 *
 * Futtatás: npx tsx scripts/smoke/06-flowable.ts
 */
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
import { psql } from './rendszerek'

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)}`}`)
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

  // Táblák a rendeléskezelő szerverén, a Flowable saját adatbázisában; a rendelési adatbázisban nincs
  const SQL = `select count(*)::int as db from information_schema.tables where table_name ilike 'act\\_%' or table_name ilike 'flw\\_%'`
  const sajat = psql<{ db: number }>('orders', SQL, 'flowable').db
  const rendelesi = psql<{ db: number }>('orders', SQL, 'postgres').db
  check(`Flowable táblák a saját "flowable" adatbázisában (${sajat} db)`, sajat > 50, sajat)
  check('a rendelési adatbázisban nincs Flowable tábla', rendelesi === 0, rendelesi)

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
