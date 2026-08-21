import { all, one, run, tx } from '../db';
import { RegraNegocioError } from './estoque';

/**
 * RN07 / RF10 — Fechamento diário.
 * Insumos: consumo calculado explodindo a ficha técnica das pizzas vendidas.
 * Bebidas e demais itens vendáveis: baixa pela quantidade vendida.
 */

export interface LinhaConsumo {
  item_id: number;
  codigo: string;
  item_nome: string;
  unidade: string;
  quantidade: number;      // total a baixar na unidade padrão
  saldo_atual: number;
  origem: 'FICHA_TECNICA' | 'VENDA_DIRETA';
  suficiente: boolean;
}

/** Consumo do dia, sem gravar nada — usado na prévia e pelo próprio fechamento. */
export function previaFechamento(dataRef: string): LinhaConsumo[] {
  return all<LinhaConsumo>(
    `WITH consumo AS (
       -- pizzas: quantidade vendida x quantidade da ficha técnica (RN09)
       SELECT ft.item_id, SUM(ip.quantidade * ft.quantidade) AS quantidade, 'FICHA_TECNICA' AS origem
         FROM item_pedido ip
         JOIN pedido p ON p.id = ip.pedido_id
         JOIN ficha_tecnica ft ON ft.produto_id = ip.produto_id AND ft.tamanho_id = ip.tamanho_id
        WHERE date(p.data_hora) = date(?) AND p.situacao = 'FECHADO' AND ip.produto_id IS NOT NULL
        GROUP BY ft.item_id
       UNION ALL
       -- bebidas e demais itens vendáveis (RN02)
       SELECT ip.item_id, SUM(ip.quantidade) AS quantidade, 'VENDA_DIRETA' AS origem
         FROM item_pedido ip
         JOIN pedido p ON p.id = ip.pedido_id
        WHERE date(p.data_hora) = date(?) AND p.situacao = 'FECHADO' AND ip.item_id IS NOT NULL
        GROUP BY ip.item_id
     )
     SELECT c.item_id, pe.codigo, pe.nome AS item_nome, pe.unidade,
            SUM(c.quantidade) AS quantidade,
            pe.quantidade_bruta AS saldo_atual,
            MIN(c.origem) AS origem,
            CASE WHEN pe.quantidade_bruta >= SUM(c.quantidade) THEN 1 ELSE 0 END AS suficiente
       FROM consumo c
       JOIN vw_posicao_estoque pe ON pe.item_id = c.item_id
      GROUP BY c.item_id
      ORDER BY pe.nome`, [dataRef, dataRef]);
}

export function jaFechado(dataRef: string) {
  return !!one('SELECT 1 FROM fechamento_diario WHERE data_ref = date(?)', [dataRef]);
}

export function executarFechamento(dataRef: string, usuarioId: number) {
  if (jaFechado(dataRef))
    throw new RegraNegocioError(`O dia ${dataRef} já foi fechado. Corrija por ajuste de inventário.`);

  const linhas = previaFechamento(dataRef);
  if (!linhas.length)
    throw new RegraNegocioError(`Nenhuma venda registrada em ${dataRef}.`);

  const insuficientes = linhas.filter(l => !l.suficiente);
  if (insuficientes.length)
    throw new RegraNegocioError(
      `RN08: saldo insuficiente para ${insuficientes.map(i => i.item_nome).join(', ')}. ` +
      `Registre um ajuste de inventário justificado antes de fechar o dia.`);

  return tx(() => {
    for (const l of linhas) {
      run(`INSERT INTO movimento_estoque
             (item_id, tipo, quantidade, data_hora, documento_origem, usuario_id, observacao)
           VALUES (?, 'VENDA', ?, datetime(? || ' 23:59:00'), ?, ?, ?)`,
        [l.item_id, -Math.abs(l.quantidade), dataRef, `FECHAMENTO ${dataRef}`, usuarioId,
          l.origem === 'FICHA_TECNICA' ? 'Baixa por ficha técnica' : 'Baixa por venda direta']);
    }
    run(`INSERT INTO fechamento_diario (data_ref, usuario_id, qtd_movimentos)
         VALUES (date(?), ?, ?)`, [dataRef, usuarioId, linhas.length]);
    return { data_ref: dataRef, movimentos_gerados: linhas.length, linhas };
  });
}

/** Dias com venda ainda não fechados — o que o operador precisa ver na tela. */
export function diasPendentes() {
  return all(
    `SELECT date(p.data_hora) AS data_ref,
            COUNT(DISTINCT p.id) AS pedidos,
            SUM(ip.quantidade * ip.preco_praticado) AS faturamento
       FROM pedido p
       JOIN item_pedido ip ON ip.pedido_id = p.id
      WHERE p.situacao = 'FECHADO'
        AND date(p.data_hora) NOT IN (SELECT data_ref FROM fechamento_diario)
      GROUP BY date(p.data_hora)
      ORDER BY data_ref`);
}

/**
 * Pedidos do app ainda não concluídos no dia. Eles não entram na baixa
 * (só contam vendas FECHADAS), então o operador precisa ser avisado antes
 * de fechar o dia — senão o consumo desses pedidos ficaria sem registro.
 */
export function pedidosEmAberto(dataRef: string) {
  return all(
    `SELECT p.id, p.codigo, p.status_preparo, c.nome AS cliente_nome
       FROM pedido p LEFT JOIN cliente c ON c.id = p.cliente_id
      WHERE date(p.data_hora) = date(?)
        AND p.situacao = 'ABERTO'
      ORDER BY p.data_hora`, [dataRef]);
}
