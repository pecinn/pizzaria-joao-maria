import { config } from '../db/migrate';

/**
 * Integração por link wa.me (click-to-chat): não exige token, número
 * verificado nem custo por mensagem. O servidor monta o texto; quem dispara
 * é o navegador do cliente ou do atendente, no WhatsApp já instalado.
 */

/** Deixa só dígitos e garante o DDI 55 do Brasil. */
export function normalizarTelefone(telefone: string): string {
  const digitos = String(telefone ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55') && digitos.length >= 12) return digitos;
  return '55' + digitos;
}

export function telefoneValido(telefone: string): boolean {
  // 55 + DDD (2) + número (8 ou 9 dígitos)
  return /^55\d{10,11}$/.test(normalizarTelefone(telefone));
}

export function linkWhatsApp(telefone: string, texto: string): string {
  return `https://wa.me/${normalizarTelefone(telefone)}?text=${encodeURIComponent(texto)}`;
}

const brl = (v: number) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ResumoPedido {
  codigo: string;
  cliente_nome: string;
  tipo_atendimento: string;
  forma_pagamento: string;
  endereco_entrega?: string | null;
  complemento?: string | null;
  referencia?: string | null;
  observacao?: string | null;
  troco_para?: number | null;
  taxa_entrega: number;
  subtotal: number;
  total: number;
  itens: { descricao: string; quantidade: number; preco_praticado: number }[];
}

/** Texto que o CLIENTE envia à pizzaria ao confirmar o pedido. */
export function textoPedidoParaLoja(p: ResumoPedido): string {
  const linhas = [
    `*Novo pedido ${p.codigo}*`,
    `Cliente: ${p.cliente_nome}`,
    '',
    '*Itens*',
    ...p.itens.map(i => `• ${i.quantidade}x ${i.descricao} — ${brl(i.quantidade * i.preco_praticado)}`),
    '',
    `Subtotal: ${brl(p.subtotal)}`,
  ];

  if (p.tipo_atendimento === 'DELIVERY') {
    linhas.push(`Taxa de entrega: ${brl(p.taxa_entrega)}`);
    linhas.push('', '*Entrega*', p.endereco_entrega ?? '');
    if (p.complemento) linhas.push(`Complemento: ${p.complemento}`);
    if (p.referencia) linhas.push(`Referência: ${p.referencia}`);
  } else {
    linhas.push('', '*Retirada no balcão*');
  }

  linhas.push('', `*Total: ${brl(p.total)}*`, `Pagamento: ${rotulo(p.forma_pagamento)}`);
  if (p.forma_pagamento === 'DINHEIRO' && p.troco_para)
    linhas.push(`Troco para ${brl(p.troco_para)} (levar ${brl(p.troco_para - p.total)})`);
  if (p.observacao) linhas.push('', `Observação: ${p.observacao}`);

  return linhas.filter(l => l !== undefined).join('\n');
}

const MENSAGENS: Record<string, (p: { codigo: string; nome: string; minutos: number }) => string> = {
  RECEBIDO: p => `Olá, ${p.nome}! Recebemos seu pedido ${p.codigo} 🍕 Já estamos conferindo tudo.`,
  EM_PREPARO: p => `${p.nome}, seu pedido ${p.codigo} entrou no forno! Previsão de ${p.minutos} minutos.`,
  PRONTO: p => `Pedido ${p.codigo} pronto, ${p.nome}! Já vai sair para entrega.`,
  SAIU_ENTREGA: p => `${p.nome}, seu pedido ${p.codigo} saiu para entrega 🛵 Chega em alguns minutos.`,
  ENTREGUE: p => `Pedido ${p.codigo} entregue! Obrigado pela preferência, ${p.nome} 😊`,
  CANCELADO: p => `${p.nome}, infelizmente precisamos cancelar o pedido ${p.codigo}. Podemos ajudar?`,
};

/** Texto que a LOJA envia ao cliente quando o status muda. */
export function textoStatusParaCliente(
  status: string, dados: { codigo: string; nome: string },
): string {
  const minutos = Number(config('tempo_preparo_min')) || 40;
  const montar = MENSAGENS[status] ?? MENSAGENS.RECEBIDO;
  return montar({ ...dados, minutos });
}

function rotulo(forma: string) {
  const mapa: Record<string, string> = {
    DINHEIRO: 'Dinheiro', DEBITO: 'Cartão de débito',
    CREDITO: 'Cartão de crédito', PIX: 'PIX',
  };
  return mapa[forma] ?? forma;
}
