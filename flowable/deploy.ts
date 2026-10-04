/**
 * BPMN folyamatok telepítése a Flowable REST API-n keresztül.
 *
 *   npm run flowable:deploy                      → flowable/processes/*.bpmn20.xml
 *   npm run flowable:deploy -- <fájl> [<fájl>…]  → csak a megadott fájlok
 *
 * A Flowable minden telepítéskor új definíció-verziót hoz létre; az új folyamatpéldányok
 * a legfrissebbel indulnak, a futók a sajátjukon maradnak.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { telepit } from '../lib/flowable/client'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

async function main() {
  const argumentumok = process.argv.slice(2)
  const mappa = join('flowable', 'processes')
  const fajlok =
    argumentumok.length > 0
      ? argumentumok
      : existsSync(mappa)
        ? readdirSync(mappa).filter((f) => f.endsWith('.bpmn20.xml')).map((f) => join(mappa, f))
        : []

  if (fajlok.length === 0) {
    console.log(`Nincs telepítendő BPMN (${mappa}/*.bpmn20.xml).`)
    return
  }

  for (const fajl of fajlok) {
    const d = await telepit(basename(fajl), readFileSync(fajl, 'utf8'))
    console.log(`Telepítve: ${fajl} → deployment ${d.id} (${d.deploymentTime})`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
