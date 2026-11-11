// 21. fázis, UCP-átjáró (Universal Commerce Protocol, 2026-04-08, REST-kötés): a kereskedői oldal. Külön folyamat, a portáltól
// elválasztva; a rendszereket csak az MCP-n éri el (`ucp` szerepkör), az állapot az agens-db ucp sémájában.
//
//   GET  /.well-known/ucp                         felfedezés
//   POST /ucp/checkout-sessions                   létrehozás           (201)
//   GET  /ucp/checkout-sessions/{id}              lekérdezés
//   PUT  /ucp/checkout-sessions/{id}              teljes csere
//   POST /ucp/checkout-sessions/{id}/complete     lezárás → jóváhagyásra vár (complete_in_progress)
//   POST /ucp/checkout-sessions/{id}/cancel       megszakítás
//   GET  /ucp/orders/{id}                         rendelés
//
// Futtatás: npx tsx ucp/szerver.ts (vagy konténerben). Tesztmód: UCP_KONFORMANCIA=1 (lásd beallitas.ts).

import express, { type NextFunction, type Request, type Response } from 'express'
import { ALAP_URL, KONFORMANCIA, log, PORT, SHOPPING_URL } from './beallitas'
import * as k from './kereskedo'
import { boritek, platform, UcpHiba, uzletiProfil, type Platform } from './profil'
import * as t from './tarolo'
import { indit as vegrehajtoIndit } from './vegrehajto'

const app = express()
app.disable('x-powered-by')
// a nyers törzs a Content-Digest ellenőrzéséhez kell
app.use(express.json({ limit: '256kb', verify: (req, _res, buf) => void ((req as Request & { nyers?: Buffer }).nyers = Buffer.from(buf)) }))

// ---------------------------------------------------------------- segédek

function hibaValasz(res: Response, statusz: number, kod: string, szoveg: string, p: Platform | null = null) {
  res.status(statusz).json({ ucp: boritek(p, 'error'), messages: [{ type: 'error', code: kod, content: szoveg, severity: statusz >= 500 ? 'recoverable' : 'unrecoverable' }] })
}

type Kezelo = (req: Request, p: Platform) => Promise<{ statusz: number; adat: unknown }>

/** A közös csővezeték: platform-azonosítás, idempotencia (Idempotency-Key + művelet + kéréstörzs), hibakezelés. */
function muvelet(nev: string, kezelo: Kezelo, iro = true) {
  return async (req: Request, res: Response) => {
    let p: Platform | null = null
    try {
      p = await platform(req.header('ucp-agent'), { metodus: req.method, url: `${ALAP_URL}${req.originalUrl}`, fejlecek: req.headers, torzs: (req as Request & { nyers?: Buffer }).nyers ?? null })
      const kulcs = iro ? req.header('idempotency-key') : undefined
      const muv = `${nev}:${req.params.id ?? ''}`
      const kerHash = t.kivonat(req.body)
      if (kulcs) {
        const korabbi = await t.idempotens(kulcs, muv)
        if (korabbi) {
          if (korabbi.keres_hash !== kerHash) return hibaValasz(res, 409, 'idempotency_conflict', 'Ez az Idempotency-Key már egy másik tartalmú kéréshez tartozik.', p)
          return res.status(korabbi.statusz).json(korabbi.valasz)
        }
      }
      const { statusz, adat } = await kezelo(req, p)
      if (kulcs && statusz < 500) await t.idempotensMent(kulcs, muv, kerHash, statusz, adat)
      res.status(statusz).json(adat)
    } catch (e) {
      if (e instanceof UcpHiba || e instanceof k.UzletiHiba) return hibaValasz(res, e instanceof UcpHiba ? e.statusz : e.statusz, e.kod, e.message, p)
      log(`hiba (${nev}): ${e instanceof Error ? e.stack : e}`)
      hibaValasz(res, 500, 'internal_error', 'Belső hiba; próbáld újra később.', p)
    }
  }
}

/** A checkout csak annak a platformnak látszik, amelyik létrehozta (különben 404, a létezését sem áruljuk el). */
async function letezo(id: string, p: Platform) {
  const sor = await t.olvas(id)
  if (!sor || (!KONFORMANCIA && sor.platform !== p.profil)) throw new k.UzletiHiba(404, 'not_found', 'Nincs ilyen checkout.')
  return sor
}

// ---------------------------------------------------------------- felfedezés

app.get('/.well-known/ucp', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300').json(uzletiProfil())
})

// ---------------------------------------------------------------- checkout

