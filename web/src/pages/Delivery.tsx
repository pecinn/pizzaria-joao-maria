import { useEffect, useState } from 'react';
import { api, brl, type PedidoDelivery, type ResumoDelivery } from '../api';
import { Campo, Card, Estado, Mensagem, Painel, Tag, useApi } from '../components/ui';

const FLUXO: Record<string, { rotulo: string; proximo?: string }> = {
  RECEBIDO: { rotulo: 'Recebido', proximo: 'EM_PREPARO' },
  EM_PREPARO: { rotulo: 'Em preparo', proximo: 'PRONTO' },
  PRONTO: { rotulo: 'Pronto', proximo: 'SAIU_ENTREGA' },
  SAIU_ENTREGA: { rotulo: 'Saiu para entrega', proximo: 'ENTREGUE' },
  ENTREGUE: { rotulo: 'Entregue' },
  CANCELADO: { rotulo: 'Cancelado' },
};

const ROTULO_PROXIMO: Record<string, string> = {
  EM_PREPARO: 'Aceitar e pôr no forno',
  PRONTO: 'Marcar como pronto',
  SAIU_ENTREGA: 'Saiu para entrega',
  ENTREGUE: 'Confirmar entrega',
};

export default function Delivery() {
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const pedidos = useApi<PedidoDelivery[]>(`/delivery/pedidos${status ? `?status=${status}` : ''}`, [status]);
  const resumo = useApi<ResumoDelivery>('/delivery/resumo');

  // O pedido do cliente precisa aparecer aqui sozinho: recarrega a cada 15s.
  useEffect(() => {
    const t = setInterval(() => { pedidos.recarregar(); resumo.recarregar(); }, 15000);
    return () => clearInterval(t);
  }, [pedidos.recarregar, resumo.recarregar]);

  const mudarStatus = async (p: PedidoDelivery, novo: string) => {
    setErro(null); setOk(null);
    try {
      const r = await api.post<{ whatsapp_cliente: string }>(
        `/delivery/pedidos/${p.id}/status`, { status: novo, usuario_id: 1 });
      setOk(`Pedido ${p.codigo}: ${FLUXO[novo].rotulo.toLowerCase()}. Avise o cliente pelo WhatsApp.`);
      pedidos.recarregar(); resumo.recarregar();
      window.open(r.whatsapp_cliente, '_blank', 'noopener');
    } catch (e: any) { setErro(e.message); }
  };

  const emAberto = resumo.dados?.em_aberto ?? 0;
  const porStatus = Object.fromEntries((resumo.dados?.por_status ?? []).map(s => [s.status, s.quantidade]));

  return (
    <>
      <h2>Delivery — pedidos do aplicativo</h2>
      <p className="desc">
        Pedidos feitos pelo cliente na loja online. Cada mudança de status abre o WhatsApp
        com a mensagem pronta. A tela se atualiza sozinha a cada 15 segundos.
      </p>

      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />

      <div className="cards">
        <Card rotulo="Em andamento" valor={emAberto} nota="pedidos ainda não entregues" />
        <Card rotulo="Recebidos hoje" valor={porStatus.RECEBIDO ?? 0} nota="aguardando aceite" />
        <Card rotulo="Em preparo" valor={(porStatus.EM_PREPARO ?? 0) + (porStatus.PRONTO ?? 0)} nota="no forno ou prontos" />
        <Card rotulo="Entregues hoje" valor={porStatus.ENTREGUE ?? 0} nota="viraram venda no fechamento" />
      </div>

      <div className="linha">
        <Campo rotulo="Filtrar por status">
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(FLUXO).map(([valor, f]) =>
              <option key={valor} value={valor}>{f.rotulo}</option>)}
          </select>
        </Campo>
        <button className="acao secundario" onClick={() => { pedidos.recarregar(); resumo.recarregar(); }}>
          atualizar agora
        </button>
      </div>

      <Estado carregando={pedidos.carregando} erro={pedidos.erro} vazio={!pedidos.dados?.length}>
        {pedidos.dados?.map(p => (
          <Painel key={p.id}
            titulo={`${p.codigo} · ${p.cliente_nome}`}
            rn={`${p.tipo_atendimento === 'DELIVERY' ? 'entrega' : 'retirada'} · ${p.minutos_espera} min desde o pedido`}
            acao={
              <Tag tipo={
                p.status_preparo === 'RECEBIDO' ? 'erro'
                  : p.status_preparo === 'ENTREGUE' ? 'ok'
                    : p.status_preparo === 'CANCELADO' ? 'neutro' : 'aviso'}>
                {FLUXO[p.status_preparo]?.rotulo ?? p.status_preparo}
              </Tag>}>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
              <div>
                <table>
                  <tbody>
                    {p.itens.map((i, k) => (
                      <tr key={k}>
                        <td>{i.quantidade}x {i.descricao}</td>
                        <td className="num">{brl(i.quantidade * i.preco_praticado)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ color: 'var(--suave)' }}>Taxa de entrega</td>
                      <td className="num" style={{ color: 'var(--suave)' }}>{brl(p.taxa_entrega)}</td>
                    </tr>
                    <tr>
                      <td><strong>Total · {p.forma_pagamento}</strong></td>
                      <td className="num"><strong>{brl(p.total)}</strong></td>
                    </tr>
                    {!!p.troco_para && (
                      <tr>
                        <td colSpan={2} style={{ color: 'var(--amarelo)' }}>
                          Levar troco para {brl(p.troco_para)} → {brl(p.troco_para - p.total)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 13 }}>
                <div><strong>Telefone:</strong> {formatarTelefone(p.telefone)}</div>
                {p.endereco_entrega && (
                  <div style={{ marginTop: 6 }}>
                    <strong>Entregar em:</strong> {p.endereco_entrega}
                    {p.complemento && <div>Complemento: {p.complemento}</div>}
                    {p.referencia && <div>Referência: {p.referencia}</div>}
                  </div>
                )}
                {p.observacao && (
                  <div style={{ marginTop: 6, color: 'var(--vinho)' }}>
                    <strong>Observação:</strong> {p.observacao}
                  </div>
                )}
                <div style={{ marginTop: 6, color: 'var(--suave)' }}>
                  Feito às {new Date(p.data_hora.replace(' ', 'T')).toLocaleTimeString('pt-BR',
                    { hour: '2-digit', minute: '2-digit' })}
                  {' · '}situação da venda: {p.situacao}
                </div>
              </div>
            </div>

            <div className="linha" style={{ marginTop: 14, marginBottom: 0 }}>
              {FLUXO[p.status_preparo]?.proximo && (
                <button className="acao" onClick={() => mudarStatus(p, FLUXO[p.status_preparo].proximo!)}>
                  {ROTULO_PROXIMO[FLUXO[p.status_preparo].proximo!]}
                </button>
              )}
              <a className="acao secundario" href={p.whatsapp_cliente} target="_blank" rel="noreferrer">
                Falar no WhatsApp
              </a>
              {!['ENTREGUE', 'CANCELADO'].includes(p.status_preparo) && (
                <button className="acao secundario" style={{ color: 'var(--vermelho)' }}
                  onClick={() => confirm(`Cancelar o pedido ${p.codigo}?`) && mudarStatus(p, 'CANCELADO')}>
                  Cancelar
                </button>
              )}
            </div>
          </Painel>
        ))}
      </Estado>

      <ConfiguracaoLoja />
    </>
  );
}

function ConfiguracaoLoja() {
  const cfg = useApi<Record<string, string>>('/delivery/configuracao');
  const [form, setForm] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => { if (cfg.dados) setForm(cfg.dados); }, [cfg.dados]);

  const salvar = async () => {
    await api.put('/delivery/configuracao', form);
    setOk('Configuração salva. A loja online já reflete os novos valores.');
    cfg.recarregar();
  };

  const campo = (chave: string, rotulo: string, tipo = 'text') => (
    <Campo rotulo={rotulo}>
      <input type={tipo} value={form[chave] ?? ''}
        onChange={e => setForm({ ...form, [chave]: e.target.value })} />
    </Campo>
  );

  return (
    <Painel titulo="Configuração da loja online" rn="o que o cliente vê na aplicação">
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />
      <Estado carregando={cfg.carregando} erro={cfg.erro}>
        <div className="form">
          {campo('loja_nome', 'Nome da loja')}
          {campo('loja_whatsapp', 'WhatsApp da pizzaria (DDI+DDD+número)')}
          {campo('loja_endereco', 'Endereço')}
          {campo('taxa_entrega', 'Taxa de entrega', 'number')}
          {campo('pedido_minimo', 'Pedido mínimo', 'number')}
          {campo('tempo_preparo_min', 'Tempo de preparo (min)', 'number')}
          {campo('tempo_entrega_min', 'Tempo de entrega (min)', 'number')}
          {campo('horario_funcionamento', 'Horário de funcionamento')}
          <Campo rotulo="Aceitando pedidos">
            <select value={form.loja_aberta ?? '1'}
              onChange={e => setForm({ ...form, loja_aberta: e.target.value })}>
              <option value="1">Sim — loja aberta</option>
              <option value="0">Não — loja fechada</option>
            </select>
          </Campo>
          <button className="acao" onClick={salvar}>Salvar configuração</button>
        </div>
      </Estado>
    </Painel>
  );
}

function formatarTelefone(t: string) {
  const d = String(t ?? '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
