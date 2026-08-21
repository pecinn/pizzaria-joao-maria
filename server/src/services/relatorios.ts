import { all } from '../db';

/** RF13 — histórico de compras por item/fornecedor/período com variação % do preço. */
export function historicoCompras(f: { item_id?: number; fornecedor_id?: number; de?: string; ate?: string }) {
  const where: string[] = ['1=1'];
  const p: any[] = [];
  if (f.item_id) { where.push('inf.item_id = ?'); p.push(f.item_id); }
  if (f.fornecedor_id) { where.push('nf.fornecedor_id = ?'); p.push(f.fornecedor_id); }
  if (f.de) { where.push('date(nf.data_entrada) >= date(?)'); p.push(f.de); }
  if (f.ate) { where.push('date(nf.data_entrada) <= date(?)'); p.push(f.ate); }

  return all(
    `WITH compras AS (
       SELECT inf.item_id, i.codigo, i.nome AS item_nome,
              nf.id AS nota_id, nf.numero, nf.data_entrada,
              COALESCE(fo.nome_fantasia, fo.razao_social) AS fornecedor,
              um.sigla AS unidade_compra, inf.quantidade, inf.valor_unitario,
              inf.quantidade * inf.valor_unitario AS valor_total,
              inf.valor_unitario * 1.0 / inf.fator_conversao AS custo_un_padrao,
              LAG(inf.valor_unitario * 1.0 / inf.fator_conversao)
                OVER (PARTITION BY inf.item_id ORDER BY nf.data_entrada, nf.id) AS custo_anterior
         FROM item_nota_fiscal inf
         JOIN nota_fiscal_compra nf ON nf.id = inf.nota_id
         JOIN item i ON i.id = inf.item_id
         JOIN fornecedor fo ON fo.id = nf.fornecedor_id
         JOIN unidade_medida um ON um.id = inf.unidade_compra_id
        WHERE ${where.join(' AND ')}
     )
     SELECT *,
            CASE WHEN custo_anterior > 0
                 THEN (custo_un_padrao - custo_anterior) * 100.0 / custo_anterior END AS variacao_percentual
       FROM compras
      ORDER BY item_nome, data_entrada DESC`, p);
}

/** RF18 — variação de gastos por período, fornecedor e item. */
export function variacaoGastos(f: { de?: string; ate?: string }) {
  const p = [f.de ?? '1900-01-01', f.ate ?? '2999-12-31'];
  return {
    por_mes: all(
      `SELECT strftime('%Y-%m', nf.data_entrada) AS competencia,
              SUM(inf.quantidade * inf.valor_unitario) AS total_itens,
              SUM(DISTINCT nf.valor_frete) AS frete,
              COUNT(DISTINCT nf.id) AS notas
         FROM nota_fiscal_compra nf
         JOIN item_nota_fiscal inf ON inf.nota_id = nf.id
        WHERE date(nf.data_entrada) BETWEEN date(?) AND date(?)
        GROUP BY competencia ORDER BY competencia`, p),
    por_fornecedor: all(
      `SELECT COALESCE(fo.nome_fantasia, fo.razao_social) AS fornecedor,
              COUNT(DISTINCT nf.id) AS notas,
              SUM(inf.quantidade * inf.valor_unitario) AS total
         FROM nota_fiscal_compra nf
         JOIN item_nota_fiscal inf ON inf.nota_id = nf.id
         JOIN fornecedor fo ON fo.id = nf.fornecedor_id
        WHERE date(nf.data_entrada) BETWEEN date(?) AND date(?)
        GROUP BY fo.id ORDER BY total DESC`, p),
    por_item: all(
      `SELECT i.codigo, i.nome AS item_nome,
              SUM(inf.quantidade * inf.valor_unitario) AS total,
              MIN(inf.valor_unitario * 1.0 / inf.fator_conversao) AS menor_custo,
              MAX(inf.valor_unitario * 1.0 / inf.fator_conversao) AS maior_custo
         FROM item_nota_fiscal inf
         JOIN nota_fiscal_compra nf ON nf.id = inf.nota_id
         JOIN item i ON i.id = inf.item_id
        WHERE date(nf.data_entrada) BETWEEN date(?) AND date(?)
        GROUP BY i.id ORDER BY total DESC`, p),
  };
}

