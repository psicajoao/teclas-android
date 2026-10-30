# Pagamento (Asaas) — passo a passo

1. Supabase > SQL Editor: rode `trial-por-aparelho.sql` (se ainda não rodou).
2. Asaas (sandbox primeiro): crie o link de pagamento de R$199, pagamento único. Anote o id do link.
3. Supabase > Edge Functions > Create a new function, nome `asaas-webhook`, cole `functions/asaas-webhook/index.ts`
   e DESLIGUE "Verify JWT" (o Asaas não envia o token do Supabase).
4. Supabase > Edge Functions > Secrets: cadastre ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_BASE e (opcional) PAYMENT_LINK_ID.
5. Asaas > Integrações > Webhooks: URL `https://<projeto>.supabase.co/functions/v1/asaas-webhook`,
   token = o mesmo ASAAS_WEBHOOK_TOKEN, eventos de cobrança (confirmada, recebida, estornada, chargeback).
6. Teste no sandbox: pague o link, veja a linha aparecer em pk_licenses, entre no app com esse e-mail.
7. Depois, repita 2 a 5 com a chave real (ASAAS_BASE = https://api.asaas.com/v3).

## Notas do teste no sandbox
- Endereço do sandbox: `https://api-sandbox.asaas.com/v3` (chave `$aact_hmlg_`); produção: `https://api.asaas.com/v3` (chave `$aact_prod_`). A função escolhe pelo prefixo da chave.
- Token do webhook: mínimo 32 caracteres (use "Gerar Token" e copie para ASAAS_WEBHOOK_TOKEN).
- Link parcelado gera parcelas menores que R$199; por isso a função não checa o valor.
- Webhook "Interrompido" após falhas: Webhooks > editar > Remover ▾ > Remover penalização (nunca "Remover Webhook").
