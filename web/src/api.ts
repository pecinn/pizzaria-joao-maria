/** Cliente da API — todas as chamadas passam por aqui. */

const BASE = '/api';

async function req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(dados?.erro ?? `Erro ${r.status}`);
  return dados as T;
}

export const api = {
  get: <T>(c: string) => req<T>('GET', c),
  post: <T>(c: string, corpo: unknown) => req<T>('POST', c, corpo),
  put: <T>(c: string, corpo: unknown) => req<T>('PUT', c, corpo),
  del: <T>(c: string) => req<T>('DELETE', c),
};

/* ----------------------- Tipos do domínio ----------------------- */

export type TipoItem = 'INSUMO' | 'BEBIDA' | 'EMBALAGEM' | 'DESCARTAVEL';

export interface Unidade { id: number; sigla: string; descricao: string; tipo: string }
export interface Usuario { id: number; nome: string; login: string; perfil: string }

export interface Fornecedor {
  id: number; cnpj: string; razao_social: string; nome_fantasia: string | null;
  telefone: string | null; email: string | null; endereco: string | null;
  contato: string | null; ativo: number;
}

export interface Item {
  id: number; codigo: string; nome: string; tipo: TipoItem;
  unidade_padrao_id: number; unidade: string; perc_aproveitamento: number;
  estoque_minimo: number; estoque_maximo: number; vendavel: number; ativo: number;
}

export interface PosicaoEstoque {
  item_id: number; codigo: string; nome: string; tipo: TipoItem; unidade: string;
  perc_aproveitamento: number; quantidade_bruta: number; quantidade_liquida: number;
  custo_bruto_unitario: number; custo_real_unitario: number; valor_em_estoque: number;
  estoque_minimo: number; estoque_maximo: number; ultima_data_entrada: string | null;
  situacao_estoque: 'ABAIXO_MINIMO' | 'NORMAL' | 'ACIMA_MAXIMO';
}

export interface Movimento {
  id: number; item_id: number; codigo: string; item_nome: string; unidade: string;
  tipo: 'ENTRADA' | 'VENDA' | 'PERDA' | 'AJUSTE'; quantidade: number;
  data_hora: string; documento_origem: string | null; usuario: string; observacao: string | null;
}

export interface GrupoCompra {
  fornecedor: string; fornecedor_id: number | null; total: number;
  itens: { item_id: number; codigo: string; nome: string; unidade: string; saldo_atual: number;
    estoque_minimo: number; estoque_maximo: number; qtd_sugerida: number; custo_estimado: number }[];
}

export interface Nota {
  nota_id: number; numero: string; serie: string; fornecedor: string;
  data_emissao: string; data_entrada: string; valor_frete: number;
  valor_desconto: number; valor_itens: number; valor_total: number;
}

export interface Producao {
  produto_id: number; produto: string; categoria: string;
  tamanho_id: number; tamanho: string; qtd_maxima: number; ingrediente_limitante: string;
}

export interface CapacidadeIngrediente {
  item_id: number; item_nome: string; unidade: string; qtd_receita: number;
  quantidade_liquida: number; producao_possivel: number; custo_no_produto: number;
}

export interface CustoProduto {
  produto_id: number; produto: string; tamanho_id: number; tamanho: string;
  custo_producao: number; preco_venda: number | null;
  margem_valor: number | null; margem_percentual: number | null;
}

export interface Tamanho { id: number; descricao: string; numero_fatias: number }
export interface Produto { id: number; nome: string; categoria: 'SALGADA' | 'DOCE'; descricao: string | null }

export interface LinhaFicha {
  produto_id: number; tamanho_id: number; tamanho: string; item_id: number;
  codigo: string; item_nome: string; unidade: string; quantidade: number;
  custo_real_unitario: number; custo_no_produto: number;
}

export interface Cardapio {
  pizzas: { produto_id: number; produto: string; categoria: string;
    tamanho_id: number; tamanho: string; numero_fatias: number; preco: number | null }[];
  bebidas: { item_id: number; item_nome: string; preco: number | null }[];
}

export interface Pedido {
  id: number; data_hora: string; tipo_atendimento: string;
  forma_pagamento: string; situacao: string; usuario: string; valor_total: number;
}

