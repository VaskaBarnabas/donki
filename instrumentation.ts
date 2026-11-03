// A portál szerverének indulásakor egyszer fut (Next.js instrumentation). 18. fázis: a háttérfigyelő (eseményvezérelt
// kivételkezelő) innen indul, így továbbra is egyetlen `npm run dev` indít mindent. Csak a Node.js futtatókörnyezetben;
// kikapcsolás: AGENS_FIGYELO=ki (pl. a tesztek alatt) vagy a Rendszerek oldal kapcsolója.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { figyeloIndit } = await import('./agens/figyelo/figyelo')
    figyeloIndit()
  }
}
