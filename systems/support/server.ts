// Helpdesk rendszer (független konténer): SOAP 1.1 + statikus WSDL. A garanciához a rendeléskezelő homlokzatát,
// a termékhez a CRM/katalógust, az RMA-hoz a raktár üzenetsorát használja.

import { inditas, restPing } from '../kozos/host'
import { GET as wsdl, POST as soap } from './routes/soap'

inditas({
  rendszer: 'support',
  nev: 'Helpdesk',
  port: Number(process.env.PORT ?? 4105),
  utvonalak: [
    { method: 'GET', minta: '/api/legacy/support/soap', handler: wsdl },
    { method: 'POST', minta: '/api/legacy/support/soap', handler: soap },
  ],
  ellenorzesek: { adatbazis: () => restPing('RENDSZER_DB_URL'), crm: () => restPing('CRM_API_URL'), raktar: () => restPing('INVENTORY_API_URL') },
})
