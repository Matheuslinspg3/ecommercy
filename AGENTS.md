# Commerce Base — manutenção

- Leia README.md e docs/ARQUITETURA.md antes de mudar pedidos ou isolamento.
- Esta base utiliza uma instalação e um projeto Supabase por cliente. Não misture projetos ou use o Supabase do Pharmaco/Porta do Corretor para testes.
- Marca e segmento ficam em store.config.json/painel; não introduza nomes, cidades ou regras de um cliente em componentes compartilhados.
- Preços, adicionais, frete e estoque são conferidos no servidor e novamente na transação PostgreSQL. expected_total_cents é uma confirmação de cotação, nunca uma fonte de preço.
- Somente código server-only pode utilizar SUPABASE_SECRET_KEY. A equipe é autorizada por staff_members, nunca por user_metadata.
- RPCs de estoque/pedidos são security invoker e exclusivos de service_role. Mantenha RLS, revogações e verificação de ator.
- Preserve idempotência, ordem dos bloqueios, rollback e as transições de pedidos. Não transforme callbacks de navegação em confirmação de dinheiro.
- O pagamento atual é no recebimento, conferido pela equipe. Integração financeira exige seu próprio fluxo de criação, conciliação, webhooks autenticados, timeout e estorno; não marque como implementada sem isso.
- Nunca libere venda de medicamentos sujeitos a receita ou controle especial com uma flag de interface.
- Gere migrations novas com `npx supabase migration new nome`; não altere migrations já aplicadas. A migration inicial pode ser ajustada somente antes de sua primeira aplicação externa.
- O gerador exporta apenas caminhos permitidos. Nunca copie .env, dados de cliente, diretórios de build, histórico Git, vínculos Supabase ou arquivos de inicialização anteriores.
- Após mudanças de negócio: `npm run check`. Após mudanças de interface/pedidos: `npm run test:e2e`. Testes usam dados fictícios, banco WASM local e demonstração; não conecte contas ou cobranças reais.
