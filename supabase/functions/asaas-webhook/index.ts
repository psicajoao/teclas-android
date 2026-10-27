// Palco Keys: recebe o aviso de pagamento do Asaas e libera (ou tira) a licença.
// Segredos necessários (Supabase > Edge Functions > Secrets):
//   ASAAS_API_KEY        chave de API do Asaas (sandbox no começo)
//   ASAAS_WEBHOOK_TOKEN  texto longo que você inventa; o mesmo vai no webhook do Asaas
//   ASAAS_BASE           https://sandbox.asaas.com/api/v3  (teste)  ou  https://api.asaas.com/v3  (real)
//   PAYMENT_LINK_ID      (opcional) id do link de R$199; só pagamentos desse link liberam a licença
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem sozinhos dentro da função.
import { createClient } from 'npm:@supabase/supabase-js@2'

const GRANT = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'])
const REVOKE = new Set(['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_DELETED'])
const MIN_VALUE = 199

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'método não permitido' }, 405)
  const token = Deno.env.get('ASAAS_WEBHOOK_TOKEN')
  if (!token || req.headers.get('asaas-access-token') !== token) return json({ error: 'não autorizado' }, 401)

  let body: { event?: string; payment?: { id?: string; customer?: string; value?: number; paymentLink?: string | null } }
  try { body = await req.json() } catch { return json({ error: 'corpo inválido' }, 400) }
  const ev = body.event ?? ''
  const pay = body.payment
  if (!pay?.customer) return json({ ok: true, ignored: 'sem pagamento' })
  if (!GRANT.has(ev) && !REVOKE.has(ev)) return json({ ok: true, ignored: ev })

  const link = Deno.env.get('PAYMENT_LINK_ID')
  if (link && pay.paymentLink !== link) return json({ ok: true, ignored: 'outro produto' })
  if (GRANT.has(ev) && (pay.value ?? 0) < MIN_VALUE) return json({ ok: true, ignored: 'valor abaixo do preço' })

  // o aviso traz só o código do cliente; o e-mail vem de uma consulta ao Asaas
  const base = Deno.env.get('ASAAS_BASE') ?? 'https://api.asaas.com/v3'
  const r = await fetch(`${base}/customers/${pay.customer}`, { headers: { access_token: Deno.env.get('ASAAS_API_KEY') ?? '' } })
  if (!r.ok) return json({ error: 'não consegui consultar o cliente' }, 502) // o Asaas tenta de novo
  const email = String((await r.json()).email ?? '').trim().toLowerCase()
  if (!email) return json({ error: 'cliente sem e-mail' }, 422)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (GRANT.has(ev)) {
    const { error } = await db.from('pk_licenses').upsert(
      { email, active: true, expires_at: null, max_devices: 2, note: `compra Asaas ${pay.id ?? ''}`.trim() },
      { onConflict: 'email' },
    )
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, granted: email })
  }
  // reembolso ou contestação: não mexe em administrador
  const { error } = await db.from('pk_licenses').update({ active: false, note: `${ev} ${pay.id ?? ''}`.trim() }).eq('email', email).eq('is_admin', false)
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true, revoked: email })
})
