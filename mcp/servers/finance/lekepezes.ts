// Legacy → kanonikus leképezés a finance szerverhez: a számlázó szöveges formátumai (38100,00, YYYY.MM.DD,
// VEVO-kód, I/N jelzők) és a fizetési REST (fillér, állapotok), valamint mindkettő hibái.

import { z } from 'zod'
import { McpHiba } from '../../kozos/hiba'
import { Money, money, NextAction } from '../../kozos/kanonikus'
import { FIZETES, FizetesHiba, SZAMLAZO, SzamlazoHiba, type LegacyFizetes } from './adapter'

export const documentNoField = z
  .string()
  .regex(/^(SZ|DB)-\d{4}-\d{6}$/, { error: 'A bizonylatszám formátuma SZ-2026-000187 vagy DB-2026-000031.' })
  .describe('Document number: invoice "SZ-2026-000187" or proforma "DB-2026-000031"')

/** "38100,00" → Money; "2026.10.18" → "2026-10-18" */
export const osszeg = (s: string) => money(Number(s.replace(',', '.')))
export const datum = (s: string) => s.replace(/\./g, '-')

// ---------------------------------------------------------------- bizonylat

export const DOCUMENT_STATUSES = ['unpaid', 'overdue', 'paid', 'not_payable'] as const
const STATUSZ_FELIRAT: Record<(typeof DOCUMENT_STATUSES)[number], string> = {
  unpaid: 'Fizetésre vár',
  overdue: 'Lejárt, nincs kifizetve',
  paid: 'Kifizetve',
  not_payable: 'Sztornó bizonylat (nem fizetendő)',
}

export const FinalInvoice = z.object({
  status: z.enum(['none', 'pending', 'issued']),
  statusLabel: z.string(),
  pdfAvailable: z.boolean(),
})

export const DocumentCustomer = z.object({
  customerId: z.string().nullable().describe('CRM customer id; null if the billing customer is not in the CRM'),
  name: z.string(),
  taxNumber: z.string().nullable(),
})

export const Document = z.object({
  documentNo: z.string(),
  documentType: z.enum(['proforma', 'invoice', 'credit_note']),
  documentTypeLabel: z.string(),
  customer: DocumentCustomer,
  total: Money.describe('Gross total (VAT 27% included)'),
  dueDate: z.string(),
  paid: z.boolean(),
  overdue: z.boolean(),
  status: z.enum(DOCUMENT_STATUSES),
  statusLabel: z.string(),
  finalInvoice: FinalInvoice.nullable().describe('Proforma only: the final invoice issued in Szamlazz.hu (test account) after payment'),
  nextAction: NextAction.nullable(),
})
export type Document = z.infer<typeof Document>

export const DocumentSummary = z.object({
  documentNo: z.string(),
  documentType: z.enum(['proforma', 'invoice', 'credit_note']),
  customer: DocumentCustomer,
  total: Money,
  dueDate: z.string(),
})

export function tipus(documentNo: string, brutto: Money): Document['documentType'] {
  if (documentNo.startsWith('DB-')) return 'proforma'
  return Number(brutto.amount) < 0 ? 'credit_note' : 'invoice'
}
const TIPUS_FELIRAT = { proforma: 'Díjbekérő', invoice: 'Számla', credit_note: 'Sztornó számla' }

/** SZAMLA|KULSO mezői: <szam>|<ref vagy ->|<allapot>|PDF|<I/N> */
export function vegszamla(kulso: string[] | null): z.infer<typeof FinalInvoice> | null {
  if (!kulso) return null
  const [, ref, allapot, , pdf] = kulso
  if (!ref || ref === '-') return { status: 'none', statusLabel: 'Még nincs (a fizetés után készül el)', pdfAvailable: false }
  if (pdf === 'I') return { status: 'issued', statusLabel: 'Kiállítva a Számlázz.hu-ban', pdfAvailable: true }
  return { status: 'pending', statusLabel: `Kiállítás folyamatban (Számlázz.hu)${allapot && allapot !== 'FUGGOBEN' ? `: ${allapot}` : ''}`, pdfAvailable: false }
}

/** SZAMLA|LEKER mezői: <szam>|<vevo>|<brutto>|<hatarido>|FIZETVE|<I/N>|LEJART|<I/N> */
export function bizonylat(leker: string[], customer: z.infer<typeof DocumentCustomer>, kulso: string[] | null): Document {
  const [szam, , brutto, hatarido, , fizetve, , lejart] = leker
  const total = osszeg(brutto)
  const documentType = tipus(szam, total)
  const paid = fizetve === 'I'
  const overdue = lejart === 'I'
  const status = documentType === 'credit_note' ? 'not_payable' : paid ? 'paid' : overdue ? 'overdue' : 'unpaid'
  const finalInvoice = documentType === 'proforma' ? vegszamla(kulso) : null

  let nextAction: NextAction | null = null
  if (documentType === 'proforma' && !paid) {
    nextAction = { code: 'create_payment_link', label: 'Fizetési linket kell küldeni a vevőnek (bankkártyás fizetés).', actor: 'finance', tool: 'create_payment_link' }
  } else if (documentType === 'proforma' && finalInvoice?.status === 'pending') {
    nextAction = { code: 'wait_for_final_invoice', label: 'A Számlázz.hu számla néhány percen belül elkészül.', actor: 'system', tool: 'get_document' }
  } else if (documentType === 'proforma' && finalInvoice?.status === 'issued') {
    nextAction = { code: 'send_invoice', label: 'A végleges számla elkészült, a PDF elküldhető a vevőnek.', actor: 'finance', tool: 'get_document_pdf' }
  } else if (documentType === 'invoice' && !paid) {
    nextAction = { code: 'collect_payment', label: 'A vevőnek átutalással kell fizetnie (online csak díjbekérő fizethető).', actor: 'customer' }
  }

  return {
    documentNo: szam,
    documentType,
    documentTypeLabel: TIPUS_FELIRAT[documentType],
    customer,
    total,
    dueDate: datum(hatarido),
    paid,
    overdue,
    status,
    statusLabel: STATUSZ_FELIRAT[status],
    finalInvoice,
    nextAction,
  }
}

