// Ajánlat árazása. Sorrend tételenként:
//   listaár → ügyfélcsoport-kedvezmény (katalógusból) → tételkedvezmény → mennyiségi kedvezmény
// A kedvezmények egymás után, szorzatként érvényesülnek; a tétel nettó értéke egész forintra kerekít.
// Pontos (BigInt) számolás bázispontokban, hogy ne legyen lebegőpontos kerekítési hiba.

export const JOVAHAGYASI_LIMIT_PCT = 15

export type ArazandoTetel = {
  productCode: string
  qty: number
  listPrice: number // Ft / db, egész
  groupDiscountPct: number
  lineDiscountPct: number
}

export type ArazottTetel = ArazandoTetel & {
  qtyDiscountPct: number
  lineGross: number
  lineNet: number
}

export type ArazasEredmeny = {
  tetelek: ArazottTetel[]
  totalGross: number
  totalNet: number
  totalDiscountPct: number
  approvalRequired: boolean
}

export function mennyisegiKedvezmeny(qty: number): number {
  if (qty > 50) return 5
  if (qty > 10) return 3
  return 0
}

const BP = BigInt(10000) // 100% bázispontban
const KETTO = BigInt(2)

function bp(pct: number): bigint {
  return BigInt(Math.round(pct * 100))
}

// kerekítés fél-felfelé, pozitív számokra
function osztKerekit(szamlalo: bigint, nevezo: bigint): bigint {
  return (szamlalo * KETTO + nevezo) / (nevezo * KETTO)
}

export function arazTetel(t: ArazandoTetel): ArazottTetel {
  const qtyDiscountPct = mennyisegiKedvezmeny(t.qty)
  const brutto = BigInt(t.listPrice) * BigInt(t.qty)
  const szorzo = (BP - bp(t.groupDiscountPct)) * (BP - bp(t.lineDiscountPct)) * (BP - bp(qtyDiscountPct))
  const netto = osztKerekit(brutto * szorzo, BP * BP * BP)
  return { ...t, qtyDiscountPct, lineGross: Number(brutto), lineNet: Number(netto) }
}

export function arazAjanlat(tetelek: ArazandoTetel[]): ArazasEredmeny {
  const arazott = tetelek.map(arazTetel)
  const totalGross = arazott.reduce((s, t) => s + t.lineGross, 0)
  const totalNet = arazott.reduce((s, t) => s + t.lineNet, 0)
  const totalDiscountPct =
    totalGross === 0
      ? 0
      : Number(osztKerekit(BigInt(totalGross - totalNet) * BP, BigInt(totalGross))) / 100
  return {
    tetelek: arazott,
    totalGross,
    totalNet,
    totalDiscountPct,
    approvalRequired: totalDiscountPct > JOVAHAGYASI_LIMIT_PCT,
  }
}
