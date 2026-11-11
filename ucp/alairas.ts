// 21. fázis, UCP-átjáró: üzenetaláírás (RFC 9421 HTTP Message Signatures, RFC 9530 Content-Digest), Ed25519 kulccsal.
// A kulcs a UCP_ALAIRO_KULCS környezeti változóban van (PKCS#8 PEM, base64-ben; a stack:secrets generálja); a nyilvános
// része JWK-ként a /.well-known/ucp profilban jelenik meg. Kulcs nélkül fejlesztéshez egy futásidejű kulcs készül.

import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { log } from './beallitas'

let privat: KeyObject
if (process.env.UCP_ALAIRO_KULCS) {
  privat = createPrivateKey(Buffer.from(process.env.UCP_ALAIRO_KULCS, 'base64').toString('utf8'))
} else {
  privat = generateKeyPairSync('ed25519').privateKey
  log('FIGYELEM: nincs UCP_ALAIRO_KULCS – futásidejű kulccsal írunk alá (újraindításkor változik)')
}
const nyilvanos = createPublicKey(privat)
const jwk = nyilvanos.export({ format: 'jwk' }) as { kty: string; crv: string; x: string }
export const KULCS_AZON = `donki-${createHash('sha256').update(jwk.x).digest('hex').slice(0, 12)}`
export const NYILVANOS_JWK = { ...jwk, kid: KULCS_AZON, use: 'sig', alg: 'EdDSA' }

export const tartalomKivonat = (torzs: string) => `sha-256=:${createHash('sha256').update(torzs).digest('base64')}:`

/**
 * Aláírt fejlécek egy kimenő kéréshez (webhook): Content-Digest, Signature-Input, Signature.
 * A lefedett komponensek: @method, @target-uri, content-digest, content-type, és a megadott további fejlécek.
 */
export function alairtFejlecek(metodus: string, url: string, torzs: string, tovabbi: Record<string, string> = {}): Record<string, string> {
  const fejlec: Record<string, string> = { 'content-type': 'application/json', 'content-digest': tartalomKivonat(torzs), ...Object.fromEntries(Object.entries(tovabbi).map(([k, v]) => [k.toLowerCase(), v])) }
  const komponensek = ['@method', '@authority', '@path', '@target-uri', ...Object.keys(fejlec)]
  const letrejott = Math.floor(Date.now() / 1000)
  const parameterek = `(${komponensek.map((k) => `"${k}"`).join(' ')});created=${letrejott};keyid="${KULCS_AZON}";alg="ed25519"`
  const ertek = (k: string) => (k === '@method' ? metodus.toUpperCase() : k === '@authority' ? new URL(url).host : k === '@path' ? new URL(url).pathname : k === '@target-uri' ? url : fejlec[k])
  const alap = [
    ...komponensek.map((k) => `"${k}": ${ertek(k)}`),
    `"@signature-params": ${parameterek}`,
  ].join('\n')
  const alairas = sign(null, Buffer.from(alap), privat).toString('base64')
  return { ...fejlec, 'signature-input': `sig1=${parameterek}`, signature: `sig1=:${alairas}:` }
}
