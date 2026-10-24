/**
 * 16. fázis füstteszt: a portál – integrációk (titkosítás, kapcsolatteszt), irányítópult, szerepkörök, vezérlés.
 *
 * A bejelentkezett ágakhoz két ideiglenes Supabase-felhasználót hoz létre (admin + megtekintő) az admin API-val,
 * a végén törli őket. A portált HTTP-n hívja a felhasználók munkamenet-sütijével (@supabase/ssr formátum).
 * Az irányítópult elvárt értékeit a rendszerek saját interfészeiről kérdezi le (nem a seedből), mert a többi teszt
 * módosítja az állapotot.
 *
 * Előfeltétel: npm run stack:up, npm run portal:integraciok (a rendszerek bekötve)
 * Futtatás: npx tsx scripts/smoke/16-portal.ts   (~1-2 perc; a számlázót leállítja és visszaindítja – ne fusson
 * más teszttel párhuzamosan)
 */
import { execFileSync } from 'node:child_process'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { raktarHivas } from '../../legacy/orders/raktar-hivas'
import { kapcsolatTeszt, type RendszerAzon } from '../../lib/portal/kapcsolat-teszt'
import { titkosit, visszafejt } from '../../lib/portal/titok'
import { rendszerMuvelet } from '../../lib/rendszer/vezerles-mag'
import { env, URL } from './rendszerek'

process.env.DOCKER_PROXY_URL ??= 'http://localhost:2375'
// a konténer IPv4-en figyel; a `localhost` egy párhuzamosan futó `npm run dev`-hez (IPv6, *:3000) is eljuthatna,
// amely a gépen fut, és a rendszerek konténeres címeit (http://billing:4103) nem éri el
const PORTAL = 'http://127.0.0.1:3000'

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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

/** A gépről elérhető címek és a kulcsok rendszerenként (a portál konténerből a belső neveket használja). */
const KOTES: Record<RendszerAzon, { url: string; kulcs: string }> = {
  crm: { url: URL.crm, kulcs: env.CRM_API_KEY },
  quote: { url: URL.quote, kulcs: env.LEGACY_QUOTE_KEY },
  orders: { url: URL.orders, kulcs: env.LEGACY_ORDERS_KEY },
  inventory: { url: 'http://localhost:54106', kulcs: env.INVENTORY_API_KEY },
  billing: { url: URL.billing, kulcs: env.LEGACY_BILLING_KEY },
  payments: { url: URL.payments, kulcs: env.LEGACY_PAYMENTS_KEY },
  support: { url: URL.support, kulcs: env.LEGACY_SUPPORT_KEY },
}

// ---------------------------------------------------------------- tesztfelhasználók

type Munkamenet = { id: string; email: string; suti: string; kliens: SupabaseClient }

async function felhasznalo(nev: string): Promise<Munkamenet> {
  const email = `smoke16-${nev}-${Date.now()}@example.com`
  const jelszo = `Smoke16-${crypto.randomUUID()}`
  const { data, error } = await admin.auth.admin.createUser({ email, password: jelszo, email_confirm: true, user_metadata: { display_name: `Smoke16 ${nev}` } })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  // a bejelentkezés a portál süti-formátumában (@supabase/ssr), memóriában tárolt sütikkel
  const sutik = new Map<string, string>()
  const kliens = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => [...sutik].map(([name, value]) => ({ name, value })),
      setAll: (lista) => lista.forEach(({ name, value }) => (value ? sutik.set(name, value) : sutik.delete(name))),
    },
  })
  const be = await kliens.auth.signInWithPassword({ email, password: jelszo })
  if (be.error) throw new Error(`signIn: ${be.error.message}`)
  return { id: data.user.id, email, kliens, get suti() { return [...sutik].map(([n, v]) => `${n}=${v}`).join('; ') } }
}

async function portal(m: Munkamenet | null, ut: string, init: RequestInit = {}) {
  return fetch(`${PORTAL}${ut}`, { signal: AbortSignal.timeout(120_000), ...init, redirect: 'manual', headers: { ...(m ? { Cookie: m.suti } : {}), ...(init.headers ?? {}) } })
}

/** A szerveren renderelt oldal szövege (címkék nélkül; a Suspense-ben később érkező részekkel együtt). */
async function oldalSzoveg(m: Munkamenet, ut: string): Promise<{ status: number; szoveg: string }> {
  const r = await portal(m, ut)
  const html = await r.text()
  const szoveg = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;| | /g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
  return { status: r.status, szoveg }
}

