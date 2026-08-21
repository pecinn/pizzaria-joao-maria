# Pizzaria João & Maria — Sistema de Estoque e Produção

Implementação do levantamento de requisitos v2.0: cadastros, compras com nota fiscal,
controle de estoque por movimento, fichas técnicas, apuração de custos, capacidade de
produção e relatórios gerenciais.

## Tecnologias

| Camada   | Stack                                                       |
|----------|-------------------------------------------------------------|
| Backend  | Node.js + TypeScript + Express + SQLite (`node:sqlite`)      |
| Gestão   | React 18 + TypeScript + Vite (`web/`, porta 5173)           |
| Loja     | React 18 + TypeScript + Vite (`loja/`, porta 5174)         |
| Banco    | SQLite normalizado até a 3FN, com FKs, CHECKs e triggers     |

São **duas aplicações web** sobre a mesma API: `web/` é a gestão usada pelo dono e
`loja/` é onde o cliente vê o cardápio e faz o pedido.

Não há dependência nativa nem servidor de banco a instalar: o SQLite vem embutido no
Node 22+. O arquivo do banco é criado em `server/pizzaria.db` na primeira execução.

## Como executar

```bash
# 1) Backend  (http://localhost:3333)
cd server
npm install
npm run dev

# 2) Gestão (http://localhost:5173) — em outro terminal
cd web
npm install
npm run dev

# 3) Loja do cliente (http://localhost:5174) — em outro terminal
cd loja
npm install
npm run dev
```

Na primeira execução o banco é criado e populado com dados de demonstração
(3 fornecedores, 16 itens, 4 sabores × 4 tamanhos, 3 notas fiscais e vendas dos
últimos dias). Para recriar do zero: `cd server && npm run seed`.

## Estrutura

```
server/
  src/db/schema.sql      modelo físico completo (tabelas, triggers e views)
  src/db/seed.ts         carga de demonstração
  src/db/index.ts        conexão, helpers e transações
  src/services/          regras de negócio (estoque, fechamento, relatórios)
  src/routes/            API REST
  src/services/loja.ts   cardápio público, pedido do cliente e painel de delivery
  src/services/whatsapp.ts  montagem das mensagens e dos links wa.me
web/                     GESTÃO (dono)
  src/api.ts             cliente HTTP + tipos do domínio
  src/pages/             telas do sistema
  src/components/ui.tsx  componentes e hook de carregamento
loja/                    LOJA ONLINE (cliente)
  src/pages/Cardapio.tsx   cardápio com disponibilidade real
  src/pages/Checkout.tsx   dados, entrega e pagamento
  src/pages/Acompanhar.tsx trilha de status do pedido
```

## Loja online e delivery

O cliente acessa `loja/`, monta o carrinho e finaliza o pedido. O pedido entra
direto no banco e aparece na tela **Delivery** da gestão, que se atualiza a cada
15 segundos e mostra um contador no menu.

**Fluxo do pedido.** `RECEBIDO → EM_PREPARO → PRONTO → SAIU_ENTREGA → ENTREGUE`,
com histórico em `pedido_status_historico`.

**Pedido novo não é venda ainda.** Ele nasce com `situacao = 'ABERTO'` e só vira
`'FECHADO'` quando marcado como entregue — assim um pedido cancelado nunca baixa
estoque no fechamento diário (RN07). A tela de fechamento avisa quando há pedidos
do dia ainda em andamento, porque eles não entram na baixa.

**O cardápio respeita o estoque.** Um sabor cujo ingrediente limitante zerou aparece
como "esgotado hoje", usando a mesma `vw_producao_possivel` da gestão (RN13). Preço
e disponibilidade são sempre recalculados no servidor no momento do pedido — o que o
navegador enviou nunca é usado como preço.

**WhatsApp por link `wa.me`** (click-to-chat), nos dois sentidos:

- **Cliente → loja**: ao confirmar, abre o WhatsApp da pizzaria com o pedido já
  escrito (itens, endereço, forma de pagamento e troco calculado).
- **Loja → cliente**: cada mudança de status abre o WhatsApp do cliente com a
  mensagem daquele status pronta; há também um botão "Falar no WhatsApp" a qualquer momento.

