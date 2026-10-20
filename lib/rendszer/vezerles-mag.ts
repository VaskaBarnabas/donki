// A független rendszerek vezérlésének magja (15. fázis): állapot, ki/be kapcsolás, napló – jogosultság-ellenőrzés
// NÉLKÜL. A portál csak a lib/admin/vezerles.ts-en át hívja (admin ellenőrzéssel); a füstteszt közvetlenül.
// A Docker API-t a docker-socket-proxy-n át éri el (DOCKER_PROXY_URL), amely csak a konténerlistát, -állapotot,
// -statisztikát, -naplót és a start/stop/restart műveletet engedi. Művelet csak a donki.system címkés konténereken
// lehetséges – a portál és a proxy nem kapcsolható ki innen.


const PROXY = () => process.env.DOCKER_PROXY_URL ?? 'http://localhost:2375'

/** A rendszerek leírása: megjelenített név, interfész, és hogy honnan kérdezzük az egészségét. */
export const RENDSZEREK: Record<string, { nev: string; interfesz: string; egeszseg?: () => string; fuggosegek: string[] }> = {
  crm: { nev: 'CRM és katalógus', interfesz: 'PostgREST', egeszseg: () => `${process.env.CRM_API_URL ?? 'http://localhost:4100'}/`, fuggosegek: [] },
  quote: { nev: 'Ajánlatkezelő', interfesz: 'JSON-RPC 2.0', egeszseg: () => `${process.env.QUOTE_URL ?? 'http://localhost:4101'}/health`, fuggosegek: ['crm', 'orders'] },
  orders: { nev: 'Rendeléskezelő', interfesz: 'régi HTTP homlokzat + Flowable', egeszseg: () => `${process.env.ORDERS_URL ?? 'http://localhost:4102'}/health`, fuggosegek: ['crm', 'inventory', 'billing'] },
  inventory: { nev: 'Raktárrendszer', interfesz: 'üzenetsor (pgmq)', egeszseg: () => `${process.env.INVENTORY_URL ?? 'http://localhost:4106'}/health`, fuggosegek: [] },
  billing: { nev: 'Számlázó rendszer', interfesz: 'szöveges protokoll', egeszseg: () => `${process.env.BILLING_URL ?? 'http://localhost:4103'}/health`, fuggosegek: [] },
  payments: { nev: 'Fizetési rendszer', interfesz: 'REST + Stripe webhook', egeszseg: () => `${process.env.PAYMENTS_URL ?? 'http://localhost:4104'}/health`, fuggosegek: ['billing', 'orders'] },
  support: { nev: 'Helpdesk', interfesz: 'SOAP 1.1', egeszseg: () => `${process.env.SUPPORT_URL ?? 'http://localhost:4105'}/health`, fuggosegek: ['crm', 'orders', 'inventory'] },
  mcp: { nev: 'MCP integrációs réteg', interfesz: 'MCP (Streamable HTTP)', fuggosegek: ['crm', 'quote', 'orders', 'inventory', 'billing', 'payments', 'support'] },
}

export class VezerlesHiba extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

type DockerKontener = { Id: string; Names: string[]; State: string; Status: string; Labels: Record<string, string> }

