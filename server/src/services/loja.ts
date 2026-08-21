import { all, one, run, tx } from '../db';
import { config, configNum, configTodas, FLUXO_STATUS, type StatusPreparo } from '../db/migrate';
import { RegraNegocioError } from './estoque';
import {
  linkWhatsApp, normalizarTelefone, telefoneValido,
  textoPedidoParaLoja, textoStatusParaCliente, type ResumoPedido,
} from './whatsapp';

/* ===================== CARDÁPIO PÚBLICO ===================== */

/**
 * Só entra no cardápio o que tem preço vigente (RN10). A disponibilidade vem
 * do estoque real: um sabor cuja produção possível é zero aparece esgotado,
 * usando a mesma regra do ingrediente limitante (RN13).
 */
export function cardapioPublico() {
  const pizzas = all<any>(
    `SELECT p.id AS produto_id, p.nome AS produto, p.categoria, p.descricao,
            t.id AS tamanho_id, t.descricao AS tamanho, t.numero_fatias,
            pv.valor AS preco,
            COALESCE(pp.qtd_maxima, 0) AS disponivel
       FROM produto p
       JOIN tamanho t ON t.ativo = 1
       JOIN vw_preco_vigente pv ON pv.produto_id = p.id AND pv.tamanho_id = t.id
       LEFT JOIN vw_producao_possivel pp ON pp.produto_id = p.id AND pp.tamanho_id = t.id
      WHERE p.ativo = 1
      ORDER BY p.categoria, p.nome, t.numero_fatias`);

  // Agrupa por sabor: o cliente escolhe o sabor e depois o tamanho.
  const sabores = new Map<number, any>();
  for (const linha of pizzas) {
    if (!sabores.has(linha.produto_id))
      sabores.set(linha.produto_id, {
        produto_id: linha.produto_id, produto: linha.produto,
        categoria: linha.categoria, descricao: linha.descricao, tamanhos: [],
      });
    sabores.get(linha.produto_id).tamanhos.push({
      tamanho_id: linha.tamanho_id, tamanho: linha.tamanho,
      numero_fatias: linha.numero_fatias, preco: linha.preco,
      disponivel: linha.disponivel > 0, producao_possivel: linha.disponivel,
    });
  }

  const bebidas = all(
    `SELECT i.id AS item_id, i.nome AS item_nome, pv.valor AS preco,
            COALESCE(s.quantidade_atual, 0) AS saldo,
            CASE WHEN COALESCE(s.quantidade_atual, 0) > 0 THEN 1 ELSE 0 END AS disponivel
       FROM item i
       JOIN vw_preco_vigente pv ON pv.item_id = i.id
       LEFT JOIN saldo_estoque s ON s.item_id = i.id
      WHERE i.ativo = 1 AND i.vendavel = 1
      ORDER BY i.nome`);

  return { sabores: [...sabores.values()], bebidas };
}

export function configuracaoLoja() {
  const c = configTodas();
  return {
    nome: c.loja_nome,
    whatsapp: c.loja_whatsapp,
    endereco: c.loja_endereco,
    taxa_entrega: Number(c.taxa_entrega),
    pedido_minimo: Number(c.pedido_minimo),
    tempo_preparo_min: Number(c.tempo_preparo_min),
    tempo_entrega_min: Number(c.tempo_entrega_min),
    horario_funcionamento: c.horario_funcionamento,
    aberta: c.loja_aberta === '1',
  };
}

/* ===================== PEDIDO DO CLIENTE ===================== */

export interface ItemPedidoInput {
  produto_id?: number; tamanho_id?: number; item_id?: number; quantidade: number;
}

export interface PedidoLojaInput {
  cliente_nome: string;
  telefone: string;
  tipo_atendimento: 'DELIVERY' | 'BALCAO';
  forma_pagamento: 'DINHEIRO' | 'DEBITO' | 'CREDITO' | 'PIX';
  endereco_entrega?: string;
  complemento?: string;
  referencia?: string;
  observacao?: string;
  troco_para?: number;
  itens: ItemPedidoInput[];
}

