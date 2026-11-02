// Fizetési rendszer (független konténer): REST + Stripe webhook, vékony csatoló a Stripe (külső SaaS) előtt.
// A díjbekérő összegét a számlázótól kérdezi, a rendeléskezelőt a homlokzatán értesíti; a Stripe-pal egyeztet
// (GET /api/legacy/payments/reconcile).

import { lejartLinkekAtvetele } from '@/legacy/payments/egyeztetes'
import { createServiceClient } from '@/lib/rendszer/adat'
import { inditas, log, restPing, utemez } from '../kozos/host'
import { sorBetekintes, sorMetrikak } from '../kozos/ops'
import { GET as lekerdezes, POST as letrehozas, RECONCILE as egyeztetes, RECONCILE_APPLY as egyeztetesAlkalmazas } from './routes/api'
import { POST as webhook } from './routes/webhook'

inditas({
  rendszer: 'payments',
  nev: 'Fizetési rendszer',
  port: Number(process.env.PORT ?? 4104),
  utvonalak: [
    { method: 'POST', minta: '/api/legacy/payments/webhook', handler: webhook },
    { method: 'POST', minta: '/api/legacy/payments', handler: letrehozas },
    { method: 'GET', minta: '/api/legacy/payments/reconcile', handler: egyeztetes },
    { method: 'POST', minta: '/api/legacy/payments/reconcile', handler: egyeztetesAlkalmazas },
    { method: 'GET', minta: '/ops/sor/:nev', handler: sorBetekintes('payment', 'LEGACY_PAYMENTS_KEY') },
    { method: 'GET', minta: '/api/legacy/payments', handler: lekerdezes },
  ],
  ellenorzesek: { adatbazis: () => restPing('RENDSZER_DB_URL') },
  sorMetrikak: sorMetrikak('payment'),
})

// A Stripe-ban lejárt linkek átvétele 10 percenként (ha a lejárati webhook nem érkezett meg) – 17. fázis, L6
utemez('stripe-lejart-linkek', 10 * 60_000, async () => {
  const { atvett } = await lejartLinkekAtvetele(createServiceClient())
  if (atvett) log(`[payments] ${atvett} lejárt Stripe-link átvéve`)
})
