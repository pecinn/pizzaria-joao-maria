import { Router } from 'express';
import { all, one, run } from '../db';
import { hojeLocal } from '../util';

export const cadastros = Router();

/* ---------------- Unidades de medida (RF03) ---------------- */
cadastros.get('/unidades', (_req, res) =>
  res.json(all('SELECT * FROM unidade_medida ORDER BY tipo, sigla')));

cadastros.post('/unidades', (req, res) => {
  const { sigla, descricao, tipo } = req.body;
  const { id } = run('INSERT INTO unidade_medida (sigla, descricao, tipo) VALUES (?,?,?)',
    [sigla, descricao, tipo]);
  res.status(201).json(one('SELECT * FROM unidade_medida WHERE id = ?', [id]));
});

/* ---------------- Usuários ---------------- */
cadastros.get('/usuarios', (_req, res) =>
  res.json(all('SELECT * FROM usuario WHERE ativo = 1 ORDER BY nome')));

/* ---------------- Fornecedores (RF01, RN14) ---------------- */
cadastros.get('/fornecedores', (req, res) => {
  const inativos = req.query.incluir_inativos === 'true';
  res.json(all(`SELECT * FROM fornecedor ${inativos ? '' : 'WHERE ativo = 1'} ORDER BY razao_social`));
});

cadastros.post('/fornecedores', (req, res) => {
  const { cnpj, razao_social, nome_fantasia, telefone, email, endereco, contato } = req.body;
  if (!cnpj || !razao_social)
    return res.status(400).json({ erro: 'CNPJ e razão social são obrigatórios (RF01).' });
  const { id } = run(
    `INSERT INTO fornecedor (cnpj, razao_social, nome_fantasia, telefone, email, endereco, contato)
     VALUES (?,?,?,?,?,?,?)`,
    [cnpj, razao_social, nome_fantasia ?? null, telefone ?? null, email ?? null, endereco ?? null, contato ?? null]);
  res.status(201).json(one('SELECT * FROM fornecedor WHERE id = ?', [id]));
});

cadastros.put('/fornecedores/:id', (req, res) => {
  const { razao_social, nome_fantasia, telefone, email, endereco, contato } = req.body;
  run(`UPDATE fornecedor SET razao_social=?, nome_fantasia=?, telefone=?, email=?, endereco=?, contato=?
       WHERE id=?`,
    [razao_social, nome_fantasia ?? null, telefone ?? null, email ?? null, endereco ?? null, contato ?? null, req.params.id]);
  res.json(one('SELECT * FROM fornecedor WHERE id = ?', [req.params.id]));
});