app.post('/ucp/checkout-sessions', muvelet('create', async (req, p) => ({ statusz: 201, adat: k.valasz(await k.letrehoz(req.body ?? {}, p), p) })))
app.get('/ucp/checkout-sessions/:id', muvelet('get', async (req, p) => ({ statusz: 200, adat: k.valasz(await letezo(String(req.params.id), p), p) }), false))
app.put('/ucp/checkout-sessions/:id', muvelet('update', async (req, p) => ({ statusz: 200, adat: k.valasz(await k.frissit(await letezo(String(req.params.id), p), req.body ?? {}), p) })))
app.post('/ucp/checkout-sessions/:id/complete', muvelet('complete', async (req, p) => ({ statusz: 200, adat: k.valasz(await k.lezar(await letezo(String(req.params.id), p), req.body ?? {}, p), p) })))
app.post('/ucp/checkout-sessions/:id/cancel', muvelet('cancel', async (req, p) => ({ statusz: 200, adat: k.valasz(await k.megszakit(await letezo(String(req.params.id), p)), p) })))

// ---------------------------------------------------------------- rendelés

app.get(
  '/ucp/orders/:id',
  muvelet(
    'order',
    async (req, p) => {
      const { rows } = await (await import('../agens/kozos/naplo')).db().query<t.Sor>('select * from ucp.checkout where rendeles = $1 and ($2 or platform = $3)', [String(req.params.id), KONFORMANCIA, p.profil])
      if (!rows[0]) throw new k.UzletiHiba(404, 'not_found', 'Nincs ilyen UCP-rendelés.')
      return { statusz: 200, adat: await k.rendelesValasz(rows[0], p) }
    },
    false
  )
)

// ---------------------------------------------------------------- ember számára olvasható oldalak (continue_url, permalink, ÁSZF)

const html = (cim: string, torzs: string) =>
  `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${cim}</title><style>body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem;line-height:1.5}code{background:#f2f2f2;padding:0 .3em}</style></head><body><h1>${cim}</h1>${torzs}</body></html>`
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

app.get('/ucp/folytatas/:id', async (req, res) => {
  const sor = await t.olvas(String(req.params.id)).catch(() => null)
  if (!sor) return res.status(404).send(html('Nincs ilyen vásárlás', '<p>A hivatkozás lejárt vagy érvénytelen.</p>'))
  const allapot: Record<string, string> = {
    incomplete: 'Hiányzó adat: a vásárló ágens kiegészítheti.',
    requires_escalation: 'B2B kereskedő vagyunk: a vásárláshoz regisztrált partnerség kell. Munkatársunk felveszi a kapcsolatot.',
    ready_for_complete: 'A rendelés leadható.',
    complete_in_progress: 'A rendelést munkatársunk jóváhagyja, utána megerősítést küldünk.',
    completed: `A rendelés rögzítve: ${esc(sor.rendeles ?? '')}.`,
    canceled: 'A vásárlás megszakadt.',
  }
  res.send(html('Vásárlás állapota', `<p>${allapot[sor.allapot]}</p><p>Azonosító: <code>${esc(sor.id)}</code></p>`))
})
app.get('/ucp/rendelesek/:id', (req, res) => res.send(html(`Rendelés ${esc(String(req.params.id))}`, '<p>A rendelés aktuális állapotát a vásárló ágens a UCP-n kapja meg; kérdés esetén keresse értékesítő kollégánkat.</p>')))
app.get('/ucp/aszf', (_req, res) => res.send(html('Általános szerződési feltételek', '<p>Prototípus: a szakdolgozati mintacég feltételei. Árak nettóban, 27% ÁFA-val; fizetés díjbekérő alapján, a kiszállítás után.</p>')))
app.get('/ucp/adatvedelem', (_req, res) => res.send(html('Adatvédelem', '<p>Prototípus. A vásárlás adatait csak a rendelés teljesítéséhez használjuk; kártyaadatot nem fogadunk.</p>')))
app.get('/health', (_req, res) => res.json({ ok: true }))

app.use((_req, res) => hibaValasz(res, 404, 'not_found', 'Nincs ilyen végpont.'))
app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next
  hibaValasz(res, 400, 'invalid', e instanceof Error ? e.message : 'Érvénytelen kérés.')
})

const host = process.env.UCP_HOST ?? '127.0.0.1'
app.listen(PORT, host, () => {
  log(`UCP-átjáró: ${ALAP_URL} (felfedezés: ${ALAP_URL}/.well-known/ucp, végpont: ${SHOPPING_URL})${KONFORMANCIA ? ' – KONFORMANCIA-TESZTMÓD: szimulált jóváhagyó' : ''}`)
  vegrehajtoIndit()
})
