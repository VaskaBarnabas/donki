/**
 * 20. fázis: egy bizonyítottan hibás ellenőrző javítása után a meglévő futások újraértékelése a tárolt válaszból –
 * minden mérésre és mindkét változatra, hogy a mérce mindenhol ugyanaz legyen. Csak olyan ellenőrzőre használható,
 * amely a választ egy, a feladatból ismert igazsághoz méri (a rendszer állapotát utólag nem lehet újra lekérdezni).
 *   F18a–d (garancia): az igazság az ellenőrzéskor lekért ok, a megjegyzésben tárolva („valójában: …”) – nem a feladat
 *   felépítése, mert a szállítás-szimuláció miatt az F18d rendelése a mérés közben kiszállítottá válhat; a mondatminta a
 *   feladatok.ts GARANCIA_MINTA-ja.
 *
 * Futtatás: npx tsx scripts/ertekeles/ujraertekel.ts [--valoban]   (alapból csak kiírja, mi változna)
 */
import '../../agens/kozos/kornyezet'
import { db, dbZar } from '../../agens/kozos/naplo'
import { garanciaJo } from './feladatok'

const FELADATOK = ['F18a', 'F18b', 'F18c', 'F18d']
const OK: Record<string, string> = {
  'Érvényes garancia': 'valid',
  'A garancia lejárt': 'expired',
  'A rendelés nem létezik, vagy a termék nem szerepel benne': 'not_in_order',
  'A rendelés még nincs kiszállítva, garancia még nem indult': 'not_delivered',
}
const JELOLES = ' [újraértékelve 2026-11-07: javított garancia-ellenőrző]'

async function main() {
  const valoban = process.argv.includes('--valoban')
  const { rows } = await db().query<{ id: number; meres: string; feladat: string; valtozat: string; modell: string; ismetles: number; eredmeny: string; valasz: string | null; megjegyzes: string | null }>(
    `select id, meres, feladat, valtozat, modell, ismetles, eredmeny, valasz, megjegyzes from ertekeles.futas
      where feladat = any($1) and eredmeny in ('siker', 'sikertelen') and meres not like 'proba-%' order by meres, feladat, valtozat, modell, ismetles`,
    [FELADATOK]
  )
  let valtozott = 0
  for (const r of rows) {
    const ok = OK[/^valójában: (.*?)( \[|$)/.exec(r.megjegyzes ?? '')?.[1] ?? '']
    if (!ok) throw new Error(`ismeretlen igazság: ${r.meres} ${r.feladat} – ${r.megjegyzes}`)
    const uj = garanciaJo(ok, r.valasz ?? '') ? 'siker' : 'sikertelen'
    if (uj === r.eredmeny) continue
    valtozott++
    console.log(`${r.meres} ${r.feladat} ${r.valtozat}/${r.modell} #${r.ismetles}: ${r.eredmeny} → ${uj} – „${(r.valasz ?? '').replace(/\s+/g, ' ').slice(0, 140)}”`)
    if (valoban) await db().query('update ertekeles.futas set eredmeny = $2, megjegyzes = coalesce(megjegyzes, $3) || $4 where id = $1', [r.id, uj, '', JELOLES])
  }
  console.log(`\n${rows.length} futás vizsgálva, ${valtozott} változik${valoban ? ' – mentve' : ' (csak kiírva; mentés: --valoban)'}.`)
  await dbZar()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