export interface LinhaConsumo {
  item_id: number; codigo: string; item_nome: string; unidade: string;
  quantidade: number; saldo_atual: number;
  origem: 'FICHA_TECNICA' | 'VENDA_DIRETA'; suficiente: number;
}

export interface DiaPendente { data_ref: string; pedidos: number; faturamento: number }
export interface Fechamento { data_ref: string; data_hora_exec: string; usuario: string; qtd_movimentos: number }

export interface Dashboard {
  estoque: { itens: number; abaixo_minimo: number; valor_total: number };
  vendas_30_dias: { pedidos: number; faturamento: number };
  producao: { produto: string; tamanho: string; qtd_maxima: number; ingrediente_limitante: string }[];
  margens: { produto: string; tamanho: string; custo_producao: number; preco_venda: number; margem_percentual: number }[];
}

export interface Alertas {
  abaixo_minimo: { item_id: number; codigo: string; nome: string; unidade: string;
    quantidade_bruta: number; estoque_minimo: number; estoque_maximo: number }[];
  acima_maximo: { item_id: number; codigo: string; nome: string; unidade: string;
    quantidade_bruta: number; estoque_maximo: number }[];
  sem_movimento: { item_id: number; codigo: string; nome: string;
    ultimo_movimento: string | null; dias_parado: number }[];
  dias_referencia: number;
}

export interface CurvaABC {
  item_id: number; codigo: string; item_nome: string; unidade: string;
  qtd_consumida: number; custo_total: number;
  participacao: number; acumulado: number; classe: 'A' | 'B' | 'C';
}

export interface ConsumoVendas {
  curva_abc: CurvaABC[]; custo_total_consumo: number;
  ranking_sabores: { produto: string; tamanho: string; qtd_vendida: number; faturamento: number }[];
  bebidas: { item_nome: string; qtd_vendida: number; faturamento: number }[];
}

export interface HistoricoCompra {
  item_id: number; codigo: string; item_nome: string; numero: string; data_entrada: string;
  fornecedor: string; unidade_compra: string; quantidade: number; valor_unitario: number;
  valor_total: number; custo_un_padrao: number; variacao_percentual: number | null;
}

export interface VariacaoGastos {
  por_mes: { competencia: string; total_itens: number; frete: number; notas: number }[];
  por_fornecedor: { fornecedor: string; notas: number; total: number }[];
  por_item: { codigo: string; item_nome: string; total: number; menor_custo: number; maior_custo: number }[];
}

/* ----------------------- Formatação ----------------------- */

export const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const num = (v: number | null | undefined, casas = 2) =>
  (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });

/** Data de hoje no fuso local (toISOString devolve UTC e erra de madrugada). */
export const hoje = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** "2026-08-20" é uma data local, não UTC — sem o horário explícito o
 *  navegador assume UTC e exibe o dia anterior em fusos negativos. */
export const dataBR = (iso: string | null) => {
  if (!iso) return '—';
  const s = iso.replace(' ', 'T');
  return new Date(s.length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('pt-BR');
};

/** Custo unitário: itens medidos em g/ml custam frações de centavo, então
 *  valores pequenos ganham mais casas decimais em vez de virar "R$ 0,00". */
export const brlUn = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  if (n !== 0 && Math.abs(n) < 1)
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return brl(n);
};

/* ------------------- Delivery / loja online ------------------- */

export interface PedidoDelivery {
  id: number; codigo: string; data_hora: string;
  cliente_nome: string; telefone: string;
  tipo_atendimento: 'DELIVERY' | 'BALCAO'; forma_pagamento: string;
  situacao: string; status_preparo: string;
  endereco_entrega: string | null; complemento: string | null; referencia: string | null;
  observacao: string | null; troco_para: number | null;
  taxa_entrega: number; subtotal: number; total: number; minutos_espera: number;
  itens: { descricao: string; quantidade: number; preco_praticado: number }[];
  whatsapp_cliente: string;
}

export interface ResumoDelivery {
  em_aberto: number;
  por_status: { status: string; quantidade: number }[];
}

export interface PedidoEmAberto {
  id: number; codigo: string; status_preparo: string; cliente_nome: string | null;
}
