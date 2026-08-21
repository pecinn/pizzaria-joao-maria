-- =====================================================================
-- PIZZARIA JOÃO & MARIA — Modelo físico (SQLite) — normalizado até 3FN
-- Cada bloco referencia as Regras de Negócio (RN) que implementa.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------- USUARIO (auditoria dos movimentos) ----------------------
CREATE TABLE IF NOT EXISTS usuario (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  nome    TEXT NOT NULL,
  login   TEXT NOT NULL UNIQUE,
  perfil  TEXT NOT NULL CHECK (perfil IN ('ADMIN','ESTOQUE','CAIXA')),
  ativo   INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

-- ---------- UNIDADE DE MEDIDA (RN03) --------------------------------
CREATE TABLE IF NOT EXISTS unidade_medida (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sigla      TEXT NOT NULL UNIQUE,
  descricao  TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('MASSA','VOLUME','UNIDADE'))
);

-- ---------- FORNECEDOR (RF01, RN14) ---------------------------------
CREATE TABLE IF NOT EXISTS fornecedor (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj           TEXT NOT NULL UNIQUE,
  razao_social   TEXT NOT NULL,
  nome_fantasia  TEXT,
  telefone       TEXT,
  email          TEXT,
  endereco       TEXT,
  contato        TEXT,
  ativo          INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

-- ---------- ITEM (RF02, RN01, RN02, RN04) ---------------------------
CREATE TABLE IF NOT EXISTS item (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo              TEXT NOT NULL UNIQUE,
  nome                TEXT NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('INSUMO','BEBIDA','EMBALAGEM','DESCARTAVEL')),
  unidade_padrao_id   INTEGER NOT NULL REFERENCES unidade_medida(id),
  perc_aproveitamento NUMERIC NOT NULL DEFAULT 100
                        CHECK (perc_aproveitamento > 0 AND perc_aproveitamento <= 100),
  estoque_minimo      NUMERIC NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  estoque_maximo      NUMERIC NOT NULL DEFAULT 0 CHECK (estoque_maximo >= 0),
  vendavel            INTEGER NOT NULL DEFAULT 0 CHECK (vendavel IN (0,1)),
  ativo               INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  -- RN04: itens sem perda de preparo têm sempre 100% de aproveitamento
  CHECK (tipo = 'INSUMO' OR perc_aproveitamento = 100),
  CHECK (estoque_maximo = 0 OR estoque_maximo >= estoque_minimo)
);

-- ---------- ITEM x FORNECEDOR (RN12, RN03) --------------------------
CREATE TABLE IF NOT EXISTS item_fornecedor (
  item_id              INTEGER NOT NULL REFERENCES item(id),
  fornecedor_id        INTEGER NOT NULL REFERENCES fornecedor(id),
  codigo_no_fornecedor TEXT,
  unidade_compra_id    INTEGER NOT NULL REFERENCES unidade_medida(id),
  fator_conversao      NUMERIC NOT NULL CHECK (fator_conversao > 0), -- un. compra -> un. padrão
  prazo_entrega_dias   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, fornecedor_id)
);

-- ---------- SALDO DE ESTOQUE (escrito apenas por trigger — RN06) ----
CREATE TABLE IF NOT EXISTS saldo_estoque (
  item_id              INTEGER PRIMARY KEY REFERENCES item(id),
  quantidade_atual     NUMERIC NOT NULL DEFAULT 0,
  custo_unitario_atual NUMERIC NOT NULL DEFAULT 0,
  ultima_data_entrada  TEXT,
  data_ultima_contagem TEXT
);

-- ---------- NOTA FISCAL DE COMPRA (RF07, RN11) ----------------------
CREATE TABLE IF NOT EXISTS nota_fiscal_compra (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  numero         TEXT NOT NULL,
  serie          TEXT NOT NULL DEFAULT '1',
  fornecedor_id  INTEGER NOT NULL REFERENCES fornecedor(id),
  data_emissao   TEXT NOT NULL,
  data_entrada   TEXT NOT NULL,
  valor_frete    NUMERIC NOT NULL DEFAULT 0 CHECK (valor_frete >= 0),
  valor_desconto NUMERIC NOT NULL DEFAULT 0 CHECK (valor_desconto >= 0),
  usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
  UNIQUE (fornecedor_id, numero, serie)
);

