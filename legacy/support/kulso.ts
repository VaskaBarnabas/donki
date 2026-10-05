// Az ügyfélszolgálat kapcsolatai más modulokkal, mindig azok interfészén:
//   rendelések: a régi stílusú HTTP homlokzat (X-Legacy-Key) – rendelés és folyamattörténet
//   katalógus: PostgREST (garanciaidő, raktári kód)
//   raktár: pgmq sorok – saját, a rendelésmodulétól független poll segéd (a spec szerint modulonként külön)

import type { SupabaseClient } from '@supabase/supabase-js'

type HomlokzatValasz<T> = { success: true; data: T } | { success: false; msg: string }

async function rendelesHomlokzat<T>(ut: string): Promise<HomlokzatValasz<T>> {
  const res = await fetch(`${process.env.APP_BASE_URL}/api/legacy/orders/${ut}`, {
    headers: { 'X-Legacy-Key': process.env.LEGACY_ORDERS_KEY ?? '' },
  })
  if (!res.ok) throw new Error(`Rendelesi homlokzat HTTP ${res.status}`)
  return res.json()
}

export async function rendelesTetelei(orderNo: number): Promise<string[] | null> {
  const v = await rendelesHomlokzat<{ lines: { productCode: string }[] }>(String(orderNo))
  return v.success ? v.data.lines.map((l) => l.productCode) : null
}

/** A rendelés SZALLITVA állapotba lépésének ideje a homlokzat /history végpontja szerint. */
export async function teljesitesIdeje(orderNo: number): Promise<string | null> {
  const v = await rendelesHomlokzat<{ to_state: string; ok: boolean; ts: string }[]>(`${orderNo}/history`)
  if (!v.success) return null
  return v.data.find((h) => h.to_state === 'SZALLITVA' && h.ok)?.ts ?? null
}

export async function termek(supabase: SupabaseClient, kod: string) {
  const { data, error } = await supabase
    .schema('catalog')
    .from('products')
    .select('code, warranty_months, raktari_kod')
    .eq('code', kod)
    .maybeSingle()
  if (error) throw new Error(`Katalogus: ${error.message}`)
  return data as { code: string; warranty_months: number; raktari_kod: number | null } | null
}

// ---------------------------------------------------------------- raktári parancs (saját poll segéd)

export type RaktarValasz = { corr: string; status: 'OK' | 'NOK'; hibakod?: string; uzenet?: string; [k: string]: unknown }

/** Parancs a raktárnak, majd a válasz kivárása (1 mp-enként, max. 10 mp). null = nem jött válasz. */
export async function raktarParancs(supabase: SupabaseClient, parancs: Record<string, unknown>): Promise<RaktarValasz | null> {
  const corr = `hd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const sor = supabase.schema('pgmq_public')
  const kuld = await sor.rpc('send', { queue_name: 'inventory_commands', message: { ...parancs, corr }, sleep_seconds: 0 })
  if (kuld.error) throw new Error(`Raktar parancs: ${kuld.error.message}`)

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    const { data, error } = await sor.rpc('read', { queue_name: 'inventory_replies', sleep_seconds: 0, n: 100 })
    if (error) throw new Error(`Raktar valasz: ${error.message}`)
    const uzenet = ((data ?? []) as { msg_id: number; message: RaktarValasz }[]).find((m) => m.message?.corr === corr)
    if (uzenet) {
      await sor.rpc('delete', { queue_name: 'inventory_replies', message_id: uzenet.msg_id })
      return uzenet.message
    }
  }
  return null
}
