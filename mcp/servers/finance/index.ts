// A `finance` domain MCP szerver (14. fázis): díjbekérők, számlák, lejárt tartozások és fizetési linkek – a számlázó
// szöveges protokollja és a fizetési REST interfész fölött. A végleges számlát a fizetés után a SzámlaBridge állítja
// ki a Számlázz.hu TESZTfiókban; itt csak lekérdezhető. Kézi „fizetve” rögzítés és sztornó szándékosan nincs.
// Futtatás: npm run mcp:finance (http://127.0.0.1:3204/mcp) vagy npx tsx mcp/servers/finance/index.ts --stdio

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { eszkoz } from '../../kozos/eszkoz'
import { idempotencyKeyField, Money, money } from '../../kozos/kanonikus'
import { inditas } from '../../kozos/indito'
import { vevokAdoszamSzerint } from '../../kozos/torzsadat'
import { fizetes, szamlazo, SzamlazoHiba, type LegacyFizetes } from './adapter'
import {
  bizonylat,
  datum,
  Document,
  documentNoField,
  DocumentSummary,
  fizetesHiba,
  fizetesKi,
  osszeg,
  Payment,
  szamlazoHiba,
  tipus,
  type Document as DocumentT,
} from './lekepezes'

const SZERVER = 'finance'
const OLVASOK = ['viewer', 'sales', 'logistics', 'finance', 'sales_manager'] as const

async function protokoll(documentNo: string | undefined, ...mezok: string[]) {
  try {
    return await szamlazo(...mezok)
  } catch (e) {
    throw szamlazoHiba(e, documentNo)
  }
}

/** Vevőkód (VEVO-1001) → kanonikus vevő: a számlázó adószáma alapján a CRM-ből; ha ott nincs, a számlázó neve. */
async function vevokKodSzerint(kodok: string[]) {
  const egyedi = [...new Set(kodok)]
  const adatok = new Map<string, { nev: string; adoszam: string }>()
  for (const kod of egyedi) {
    const [, nev, adoszam] = await protokoll(undefined, 'PARTNER', 'ADAT', kod) // <kod>|<NEV>|<adoszam>|<CIM>
    adatok.set(kod, { nev, adoszam })
  }
  const crm = await vevokAdoszamSzerint([...adatok.values()].map((a) => a.adoszam))
  return new Map(
    [...adatok].map(([kod, a]) => {
      const v = crm.get(a.adoszam)
      return [kod, { customerId: v?.id ?? null, name: v?.name ?? a.nev, taxNumber: a.adoszam || null }] as const
    })
  )
}

async function betolt(documentNo: string): Promise<DocumentT> {
  const leker = await protokoll(documentNo, 'SZAMLA', 'LEKER', documentNo)
  const vevo = (await vevokKodSzerint([leker[1]])).get(leker[1])!
  let kulso: string[] | null = null
  if (documentNo.startsWith('DB-')) {
    // A külső (Számlázz.hu) számla állapota; ha a lekérdezés nem sikerül, a bizonylat attól még megjeleníthető.
    kulso = await szamlazo('SZAMLA', 'KULSO', documentNo).catch((e) => {
      if (e instanceof SzamlazoHiba) return null
      throw e
    })
  }
  return bizonylat(leker, vevo, kulso)
}

const bizonylatSzoveg = (d: DocumentT) =>
  `${d.documentTypeLabel} ${d.documentNo} – ${d.statusLabel}. Vevő: ${d.customer.name}, bruttó ${d.total.amount} Ft, határidő: ${d.dueDate}.` +
  (d.finalInvoice ? ` Végleges számla: ${d.finalInvoice.statusLabel}.` : '') +
  (d.nextAction ? ` Következő lépés: ${d.nextAction.label}` : '')

