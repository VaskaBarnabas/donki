// Ajánlatkezelő rendszer (független konténer): JSON-RPC 2.0. A vevőt és az árat a CRM rendszer PostgREST-jén,
// a rendelést a rendeléskezelő homlokzatán éri el.

import { inditas, restPing } from '../kozos/host'
import { POST as rpc } from './routes/rpc'

inditas({
  rendszer: 'quote',
  nev: 'Ajánlatkezelő',
  port: Number(process.env.PORT ?? 4101),
  utvonalak: [{ method: 'POST', minta: '/api/legacy/quote-rpc', handler: rpc }],
  ellenorzesek: {
    adatbazis: () => restPing('RENDSZER_DB_URL'),
    crm: () => restPing('CRM_API_URL'),
  },
})
