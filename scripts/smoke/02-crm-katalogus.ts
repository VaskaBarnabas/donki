/**
 * 2. fázis füstteszt: CRM és katalógus PostgREST-en keresztül (ugyanazok a hívások, mint curl-lel).
 * Service role kulccsal tesztel; az anon kulccsal csak azt nézi, hogy kívülről nincs hozzáférés.
 *
 * Futtatás: npx tsx scripts/smoke/02-crm-katalogus.ts
 */
import { readFileSync } from 'node:fs'

function loadEnv(path: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = { ...loadEnv('.env.local'), ...process.env } as Record<string, string>
const BASE = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!env.NEXT_PUBLIC_SUPABASE_URL || !SERVICE || !ANON) {
  console.error('Hiányzó env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
  process.exit(1)
}

function headers(key: string, profile: string, write = false): Record<string, string> {
  const h: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}` }
  if (write) {
    h['Content-Profile'] = profile
    h['Content-Type'] = 'application/json'
  } else {
    h['Accept-Profile'] = profile
  }
  return h
}

async function get(path: string, profile: string, key = SERVICE) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(key, profile) })
  return { status: res.status, body: await res.json() }
}

async function rpc(fn: string, args: unknown, profile: string, key = SERVICE) {
  const res = await fetch(`${BASE}/rpc/${fn}`, {
    method: 'POST',
    headers: headers(key, profile, true),
    body: JSON.stringify(args),
  })
  return { status: res.status, body: await res.json() }
}

let failed = 0
function check(name: string, ok: boolean, detail: unknown) {
  if (!ok) failed++
  console.log(`${ok ? 'OK  ' : 'HIBA'} ${name}${ok ? '' : `\n     ${JSON.stringify(detail)}`}`)
}

async function main() {
  console.log('2. fázis füstteszt – CRM + katalógus (PostgREST)\n')

  // CRM: partner a kapcsolattartóival
  const partner = await get(
    `/partners?select=id,name,tax_number,customer_group,contacts(name,email,phone,role)&name=eq.${encodeURIComponent('Bakony Gépgyártó Kft')}`,
    'crm'
  )
  check(
    'crm: partner kapcsolattartókkal',
    partner.status === 200 && partner.body.length === 1 && partner.body[0].contacts.length === 2,
    partner
  )

  const deals = await get('/deals?select=title,stage,partners(name)&stage=eq.ajanlat', 'crm')
  check('crm: deal szűrés szakaszra + partner beágyazás', deals.status === 200 && deals.body.length === 4, deals)

  // Katalógus: termék kategóriával
  const product = await get('/products?select=code,name,list_price,categories(name)&code=eq.TK-00001', 'catalog')
  check(
    'catalog: termék kategóriával',
    product.status === 200 && product.body[0]?.categories?.name === 'Nyomtatók és multifunkciós eszközök',
    product
  )

  // price_for: TK-00001 (NYOMT, 89 900 Ft) minden ügyfélcsoportra
  const expected: Record<string, number> = { NORMAL: 89900, TORZS: 85405, VISZONTELADO: 79112, KIEMELT: 80910 }
  for (const [group, price] of Object.entries(expected)) {
    const r = await rpc('price_for', { product_code: 'TK-00001', customer_group: group }, 'catalog')
    check(`price_for TK-00001 ${group} = ${price}`, r.status === 200 && Number(r.body.price) === price, r)
  }

  const inactive = await rpc('price_for', { product_code: 'TK-00033', customer_group: 'KIEMELT' }, 'catalog')
  check('price_for inaktív termék: active=false', inactive.status === 200 && inactive.body.active === false, inactive)

  const unknownProduct = await rpc('price_for', { product_code: 'TK-99999', customer_group: 'NORMAL' }, 'catalog')
  check('price_for ismeretlen termék: 404', unknownProduct.status === 404, unknownProduct)

  const unknownGroup = await rpc('price_for', { product_code: 'TK-00001', customer_group: 'VIP' }, 'catalog')
  check('price_for ismeretlen ügyfélcsoport: 400', unknownGroup.status === 400, unknownGroup)

  // Anon kulccsal nincs hozzáférés
  const anonCrm = await get('/partners?select=name&limit=1', 'crm', ANON)
  check('anon: crm.partners tiltott', anonCrm.status >= 400, anonCrm)

  const anonPrice = await rpc('price_for', { product_code: 'TK-00001', customer_group: 'NORMAL' }, 'catalog', ANON)
  check('anon: price_for tiltott', anonPrice.status >= 400, anonPrice)

  const anonQuote = await get('/quotes?select=id&limit=1', 'quote', ANON)
  check('anon: quote séma tiltott', anonQuote.status >= 400, anonQuote)

  console.log(failed === 0 ? '\nMinden ellenőrzés sikeres.' : `\n${failed} ellenőrzés sikertelen.`)
  process.exit(failed === 0 ? 0 : 1)
}

main()
