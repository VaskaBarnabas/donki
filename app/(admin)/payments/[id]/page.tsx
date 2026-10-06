import { notFound } from "next/navigation";
import { Adatok, Allapot, Hivatkozas, Kod, OldalFejlec, Panel } from "@/components/admin/elemek";
import { isoIdo } from "@/lib/admin/format";
import { fizetesRest } from "@/lib/admin/interfeszek";

type Fizetes = {
  id: string;
  invoiceRef: string;
  status: string;
  url: string | null;
  amountMinor: number;
  currency: string;
  stripeSessionId: string | null;
  stripePaymentIntent: string | null;
  createdAt: string;
  updatedAt: string;
};

export default async function FizetesReszletOldal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await fizetesRest<Fizetes>("GET", `?id=${encodeURIComponent(id)}`);
  if (r.status !== 200) notFound();
  const f = r.body;

  return (
    <>
      <OldalFejlec cim="Fizetés" leiras="GET /api/legacy/payments?id=… – modern REST válasz (camelCase, ISO, fillér)." />
      <Panel cim={f.id}>
        <Adatok
          sorok={[
            ["Státusz", <Allapot key="s" ertek={f.status} />],
            ["Számla", <Hivatkozas key="i" href={`/billing/${f.invoiceRef}`}>{f.invoiceRef}</Hivatkozas>],
            ["Összeg", `${f.amountMinor} (${f.currency.toUpperCase()} minor unit)`],
            ["Stripe Checkout Session", f.stripeSessionId ? <Kod key="cs">{f.stripeSessionId}</Kod> : null],
            ["Stripe PaymentIntent", f.stripePaymentIntent ? <Kod key="pi">{f.stripePaymentIntent}</Kod> : null],
            [
              "Fizetési oldal",
              f.url && f.status === "CREATED" ? (
                <a key="u" href={f.url} target="_blank" rel="noreferrer" className="text-primary underline">
                  Stripe Checkout megnyitása
                </a>
              ) : (
                "—"
              ),
            ],
            ["Létrehozva / frissítve", `${isoIdo(f.createdAt)} / ${isoIdo(f.updatedAt)}`],
          ]}
        />
      </Panel>
    </>
  );
}
