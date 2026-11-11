// 21. fázis, UCP-átjáró: felfedezés (/.well-known/ucp), a platform azonosítása (UCP-Agent) és a képességek egyeztetése.

import { createHash, createPublicKey, verify, type JsonWebKeyInput } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { NYILVANOS_JWK } from './alairas'
import { B2B_BOVITMENY, FEJLESZTES, FIZETESI_HANDLER, KONFORMANCIA, PLATFORMOK, SHOPPING_URL, SPEC, UCP_VERZIO } from './beallitas'

const kepesseg = (spec: string, schema: string, extra: Record<string, unknown> = {}) => [{ version: UCP_VERZIO, spec, schema, ...extra }]

export const KEPESSEGEK: Record<string, { version: string; spec: string; schema: string; extends?: string }[]> = {
  'dev.ucp.shopping.checkout': kepesseg(SPEC.checkout, SPEC.checkoutSchema),
  'dev.ucp.shopping.order': kepesseg(SPEC.order, SPEC.orderSchema),
  // B2B: egyetlen, díjmentes futáros opció a megadott (vagy a partner nyilvántartott) címére
  'dev.ucp.shopping.fulfillment': kepesseg(SPEC.fulfillment, SPEC.fulfillmentSchema, { extends: 'dev.ucp.shopping.checkout' }),
  [B2B_BOVITMENY]: kepesseg(SPEC.b2b, SPEC.b2b, { extends: 'dev.ucp.shopping.checkout' }),
}

export const FIZETESI_HANDLEREK = {
  [FIZETESI_HANDLER.csoport]: [
    {
      id: FIZETESI_HANDLER.id,
      version: UCP_VERZIO,
      spec: SPEC.b2b,
      schema: SPEC.b2b,
      // B2B: a vevő díjbekérő alapján, átutalással vagy a díjbekérőhöz kapott Stripe-linken fizet; kártyaadat nem érkezik
      config: { method: 'proforma_invoice', currency: 'HUF', note: 'Payment request after delivery; bank transfer or card via the payment link in the order.' },
    },
  ],
}

/** A kereskedő profilja: /.well-known/ucp */
export function uzletiProfil() {
  return {
    ucp: {
      version: UCP_VERZIO,
      services: { 'dev.ucp.shopping': [{ version: UCP_VERZIO, spec: SPEC.overview, transport: 'rest', endpoint: SHOPPING_URL, schema: SPEC.rest }] },
      capabilities: KEPESSEGEK,
      payment_handlers: FIZETESI_HANDLEREK,
    },
    signing_keys: [NYILVANOS_JWK],
  }
}

// ---------------------------------------------------------------- a platform

export class UcpHiba extends Error {
  constructor(
    public readonly statusz: number,
    public readonly kod: string,
    uzenet: string
  ) {
    super(uzenet)
  }
}

export type Platform = { profil: string; verzio: string; kepessegek: Set<string>; webhookUrl: string | null; alairt: boolean }
/** A bejövő kérés az aláírás ellenőrzéséhez. */
export type KeresAdat = { metodus: string; url: string; fejlecek: Record<string, string | string[] | undefined>; torzs: Buffer | null }

/** Éles módban minden kérést a platformnak alá kell írnia (RFC 9421); fejlesztésben és tesztmódban csak ha van aláírás. */
const ALAIRAS_KOTELEZO = process.env.UCP_ALAIRAS_KOTELEZO ? process.env.UCP_ALAIRAS_KOTELEZO === '1' : !FEJLESZTES

/** UCP-Agent: profile="https://…"; version="2026-04-08" (RFC 8941 szótár) */
export function agentFejlec(h: string | undefined): { profil: string | null; verzio: string | null } {
  const profil = /(?:^|[;,\s])profile="([^"]*)"/.exec(h ?? '')?.[1] ?? null
  const verzio = /(?:^|[;,\s])version="([^"]*)"/.exec(h ?? '')?.[1] ?? null
  return { profil, verzio }
}

const gyorsitotar = new Map<string, { ido: number; adat: Record<string, unknown> }>()

function privatCim(ip: string) {
  const v4 = ip.replace(/^::ffff:/i, '')
  return /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(v4) || ip === '::1' || ip === '::' || /^f[cd]|^fe80/i.test(ip)
}

/**
 * Kimenő kérés célcímének ellenőrzése (profil-letöltés, webhook): HTTPS, felhasználónév/jelszó nélkül, és egyik feloldott
 * címe sem lehet belső (loopback, privát, link-local, CGNAT, IPv4-be ágyazott IPv6). Fejlesztésben csak a localhost http.
 * Maradék kockázat: a feloldás és a kérés között a DNS megváltozhat (DNS rebinding); élesben kimenő proxyval zárható.
 */
