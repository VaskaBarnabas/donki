// Raktárrendszer – a worker (független konténer). A raktárnak nincs HTTP interfésze: kívülről csak az üzenetsorán
// érhető el (az inventory-api PostgREST pgmq_public sémája). Ez a folyamat dolgozza fel a sort 5 mp-enként
// (korábban pg_cron); ha le van állítva, a parancsok a sorban várnak, és a hívók időtúllépést kapnak.

import { createServiceClient } from '@/lib/rendszer/adat'
import { inditas, log, restPing, utemez } from '../kozos/host'

inditas({
  rendszer: 'inventory',
  nev: 'Raktárrendszer',
  port: Number(process.env.PORT ?? 4106),
  utvonalak: [],
  ellenorzesek: { adatbazis: () => restPing('RENDSZER_DB_URL') },
})

utemez('sor-feldolgozas', 5_000, async () => {
  const { data, error } = await createServiceClient().schema('inventory').rpc('process_commands')
  if (error) throw new Error(error.message)
  if (data) log(`[inventory] ${data} parancs feldolgozva`)
})
