import { Router } from 'express';
import { all, one, run, tx } from '../db';
import {
  registrarNota, registrarMovimento, posicaoEstoque, listaCompras, movimentos,
} from '../services/estoque';
import { previaFechamento, executarFechamento, diasPendentes, jaFechado, pedidosEmAberto } from '../services/fechamento';
import { hojeLocal } from '../util';

export const operacao = Router();

/* ================= ESTOQUE ================= */

// RF11
operacao.get('/estoque', (req, res) => res.json(posicaoEstoque({
  tipo: req.query.tipo as string | undefined,
  situacao: req.query.situacao as string | undefined,
  busca: req.query.busca as string | undefined,
})));

// RF12
operacao.get('/estoque/lista-compras', (_req, res) => res.json(listaCompras()));

// RN06 — extrato
operacao.get('/estoque/movimentos', (req, res) => res.json(movimentos({
  item_id: req.query.item_id ? Number(req.query.item_id) : undefined,
  tipo: req.query.tipo as string | undefined,
  de: req.query.de as string | undefined,
  ate: req.query.ate as string | undefined,
  limite: req.query.limite ? Number(req.query.limite) : undefined,
})));

// RF09 — perda / ajuste de inventário
operacao.post('/estoque/movimentos', (req, res, next) => {
  try {
    res.status(201).json(registrarMovimento(req.body));
  } catch (e) { next(e); }
});

/* ================= COMPRAS ================= */

// RF07/RF08
operacao.post('/notas', (req, res, next) => {
  try {
    res.status(201).json(registrarNota(req.body));
  } catch (e) { next(e); }
});

operacao.get('/notas', (_req, res) =>
  res.json(all('SELECT * FROM vw_nota_fiscal_total ORDER BY data_entrada DESC, nota_id DESC')));

operacao.get('/notas/:id', (req, res) => {
  const nota = one('SELECT * FROM vw_nota_fiscal_total WHERE nota_id = ?', [req.params.id]);
  if (!nota) return res.status(404).json({ erro: 'Nota fiscal não encontrada.' });
  res.json({
    ...nota,
    itens: all(
      `SELECT inf.*, i.codigo, i.nome AS item_nome, u.sigla AS unidade_compra,
              inf.quantidade * inf.fator_conversao AS qtd_un_padrao,
              inf.valor_unitario * 1.0 / inf.fator_conversao AS custo_un_padrao,
              inf.quantidade * inf.valor_unitario AS valor_total
         FROM item_nota_fiscal inf
         JOIN item i ON i.id = inf.item_id
         JOIN unidade_medida u ON u.id = inf.unidade_compra_id
        WHERE inf.nota_id = ?`, [req.params.id]),
  });
});

/* ================= PRODUÇÃO E CUSTOS ================= */

// RF14/RF15 — produção possível e ingrediente limitante
operacao.get('/producao', (_req, res) =>
  res.json(all('SELECT * FROM vw_producao_possivel ORDER BY produto, tamanho')));

operacao.get('/producao/:produtoId/:tamanhoId', (req, res) =>
  res.json({
    resumo: one('SELECT * FROM vw_producao_possivel WHERE produto_id=? AND tamanho_id=?',
      [req.params.produtoId, req.params.tamanhoId]),
    ingredientes: all(
      `SELECT * FROM vw_capacidade_ingrediente
        WHERE produto_id=? AND tamanho_id=? ORDER BY producao_possivel ASC`,
      [req.params.produtoId, req.params.tamanhoId]),
  }));

// RF16 — custo e margem
operacao.get('/custos', (_req, res) =>
  res.json(all('SELECT * FROM vw_custo_produto ORDER BY produto, tamanho')));

/* ================= VENDAS (RF17) ================= */

operacao.get('/pedidos', (req, res) =>
  res.json(all(
    `SELECT p.*, us.nome AS usuario,
            (SELECT COALESCE(SUM(ip.quantidade * ip.preco_praticado), 0)
               FROM item_pedido ip WHERE ip.pedido_id = p.id) AS valor_total
       FROM pedido p JOIN usuario us ON us.id = p.usuario_id
      WHERE (? IS NULL OR date(p.data_hora) = date(?))
      ORDER BY p.data_hora DESC LIMIT 100`,
    [req.query.data ?? null, req.query.data ?? null])));

operacao.get('/pedidos/:id', (req, res) => {
  const pedido = one('SELECT * FROM pedido WHERE id = ?', [req.params.id]);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json({
    ...pedido,
    itens: all(
      `SELECT ip.*, COALESCE(p.nome, i.nome) AS descricao, t.descricao AS tamanho,
              ip.quantidade * ip.preco_praticado AS subtotal
         FROM item_pedido ip
         LEFT JOIN produto p ON p.id = ip.produto_id
         LEFT JOIN tamanho t ON t.id = ip.tamanho_id
         LEFT JOIN item i ON i.id = ip.item_id
        WHERE ip.pedido_id = ?`, [req.params.id]),
  });
});

operacao.post('/pedidos', (req, res, next) => {
  try {
    const b = req.body;
    if (!b.itens?.length) return res.status(400).json({ erro: 'O pedido precisa ter ao menos um item.' });

    const resultado = tx(() => {
      const { id: pedidoId } = run(
        `INSERT INTO pedido (data_hora, tipo_atendimento, forma_pagamento, situacao, usuario_id)
         VALUES (COALESCE(?, datetime('now','localtime')), ?, ?, 'FECHADO', ?)`,
        [b.data_hora ?? null, b.tipo_atendimento, b.forma_pagamento, b.usuario_id]);

      for (const i of b.itens) {
        // Preço vigente do cardápio (RN10) — o informado só é usado como fallback
        const preco = i.item_id
          ? one<any>('SELECT valor FROM vw_preco_vigente WHERE item_id = ?', [i.item_id])
          : one<any>('SELECT valor FROM vw_preco_vigente WHERE produto_id = ? AND tamanho_id = ?',
            [i.produto_id, i.tamanho_id]);
        run(`INSERT INTO item_pedido (pedido_id, produto_id, tamanho_id, item_id, quantidade, preco_praticado)
             VALUES (?,?,?,?,?,?)`,
          [pedidoId, i.produto_id ?? null, i.tamanho_id ?? null, i.item_id ?? null,
            i.quantidade, preco?.valor ?? i.preco_praticado ?? 0]);
      }
      return pedidoId;
    });

    res.status(201).json(one(
      `SELECT p.*, (SELECT SUM(ip.quantidade * ip.preco_praticado)
                      FROM item_pedido ip WHERE ip.pedido_id = p.id) AS valor_total
         FROM pedido p WHERE p.id = ?`, [resultado]));
  } catch (e) { next(e); }
});

/* ================= FECHAMENTO DIÁRIO (RF10, RN07) ================= */

operacao.get('/fechamento/pendentes', (_req, res) => res.json(diasPendentes()));

operacao.get('/fechamento/previa', (req, res) => {
  const data = String(req.query.data ?? hojeLocal());
  res.json({
    data_ref: data,
    ja_fechado: jaFechado(data),
    linhas: previaFechamento(data),
    pedidos_em_aberto: pedidosEmAberto(data),
  });
});

operacao.post('/fechamento', (req, res, next) => {
  try {
    const { data_ref, usuario_id } = req.body;
    res.status(201).json(executarFechamento(data_ref, usuario_id));
  } catch (e) { next(e); }
});

operacao.get('/fechamento', (_req, res) =>
  res.json(all(
    `SELECT f.*, u.nome AS usuario FROM fechamento_diario f
       JOIN usuario u ON u.id = f.usuario_id ORDER BY f.data_ref DESC`)));
