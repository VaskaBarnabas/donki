// Az integrációs kulcsok titkosítása (AES-256-GCM). A kulcs (PORTAL_INTEGRACIO_KEY, 32 bájt base64url) csak a portál
// szerverén és a bekötő parancssori eszközben van; a Supabase-ben csak a titkosított érték (iv:tag:adat).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function titkositoKulcs(): Buffer {
  const k = process.env.PORTAL_INTEGRACIO_KEY
  if (!k) throw new Error('Hianyzo PORTAL_INTEGRACIO_KEY (npm run stack:secrets)')
  const b = Buffer.from(k, 'base64url')
  if (b.length !== 32) throw new Error('A PORTAL_INTEGRACIO_KEY 32 bajtos (base64url) kell legyen')
  return b
}

export function titkosit(nyilt: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', titkositoKulcs(), iv)
  const adat = Buffer.concat([c.update(nyilt, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), adat].map((b) => b.toString('base64url')).join(':')
}

export function visszafejt(titkos: string): string {
  const [iv, tag, adat] = titkos.split(':').map((s) => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', titkositoKulcs(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(adat), d.final()]).toString('utf8')
}
