// Külső számla: a SzámlaBridge (Stripe → Számlázz.hu) által a fizetés után kiállított számla lekérdezése.
// A SzámlaBridge publikus API-ja csak olvas: állapot (invoiceStatus) és PDF (downloadInvoice),
// a fizetés azonosítójával (Stripe pi_…) és a fiók publikus kulcsával.
// Dokumentáció: https://www.szamlabridge.com/fordevelopers
//
// BIZTOSÍTÉK: csak teszt üzemmódban működik (SZAMLABRIDGE_MODE=test és Stripe teszt kulcs). A Számlázz.hu
// fiók tesztüzemben van – tesztüzemben a Számlázz.hu nem végez NAV adatszolgáltatást.

const ALAP = 'https://www.szamlabridge.com/api/public'

export class KulsoSzamlaHiba extends Error {}

export function tesztUzemEllenorzes() {
  if (process.env.SZAMLABRIDGE_MODE !== 'test') {
    throw new KulsoSzamlaHiba('SZAMLABRIDGE_MODE nem "test" – a kulso szamlazas csak teszt uzemmodban engedelyezett')
  }
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    throw new KulsoSzamlaHiba('Nem Stripe teszt kulcs – a kulso szamlazas csak teszt uzemmodban engedelyezett')
  }
  if (!process.env.SZAMLABRIDGE_PUBLIC_KEY) {
    throw new KulsoSzamlaHiba('Hianyzo SZAMLABRIDGE_PUBLIC_KEY')
  }
}

export type KulsoAllapot = {
  /** a SzámlaBridge issueStatus / issueText mezője, ahogy jött (tájékoztató; hogy kész-e, azt a PDF dönti el) */
  allapot: string
  /** a teljes nyers válasz (hibakereséshez) */
  nyers: Record<string, unknown>
}

async function hivas(vegpont: 'invoiceStatus' | 'downloadInvoice', stripeId: string): Promise<Response> {
  tesztUzemEllenorzes()
  return fetch(`${ALAP}/${vegpont}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: process.env.SZAMLABRIDGE_PUBLIC_KEY, stripeId }),
    cache: 'no-store',
  })
}

/** A számla állapota a SzámlaBridge-nél. */
export async function kulsoAllapot(stripeId: string): Promise<KulsoAllapot> {
  const res = await hivas('invoiceStatus', stripeId)
  const nyers = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    return { allapot: String(nyers.message ?? `HTTP ${res.status}`), nyers }
  }
  // A válasz: {"status":{"stripeStatus","dataIntegrityStatus","issueStatus","stripeText","dataIntegrityText","issueText"}}
  const st = (nyers.status && typeof nyers.status === 'object' ? nyers.status : nyers) as Record<string, unknown>
  const issueStatus = String(st.issueStatus ?? '')
  const issueText = String(st.issueText ?? '')
  return { allapot: [issueStatus, issueText].filter(Boolean).join(' – ') || 'ismeretlen', nyers }
}

/** A kiállított számla PDF-je; null, ha még nincs kész. Ez a megbízható jele annak, hogy a számla elkészült. */
export async function kulsoPdf(stripeId: string): Promise<Uint8Array | null> {
  const res = await hivas('downloadInvoice', stripeId)
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('pdf')) return null
  return new Uint8Array(await res.arrayBuffer())
}
