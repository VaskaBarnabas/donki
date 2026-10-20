import { createServiceClient } from '@/lib/supabase/server'
import { stripe } from '@/legacy/payments/kulso'
import { esemenyFeldolgozas } from '@/legacy/payments/webhook'

export const runtime = 'nodejs'

// Stripe webhook. Az aláírást a nyers törzzsel kell ellenőrizni (req.text(), nem req.json()).
// Fejlesztéshez: stripe listen --all-snapshot --forward-to localhost:3000/api/legacy/payments/webhook

export async function POST(req: Request) {
  const nyers = await req.text()
  const alairas = req.headers.get('stripe-signature')
  const titok = process.env.STRIPE_WEBHOOK_SECRET

  if (!alairas || !titok) {
    return Response.json({ error: { type: 'signature_verification_failed', message: 'Missing signature' } }, { status: 400 })
  }

  let event
  try {
    event = stripe().webhooks.constructEvent(nyers, alairas, titok)
  } catch (e) {
    return Response.json(
      { error: { type: 'signature_verification_failed', message: e instanceof Error ? e.message : 'Invalid signature' } },
      { status: 400 }
    )
  }

  try {
    const eredmeny = await esemenyFeldolgozas(createServiceClient(), event)
    return Response.json({ received: true, type: event.type, result: eredmeny })
  } catch (e) {
    // 500 → a Stripe később újraküldi az eseményt; a feldolgozás idempotens
    console.error('[payments/webhook]', event.type, event.id, e)
    return Response.json({ error: { type: 'api_error', message: 'Processing failed, will be retried' } }, { status: 500 })
  }
}
