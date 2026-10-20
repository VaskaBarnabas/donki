// Fizetési rendszer (független konténer): REST + Stripe webhook, vékony csatoló a Stripe (külső SaaS) előtt.
// A díjbekérő összegét a számlázótól kérdezi, a rendeléskezelőt a homlokzatán értesíti.

import { inditas, restPing } from '../kozos/host'
import { GET as lekerdezes, POST as letrehozas } from './routes/api'
import { POST as webhook } from './routes/webhook'

inditas({
  rendszer: 'payments',
  nev: 'Fizetési rendszer',
  port: Number(process.env.PORT ?? 4104),
  utvonalak: [
    { method: 'POST', minta: '/api/legacy/payments/webhook', handler: webhook },
    { method: 'POST', minta: '/api/legacy/payments', handler: letrehozas },
    { method: 'GET', minta: '/api/legacy/payments', handler: lekerdezes },
  ],
  ellenorzesek: { adatbazis: () => restPing('RENDSZER_DB_URL') },
})
