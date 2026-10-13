// Egységes hiba: minden legacy hibaforma (JSON-RPC kód, „success:false” szöveg, ERR|Exxx, SOAP Fault, HTTP státusz)
// ide képeződik le. Eszköz-eredményként megy vissza (isError: true), sosem kivételként.

import { randomUUID } from 'node:crypto'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { CanonicalError, ErrorCode } from './kanonikus'
import { log } from './kornyezet'

export class McpHiba extends Error {
  constructor(
    public readonly code: ErrorCode,
    /** magyar, a felhasználónak is megjeleníthető üzenet */
    message: string,
    public readonly opts: {
      retryable?: boolean
      suggestedActions?: string[]
      details?: Record<string, unknown>
      upstream?: { system: string; raw: string }
    } = {}
  ) {
    super(message)
  }

  toCanonical(): CanonicalError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.opts.retryable ?? this.code === 'UPSTREAM_UNAVAILABLE',
      suggestedActions: this.opts.suggestedActions ?? [],
      details: this.opts.details ?? {},
      ...(this.opts.upstream ? { upstream: this.opts.upstream } : {}),
    }
  }
}

/**
 * Eszköz-eredmény hibából: egy rövid magyar szöveg, és egy második szöveges blokkban a kanonikus hiba JSON-ként.
 * Szándékosan NEM structuredContent: a kliens SDK azt hibánál is az eszköz outputSchema-jához méri (és elutasítja).
 */
export function hibaEredmeny(hiba: McpHiba): CallToolResult {
  const error = hiba.toCanonical()
  return {
    isError: true,
    content: [
      { type: 'text', text: `Hiba (${error.code}): ${error.message}` },
      { type: 'text', text: JSON.stringify({ error }) },
    ],
  }
}

/** Kliensoldali segéd: a kanonikus hiba kiolvasása egy isError eredményből (null, ha nem a mi formátumunk). */
export function hibaKiolvasas(result: object): CanonicalError | null {
  for (const c of ((result as { content?: { type: string; text?: string }[] }).content ?? [])) {
    if (c.type !== 'text' || !c.text?.startsWith('{"error"')) continue
    try {
      return (JSON.parse(c.text) as { error: CanonicalError }).error
    } catch {}
  }
  return null
}

/**
 * Váratlan (nem leképezett) hiba általános magyar üzenettel. A kivétel szövege (benne lehet belső részlet,
 * pl. adatbázis-hiba) csak a szerver naplójába kerül; a kliens egy hivatkozási azonosítót kap.
 */
export function vartlanHiba(e: unknown, system: string): McpHiba {
  const errorId = randomUUID()
  log('varatlan hiba', errorId, system, e instanceof Error ? (e.stack ?? e.message) : e)
  return new McpHiba('UPSTREAM_UNAVAILABLE', 'A háttérrendszer átmenetileg nem érhető el, próbáld újra később.', {
    retryable: true,
    details: { errorId },
  })
}
