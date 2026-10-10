# Commerce Base

Base inicial de e-commerce configurável para vender lojas próprias a **restaurantes, lanchonetes, mercados, farmácias e outros comércios**. Next.js + React + Supabase. Um código reutilizável; cada cliente tem sua marca, domínio, equipe e banco próprios.

**Versão 0.1.0:** fluxo de pedido com pagamento na entrega/retirada, conferido pela equipe. Não inclui pagamento online automático nem todas as rotinas específicas de cada segmento. A homologação de uma instalação real é uma etapa separada.

## Onde está este código

Esta base é mantida no repositório dedicado [Matheuslinspg3/ecommercy](https://github.com/Matheuslinspg3/ecommercy). A versão inicial está na `main` e na branch `codex/commerce-whitelabel-template`. O repositório contém somente os arquivos desta base, com histórico próprio.

Para usar a função de template do GitHub, marque **Settings → Template repository** neste repositório. O gerador abaixo também cria cópias completas e personalizadas, sem copiar credenciais ou configuração do cliente anterior.

## O que já funciona

- Loja responsiva, busca, categorias, fotos por URL HTTPS ou ilustrações locais, carrinho persistido por identificador da loja e aviso de últimas unidades baseado no estoque disponível.
- Adicionais, tamanhos/opções obrigatórias e opcionais, limites de seleção e preço por unidade.
- Entrega por faixas de CEP configuradas, retirada, pedido mínimo e frete grátis por subtotal.
- Em `STORE_MODE=demo`, catálogo fictício e simulação visivelmente identificada; nenhum pedido real, conta de cliente ou cobrança é criado.
- Em `STORE_MODE=live`, catálogo e pedidos persistem no Supabase exclusivo da instalação. Valores são recalculados no banco; mudanças de preço exigem nova conferência do cliente.
- Reservas transacionais, prevenção de excesso de estoque, idempotência, liberação de reservas canceladas/expiradas e baixa física na conclusão.
- Acompanhamento por código secreto, sem listagem pública de pedidos ou dados pessoais.
- Painel com catálogo, imagens, grupos de opções, marca, cores, contatos, regiões e pedidos. Dono configura; operador atende pedidos.
- A lista de pedidos atualiza a cada 15 segundos enquanto a tela de atendimento está aberta.
- Supabase Auth com verificação de identidade, autorização em tabela de equipe, RLS em todas as tabelas e RPCs acessíveis somente pelo servidor.
- Gerador de instalações com cinco perfis, lista explícita de arquivos permitidos e recusa de sobrescrever destinos existentes.

## Executar a demonstração

Node.js 22 ou superior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Abra `http://localhost:3000`. A loja está em `/`; o painel demonstrativo, somente leitura, está em `/admin`. A faixa de entrega de exemplo é `01000000–01999999`; ela não é criada como região real de uma instalação.

## Criar um cliente

Execute na base depois de `npm ci`. Use uma pasta vazia fora da base:

```bash
npm run client:init -- --preset restaurant --slug restaurante-exemplo --name "Restaurante Exemplo" --city "Santos" --state SP --out ../restaurante-exemplo
```

Perfis: `restaurant`, `snack_bar`, `grocery`, `pharmacy`, `retail`.

Na pasta criada, instale as dependências e configure domínio/Supabase próprios. Não herde o banco, segredos, logos ou inicialização de outro cliente. O gerador não cria repositório, infraestrutura, domínio ou conta de pagamento automaticamente.

| Perfil         | Base atual                                                                             | Módulos específicos a desenvolver                                                          |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Restaurante    | Cardápio, adicionais, opções/tamanhos, produção sob demanda, preparo, entrega/retirada | Combos com estoque de componentes, fichas técnicas, impressão e painel dedicado de cozinha |
| Lanchonete     | Mesmo núcleo de cardápio e pedidos; textos e exemplos próprios                         | Impressão, combos e integração com entregadores                                            |
| Mercado        | Produtos, estoque inteiro, entrega e retirada                                          | Pesagem/fracionados, substituições, leitor de código de barras e ERP                       |
| Farmácia       | Produtos gerais; OTC exige advertência; receita e controlados bloqueados               | Módulo farmacêutico próprio, lotes/validade e fluxos específicos antes de ampliar o escopo |
| Comércio geral | Catálogo, opções, estoque, pedidos e personalização                                    | Integrações próprias do estabelecimento                                                    |

## Ativar uma instalação real

1. Crie um projeto Supabase **novo e exclusivo** e uma implantação própria, com seu domínio.
2. Aplique a migration de `supabase/migrations/` nesse projeto vazio.
3. Crie a conta do dono no Supabase Auth e obtenha seu UUID. Na pasta do cliente, execute:

   ```bash
   npm run db:setup-sql -- --owner UUID_DO_USUARIO_AUTH
   ```

4. Aplique o arquivo gerado `supabase/initialize.sql` no mesmo projeto. Ele inicializa somente uma instalação nova, sem produtos reais, sem regiões de entrega e com pedidos pausados. Executá-lo novamente falha; não use para reconfigurar uma loja em operação.
5. Na hospedagem, configure `STORE_MODE=live`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL` e `ORDER_TOKEN_SECRET`. Chaves secretas ficam somente no servidor. A URL pública deve coincidir com a origem do site; produção deve usar HTTPS.
6. Entre em `/entrar`, cadastre o catálogo e configure a loja em `/admin`. Configure faixas de CEP reais e ative somente modalidades que a equipe atende. Reveja as informações públicas e a página de privacidade para aquela operação.
7. Configure a expiração de pedidos pendentes: a cada cinco minutos, um agendador chama `GET /api/cron/expire` com `Authorization: Bearer CRON_SECRET`. O token deve ter pelo menos 32 caracteres. O botão **Liberar pedidos expirados** permite execução manual. Sem essas execuções, reservas vencidas permanecem retidas até a liberação.
8. Valide a instalação com `supabase/validation/installation.sql` e homologue retirada, entrega, cancelamento, expiração, estoque, equipe e acompanhamento em ambiente de teste. Só depois habilite **Aceitar pedidos**.

`ORDER_TOKEN_SECRET` precisa ser estável para que retries devolvam o mesmo código de acompanhamento. Use um segredo diferente por instalação. O código já entregue continua válido enquanto seu hash estiver no banco; trocar o segredo afeta a recuperação de retries anteriores.

Produtos sob demanda não têm quantidade física; sua disponibilidade depende de ativar/pausar o produto. Produtos com estoque usam unidades inteiras e reservas. O modo de estoque não pode ser trocado enquanto houver pedidos em andamento daquele produto.

## Limites da versão

Pix/cartão online, Asaas, estorno financeiro, emissão fiscal, PDV, ERP, impressão, horários automáticos de abertura, capacidade de cozinha, painel central de várias lojas, cobrança de assinatura e atualização automática de instalações **não estão implementados**. As ilustrações de exemplo não são fotos de produtos reais; cadastre imagens e catálogo do estabelecimento.

Não existe isolamento por `tenant_id` em um banco compartilhado. A separação é por projeto/implantação e identidade conferida no servidor. Apontar duas lojas para o mesmo banco é rejeitado quando seus slugs diferem; ainda é sua responsabilidade provisionar credenciais e projeto exclusivos. Configuração não substitui isolamento real.

O catálogo farmacêutico não comprova adequação de uma operação de farmácia. O Pharmaco continua como produto especializado; esta base não migra nem substitui suas funcionalidades. Nenhuma receita ou dado clínico é coletado. Ampliações desse segmento exigem implementação e revisão específicas.

O carrinho persiste somente itens. Um envio cujo retorno de rede é incerto deve ser repetido na mesma janela, mantendo o identificador e os dados. Fechar/recarregar a janela antes do retorno perde esse identificador local; a equipe deve conferir pedidos antes de um novo envio. Recuperação automática após recarregar faz parte da próxima etapa.

## Verificação

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

Os testes do banco executam PostgreSQL via PGlite, sem projeto real. Conferem permissões/RLS, preço e frete, personalizações, idempotência, estoque, rollback, expiração, pagamento manual e papéis da equipe. Concorrência com várias conexões, disponibilidade de produção e a operação de um cliente real exigem homologação adicional.

O teste de navegador sobe uma loja em modo demonstrativo, verifica desktop/celular, busca, adicionais, cesta, frete, simulação e painel. Screenshots ficam em `test-results/`, fora do Git.

As rotas também são exercitadas em modo live com uma fixture HTTP local e o PostgreSQL WASM: gravação/consulta de pedidos, retries, códigos secretos, cookies de autenticação, papéis de equipe, edição de configuração e recusa de banco de outra instalação. A fixture não comprova OAuth, credenciais, políticas ou disponibilidade de um Supabase hospedado. `npm run test:http` executa essa parte sem depender de Chromium.

Arquitetura e atualização de clientes: [docs/ARQUITETURA.md](docs/ARQUITETURA.md). Etapas de evolução: [docs/ROADMAP.md](docs/ROADMAP.md).

Referências: [GitHub templates](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [ambientes Supabase](https://supabase.com/docs/guides/deployment/managing-environments).
