// Statikus leíró tartalom a nyitó- és az admin kezdőoldalhoz.
// Fázis lezárásakor a COMPLETED_PHASE értékét növelni kell.

export const COMPLETED_PHASE = 11;

export type ModuleInfo = {
  name: string;
  description: string;
  protocol: string;
  endpoint: string;
  idExample: string;
  phase: number;
  href: string;
};

export const MODULES: ModuleInfo[] = [
  {
    name: "CRM törzs",
    href: "/crm",
    description: "Partnerek, kapcsolattartók, értékesítési lehetőségek és tevékenységek.",
    protocol: "PostgREST",
    endpoint: "/rest/v1 · Accept-Profile: crm",
    idExample: "UUID",
    phase: 2,
  },
  {
    name: "Termékkatalógus",
    href: "/catalog",
    description: "Termékek, kategóriák és ügyfélcsoport-kedvezmények, árlekérdező függvénnyel.",
    protocol: "PostgREST + RPC",
    endpoint: "/rest/v1/rpc/price_for",
    idExample: "TK-00042",
    phase: 2,
  },
  {
    name: "Raktár",
    href: "/inventory",
    description: "Készlet, foglalások és mozgások. Csak üzenetsoron keresztül szól.",
    protocol: "pgmq üzenetsor",
    endpoint: "inventory_commands → inventory_replies",
    idExample: "4711",
    phase: 3,
  },
  {
    name: "Ajánlatmotor",
    href: "/quotes",
    description: "Ajánlatkészítés, árazás és kedvezmény-jóváhagyás.",
    protocol: "JSON-RPC 2.0",
    endpoint: "POST /api/legacy/quote-rpc",
    idExample: "AJ-2026-0042",
    phase: 4,
  },
  {
    name: "Számlázás",
    href: "/billing",
    description: "Vevők, számlák, díjbekérők, sztornó és szimulált NAV-adatszolgáltatás.",
    protocol: "Egyedi szöveges protokoll",
    endpoint: "POST /api/legacy/billing (text/plain)",
    idExample: "SZ-2026-000187",
    phase: 5,
  },
  {
    name: "Rendelések",
    href: "/orders",
    description: "A rendelés életciklusát BPMN folyamat futtatja, előtte régi stílusú HTTP homlokzat.",
    protocol: "Flowable BPMN + HTTP",
    endpoint: "/api/legacy/orders/…",
    idExample: "RND-100045",
    phase: 7,
  },
  {
    name: "Fizetés",
    href: "/payments",
    description: "Stripe Checkout fizetési linkek és webhook-feldolgozás.",
    protocol: "REST + webhook",
    endpoint: "/api/legacy/payments",
    idExample: "cs_test_…",
    phase: 8,
  },
  {
    name: "Ügyfélszolgálat",
    href: "/support",
    description: "Hibajegyek, garanciaellenőrzés és RMA.",
    protocol: "SOAP 1.1",
    endpoint: "POST /api/legacy/support/soap (+ ?wsdl)",
    idExample: "HJ-000321",
    phase: 9,
  },
];

export const PHASES: { n: number; title: string }[] = [
  { n: 1, title: "Alapok – sémák, sorok, cron jobok, seed" },
  { n: 2, title: "CRM + katalógus" },
  { n: 3, title: "Raktár – worker, DLQ, figyelmeztetések" },
  { n: 4, title: "Ajánlatmotor" },
  { n: 5, title: "Számlázás (mock)" },
  { n: 6, title: "Flowable alapok" },
  { n: 7, title: "Rendelések – BPMN, motor-végpontok, homlokzat" },
  { n: 8, title: "Fizetés" },
  { n: 9, title: "Ügyfélszolgálat SOAP" },
  { n: 10, title: "Admin felület" },
  { n: 11, title: "Legacy dokumentáció + order-to-cash füstteszt" },
  { n: 12, title: "(Opcionális) TCP wrapper a számlázó protokollhoz" },
];

export const ORDER_TO_CASH = [
  "Ajánlat",
  "Jóváhagyás",
  "Rendelés",
  "Készletfoglalás",
  "Szállítás",
  "Számla",
  "Fizetés",
  "Lezárás",
];

export const HETEROGENEITY = [
  {
    title: "Azonosítók",
    examples: ["UUID", "TK-00042", "AJ-2026-0042", "RND-100045", "4711", "VEVO-1023"],
  },
  {
    title: "Dátumok",
    examples: ["ISO 8601", "YYYY-MM-DD", "Unix epoch", "YYYY.MM.DD", "xsd:dateTime"],
  },
  {
    title: "Pénzösszegek",
    examples: ["numeric(14,2)", "egész forint", "fillér", "38100,00"],
  },
  {
    title: "Hibák",
    examples: ["-32010", "ERR|E107|…", '{"success":false}', "SOAP Fault HD-404"],
  },
];
