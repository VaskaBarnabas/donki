// Az ágens MCP-kapcsolata (17. fázis): a felhasználó szerepkörének tokenjével kapcsolódik a domain szerverekhez,
// beolvassa az eszközöket a kockázati jelölésükkel (_meta["donki/risk"] – a LangChain MCP-adaptere ezt nem adja át,
// ezért saját csomagolás), és végrehajtja a hívásokat. Minden kérés megkapja az ágensfutás azonosítóját
// (X-Agens-Futas), így az MCP naplója (mcp.tool_calls.agent_run_id) összekapcsolható az ágens naplójával.

import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { hibaKiolvasas } from '../../mcp/kozos/hiba'
import { MCP_SZERVEREK, mcpToken, type Szerep, type SzerverNev } from './kornyezet'

export type Kockazat = 'read' | 'write' | 'financial' | 'irreversible'

export type McpEszkoz = {
  szerver: SzerverNev
  nev: string
  /** magyar megjelenítendő név (az MCP `title`) – a jóváhagyási kártyához */
  cim: string
  leiras: string
  /** a modellnek adott bemeneti séma (JSON Schema) – az idempotencia-kulcs nélkül, azt a végrehajtó adja */
  schema: Record<string, unknown>
  kockazat: Kockazat
  idempotens: boolean
}

export type HivasEredmeny = { ok: boolean; szoveg: string; hibakod: string | null }

const MAX_VALASZ = 6000

export class McpKapcsolat {
  private constructor(
    private readonly kliensek: Map<SzerverNev, Client>,
    readonly eszkozok: McpEszkoz[]
  ) {}

  /** Kapcsolódás a megadott szerverekhez a szerepkör tokenjével; az eszközlista a kockázati jelöléssel. */
  static async nyit(szerep: Szerep, futasId: string, szerverek: readonly SzerverNev[]): Promise<McpKapcsolat> {
    const token = mcpToken(szerep)
    const kliensek = new Map<SzerverNev, Client>()
    const eszkozok: McpEszkoz[] = []
    for (const sz of szerverek) {
      const kliens = new Client({ name: `donki-agens-${szerep}`, version: '17.0.0' })
      await kliens.connect(
        new StreamableHTTPClientTransport(new URL(MCP_SZERVEREK[sz]), {
          requestInit: { headers: { Authorization: `Bearer ${token}`, 'X-Agens-Futas': futasId } },
        })
      )
      kliensek.set(sz, kliens)
      const { tools } = await kliens.listTools()
      for (const t of tools) {
        const schema = structuredClone(t.inputSchema) as { properties?: Record<string, unknown>; required?: string[] } & Record<string, unknown>
        const idempotens = !!schema.properties?.idempotencyKey
        if (schema.properties) delete schema.properties.idempotencyKey
        if (schema.required) schema.required = schema.required.filter((r) => r !== 'idempotencyKey')
        delete schema.$schema
        eszkozok.push({
          szerver: sz,
          nev: t.name,
          cim: t.title ?? t.name,
          leiras: t.description ?? t.name,
          schema,
          kockazat: ((t._meta as Record<string, unknown> | undefined)?.['donki/risk'] as Kockazat | undefined) ?? 'write', // jelölés nélkül: óvatosan írónak vesszük
          idempotens,
        })
      }
    }
    return new McpKapcsolat(kliensek, eszkozok)
  }

  eszkoz(nev: string): McpEszkoz | undefined {
    return this.eszkozok.find((e) => e.nev === nev)
  }

  /**
   * Egy eszköz hívása. Az író eszközök determinisztikus idempotencia-kulcsot kapnak (a futás és a modell hívás-
   * azonosítójából), így egy folytatott vagy újrapróbált lépés sem hajtja végre kétszer ugyanazt.
   */
  async hiv(nev: string, args: Record<string, unknown>, hivasAzon: string): Promise<HivasEredmeny> {
    const e = this.eszkoz(nev)
    if (!e) return { ok: false, szoveg: JSON.stringify({ error: { code: 'UNKNOWN_TOOL', message: `Nincs ilyen eszköz: ${nev}` } }), hibakod: 'UNKNOWN_TOOL' }
    const bemenet = { ...args }
    if (e.idempotens) bemenet.idempotencyKey = `agens-${createHash('sha256').update(hivasAzon).digest('hex').slice(0, 32)}`
    try {
      const r = await this.kliensek.get(e.szerver)!.callTool({ name: nev, arguments: bemenet }, undefined, { timeout: 120_000 })
      if (r.isError) {
        const hiba = hibaKiolvasas(r)
        return { ok: false, szoveg: JSON.stringify({ error: hiba ?? { message: szovegTartalom(r) } }).slice(0, MAX_VALASZ), hibakod: hiba?.code ?? 'ERROR' }
      }
      const adat = r.structuredContent ?? szovegTartalom(r)
      return { ok: true, szoveg: (typeof adat === 'string' ? adat : JSON.stringify(adat)).slice(0, MAX_VALASZ), hibakod: null }
    } catch (err) {
      return { ok: false, szoveg: JSON.stringify({ error: { code: 'MCP_UNAVAILABLE', message: err instanceof Error ? err.message : String(err) } }), hibakod: 'MCP_UNAVAILABLE' }
    }
  }

  async zar(): Promise<void> {
    await Promise.all([...this.kliensek.values()].map((k) => k.close().catch(() => null)))
  }
}

function szovegTartalom(r: object): string {
  return (((r as { content?: unknown }).content as { type: string; text?: string }[]) ?? []).map((c) => c.text ?? '').join('\n')
}
