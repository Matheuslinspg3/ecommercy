# Etapas para comercializar e evoluir

## 1. Base configurável — implementada nesta versão

Vitrine, configuração por estabelecimento, cinco perfis, catálogo, opções, carrinho, cotação, pedidos, painel, estoque/reservas, equipe, acompanhamento e gerador de instalações. Pagamento no recebimento. Código preparado para um repositório template independente.

## 2. Primeiro cliente piloto — antes de comercializar o escopo como pronto

Escolher um restaurante ou lanchonete com cardápio simples. Criar o repositório e a infraestrutura exclusivos, cadastrar produtos e fotos reais, revisar regiões/contatos/conteúdo e homologar com a equipe. Testar vários atendentes e conexões reais, pedidos simultâneos, cancelamento, internet instável e rotina de expiração. Recuperar o UUID do envio após recarregar a janela antes de ampliar a operação.

Definir o que entra no contrato: implantação, manutenção, domínio, hospedagem, suporte, integração financeira e funcionalidades específicas. Registrar versão da instalação e processo de atualização. Nem código gerado nem uma demonstração substituem essa validação operacional.

## 3. Pagamentos online

Extrair/adaptar o fluxo já existente no Pharmaco em uma camada própria: conta por estabelecimento, Pix/cartão, confirmação de referência e valor, webhook autenticado, idempotência de evento, conciliação de criação incerta, cancelamento confirmado e política de estorno sem reposição física automática. Homologar em Sandbox próprio antes de qualquer cobrança de produção.

## 4. Operação de alimentação

Horários, disponibilidade diária, capacidade, impressão, painel de cozinha, emissão/entrega de comandas, fichas técnicas, combos e estoque de componentes. Os adicionais atuais não são um motor de receitas ou combos. Integrações com entregadores dependem de fornecedor e contrato.

## 5. Mercado e farmácia

Mercado: produtos pesados, ajustes de quantidade/valor aceitos pelo cliente, substituições, leitor de código de barras e ERP. Farmácia: reaproveitar o módulo especializado do Pharmaco com lotes/validade e limites de dispensação; implementar e revisar fluxos próprios antes de ampliar as classes de produtos vendidas.

## 6. Gestão de vários clientes

Painel do fornecedor, provisionamento, versões e rollout por cliente. Se a escala justificar um SaaS compartilhado, construir o modelo de organizações e isolamento com testes de acesso cruzado antes de consolidar bancos. Cobrança recorrente da plataforma e domínio por organização são módulos separados.
