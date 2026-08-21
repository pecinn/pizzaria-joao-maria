import { useState } from 'react';
import { api, brl, brlUn, dataBR, num, type Item, type Movimento, type PosicaoEstoque } from '../api';
import { Campo, Estado, Mensagem, Painel, Tag, TagSituacao, useApi } from '../components/ui';

export default function Estoque() {
  const [tipo, setTipo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [busca, setBusca] = useState('');
  const [itemSel, setItemSel] = useState<number | ''>('');

  const q = new URLSearchParams();
  if (tipo) q.set('tipo', tipo);
  if (situacao) q.set('situacao', situacao);
  if (busca) q.set('busca', busca);

  const estoque = useApi<PosicaoEstoque[]>(`/estoque?${q}`);
  const itens = useApi<Item[]>('/itens');
  const movs = useApi<Movimento[]>(`/estoque/movimentos?limite=60${itemSel ? `&item_id=${itemSel}` : ''}`, [itemSel]);

  return (
    <>
      <h2>Posição de estoque</h2>
      <p className="desc">
        Quantidade e custo <strong>brutos</strong> (como comprado) e <strong>reais</strong>
        {' '}(descontado o aproveitamento) — RN05. O saldo só muda por movimento (RN06).
      </p>

      <div className="linha">
        <Campo rotulo="Tipo">
          <select value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="">Todos</option>
            <option value="INSUMO">Insumo</option>
            <option value="BEBIDA">Bebida</option>
            <option value="EMBALAGEM">Embalagem</option>
            <option value="DESCARTAVEL">Descartável</option>
          </select>
        </Campo>
        <Campo rotulo="Situação">
          <select value={situacao} onChange={e => setSituacao(e.target.value)}>
            <option value="">Todas</option>
            <option value="ABAIXO_MINIMO">Abaixo do mínimo</option>
            <option value="NORMAL">Normal</option>
            <option value="ACIMA_MAXIMO">Acima do máximo</option>
          </select>
        </Campo>
        <Campo rotulo="Buscar">
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="nome ou código" />
        </Campo>
      </div>

      <Painel titulo="Itens em estoque" rn="RF11">
        <Estado carregando={estoque.carregando} erro={estoque.erro} vazio={!estoque.dados?.length}>
          <table>
            <thead>
              <tr>
                <th>Código</th><th>Item</th><th>Tipo</th>
                <th className="num">Aprov.</th>
                <th className="num">Qtd. bruta</th><th className="num">Qtd. líquida</th>
                <th className="num">Custo bruto</th><th className="num">Custo real</th>
                <th className="num">Mín / Máx</th><th className="num">Últ. entrada</th><th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {estoque.dados?.map(i => (
                <tr key={i.item_id}>
                  <td><code>{i.codigo}</code></td>
                  <td>{i.nome}</td>
                  <td><Tag tipo="neutro">{i.tipo}</Tag></td>
                  <td className="num">{num(i.perc_aproveitamento, 0)}%</td>
                  <td className="num">{num(i.quantidade_bruta)} {i.unidade}</td>
                  <td className="num"><strong>{num(i.quantidade_liquida)} {i.unidade}</strong></td>
                  <td className="num">{brlUn(i.custo_bruto_unitario)}</td>
                  <td className="num"><strong>{brlUn(i.custo_real_unitario)}</strong></td>
                  <td className="num">{num(i.estoque_minimo, 0)} / {num(i.estoque_maximo, 0)}</td>
                  <td className="num">{dataBR(i.ultima_data_entrada)}</td>
                  <td><TagSituacao situacao={i.situacao_estoque} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      <FormMovimento itens={itens.dados ?? []} aoSalvar={() => { estoque.recarregar(); movs.recarregar(); }} />

      <Painel titulo="Extrato de movimentos" rn="RN06 — rastreabilidade"
        acao={
          <select value={itemSel} onChange={e => setItemSel(e.target.value ? Number(e.target.value) : '')}
            style={{ width: 240, fontWeight: 400, textTransform: 'none' }}>
            <option value="">Todos os itens</option>
            {itens.dados?.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
          </select>}>
        <Estado carregando={movs.carregando} erro={movs.erro} vazio={!movs.dados?.length}>
          <table>
            <thead><tr><th>Data</th><th>Item</th><th>Tipo</th><th className="num">Quantidade</th>
              <th>Documento</th><th>Usuário</th><th>Observação</th></tr></thead>
            <tbody>
              {movs.dados?.map(m => (
                <tr key={m.id}>
                  <td>{dataBR(m.data_hora)}</td>
                  <td>{m.item_nome}</td>
                  <td>
                    <Tag tipo={m.tipo === 'ENTRADA' ? 'ok' : m.tipo === 'PERDA' ? 'erro'
                      : m.tipo === 'AJUSTE' ? 'aviso' : 'neutro'}>{m.tipo}</Tag>
                  </td>
                  <td className="num" style={{ color: m.quantidade < 0 ? 'var(--vermelho)' : 'var(--verde)' }}>
                    {m.quantidade > 0 ? '+' : ''}{num(m.quantidade)} {m.unidade}
                  </td>
                  <td>{m.documento_origem ?? '—'}</td>
                  <td>{m.usuario}</td>
                  <td style={{ color: 'var(--suave)' }}>{m.observacao ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}

/** RF09 — perda, quebra ou ajuste de inventário (exige motivo, RN08). */
function FormMovimento({ itens, aoSalvar }: { itens: Item[]; aoSalvar: () => void }) {
  const [item_id, setItem] = useState<number | ''>('');
  const [tipo, setTipo] = useState<'PERDA' | 'AJUSTE'>('PERDA');
  const [quantidade, setQtd] = useState('');
  const [observacao, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null); setOk(null);
    try {
      await api.post('/estoque/movimentos', {
        item_id, tipo, quantidade: Number(quantidade), observacao, usuario_id: 1,
      });
      setOk(`${tipo === 'PERDA' ? 'Perda' : 'Ajuste'} registrado. Saldo recalculado pelo movimento.`);
      setQtd(''); setObs(''); aoSalvar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <Painel titulo="Registrar perda ou ajuste de inventário" rn="RF09 / RN08">
      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />
      <div className="form">
        <Campo rotulo="Item">
          <select value={item_id} onChange={e => setItem(Number(e.target.value))}>
            <option value="">selecione…</option>
            {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Tipo">
          <select value={tipo} onChange={e => setTipo(e.target.value as 'PERDA' | 'AJUSTE')}>
            <option value="PERDA">Perda / quebra</option>
            <option value="AJUSTE">Ajuste de inventário</option>
          </select>
        </Campo>
        <Campo rotulo={tipo === 'AJUSTE' ? 'Quantidade (+ ou −)' : 'Quantidade perdida'}>
          <input type="number" step="0.01" value={quantidade} onChange={e => setQtd(e.target.value)} />
        </Campo>
        <Campo rotulo="Motivo (obrigatório)">
          <input value={observacao} onChange={e => setObs(e.target.value)}
            placeholder="ex.: produto vencido na câmara fria" />
        </Campo>
        <button className="acao" onClick={enviar} disabled={!item_id || !quantidade || !observacao.trim()}>
          Registrar movimento
        </button>
      </div>
    </Painel>
  );
}