async function docker<T>(ut: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${PROXY()}${ut}`, { ...init, signal: AbortSignal.timeout(20_000) })
  } catch {
    throw new VezerlesHiba(503, 'A Docker vezérlés (docker-proxy) nem érhető el.')
  }
  if (res.status === 304) return undefined as T // már abban az állapotban van
  if (!res.ok) throw new VezerlesHiba(502, `Docker API hiba: HTTP ${res.status}`)
  return (res.headers.get('content-type')?.includes('json') ? res.json() : res.text()) as Promise<T>
}

async function kontenerek(): Promise<DockerKontener[]> {
  const szuro = encodeURIComponent(JSON.stringify({ label: ['donki.system'] }))
  return docker<DockerKontener[]>(`/containers/json?all=1&filters=${szuro}`)
}

export type KontenerAllapot = { nev: string; szerep: string; allapot: string; leiras: string; memoriaMb: number | null }
export type RendszerAllapot = {
  rendszer: string
  nev: string
  interfesz: string
  fuggosegek: string[]
  allapot: 'fut' | 'leallt' | 'reszleges'
  egeszseg: { ok: boolean; ms: number; reszlet: unknown } | null
  kontenerek: KontenerAllapot[]
}

async function memoria(id: string): Promise<number | null> {
  try {
    const s = await docker<{ memory_stats?: { usage?: number; stats?: { inactive_file?: number } } }>(`/containers/${id}/stats?stream=false&one-shot=true`)
    const u = s.memory_stats?.usage
    return u ? Math.round((u - (s.memory_stats?.stats?.inactive_file ?? 0)) / 1048576) : null
  } catch {
    return null
  }
}

async function egeszseg(url: string | undefined) {
  if (!url) return null
  const k = Date.now()
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
    const reszlet = r.headers.get('content-type')?.includes('json') ? await r.json().catch(() => null) : null
    return { ok: r.ok, ms: Date.now() - k, reszlet }
  } catch (e) {
    return { ok: false, ms: Date.now() - k, reszlet: e instanceof Error ? e.message : String(e) }
  }
}

export async function rendszerAllapotok(): Promise<RendszerAllapot[]> {
  const lista = await kontenerek()
  return Promise.all(
    Object.entries(RENDSZEREK).map(async ([rendszer, r]) => {
      const sajat = lista.filter((c) => c.Labels['donki.system'] === rendszer)
      const futo = sajat.filter((c) => c.State === 'running').length
      const allapot: RendszerAllapot['allapot'] = futo === 0 ? 'leallt' : futo === sajat.length ? 'fut' : 'reszleges'
      const [eg, ...mem] = await Promise.all([allapot === 'leallt' ? null : egeszseg(r.egeszseg?.()), ...sajat.map((c) => (c.State === 'running' ? memoria(c.Id) : null))])
      return {
        rendszer,
        nev: r.nev,
        interfesz: r.interfesz,
        fuggosegek: r.fuggosegek,
        allapot,
        egeszseg: eg,
        kontenerek: sajat.map((c, i) => ({ nev: c.Names[0]?.replace(/^\//, '') ?? c.Id.slice(0, 12), szerep: c.Labels['donki.role'] ?? '', allapot: c.State, leiras: c.Status, memoriaMb: mem[i] })),
      }
    })
  )
}

// indítás: adatbázis → PostgREST → folyamatmotor → szolgáltatás → webhook-továbbító; leállítás fordítva
const SORREND: Record<string, number> = { db: 0, rest: 1, api: 1, engine: 2, app: 3, 'webhook-forwarder': 4 }
const sorrend = (szerep: string) => SORREND[szerep] ?? (szerep.startsWith('mcp-') ? 3 : 9)

export type Muvelet = 'start' | 'stop' | 'restart'

export async function rendszerMuvelet(rendszer: string, muvelet: Muvelet): Promise<{ kontenerek: string[] }> {
  if (!RENDSZEREK[rendszer]) throw new VezerlesHiba(404, `Ismeretlen rendszer: ${rendszer}`)
  const sajat = (await kontenerek()).filter((c) => c.Labels['donki.system'] === rendszer)
  if (sajat.length === 0) throw new VezerlesHiba(404, `A(z) ${rendszer} rendszernek nincs konténere.`)
  const rendezett = [...sajat].sort((a, b) => sorrend(a.Labels['donki.role'] ?? '') - sorrend(b.Labels['donki.role'] ?? ''))
  const lepesek = muvelet === 'stop' ? rendezett.reverse() : rendezett
  for (const c of lepesek) await docker(`/containers/${c.Id}/${muvelet}`, { method: 'POST' })
  return { kontenerek: lepesek.map((c) => c.Names[0]?.replace(/^\//, '') ?? c.Id) }
}

/** A rendszer konténereinek utolsó naplósorai (a Docker multiplexelt naplóformátumából kibontva). */
export async function rendszerNaplo(rendszer: string, sorok = 100): Promise<{ kontener: string; sorok: string[] }[]> {
  if (!RENDSZEREK[rendszer]) throw new VezerlesHiba(404, `Ismeretlen rendszer: ${rendszer}`)
  const sajat = (await kontenerek()).filter((c) => c.Labels['donki.system'] === rendszer)
  return Promise.all(
    sajat.map(async (c) => {
      const res = await fetch(`${PROXY()}/containers/${c.Id}/logs?stdout=1&stderr=1&timestamps=1&tail=${sorok}`)
      const buf = Buffer.from(await res.arrayBuffer())
      const szoveg: string[] = []
      for (let i = 0; i + 8 <= buf.length; ) {
        const hossz = buf.readUInt32BE(i + 4)
        szoveg.push(buf.subarray(i + 8, i + 8 + hossz).toString('utf8'))
        i += 8 + hossz
      }
      return { kontener: c.Names[0]?.replace(/^\//, '') ?? c.Id, sorok: szoveg.join('').split('\n').filter(Boolean) }
    })
  )
}