async function szamlazo(parancs: string): Promise<string> {
  const r = await fetch(`${URL.billing}/api/legacy/billing`, { method: 'POST', body: `AUTH|${env.LEGACY_BILLING_KEY}\n${parancs}\n` })
  return (await r.text()).trim()
}

async function egeszsegVar(url: string, maxMp = 90): Promise<boolean> {
  for (let i = 0; i < maxMp; i += 2) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return true
    } catch {}
    await var_(2000)
  }
  return false
}

const forint = (n: number) => `${Math.round(n).toLocaleString('hu-HU').replace(/ | /g, ' ')} Ft`

async function main() {
  console.log('16. fázis – portál: integrációk, irányítópult, szerepkörök, vezérlés')
  const kezdet = Date.now()
  const letrehozott: string[] = []

  try {
    // -------------------------------------------------------------- 1. titkosítás
    szakasz('Integrációk: a kulcsok titkosítva a Supabase-ben')
    const minta = titkosit('proba-kulcs-123')
    check('AES-GCM: oda-vissza, és minden titkosítás más (véletlen IV)', visszafejt(minta) === 'proba-kulcs-123' && titkosit('proba-kulcs-123') !== minta, minta)
    const [iv, tag, adat] = minta.split(':')
    const hamisitott = [iv, tag, Buffer.from(Buffer.from(adat, 'base64url').map((b, i) => (i === 0 ? b ^ 1 : b))).toString('base64url')].join(':')
    check('a módosított titkos szöveget elutasítja (hitelesítő címke)', (() => { try { visszafejt(hamisitott); return false } catch { return true } })(), null)
    const { data: sorok, error } = await admin.from('integrations').select('system, base_url, secret_enc, status')
    check(`7 rendszer bekötve: ${(sorok ?? []).map((s) => s.system).sort().join(', ')}`, !error && sorok?.length === 7, error ?? sorok?.length)
    const nyiltan = (sorok ?? []).filter((s) => s.secret_enc.includes(KOTES[s.system as RendszerAzon].kulcs))
    check('a táblában egyik kulcs sincs nyíltan', nyiltan.length === 0, nyiltan.map((s) => s.system))
    const visszafejtve = (sorok ?? []).filter((s) => visszafejt(s.secret_enc) === KOTES[s.system as RendszerAzon].kulcs)
    check('mindegyik a portál titkosító kulcsával visszafejthető a rendszer valódi kulcsára', visszafejtve.length === 7, visszafejtve.map((s) => s.system))

    // -------------------------------------------------------------- 2. kapcsolatteszt
    szakasz('Kapcsolatteszt rendszerenként, a rendszer saját protokollján')
    for (const r of Object.keys(KOTES) as RendszerAzon[]) {
      const jo = await kapcsolatTeszt(r, KOTES[r].url, KOTES[r].kulcs)
      const rossz = await kapcsolatTeszt(r, KOTES[r].url, 'rossz-kulcs-0000')
      check(`${r}: jó kulcs → „${jo.uzenet}”; rossz kulcs → „${rossz.uzenet}”`, jo.elerheto && jo.kulcsOk && rossz.elerheto && !rossz.kulcsOk, { jo, rossz })
    }
    const sehol = await kapcsolatTeszt('quote', 'http://localhost:1', KOTES.quote.kulcs)
    check(`rossz cím → „${sehol.uzenet}”`, !sehol.elerheto && !sehol.kulcsOk, sehol)

    // -------------------------------------------------------------- 3. a portál konténere
    szakasz('A portál konténerében nincs rendszerkulcs')
    const nevek = (JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .Config.Env}}', 'donki-portal-1'], { encoding: 'utf8' })) as string[]).map((e) => e.split('=')[0])
    const tiltott = nevek.filter((n) => /^LEGACY_|_API_KEY$|_JWT_SECRET$|SERVICE_ROLE|SZAMLAZZHU|STRIPE|FLOWABLE|ADMIN_KEY/.test(n))
    check(`környezet: ${nevek.filter((n) => /SUPABASE|PORTAL|DOCKER|_URL$/.test(n)).join(', ')}`, tiltott.length === 0 && nevek.includes('PORTAL_INTEGRACIO_KEY'), tiltott)

    // -------------------------------------------------------------- 4. felhasználók, szerepkörök
    szakasz('Szerepkörök: ideiglenes admin és megtekintő felhasználó')
    const kijelentkezve = await portal(null, '/iranyitopult')
    check(`bejelentkezés nélkül az irányítópult a loginra irányít (HTTP ${kijelentkezve.status})`, kijelentkezve.status === 307 && (kijelentkezve.headers.get('location') ?? '').includes('/auth/login'), kijelentkezve.headers.get('location'))
    const a = await felhasznalo('admin')
    letrehozott.push(a.id)
    const v = await felhasznalo('viewer')
    letrehozott.push(v.id)
    const { data: profilV } = await admin.from('profiles').select('role').eq('id', v.id).single()
    check(`új felhasználó szerepköre: ${profilV?.role}`, profilV?.role === 'viewer', profilV)
    await admin.from('profiles').update({ role: 'admin' }).eq('id', a.id)
    const sajatA = await a.kliens.rpc('sajat_szerepkor')
    check(`sajat_szerepkor() az admin munkamenetével: ${sajatA.data}`, sajatA.data === 'admin', sajatA.error)

    const lista = await v.kliens.rpc('felhasznalok_lista')
    check(`megtekintő: felhasznalok_lista → ${lista.error?.code} ${lista.error?.message}`, lista.error?.code === '42501', lista)
    const onmaga = await v.kliens.rpc('szerepkor_beallitas', { p_user: v.id, p_role: 'admin' })
    check(`megtekintő: önmagát nem teheti adminná → ${onmaga.error?.code}`, onmaga.error?.code === '42501', onmaga)
    await v.kliens.from('profiles').update({ role: 'admin' }).eq('id', v.id)
    const { data: utana } = await admin.from('profiles').select('role').eq('id', v.id).single()
    check('megtekintő: a profiles tábla közvetlenül sem írható', utana?.role === 'viewer', utana)
    const integ = await v.kliens.from('integrations').update({ base_url: 'http://tamado:1' }).eq('system', 'billing').select()
    const { data: billingSor } = await admin.from('integrations').select('base_url').eq('system', 'billing').single()
    check('megtekintő: integrációt nem módosíthat (RLS)', (integ.data ?? []).length === 0 && billingSor?.base_url === 'http://billing:4103', { integ: integ.error ?? integ.data, billingSor })

    const vApi = await portal(v, '/api/rendszerek')
    check(`megtekintő: a vezérlő API → HTTP ${vApi.status}`, vApi.status === 403, vApi.status)
    const vStop = await portal(v, '/api/rendszerek/support/stop', { method: 'POST' })
    check(`megtekintő: rendszer leállítása → HTTP ${vStop.status}`, vStop.status === 403, vStop.status)
    const vFelh = await oldalSzoveg(v, '/felhasznalok')
    check('megtekintő: a Felhasználók oldal nem listáz (admin szerepkör kell)', vFelh.status === 200 && vFelh.szoveg.includes('admin szerepkör kell') && !vFelh.szoveg.includes(a.email), vFelh.status)

    const aLista = await a.kliens.rpc('felhasznalok_lista')
    check('admin: felhasznalok_lista tartalmazza a megtekintőt', !aLista.error && (aLista.data as { email: string }[]).some((f) => f.email === v.email), aLista.error)
    const aFelh = await oldalSzoveg(a, '/felhasznalok')
    check('admin: a Felhasználók oldal listázza a felhasználókat', aFelh.status === 200 && aFelh.szoveg.includes(v.email), aFelh.status)
    const ad = await a.kliens.rpc('szerepkor_beallitas', { p_user: v.id, p_role: 'finance' })
    const { data: ujSzerep } = await admin.from('profiles').select('role').eq('id', v.id).single()
    check(`admin: szerepkört ad (megtekintő → ${ujSzerep?.role})`, !ad.error && ujSzerep?.role === 'finance', ad.error)
    const sajatEl = await a.kliens.rpc('szerepkor_beallitas', { p_user: a.id, p_role: 'viewer' })
    check(`admin: a saját admin szerepkörét nem veheti el → ${sajatEl.error?.message}`, sajatEl.error?.code === '42501', sajatEl)
    const ismeretlen = await a.kliens.rpc('szerepkor_beallitas', { p_user: v.id, p_role: 'root' })
    check(`admin: ismeretlen szerepkör → ${ismeretlen.error?.code}`, ismeretlen.error?.code === '22023', ismeretlen)

    // -------------------------------------------------------------- 5. irányítópult
    szakasz('Irányítópult: a kártyák a rendszerek saját interfészeiről')
    const lejart = (await szamlazo('SZAMLA|LEJART')).split('|')
    const lejartTetelek = lejart.slice(2).filter(Boolean).map((t) => t.split(';'))
    const lejartOsszeg = lejartTetelek.reduce((s, t) => s + Number(t[2].replace(',', '.')), 0)
    const { valasz: raktarLista } = await raktarHivas({ cmd: 'LISTA' })
    const cikkek = (raktarLista?.tetelek ?? []) as { keszlet: number; min: number }[]
    const alatta = cikkek.filter((c) => c.keszlet < c.min).length
    const rend = (await (await fetch(`${URL.orders}/api/legacy/orders/list`, { headers: { 'X-Legacy-Key': env.LEGACY_ORDERS_KEY } })).json()) as { data: { state: string }[] }
    const nyitott = rend.data.filter((r) => !['LEZART', 'LEMONDOTT'].includes(r.state)).length
    const szinkron = (await szamlazo('SZAMLA|SZINKRON')).split('|')

    const ip = await oldalSzoveg(a, '/iranyitopult')
    check(`admin: HTTP ${ip.status}, „7/7 rendszer bekötve”, szerepkör: Rendszergazda`, ip.status === 200 && ip.szoveg.includes('7/7 rendszer bekötve') && ip.szoveg.includes('Szerepkör: Rendszergazda'), ip.szoveg.slice(0, 300))
    check('egyik kártya sem jelez kiesést', !ip.szoveg.includes('most nem érhető el') && !ip.szoveg.includes('nincs bekötve'), ip.szoveg.match(/.{60}(most nem érhető el|nincs bekötve).{20}/)?.[0])
    check(`lejárt tartozások: ${forint(lejartOsszeg)}, ${lejartTetelek.length} bizonylat (SZAMLA|LEJART)`, ip.szoveg.includes(`${forint(lejartOsszeg)} ${lejartTetelek.length} bizonylat · a legrégebbi: ${lejartTetelek[0]?.[0]}`), ip.szoveg.match(/Lejárt tartozások.{0,200}/g))
    check(`minimum alatti készlet: ${alatta} a ${cikkek.length} cikkből (raktár LISTA)`, ip.szoveg.includes(`${alatta} ${cikkek.length} cikkből`), ip.szoveg.match(/.{40}cikkből/)?.[0])
    check(`nyitott rendelések: ${nyitott} (homlokzat list)`, new RegExp(`Nyitott rendelések megnyitás ${nyitott} `).test(ip.szoveg), ip.szoveg.match(/Nyitott rendelések megnyitás.{0,60}/g))
    check(`egyeztetés: Számlázz.hu ${szinkron[2]}/${szinkron[1]} bizonylat (SZAMLA|SZINKRON → ${szinkron.join('|')})`, ip.szoveg.includes(`Számlázz.hu: ${szinkron[2]}/${szinkron[1]} bizonylat`), ip.szoveg.match(/Számlázz\.hu: .{0,80}/)?.[0])
    check('admin: a rendszerek mini nézete is látszik', /Rendszerek: .*Számlázó.*: fut/.test(ip.szoveg), ip.szoveg.match(/Rendszerek: .{0,200}/)?.[0])

    // a pénzügyes (az előbb kapott szerepkörrel) a tartozásokat látja elöl, a rendszerek sorát nem
    const fin = await oldalSzoveg(v, '/iranyitopult')
    const elso = ['Lejárt tartozások', 'Mai fizetések', 'Nyitott rendelések', 'Minimum alatti készlet'].map((c) => [c, fin.szoveg.indexOf(c)] as const)
    check(`pénzügy: a sorrend ${elso.map(([c, i]) => `${c}@${i}`).join(', ')}`, elso[0][1] > 0 && elso[0][1] < elso[1][1] && elso[1][1] < elso[2][1] && elso[1][1] < elso[3][1], elso)
    check('pénzügy: a rendszerek mini nézete nem látszik', fin.status === 200 && !/Rendszerek: /.test(fin.szoveg), null)

    // -------------------------------------------------------------- 6. modul-oldalak az integrációs rétegen
    szakasz('Modul-oldalak a bekötött interfészeken; a protokoll-mezők ellenőrzése')
    const szamla = await oldalSzoveg(a, '/billing/SZ-2026-000187')
    check('számla adatlapja (SZAMLA|ADATLAP + TETELEK + PARTNER|ADAT), a Számlázz.hu sorszámával', szamla.status === 200 && szamla.szoveg.includes('SZ-2026-000187') && /Számlázz\.hu sorszám [A-Z-]*TST/.test(szamla.szoveg), szamla.szoveg.match(/Számlázz\.hu sorszám.{0,40}/)?.[0] ?? szamla.status)
    for (const rossz of ['SZ-2026-000187%7CX', 'SZ-2026-000187%0ASZAMLA%7CLEJART', 'x%3By']) {
      const r = await portal(a, `/billing/${rossz}`)
      check(`protokoll-injekció kísérlet: /billing/${rossz} → HTTP ${r.status}`, r.status === 404, r.status)
    }
    const cikk = await oldalSzoveg(a, '/inventory/4701')
    check('raktári cikk kartonja (raktár KARTON az üzenetsoron)', cikk.status === 200 && cikk.szoveg.includes('Cikk 4701') && cikk.szoveg.includes('Mozgások'), cikk.status)
    const sor = await oldalSzoveg(a, '/inventory/sor/inventory_commands')
    check('sor-betekintés a tulajdonos rendszer /ops/sor végpontján', sor.status === 200 && !sor.szoveg.includes('Hiba'), sor.szoveg.slice(0, 200))

    // -------------------------------------------------------------- 7. vezérlés + kiesés
    szakasz('Vezérlés a portál API-ján (control_log), kiesés: a számlázó leáll')
    const aApi = await portal(a, '/api/rendszerek')
    const allapot = (await aApi.json()) as { rendszerek: { rendszer: string; allapot: string }[] }
    check(`admin: a vezérlő API → ${allapot.rendszerek.length} rendszer`, aApi.status === 200 && allapot.rendszerek.length === 8, aApi.status)
    const le = await portal(a, '/api/rendszerek/billing/stop', { method: 'POST' })
    const leTorzs = (await le.json()) as { kontenerek?: string[]; hiba?: string }
    check(`admin: billing stop → HTTP ${le.status} (${leTorzs.kontenerek?.join(', ')})`, le.status === 200 && leTorzs.kontenerek?.includes('donki-billing-1') === true, leTorzs)
    try {
      const { data: naplo } = await admin.from('control_log').select('email, system, action, result').eq('email', a.email).order('at', { ascending: false }).limit(1)
      check(`control_log: ${JSON.stringify(naplo?.[0])}`, naplo?.[0]?.system === 'billing' && naplo[0].action === 'stop' && naplo[0].result.startsWith('ok'), naplo)
      const kt = await kapcsolatTeszt('billing', KOTES.billing.url, KOTES.billing.kulcs)
      check(`kapcsolatteszt a leállított számlázóra → „${kt.uzenet}”`, !kt.elerheto && !kt.kulcsOk, kt)
      const ki = await oldalSzoveg(a, '/iranyitopult')
      const kiesett = ['Lejárt tartozások', 'Egyeztetés (Számlázz.hu, Stripe)'].filter((c) => new RegExp(`${c.replace(/[().]/g, '\\$&')} megnyitás A\\(z\\) [^.]+ most nem érhető el`).test(ki.szoveg))
      const db = (ki.szoveg.match(/most nem érhető el/g) ?? []).length
      check(`irányítópult: csak a számlázós kártyák jeleznek (${kiesett.join(', ')}; összesen ${db})`, ki.status === 200 && kiesett.length === 2 && db === 2, ki.szoveg.match(/.{80}most nem érhető el/g))
      check('a többi kártya rendben (készlet, rendelések)', ki.szoveg.includes(`${alatta} ${cikkek.length} cikkből`) && new RegExp(`Nyitott rendelések megnyitás ${nyitott} `).test(ki.szoveg), null)
      const sz = await oldalSzoveg(a, '/billing')
      check('a számlázó modul-oldala a „nem érhető el” jelzést mutatja', sz.status === 200 && /nem érhető el|nem elérhető/.test(sz.szoveg), sz.szoveg.slice(0, 200))
    } finally {
      const be = await portal(a, '/api/rendszerek/billing/start', { method: 'POST' })
      const vissza = await egeszsegVar(`${URL.billing}/health`)
      check(`admin: billing start → HTTP ${be.status}, egészséges: ${vissza}`, be.status === 200 && vissza, be.status)
      if (be.status !== 200) await rendszerMuvelet('billing', 'start').catch(() => null)
    }
    const utanaIp = await oldalSzoveg(a, '/iranyitopult')
    check('visszakapcsolás után az irányítópult újra teljes', !utanaIp.szoveg.includes('most nem érhető el'), utanaIp.szoveg.match(/.{80}most nem érhető el/g))
  } finally {
    for (const id of letrehozott) await admin.auth.admin.deleteUser(id)
    const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).in('id', letrehozott.length ? letrehozott : ['00000000-0000-0000-0000-000000000000'])
    if (letrehozott.length) check(`a ${letrehozott.length} ideiglenes felhasználó törölve (profil is)`, count === 0, count)
  }

  console.log(`\n${osszes - failed}/${osszes} OK (${Math.round((Date.now() - kezdet) / 1000)} mp)`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