function gerarCodigo(): string {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const codigo = 'JM-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    if (!one('SELECT 1 FROM pedido WHERE codigo = ?', [codigo])) return codigo;
  }
  throw new RegraNegocioError('Não foi possível gerar o código do pedido. Tente novamente.');
}

/** Busca o preço vigente e valida a disponibilidade de cada linha do pedido. */
function precificar(i: ItemPedidoInput) {
  if (!(Number(i.quantidade) > 0))
    throw new RegraNegocioError('Quantidade inválida no pedido.');

  if (i.item_id) {
    const bebida = one<any>(
      `SELECT i.nome, pv.valor, COALESCE(s.quantidade_atual, 0) AS saldo
         FROM item i
         JOIN vw_preco_vigente pv ON pv.item_id = i.id
         LEFT JOIN saldo_estoque s ON s.item_id = i.id
        WHERE i.id = ? AND i.ativo = 1 AND i.vendavel = 1`, [i.item_id]);
    if (!bebida) throw new RegraNegocioError('Item indisponível no cardápio.');
    if (bebida.saldo < i.quantidade)
      throw new RegraNegocioError(`Temos apenas ${bebida.saldo} un de ${bebida.nome} em estoque.`);
    return { descricao: bebida.nome, preco: Number(bebida.valor) };
  }

  const pizza = one<any>(
    `SELECT p.nome AS produto, t.descricao AS tamanho, pv.valor,
            COALESCE(pp.qtd_maxima, 0) AS disponivel
       FROM produto p
       JOIN tamanho t ON t.id = ?
       JOIN vw_preco_vigente pv ON pv.produto_id = p.id AND pv.tamanho_id = t.id
       LEFT JOIN vw_producao_possivel pp ON pp.produto_id = p.id AND pp.tamanho_id = t.id
      WHERE p.id = ? AND p.ativo = 1`, [i.tamanho_id, i.produto_id]);
  if (!pizza) throw new RegraNegocioError('Sabor ou tamanho indisponível no cardápio.');
  if (pizza.disponivel < i.quantidade)
    throw new RegraNegocioError(
      `Não temos ingredientes para ${i.quantidade}x ${pizza.produto} ${pizza.tamanho} agora.`);
  return { descricao: `${pizza.produto} ${pizza.tamanho}`, preco: Number(pizza.valor) };
}

export function criarPedidoLoja(entrada: PedidoLojaInput) {
  if (config('loja_aberta') !== '1')
    throw new RegraNegocioError('A loja está fechada no momento. ' + config('horario_funcionamento'));
  if (!entrada.cliente_nome?.trim())
    throw new RegraNegocioError('Informe seu nome.');
  if (!telefoneValido(entrada.telefone))
    throw new RegraNegocioError('Telefone inválido. Use DDD + número, ex.: (67) 99999-0000.');
  if (!entrada.itens?.length)
    throw new RegraNegocioError('Seu carrinho está vazio.');

  const entrega = entrada.tipo_atendimento === 'DELIVERY';
  if (entrega && !entrada.endereco_entrega?.trim())
    throw new RegraNegocioError('Informe o endereço de entrega.');

  // Preço e disponibilidade sempre do servidor — nunca do que o cliente enviou.
  const linhas = entrada.itens.map(i => ({ ...i, ...precificar(i) }));
  const subtotal = linhas.reduce((s, l) => s + l.preco * l.quantidade, 0);

  const minimo = configNum('pedido_minimo');
  if (entrega && subtotal < minimo)
    throw new RegraNegocioError(
      `O pedido mínimo para entrega é R$ ${minimo.toFixed(2)}. Faltam R$ ${(minimo - subtotal).toFixed(2)}.`);

  const taxa = entrega ? configNum('taxa_entrega') : 0;
  const total = subtotal + taxa;

  if (entrada.forma_pagamento === 'DINHEIRO' && entrada.troco_para && entrada.troco_para < total)
    throw new RegraNegocioError('O valor do troco é menor que o total do pedido.');

  const telefone = normalizarTelefone(entrada.telefone);
  const codigo = gerarCodigo();

  tx(() => {
    // Cliente identificado pelo telefone; o nome mais recente prevalece.
    run(`INSERT INTO cliente (nome, telefone) VALUES (?,?)
         ON CONFLICT(telefone) DO UPDATE SET nome = excluded.nome`,
      [entrada.cliente_nome.trim(), telefone]);
    const cliente = one<{ id: number }>('SELECT id FROM cliente WHERE telefone = ?', [telefone])!;

    // Nasce ABERTO: só vira venda (FECHADO) quando for entregue, para que um
    // pedido cancelado nunca baixe estoque no fechamento diário (RN07).
    const { id } = run(
      `INSERT INTO pedido
         (tipo_atendimento, forma_pagamento, situacao, usuario_id, cliente_id, origem, codigo,
          status_preparo, endereco_entrega, complemento, referencia, taxa_entrega, troco_para, observacao)
       VALUES (?,?, 'ABERTO', 1, ?, 'APP', ?, 'RECEBIDO', ?,?,?,?,?,?)`,
      [entrada.tipo_atendimento, entrada.forma_pagamento, cliente.id, codigo,
        entrega ? entrada.endereco_entrega!.trim() : null,
        entrada.complemento ?? null, entrada.referencia ?? null,
        taxa, entrada.troco_para ?? null, entrada.observacao ?? null]);

    for (const l of linhas)
      run(`INSERT INTO item_pedido (pedido_id, produto_id, tamanho_id, item_id, quantidade, preco_praticado)
           VALUES (?,?,?,?,?,?)`,
        [id, l.produto_id ?? null, l.tamanho_id ?? null, l.item_id ?? null, l.quantidade, l.preco]);

    run(`INSERT INTO pedido_status_historico (pedido_id, status) VALUES (?, 'RECEBIDO')`, [id]);
    return id;
  });

  return acompanhar(codigo)!;
}

