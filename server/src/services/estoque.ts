import { all, one, run, tx } from '../db';

export class RegraNegocioError extends Error {
  constructor(msg: string) { super(msg); this.name = 'RegraNegocioError'; }
}

export interface ItemNotaInput {
  item_id: number;
  quantidade: number;          // na unidade de compra
  unidade_compra_id: number;
  fator_conversao: number;     // un. compra -> un. padrão (RN03)
  valor_unitario: number;      // por unidade de compra
}

export interface NotaInput {
  numero: string;
  serie?: string;
  fornecedor_id: number;
  data_emissao: string;
  data_entrada: string;
  valor_frete?: number;
  valor_desconto?: number;
  usuario_id: number;
  itens: ItemNotaInput[];
}

/**
 * RF07/RF08 — registra a nota fiscal e gera, para cada item, um MOVIMENTO de
 * entrada já convertido para a unidade padrão. O saldo é atualizado pelo
 * trigger, nunca por UPDATE direto (RN06).
 */
export function registrarNota(nf: NotaInput) {
  if (!nf.itens?.length) throw new RegraNegocioError('RN11: a nota precisa ter ao menos um item.');

  return tx(() => {
    const { id: notaId } = run(
      `INSERT INTO nota_fiscal_compra
         (numero, serie, fornecedor_id, data_emissao, data_entrada, valor_frete, valor_desconto, usuario_id)
       VALUES (?,?,?,?,?,?,?,?)`,
      [nf.numero, nf.serie ?? '1', nf.fornecedor_id, nf.data_emissao, nf.data_entrada,
        nf.valor_frete ?? 0, nf.valor_desconto ?? 0, nf.usuario_id]);

    for (const i of nf.itens) {
      if (i.fator_conversao <= 0) throw new RegraNegocioError('RN03: fator de conversão inválido.');
      run(`INSERT INTO item_nota_fiscal
             (nota_id, item_id, quantidade, unidade_compra_id, fator_conversao, valor_unitario)
           VALUES (?,?,?,?,?,?)`,
        [notaId, i.item_id, i.quantidade, i.unidade_compra_id, i.fator_conversao, i.valor_unitario]);

      run(`INSERT INTO movimento_estoque
             (item_id, tipo, quantidade, custo_unitario, data_hora, documento_origem, usuario_id, observacao)
           VALUES (?, 'ENTRADA', ?, ?, ?, ?, ?, 'Entrada por nota fiscal')`,
        [i.item_id, i.quantidade * i.fator_conversao, i.valor_unitario / i.fator_conversao,
          nf.data_entrada, `NF ${nf.numero}/${nf.serie ?? '1'}`, nf.usuario_id]);
    }

    return one(`SELECT * FROM vw_nota_fiscal_total WHERE nota_id = ?`, [notaId]);
  });
}

/**
 * RF09 — perda, quebra ou ajuste de inventário.
 * PERDA sempre reduz; AJUSTE aceita valor positivo ou negativo e exige motivo (RN08).
 */
export function registrarMovimento(input: {
  item_id: number; tipo: 'PERDA' | 'AJUSTE'; quantidade: number;
  usuario_id: number; observacao?: string; documento_origem?: string;
}) {
  const { item_id, tipo, usuario_id } = input;
  let quantidade = Number(input.quantidade);

  if (!quantidade) throw new RegraNegocioError('Quantidade não pode ser zero.');
  if (tipo === 'PERDA') quantidade = -Math.abs(quantidade);
  if (!input.observacao?.trim())
    throw new RegraNegocioError('RN08/RF09: informe o motivo do movimento (auditoria).');

  try {
    const { id } = run(
      `INSERT INTO movimento_estoque
         (item_id, tipo, quantidade, documento_origem, usuario_id, observacao)
       VALUES (?,?,?,?,?,?)`,
      [item_id, tipo, quantidade, input.documento_origem ?? null, usuario_id, input.observacao]);
    return one('SELECT * FROM movimento_estoque WHERE id = ?', [id]);
  } catch (err: any) {
    if (String(err?.message).includes('RN08'))
      throw new RegraNegocioError(
        'RN08: o saldo ficaria negativo. Faça um ajuste de inventário justificado antes desta baixa.');
    throw err;
  }
}

/** RF11 — posição do estoque. */
export function posicaoEstoque(filtro?: { tipo?: string; situacao?: string; busca?: string }) {
  const where: string[] = ['ativo = 1'];
  const p: any[] = [];
  if (filtro?.tipo) { where.push('tipo = ?'); p.push(filtro.tipo); }
  if (filtro?.situacao) { where.push('situacao_estoque = ?'); p.push(filtro.situacao); }
  if (filtro?.busca) { where.push('(nome LIKE ? OR codigo LIKE ?)'); p.push(`%${filtro.busca}%`, `%${filtro.busca}%`); }
  return all(`SELECT * FROM vw_posicao_estoque WHERE ${where.join(' AND ')} ORDER BY tipo, nome`, p);
}

/** RF12 — lista de compras agrupada por fornecedor. */
export function listaCompras() {
  const linhas = all<any>('SELECT * FROM vw_lista_compras ORDER BY fornecedor, nome');
  const grupos = new Map<string, { fornecedor: string; fornecedor_id: number | null; itens: any[]; total: number }>();
  for (const l of linhas) {
    const chave = l.fornecedor ?? 'SEM FORNECEDOR';
    if (!grupos.has(chave))
      grupos.set(chave, { fornecedor: chave, fornecedor_id: l.fornecedor_id ?? null, itens: [], total: 0 });
    const g = grupos.get(chave)!;
    g.itens.push(l);
    g.total += Number(l.custo_estimado ?? 0);
  }
  return [...grupos.values()];
}

/** Extrato de movimentos — rastreabilidade exigida pela RN06. */
export function movimentos(filtro: { item_id?: number; de?: string; ate?: string; tipo?: string; limite?: number }) {
  const where: string[] = ['1=1'];
  const p: any[] = [];
  if (filtro.item_id) { where.push('m.item_id = ?'); p.push(filtro.item_id); }
  if (filtro.tipo) { where.push('m.tipo = ?'); p.push(filtro.tipo); }
  if (filtro.de) { where.push('date(m.data_hora) >= date(?)'); p.push(filtro.de); }
  if (filtro.ate) { where.push('date(m.data_hora) <= date(?)'); p.push(filtro.ate); }
  return all(
    `SELECT m.*, i.codigo, i.nome AS item_nome, u.sigla AS unidade, us.nome AS usuario
       FROM movimento_estoque m
       JOIN item i ON i.id = m.item_id
       JOIN unidade_medida u ON u.id = i.unidade_padrao_id
       JOIN usuario us ON us.id = m.usuario_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.data_hora DESC, m.id DESC
      LIMIT ?`, [...p, filtro.limite ?? 200]);
}