// RN14: inativa, não exclui
cadastros.delete('/fornecedores/:id', (req, res) => {
  run('UPDATE fornecedor SET ativo = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true, mensagem: 'RN14: fornecedor inativado, histórico preservado.' });
});

/* ---------------- Itens (RF02, RN01, RN04) ---------------- */
cadastros.get('/itens', (req, res) => {
  const where = req.query.incluir_inativos === 'true' ? '1=1' : 'i.ativo = 1';
  const tipo = req.query.tipo ? ' AND i.tipo = ?' : '';
  res.json(all(
    `SELECT i.*, u.sigla AS unidade
       FROM item i JOIN unidade_medida u ON u.id = i.unidade_padrao_id
      WHERE ${where}${tipo} ORDER BY i.tipo, i.nome`,
    req.query.tipo ? [req.query.tipo] : []));
});

cadastros.post('/itens', (req, res) => {
  const b = req.body;
  const aproveitamento = b.tipo === 'INSUMO' ? Number(b.perc_aproveitamento ?? 100) : 100;
  if (aproveitamento <= 0 || aproveitamento > 100)
    return res.status(400).json({ erro: 'RN04: aproveitamento deve estar entre 0% (exclusive) e 100%.' });
  const { id } = run(
    `INSERT INTO item (codigo, nome, tipo, unidade_padrao_id, perc_aproveitamento,
                       estoque_minimo, estoque_maximo, vendavel)
     VALUES (?,?,?,?,?,?,?,?)`,
    [b.codigo, b.nome, b.tipo, b.unidade_padrao_id, aproveitamento,
      b.estoque_minimo ?? 0, b.estoque_maximo ?? 0, b.vendavel ? 1 : 0]);
  res.status(201).json(one('SELECT * FROM item WHERE id = ?', [id]));
});

cadastros.put('/itens/:id', (req, res) => {
  const b = req.body;
  run(`UPDATE item SET nome=?, perc_aproveitamento=?, estoque_minimo=?, estoque_maximo=?, vendavel=?
       WHERE id=?`,
    [b.nome, b.perc_aproveitamento, b.estoque_minimo, b.estoque_maximo, b.vendavel ? 1 : 0, req.params.id]);
  res.json(one('SELECT * FROM item WHERE id = ?', [req.params.id]));
});

cadastros.delete('/itens/:id', (req, res) => {
  run('UPDATE item SET ativo = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true, mensagem: 'RN14: item inativado, histórico preservado.' });
});

/* ---------------- Item x Fornecedor (RN12) ---------------- */
cadastros.get('/itens/:id/fornecedores', (req, res) =>
  res.json(all(
    `SELECT itf.*, COALESCE(f.nome_fantasia, f.razao_social) AS fornecedor, u.sigla AS unidade_compra
       FROM item_fornecedor itf
       JOIN fornecedor f ON f.id = itf.fornecedor_id
       JOIN unidade_medida u ON u.id = itf.unidade_compra_id
      WHERE itf.item_id = ?`, [req.params.id])));

cadastros.post('/itens/:id/fornecedores', (req, res) => {
  const b = req.body;
  run(`INSERT INTO item_fornecedor
         (item_id, fornecedor_id, codigo_no_fornecedor, unidade_compra_id, fator_conversao, prazo_entrega_dias)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(item_id, fornecedor_id) DO UPDATE SET
         codigo_no_fornecedor=excluded.codigo_no_fornecedor,
         unidade_compra_id=excluded.unidade_compra_id,
         fator_conversao=excluded.fator_conversao,
         prazo_entrega_dias=excluded.prazo_entrega_dias`,
    [req.params.id, b.fornecedor_id, b.codigo_no_fornecedor ?? null,
      b.unidade_compra_id, b.fator_conversao, b.prazo_entrega_dias ?? 0]);
  res.status(201).json({ ok: true });
});

/* ---------------- Tamanhos e sabores (RF04) ---------------- */
cadastros.get('/tamanhos', (_req, res) =>
  res.json(all('SELECT * FROM tamanho WHERE ativo = 1 ORDER BY numero_fatias')));

cadastros.post('/tamanhos', (req, res) => {
  const { id } = run('INSERT INTO tamanho (descricao, numero_fatias) VALUES (?,?)',
    [req.body.descricao, req.body.numero_fatias]);
  res.status(201).json(one('SELECT * FROM tamanho WHERE id = ?', [id]));
});

cadastros.get('/produtos', (_req, res) =>
  res.json(all('SELECT * FROM produto WHERE ativo = 1 ORDER BY categoria, nome')));

cadastros.post('/produtos', (req, res) => {
  const { nome, categoria, descricao } = req.body;
  const { id } = run('INSERT INTO produto (nome, categoria, descricao) VALUES (?,?,?)',
    [nome, categoria, descricao ?? null]);
  res.status(201).json(one('SELECT * FROM produto WHERE id = ?', [id]));
});

cadastros.delete('/produtos/:id', (req, res) => {
  run('UPDATE produto SET ativo = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true, mensagem: 'RN14: sabor inativado.' });
});

/* ---------------- Ficha técnica (RF05, RN09) ---------------- */
cadastros.get('/produtos/:id/ficha', (req, res) =>
  res.json(all(
    `SELECT ft.produto_id, ft.tamanho_id, t.descricao AS tamanho, ft.item_id,
            i.codigo, i.nome AS item_nome, u.sigla AS unidade, ft.quantidade,
            pe.custo_real_unitario, ft.quantidade * pe.custo_real_unitario AS custo_no_produto
       FROM ficha_tecnica ft
       JOIN tamanho t ON t.id = ft.tamanho_id
       JOIN item i ON i.id = ft.item_id
       JOIN unidade_medida u ON u.id = i.unidade_padrao_id
       JOIN vw_posicao_estoque pe ON pe.item_id = ft.item_id
      WHERE ft.produto_id = ?
      ORDER BY t.numero_fatias, i.nome`, [req.params.id])));

cadastros.post('/produtos/:id/ficha', (req, res) => {
  const { tamanho_id, item_id, quantidade } = req.body;
  if (!(Number(quantidade) > 0))
    return res.status(400).json({ erro: 'A quantidade da ficha técnica deve ser maior que zero.' });
  run(`INSERT INTO ficha_tecnica (produto_id, tamanho_id, item_id, quantidade) VALUES (?,?,?,?)
       ON CONFLICT(produto_id, tamanho_id, item_id) DO UPDATE SET quantidade = excluded.quantidade`,
    [req.params.id, tamanho_id, item_id, quantidade]);
  res.status(201).json({ ok: true });
});

cadastros.delete('/produtos/:id/ficha/:tamanhoId/:itemId', (req, res) => {
  run('DELETE FROM ficha_tecnica WHERE produto_id=? AND tamanho_id=? AND item_id=?',
    [req.params.id, req.params.tamanhoId, req.params.itemId]);
  res.json({ ok: true });
});

/* ---------------- Preços com vigência (RF06, RN10) ---------------- */
cadastros.get('/precos', (_req, res) =>
  res.json(all(
    `SELECT pv.*, p.nome AS produto, t.descricao AS tamanho, i.nome AS item_nome,
            CASE WHEN date(pv.data_inicio) <= date('now','localtime')
                  AND (pv.data_fim IS NULL OR date(pv.data_fim) >= date('now','localtime'))
                 THEN 1 ELSE 0 END AS vigente
       FROM preco_venda pv
       LEFT JOIN produto p ON p.id = pv.produto_id
       LEFT JOIN tamanho t ON t.id = pv.tamanho_id
       LEFT JOIN item i ON i.id = pv.item_id
      ORDER BY COALESCE(p.nome, i.nome), pv.data_inicio DESC`)));

// RN10: a alteração encerra a vigência anterior, nunca sobrescreve
cadastros.post('/precos', (req, res) => {
  const { produto_id, tamanho_id, item_id, valor, data_inicio } = req.body;
  const inicio = data_inicio ?? hojeLocal();
  if (item_id) {
    run(`UPDATE preco_venda SET data_fim = date(?, '-1 day')
          WHERE item_id = ? AND data_fim IS NULL`, [inicio, item_id]);
    run(`INSERT INTO preco_venda (item_id, valor, data_inicio) VALUES (?,?,?)`, [item_id, valor, inicio]);
  } else {
    run(`UPDATE preco_venda SET data_fim = date(?, '-1 day')
          WHERE produto_id = ? AND tamanho_id = ? AND data_fim IS NULL`, [inicio, produto_id, tamanho_id]);
    run(`INSERT INTO preco_venda (produto_id, tamanho_id, valor, data_inicio) VALUES (?,?,?,?)`,
      [produto_id, tamanho_id, valor, inicio]);
  }
  res.status(201).json({ ok: true, mensagem: 'RN10: preço anterior encerrado, histórico preservado.' });
});

/* ---------------- Cardápio (produtos + bebidas vendáveis) ---------------- */
cadastros.get('/cardapio', (_req, res) => {
  res.json({
    pizzas: all(
      `SELECT p.id AS produto_id, p.nome AS produto, p.categoria,
              t.id AS tamanho_id, t.descricao AS tamanho, t.numero_fatias, pv.valor AS preco
         FROM produto p
         CROSS JOIN tamanho t
         LEFT JOIN vw_preco_vigente pv ON pv.produto_id = p.id AND pv.tamanho_id = t.id
        WHERE p.ativo = 1 AND t.ativo = 1
        ORDER BY p.categoria, p.nome, t.numero_fatias`),
    bebidas: all(
      `SELECT i.id AS item_id, i.nome AS item_nome, pv.valor AS preco
         FROM item i
         LEFT JOIN vw_preco_vigente pv ON pv.item_id = i.id
        WHERE i.ativo = 1 AND i.vendavel = 1 ORDER BY i.nome`),
  });
});
