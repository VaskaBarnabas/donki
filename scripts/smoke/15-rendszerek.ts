/**
 * 15. fázis füstteszt: független rendszerek – egészség, függetlenség (adatbázis, titkok, kód), hozzáférés-korlátozás,
 * és a ki/be kapcsolás valódi hatása (kiesés-szimuláció) a vezérlés magján (lib/rendszer/vezerles-mag.ts) keresztül.
 * A portál vezérlő API-ja ugyanezt a magot hívja, admin jogosultság-ellenőrzés után.
 *
 * Előfeltétel: npm run stack:up (a docker-proxy a 127.0.0.1:2375-ön)
 * Futtatás: npx tsx scripts/smoke/15-rendszerek.ts   (~1-2 perc; a végén minden rendszer újra fut)
 */
import { execFileSync } from 'node:child_process'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'
import { rendszerAllapotok, rendszerMuvelet, VezerlesHiba } from '../../lib/rendszer/vezerles-mag'
import { hiv, szerverInditas } from './mcp-segedek'
import { adat, env, psql, URL } from './rendszerek'

process.env.DOCKER_PROXY_URL ??= 'http://localhost:2375'

let failed = 0
let osszes = 0
function check(name: string, ok: boolean, detail: unknown) {
  osszes++
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)?.slice(0, 500)}`}`)
}
let lepes = 0
const szakasz = (c: string) => console.log(`\n${++lepes}. ${c}`)
const var_ = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Egy konténer környezeti változóinak NEVEI (az értékeket nem olvassuk ki). */
function kornyezetNevek(kontener: string): string[] {
  const ki = execFileSync('docker', ['inspect', '--format', '{{json .Config.Env}}', kontener], { encoding: 'utf8' })
  return (JSON.parse(ki) as string[]).map((e) => e.split('=')[0])
}

async function egeszsegVar(url: string, maxMp = 60): Promise<boolean> {
  for (let i = 0; i < maxMp; i += 2) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return true
    } catch {}
    await var_(2000)
  }
  return false
}