Essa escolha não exige token, número verificado nem custo por mensagem, e usa o
WhatsApp que a pizzaria já tem. A contrapartida é que **o envio é manual**: alguém
precisa tocar em "enviar" na conversa aberta. Para disparo automático seria
necessária a WhatsApp Business Cloud API (conta Meta, número dedicado, templates
aprovados e custo por conversa) — o serviço `services/whatsapp.ts` já isola a
montagem das mensagens, então essa troca ficaria restrita a ele.

O número da pizzaria, taxa de entrega, pedido mínimo, tempos e o botão
"aceitando pedidos" ficam na tabela `configuracao`, editáveis na tela Delivery.

## Decisões de modelagem

**O saldo é consequência, nunca causa (RN06).** `saldo_estoque` não é escrito por
nenhuma rota: um trigger `AFTER INSERT ON movimento_estoque` recalcula o saldo, o custo
unitário e a última data de entrada. Assim o histórico sempre reconstrói o saldo, e um
segundo trigger aborta qualquer operação que deixaria o saldo negativo (RN08).

**Atributos derivados não viram coluna (seção 6 do levantamento).** Quantidade líquida,
custo real, produção possível, ingrediente limitante, custo da pizza, valor total da nota
e sugestão de compra são views:

| View                        | Atende          |
|-----------------------------|-----------------|
| `vw_posicao_estoque`        | RF11, RN05      |
| `vw_lista_compras`          | RF12            |
| `vw_capacidade_ingrediente` | RF14, RF15      |
| `vw_producao_possivel`      | RF14, RF15, RN13|
| `vw_custo_produto`          | RF16            |
| `vw_preco_vigente`          | RN10            |
| `vw_nota_fiscal_total`      | RF07            |

**Conversão de unidade na entrada (RN03).** A nota fiscal guarda a quantidade na unidade
de compra (kg, caixa, fardo) junto com o fator de conversão; o movimento gerado já é
gravado na unidade de controle do item (g, ml, un), com o custo unitário convertido.

**Bebida tem cadastro único (RN02).** É um `item` com `vendavel = 1` e preço próprio em
`preco_venda` — não existe tabela paralela de produtos de venda.

**Preço nunca é sobrescrito (RN10).** Registrar um novo preço encerra a vigência do
anterior (`data_fim`) e insere uma nova linha.

**Cadastros são inativados, não excluídos (RN14).** `DELETE` nas rotas de item,
fornecedor e sabor apenas marca `ativo = 0`.

## Cobertura dos requisitos

| Requisito | Onde está |
|-----------|-----------|
| RF01, RF02, RF03, RF04 | tela Cadastros · `routes/cadastros.ts` |
| RF05, RF06 | tela Cardápio e fichas |
| RF07, RF08 | tela Compras → "Registrar entrada por nota fiscal" |
| RF09 | tela Estoque → "Registrar perda ou ajuste" |
| RF10 | tela Fechamento diário |
| RF11 | tela Estoque |
| RF12 | tela Compras → "Lista de compras sugerida" |
| RF13 | tela Compras → "Histórico de compras por item" |
| RF14, RF15, RF16 | tela Produção e custos |
| RF17 | tela Vendas (balcão) e loja online do cliente |
| Delivery | loja `loja/` + tela Delivery na gestão |
| RF18, RF19, RF20 | tela Relatórios e Painel |

## Pontos em aberto do levantamento (seção 8)

Estes itens dependem de validação com o cliente e **não** foram implementados; a
modelagem atual não os impede, mas exigiria extensão:

- **Pizza meio a meio** — hoje `item_pedido` referencia um único sabor. Exigiria uma
  tabela de frações do item vendido, com rateio de consumo e de preço.
- **Adicionais** (borda recheada, extras, combos) — precisariam de ficha técnica própria.
- **Lote e validade** de perecíveis — exigiria uma tabela de lotes entre item e movimento.
- **Entregadores** — o delivery foi implementado com cliente, endereço e status, mas
  não há cadastro de entregadores nem atribuição de entrega a um motoboy.
- **Aproveitamento variável** por fornecedor, época ou lote — hoje é fixo por item (RN04).
- **Baixa em tempo real** por pedido — hoje a baixa é no fechamento diário (RN07).
- **Múltiplas filiais** — exigiria um eixo de local em saldo e movimento.

Também ficaram fora do escopo, conforme o documento: emissão de NF-e, contas a
pagar/receber e folha de pagamento. O controle de acesso por perfil está modelado
(`usuario.perfil`) mas ainda não há autenticação: as rotas recebem `usuario_id` para
auditoria dos movimentos.