CREATE TABLE IF NOT EXISTS item_nota_fiscal (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  nota_id           INTEGER NOT NULL REFERENCES nota_fiscal_compra(id) ON DELETE CASCADE,
  item_id           INTEGER NOT NULL REFERENCES item(id),
  quantidade        NUMERIC NOT NULL CHECK (quantidade > 0),   -- na unidade de compra
  unidade_compra_id INTEGER NOT NULL REFERENCES unidade_medida(id),
  fator_conversao   NUMERIC NOT NULL CHECK (fator_conversao > 0),
  valor_unitario    NUMERIC NOT NULL CHECK (valor_unitario >= 0), -- por unidade de compra
  UNIQUE (nota_id, item_id)
);

-- ---------- MOVIMENTO DE ESTOQUE (RN06, RF09) -----------------------
-- quantidade sempre na UNIDADE PADRÃO do item; positiva = entrada.
CREATE TABLE IF NOT EXISTS movimento_estoque (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id          INTEGER NOT NULL REFERENCES item(id),
  tipo             TEXT NOT NULL CHECK (tipo IN ('ENTRADA','VENDA','PERDA','AJUSTE')),
  quantidade       NUMERIC NOT NULL CHECK (quantidade <> 0),
  custo_unitario   NUMERIC,            -- preenchido nas entradas (na un. padrão)
  data_hora        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  documento_origem TEXT,
  usuario_id       INTEGER NOT NULL REFERENCES usuario(id),
  observacao       TEXT,
  CHECK (tipo <> 'ENTRADA' OR quantidade > 0),
  CHECK (tipo NOT IN ('VENDA','PERDA') OR quantidade < 0)
);
CREATE INDEX IF NOT EXISTS ix_mov_item_data ON movimento_estoque(item_id, data_hora);

-- O saldo é consequência do movimento, nunca escrito à mão (RN06)
CREATE TRIGGER IF NOT EXISTS trg_mov_atualiza_saldo
AFTER INSERT ON movimento_estoque
BEGIN
  INSERT INTO saldo_estoque (item_id, quantidade_atual) VALUES (NEW.item_id, 0)
    ON CONFLICT(item_id) DO NOTHING;
  UPDATE saldo_estoque
     SET quantidade_atual = quantidade_atual + NEW.quantidade,
         custo_unitario_atual = CASE WHEN NEW.tipo = 'ENTRADA' AND NEW.custo_unitario IS NOT NULL
                                     THEN NEW.custo_unitario ELSE custo_unitario_atual END,
         ultima_data_entrada  = CASE WHEN NEW.tipo = 'ENTRADA'
                                     THEN NEW.data_hora ELSE ultima_data_entrada END,
         data_ultima_contagem = CASE WHEN NEW.tipo = 'AJUSTE'
                                     THEN NEW.data_hora ELSE data_ultima_contagem END
   WHERE item_id = NEW.item_id;
END;

-- RN08: saldo nunca negativo — a via de correção é o ajuste de inventário
CREATE TRIGGER IF NOT EXISTS trg_saldo_nao_negativo
AFTER UPDATE ON saldo_estoque
WHEN NEW.quantidade_atual < 0
BEGIN
  SELECT RAISE(ABORT, 'RN08: saldo ficaria negativo - registre um ajuste de inventario justificado');
END;

