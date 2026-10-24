/**
 * A konténeres rendszer belső titkainak generálása (15. fázis) a git-ből kizárt .env.stack fájlba:
 * rendszerenként adatbázis-jelszó, PostgREST-belépő és JWT-titok, valamint a Flowable adatbázis-jelszava és a
 * számlázó PDF-linkjeinek aláíró kulcsa, és a más rendszereknek kiadott API-kulcsok (CRM, raktár). A külső kulcsok (Stripe, SzámlaBridge, legacy kulcsok) a .env.local-ban maradnak.
 * A meglévő értékeket nem írja felül (a már létrehozott adatbázisok jelszava nem változhat).
 * Futtatás: npm run stack:secrets
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { jwtAlair } from '../lib/rendszer/jwt'

const FAJL = '.env.stack'
const RENDSZEREK = ['CRM', 'QUOTE', 'ORDERS', 'INVENTORY', 'BILLING', 'PAYMENTS', 'SUPPORT', 'MCP']
const titok = (n = 32) => randomBytes(n).toString('base64url')

const meglevo = new Map<string, string>()
if (existsSync(FAJL)) {
  for (const sor of readFileSync(FAJL, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(sor)
    if (m) meglevo.set(m[1], m[2])
  }
}

const kell: [string, () => string][] = [
  ...RENDSZEREK.flatMap((r) => [
    [`${r}_DB_PASSWORD`, () => titok(24)] as [string, () => string],
    [`${r}_AUTHENTICATOR_PASSWORD`, () => titok(24)] as [string, () => string],
    [`${r}_JWT_SECRET`, () => titok(48)] as [string, () => string],
  ]),
  ['FLOWABLE_DB_PASSWORD', () => titok(24)],
  ['TARHELY_LINK_SECRET', () => titok(32)],
  // a portál integrációs kulcsainak titkosító kulcsa (AES-256: pontosan 32 bájt)
  ['PORTAL_INTEGRACIO_KEY', () => randomBytes(32).toString('base64url')],
]

let uj = 0
for (const [nev, gen] of kell) {
  if (!meglevo.has(nev)) {
    meglevo.set(nev, gen())
    uj++
  }
}
// MCP hozzáférési tokenek szerepkörönként (token:szerepkör:kliens) – csak ha a .env.local nem ad meg sajátot
const localMcp = existsSync('.env.local') && /^MCP_TOKENS=.+/m.test(readFileSync('.env.local', 'utf8'))
if (localMcp) meglevo.delete('MCP_TOKENS')
else if (!meglevo.has('MCP_TOKENS')) {
  meglevo.set('MCP_TOKENS', ['viewer', 'sales', 'logistics', 'finance', 'sales_manager', 'admin'].map((r) => `${titok(24)}:${r}:demo-${r}`).join(','))
  uj++
}

// A más rendszereknek kiadott API-kulcsok (lejárat nélküli JWT-k) a rendszer titkából – mindig újra előállítva
meglevo.set('CRM_API_KEY', jwtAlair({ role: 'service_role', iss: 'crm' }, meglevo.get('CRM_JWT_SECRET')!))
meglevo.set('INVENTORY_API_KEY', jwtAlair({ role: 'sor_kliens', iss: 'inventory' }, meglevo.get('INVENTORY_JWT_SECRET')!))
// (a 15. fázis átmeneti portál admin-kulcsai a 16. fázisban megszűntek: a portál a bekötött integrációkon dolgozik)
for (const r of ['ORDERS', 'BILLING', 'PAYMENTS', 'INVENTORY']) meglevo.delete(`${r}_ADMIN_KEY`)

writeFileSync(FAJL, `# Generált belső titkok – NE commitold, NE módosítsd kézzel (npm run stack:secrets)\n${[...meglevo].map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 })
console.log(`${FAJL}: ${uj} új, ${meglevo.size - uj} meglévő érték (a tartalmát nem írom ki)`)
