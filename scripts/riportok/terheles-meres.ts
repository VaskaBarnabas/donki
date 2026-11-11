/**
 * 20. fázis, 2. kör, Ö4 terhelés: hány felhasználót bír egy gép? 1, 2 és 4 egyszerre futó kérés a helyi Ollamán,
 * olvasó feladatokkal (F04, F09, F15a, F28), modellenként szintenként 12 futás. Mért: futásonkénti idő (a kérés
 * elküldésétől a válaszig, az előkészítés nélkül), áteresztőképesség, siker.
 * Előfeltétel: npm run stack:up, Ollama; a portál és a figyelő ne fusson.
 * Futtatás: caffeinate -dims AGENS_FIGYELO=ki npx tsx scripts/riportok/terheles-meres.ts
 * Kimenet: riportok/05-osszehasonlitasok/adatok/terheles.json
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { Agens } from '../../agens/futtato'
import { ollamaModell } from '../../agens/kozos/modell'
import { dbZar } from '../../agens/kozos/naplo'
import { FELADATOK, type Kornyezet } from '../ertekeles/feladatok'
import { futas } from '../ertekeles/futtat'
import { Keszlet, Kozos, Mcp } from '../ertekeles/kozos'

const MODELLEK = ['donki-gemma-e4b', 'donki-gemma']
const SZINTEK = [1, 2, 4]
const FUTAS_SZINTENKENT = 12
const FEL = ['F04', 'F09', 'F15a', 'F28']

type Meres = { modell: string; szint: number; feladat: string; ido_ms: number; eredmeny: string; kezdet: number; vege: number }

async function main() {
  const m = await Mcp.nyit()
  const k: Kornyezet = { m, keszlet: new Keszlet(m), kozos: new Kozos() }
  await k.keszlet.feltolt(MODELLEK.length * SZINTEK.length * (FUTAS_SZINTENKENT / FEL.length))
  const ki: Meres[] = []
  const osszesito: { modell: string; szint: number; falido_ms: number }[] = []
  let parhuzamos = ''
  try {
    parhuzamos = execFileSync('launchctl', ['getenv', 'OLLAMA_NUM_PARALLEL'], { encoding: 'utf8' }).trim()
  } catch {
    parhuzamos = ''
  }
  for (const modell of MODELLEK) {
    for (const szint of SZINTEK) {
      const agensek = await Promise.all(Array.from({ length: szint }, () => Agens.nyit({ modell: ollamaModell(modell) })))
      const sor = Array.from({ length: FUTAS_SZINTENKENT }, (_, i) => FEL[i % FEL.length])
      // bemelegítés: a modell betöltése ne számítson bele
      await agensek[0].kerdez({ szerep: 'viewer', keres: 'Szia!' }).catch(() => null)
      const kezdet = Date.now()
      await Promise.all(
        agensek.map(async (agens) => {
          for (let fid = sor.shift(); fid; fid = sor.shift()) {
            const f = FELADATOK.find((x) => x.id === fid)!
            const eset = await f.elokeszit(k)
            const t0 = Date.now()
            let eredmeny = 'hiba'
            try {
              const { v } = await futas(agens, 'mcp', eset)
              eredmeny = v.allapot === 'hiba' ? 'hiba' : (await eset.ellenoriz(v.valasz ?? '')).eredmeny
            } catch (e) {
              console.error(e instanceof Error ? e.message : e)
            } finally {
              await eset.takarit?.().catch(() => null)
            }
            const r = { modell, szint, feladat: fid, ido_ms: Date.now() - t0, eredmeny, kezdet: t0 - kezdet, vege: Date.now() - kezdet }
            ki.push(r)
            console.log(`${modell} ×${szint} ${fid}: ${eredmeny} ${(r.ido_ms / 1000).toFixed(1)} s`)
          }
        })
      )
      osszesito.push({ modell, szint, falido_ms: Date.now() - kezdet })
      for (const a of agensek) await a.zar() // egymás után: a zárás a közös naplókapcsolatot is lezárja
    }
  }
  mkdirSync('riportok/05-osszehasonlitasok/adatok', { recursive: true })
  writeFileSync('riportok/05-osszehasonlitasok/adatok/terheles.json', JSON.stringify({ datum: new Date().toISOString(), ollamaNumParallel: parhuzamos || 'alapértelmezett', osszesito, futasok: ki }, null, 1))
  await m.zar()
  await dbZar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
