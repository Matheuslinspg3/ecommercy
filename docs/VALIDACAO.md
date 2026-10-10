# Validação da entrega inicial — 10/10/2026

- `npm run lint`: aprovado, sem avisos.
- `npm run typecheck`: aprovado.
- `npm test`: 31 testes aprovados.
- `npm run build`: compilação de produção aprovada.
- `npm run test:http`: aprovado em demonstração e modo live com backend fictício local e PostgreSQL WASM. Inclui persistência, idempotência, proteção do acompanhamento, autenticação por cookie, funções da equipe, configuração e recusa de banco com outra identidade.
- `npm run test:e2e`: parte visual não executada neste ambiente porque o download do Chromium retornou um arquivo inválido. O script e o workflow estão preparados para rodá-la onde o Chromium estiver disponível.

Nenhum projeto Supabase hospedado, domínio de cliente ou conta de pagamento foi criado/alterado. Testes de produção, concorrência com várias conexões e validação visual continuam como etapas de homologação do primeiro cliente.
