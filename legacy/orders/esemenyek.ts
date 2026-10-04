// Rendelési események az order_events sorra (pgmq). Angol eseménynevek, ISO időbélyeg.

import type { SupabaseClient } from '@supabase/supabase-js'

export type RendelesEsemeny =
  | { event: 'ORDER_STATE_CHANGED'; from: string | null; to: string; action: string }
  | { event: 'ORDER_ACTION_FAILED'; state: string; action: string; reason: string; detail?: string }
  | { event: 'ORDER_MODIFIED'; state: string }
  | { event: 'SHIPMENT_DELAYED'; carrier: string; trackingNo: string | null; eta: string | null }

export async function esemenyKuldes(supabase: SupabaseClient, orderNo: number, esemeny: RendelesEsemeny) {
  const { error } = await supabase.schema('pgmq_public').rpc('send', {
    queue_name: 'order_events',
    message: { ...esemeny, orderNo, orderRef: `RND-${orderNo}`, ts: new Date().toISOString() },
    sleep_seconds: 0,
  })
  if (error) throw new Error(`order_events kuldes: ${error.message}`)
}
