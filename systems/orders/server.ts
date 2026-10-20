// Rendeléskezelő rendszer (független konténer): a régi HTTP homlokzat, a folyamatmotor visszahívási végpontjai,
// és a fuvarozó-szimuláció (korábban pg_cron). A Flowable a rendeléskezelő része, a saját adatbázisában.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { telepit } from '@/lib/flowable/client'
import { createServiceClient } from '@/lib/rendszer/adat'
import { inditas, log, restPing, utemez, type Handler } from '../kozos/host'
import { GET as homlokzatGet, POST as homlokzatPost } from './routes/homlokzat'
import { POST as motor } from './routes/motor'

inditas({
  rendszer: 'orders',
  nev: 'Rendeléskezelő',
  port: Number(process.env.PORT ?? 4102),
  utvonalak: [
    // a motor-végpontok előbb: a catch-all homlokzat elnyelné őket
    { method: 'POST', minta: '/api/legacy/orders/_engine/:action', handler: motor as Handler },
    { method: 'GET', minta: '/api/legacy/orders/*path', handler: homlokzatGet as Handler },
    { method: 'POST', minta: '/api/legacy/orders/*path', handler: homlokzatPost as Handler },
  ],
  ellenorzesek: {
    adatbazis: () => restPing('RENDSZER_DB_URL'),
    folyamatmotor: async () => {
      const r = await fetch(`${process.env.FLOWABLE_REST_URL}/management/engine`, {
        headers: { Authorization: `Basic ${Buffer.from(`${process.env.FLOWABLE_REST_USER}:${process.env.FLOWABLE_REST_PASSWORD}`).toString('base64')}` },
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    },
    crm: () => restPing('CRM_API_URL'),
    raktar: () => restPing('INVENTORY_API_URL'),
  },
})

// Fuvarozó-szimuláció: percenként lépteti a szállítások állapotát (korábban pg_cron)
utemez('szallitas-szimulacio', 60_000, async () => {
  const { error } = await createServiceClient().schema('orders').rpc('leptet_szallitasok')
  if (error) throw new Error(error.message)
})

// A rendelési folyamat (BPMN) telepítése a saját folyamatmotorba, ha még nincs benne – induláskor, és amíg a
// Flowable el nem indul, 15 mp-enként újrapróbálva. (Korábban kézi lépés volt: npm run flowable:deploy.)
const BPMN_MAPPA = process.env.BPMN_MAPPA ?? path.join(process.cwd(), 'fajlok')
let telepitve = false
utemez('bpmn-telepites', 15_000, async () => {
  if (telepitve) return
  const auth = `Basic ${Buffer.from(`${process.env.FLOWABLE_REST_USER}:${process.env.FLOWABLE_REST_PASSWORD}`).toString('base64')}`
  const r = await fetch(`${process.env.FLOWABLE_REST_URL}/repository/process-definitions?key=rendeles_folyamat`, { headers: { Authorization: auth } })
  if (!r.ok) throw new Error(`a folyamatmotor meg nem elerheto (HTTP ${r.status})`)
  if (((await r.json()) as { total: number }).total === 0) {
    const fajlok = existsSync(BPMN_MAPPA) ? readdirSync(BPMN_MAPPA).filter((f) => f.endsWith('.bpmn20.xml')) : []
    for (const f of fajlok) {
      const d = await telepit(f, readFileSync(path.join(BPMN_MAPPA, f), 'utf8'))
      log(`[orders] BPMN telepitve: ${f} → ${d.id}`)
    }
  }
  telepitve = true
})
