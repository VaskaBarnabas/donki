// 21. fázis, UCP-átjáró háttérfolyamatai:
//   – a portálon jóváhagyott vagy elutasított checkoutok végrehajtása (accept_quote → rendelés, vagy megszakítás);
//   – a rendelések állapotváltozásának figyelése, és rendelés-esemény (teljes állapot) a platform webhookjára;
//   – az aláírt webhookok kézbesítése újrapróbálással (RFC 9421, Webhook-Id, Webhook-Timestamp, UCP-Agent).

import { alairtFejlecek } from './alairas'
import { ALAP_URL, log } from './beallitas'
import * as k from './kereskedo'
import { kimenoUrl } from './profil'
import * as t from './tarolo'

let fut = false

async function jovahagyasok() {
  for (const sor of await t.jovahagyasraVar()) {
    if (sor.jovahagyas === 'jovahagyva' || sor.jovahagyas === 'elutasitva') {
      const kesz = await k.vegrehajt(sor)
      log(`${sor.id}: ${sor.jovahagyas} → ${kesz.allapot}${kesz.rendeles ? ` (${kesz.rendeles})` : ''}`)
    }
  }
}

async function rendelesFigyeles() {
  for (const sor of await t.kovetett()) {
    try {
      const o = await k.rendelesValasz(sor, null)
      if (!o) continue
      const uj = k.ujjlenyomat(o)
      if (uj !== sor.utolso_esemeny) {
        await t.webhookSorba(sor.rendeles!, sor.webhook_url!, o)
        await t.ment({ id: sor.id, utolso_esemeny: uj })
      }
    } catch (e) {
      log(`rendelésfigyelés ${sor.rendeles}: ${e instanceof Error ? e.message : e}`)
    }
  }
}

async function kezbesites() {
  for (const w of await t.webhookEsedekes()) {
    try {
      await kimenoUrl(w.url, 'invalid_webhook_url') // a kézbesítés előtt újra: a cím feloldása közben változhatott
    } catch (e) {
      await t.webhookEredmeny(w.id, false, 99, e instanceof Error ? e.message : String(e))
      continue
    }
    const torzs = JSON.stringify(w.esemeny)
    const fejlec = alairtFejlecek('POST', w.url, torzs, { 'webhook-id': `ucp-evt-${w.id}`, // az újrapróbálás ugyanazt az esemény-azonosítót viszi (a platform így szűri az ismétlést)
'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'ucp-agent': `profile="${ALAP_URL}/.well-known/ucp"` })
    try {
      const v = await fetch(w.url, { method: 'POST', headers: fejlec, body: torzs, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      await t.webhookEredmeny(w.id, v.ok, w.kiserlet + 1, v.ok ? undefined : `HTTP ${v.status}`)
    } catch (e) {
      await t.webhookEredmeny(w.id, false, w.kiserlet + 1, e instanceof Error ? e.message : String(e))
    }
  }
}

async function kor() {
  if (fut) return
  fut = true
  try {
    await jovahagyasok()
  } catch (e) {
    log(`háttér: ${e instanceof Error ? e.message : e}`)
  } finally {
    fut = false
  }
}

export function indit() {
  // a jóváhagyások 3 másodpercenként; a webhook-kézbesítés gyakrabban, hogy a rendelés-esemény (és az újrapróbálás) gyorsan menjen
  setInterval(() => void kor(), 3000).unref()
  let kuld = false
  setInterval(() => {
    if (kuld) return
    kuld = true
    void kezbesites()
      .catch((e) => log(`kézbesítés: ${e instanceof Error ? e.message : e}`))
      .finally(() => (kuld = false))
  }, 500).unref()
  setInterval(() => void rendelesFigyeles().catch(() => null), 60_000).unref()
}

/** A füstteszt és a konformancia-tesztmód számára: egy kör azonnal. */
export const egyKor = kor
