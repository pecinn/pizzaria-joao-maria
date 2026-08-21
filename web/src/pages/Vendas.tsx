import { useState } from 'react';
import { api, brl, num, type Cardapio, type Pedido } from '../api';
import { Campo, Estado, Mensagem, Painel, Tag, useApi } from '../components/ui';

interface LinhaPedido {
  chave: string;            // "p:produtoId:tamanhoId" ou "i:itemId"
  descricao: string; preco: number; quantidade: number;
}

export default function Vendas() {
  const cardapio = useApi<Cardapio>('/cardapio');
  const pedidos = useApi<Pedido[]>('/pedidos');

  const [carrinho, setCarrinho] = useState<LinhaPedido[]>([]);
  const [tipo_atendimento, setAtend] = useState('BALCAO');
  const [forma_pagamento, setPgto] = useState('PIX');
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const adicionar = (chave: string, descricao: string, preco: number | null) => {
    if (preco == null) return setErro(`"${descricao}" não tem preço vigente cadastrado (RN10).`);
    setCarrinho(c => {
      const existe = c.find(l => l.chave === chave);
      return existe
        ? c.map(l => l.chave === chave ? { ...l, quantidade: l.quantidade + 1 } : l)
        : [...c, { chave, descricao, preco, quantidade: 1 }];
    });
  };

  const total = carrinho.reduce((s, l) => s + l.preco * l.quantidade, 0);

  const finalizar = async () => {
    setErro(null); setOk(null);
    try {
      const r = await api.post<Pedido>('/pedidos', {
        tipo_atendimento, forma_pagamento, usuario_id: 1,
        itens: carrinho.map(l => {
          const p = l.chave.split(':');
          return p[0] === 'i'
            ? { item_id: Number(p[1]), quantidade: l.quantidade }
            : { produto_id: Number(p[1]), tamanho_id: Number(p[2]), quantidade: l.quantidade };
        }),
      });
      setOk(`Pedido #${r.id} registrado — ${brl(r.valor_total)}. O estoque será baixado no fechamento do dia (RN07).`);
      setCarrinho([]); pedidos.recarregar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <>
      <h2>Vendas</h2>
      <p className="desc">
        O pedido registra o que foi vendido; o estoque não é baixado agora — a baixa acontece
        no fechamento diário, a partir da ficha técnica (RN07).
      </p>

      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={ok} aoFechar={() => setOk(null)} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start' }}>
        <Painel titulo="Cardápio" rn="preços vigentes">
          <Estado carregando={cardapio.carregando} erro={cardapio.erro}>
            <table>
              <thead><tr><th>Sabor</th><th>Tamanho</th><th className="num">Fatias</th>
                <th className="num">Preço</th><th></th></tr></thead>
              <tbody>
                {cardapio.dados?.pizzas.map(p => (
                  <tr key={`${p.produto_id}-${p.tamanho_id}`}>
                    <td>{p.produto}</td>
                    <td>{p.tamanho}</td>
                    <td className="num">{p.numero_fatias}</td>
                    <td className="num">{p.preco == null ? <Tag tipo="erro">sem preço</Tag> : brl(p.preco)}</td>
                    <td>
                      <button className="acao mini" disabled={p.preco == null}
                        onClick={() => adicionar(`p:${p.produto_id}:${p.tamanho_id}`,
                          `${p.produto} ${p.tamanho}`, p.preco)}>+</button>
                    </td>
                  </tr>
                ))}
                {cardapio.dados?.bebidas.map(b => (
                  <tr key={`b${b.item_id}`}>
                    <td colSpan={3}>{b.item_nome} <Tag tipo="neutro">bebida</Tag></td>
                    <td className="num">{b.preco == null ? <Tag tipo="erro">sem preço</Tag> : brl(b.preco)}</td>
                    <td>
                      <button className="acao mini" disabled={b.preco == null}
                        onClick={() => adicionar(`i:${b.item_id}`, b.item_nome, b.preco)}>+</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Estado>
        </Painel>

        <Painel titulo="Pedido em aberto" rn="RF17">
          {!carrinho.length && <div className="vazio">Escolha itens no cardápio.</div>}
          {!!carrinho.length && (
            <table>
              <tbody>
                {carrinho.map(l => (
                  <tr key={l.chave}>
                    <td>{l.descricao}</td>
                    <td className="num" style={{ width: 70 }}>
                      <input type="number" min={1} value={l.quantidade} style={{ width: 60 }}
                        onChange={e => setCarrinho(c => c.map(x => x.chave === l.chave
                          ? { ...x, quantidade: Math.max(1, Number(e.target.value)) } : x))} />
                    </td>
                    <td className="num">{brl(l.preco * l.quantidade)}</td>
                    <td>
                      <button className="acao secundario mini"
                        onClick={() => setCarrinho(c => c.filter(x => x.chave !== l.chave))}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="form" style={{ marginTop: 14 }}>
            <Campo rotulo="Atendimento">
              <select value={tipo_atendimento} onChange={e => setAtend(e.target.value)}>
                <option value="BALCAO">Balcão</option>
                <option value="MESA">Mesa</option>
                <option value="DELIVERY">Delivery</option>
              </select>
            </Campo>
            <Campo rotulo="Pagamento">
              <select value={forma_pagamento} onChange={e => setPgto(e.target.value)}>
                <option value="PIX">PIX</option>
                <option value="DINHEIRO">Dinheiro</option>
                <option value="DEBITO">Débito</option>
                <option value="CREDITO">Crédito</option>
              </select>
            </Campo>
          </div>

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--vinho)' }}>{brl(total)}</span>
            <button className="acao" onClick={finalizar} disabled={!carrinho.length}>Finalizar pedido</button>
          </div>
        </Painel>
      </div>

      <Painel titulo="Pedidos registrados">
        <Estado carregando={pedidos.carregando} erro={pedidos.erro} vazio={!pedidos.dados?.length}>
          <table>
            <thead><tr><th>#</th><th>Data e hora</th><th>Atendimento</th>
              <th>Pagamento</th><th>Operador</th><th className="num">Valor</th></tr></thead>
            <tbody>
              {pedidos.dados?.map(p => (
                <tr key={p.id}>
                  <td><code>{p.id}</code></td>
                  <td>{new Date(p.data_hora.replace(' ', 'T')).toLocaleString('pt-BR')}</td>
                  <td><Tag tipo="neutro">{p.tipo_atendimento}</Tag></td>
                  <td>{p.forma_pagamento}</td>
                  <td>{p.usuario}</td>
                  <td className="num"><strong>{brl(p.valor_total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}