/* ===================== ACOMPANHAMENTO ===================== */

export function acompanhar(codigo: string) {
  const p = one<any>(
    `SELECT p.id, p.codigo, p.data_hora, p.tipo_atendimento, p.forma_pagamento, p.situacao,
            p.status_preparo, p.endereco_entrega, p.complemento, p.referencia,
            p.taxa_entrega, p.troco_para, p.observacao,
            c.nome AS cliente_nome, c.telefone,
            (SELECT COALESCE(SUM(ip.quantidade * ip.preco_praticado), 0)
               FROM item_pedido ip WHERE ip.pedido_id = p.id) AS subtotal
       FROM pedido p
       LEFT JOIN cliente c ON c.id = p.cliente_id
      WHERE p.codigo = ?`, [codigo]);
  if (!p) return null;

  const itens = all<any>(
    `SELECT ip.quantidade, ip.preco_praticado,
            COALESCE(pr.nome || ' ' || t.descricao, i.nome) AS descricao
       FROM item_pedido ip
       LEFT JOIN produto pr ON pr.id = ip.produto_id
       LEFT JOIN tamanho t ON t.id = ip.tamanho_id
       LEFT JOIN item i ON i.id = ip.item_id
      WHERE ip.pedido_id = ?`, [p.id]);

  const historico = all(
    `SELECT status, data_hora FROM pedido_status_historico
      WHERE pedido_id = ? ORDER BY id`, [p.id]);

  const resumo: ResumoPedido = {
    codigo: p.codigo, cliente_nome: p.cliente_nome, tipo_atendimento: p.tipo_atendimento,
    forma_pagamento: p.forma_pagamento, endereco_entrega: p.endereco_entrega,
    complemento: p.complemento, referencia: p.referencia, observacao: p.observacao,
    troco_para: p.troco_para, taxa_entrega: Number(p.taxa_entrega),
    subtotal: Number(p.subtotal), total: Number(p.subtotal) + Number(p.taxa_entrega), itens,
  };

  return {
    ...p,
    itens,
    historico,
    total: resumo.total,
    previsao_minutos: configNum('tempo_preparo_min')
      + (p.tipo_atendimento === 'DELIVERY' ? configNum('tempo_entrega_min') : 0),
    // Link para o cliente mandar o pedido à pizzaria pelo WhatsApp
    whatsapp_loja: linkWhatsApp(config('loja_whatsapp'), textoPedidoParaLoja(resumo)),
  };
}

/* ===================== GESTÃO DOS PEDIDOS ===================== */

