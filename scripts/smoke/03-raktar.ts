/**
 * 3. fázis füstteszt: raktári worker a pgmq sorokon keresztül, a rendelésmodul poll segédjével.
 * A tesztmozgásokat visszafordítja (ref: SMOKE-…); a DLQ-teszt a 30 mp-es láthatósági idő miatt ~2 perc.
 *
 * Futtatás: npx tsx scripts/smoke/03-raktar.ts
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { raktarHivas, type RaktarParancs } from '../../legacy/orders/raktar-hivas'

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = { ...loadEnv('.env.local'), ...process.env } as Record<string, string>
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const queues = supabase.schema('pgmq_public')
const REF = `SMOKE-${Date.now()}`

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)}`}`)
}

async function hiv(parancs: RaktarParancs) {
  const { valasz } = await raktarHivas(supabase, parancs)
  return valasz
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
  console.log(`3. fázis füstteszt – raktár (ref: ${REF})\n`)

  // Tesztcikkek a seedből: egy foglalás nélküli, minimum feletti és egy 0 készletű cikk
  const { data: items, error } = await supabase
    .schema('inventory')
    .from('items')
    .select('cikk, keszlet, foglalt, min_keszlet')
    .order('cikk')
  if (error || !items) throw new Error(`items lekérdezés: ${error?.message}`)
  const cikk = items.find((i) => i.foglalt === 0 && i.keszlet > i.min_keszlet && i.min_keszlet > 0)!
  const ures = items.find((i) => i.keszlet === 0)!
  console.log(`tesztcikk: ${cikk.cikk} (keszlet ${cikk.keszlet}, min ${cikk.min_keszlet}), ures cikk: ${ures.cikk}\n`)

  // FOGLAL – OK és NOK ág
  const foglal = await hiv({ cmd: 'FOGLAL', cikk: cikk.cikk, db: 1, ref: REF })
  check('FOGLAL OK', foglal?.status === 'OK' && foglal.szabad === cikk.keszlet - 1, foglal)

  const nok = await hiv({ cmd: 'FOGLAL', cikk: ures.cikk, db: 1, ref: REF })
  check('FOGLAL NOK R-03 (szabad: 0)', nok?.status === 'NOK' && nok.hibakod === 'R-03' && nok.szabad === 0, nok)

  const r01 = await hiv({ cmd: 'FOGLAL', cikk: 9999, db: 1, ref: REF })
  check('FOGLAL ismeretlen cikk R-01', r01?.hibakod === 'R-01', r01)

  const r02 = await hiv({ cmd: 'TOROL', ref: REF } as unknown as RaktarParancs)
  check('ismeretlen parancs R-02', r02?.hibakod === 'R-02', r02)

  // LEKERDEZ – egyes és többes
  const lek = await hiv({ cmd: 'LEKERDEZ', cikk: cikk.cikk })
  check('LEKERDEZ egyes (foglalt +1)', lek?.status === 'OK' && lek.foglalt === cikk.foglalt + 1, lek)

  const lekTobb = await hiv({ cmd: 'LEKERDEZ', cikkek: [cikk.cikk, 9999] })
  check(
    'LEKERDEZ többes, ismeretlen tömb',
    lekTobb?.status === 'OK' &&
      (lekTobb.tetelek as unknown[]).length === 1 &&
      JSON.stringify(lekTobb.ismeretlen) === '[9999]',
    lekTobb
  )

  // FELOLD – OK, majd R-04
  const felold = await hiv({ cmd: 'FELOLD', ref: REF })
  check('FELOLD OK', felold?.status === 'OK' && felold.feloldott === 1, felold)

  const r04 = await hiv({ cmd: 'FELOLD', ref: REF })
  check('FELOLD újra R-04', r04?.hibakod === 'R-04', r04)

  // MOZGAS KI a minimum alá → figyelmeztetés, majd visszaállítás
  const kiDb = cikk.keszlet - cikk.min_keszlet + 1
  const ki = await hiv({ cmd: 'MOZGAS', cikk: cikk.cikk, tipus: 'KI', db: kiDb, ref: REF })
  check(`MOZGAS KI ${kiDb} db (minimum alá)`, ki?.status === 'OK' && ki.keszlet === cikk.min_keszlet - 1, ki)

  const { data: alerts } = await queues.rpc('read', { queue_name: 'inventory_alerts', sleep_seconds: 0, n: 100 })
  const alert = ((alerts ?? []) as { msg_id: number; message: Record<string, unknown> }[]).find(
    (m) => m.message.tipus === 'MIN_KESZLET_ALATT' && m.message.cikk === cikk.cikk
  )
  check('MIN_KESZLET_ALATT figyelmeztetés', !!alert && alert.message.keszlet === cikk.min_keszlet - 1, alerts)
  if (alert) await queues.rpc('delete', { queue_name: 'inventory_alerts', message_id: alert.msg_id })

  const vissza = await hiv({ cmd: 'MOZGAS', cikk: cikk.cikk, tipus: 'KORREKCIO', db: kiDb, ref: REF })
  check('KORREKCIO visszaállítás', vissza?.status === 'OK' && vissza.keszlet === cikk.keszlet, vissza)

  // DLQ: hibás üzenet ("cikk":"abc") → 3 sikertelen próbálkozás → archívum + R-99
  const dlqCorr = `smoke-dlq-${Date.now()}`
  await queues.rpc('send', {
    queue_name: 'inventory_commands',
    message: { cmd: 'FOGLAL', corr: dlqCorr, cikk: 'abc', db: 1, ref: REF },
    sleep_seconds: 0,
  })
  console.log('\nDLQ teszt: várakozás az archiválásra (max. 3 perc)…')
  const kezdet = Date.now()
  let r99: Record<string, unknown> | undefined
  while (!r99 && Date.now() - kezdet < 180_000) {
    await new Promise((r) => setTimeout(r, 5_000))
    const { data } = await queues.rpc('read', { queue_name: 'inventory_replies', sleep_seconds: 0, n: 100 })
    const m = ((data ?? []) as { msg_id: number; message: Record<string, unknown> }[]).find(
      (x) => x.message.corr === dlqCorr
    )
    if (m) {
      r99 = m.message
      await queues.rpc('delete', { queue_name: 'inventory_replies', message_id: m.msg_id })
    }
  }
  console.log(`(${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  check('hibás üzenet: R-99 válasz', r99?.hibakod === 'R-99', r99)

  const archiv = sqlQuery(
    `select read_ct from pgmq.a_inventory_commands where message->>'corr' = '${dlqCorr}'`
  )
  check('hibás üzenet az archívumban (read_ct > 3)', archiv.length === 1 && Number(archiv[0].read_ct) > 3, archiv)

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