/** RF19 — consumo x vendas: curva ABC dos insumos e ranking de sabores. */
export function consumoVendas(f: { de?: string; ate?: string }) {
  const p = [f.de ?? '1900-01-01', f.ate ?? '2999-12-31'];

  const abc = all<any>(
    `WITH consumo AS (
       SELECT m.item_id, i.codigo, i.nome AS item_nome, u.sigla AS unidade,
              SUM(-m.quantidade) AS qtd_consumida,
              SUM(-m.quantidade * COALESCE(s.custo_unitario_atual, 0)) AS custo_total
         FROM movimento_estoque m
         JOIN item i ON i.id = m.item_id
         JOIN unidade_medida u ON u.id = i.unidade_padrao_id
         LEFT JOIN saldo_estoque s ON s.item_id = m.item_id
        WHERE m.tipo IN ('VENDA','PERDA')
          AND date(m.data_hora) BETWEEN date(?) AND date(?)
        GROUP BY m.item_id
     )
     SELECT * FROM consumo ORDER BY custo_total DESC`, p);

  const total = abc.reduce((s, r) => s + Number(r.custo_total || 0), 0);
  let acumulado = 0;
  const curva_abc = abc.map(r => {
    const part = total > 0 ? (Number(r.custo_total) / total) * 100 : 0;
    acumulado += part;
    return {
      ...r,
      participacao: part,
      acumulado,
      classe: acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C',
    };
  });

  const ranking_sabores = all(
    `SELECT p.nome AS produto, t.descricao AS tamanho,
            SUM(ip.quantidade) AS qtd_vendida,
            SUM(ip.quantidade * ip.preco_praticado) AS faturamento
       FROM item_pedido ip
       JOIN pedido pe ON pe.id = ip.pedido_id
       JOIN produto p ON p.id = ip.produto_id
       JOIN tamanho t ON t.id = ip.tamanho_id
      WHERE pe.situacao = 'FECHADO'
        AND date(pe.data_hora) BETWEEN date(?) AND date(?)
      GROUP BY p.id, t.id ORDER BY qtd_vendida DESC`, p);

  const bebidas = all(
    `SELECT i.nome AS item_nome, SUM(ip.quantidade) AS qtd_vendida,
            SUM(ip.quantidade * ip.preco_praticado) AS faturamento
       FROM item_pedido ip
       JOIN pedido pe ON pe.id = ip.pedido_id
       JOIN item i ON i.id = ip.item_id
      WHERE pe.situacao = 'FECHADO'
        AND date(pe.data_hora) BETWEEN date(?) AND date(?)
      GROUP BY i.id ORDER BY qtd_vendida DESC`, p);

  return { curva_abc, custo_total_consumo: total, ranking_sabores, bebidas };
}

/** RF20 — alertas de mínimo e de itens parados. */
export function alertas(diasSemMovimento = 30) {
  return {
    abaixo_minimo: all(
      `SELECT item_id, codigo, nome, unidade, quantidade_bruta, estoque_minimo, estoque_maximo
         FROM vw_posicao_estoque
        WHERE ativo = 1 AND situacao_estoque = 'ABAIXO_MINIMO'
        ORDER BY nome`),
    acima_maximo: all(
      `SELECT item_id, codigo, nome, unidade, quantidade_bruta, estoque_maximo
         FROM vw_posicao_estoque
        WHERE ativo = 1 AND situacao_estoque = 'ACIMA_MAXIMO'
        ORDER BY nome`),
    sem_movimento: all(
      `SELECT i.id AS item_id, i.codigo, i.nome,
              MAX(m.data_hora) AS ultimo_movimento,
              CAST(julianday('now') - julianday(COALESCE(MAX(m.data_hora), 'now')) AS INTEGER) AS dias_parado
         FROM item i
         LEFT JOIN movimento_estoque m ON m.item_id = i.id
        WHERE i.ativo = 1
        GROUP BY i.id
       HAVING MAX(m.data_hora) IS NULL
           OR julianday('now') - julianday(MAX(m.data_hora)) >= ?
        ORDER BY dias_parado DESC`, [diasSemMovimento]),
    dias_referencia: diasSemMovimento,
  };
}

/** Números do painel inicial. */
export function dashboard() {
  const [estoque] = all<any>(
    `SELECT COUNT(*) AS itens,
            SUM(CASE WHEN situacao_estoque = 'ABAIXO_MINIMO' THEN 1 ELSE 0 END) AS abaixo_minimo,
            SUM(valor_em_estoque) AS valor_total
       FROM vw_posicao_estoque WHERE ativo = 1`);
  const [vendas] = all<any>(
    `SELECT COUNT(DISTINCT p.id) AS pedidos,
            COALESCE(SUM(ip.quantidade * ip.preco_praticado), 0) AS faturamento
       FROM pedido p JOIN item_pedido ip ON ip.pedido_id = p.id
      WHERE p.situacao = 'FECHADO' AND date(p.data_hora) >= date('now','-30 days')`);
  return {
    estoque,
    vendas_30_dias: vendas,
    producao: all(
      `SELECT produto, tamanho, qtd_maxima, ingrediente_limitante
         FROM vw_producao_possivel ORDER BY qtd_maxima ASC LIMIT 5`),
    margens: all(
      `SELECT produto, tamanho, custo_producao, preco_venda, margem_percentual
         FROM vw_custo_produto WHERE preco_venda IS NOT NULL
        ORDER BY margem_percentual ASC LIMIT 5`),
  };
}
