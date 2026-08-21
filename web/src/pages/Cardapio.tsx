import { useState } from 'react';
import {
  api, brl, brlUn, dataBR, hoje, num,
  type Item, type LinhaFicha, type Produto, type Tamanho,
} from '../api';
import { Campo, Estado, Mensagem, Painel, Tag, useApi } from '../components/ui';

interface PrecoLinha {
  id: number; produto: string | null; tamanho: string | null; item_nome: string | null;
  valor: number; data_inicio: string; data_fim: string | null; vigente: number;
}

export default function Cardapio() {
  const produtos = useApi<Produto[]>('/produtos');
  const tamanhos = useApi<Tamanho[]>('/tamanhos');
  const itens = useApi<Item[]>('/itens');
  const precos = useApi<PrecoLinha[]>('/precos');

  const [produtoSel, setProdutoSel] = useState<number | ''>('');
  const ficha = useApi<LinhaFicha[]>(produtoSel ? `/produtos/${produtoSel}/ficha` : null, [produtoSel]);

  const porTamanho = new Map<string, LinhaFicha[]>();
  for (const l of ficha.dados ?? []) {
    if (!porTamanho.has(l.tamanho)) porTamanho.set(l.tamanho, []);
    porTamanho.get(l.tamanho)!.push(l);
  }

  return (
    <>
      <h2>Cardápio e fichas técnicas</h2>
      <p className="desc">
        A receita é definida por sabor <em>e</em> tamanho (RN09). Alterar um preço encerra a
        vigência do anterior, sem sobrescrever o histórico (RN10).
      </p>

      <Painel titulo="Sabores cadastrados" rn="RF04">
        <Estado carregando={produtos.carregando} erro={produtos.erro} vazio={!produtos.dados?.length}>
          <table>
            <thead><tr><th>Sabor</th><th>Categoria</th><th>Descrição</th><th></th></tr></thead>
            <tbody>
              {produtos.dados?.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.nome}</strong></td>
                  <td><Tag tipo={p.categoria === 'DOCE' ? 'aviso' : 'neutro'}>{p.categoria}</Tag></td>
                  <td style={{ color: 'var(--suave)' }}>{p.descricao}</td>
                  <td>
                    <button className="acao secundario mini" onClick={() => setProdutoSel(p.id)}>
                      ver ficha técnica
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>

      {produtoSel && (
        <Painel titulo={`Ficha técnica — ${produtos.dados?.find(p => p.id === produtoSel)?.nome}`}
          rn="RF05 / RN09"
          acao={<button className="acao secundario mini" onClick={() => setProdutoSel('')}>fechar</button>}>
          <Estado carregando={ficha.carregando} erro={ficha.erro} vazio={!ficha.dados?.length}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 18 }}>
              {[...porTamanho.entries()].map(([tam, linhas]) => (
                <div key={tam}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ color: 'var(--vinho)' }}>{tam}</strong>
                    <span>custo: <strong>
                      {brl(linhas.reduce((s, l) => s + Number(l.custo_no_produto), 0))}</strong></span>
                  </div>
                  <table>
                    <thead><tr><th>Item</th><th className="num">Qtd.</th><th className="num">Custo</th><th></th></tr></thead>
                    <tbody>
                      {linhas.map(l => (
                        <tr key={l.item_id}>
                          <td>{l.item_nome}</td>
                          <td className="num">{num(l.quantidade)} {l.unidade}</td>
                          <td className="num">{brlUn(l.custo_no_produto)}</td>
                          <td>
                            <button className="acao secundario mini" onClick={async () => {
                              await api.del(`/produtos/${produtoSel}/ficha/${l.tamanho_id}/${l.item_id}`);
                              ficha.recarregar();
                            }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </Estado>

          <FormFicha produtoId={Number(produtoSel)} tamanhos={tamanhos.dados ?? []}
            itens={itens.dados ?? []} aoSalvar={ficha.recarregar} />
        </Painel>
      )}

      <FormPreco produtos={produtos.dados ?? []} tamanhos={tamanhos.dados ?? []}
        itens={(itens.dados ?? []).filter(i => i.vendavel)} aoSalvar={precos.recarregar} />

      <Painel titulo="Histórico de preços" rn="RF06 / RN10 — nada é sobrescrito">
        <Estado carregando={precos.carregando} erro={precos.erro} vazio={!precos.dados?.length}>
          <table>
            <thead><tr><th>Produto / bebida</th><th>Tamanho</th><th className="num">Valor</th>
              <th>Início da vigência</th><th>Fim</th><th></th></tr></thead>
            <tbody>
              {precos.dados?.map(p => (
                <tr key={p.id}>
                  <td>{p.produto ?? p.item_nome}</td>
                  <td>{p.tamanho ?? '—'}</td>
                  <td className="num">{brl(p.valor)}</td>
                  <td>{dataBR(p.data_inicio)}</td>
                  <td>{p.data_fim ? dataBR(p.data_fim) : '—'}</td>
                  <td>{p.vigente ? <Tag tipo="ok">vigente</Tag> : <Tag tipo="neutro">encerrado</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Estado>
      </Painel>
    </>
  );
}

function FormFicha({ produtoId, tamanhos, itens, aoSalvar }:
{ produtoId: number; tamanhos: Tamanho[]; itens: Item[]; aoSalvar: () => void }) {
  const [tamanho_id, setTam] = useState<number | ''>('');
  const [item_id, setItem] = useState<number | ''>('');
  const [quantidade, setQtd] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null);
    try {
      await api.post(`/produtos/${produtoId}/ficha`, { tamanho_id, item_id, quantidade: Number(quantidade) });
      setQtd(''); aoSalvar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <div style={{ borderTop: '1px solid var(--borda)', marginTop: 16, paddingTop: 14 }}>
      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <div className="form">
        <Campo rotulo="Tamanho">
          <select value={tamanho_id} onChange={e => setTam(Number(e.target.value))}>
            <option value="">selecione…</option>
            {tamanhos.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Item">
          <select value={item_id} onChange={e => setItem(Number(e.target.value))}>
            <option value="">selecione…</option>
            {itens.map(i => <option key={i.id} value={i.id}>{i.nome} ({i.unidade})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Quantidade na unidade padrão">
          <input type="number" step="0.01" value={quantidade} onChange={e => setQtd(e.target.value)} />
        </Campo>
        <button className="acao" onClick={enviar} disabled={!tamanho_id || !item_id || !quantidade}>
          Incluir na ficha
        </button>
      </div>
    </div>
  );
}

function FormPreco({ produtos, tamanhos, itens, aoSalvar }:
{ produtos: Produto[]; tamanhos: Tamanho[]; itens: Item[]; aoSalvar: () => void }) {
  const [alvo, setAlvo] = useState('');   // "p:1:2" para pizza, "i:5" para bebida
  const [valor, setValor] = useState('');
  const [data_inicio, setInicio] = useState(hoje());
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    setErro(null); setMsg(null);
    const partes = alvo.split(':');
    const corpo = partes[0] === 'i'
      ? { item_id: Number(partes[1]), valor: Number(valor), data_inicio }
      : { produto_id: Number(partes[1]), tamanho_id: Number(partes[2]), valor: Number(valor), data_inicio };
    try {
      const r = await api.post<{ mensagem: string }>('/precos', corpo);
      setMsg(r.mensagem); setValor(''); aoSalvar();
    } catch (e: any) { setErro(e.message); }
  };

  return (
    <Painel titulo="Alterar preço de venda" rn="RF06 / RN10">
      <Mensagem tipo="erro" texto={erro} aoFechar={() => setErro(null)} />
      <Mensagem tipo="ok" texto={msg} aoFechar={() => setMsg(null)} />
      <div className="form">
        <Campo rotulo="Produto ou bebida">
          <select value={alvo} onChange={e => setAlvo(e.target.value)}>
            <option value="">selecione…</option>
            <optgroup label="Pizzas">
              {produtos.flatMap(p => tamanhos.map(t =>
                <option key={`${p.id}-${t.id}`} value={`p:${p.id}:${t.id}`}>{p.nome} — {t.descricao}</option>))}
            </optgroup>
            <optgroup label="Bebidas">
              {itens.map(i => <option key={i.id} value={`i:${i.id}`}>{i.nome}</option>)}
            </optgroup>
          </select>
        </Campo>
        <Campo rotulo="Novo valor">
          <input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} /></Campo>
        <Campo rotulo="Início da vigência">
          <input type="date" value={data_inicio} onChange={e => setInicio(e.target.value)} /></Campo>
        <button className="acao" onClick={enviar} disabled={!alvo || !valor}>Registrar novo preço</button>
      </div>
    </Painel>
  );
}
