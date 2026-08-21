import { db, all, one, run } from './index';

/**
 * Colunas acrescentadas ao PEDIDO para o canal de delivery.
 * O schema usa CREATE TABLE IF NOT EXISTS, então bancos já criados não
 * receberiam estas colunas — daí a migração explícita e idempotente.
 */
const COLUNAS_PEDIDO: [string, string][] = [
  ['cliente_id', 'INTEGER REFERENCES cliente(id)'],
  ['origem', "TEXT NOT NULL DEFAULT 'BALCAO'"],          // BALCAO | APP
  ['codigo', 'TEXT'],                                    // código público de acompanhamento
  ['status_preparo', "TEXT NOT NULL DEFAULT 'ENTREGUE'"],
  ['endereco_entrega', 'TEXT'],
  ['complemento', 'TEXT'],
  ['referencia', 'TEXT'],
  ['taxa_entrega', 'NUMERIC NOT NULL DEFAULT 0'],
  ['troco_para', 'NUMERIC'],
  ['observacao', 'TEXT'],
];

/** Situações do acompanhamento, na ordem em que acontecem. */
export const FLUXO_STATUS = [
  'RECEBIDO', 'EM_PREPARO', 'PRONTO', 'SAIU_ENTREGA', 'ENTREGUE',
] as const;
export type StatusPreparo = typeof FLUXO_STATUS[number] | 'CANCELADO';

export function migrar() {
  const existentes = new Set(
    all<{ name: string }>('PRAGMA table_info(pedido)').map(c => c.name));

  for (const [nome, definicao] of COLUNAS_PEDIDO)
    if (!existentes.has(nome))
      db.exec(`ALTER TABLE pedido ADD COLUMN ${nome} ${definicao}`);

  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_codigo ON pedido(codigo) WHERE codigo IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS ix_pedido_status ON pedido(status_preparo, data_hora)');

  semearConfiguracao();
}

/** Parâmetros da loja — editáveis pela gestão, lidos pela aplicação do cliente. */
const PADROES: [string, string, string][] = [
  ['loja_nome', 'Pizzaria João & Maria', 'Nome exibido na aplicação do cliente'],
  ['loja_whatsapp', '5567999990000', 'Número da pizzaria no WhatsApp (só dígitos, com DDI)'],
  ['loja_endereco', 'Rua das Palmeiras, 320 — Centro, Campo Grande/MS', 'Endereço da loja'],
  ['taxa_entrega', '8.00', 'Taxa de entrega do delivery'],
  ['pedido_minimo', '25.00', 'Valor mínimo para delivery'],
  ['tempo_preparo_min', '40', 'Tempo estimado de preparo, em minutos'],
  ['tempo_entrega_min', '20', 'Tempo estimado de entrega, em minutos'],
  ['horario_funcionamento', '18:00 às 23:30, de terça a domingo', 'Texto exibido ao cliente'],
  ['loja_aberta', '1', 'Aceita novos pedidos (1) ou está fechada (0)'],
];

function semearConfiguracao() {
  for (const [chave, valor, descricao] of PADROES)
    run(`INSERT INTO configuracao (chave, valor, descricao) VALUES (?,?,?)
         ON CONFLICT(chave) DO NOTHING`, [chave, valor, descricao]);
}

export function config(chave: string): string {
  return one<{ valor: string }>('SELECT valor FROM configuracao WHERE chave = ?', [chave])?.valor ?? '';
}

export function configNum(chave: string): number {
  return Number(config(chave)) || 0;
}

export function configTodas() {
  const linhas = all<{ chave: string; valor: string }>('SELECT chave, valor FROM configuracao');
  return Object.fromEntries(linhas.map(l => [l.chave, l.valor]));
}
