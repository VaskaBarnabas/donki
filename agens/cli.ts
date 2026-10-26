/**
 * Az ágens parancssora (17. fázis).
 *
 *   npm run agens -- --szerep sales "A Bakony Gépgyártó 12 monitort kér, mennyi lenne?"
 *   npm run agens -- --szerep sales                      (beszélgetős mód; kilépés: üres sor vagy Ctrl+D)
 *   npm run agens -- --folytat <thread_id>               (megállított beszélgetés folytatása, pl. jóváhagyás)
 *
 * Kapcsolók: --szerep viewer|sales|logistics|finance|sales_manager|admin (alap: sales), --modell <ollama modell>
 * (alap: donki-gemma-e4b; a 12b: donki-gemma), --auto-jovahagyas (minden író hívást jóváhagy – csak tesztekhez), --reszletek (lépések kiírása).
 * Az író műveletek előtt a parancssor megkérdezi: [i]gen / [n]em.
 */
import './kozos/kornyezet'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { Agens, type FutasValasz } from './futtato'
import { BEALLITAS, SZEREPKOROK, type Szerep } from './kozos/kornyezet'
import { ollamaModell } from './kozos/modell'
import { db } from './kozos/naplo'

function kapcsolo(nev: string): string | undefined {
  const i = process.argv.indexOf(`--${nev}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const van = (nev: string) => process.argv.includes(`--${nev}`)
const ERTEKES = new Set(['--szerep', '--modell', '--folytat'])
const kerdes = process.argv.slice(2).filter((a, i, t) => !a.startsWith('--') && !ERTEKES.has(t[i - 1] ?? '')).join(' ').trim()

const KOCKAZAT: Record<string, string> = { write: 'írás', financial: 'pénzügyi', irreversible: 'NEM VISSZAVONHATÓ' }

async function main() {
  const szerep = (kapcsolo('szerep') ?? 'sales') as Szerep
  if (!SZEREPKOROK.includes(szerep)) throw new Error(`Ismeretlen szerepkör: ${szerep} (${SZEREPKOROK.join(', ')})`)
  const agens = await Agens.nyit({ modell: ollamaModell(kapcsolo('modell')) })
  const rl = createInterface({ input: stdin, output: stdout })
  // nem interaktív bemenetnél (cső, szkript) a readline a kérdés előtt beérkezett sorokat eldobná: sorba gyűjtjük őket
  const sorok: string[] = []
  const varakozok: ((s: string | null) => void)[] = []
  let vege = false
  if (!stdin.isTTY) {
    rl.on('line', (l) => (varakozok.length ? varakozok.shift()!(l) : sorok.push(l)))
    rl.on('close', () => {
      vege = true
      varakozok.splice(0).forEach((v) => v(null))
    })
  }
  const kerdez = async (szoveg: string): Promise<string | null> => {
    if (stdin.isTTY) return rl.question(szoveg).catch(() => null)
    stdout.write(szoveg)
    const sor = sorok.length ? sorok.shift()! : vege ? null : await new Promise<string | null>((r) => varakozok.push(r))
    stdout.write(`${sor ?? ''}\n`)
    return sor
  }
  let threadId = kapcsolo('folytat')

  /** A jóváhagyásokat a felhasználó dönti el (vagy --auto-jovahagyas), és a gráf onnan folytatódik. */
  async function vegig(v: FutasValasz): Promise<FutasValasz> {
    while (v.allapot === 'jovahagyasra_var') {
      const dontesek: Record<string, boolean> = {}
      for (const j of v.jovahagyas) {
        console.log(`\n⚠  Az ágens ezt szeretné (${KOCKAZAT[j.kockazat] ?? j.kockazat}): ${j.eszkoz} ${JSON.stringify(j.bemenet)}`)
        dontesek[j.id] = van('auto-jovahagyas') ? (console.log('   → automatikusan jóváhagyva'), true) : /^i/i.test(((await kerdez('   Jóváhagyod? [i]gen / [n]em: ')) ?? '').trim())
      }
      v = await agens.dont({ threadId: v.threadId, dontesek })
    }
    return v
  }

  async function kiir(v: FutasValasz) {
    if (v.allapot === 'hiba') console.log(`\n✖ Hiba: ${v.hiba}`)
    else console.log(`\n${v.valasz ?? ''}`)
    if (van('reszletek')) {
      const { rows } = await db().query<{ agens: string; tipus: string; eszkoz: string | null; jovahagyas: string | null; ok: boolean; token_be: number; token_ki: number; ido_ms: number }>(
        'select agens, tipus, eszkoz, jovahagyas, ok, token_be, token_ki, ido_ms from agens.lepes where futas_id = $1 order by id',
        [v.futasId]
      )
      for (const r of rows) console.log(`   · ${r.agens} ${r.tipus}${r.eszkoz ? ` ${r.eszkoz}` : ''}${r.jovahagyas ? ` (${r.jovahagyas})` : ''}${r.ok ? '' : ' ✖'} – ${r.token_be}/${r.token_ki} token, ${r.ido_ms} ms`)
    }
    console.log(`   [${v.agens ?? 'front-desk'} · ${v.allapot} · beszélgetés: ${v.threadId}]`)
  }

  try {
    if (threadId) {
      const h = await agens.helyzet(threadId)
      if (h.jovahagyas.length) {
        await kiir(await vegig({ threadId, futasId: '', allapot: 'jovahagyasra_var', agens: h.jovahagyas[0].agens, valasz: null, jovahagyas: h.jovahagyas }))
        if (!kerdes) return
      }
    }
    if (kerdes) {
      const v = await vegig(await agens.kerdez({ threadId, szerep, keres: kerdes }))
      await kiir(v)
      return
    }
    console.log(`Ágens (${szerep}, modell: ${kapcsolo('modell') ?? BEALLITAS.modell}). Írd be a kérésed; üres sor: kilépés.`)
    for (;;) {
      const sor = ((await kerdez('\n> ')) ?? '').trim()
      if (!sor) break
      const v = await vegig(await agens.kerdez({ threadId, szerep, keres: sor }))
      threadId = v.threadId
      await kiir(v)
    }
  } finally {
    rl.close()
    await agens.zar()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