function letrehoz(): McpServer {
  const server = new McpServer(
    { name: 'donki-finance', title: 'Pénzügy', version: '0.14.0' },
    {
      instructions:
        'Finance for the Donki ERP: proformas (DB-...), invoices (SZ-...), overdue debts and card payment links. Orders get a proforma; only proformas can be paid online, ' +
        'and after payment the final invoice is issued automatically in the Szamlazz.hu TEST account. Amounts are gross. Payments run in Stripe TEST mode. Reply to the user in Hungarian.',
    }
  )

  eszkoz(server, SZERVER, {
    name: 'get_document',
    title: 'Bizonylat lekérdezése',
    description: 'Get a proforma or invoice: customer, gross total, due date, paid/overdue, and for proformas the state of the final Szamlazz.hu invoice.',
    input: { documentNo: documentNoField },
    output: { document: Document },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: OLVASOK,
    summary: (o) => bizonylatSzoveg(o.document),
    run: async ({ documentNo }) => ({ document: await betolt(documentNo) }),
  })

  eszkoz(server, SZERVER, {
    name: 'list_overdue_documents',
    title: 'Lejárt tartozások',
    description: 'List unpaid documents past their due date, oldest first, with the total overdue amount.',
    input: { limit: z.number().int().min(1).max(50).optional().describe('Default 20, max 50') },
    output: { items: z.array(DocumentSummary), totalCount: z.number(), totalOverdue: Money.describe('Gross sum of all overdue documents') },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: ['finance', 'sales_manager'],
    summary: (o) =>
      o.totalCount
        ? `${o.totalCount} lejárt tétel, összesen ${o.totalOverdue.amount} Ft: ` + o.items.map((d) => `${d.documentNo} ${d.customer.name} ${d.total.amount} Ft (határidő ${d.dueDate})`).join('; ')
        : 'Nincs lejárt tartozás.',
    run: async ({ limit = 20 }) => {
      const [, ...tetelek] = await protokoll(undefined, 'SZAMLA', 'LEJART') // <db>|<szam>;<vevo>;<brutto>;<hatarido>|…
      const sorok = tetelek.filter(Boolean).map((t) => t.split(';'))
      const vevok = await vevokKodSzerint(sorok.slice(0, limit).map((s) => s[1]))
      return {
        items: sorok.slice(0, limit).map(([szam, vevo, brutto, hatarido]) => ({
          documentNo: szam,
          documentType: tipus(szam, osszeg(brutto)),
          customer: vevok.get(vevo)!,
          total: osszeg(brutto),
          dueDate: datum(hatarido),
        })),
        totalCount: sorok.length,
        totalOverdue: money(sorok.reduce((s, r) => s + Number(r[2].replace(',', '.')), 0)),
      }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'get_document_pdf',
    title: 'Bizonylat PDF',
    description: 'Get a temporary (1 hour) download link for the PDF of a document. For a paid proforma it is the final Szamlazz.hu invoice once issued.',
    input: { documentNo: documentNoField },
    output: { documentNo: z.string(), url: z.string(), expiresAt: z.string(), source: z.enum(['own', 'szamlazz_hu']) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: OLVASOK,
    summary: (o) => `${o.documentNo} PDF (${o.source === 'szamlazz_hu' ? 'Számlázz.hu számla' : 'saját bizonylat'}), a link ${o.expiresAt.slice(11, 16)}-ig érvényes: ${o.url}`,
    run: async ({ documentNo }) => {
      const [url] = await protokoll(documentNo, 'SZAMLA', 'PDF', documentNo)
      return { documentNo, url, expiresAt: new Date(Date.now() + 3600_000).toISOString(), source: url.includes('-szamlazz.pdf') ? ('szamlazz_hu' as const) : ('own' as const) }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'create_payment_link',
    title: 'Fizetési link készítése',
    description: 'Create a card payment link (Stripe TEST mode checkout) for an unpaid proforma; the amount comes from the billing system. Send the link to the customer.',
    input: { documentNo: documentNoField, idempotencyKey: idempotencyKeyField },
    output: { payment: Payment },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    risk: 'financial',
    roles: ['finance'],
    summary: (o) => `Fizetési link elkészült a(z) ${o.payment.documentNo} díjbekérőhöz (${o.payment.amount.amount} Ft, teszt üzem): ${o.payment.checkoutUrl}`,
    run: async ({ documentNo }) => {
      try {
        return { payment: fizetesKi(await fizetes<LegacyFizetes>('POST', '', { invoiceRef: documentNo })) }
      } catch (e) {
        throw fizetesHiba(e, documentNo)
      }
    },
  })

  eszkoz(server, SZERVER, {
    name: 'get_payments',
    title: 'Fizetések lekérdezése',
    description: 'List card payment attempts for a proforma, with status (pending, succeeded, failed, expired).',
    input: { documentNo: documentNoField },
    output: { items: z.array(Payment) },
    annotations: { readOnlyHint: true, openWorldHint: false },
    risk: 'read',
    roles: OLVASOK,
    summary: (o) => (o.items.length ? o.items.map((p) => `${p.createdAt.slice(0, 16).replace('T', ' ')}: ${p.amount.amount} Ft – ${p.statusLabel}`).join('; ') : 'Ehhez a bizonylathoz még nem készült fizetési link.'),
    run: async ({ documentNo }) => {
      try {
        const v = await fizetes<{ data: LegacyFizetes[] }>('GET', `?invoiceRef=${encodeURIComponent(documentNo)}`)
        return { items: v.data.map(fizetesKi) }
      } catch (e) {
        throw fizetesHiba(e, documentNo)
      }
    },
  })

  server.registerPrompt(
    'overdue_review',
    { title: 'Lejárt számlák áttekintése', description: 'Review overdue debts and propose follow-up per customer.' },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              'Review overdue debts: call list_overdue_documents, group them by customer, and in Hungarian give the total per customer, the oldest due date, ' +
              'and a suggested follow-up (reminder e-mail for < 30 days, phone call for older). Do not create payment links unless asked.',
          },
        },
      ],
    })
  )

  return server
}

inditas({ nev: SZERVER, port: 3204, letrehoz }).catch((e) => {
  console.error('[mcp] finance: az inditas sikertelen:', e instanceof Error ? e.message : e)
  process.exit(1)
})
