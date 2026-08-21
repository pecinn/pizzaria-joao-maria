import { useState } from 'react';
import { brl, brlUn, num, type CapacidadeIngrediente, type CustoProduto, type Producao } from '../api';
import { Estado, Painel, Tag, useApi } from '../components/ui';

export default function ProducaoCustos() {
  const producao = useApi<Producao[]>('/producao');
  const custos = useApi<CustoProduto[]>('/custos');
  const [sel, setSel] = useState<{ p: number; t: number; nome: string } | null>(null);

  const detalhe = useApi<{ resumo: Producao; ingredientes: CapacidadeIngrediente[] }>(
    sel ? `/producao/${sel.p}/${sel.t}` : null, [sel?.p, sel?.t]);

  const maximo = Math.max(1, ...(producao.dados?.map(p => p.qtd_maxima) ?? [1]));

  return (
    <>
      <h2>Produção e custos</h2>
      <p className="desc">
        Quantidade máxima produzível considerando a quantidade <strong>líquida</strong> dos ingredientes,
        limitada pelo item mais escasso da ficha técnica (RN13).
      </p>

      <Painel titulo="Capacidade de produção por sabor e tamanho" rn="RF14 / RF15">
        <Estado carregando={producao.carregando} erro={producao.erro} vazio={!producao.dados?.length}>
          <table>
            <thead><tr><th>Sabor</th><th>Categoria</th><th>Tamanho</th>
              <th className="num">Máx. de pizzas</th><th style={{ width: 150 }}></th>
              <th>Ingrediente limitante</th><th></th></tr></thead>
            <tbody>
              {producao.dados?.map(p => (
                <tr key={`${p.produto_id}-${p.tamanho_id}`}>
                  <td><strong>{p.produto}</strong></td>
                  <td><Tag tipo="neutro">{p.categoria}</Tag></td>
                  <td>{p.tamanho}</td>
                  <td className="num"><strong>{p.qtd_maxima}</strong></td>
                  <td><div className="barra"><span style={{ width: `${(p.qtd_maxima / maximo) * 100}%` }} /></div></td>
                  <td><Tag tipo="aviso">{p.ingrediente_limitante}</Tag></td>
                  <td>
                    <button className="acao secundario mini"
                      onClick={() => setSel({ p: p.produto_id, t: p.tamanho_id, nome: `${p.produto} ${p.tamanho}` })}>
                      detalhar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      {sel && (
        <Painel titulo={`Ficha técnica × estoque — ${sel.nome}`} rn="por que a produção para aqui"
          acao={<button className="acao secundario mini" onClick={() => setSel(null)}>fechar</button>}>
          <Estado carregando={detalhe.carregando} erro={detalhe.erro} vazio={!detalhe.dados?.ingredientes.length}>
            <table>
              <thead><tr><th>Ingrediente</th><th className="num">Usa por pizza</th>
                <th className="num">Disponível (líquido)</th><th className="num">Rende</th>
                <th className="num">Custo na pizza</th><th></th></tr></thead>
              <tbody>
                {detalhe.dados?.ingredientes.map((g, i) => (
                  <tr key={g.item_id}>
                    <td>{g.item_nome}</td>
                    <td className="num">{num(g.qtd_receita)} {g.unidade}</td>
                    <td className="num">{num(g.quantidade_liquida)} {g.unidade}</td>
                    <td className="num"><strong>{g.producao_possivel}</strong> pizzas</td>
                    <td className="num">{brlUn(g.custo_no_produto)}</td>
                    <td>{i === 0 && <Tag tipo="erro">limita a produção</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Estado>
        </Painel>
      )}

      <Painel titulo="Custo de produção e margem" rn="RF16 — custo real dos itens da ficha técnica">
        <Estado carregando={custos.carregando} erro={custos.erro} vazio={!custos.dados?.length}>
          <table>
            <thead><tr><th>Sabor</th><th>Tamanho</th><th className="num">Custo de produção</th>
              <th className="num">Preço vigente</th><th className="num">Margem R$</th>
              <th className="num">Margem %</th></tr></thead>
            <tbody>
              {custos.dados?.map(c => (
                <tr key={`${c.produto_id}-${c.tamanho_id}`}>
                  <td>{c.produto}</td>
                  <td>{c.tamanho}</td>
                  <td className="num">{brl(c.custo_producao)}</td>
                  <td className="num">{c.preco_venda == null ? <Tag tipo="erro">sem preço</Tag> : brl(c.preco_venda)}</td>
                  <td className="num">{brl(c.margem_valor)}</td>
                  <td className="num">
                    {c.margem_percentual == null ? '—' : (
                      <Tag tipo={c.margem_percentual >= 65 ? 'ok' : c.margem_percentual >= 50 ? 'aviso' : 'erro'}>
                        {num(c.margem_percentual, 1)}%
                      </Tag>)}
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
