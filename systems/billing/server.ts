// Számlázó rendszer (független konténer): szöveges protokoll, díjbekérő és számla, saját PDF-tárhely.
// A végleges számlát a fizetés után a SzámlaBridge állítja ki a Számlázz.hu tesztfiókban (külső SaaS).

import { createServiceClient } from '@/lib/rendszer/adat'
import { inditas, log, naponta, restPing } from '../kozos/host'
import { GET as pdf } from './routes/pdf'
import { POST as protokoll } from './routes/protokoll'

inditas({
  rendszer: 'billing',
  nev: 'Számlázó rendszer',
  port: Number(process.env.PORT ?? 4103),
  utvonalak: [
    { method: 'POST', minta: '/api/legacy/billing', handler: protokoll },
    { method: 'GET', minta: '/api/legacy/billing/pdf/*ut', handler: pdf },
  ],
  ellenorzesek: { adatbazis: () => restPing('RENDSZER_DB_URL') },
})

// Éjszakai lejárat-jelölés (korábban pg_cron, UTC 02:15)
naponta('lejart-jeloles', 2, 15, async () => {
  const { data, error } = await createServiceClient().schema('billing').rpc('jelol_lejart')
  if (error) throw new Error(error.message)
  log(`[billing] lejart-jeloles: ${data} szamla`)
})