async function main() {
  console.log('15. fázis – független rendszerek: egészség, függetlenség, ki/be kapcsolás')
  const kezdet = Date.now()

  // -------------------------------------------------------------- 1. egészség
  szakasz('Minden rendszer egészséges, a saját adatbázisával')
  const allapotok = await rendszerAllapotok()
  check(`8 rendszer: ${allapotok.map((r) => `${r.rendszer}=${r.allapot}`).join(', ')}`, allapotok.length === 8 && allapotok.every((r) => r.allapot === 'fut'), allapotok.map((r) => [r.rendszer, r.allapot]))
  const egeszseges = allapotok.filter((r) => r.egeszseg)
  check(`egészség-végpontok: ${egeszseges.map((r) => `${r.rendszer} ${r.egeszseg!.ok ? 'ok' : 'HIBA'}`).join(', ')}`, egeszseges.length === 7 && egeszseges.every((r) => r.egeszseg!.ok), egeszseges.map((r) => [r.rendszer, r.egeszseg]))
  const db = allapotok.find((r) => r.rendszer === 'orders')!.egeszseg!.reszlet as { checks: Record<string, { ok: boolean }> }
  check(`a rendeléskezelő látja a függőségeit: ${Object.keys(db.checks).join(', ')}`, Object.values(db.checks).every((c) => c.ok), db.checks)
  const mem = allapotok.flatMap((r) => r.kontenerek).reduce((s, k) => s + (k.memoriaMb ?? 0), 0)
  console.log(`     (${allapotok.flatMap((r) => r.kontenerek).length} konténer, összesen ~${mem} MB memória)`)

  // -------------------------------------------------------------- 2. függetlenség
  szakasz('Függetlenség: adatbázis, titkok, kód')
  check('a fizetés adatbázisában nincs rendelési séma', psql<{ n: number }>('payments', "select count(*) as n from pg_namespace where nspname = 'orders'").n === 0, null)
  const quoteEnv = kornyezetNevek('donki-quote-1')
  check('az ajánlatkezelő nem kapja meg a számlázó és a Flowable kulcsát', !quoteEnv.includes('LEGACY_BILLING_KEY') && !quoteEnv.some((n) => n.startsWith('FLOWABLE')), quoteEnv)
  const fizEnv = kornyezetNevek('donki-payments-1')
  check('a fizetés nem kapja meg a Flowable hozzáférést (a rendeléskezelőt a homlokzatán értesíti)', !fizEnv.some((n) => n.startsWith('FLOWABLE')), fizEnv)
  const ugyfelEnv = kornyezetNevek('donki-orders-1')
  check('a raktár ügyfelei API-kulcsot kapnak, nem a raktár JWT-titkát', ugyfelEnv.includes('INVENTORY_API_KEY') && !ugyfelEnv.includes('INVENTORY_JWT_SECRET'), ugyfelEnv)
  const portalEnv = kornyezetNevek('donki-portal-1')
  check('a portál nem kapja meg a Supabase service role kulcsát', !portalEnv.includes('SUPABASE_SERVICE_ROLE_KEY'), portalEnv)
  const kod = execFileSync('docker', ['run', '--rm', '--entrypoint', 'sh', 'donki-billing', '-c', "grep -c 'Rendeles nem talalhato' server.mjs || true"], { encoding: 'utf8' }).trim()
  check('a számlázó képében nincs rendelési kód', kod === '0', kod)
  const sorKulcs = await fetch('http://localhost:54106/items?limit=1', { headers: { Authorization: `Bearer ${env.INVENTORY_API_KEY}`, 'Accept-Profile': 'inventory' } })
  check(`a raktár API-kulcsával csak a sor érhető el, a raktár táblái nem (HTTP ${sorKulcs.status})`, sorKulcs.status === 401 || sorKulcs.status === 403, sorKulcs.status)
  check('a vezérlés a portált nem tudja leállítani', await rendszerMuvelet('portal', 'stop').then(() => false, (e) => e instanceof VezerlesHiba && e.status === 404), null)
  const portal = await fetch('http://localhost:3000/api/rendszerek', { redirect: 'manual' })
  check(`a portál vezérlő API-ja bejelentkezés nélkül nem érhető el (HTTP ${portal.status})`, portal.status === 307 || portal.status === 401, portal.status)

  // -------------------------------------------------------------- 3. kiesés: a számlázó
  szakasz('Kiesés-szimuláció: a számlázó leállítása')
  const fin = await szerverInditas('finance', 3298, 'smoke15')
  let mcp: Client | null = null
  try {
    mcp = await fin.kliens('viewer')
    const elotte = await hiv(mcp, 'get_document', { documentNo: 'SZ-2026-000187' }, { naplo: false })
    check('előtte: az MCP finance get_document működik', elotte.ok, elotte.error)

    const le = await rendszerMuvelet('billing', 'stop')
    check(`billing leállítva: ${le.kontenerek.join(', ')} (sorrend: szolgáltatás → PostgREST → adatbázis)`, le.kontenerek[0] === 'donki-billing-1' && le.kontenerek.at(-1) === 'donki-billing-db-1', le.kontenerek)
    const most = await rendszerAllapotok()
    const billing = most.find((r) => r.rendszer === 'billing')!
    const erintett = most.filter((r) => r.allapot === 'fut' && r.fuggosegek.includes('billing')).map((r) => r.rendszer)
    check(`állapot: billing=${billing.allapot}; érintett (tőle függ): ${erintett.join(', ')}`, billing.allapot === 'leallt' && erintett.includes('payments') && erintett.includes('orders'), { billing: billing.allapot, erintett })
    const protokoll = await fetch(`${URL.billing}/api/legacy/billing`, { method: 'POST', body: 'AUTH|x\nSZAMLA|LEJART' }).then(() => 'valaszolt', () => 'nem erheto el')
    check('a számlázó protokollja nem érhető el', protokoll === 'nem erheto el', protokoll)
    const kiesett = await hiv(mcp, 'get_document', { documentNo: 'SZ-2026-000187' }, { naplo: false })
    check(`MCP: UPSTREAM_UNAVAILABLE, retryable – „${kiesett.error?.message}”`, kiesett.error?.code === 'UPSTREAM_UNAVAILABLE' && kiesett.error.retryable === true, kiesett.error)
    const fizetes = await fetch(`${URL.payments}/api/legacy/payments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.LEGACY_PAYMENTS_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceRef: 'DB-2026-000031' }),
    })
    const fizetesTorzs = (await fizetes.json()) as { error?: { type?: string } }
    check(`a fizetés a saját hibaformájában jelzi a számlázó kiesését: HTTP ${fizetes.status} ${fizetesTorzs.error?.type}`, fizetes.status === 502 && fizetesTorzs.error?.type === 'billing_unavailable', fizetesTorzs)

    await rendszerMuvelet('billing', 'start')
    const vissza = await egeszsegVar(`${URL.billing}/health`)
    const utana = await hiv(mcp, 'get_document', { documentNo: 'SZ-2026-000187' }, { naplo: false })
    check('visszakapcsolás után: egészséges, és az MCP újra kiszolgál (az adatok megmaradtak)', vissza && utana.ok && utana.data.document?.total?.amount === '3676954.80', { vissza, utana: utana.error })
  } finally {
    await mcp?.close()
    fin.leallit()
    await rendszerMuvelet('billing', 'start').catch(() => null)
  }

  // -------------------------------------------------------------- 4. kiesés: a raktár workere
  szakasz('Kiesés-szimuláció: a raktár workere áll – a parancsok a sorban várnak')
  const proxy = process.env.DOCKER_PROXY_URL
  await fetch(`${proxy}/containers/donki-inventory-1/stop`, { method: 'POST' })
  const { corr, valasz } = await raktarHivas({ cmd: 'LEKERDEZ', cikk: 4701 }, 8000)
  check('álló worker mellett a raktár nem válaszol (időtúllépés)', valasz === null, valasz)
  await fetch(`${proxy}/containers/donki-inventory-1/start`, { method: 'POST' })
  let feldolgozva: Record<string, unknown> | undefined
  for (let i = 0; i < 15 && !feldolgozva; i++) {
    await var_(2000)
    const { data } = await adat().schema('pgmq_public').rpc('read', { queue_name: 'inventory_replies', sleep_seconds: 0, n: 100 })
    const m = ((data ?? []) as { msg_id: number; message: Record<string, unknown> }[]).find((x) => x.message.corr === corr)
    if (m) {
      feldolgozva = m.message
      await adat().schema('pgmq_public').rpc('delete', { queue_name: 'inventory_replies', message_id: m.msg_id })
    }
  }
  check(`visszakapcsolás után a sorban várt parancs feldolgozódott (készlet: ${feldolgozva?.keszlet})`, feldolgozva?.status === 'OK', feldolgozva)

  // -------------------------------------------------------------- 5. a végén minden fut
  szakasz('A végén minden rendszer fut')
  await var_(3000)
  const vegul = await rendszerAllapotok()
  check(`8/8 fut: ${vegul.filter((r) => r.allapot === 'fut').length}`, vegul.every((r) => r.allapot === 'fut'), vegul.map((r) => [r.rendszer, r.allapot]))

  console.log(`\n(${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  console.log(failed === 0 ? `Minden ellenőrzés sikeres – a rendszerek függetlenek és egyenként ki/be kapcsolhatók. (${osszes}/${osszes})` : `${failed} / ${osszes} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
