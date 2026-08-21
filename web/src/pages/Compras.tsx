import { useState } from 'react';
import {
  api, brl, brlUn, dataBR, hoje, num,
  type Fornecedor, type GrupoCompra, type HistoricoCompra, type Item, type Nota, type Unidade,
} from '../api';
import { Campo, Estado, Mensagem, Painel, Tag, useApi } from '../components/ui';

interface LinhaNota {
  item_id: number | ''; quantidade: string; unidade_compra_id: number | '';
  fator_conversao: string; valor_unitario: string;
}

const LINHA_VAZIA: LinhaNota = {
  item_id: '', quantidade: '', unidade_compra_id: '', fator_conversao: '1', valor_unitario: '',
};

export default function Compras() {
  const compras = useApi<GrupoCompra[]>('/estoque/lista-compras');
  const notas = useApi<Nota[]>('/notas');
  const historico = useApi<HistoricoCompra[]>('/relatorios/historico-compras');
  const itens = useApi<Item[]>('/itens');
  const unidades = useApi<Unidade[]>('/unidades');
  const fornecedores = useApi<Fornecedor[]>('/fornecedores');

  const recarregarTudo = () => { compras.recarregar(); notas.recarregar(); historico.recarregar(); };

  return (
    <>
      <h2>Compras e reposição</h2>
      <p className="desc">
        Entrada de mercadoria pela nota fiscal, com conversão da unidade de compra para a
        unidade de controle (RN03) e geração automática do movimento de entrada (RF08).
      </p>

      <Painel titulo="Lista de compras sugerida" rn="RF12 — saldo ≤ mínimo, repor até o máximo">
        <Estado carregando={compras.carregando} erro={compras.erro} vazio={!compras.dados?.length}>
          {compras.dados?.map(g => (
            <div key={g.fornecedor} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ color: 'var(--vinho)' }}>{g.fornecedor}</strong>
                <span>Custo estimado: <strong>{brl(g.total)}</strong></span>
              </div>
              <table>
                <thead><tr><th>Item</th><th className="num">Saldo</th><th className="num">Mínimo</th>
                  <th className="num">Máximo</th><th className="num">Comprar</th><th className="num">Custo estimado</th></tr></thead>
                <tbody>
                  {g.itens.map(i => (
                    <tr key={i.item_id}>
                      <td>{i.nome}</td>
                      <td className="num">{num(i.saldo_atual)} {i.unidade}</td>
                      <td className="num">{num(i.estoque_minimo, 0)}</td>
                      <td className="num">{num(i.estoque_maximo, 0)}</td>
                      <td className="num"><strong>{num(i.qtd_sugerida)} {i.unidade}</strong></td>
                      <td className="num">{brl(i.custo_estimado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Estado>
      </Painel>

      <FormNota itens={itens.dados ?? []} unidades={unidades.dados ?? []}
        fornecedores={fornecedores.dados ?? []} aoSalvar={recarregarTudo} />

      <Painel titulo="Notas fiscais registradas" rn="RF07">
        <Estado carregando={notas.carregando} erro={notas.erro} vazio={!notas.dados?.length}>
          <table>
            <thead><tr><th>Nota</th><th>Fornecedor</th><th>Entrada</th>
              <th className="num">Itens</th><th className="num">Frete</th>
              <th className="num">Desconto</th><th className="num">Total</th></tr></thead>
            <tbody>
              {notas.dados?.map(n => (
                <tr key={n.nota_id}>
                  <td><code>{n.numero}/{n.serie}</code></td>
                  <td>{n.fornecedor}</td>
                  <td>{dataBR(n.data_entrada)}</td>
                  <td className="num">{brl(n.valor_itens)}</td>
                  <td className="num">{brl(n.valor_frete)}</td>
                  <td className="num">−{brl(n.valor_desconto)}</td>
                  <td className="num"><strong>{brl(n.valor_total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      <Painel titulo="Histórico de compras por item" rn="RF13 — variação do custo entre compras">
        <Estado carregando={historico.carregando} erro={historico.erro} vazio={!historico.dados?.length}>
          <table>
            <thead><tr><th>Item</th><th>Fornecedor</th><th>Nota</th><th>Entrada</th>
              <th className="num">Qtd.</th><th className="num">Valor unit.</th>
              <th className="num">Custo/un. controle</th><th className="num">Variação</th></tr></thead>
            <tbody>
              {historico.dados?.map((h, k) => (
                <tr key={k}>
                  <td>{h.item_nome}</td>
                  <td>{h.fornecedor}</td>
                  <td><code>{h.numero}</code></td>
                  <td>{dataBR(h.data_entrada)}</td>
                  <td className="num">{num(h.quantidade)} {h.unidade_compra}</td>
                  <td className="num">{brl(h.valor_unitario)}</td>
                  <td className="num">{brlUn(h.custo_un_padrao)}</td>
                  <td className="num">
                    {h.variacao_percentual == null ? <Tag tipo="neutro">1ª compra</Tag>
                      : <Tag tipo={h.variacao_percentual > 0 ? 'erro' : 'ok'}>
                        {h.variacao_percentual > 0 ? '▲' : '▼'} {num(Math.abs(h.variacao_percentual), 1)}%
                      </Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}

/** RF07/RF08 — nota fiscal de entrada. */
function FormNota({ itens, unidades, fornecedores, aoSalvar }:
{ itens: Item[]; unidades: Unidade[]; fornecedores: Fornecedor[]; aoSalvar: () => void }) {
  const [cab, setCab] = useState({
    numero: '', serie: '1', fornecedor_id: '' as number | '',
    data_emissao: hoje(), data_entrada: hoje(), valor_frete: '0', valor_desconto: '0',
  });
  const [linhas, setLinhas] = useState<LinhaNota[]>([{ ...LINHA_VAZIA }]);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const alterar = (i: number, campo: keyof LinhaNota, valor: string) =>
    setLinhas(l => l.map((x, k) => k === i ? { ...x, [campo]: campo === 'item_id' || campo === 'unidade_compra_id' ? Number(valor) : valor } : x));

  const totalItens = linhas.reduce((s, l) => s + (Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0), 0);
  const total = totalItens + Number(cab.valor_frete || 0) - Number(cab.valor_desconto || 0);

  const enviar = async () => {
    setErro(null); setOk(null);
    try {
      const r = await api.post<any>('/notas', {
        ...cab,
        valor_frete: Number(cab.valor_frete || 0),
        valor_desconto: Number(cab.valor_desconto || 0),
        usuario_id: 1,
        itens: linhas.filter(l => l.item_id && l.quantidade).map(l => ({
          item_id: Number(l.item_id),
          quantidade: Number(l.quantidade),
          unidade_compra_id: Number(l.unidade_compra_id),
          fator_conversao: Number(l.fator_conversao),
          valor_unitario: Number(l.valor_unitario),
        })),
      });
      setOk(`Nota ${r.numero}/${r.serie} registrada — ${brl(r.valor_total)}. Estoque atualizado por movimento de entrada.`);
      setCab({ ...cab, numero: '' });
      setLinhas([{ ...LINHA_VAZIA }]);
      aoSalvar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <Painel titulo="Registrar entrada por nota fiscal" rn="RF07 / RF08 / RN03">
      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />

      <div className="form" style={{ marginBottom: 16 }}>
        <Campo rotulo="Número"><input value={cab.numero} onChange={e => setCab({ ...cab, numero: e.target.value })} /></Campo>
        <Campo rotulo="Série"><input value={cab.serie} onChange={e => setCab({ ...cab, serie: e.target.value })} /></Campo>
        <Campo rotulo="Fornecedor">
          <select value={cab.fornecedor_id} onChange={e => setCab({ ...cab, fornecedor_id: Number(e.target.value) })}>
            <option value="">selecione…</option>
            {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome_fantasia ?? f.razao_social}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Emissão">
          <input type="date" value={cab.data_emissao} onChange={e => setCab({ ...cab, data_emissao: e.target.value })} /></Campo>
        <Campo rotulo="Entrada">
          <input type="date" value={cab.data_entrada} onChange={e => setCab({ ...cab, data_entrada: e.target.value })} /></Campo>
        <Campo rotulo="Frete">
          <input type="number" step="0.01" value={cab.valor_frete} onChange={e => setCab({ ...cab, valor_frete: e.target.value })} /></Campo>
        <Campo rotulo="Desconto">
          <input type="number" step="0.01" value={cab.valor_desconto} onChange={e => setCab({ ...cab, valor_desconto: e.target.value })} /></Campo>
      </div>

      <table>
        <thead><tr><th>Item</th><th className="num">Qtd. comprada</th><th>Unid. de compra</th>
          <th className="num">Fator p/ unid. controle</th><th className="num">Valor unitário</th>
          <th className="num">Subtotal</th><th></th></tr></thead>
        <tbody>
          {linhas.map((l, i) => {
            const item = itens.find(x => x.id === Number(l.item_id));
            const qtdPadrao = (Number(l.quantidade) || 0) * (Number(l.fator_conversao) || 0);
            return (
              <tr key={i}>
                <td style={{ minWidth: 190 }}>
                  <select value={l.item_id} onChange={e => alterar(i, 'item_id', e.target.value)}>
                    <option value="">selecione…</option>
                    {itens.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                  </select>
                </td>
                <td><input className="num" type="number" step="0.01" value={l.quantidade}
                  onChange={e => alterar(i, 'quantidade', e.target.value)} /></td>
                <td>
                  <select value={l.unidade_compra_id} onChange={e => alterar(i, 'unidade_compra_id', e.target.value)}>
                    <option value="">—</option>
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.sigla}</option>)}
                  </select>
                </td>
                <td>
                  <input className="num" type="number" step="0.001" value={l.fator_conversao}
                    onChange={e => alterar(i, 'fator_conversao', e.target.value)} />
                  {item && <div style={{ fontSize: 11, color: 'var(--suave)', marginTop: 2 }}>
                    = {num(qtdPadrao)} {item.unidade}</div>}
                </td>
                <td><input className="num" type="number" step="0.01" value={l.valor_unitario}
                  onChange={e => alterar(i, 'valor_unitario', e.target.value)} /></td>
                <td className="num">{brl((Number(l.quantidade) || 0) * (Number(l.valor_unitario) || 0))}</td>
                <td>
                  {linhas.length > 1 && (
                    <button className="acao secundario mini"
                      onClick={() => setLinhas(x => x.filter((_, k) => k !== i))}>remover</button>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="linha" style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <button className="acao secundario" onClick={() => setLinhas(l => [...l, { ...LINHA_VAZIA }])}>
          + adicionar item
        </button>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <span>Itens {brl(totalItens)} + frete − desconto = <strong>{brl(total)}</strong></span>
          <button className="acao" onClick={enviar}
            disabled={!cab.numero || !cab.fornecedor_id || !linhas.some(l => l.item_id && l.quantidade)}>
            Registrar nota e dar entrada
          </button>
        </div>
      </div>
    </Painel>
  );
}