// ---------------------------------------------------------------- fizetés

const FIZETES_ALLAPOT = {
  CREATED: { status: 'pending', label: 'Fizetésre vár (link elküldhető)' },
  SUCCEEDED: { status: 'succeeded', label: 'Sikeres fizetés' },
  FAILED: { status: 'failed', label: 'Sikertelen próbálkozás (a vevő újrapróbálhatja)' },
  EXPIRED: { status: 'expired', label: 'A link lejárt' },
} as const

export const Payment = z.object({
  paymentId: z.string(),
  documentNo: z.string(),
  status: z.enum(['pending', 'succeeded', 'failed', 'expired']),
  statusLabel: z.string(),
  amount: Money,
  checkoutUrl: z.string().nullable().describe('Stripe TEST mode checkout page to send to the customer'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export function fizetesKi(f: LegacyFizetes): z.infer<typeof Payment> {
  const a = FIZETES_ALLAPOT[f.status] ?? FIZETES_ALLAPOT.CREATED
  return {
    paymentId: f.id,
    documentNo: f.invoiceRef,
    status: a.status,
    statusLabel: a.label,
    amount: money(f.amountMinor / 100),
    checkoutUrl: f.status === 'CREATED' || f.status === 'FAILED' ? f.url : null,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }
}

// ---------------------------------------------------------------- hibák

export function szamlazoHiba(e: unknown, documentNo?: string): unknown {
  if (!(e instanceof SzamlazoHiba)) return e
  const upstream = { system: SZAMLAZO, raw: e.message }
  switch (e.kod) {
    case 'E107':
      return new McpHiba('NOT_FOUND', 'A vevő nem található a számlázó rendszerben.', { upstream })
    case 'E108':
      return new McpHiba('NOT_FOUND', `A(z) ${documentNo ?? ''} bizonylat nem található.`.replace('A(z)  ', 'A '), { details: { documentNo }, suggestedActions: ['list_overdue_documents'], upstream })
    case 'E101':
    case 'E120':
      return new McpHiba('VALIDATION', 'A kérés adatai a számlázó szerint hibásak.', { upstream })
    case 'E200':
      if (/KULSO SZAMLA MEG NEM ERHETO EL/.test(e.szoveg)) {
        return new McpHiba('UPSTREAM_UNAVAILABLE', 'A Számlázz.hu számla még nem érhető el, néhány perc múlva próbáld újra.', { retryable: true, details: { documentNo }, upstream })
      }
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A számlázó szolgáltatás átmenetileg nem érhető el, próbáld újra később.', { retryable: true, upstream })
    case 'E001':
    case 'E100':
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A számlázó rendszer elutasította a kérést (konfigurációs hiba). Szólj a rendszergazdának.', { retryable: false, upstream })
    default:
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A számlázó rendszer hibát jelzett, próbáld újra később.', { retryable: true, upstream })
  }
}

export function fizetesHiba(e: unknown, documentNo?: string): unknown {
  if (!(e instanceof FizetesHiba)) return e
  const upstream = { system: FIZETES, raw: e.message.slice(0, 300) }
  switch (e.tipus) {
    case 'not_found':
      return new McpHiba('NOT_FOUND', `A(z) ${documentNo} bizonylat nem található.`, { details: { documentNo }, upstream })
    case 'invoice_already_paid':
      return new McpHiba('INVALID_STATE', `A(z) ${documentNo} bizonylat már ki van fizetve.`, { details: { documentNo, paid: true }, suggestedActions: ['get_document'], upstream })
    case 'invalid_invoice_type':
      return new McpHiba('VALIDATION', 'Online csak díjbekérő (DB-…) fizethető; a már kiállított számlát átutalással kell rendezni.', { details: { documentNo }, suggestedActions: ['get_document'], upstream })
    case 'invalid_amount':
      return new McpHiba('VALIDATION', 'Az összeg kisebb a kártyás fizetés minimumánál (175 Ft).', { details: { minimum: '175.00' }, upstream })
    case 'invalid_request_error':
      return new McpHiba('VALIDATION', 'A fizetési kérés adatai hibásak.', { upstream })
    case 'live_mode_disabled':
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A fizetési rendszer csak teszt üzemmódban engedélyezett.', { retryable: false, upstream })
    case 'authentication_error':
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A fizetési rendszer elutasította a kapcsolatot (konfigurációs hiba). Szólj a rendszergazdának.', { retryable: false, upstream })
    default:
      return new McpHiba('UPSTREAM_UNAVAILABLE', 'A fizetési rendszer hibát jelzett, próbáld újra később.', { retryable: true, upstream })
  }
}
