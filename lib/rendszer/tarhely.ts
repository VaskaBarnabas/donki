// A számlázó saját fájltárhelye (a Supabase Storage helyett): egy kötet a konténerben (TARHELY_DIR), és
// időkorlátos, HMAC-cal aláírt letöltési link, amelyet a számlázó maga szolgál ki:
//   <TARHELY_PUBLIC_URL>/api/legacy/billing/pdf/<útvonal>?exp=<epoch>&sig=<hmac>
// Az API a Supabase Storage-éval megegyező alakú (upload / createSignedUrl / download), így a hívó kód nem változik.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type Hiba = { message: string } | null

export type Tarhely = {
  from(bucket: string): {
    upload(ut: string, tartalom: Uint8Array, opts?: { contentType?: string; upsert?: boolean }): Promise<{ error: Hiba }>
    createSignedUrl(ut: string, mp: number): Promise<{ data: { signedUrl: string } | null; error: Hiba }>
    download(ut: string): Promise<{ data: Blob | null; error: Hiba }>
  }
}

const gyoker = () => process.env.TARHELY_DIR ?? '/data/tarhely'

/** A bucket alatti útvonal biztonságos feloldása (nincs ../ kiszökés). */
export function fajlUtvonal(bucket: string, ut: string): string {
  const alap = path.resolve(gyoker(), bucket)
  const teljes = path.resolve(alap, ut)
  if (!teljes.startsWith(alap + path.sep)) throw new Error('Ervenytelen utvonal')
  return teljes
}

export function linkAlairas(bucket: string, ut: string, exp: number): string {
  const titok = process.env.TARHELY_LINK_SECRET
  if (!titok) throw new Error('Hianyzo kornyezeti valtozo: TARHELY_LINK_SECRET')
  return createHmac('sha256', titok).update(`${bucket}/${ut}:${exp}`).digest('base64url')
}

export function linkEllenorzes(bucket: string, ut: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false
  const vart = Buffer.from(linkAlairas(bucket, ut, exp))
  const kapott = Buffer.from(sig)
  return vart.length === kapott.length && timingSafeEqual(vart, kapott)
}

export function helyiTarhely(): Tarhely {
  return {
    from(bucket) {
      return {
        async upload(ut, tartalom, opts) {
          try {
            const f = fajlUtvonal(bucket, ut)
            await mkdir(path.dirname(f), { recursive: true })
            await writeFile(f, tartalom, { flag: opts?.upsert ? 'w' : 'wx' })
            return { error: null }
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code
            return { error: { message: code === 'EEXIST' ? 'The resource already exists' : String((e as Error).message) } }
          }
        },
        async createSignedUrl(ut, mp) {
          try {
            const exp = Math.floor(Date.now() / 1000) + mp
            const alap = process.env.TARHELY_PUBLIC_URL
            if (!alap) throw new Error('Hianyzo kornyezeti valtozo: TARHELY_PUBLIC_URL')
            const sig = linkAlairas(bucket, ut, exp)
            return { data: { signedUrl: `${alap}/api/legacy/billing/pdf/${ut}?exp=${exp}&sig=${sig}` }, error: null }
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } }
          }
        },
        async download(ut) {
          try {
            return { data: new Blob([new Uint8Array(await readFile(fajlUtvonal(bucket, ut)))]), error: null }
          } catch (e) {
            return { data: null, error: { message: (e as Error).message } }
          }
        },
      }
    },
  }
}
