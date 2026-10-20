-- Forrás: supabase/migrations/20261013100000_billing_kulso_szamla.sql
-- Külső (Számlázz.hu) számla hivatkozása a díjbekérőn.
-- A végleges számlát a fizetés után a SzámlaBridge állítja ki a Számlázz.hu (teszt)fiókban;
-- a számlázó rendszer ezt a fizetés azonosítója (Stripe pi_…) alapján köti a díjbekérőhöz,
-- és a PDF-et a saját tárhelyére menti.

alter table billing.szamlak
  add column kulso_ref           text,  -- a fizetés azonosítója a külső számlázónál (Stripe PaymentIntent)
  add column kulso_allapot       text,  -- a SzámlaBridge issueStatus / issueText utolsó ismert értéke
  add column kulso_pdf_utvonal   text;  -- a letöltött külső számla PDF-je a szamlak bucketben
