/** Cliente da API pública da loja. */

const BASE = '/api/loja';

async function req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(dados?.erro ?? `Não foi possível concluir (erro ${r.status}).`);
  return dados as T;
}

export const api = {
  get: <T>(c: string) => req<T>('GET', c),
  post: <T>(c: string, corpo: unknown) => req<T>('POST', c, corpo),
};

/* ----------------------------- Tipos ----------------------------- */

export interface ConfigLoja {
  nome: string; whatsapp: string; endereco: string;
  taxa_entrega: number; pedido_minimo: number;
  tempo_preparo_min: number; tempo_entrega_min: number;
  horario_funcionamento: string; aberta: boolean;
}

export interface TamanhoCardapio {
  tamanho_id: number; tamanho: string; numero_fatias: number;
  preco: number; disponivel: boolean; producao_possivel: number;
}

export interface Sabor {
  produto_id: number; produto: string; categoria: 'SALGADA' | 'DOCE';
  descricao: string | null; tamanhos: TamanhoCardapio[];
}

export interface BebidaCardapio {
  item_id: number; item_nome: string; preco: number; saldo: number; disponivel: number;
}

export interface Cardapio { sabores: Sabor[]; bebidas: BebidaCardapio[] }

export interface ItemAcompanhamento {
  descricao: string; quantidade: number; preco_praticado: number;
}

export interface Pedido {
  id: number; codigo: string; data_hora: string; cliente_nome: string; telefone: string;
  tipo_atendimento: 'DELIVERY' | 'BALCAO'; forma_pagamento: string;
  situacao: string; status_preparo: string;
  endereco_entrega: string | null; complemento: string | null; referencia: string | null;
  observacao: string | null; troco_para: number | null;
  taxa_entrega: number; subtotal: number; total: number;
  previsao_minutos: number; whatsapp_loja: string;
  itens: ItemAcompanhamento[];
  historico: { status: string; data_hora: string }[];
}

/* ----------------------- Carrinho (localStorage) ----------------------- */

export interface LinhaCarrinho {
  chave: string;                 // "p:produtoId:tamanhoId" ou "i:itemId"
  descricao: string;
  detalhe: string;
  preco: number;
  quantidade: number;
  produto_id?: number; tamanho_id?: number; item_id?: number;
}

const CHAVE_CARRINHO = 'jm.carrinho';
const CHAVE_PEDIDOS = 'jm.meus-pedidos';
const CHAVE_CLIENTE = 'jm.cliente';

export const carrinhoSalvo = (): LinhaCarrinho[] => ler(CHAVE_CARRINHO, []);
export const salvarCarrinho = (c: LinhaCarrinho[]) => gravar(CHAVE_CARRINHO, c);

export const meusPedidos = (): string[] => ler(CHAVE_PEDIDOS, []);
export const registrarPedido = (codigo: string) =>
  gravar(CHAVE_PEDIDOS, [codigo, ...meusPedidos().filter(c => c !== codigo)].slice(0, 10));

export interface DadosCliente {
  nome: string; telefone: string; endereco_entrega: string;
  complemento: string; referencia: string;
}
export const clienteSalvo = (): Partial<DadosCliente> => ler(CHAVE_CLIENTE, {});
export const salvarCliente = (d: Partial<DadosCliente>) => gravar(CHAVE_CLIENTE, d);

function ler<T>(chave: string, padrao: T): T {
  try { return JSON.parse(localStorage.getItem(chave) ?? '') as T; } catch { return padrao; }
}
function gravar(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado */ }
}

/* --------------------------- Formatação --------------------------- */

export const brl = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Máscara progressiva: (67) 98888-1234 */
export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const ETAPAS = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'SAIU_ENTREGA', 'ENTREGUE'] as const;

export const ROTULO_STATUS: Record<string, string> = {
  RECEBIDO: 'Pedido recebido',
  EM_PREPARO: 'No forno',
  PRONTO: 'Pronto',
  SAIU_ENTREGA: 'Saiu para entrega',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

export const hora = (iso: string) =>
  new Date(iso.replace(' ', 'T')).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
