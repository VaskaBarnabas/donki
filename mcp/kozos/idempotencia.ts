// Írási eszközök idempotenciája: ugyanazzal a kulccsal ismételt hívás a korábbi eredményt adja vissza,
// a műveletet nem ismétli meg (pl. egy újrapróbált „jóváhagyás” vagy „lemondás”).

import { db, log } from './kornyezet'

type Kulcs = { server: string; tool: string; client_id: string; idempotency_key: string }

export async function korabbiEredmeny(k: Kulcs): Promise<Record<string, unknown> | null> {
  const { data, error } = await db()
    .schema('mcp')
    .from('idempotency')
    .select('response')
    .match(k)
    .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .maybeSingle()
  if (error) {
    log('idempotencia lekerdezes sikertelen:', error.message)
    return null
  }
  return (data?.response as Record<string, unknown>) ?? null
}

export async function eredmenyMentese(k: Kulcs, response: Record<string, unknown>): Promise<void> {
  const { error } = await db().schema('mcp').from('idempotency').upsert({ ...k, response, created_at: new Date().toISOString() })
  if (error) log('idempotencia mentes sikertelen:', error.message)
}
