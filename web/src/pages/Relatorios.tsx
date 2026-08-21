import { useState } from 'react';
import { brl, dataBR, num, type Alertas, type ConsumoVendas, type VariacaoGastos } from '../api';
import { Campo, Estado, Painel, Tag, useApi } from '../components/ui';

export default function Relatorios() {
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const q = new URLSearchParams();
  if (de) q.set('de', de);
  if (ate) q.set('ate', ate);

  const cv = useApi<ConsumoVendas>(`/relatorios/consumo-vendas?${q}`, [de, ate]);
  const vg = useApi<VariacaoGastos>(`/relatorios/variacao-gastos?${q}`, [de, ate]);
  const al = useApi<Alertas>('/relatorios/alertas');

  return (
    <>
      <h2>Relatórios gerenciais</h2>
      <p className="desc">Curva ABC dos insumos, evolução dos custos de compra e alertas de estoque.</p>

      <div className="linha">
        <Campo rotulo="De"><input type="date" value={de} onChange={e => setDe(e.target.value)} /></Campo>
        <Campo rotulo="Até"><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></Campo>
        <button className="acao secundario" onClick={() => { setDe(''); setAte(''); }}>limpar período</button>
      </div>

      <Painel titulo="Curva ABC dos insumos" rn="RF19 — participação no custo de consumo">
        <Estado carregando={cv.carregando} erro={cv.erro} vazio={!cv.dados?.curva_abc.length}>
          <p style={{ color: 'var(--suave)', fontSize: 12, marginTop: 0 }}>
            Custo total consumido no período: <strong>{brl(cv.dados?.custo_total_consumo)}</strong>
          </p>
          <table>
            <thead><tr><th>Classe</th><th>Item</th><th className="num">Qtd. consumida</th>
              <th className="num">Custo</th><th className="num">Participação</th>
              <th style={{ width: 140 }}></th><th className="num">Acumulado</th></tr></thead>
            <tbody>
              {cv.dados?.curva_abc.map(c => (
                <tr key={c.item_id}>
                  <td><Tag tipo={c.classe === 'A' ? 'erro' : c.classe === 'B' ? 'aviso' : 'neutro'}>{c.classe}</Tag></td>
                  <td>{c.item_nome}</td>
                  <td className="num">{num(c.qtd_consumida)} {c.unidade}</td>
                  <td className="num">{brl(c.custo_total)}</td>
                  <td className="num">{num(c.participacao, 1)}%</td>
                  <td><div className="barra"><span style={{ width: `${c.participacao}%` }} /></div></td>
                  <td className="num">{num(c.acumulado, 1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px,1fr))', gap: 20 }}>
        <Painel titulo="Ranking de sabores" rn="RF19">
          <Estado carregando={cv.carregando} erro={cv.erro} vazio={!cv.dados?.ranking_sabores.length}>
            <table>
              <thead><tr><th>Sabor</th><th>Tamanho</th><th className="num">Qtd.</th>
                <th className="num">Faturamento</th></tr></thead>
              <tbody>
                {cv.dados?.ranking_sabores.map((r, i) => (
                  <tr key={i}>
                    <td>{r.produto}</td><td>{r.tamanho}</td>
                    <td className="num"><strong>{num(r.qtd_vendida, 0)}</strong></td>
                    <td className="num">{brl(r.faturamento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Estado>
        </Painel>

        <Painel titulo="Bebidas vendidas" rn="RN02 — item de estoque e de venda">
          <Estado carregando={cv.carregando} erro={cv.erro} vazio={!cv.dados?.bebidas.length}>
            <table>
              <thead><tr><th>Bebida</th><th className="num">Qtd.</th><th className="num">Faturamento</th></tr></thead>
              <tbody>
                {cv.dados?.bebidas.map((b, i) => (
                  <tr key={i}>
                    <td>{b.item_nome}</td>
                    <td className="num">{num(b.qtd_vendida, 0)}</td>
                    <td className="num">{brl(b.faturamento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Estado>
        </Painel>
      </div>

      <Painel titulo="Variação de gastos" rn="RF18">
        <Estado carregando={vg.carregando} erro={vg.erro}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 20 }}>
            <div>
              <strong style={{ color: 'var(--vinho)', fontSize: 13 }}>Por competência</strong>
              <table>
                <thead><tr><th>Mês</th><th className="num">Notas</th><th className="num">Itens</th>
                  <th className="num">Frete</th></tr></thead>
                <tbody>
                  {vg.dados?.por_mes.map(m => (
                    <tr key={m.competencia}>
                      <td>{m.competencia}</td><td className="num">{m.notas}</td>
                      <td className="num">{brl(m.total_itens)}</td><td className="num">{brl(m.frete)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <strong style={{ color: 'var(--vinho)', fontSize: 13 }}>Por fornecedor</strong>
              <table>
                <thead><tr><th>Fornecedor</th><th className="num">Notas</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {vg.dados?.por_fornecedor.map((f, i) => (
                    <tr key={i}><td>{f.fornecedor}</td><td className="num">{f.notas}</td>
                      <td className="num">{brl(f.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <strong style={{ color: 'var(--vinho)', fontSize: 13 }}>Por item (faixa de custo)</strong>
              <table>
                <thead><tr><th>Item</th><th className="num">Total</th><th className="num">Menor</th>
                  <th className="num">Maior</th></tr></thead>
                <tbody>
                  {vg.dados?.por_item.map((p, i) => (
                    <tr key={i}>
                      <td>{p.item_nome}</td><td className="num">{brl(p.total)}</td>
                      <td className="num">{brl(p.menor_custo)}</td><td className="num">{brl(p.maior_custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Estado>
      </Painel>

      <Painel titulo={`Itens sem movimentação há ${al.dados?.dias_referencia ?? 30} dias`} rn="RF20">
        <Estado carregando={al.carregando} erro={al.erro} vazio={!al.dados?.sem_movimento.length}>
          <table>
            <thead><tr><th>Código</th><th>Item</th><th>Último movimento</th><th className="num">Dias parado</th></tr></thead>
            <tbody>
              {al.dados?.sem_movimento.map(i => (
                <tr key={i.item_id}>
                  <td><code>{i.codigo}</code></td><td>{i.nome}</td>
                  <td>{i.ultimo_movimento ? dataBR(i.ultimo_movimento) : 'nunca movimentado'}</td>
                  <td className="num">{i.dias_parado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}
