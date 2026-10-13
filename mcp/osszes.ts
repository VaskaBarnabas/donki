// Mind az öt domain MCP szerver indítása (Streamable HTTP), szerverenként külön folyamatban.
// Ctrl+C mindet leállítja; ha egy szerver leáll, a többi is (hogy ne maradjon félig futó rendszer).
// Futtatás: npm run mcp:all

import { spawn, type ChildProcess } from 'node:child_process'

const SZERVEREK = [
  { nev: 'sales', port: 3202 },
  { nev: 'orders', port: 3201 },
  { nev: 'inventory', port: 3203 },
  { nev: 'finance', port: 3204 },
  { nev: 'support', port: 3205 },
]

const folyamatok: ChildProcess[] = []
let leall = false

function leallitas(kod: number) {
  if (leall) return
  leall = true
  for (const p of folyamatok) p.kill('SIGTERM')
  setTimeout(() => process.exit(kod), 500)
}

for (const s of SZERVEREK) {
  const p = spawn(process.execPath, ['--import', 'tsx', `mcp/servers/${s.nev}/index.ts`], { stdio: ['ignore', 'inherit', 'inherit'] })
  p.on('exit', (kod) => {
    if (!leall) {
      console.error(`[mcp] ${s.nev} leallt (kod: ${kod}) – a tobbi szerver is leall`)
      leallitas(1)
    }
  })
  folyamatok.push(p)
}

process.on('SIGINT', () => leallitas(0))
process.on('SIGTERM', () => leallitas(0))
