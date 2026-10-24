// Számlázó rendszer (független konténer): szöveges protokoll, vékony csatoló a Számlázz.hu (a bizonylatok gazdája)
// előtt. Minden díjbekérő, számla, sztornó és kifizetés a Számla Agenten át a Számlázz.hu-ban is megtörténik;
// a fizetés utáni végszámlát a SzámlaBridge állítja ki ugyanabban a (teszt)fiókban.

import { createServiceClient } from '@/lib/rendszer/adat'
import { tesztfiokAllapot, tesztfiokIgazolas } from '@/legacy/billing/szamlazzhu'
import { atvezetes, egyeztetes } from '@/legacy/billing/szinkron'
import { inditas, log, naponta, restPing, utemez } from '../kozos/host'
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
  ellenorzesek: {
    adatbazis: () => restPing('RENDSZER_DB_URL'),
    szamlazzhu_tesztfiok: async () => {
      if (tesztfiokAllapot() !== 'igazolt') throw new Error(`a Szamlazz.hu tesztfiok: ${tesztfiokAllapot()}`)
    },
  },
})

// Éjszakai lejárat-jelölés (korábban pg_cron, UTC 02:15)
naponta('lejart-jeloles', 2, 15, async () => {
  const { data, error } = await createServiceClient().schema('billing').rpc('jelol_lejart')
  if (error) throw new Error(error.message)
  log(`[billing] lejart-jeloles: ${data} szamla`)
})

// Induláskor: a tesztfiók igazolása, majd a még nem szinkronizált (pl. seedelt) bizonylatok átvezetése a
// Számlázz.hu-ba. Amíg nem sikerül, percenként újrapróbálja; utána csak akkor dolgozik, ha új tétel van.
utemez('szamlazzhu-atvezetes', 60_000, async () => {
  await tesztfiokIgazolas()
  const n = await atvezetes(createServiceClient(), (s) => log(`[billing] atvezetes: ${s}`))
  if (n) log(`[billing] atvezetes kesz: ${n} bizonylat`)
})

// Egyeztetés a gazdával 15 percenként (bruttó, fizetettség); az eltérés a SZAMLA|SZINKRON-ban és a portálon látszik.
utemez('szamlazzhu-egyeztetes', 15 * 60_000, async () => {
  await tesztfiokIgazolas()
  const e = await egyeztetes(createServiceClient())
  log(`[billing] egyeztetes: ${e.ok}/${e.osszes} egyezik${e.elteres.length ? `, eltérés: ${e.elteres.map((x) => `${x.szam} ${x.allapot}`).join(', ')}` : ''}`)
})
