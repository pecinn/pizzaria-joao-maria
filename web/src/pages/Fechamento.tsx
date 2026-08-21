import { useEffect, useState } from 'react';
import { api, brl, dataBR, hoje, num, type DiaPendente, type Fechamento, type LinhaConsumo, type PedidoEmAberto } from '../api';
import { Campo, Estado, Mensagem, Painel, Tag, useApi } from '../components/ui';

export default function FechamentoDiario() {
  const [data, setData] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const pendentes = useApi<DiaPendente[]>('/fechamento/pendentes');
  const historico = useApi<Fechamento[]>('/fechamento');
  const previa = useApi<{ data_ref: string; ja_fechado: boolean; linhas: LinhaConsumo[]; pedidos_em_aberto: PedidoEmAberto[] }>(
    data ? `/fechamento/previa?data=${data}` : null, [data]);

  // Abre já no dia pendente mais recente, que é o que o operador vai fechar.
  useEffect(() => {
    if (!data && pendentes.dados) setData(pendentes.dados.at(-1)?.data_ref ?? hoje());
  }, [pendentes.dados]);

  const executar = async () => {
    setErro(null); setOk(null);
    try {
      const r = await api.post<{ movimentos_gerados: number }>('/fechamento',
        { data_ref: data, usuario_id: 1 });
      setOk(`Dia ${dataBR(data)} fechado — ${r.movimentos_gerados} movimentos de baixa gerados.`);
      previa.recarregar(); pendentes.recarregar(); historico.recarregar();
    } catch (e: any) { setErro(e.message); }
  };

  const insuficiente = previa.dados?.linhas.some(l => !l.suficiente);

  return (
    <>
      <h2>Fechamento diário</h2>
      <p className="desc">
        Baixa do estoque ao final do expediente: insumos pela ficha técnica das pizzas vendidas
        e bebidas pela quantidade vendida (RN07). O saldo não pode ficar negativo (RN08).
      </p>

      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />

      <Painel titulo="Dias com venda ainda não fechados">
        <Estado carregando={pendentes.carregando} erro={pendentes.erro} vazio={!pendentes.dados?.length}>
          <table>
            <thead><tr><th>Data</th><th className="num">Pedidos</th>
              <th className="num">Faturamento</th><th></th></tr></thead>
            <tbody>
              {pendentes.dados?.map(d => (
                <tr key={d.data_ref}>
                  <td>{dataBR(d.data_ref)}</td>
                  <td className="num">{d.pedidos}</td>
                  <td className="num">{brl(d.faturamento)}</td>
                  <td>
                    <button className="acao secundario mini" onClick={() => setData(d.data_ref)}>
                      analisar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      <Painel titulo="Prévia do consumo" rn="RF10 — nada é gravado até confirmar"
        acao={
          <Campo rotulo="">
            <input type="date" value={data} onChange={e => setData(e.target.value)} style={{ width: 160 }} />
          </Campo>}>
        {previa.dados?.ja_fechado && (
          <Mensagem tipo="info" texto={`O dia ${dataBR(data)} já foi fechado. Correções só por ajuste de inventário.`} />
        )}
        {!!previa.dados?.pedidos_em_aberto.length && (
          <Mensagem tipo="info"
            texto={'Atenção: ' + previa.dados.pedidos_em_aberto.length + ' pedido(s) do app ainda em andamento (' 
              + previa.dados.pedidos_em_aberto.map(p => p.codigo + ' — ' + p.status_preparo.toLowerCase()).join(', ')
              + '). Eles só entram na baixa depois de marcados como entregues.'} />
        )}
        {insuficiente && (
          <Mensagem tipo="erro"
            texto="RN08: há itens com saldo insuficiente. Registre um ajuste de inventário justificado antes de fechar." />
        )}
        <Estado carregando={previa.carregando} erro={previa.erro} vazio={!previa.dados?.linhas.length}>
          <table>
            <thead><tr><th>Item</th><th>Origem da baixa</th><th className="num">A baixar</th>
              <th className="num">Saldo atual</th><th className="num">Saldo após</th><th></th></tr></thead>
            <tbody>
              {previa.dados?.linhas.map(l => (
                <tr key={l.item_id}>
                  <td>{l.item_nome}</td>
                  <td>
                    <Tag tipo={l.origem === 'FICHA_TECNICA' ? 'neutro' : 'aviso'}>
                      {l.origem === 'FICHA_TECNICA' ? 'ficha técnica' : 'venda direta'}
                    </Tag>
                  </td>
                  <td className="num">−{num(l.quantidade)} {l.unidade}</td>
                  <td className="num">{num(l.saldo_atual)} {l.unidade}</td>
                  <td className="num"><strong>{num(l.saldo_atual - l.quantidade)} {l.unidade}</strong></td>
                  <td>{l.suficiente ? <Tag tipo="ok">ok</Tag> : <Tag tipo="erro">insuficiente</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 14, textAlign: 'right' }}>
            <button className="acao" onClick={executar}
              disabled={previa.dados?.ja_fechado || insuficiente || !previa.dados?.linhas.length}>
              Confirmar fechamento de {dataBR(data)}
            </button>
          </div>
        </Estado>
      </Painel>

      <Painel titulo="Fechamentos executados">
        <Estado carregando={historico.carregando} erro={historico.erro} vazio={!historico.dados?.length}>
          <table>
            <thead><tr><th>Dia de referência</th><th>Executado em</th>
              <th>Responsável</th><th className="num">Movimentos</th></tr></thead>
            <tbody>
              {historico.dados?.map(f => (
                <tr key={f.data_ref}>
                  <td>{dataBR(f.data_ref)}</td>
                  <td>{new Date(f.data_hora_exec.replace(' ', 'T')).toLocaleString('pt-BR')}</td>
                  <td>{f.usuario}</td>
                  <td className="num">{f.qtd_movimentos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}
