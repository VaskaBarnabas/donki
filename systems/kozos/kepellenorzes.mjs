// Build-ellenőrzés: egy rendszer képébe nem kerülhet más rendszer kódja (legacy/<más>/ vagy systems/<más>/).
import { readFileSync } from 'node:fs'

const [rendszer, metaFajl] = process.argv.slice(2)
// a rendszer → a legacy modul neve (a CRM-nek és a raktárnak nincs Node kódja a legacy/ alatt)
const SAJAT = { billing: 'billing', orders: 'orders', payments: 'payments', quote: 'quote', support: 'support', inventory: null, crm: null }
const bemenetek = Object.keys(JSON.parse(readFileSync(metaFajl, 'utf8')).inputs)
const idegen = bemenetek.filter((b) => {
  const l = /^legacy\/([a-z]+)\//.exec(b)
  const s = /^systems\/([a-z]+)\//.exec(b)
  return (l && l[1] !== SAJAT[rendszer]) || (s && s[1] !== rendszer && s[1] !== 'kozos')
})
if (idegen.length) {
  console.error(`HIBA: a(z) ${rendszer} kepebe idegen rendszer kodja kerulne:\n  ${idegen.join('\n  ')}`)
  process.exit(1)
}
console.log(`kepellenorzes: ${rendszer} – ${bemenetek.filter((b) => !b.startsWith('node_modules')).length} sajat forrasfajl, idegen kod nincs`)
