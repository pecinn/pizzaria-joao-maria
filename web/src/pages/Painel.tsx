import { brl, num, type Dashboard, type Alertas } from '../api';
import { Card, Estado, Painel, Tag, useApi } from '../components/ui';

export default function PainelInicial({ ir }: { ir: (p: string) => void }) {
  const d = useApi<Dashboard>('/relatorios/dashboard');
  const a = useApi<Alertas>('/relatorios/alertas');

  return (
    <>
      <h2>Painel</h2>
      <p className="desc">Visão geral da operação — estoque, produção e vendas.</p>

      <Estado carregando={d.carregando} erro={d.erro}>
        {d.dados && (
          <div className="cards">
            <Card rotulo="Itens ativos" valor={d.dados.estoque.itens}
              nota="insumos, bebidas, embalagens e descartáveis" />
            <Card rotulo="Valor em estoque" valor={brl(d.dados.estoque.valor_total)}
              nota="quantidade bruta × custo unitário atual" />
            <Card rotulo="Abaixo do mínimo" valor={d.dados.estoque.abaixo_minimo}
              nota={<a onClick={() => ir('compras')} style={{ color: 'var(--vinho)', cursor: 'pointer' }}>
                ver lista de compras →</a>} />
            <Card rotulo="Faturamento (30 dias)" valor={brl(d.dados.vendas_30_dias.faturamento)}
              nota={`${d.dados.vendas_30_dias.pedidos} pedidos registrados`} />
          </div>
        )}
      </Estado>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        <Painel titulo="Sabores com menor capacidade de produção" rn="RF14 / RF15">
          <Estado carregando={d.carregando} erro={d.erro} vazio={!d.dados?.producao.length}>
            <table>
              <thead><tr><th>Sabor</th><th>Tamanho</th><th className="num">Máx.</th><th>Limitante</th></tr></thead>
              <tbody>
                {d.dados?.producao.map((p, i) => (
                  <tr key={i}>
                    <td>{p.produto}</td>
                    <td>{p.tamanho}</td>
                    <td className="num"><strong>{p.qtd_maxima}</strong></td>
                    <td><Tag tipo="aviso">{p.ingrediente_limitante}</Tag></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Estado>
        </Painel>

        <Painel titulo="Menores margens do cardápio" rn="RF16">
          <Estado carregando={d.carregando} erro={d.erro} vazio={!d.dados?.margens.length}>
            <table>
              <thead><tr><th>Sabor</th><th>Tam.</th><th className="num">Custo</th>
                <th className="num">Preço</th><th className="num">Margem</th></tr></thead>
              <tbody>
                {d.dados?.margens.map((m, i) => (
                  <tr key={i}>
                    <td>{m.produto}</td>
                    <td>{m.tamanho}</td>
                    <td className="num">{brl(m.custo_producao)}</td>
                    <td className="num">{brl(m.preco_venda)}</td>
                    <td className="num"><strong>{num(m.margem_percentual, 1)}%</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Estado>
        </Painel>
      </div>

      <Painel titulo="Alertas de estoque" rn="RF20">
        <Estado carregando={a.carregando} erro={a.erro}
          vazio={!a.dados?.abaixo_minimo.length && !a.dados?.sem_movimento.length}>
          <table>
            <thead><tr><th>Item</th><th>Alerta</th><th className="num">Saldo</th><th className="num">Mínimo</th></tr></thead>
            <tbody>
              {a.dados?.abaixo_minimo.map(i => (
                <tr key={'m' + i.item_id}>
                  <td>{i.nome}</td>
                  <td><Tag tipo="erro">Saldo no mínimo ou abaixo</Tag></td>
                  <td className="num">{num(i.quantidade_bruta)} {i.unidade}</td>
                  <td className="num">{num(i.estoque_minimo)} {i.unidade}</td>
                </tr>
              ))}
              {a.dados?.sem_movimento.map(i => (
                <tr key={'p' + i.item_id}>
                  <td>{i.nome}</td>
                  <td><Tag tipo="neutro">Sem movimento há {i.dias_parado} dias</Tag></td>
                  <td className="num">—</td><td className="num">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}
