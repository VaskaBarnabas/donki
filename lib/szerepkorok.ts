// A hat szerepkör és a műveletek jogosultsági mátrixa (16. fázis) – közös forrás a portál számára, az MCP eszközök
// szerepköreivel azonos tartalommal (mcp/servers/*/index.ts: roles). Az admin mindent megtehet; az olvasás mindenkinek szabad.

export const SZEREPKOROK = ['viewer', 'sales', 'logistics', 'finance', 'sales_manager', 'admin'] as const
export type Szerepkor = (typeof SZEREPKOROK)[number]

export const SZEREPKOR_NEV: Record<Szerepkor, string> = {
  viewer: 'Megtekintő',
  sales: 'Értékesítő',
  logistics: 'Logisztika',
  finance: 'Pénzügy',
  sales_manager: 'Értékesítési vezető',
  admin: 'Rendszergazda',
}

export const JOGOK = {
  'crm.iras': ['sales', 'sales_manager'],
  'katalogus.iras': ['sales_manager'],
  'ajanlat.iras': ['sales', 'sales_manager'],
  'ajanlat.jovahagyas': ['sales_manager'],
  'rendeles.approve': ['sales_manager'],
  'rendeles.cancel': ['sales_manager'],
  'rendeles.fulfil': ['logistics', 'sales_manager'],
  'rendeles.invoice': ['finance'],
  'rendeles.modify': ['sales', 'sales_manager'],
  'raktar.mozgas': ['logistics', 'sales_manager'],
  'szamlazo.iras': ['finance'],
  'fizetes.link': ['finance'],
  'helpdesk.iras': ['sales', 'sales_manager'],
  'helpdesk.rma': ['sales_manager'],
  'helpdesk.beerkezes': ['logistics', 'sales_manager'],
  'portal.admin': [],
} as const satisfies Record<string, readonly Szerepkor[]>

export type Jog = keyof typeof JOGOK

export function jogosult(szerep: Szerepkor | null | undefined, jog: Jog): boolean {
  if (!szerep) return false
  return szerep === 'admin' || (JOGOK[jog] as readonly Szerepkor[]).includes(szerep)
}