export async function kimenoUrl(url: string, kod: string): Promise<URL> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new UcpHiba(400, kod, 'Érvénytelen URL.')
  }
  if (u.username || u.password) throw new UcpHiba(400, kod, 'Az URL nem tartalmazhat felhasználónevet vagy jelszót.')
  const helyi = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (!(u.protocol === 'https:' || (FEJLESZTES && u.protocol === 'http:' && helyi))) throw new UcpHiba(400, kod, 'Csak HTTPS cím használható.')
  if (!FEJLESZTES) {
    const host = u.hostname.replace(/^\[|\]$/g, '')
    const cimek = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
    if (!cimek.length || cimek.some((c) => privatCim(c.address))) throw new UcpHiba(400, kod, 'Belső vagy fel nem oldható hálózati cím nem használható.')
  }
  return u
}

/** Az engedélyezőlista pontos origin-egyezéssel (séma, gépnév, port), nem előtaggal. */
export function engedelyezett(profil: string): boolean {
  try {
    const o = new URL(profil).origin
    return PLATFORMOK.some((p) => {
      try {
        return new URL(p).origin === o
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/** A platformprofil letöltése a szabvány biztonsági szabályaival: HTTPS, átirányítás nélkül, belső cím tiltva, méretkorlát. */
async function profilLetoltes(url: string): Promise<Record<string, unknown>> {
  const g = gyorsitotar.get(url)
  if (g && Date.now() - g.ido < 300_000) return g.adat
  const u = await kimenoUrl(url, 'invalid_profile_url')
  let v: Response
  try {
    v = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
  } catch {
    throw new UcpHiba(424, 'profile_unreachable', 'A platform profilja nem érhető el.')
  }
  if (v.status !== 200) throw new UcpHiba(424, 'profile_unreachable', `A platform profilja nem érhető el (HTTP ${v.status}).`)
  const szoveg = await v.text()
  if (szoveg.length > 128 * 1024) throw new UcpHiba(422, 'profile_malformed', 'A platform profilja túl nagy.')
  let adat: Record<string, unknown>
  try {
    adat = JSON.parse(szoveg)
  } catch {
    throw new UcpHiba(422, 'profile_malformed', 'A platform profilja nem érvényes JSON.')
  }
  gyorsitotar.set(url, { ido: Date.now(), adat })
  return adat
}

const fejlec = (k: KeresAdat, n: string) => {
  const v = k.fejlecek[n]
  return Array.isArray(v) ? v.join(', ') : v
}

/**
 * A kérés RFC 9421 aláírásának ellenőrzése a platform profiljában közzétett kulccsal (Ed25519 vagy ECDSA P-256).
 * Törzs esetén a Content-Digest-nek (RFC 9530) a lefedett komponensek között kell lennie, és egyeznie kell a törzzsel.
 */
function alairasEllenorzes(k: KeresAdat, profilAdat: Record<string, unknown> | null): boolean {
  const bemenet = fejlec(k, 'signature-input')
  const alairas = fejlec(k, 'signature')
  if (!bemenet || !alairas) {
    if (ALAIRAS_KOTELEZO) throw new UcpHiba(401, 'signature_required', 'A kérést a platformnak alá kell írnia (RFC 9421).')
    return false
  }
  const m = /^\s*([A-Za-z0-9_-]+)=(\(([^)]*)\)(.*))$/.exec(bemenet)
  const sig = m ? new RegExp(`(?:^|,\\s*)${m[1]}=:([A-Za-z0-9+/=]+):`).exec(alairas) : null
  if (!m || !sig) throw new UcpHiba(401, 'invalid_signature', 'Az aláírás fejléce érvénytelen.')
  const komponensek = m[3].split(/\s+/).filter(Boolean).map((x) => x.replace(/"/g, ''))
  const parameterek = m[4]
  const letrejott = Number(/;created=(\d+)/.exec(parameterek)?.[1])
  const kid = /;keyid="([^"]+)"/.exec(parameterek)?.[1]
  if (!letrejott || Math.abs(Date.now() / 1000 - letrejott) > 300) throw new UcpHiba(401, 'invalid_signature', 'Az aláírás lejárt vagy hiányzik az időbélyege.')
  if (k.torzs?.length) {
    const kivonat = `sha-256=:${createHash('sha256').update(k.torzs).digest('base64')}:`
    if (!komponensek.includes('content-digest') || fejlec(k, 'content-digest') !== kivonat) throw new UcpHiba(401, 'invalid_signature', 'A Content-Digest hiányzik az aláírásból, vagy nem egyezik a törzzsel.')
  }
  const kulcsok = ((profilAdat?.signing_keys ?? profilAdat?.keys ?? []) as ({ kid?: string; kty?: string } & Record<string, unknown>)[]).filter((x) => x && (!kid || x.kid === kid))
  if (!kulcsok.length) throw new UcpHiba(401, 'invalid_signature', 'A platform profiljában nincs ilyen aláíró kulcs.')
  const alap = Buffer.from(
    [
      ...komponensek.map((c) => {
        const ertek = c === '@method' ? k.metodus.toUpperCase() : c === '@target-uri' ? k.url : c === '@authority' ? new URL(k.url).host : c === '@path' ? new URL(k.url).pathname : fejlec(k, c)
        if (ertek === undefined) throw new UcpHiba(401, 'invalid_signature', `Az aláírt komponens hiányzik: ${c}`)
        return `"${c}": ${ertek}`
      }),
      `"@signature-params": ${m[2]}`,
    ].join('\n')
  )
  const nyers = Buffer.from(sig[1], 'base64')
  const jo = kulcsok.some((j) => {
    try {
      const kulcs = createPublicKey({ key: j as JsonWebKeyInput['key'], format: 'jwk' })
      return j.kty === 'EC' ? verify('sha256', alap, { key: kulcs, dsaEncoding: 'ieee-p1363' }, nyers) : verify(null, alap, kulcs, nyers)
    } catch {
      return false
    }
  })
  if (!jo) throw new UcpHiba(401, 'invalid_signature', 'Az aláírás nem ellenőrizhető a platform kulcsával.')
  return true
}

/**
 * A kérő platform: engedélyezőlista (pontos origin), profil, aláírás, verzió, közös képességek, webhook-cím.
 * Konformancia-tesztmódban engedékeny: a tesztcsomag egyes kéréseinél a profil URL-je szándékosan érvénytelen („…”).
 */
export async function platform(agent: string | undefined, keres?: KeresAdat): Promise<Platform> {
  const { profil, verzio } = agentFejlec(agent)
  if (!profil) throw new UcpHiba(400, 'invalid_profile_url', 'Hiányzik a UCP-Agent fejléc (profile="…").')
  if (!KONFORMANCIA && !engedelyezett(profil)) throw new UcpHiba(403, 'platform_not_allowed', 'Ez a platform nincs engedélyezve ennél a kereskedőnél.')
  let adat: Record<string, unknown> | null = null
  try {
    adat = await profilLetoltes(profil)
  } catch (e) {
    if (!KONFORMANCIA) throw e
  }
  const alairt = keres ? alairasEllenorzes(keres, adat) : false
  const ucp = (adat?.ucp ?? {}) as { version?: string; capabilities?: Record<string, { config?: { webhook_url?: string } }[]> }
  const v = verzio ?? ucp.version ?? UCP_VERZIO
  if (v !== UCP_VERZIO) throw new UcpHiba(422, 'version_unsupported', `A ${v} UCP-verzió nem támogatott; támogatott: ${UCP_VERZIO}.`)
  const platformKep = ucp.capabilities ? Object.keys(ucp.capabilities) : Object.keys(KEPESSEGEK)
  const kozos = new Set(Object.keys(KEPESSEGEK).filter((k) => platformKep.includes(k)))
  kozos.add('dev.ucp.shopping.checkout')
  // a webhook csak a platform saját gépnevére mutathat, és ugyanazokat a szabályokat kapja, mint a profil
  let webhookUrl = ucp.capabilities?.['dev.ucp.shopping.order']?.[0]?.config?.webhook_url ?? null
  if (webhookUrl) {
    try {
      const w = await kimenoUrl(webhookUrl, 'invalid_webhook_url')
      if (!FEJLESZTES && w.hostname !== new URL(profil).hostname) webhookUrl = null
    } catch {
      webhookUrl = null
    }
  }
  return { profil, verzio: v, kepessegek: kozos, webhookUrl, alairt }
}

/** A válaszok ucp-borítéka: verzió, a közös képességek és a fizetési handlerek. */
export function boritek(p: Platform | null, statusz: 'success' | 'error' = 'success') {
  const kep = p ? Object.fromEntries(Object.entries(KEPESSEGEK).filter(([k]) => p.kepessegek.has(k))) : KEPESSEGEK
  return { version: UCP_VERZIO, status: statusz, capabilities: kep, payment_handlers: FIZETESI_HANDLEREK }
}