-- ---------- CARDÁPIO: TAMANHO, PRODUTO/SABOR, FICHA TÉCNICA ---------
CREATE TABLE IF NOT EXISTS tamanho (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao     TEXT NOT NULL UNIQUE,
  numero_fatias INTEGER NOT NULL CHECK (numero_fatias > 0),
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

CREATE TABLE IF NOT EXISTS produto (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL CHECK (categoria IN ('SALGADA','DOCE')),
  descricao TEXT,
  ativo     INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

-- RN09: a receita varia por sabor E tamanho
CREATE TABLE IF NOT EXISTS ficha_tecnica (
  produto_id INTEGER NOT NULL REFERENCES produto(id),
  tamanho_id INTEGER NOT NULL REFERENCES tamanho(id),
  item_id    INTEGER NOT NULL REFERENCES item(id),
  quantidade NUMERIC NOT NULL CHECK (quantidade > 0),  -- na unidade padrão do item
  PRIMARY KEY (produto_id, tamanho_id, item_id)
);

-- ---------- PREÇO DE VENDA COM VIGÊNCIA (RN10, RF06) ----------------
-- Ou é (produto + tamanho), ou é um item vendável (bebida) — nunca os dois.
CREATE TABLE IF NOT EXISTS preco_venda (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id  INTEGER REFERENCES produto(id),
  tamanho_id  INTEGER REFERENCES tamanho(id),
  item_id     INTEGER REFERENCES item(id),
  valor       NUMERIC NOT NULL CHECK (valor >= 0),
  data_inicio TEXT NOT NULL,
  data_fim    TEXT,
  CHECK ( (produto_id IS NOT NULL AND tamanho_id IS NOT NULL AND item_id IS NULL)
       OR (produto_id IS NULL AND tamanho_id IS NULL AND item_id IS NOT NULL) )
);

-- ---------- VENDAS (RF17) -------------------------------------------
CREATE TABLE IF NOT EXISTS pedido (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  data_hora        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  tipo_atendimento TEXT NOT NULL CHECK (tipo_atendimento IN ('BALCAO','MESA','DELIVERY')),
  forma_pagamento  TEXT NOT NULL CHECK (forma_pagamento IN ('DINHEIRO','DEBITO','CREDITO','PIX')),
  situacao         TEXT NOT NULL DEFAULT 'FECHADO' CHECK (situacao IN ('ABERTO','FECHADO','CANCELADO')),
  usuario_id       INTEGER NOT NULL REFERENCES usuario(id)
);

CREATE TABLE IF NOT EXISTS item_pedido (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id       INTEGER NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  produto_id      INTEGER REFERENCES produto(id),
  tamanho_id      INTEGER REFERENCES tamanho(id),
  item_id         INTEGER REFERENCES item(id),
  quantidade      NUMERIC NOT NULL CHECK (quantidade > 0),
  preco_praticado NUMERIC NOT NULL CHECK (preco_praticado >= 0),
  CHECK ( (produto_id IS NOT NULL AND tamanho_id IS NOT NULL AND item_id IS NULL)
       OR (produto_id IS NULL AND tamanho_id IS NULL AND item_id IS NOT NULL) )
);

-- ---------- FECHAMENTO DIÁRIO (RF10, RN07) --------------------------
CREATE TABLE IF NOT EXISTS fechamento_diario (
  data_ref       TEXT PRIMARY KEY,
  data_hora_exec TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
  qtd_movimentos INTEGER NOT NULL DEFAULT 0
);

-- =====================================================================
-- VIEWS — atributos derivados (seção 6). Nada é gravado em coluna própria.
-- =====================================================================

-- Preço vigente hoje (produtos e bebidas) — RN10
CREATE VIEW IF NOT EXISTS vw_preco_vigente AS
SELECT produto_id, tamanho_id, item_id, valor
  FROM preco_venda
 WHERE date(data_inicio) <= date('now','localtime')
   AND (data_fim IS NULL OR date(data_fim) >= date('now','localtime'));

-- RF11: posição de estoque com quantidade e custo bruto/real (RN05)
CREATE VIEW IF NOT EXISTS vw_posicao_estoque AS
SELECT i.id AS item_id,
       i.codigo, i.nome, i.tipo, i.ativo, i.vendavel,
       u.sigla AS unidade,
       i.perc_aproveitamento,
       COALESCE(s.quantidade_atual, 0)                                       AS quantidade_bruta,
       COALESCE(s.quantidade_atual, 0) * i.perc_aproveitamento / 100.0       AS quantidade_liquida,
       COALESCE(s.custo_unitario_atual, 0)                                   AS custo_bruto_unitario,
       COALESCE(s.custo_unitario_atual, 0) * 100.0 / i.perc_aproveitamento   AS custo_real_unitario,
       COALESCE(s.quantidade_atual, 0) * COALESCE(s.custo_unitario_atual, 0) AS valor_em_estoque,
       i.estoque_minimo, i.estoque_maximo,
       s.ultima_data_entrada, s.data_ultima_contagem,
       CASE WHEN COALESCE(s.quantidade_atual,0) <= i.estoque_minimo THEN 'ABAIXO_MINIMO'
            WHEN i.estoque_maximo > 0
             AND COALESCE(s.quantidade_atual,0) > i.estoque_maximo  THEN 'ACIMA_MAXIMO'
            ELSE 'NORMAL' END AS situacao_estoque
  FROM item i
  JOIN unidade_medida u ON u.id = i.unidade_padrao_id
  LEFT JOIN saldo_estoque s ON s.item_id = i.id;

-- RF12: lista de compras sugerida (saldo <= mínimo), agrupável por fornecedor
CREATE VIEW IF NOT EXISTS vw_lista_compras AS
SELECT pe.item_id, pe.codigo, pe.nome, pe.unidade,
       pe.quantidade_bruta AS saldo_atual, pe.estoque_minimo, pe.estoque_maximo,
       (pe.estoque_maximo - pe.quantidade_bruta) AS qtd_sugerida,
       (pe.estoque_maximo - pe.quantidade_bruta) * pe.custo_bruto_unitario AS custo_estimado,
       f.id AS fornecedor_id,
       COALESCE(f.nome_fantasia, f.razao_social, 'SEM FORNECEDOR') AS fornecedor,
       COALESCE(itf.prazo_entrega_dias, 0) AS prazo_entrega_dias
  FROM vw_posicao_estoque pe
  LEFT JOIN item_fornecedor itf ON itf.item_id = pe.item_id
  LEFT JOIN fornecedor f ON f.id = itf.fornecedor_id AND f.ativo = 1
 WHERE pe.ativo = 1
   AND pe.situacao_estoque = 'ABAIXO_MINIMO'
   AND pe.estoque_maximo > pe.quantidade_bruta;

-- RF14/RF15: capacidade de produção item a item da ficha técnica
CREATE VIEW IF NOT EXISTS vw_capacidade_ingrediente AS
SELECT ft.produto_id, ft.tamanho_id, ft.item_id,
       pe.nome AS item_nome, pe.unidade,
       ft.quantidade AS qtd_receita,
       pe.quantidade_liquida,
       CAST(pe.quantidade_liquida / ft.quantidade AS INTEGER) AS producao_possivel,
       ft.quantidade * pe.custo_real_unitario                 AS custo_no_produto
  FROM ficha_tecnica ft
  JOIN vw_posicao_estoque pe ON pe.item_id = ft.item_id;

-- RF14/RF15/RN13: produção máxima e ingrediente limitante
CREATE VIEW IF NOT EXISTS vw_producao_possivel AS
SELECT c.produto_id, p.nome AS produto, p.categoria,
       c.tamanho_id, t.descricao AS tamanho,
       MIN(c.producao_possivel) AS qtd_maxima,
       (SELECT c2.item_nome FROM vw_capacidade_ingrediente c2
         WHERE c2.produto_id = c.produto_id AND c2.tamanho_id = c.tamanho_id
         ORDER BY c2.producao_possivel ASC, c2.item_nome LIMIT 1) AS ingrediente_limitante
  FROM vw_capacidade_ingrediente c
  JOIN produto p ON p.id = c.produto_id
  JOIN tamanho t ON t.id = c.tamanho_id
 GROUP BY c.produto_id, c.tamanho_id;

-- RF16: custo de produção e margem sobre o preço vigente
CREATE VIEW IF NOT EXISTS vw_custo_produto AS
SELECT c.produto_id, p.nome AS produto, c.tamanho_id, t.descricao AS tamanho,
       SUM(c.custo_no_produto) AS custo_producao,
       pv.valor                AS preco_venda,
       pv.valor - SUM(c.custo_no_produto) AS margem_valor,
       CASE WHEN pv.valor > 0
            THEN (pv.valor - SUM(c.custo_no_produto)) * 100.0 / pv.valor END AS margem_percentual
  FROM vw_capacidade_ingrediente c
  JOIN produto p ON p.id = c.produto_id
  JOIN tamanho t ON t.id = c.tamanho_id
  LEFT JOIN vw_preco_vigente pv
         ON pv.produto_id = c.produto_id AND pv.tamanho_id = c.tamanho_id
 GROUP BY c.produto_id, c.tamanho_id;

-- RF07: total da nota = itens + frete - desconto (derivado)
CREATE VIEW IF NOT EXISTS vw_nota_fiscal_total AS
SELECT nf.id AS nota_id, nf.numero, nf.serie, nf.fornecedor_id,
       COALESCE(f.nome_fantasia, f.razao_social) AS fornecedor,
       nf.data_emissao, nf.data_entrada, nf.valor_frete, nf.valor_desconto,
       COALESCE(SUM(inf.quantidade * inf.valor_unitario), 0) AS valor_itens,
       COALESCE(SUM(inf.quantidade * inf.valor_unitario), 0)
         + nf.valor_frete - nf.valor_desconto AS valor_total
  FROM nota_fiscal_compra nf
  JOIN fornecedor f ON f.id = nf.fornecedor_id
  LEFT JOIN item_nota_fiscal inf ON inf.nota_id = nf.id
 GROUP BY nf.id;

-- =====================================================================
-- LOJA / DELIVERY — canal de pedido do cliente final
-- =====================================================================

-- Parâmetros da loja usados pela aplicação do cliente
CREATE TABLE IF NOT EXISTS configuracao (
  chave     TEXT PRIMARY KEY,
  valor     TEXT NOT NULL,
  descricao TEXT
);

-- Cliente do delivery: identificado pelo telefone, que é também o canal WhatsApp
CREATE TABLE IF NOT EXISTS cliente (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  telefone   TEXT NOT NULL UNIQUE,
  criado_em  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ativo      INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

-- Histórico de mudanças de status, para auditoria do atendimento
CREATE TABLE IF NOT EXISTS pedido_status_historico (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id  INTEGER NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  data_hora  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id INTEGER REFERENCES usuario(id)
);
