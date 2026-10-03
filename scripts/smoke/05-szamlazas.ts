/**
 * 5. fázis füstteszt: számlázás egyedi szöveges protokollon (POST /api/legacy/billing, text/plain).
 * Futó Next.js szervert igényel (APP_BASE_URL). A teszt egy saját, SMOKE adószámú vevőt és arra
 * szóló számlákat hoz létre (a seed újratöltése eltünteti őket).
 *
 * Futtatás: npx tsx scripts/smoke/05-szamlazas.ts
 */
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = { ...loadEnv('.env.local'), ...process.env } as Record<string, string>
const URL = `${env.APP_BASE_URL ?? 'http://localhost:3000'}/api/legacy/billing`
const KEY = env.LEGACY_BILLING_KEY

async function kuld(parancs: string, kulcs = KEY): Promise<string> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `AUTH|${kulcs}\n${parancs}\n`,
  })
  return (await res.text()).trim()
}

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)}`}`)
}

function maPont(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date()).replaceAll('-', '.')
}

function plusNap(pontos: string, nap: number): string {
  const d = new Date(`${pontos.replaceAll('.', '-')}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + nap)
  return d.toISOString().slice(0, 10).replaceAll('-', '.')
}

async function pdfEllenoriz(nev: string, valasz: string, szam: string) {
  const link = valasz.startsWith('OK|') ? valasz.slice(3) : ''
  if (!link) return check(nev, false, valasz)
  const res = await fetch(link)
  const bajtok = new Uint8Array(await res.arrayBuffer())
  const fejlec = new TextDecoder().decode(bajtok.slice(0, 5))
  const doc = fejlec === '%PDF-' ? await PDFDocument.load(bajtok) : null
  check(nev, res.ok && doc?.getTitle() === szam && doc.getPageCount() >= 1, { status: res.status, fejlec, title: doc?.getTitle() })
}

async function main() {
  if (!KEY) throw new Error('Hiányzó LEGACY_BILLING_KEY a .env.local-ban')
  console.log(`5. fázis füstteszt – számlázás (${URL})\n`)
  const kelt = maPont()

  // Boríték
  check('rossz kulcs → E001', (await kuld('SZAMLA|LEJART', 'rossz')) === 'ERR|E001|AUTH HIBA', null)
  const ketParancs = await fetch(URL, { method: 'POST', body: `AUTH|${KEY}\nSZAMLA|LEJART\nSZAMLA|LEJART` }).then((r) => r.text())
  check('két parancssor → E101', ketParancs.trim().startsWith('ERR|E101'), ketParancs)
  check('ismeretlen parancs → E100', (await kuld('SZAMLA|TOROL|SZ-2026-000180')).startsWith('ERR|E100'), null)
  check('hiányzó mező → E101', (await kuld('PARTNER|KERES')).startsWith('ERR|E101'), null)

  // Partner
  const duna = await kuld('PARTNER|KERES|27346178-2-41')
  check('PARTNER|KERES Duna → eltérő névírás (DUNA-IRODAHAZ KFT.)', duna.startsWith('OK|VEVO-1001|DUNA-IRODAHAZ KFT.|'), duna)
  check('PARTNER|KERES ismeretlen → E107', (await kuld('PARTNER|KERES|11111111-1-11')).startsWith('ERR|E107'), null)

  const adoszam = `99${String(Date.now()).slice(-6)}-2-41`
  const uj = await kuld(`PARTNER|UJ|${adoszam}|Füstteszt Kereskedő Kft|1111 Budapest, Próba utca 1.`)
  const vevo = uj.split('|')[1]
  check('PARTNER|UJ → OK|VEVO-…', /^OK\|VEVO-\d+$/.test(uj), uj)
  check('PARTNER|UJ ugyanarra az adószámra → ugyanaz a kód', (await kuld(`PARTNER|UJ|${adoszam}|MAS NEV|MAS CIM`)) === uj, null)
  const keres = await kuld(`PARTNER|KERES|${adoszam}`)
  check('PARTNER|KERES új vevő → nagybetűs, ékezet nélkül', keres === `OK|${vevo}|FUSTTESZT KERESKEDO KFT|1111 BUDAPEST, PROBA UTCA 1.`, keres)

  // Számla kiállítása: 20 × 6990 + 10 × 1890,50 = 158705,00 nettó → 201555,35 bruttó
  const tetelek = 'CIMKESZALAG CN-300I-HEZ;20;6990|Másolópapír A4;10;1890,50'
  const szamla = await kuld(`SZAMLA|KESZIT|${vevo}|RND-SMOKE|${kelt}|15|${tetelek}`)
  const szam = szamla.split('|')[1]
  check('SZAMLA|KESZIT → OK|SZ-…|201555,35|kelt+15', /^SZ-\d{4}-\d{6}$/.test(szam) && szamla === `OK|${szam}|201555,35|${plusNap(kelt, 15)}`, szamla)
  check('SZAMLA|KESZIT rossz dátum → E120', (await kuld(`SZAMLA|KESZIT|${vevo}|RND-SMOKE|2026-10-03|15|${tetelek}`)).startsWith('ERR|E120'), null)
  check('SZAMLA|KESZIT ismeretlen vevő → E107', (await kuld(`SZAMLA|KESZIT|VEVO-9999|RND-SMOKE|${kelt}|15|${tetelek}`)).startsWith('ERR|E107'), null)
  check('SZAMLA|KESZIT hibás tétel → E101', (await kuld(`SZAMLA|KESZIT|${vevo}|RND-SMOKE|${kelt}|15|X;abc;1`)).startsWith('ERR|E101'), null)
  check('SZAMLA|KESZIT tétel nélkül → E101', (await kuld(`SZAMLA|KESZIT|${vevo}|RND-SMOKE|${kelt}|15`)).startsWith('ERR|E101'), null)

  const dijbekero = await kuld(`DIJBEKERO|KESZIT|${vevo}|RND-SMOKE|${kelt}|8|ELOLEG;1;10000`)
  check('DIJBEKERO|KESZIT → OK|DB-…|12700,00', /^OK\|DB-\d{4}-\d{6}\|12700,00\|/.test(dijbekero), dijbekero)

  // Lekérdezés, lejárt lista, fizetés
  check('SZAMLA|LEKER új számla', (await kuld(`SZAMLA|LEKER|${szam}`)) === `OK|${szam}|${vevo}|201555,35|${plusNap(kelt, 15)}|FIZETVE|N|LEJART|N`, null)
  check('SZAMLA|LEKER ismeretlen → E108', (await kuld('SZAMLA|LEKER|SZ-2026-999999')).startsWith('ERR|E108'), null)

  const lejart = await kuld('SZAMLA|LEJART')
  check(
    'SZAMLA|LEJART → a 3 seedelt lejárt számla',
    ['SZ-2026-000185', 'SZ-2026-000186', 'SZ-2026-000187'].every((s) => lejart.includes(`|${s};`)) && Number(lejart.split('|')[1]) >= 3,
    lejart
  )

  check('SZAMLA|FIZETVE rossz dátum → E120', (await kuld(`SZAMLA|FIZETVE|${szam}|03/10/2026`)).startsWith('ERR|E120'), null)
  check('SZAMLA|FIZETVE → OK', (await kuld(`SZAMLA|FIZETVE|${szam}|${kelt}`)) === 'OK', null)
  check('SZAMLA|FIZETVE újra → OK', (await kuld(`SZAMLA|FIZETVE|${szam}|${kelt}`)) === 'OK', null)
  check('SZAMLA|LEKER → FIZETVE|I', (await kuld(`SZAMLA|LEKER|${szam}`)).includes('|FIZETVE|I|'), null)

  // Sztornó
  const storno = await kuld(`SZAMLA|STORNO|${szam}`)
  check('SZAMLA|STORNO → OK|SZ-…', /^OK\|SZ-\d{4}-\d{6}$/.test(storno) && storno !== `OK|${szam}`, storno)
  check('SZAMLA|STORNO újra → ugyanaz a sztornó', (await kuld(`SZAMLA|STORNO|${szam}`)) === storno, null)
  check('SZAMLA|STORNO díjbekérőre → E108', (await kuld(`SZAMLA|STORNO|${dijbekero.split('|')[1]}`)).startsWith('ERR|E108'), null)
  check('SZAMLA|LEKER sztornó → negatív bruttó', (await kuld(`SZAMLA|LEKER|${storno.slice(3)}`)).includes('|-201555,35|'), null)

  // PDF: frissen kiállított, sztornó és seedelt (első lekéréskor generált) bizonylat
  await pdfEllenoriz('SZAMLA|PDF új számla → érvényes PDF', await kuld(`SZAMLA|PDF|${szam}`), szam)
  await pdfEllenoriz('SZAMLA|PDF sztornó → érvényes PDF', await kuld(`SZAMLA|PDF|${storno.slice(3)}`), storno.slice(3))
  await pdfEllenoriz('SZAMLA|PDF seedelt SZ-2026-000180 → generálás első lekéréskor', await kuld('SZAMLA|PDF|SZ-2026-000180'), 'SZ-2026-000180')
  check('SZAMLA|PDF ismeretlen → E108', (await kuld('SZAMLA|PDF|SZ-2026-999999')).startsWith('ERR|E108'), null)

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(`A füstteszt nem tudott lefutni: ${e.message}`)
  process.exit(1)
})
