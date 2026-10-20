// HS256 JWT a PostgREST felé (role: service_role). Minden rendszernek saját titka van; a token egy órára szól,
// és lejárat előtt újra elkészül.

import { createHmac } from 'node:crypto'

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

const gyorsitotar = new Map<string, { token: string; lejar: number }>()

export function jwtAlair(payload: Record<string, unknown>, titok: string): string {
  const fej = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const torzs = b64url(JSON.stringify(payload))
  const alairas = createHmac('sha256', titok).update(`${fej}.${torzs}`).digest('base64url')
  return `${fej}.${torzs}.${alairas}`
}

export function szolgaltatasJwt(titok: string, role = 'service_role'): string {
  const kulcs = `${role}:${titok}`
  const most = Math.floor(Date.now() / 1000)
  const meglevo = gyorsitotar.get(kulcs)
  if (meglevo && meglevo.lejar - 60 > most) return meglevo.token
  const token = jwtAlair({ role, iat: most, exp: most + 3600 }, titok)
  gyorsitotar.set(kulcs, { token, lejar: most + 3600 })
  return token
}
