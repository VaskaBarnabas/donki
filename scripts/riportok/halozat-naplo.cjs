// 20. fázis, adatkimenet-mérés: Node-előtöltő – minden kimenő TCP-kapcsolat célját naplózza (cím:port, folyamat).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a Node --require előtöltője CommonJS
const net = require('node:net')
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a Node --require előtöltője CommonJS
const fs = require('node:fs')
const NAPLO = process.env.HALOZAT_NAPLO
const eredeti = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  try {
    const o = Array.isArray(args[0]) ? args[0][0] : args[0]
    const host = typeof o === 'object' ? (o.host ?? (o.path ? 'unix' : 'localhost')) : typeof args[1] === 'string' ? args[1] : 'localhost'
    const port = typeof o === 'object' ? o.port : o
    if (NAPLO) fs.appendFileSync(NAPLO, `${Date.now()} ${process.pid} ${host}:${port}\n`)
  } catch {}
  return eredeti.apply(this, args)
}