export function painelPedidos(filtro?: { status?: string; data?: string }) {
  const where: string[] = ["p.origem = 'APP'"];
  const params: any[] = [];
  if (filtro?.status) { where.push('p.status_preparo = ?'); params.push(filtro.status); }
  if (filtro?.data) { where.push('date(p.data_hora) = date(?)'); params.push(filtro.data); }

  const pedidos = all<any>(
    `SELECT p.id, p.codigo, p.data_hora, p.tipo_atendimento, p.forma_pagamento,
            p.situacao, p.status_preparo, p.endereco_entrega, p.complemento, p.referencia,
            p.taxa_entrega, p.troco_para, p.observacao,
            c.nome AS cliente_nome, c.telefone,
            (SELECT COALESCE(SUM(ip.quantidade * ip.preco_praticado), 0)
               FROM item_pedido ip WHERE ip.pedido_id = p.id) AS subtotal,
            CAST((julianday('now','localtime') - julianday(p.data_hora)) * 1440 AS INTEGER) AS minutos_espera
       FROM pedido p
       LEFT JOIN cliente c ON c.id = p.cliente_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.data_hora DESC
      LIMIT 100`, params);

  return pedidos.map(p => ({
    ...p,
    total: Number(p.subtotal) + Number(p.taxa_entrega),
    itens: all(
      `SELECT ip.quantidade, ip.preco_praticado,
              COALESCE(pr.nome || ' ' || t.descricao, i.nome) AS descricao
         FROM item_pedido ip
         LEFT JOIN produto pr ON pr.id = ip.produto_id
         LEFT JOIN tamanho t ON t.id = ip.tamanho_id
         LEFT JOIN item i ON i.id = ip.item_id
        WHERE ip.pedido_id = ?`, [p.id]),
    whatsapp_cliente: linkWhatsApp(p.telefone,
      textoStatusParaCliente(p.status_preparo, { codigo: p.codigo, nome: primeiroNome(p.cliente_nome) })),
  }));
}

export function alterarStatus(pedidoId: number, status: StatusPreparo, usuarioId: number) {
  const p = one<any>(
    `SELECT p.id, p.codigo, p.status_preparo, c.nome AS cliente_nome, c.telefone
       FROM pedido p LEFT JOIN cliente c ON c.id = p.cliente_id
      WHERE p.id = ?`, [pedidoId]);
  if (!p) throw new RegraNegocioError('Pedido não encontrado.');
  if (p.status_preparo === 'ENTREGUE' || p.status_preparo === 'CANCELADO')
    throw new RegraNegocioError(`Pedido já está ${p.status_preparo.toLowerCase()} e não muda mais de status.`);
  if (status !== 'CANCELADO' && !FLUXO_STATUS.includes(status as any))
    throw new RegraNegocioError('Status inválido.');

  tx(() => {
    // ENTREGUE confirma a venda; CANCELADO a descarta. Só pedidos FECHADOS
    // entram no fechamento diário e baixam estoque (RN07).
    const situacao = status === 'ENTREGUE' ? 'FECHADO'
      : status === 'CANCELADO' ? 'CANCELADO' : 'ABERTO';
    run('UPDATE pedido SET status_preparo = ?, situacao = ? WHERE id = ?', [status, situacao, pedidoId]);
    run('INSERT INTO pedido_status_historico (pedido_id, status, usuario_id) VALUES (?,?,?)',
      [pedidoId, status, usuarioId]);
  });

  return {
    ok: true,
    status,
    // Mensagem pronta para o atendente avisar o cliente
    whatsapp_cliente: linkWhatsApp(p.telefone,
      textoStatusParaCliente(status, { codigo: p.codigo, nome: primeiroNome(p.cliente_nome) })),
  };
}

/** Quantos pedidos ainda estão em aberto — usado pelo badge da gestão. */
export function contarEmAberto() {
  return one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pedido
      WHERE origem = 'APP' AND status_preparo NOT IN ('ENTREGUE','CANCELADO')`)?.n ?? 0;
}

function primeiroNome(nome: string) {
  return String(nome ?? '').trim().split(/\s+/)[0] || 'cliente';
}
